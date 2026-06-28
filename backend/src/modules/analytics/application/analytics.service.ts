import { Injectable } from '@nestjs/common';
import { ReportPeriod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../../../core/audit/audit.service';
import { formatMoney } from '../../../core/utils/money.util';
import { AnalyticsCacheService } from './analytics-cache.service';
import {
  defaultChartPoints,
  formatMonthShort,
  pctChange,
  resolveAnalyticsPeriod,
} from './analytics-period.util';
import { AnalyticsQueriesService, AnalyticsQueryScope } from './analytics-queries.service';

export interface AnalyticsMetricDto {
  id: string;
  label: string;
  value: string;
  change: number;
  period: string;
}

export interface AnalyticsChartPointDto {
  month: string;
  revenue: number;
  profit: number;
  orders: number;
}

function formatCompactUzs(value: Decimal | number): string {
  const n = Number(value);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} mlrd so'm`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} mln so'm`;
  return `${Math.round(n).toLocaleString('uz-UZ')} so'm`;
}

function toNum(d: Decimal | bigint | number): number {
  if (typeof d === 'bigint') return Number(d);
  return Number(d);
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly queries: AnalyticsQueriesService,
    private readonly cache: AnalyticsCacheService,
    private readonly audit: AuditService,
  ) {}

  private scope(
    companyId: string,
    dateFrom: Date,
    dateTo: Date,
    branchId?: string,
    cashierId?: string,
  ): AnalyticsQueryScope {
    return { companyId, dateFrom, dateTo, branchId, cashierId };
  }

  async getOverview(
    companyId: string,
    userId: string,
    params: {
      period?: ReportPeriod;
      date_from?: string;
      date_to?: string;
      branch_id?: string;
      months?: number;
    },
    canViewAllSales: boolean,
    ip?: string,
    requestId?: string,
  ) {
    const resolved = resolveAnalyticsPeriod(params.period, params.date_from, params.date_to);
    const cacheParams = { ...params, canViewAllSales, endpoint: 'overview' };

    const result = await this.cache.getOrSet(
      companyId,
      'overview',
      cacheParams,
      resolved.period,
      async () => {
        const metrics = await this.buildMetrics(companyId, resolved, params.branch_id, canViewAllSales ? undefined : userId);
        const chart = await this.buildChart(companyId, resolved, params.branch_id, canViewAllSales ? undefined : userId, params.months);
        const highlights = this.buildHighlights(chart, metrics);
        return { metrics, chart, highlights };
      },
    );

    await this.audit.log({
      companyId,
      userId,
      action: 'VIEW',
      entityType: 'analytics_overview',
      newValue: { period: resolved.period },
      ipAddress: ip,
      requestId,
    });

    return result;
  }

  async getDashboardKpi(
    companyId: string,
    params: {
      period?: ReportPeriod;
      date_from?: string;
      date_to?: string;
      branch_id?: string;
    },
    userId: string,
    canViewAllSales: boolean,
  ) {
    const resolved = resolveAnalyticsPeriod(params.period, params.date_from, params.date_to);
    const cashierId = canViewAllSales ? undefined : userId;

    return this.cache.getOrSet(
      companyId,
      'dashboard-kpi',
      { ...params, canViewAllSales },
      resolved.period,
      async () => {
        const current = this.scope(companyId, resolved.dateFrom, resolved.dateTo, params.branch_id, cashierId);
        const previous = this.scope(companyId, resolved.prevFrom, resolved.prevTo, params.branch_id, cashierId);

        const [cur, prev, invValue, expenses] = await Promise.all([
          this.queries.aggregateSales(current),
          this.queries.aggregateSales(previous),
          this.queries.inventoryValue(companyId),
          this.queries.expenseTotal(current),
        ]);

        const curRev = toNum(cur.revenue_uzs);
        const prevRev = toNum(prev.revenue_uzs);
        const curOrders = toNum(cur.order_count);
        const prevOrders = toNum(prev.order_count);
        const curCogs = toNum(cur.cogs_uzs);
        const curProfit = curRev - curCogs;
        const prevCogs = toNum(prev.cogs_uzs);
        const prevProfit = prevRev - prevCogs;
        const curAvg = curOrders > 0 ? curRev / curOrders : 0;
        const prevAvg = prevOrders > 0 ? prevRev / prevOrders : 0;

        return {
          period: resolved.period,
          label: resolved.label,
          kpis: {
            totalRevenue: {
              uzs: formatMoney(cur.revenue_uzs),
              usd: formatMoney(cur.revenue_usd),
              change: pctChange(curRev, prevRev),
            },
            saleCount: {
              value: curOrders,
              change: pctChange(curOrders, prevOrders),
            },
            avgCheck: {
              uzs: formatMoney(curAvg),
              change: pctChange(curAvg, prevAvg),
            },
            grossProfit: {
              uzs: formatMoney(curProfit),
              change: pctChange(curProfit, prevProfit),
            },
            grossMargin: {
              value: curRev > 0 ? Number(((curProfit / curRev) * 100).toFixed(1)) : 0,
              change: pctChange(
                curRev > 0 ? curProfit / curRev : 0,
                prevRev > 0 ? prevProfit / prevRev : 0,
              ),
            },
            expenses: {
              uzs: formatMoney(expenses),
              change: 0,
            },
            inventoryValue: {
              uzs: formatMoney(invValue),
              change: 0,
            },
          },
        };
      },
    );
  }

  async getSalesAnalytics(companyId: string, params: Record<string, unknown>, userId: string, canViewAllSales: boolean) {
    return this.domainAnalytics(companyId, 'sales', params, userId, canViewAllSales, async (cur, prev) => {
      const [curAgg, prevAgg, returnData] = await Promise.all([
        this.queries.aggregateSales(cur),
        this.queries.aggregateSales(prev),
        this.queries.returnRate(cur),
      ]);
      const returnPct = toNum(returnData.saleAmount) > 0
        ? (toNum(returnData.returnAmount) / toNum(returnData.saleAmount)) * 100
        : 0;
      return {
        summary: {
          orderCount: toNum(curAgg.order_count),
          revenueUzs: formatMoney(curAgg.revenue_uzs),
          revenueUsd: formatMoney(curAgg.revenue_usd),
          returnRatePercent: Number(returnPct.toFixed(1)),
        },
        comparison: {
          orderCountChange: pctChange(toNum(curAgg.order_count), toNum(prevAgg.order_count)),
          revenueChange: pctChange(toNum(curAgg.revenue_uzs), toNum(prevAgg.revenue_uzs)),
        },
      };
    });
  }

  async getRevenueAnalytics(companyId: string, params: Record<string, unknown>, userId: string, canViewAllSales: boolean) {
    return this.domainAnalytics(companyId, 'revenue', params, userId, canViewAllSales, async (cur, prev) => {
      const [curAgg, prevAgg] = await Promise.all([
        this.queries.aggregateSales(cur),
        this.queries.aggregateSales(prev),
      ]);
      return {
        summary: {
          revenueUzs: formatMoney(curAgg.revenue_uzs),
          revenueUsd: formatMoney(curAgg.revenue_usd),
        },
        comparison: {
          revenueUzsChange: pctChange(toNum(curAgg.revenue_uzs), toNum(prevAgg.revenue_uzs)),
          revenueUsdChange: pctChange(toNum(curAgg.revenue_usd), toNum(prevAgg.revenue_usd)),
        },
      };
    });
  }

  async getProfitAnalytics(companyId: string, params: Record<string, unknown>, userId: string, canViewAllSales: boolean) {
    return this.domainAnalytics(companyId, 'profit', params, userId, canViewAllSales, async (cur, prev) => {
      const [curAgg, prevAgg, expenses] = await Promise.all([
        this.queries.aggregateSales(cur),
        this.queries.aggregateSales(prev),
        this.queries.expenseTotal(cur),
      ]);
      const curProfit = toNum(curAgg.revenue_uzs) - toNum(curAgg.cogs_uzs);
      const prevProfit = toNum(prevAgg.revenue_uzs) - toNum(prevAgg.cogs_uzs);
      const netProfit = curProfit - toNum(expenses);
      return {
        summary: {
          grossProfitUzs: formatMoney(curProfit),
          cogsUzs: formatMoney(curAgg.cogs_uzs),
          expensesUzs: formatMoney(expenses),
          netProfitUzs: formatMoney(netProfit),
          marginPercent: toNum(curAgg.revenue_uzs) > 0
            ? Number(((curProfit / toNum(curAgg.revenue_uzs)) * 100).toFixed(1))
            : 0,
        },
        comparison: {
          grossProfitChange: pctChange(curProfit, prevProfit),
        },
      };
    });
  }

  async getSupplierAnalytics(companyId: string, params: Record<string, unknown>) {
    const resolved = resolveAnalyticsPeriod(
      params.period as ReportPeriod,
      params.date_from as string,
      params.date_to as string,
    );
    const scope = this.scope(companyId, resolved.dateFrom, resolved.dateTo, params.branch_id as string);

    return this.cache.getOrSet(companyId, 'suppliers', params, resolved.period, async () => {
      const summary = await this.queries.supplierSummary(scope);
      return {
        period: resolved.period,
        label: resolved.label,
        summary: {
          supplierCount: summary.count,
          totalDebtUzs: formatMoney(summary.totalDebt),
          receiptsUzs: formatMoney(summary.totalReceipts),
          paymentsUzs: formatMoney(summary.paymentTotal),
        },
      };
    });
  }

  async getCustomerAnalytics(companyId: string, params: Record<string, unknown>) {
    const resolved = resolveAnalyticsPeriod(
      params.period as ReportPeriod,
      params.date_from as string,
      params.date_to as string,
    );
    const scope = this.scope(companyId, resolved.dateFrom, resolved.dateTo, params.branch_id as string);

    return this.cache.getOrSet(companyId, 'customers', params, resolved.period, async () => {
      const summary = await this.queries.customerSummary(scope);
      return {
        period: resolved.period,
        label: resolved.label,
        summary: {
          totalCustomers: summary.totalCustomers,
          activeBuyers: summary.activeBuyers,
          totalDebtUzs: formatMoney(summary.totalDebt),
        },
      };
    });
  }

  async getProductAnalytics(companyId: string, params: Record<string, unknown>, userId: string, canViewAllSales: boolean) {
    return this.domainAnalytics(companyId, 'products', params, userId, canViewAllSales, async (cur) => {
      const top = await this.queries.topProducts(cur, 5);
      return {
        summary: {
          topProductCount: top.length,
          topProducts: top.map((p) => ({
            name: p.name,
            sku: p.sku,
            quantity: formatMoney(p.quantity),
            revenueUzs: formatMoney(p.revenue_uzs),
          })),
        },
      };
    });
  }

  async getTopProducts(companyId: string, params: Record<string, unknown>, userId: string, canViewAllSales: boolean, limit = 10) {
    const resolved = resolveAnalyticsPeriod(params.period as ReportPeriod, params.date_from as string, params.date_to as string);
    const scope = this.scope(
      companyId,
      resolved.dateFrom,
      resolved.dateTo,
      params.branch_id as string,
      canViewAllSales ? undefined : userId,
    );

    return this.cache.getOrSet(companyId, 'top-products', { ...params, limit }, resolved.period, async () => {
      const rows = await this.queries.topProducts(scope, limit);
      return {
        data: rows.map((r, i) => ({
          rank: i + 1,
          productId: r.product_id,
          name: r.name,
          sku: r.sku,
          quantity: formatMoney(r.quantity),
          revenueUzs: formatMoney(r.revenue_uzs),
        })),
      };
    });
  }

  async getTopCustomers(companyId: string, params: Record<string, unknown>, userId: string, canViewAllSales: boolean, limit = 10) {
    const resolved = resolveAnalyticsPeriod(params.period as ReportPeriod, params.date_from as string, params.date_to as string);
    const scope = this.scope(
      companyId,
      resolved.dateFrom,
      resolved.dateTo,
      params.branch_id as string,
      canViewAllSales ? undefined : userId,
    );

    return this.cache.getOrSet(companyId, 'top-customers', { ...params, limit }, resolved.period, async () => {
      const rows = await this.queries.topCustomers(scope, limit);
      return {
        data: rows.map((r, i) => ({
          rank: i + 1,
          customerId: r.customer_id,
          name: r.name,
          phone: r.phone,
          orderCount: toNum(r.order_count),
          revenueUzs: formatMoney(r.revenue_uzs),
        })),
      };
    });
  }

  async getTopSuppliers(companyId: string, params: Record<string, unknown>, limit = 10) {
    const resolved = resolveAnalyticsPeriod(params.period as ReportPeriod, params.date_from as string, params.date_to as string);
    const scope = this.scope(companyId, resolved.dateFrom, resolved.dateTo, params.branch_id as string);

    return this.cache.getOrSet(companyId, 'top-suppliers', { ...params, limit }, resolved.period, async () => {
      const rows = await this.queries.topSuppliers(scope, limit);
      return {
        data: rows.map((r, i) => ({
          rank: i + 1,
          supplierId: r.supplier_id,
          name: r.name,
          receiptCount: toNum(r.receipt_count),
          totalCostUzs: formatMoney(r.total_cost_uzs),
          debtUzs: formatMoney(r.debt_uzs),
        })),
      };
    });
  }

  async getRevenueProfitChart(
    companyId: string,
    params: Record<string, unknown>,
    userId: string,
    canViewAllSales: boolean,
  ) {
    const resolved = resolveAnalyticsPeriod(params.period as ReportPeriod, params.date_from as string, params.date_to as string);
    const points = Number(params.months ?? defaultChartPoints(resolved.period));
    const scope = this.scope(
      companyId,
      resolved.dateFrom,
      resolved.dateTo,
      params.branch_id as string,
      canViewAllSales ? undefined : userId,
    );

    return this.cache.getOrSet(companyId, 'chart-revenue-profit', { ...params, points }, resolved.period, async () => {
      const chart = await this.buildChart(companyId, resolved, params.branch_id as string, canViewAllSales ? undefined : userId, points);
      return { chart, period: resolved.period };
    });
  }

  async getMetrics(companyId: string, params: Record<string, unknown>, userId: string, canViewAllSales: boolean) {
    const resolved = resolveAnalyticsPeriod(params.period as ReportPeriod, params.date_from as string, params.date_to as string);
    return this.cache.getOrSet(companyId, 'metrics', params, resolved.period, async () => {
      const metrics = await this.buildMetrics(
        companyId,
        resolved,
        params.branch_id as string,
        canViewAllSales ? undefined : userId,
      );
      return { metrics, period: resolved.period, label: resolved.label };
    });
  }

  private async domainAnalytics(
    companyId: string,
    endpoint: string,
    params: Record<string, unknown>,
    userId: string,
    canViewAllSales: boolean,
    builder: (cur: AnalyticsQueryScope, prev: AnalyticsQueryScope) => Promise<Record<string, unknown>>,
  ) {
    const resolved = resolveAnalyticsPeriod(params.period as ReportPeriod, params.date_from as string, params.date_to as string);
    const cashierId = canViewAllSales ? undefined : userId;
    const cur = this.scope(companyId, resolved.dateFrom, resolved.dateTo, params.branch_id as string, cashierId);
    const prev = this.scope(companyId, resolved.prevFrom, resolved.prevTo, params.branch_id as string, cashierId);

    return this.cache.getOrSet(companyId, endpoint, params, resolved.period, async () => ({
      period: resolved.period,
      label: resolved.label,
      ...(await builder(cur, prev)),
    }));
  }

  private async buildMetrics(
    companyId: string,
    resolved: ReturnType<typeof resolveAnalyticsPeriod>,
    branchId?: string,
    cashierId?: string,
  ): Promise<AnalyticsMetricDto[]> {
    const current = this.scope(companyId, resolved.dateFrom, resolved.dateTo, branchId, cashierId);
    const previous = this.scope(companyId, resolved.prevFrom, resolved.prevTo, branchId, cashierId);

    const [cur, prev, newCustomers, prevNewCustomers, returnData, prevReturnData] = await Promise.all([
      this.queries.aggregateSales(current),
      this.queries.aggregateSales(previous),
      this.queries.countNewCustomers(current),
      this.queries.countNewCustomers(previous),
      this.queries.returnRate(current),
      this.queries.returnRate(previous),
    ]);

    const curRev = toNum(cur.revenue_uzs);
    const prevRev = toNum(prev.revenue_uzs);
    const curOrders = toNum(cur.order_count);
    const prevOrders = toNum(prev.order_count);
    const curAvg = curOrders > 0 ? curRev / curOrders : 0;
    const prevAvg = prevOrders > 0 ? prevRev / prevOrders : 0;
    const curReturnPct = toNum(returnData.saleAmount) > 0
      ? (toNum(returnData.returnAmount) / toNum(returnData.saleAmount)) * 100
      : 0;
    const prevReturnPct = toNum(prevReturnData.saleAmount) > 0
      ? (toNum(prevReturnData.returnAmount) / toNum(prevReturnData.saleAmount)) * 100
      : 0;

    return [
      {
        id: 'am_revenue',
        label: 'Oylik daromad',
        value: formatCompactUzs(cur.revenue_uzs),
        change: pctChange(curRev, prevRev),
        period: resolved.label,
      },
      {
        id: 'am_customers',
        label: 'Yangi mijozlar',
        value: String(newCustomers),
        change: pctChange(newCustomers, prevNewCustomers),
        period: resolved.label,
      },
      {
        id: 'am_avg_check',
        label: "O'rtacha chek",
        value: formatCompactUzs(curAvg),
        change: pctChange(curAvg, prevAvg),
        period: resolved.label,
      },
      {
        id: 'am_returns',
        label: 'Qaytarishlar',
        value: `${curReturnPct.toFixed(1)}%`,
        change: Number((curReturnPct - prevReturnPct).toFixed(1)),
        period: resolved.label,
      },
    ];
  }

  private async buildChart(
    companyId: string,
    resolved: ReturnType<typeof resolveAnalyticsPeriod>,
    branchId?: string,
    cashierId?: string,
    months?: number,
  ): Promise<AnalyticsChartPointDto[]> {
    const points = months ?? defaultChartPoints(resolved.period);
    const chartTo = resolved.dateTo;
    const chartFrom = new Date(chartTo);
    chartFrom.setMonth(chartFrom.getMonth() - (points - 1));
    chartFrom.setDate(1);
    chartFrom.setHours(0, 0, 0, 0);

    const scope = this.scope(companyId, chartFrom, chartTo, branchId, cashierId);
    const rows = await this.queries.chartBuckets(scope, ReportPeriod.monthly, points);
    return rows
      .reverse()
      .map((r) => ({
        month: formatMonthShort(new Date(r.bucket)),
        revenue: toNum(r.revenue),
        profit: toNum(r.profit),
        orders: toNum(r.orders),
      }));
  }

  private buildHighlights(chart: AnalyticsChartPointDto[], metrics: AnalyticsMetricDto[]) {
    const peak = chart.reduce(
      (best, p) => (p.revenue > best.revenue ? p : best),
      chart[0] ?? { month: '—', revenue: 0, profit: 0, orders: 0 },
    );
    const avgCheckMetric = metrics.find((m) => m.id === 'am_avg_check');
    return {
      peakMonth: { label: peak.month, revenue: peak.revenue },
      avgCheckChange: {
        percent: avgCheckMetric?.change ?? 0,
        period: avgCheckMetric?.period ?? '',
      },
    };
  }
}
