import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { mapSaleDetail } from '@/api/mappers';
import { debtApi, productsApi, suppliersApi } from '@/api/services';
import { mapSupplierPayment } from '@/api/mappers';
import type { PaginatedResponse } from '@/types/api';
import type { DashboardPeriod } from '@/types';
import { uzsToUsd } from '@/utils/currency';
import { formatUzs, formatUsd } from '@/utils/format';

interface DashboardKpiMoney {
  uzs: string;
  usd: string;
  trend: number;
  meta?: string;
}

interface DashboardKpiValue {
  value: string;
  trend: number;
  meta?: string;
}

export interface DashboardData {
  kpis: {
    totalSales: DashboardKpiMoney;
    saleCount: DashboardKpiValue;
    avgSale: DashboardKpiMoney;
    cashSales: DashboardKpiMoney;
    grossProfit: DashboardKpiMoney;
    grossMargin: DashboardKpiValue;
    cogs: DashboardKpiMoney;
    outstandingDebt: DashboardKpiMoney;
    payments: DashboardKpiMoney;
    newDebt: DashboardKpiMoney;
    overdueDebt: DashboardKpiMoney;
    inventoryValue: DashboardKpiMoney;
    exchangeRate: DashboardKpiValue;
  };
  suppliers: {
    count: DashboardKpiValue;
    totalDebt: DashboardKpiMoney;
    topSupplier: DashboardKpiValue;
    recentPayments: Array<{ id: string; text: string; time: string }>;
  };
  salesTrend: Array<{ date: string; uzs: number; usd: number }>;
  paymentSplit: Array<{ name: string; value: number; color: string }>;
  topProducts: Array<{ name: string; qty: number; revenueUzs: string; revenueUsd: string }>;
  recentActivity: Array<{ id: string; text: string; time: string; type: string }>;
}

function periodRange(period: DashboardPeriod): { from: string; to: string; prevFrom: string; prevTo: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now);

  if (period === 'daily') {
    start.setHours(0, 0, 0, 0);
    const prev = new Date(start);
    prev.setDate(prev.getDate() - 1);
    const prevEnd = new Date(prev);
    prevEnd.setHours(23, 59, 59, 999);
    return {
      from: start.toISOString(),
      to,
      prevFrom: prev.toISOString(),
      prevTo: prevEnd.toISOString().slice(0, 10),
    };
  }

  if (period === 'weekly') {
    start.setDate(start.getDate() - 6);
    const prev = new Date(start);
    prev.setDate(prev.getDate() - 7);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    return {
      from: start.toISOString().slice(0, 10),
      to,
      prevFrom: prev.toISOString().slice(0, 10),
      prevTo: prevEnd.toISOString().slice(0, 10),
    };
  }

  if (period === 'monthly') {
    start.setDate(1);
    const prev = new Date(start);
    prev.setMonth(prev.getMonth() - 1);
    const prevEnd = new Date(start);
    prevEnd.setDate(0);
    return {
      from: start.toISOString().slice(0, 10),
      to,
      prevFrom: prev.toISOString().slice(0, 10),
      prevTo: prevEnd.toISOString().slice(0, 10),
    };
  }

  start.setMonth(0, 1);
  const prev = new Date(start);
  prev.setFullYear(prev.getFullYear() - 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(0);
  return {
    from: start.toISOString().slice(0, 10),
    to,
    prevFrom: prev.toISOString().slice(0, 10),
    prevTo: prevEnd.toISOString().slice(0, 10),
  };
}

function trendPct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Hozirgina';
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.floor(hours / 24)} kun oldin`;
}

async function fetchSalesInRange(from: string, to: string) {
  const { data } = await apiClient.get<PaginatedResponse<unknown>>(API_ENDPOINTS.sales, {
    params: { from, to, limit: 500 },
  });
  return data.data.map((row) => mapSaleDetail(row as Parameters<typeof mapSaleDetail>[0]));
}

function aggregateSales(sales: ReturnType<typeof mapSaleDetail>[], rate: number) {
  let totalUzs = 0;
  let cashUzs = 0;
  let cogsUzs = 0;
  let creditUzs = 0;
  const productMap = new Map<string, { name: string; qty: number; revenueUzs: number }>();

  for (const sale of sales) {
    if (sale.status !== 'completed') continue;
    totalUzs += sale.totalUzs;
    if (sale.paymentType === 'cash') cashUzs += sale.totalUzs;
    if (sale.paymentType === 'credit') creditUzs += sale.totalUzs;
    if (sale.paymentType === 'mixed') {
      const paid = sale.payments[0]?.receivedUzs ?? 0;
      cashUzs += paid;
      creditUzs += Math.max(0, sale.totalUzs - paid);
    }
    for (const alloc of sale.fifoAllocations) {
      cogsUzs += alloc.costUzs;
    }
    for (const li of sale.lineItems) {
      const existing = productMap.get(li.productId);
      if (existing) {
        existing.qty += li.quantity;
        existing.revenueUzs += li.totalUzs;
      } else {
        productMap.set(li.productId, {
          name: li.productName,
          qty: li.quantity,
          revenueUzs: li.totalUzs,
        });
      }
    }
  }

  const count = sales.filter((s) => s.status === 'completed').length;
  const grossProfit = totalUzs - cogsUzs;
  const margin = totalUzs > 0 ? (grossProfit / totalUzs) * 100 : 0;

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.revenueUzs - a.revenueUzs)
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      qty: p.qty,
      revenueUzs: formatUzs(p.revenueUzs),
      revenueUsd: formatUsd(uzsToUsd(p.revenueUzs, rate)),
    }));

  return {
    totalUzs,
    cashUzs,
    cogsUzs,
    creditUzs,
    grossProfit,
    margin,
    count,
    topProducts,
  };
}

function buildTrendBuckets(
  sales: ReturnType<typeof mapSaleDetail>[],
  period: DashboardPeriod,
  rate: number,
) {
  const buckets = new Map<string, { uzs: number; usd: number }>();

  for (const sale of sales) {
    if (sale.status !== 'completed') continue;
    const d = new Date(sale.createdAt);
    let key: string;
    if (period === 'daily') {
      key = `${String(d.getHours()).padStart(2, '0')}:00`;
    } else if (period === 'yearly') {
      key = d.toLocaleString('uz-UZ', { month: 'short' });
    } else {
      key = d.toLocaleString('uz-UZ', { day: '2-digit', month: 'short' });
    }
    const bucket = buckets.get(key) ?? { uzs: 0, usd: 0 };
    bucket.uzs += sale.totalUzs;
    bucket.usd += sale.totalUsd;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()].map(([date, v]) => ({
    date,
    uzs: v.uzs,
    usd: v.usd || uzsToUsd(v.uzs, rate),
  }));
}

export function useDashboardData(period: DashboardPeriod, exchangeRate: number) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = periodRange(period);
      const [currentSales, prevSales, debtSummary, payments, products, aging, supplierSummary] =
        await Promise.all([
        fetchSalesInRange(range.from, range.to),
        fetchSalesInRange(range.prevFrom, range.prevTo),
        debtApi.getSummary() as Promise<{
          totalDebtUzs: string;
          totalDebtUsd: string;
          customerCount: number;
          overdueCustomerCount: number;
        }>,
        debtApi.listPayments({ from: range.from, to: range.to, limit: 200 }),
        productsApi.list({ limit: 500 }),
        debtApi.getAging() as Promise<{
          buckets: Array<{ label: string; debtUzs: string; debtUsd: string; customerCount: number }>;
        }>,
        suppliersApi.getSummary().catch(() => ({
          supplierCount: 0,
          totalDebtUzs: '0',
          totalPaidUzs: '0',
          remainingDebtUzs: '0',
          topSupplierName: null,
          topSupplierDebtUzs: '0',
          recentPayments: [],
        })),
      ]);

      const current = aggregateSales(currentSales, exchangeRate);
      const previous = aggregateSales(prevSales, exchangeRate);

      const paymentTotalUzs = payments.reduce((s, p) => s + p.amountUzs, 0);
      const inventoryUzs = products.reduce((s, p) => s + p.priceUzs * p.stock, 0);
      const overdueBuckets = aging.buckets.filter((b) => b.label !== '0-30');
      const overdueUzs = overdueBuckets.reduce((s, b) => s + parseFloat(b.debtUzs), 0);
      const overdueUsd = overdueBuckets.reduce((s, b) => s + parseFloat(b.debtUsd), 0);

      const cashPct =
        current.totalUzs > 0 ? Math.round((current.cashUzs / current.totalUzs) * 100) : 0;
      const creditPct = 100 - cashPct;

      const recentActivity = [
        ...currentSales.slice(0, 5).map((s) => ({
          id: s.id,
          text: `Sotuv ${s.number} — ${formatUzs(s.totalUzs)}`,
          time: relativeTime(s.createdAt),
          type: 'sale',
        })),
        ...payments.slice(0, 3).map((p) => ({
          id: p.id,
          text: `${p.customerName} to'lov qildi — ${formatUzs(p.amountUzs)}`,
          time: relativeTime(p.createdAt),
          type: 'payment',
        })),
        ...(supplierSummary.recentPayments ?? []).slice(0, 3).map((p) => {
          const payment = mapSupplierPayment(p as Parameters<typeof mapSupplierPayment>[0]);
          return {
            id: payment.id,
            text: `${payment.supplierName} (firma) — ${formatUzs(payment.amountUzs)}`,
            time: relativeTime(payment.createdAt),
            type: 'supplier_payment',
          };
        }),
      ]
        .sort((a, b) => 0)
        .slice(0, 6);

      setData({
        kpis: {
          totalSales: {
            uzs: formatUzs(current.totalUzs),
            usd: formatUsd(uzsToUsd(current.totalUzs, exchangeRate)),
            trend: trendPct(current.totalUzs, previous.totalUzs),
            meta: `${current.count} ta tranzaksiya`,
          },
          saleCount: {
            value: String(current.count),
            trend: trendPct(current.count, previous.count),
            meta:
              current.count > 0
                ? `O'rtacha ${formatUzs(Math.round(current.totalUzs / current.count))}`
                : 'Sotuv yo\'q',
          },
          avgSale: {
            uzs:
              current.count > 0
                ? formatUzs(Math.round(current.totalUzs / current.count))
                : formatUzs(0),
            usd:
              current.count > 0
                ? formatUsd(uzsToUsd(current.totalUzs / current.count, exchangeRate))
                : formatUsd(0),
            trend: trendPct(
              current.count > 0 ? current.totalUzs / current.count : 0,
              previous.count > 0 ? previous.totalUzs / previous.count : 0,
            ),
          },
          cashSales: {
            uzs: formatUzs(current.cashUzs),
            usd: formatUsd(uzsToUsd(current.cashUzs, exchangeRate)),
            trend: trendPct(current.cashUzs, previous.cashUzs),
            meta: `${cashPct}% jami savdodan`,
          },
          grossProfit: {
            uzs: formatUzs(current.grossProfit),
            usd: formatUsd(uzsToUsd(current.grossProfit, exchangeRate)),
            trend: trendPct(current.grossProfit, previous.grossProfit),
          },
          grossMargin: {
            value: `${current.margin.toFixed(1)}%`,
            trend: trendPct(current.margin, previous.margin),
          },
          cogs: {
            uzs: formatUzs(current.cogsUzs),
            usd: formatUsd(uzsToUsd(current.cogsUzs, exchangeRate)),
            trend: trendPct(current.cogsUzs, previous.cogsUzs),
          },
          outstandingDebt: {
            uzs: formatUzs(parseFloat(debtSummary.totalDebtUzs)),
            usd: formatUsd(parseFloat(debtSummary.totalDebtUsd)),
            trend: 0,
            meta: `${debtSummary.customerCount} ta mijozda qarz`,
          },
          payments: {
            uzs: formatUzs(paymentTotalUzs),
            usd: formatUsd(uzsToUsd(paymentTotalUzs, exchangeRate)),
            trend: 0,
            meta: `${payments.length} ta to'lov`,
          },
          newDebt: {
            uzs: formatUzs(current.creditUzs),
            usd: formatUsd(uzsToUsd(current.creditUzs, exchangeRate)),
            trend: trendPct(current.creditUzs, previous.creditUzs),
          },
          overdueDebt: {
            uzs: formatUzs(overdueUzs),
            usd: formatUsd(overdueUsd),
            trend: 0,
            meta: `${debtSummary.overdueCustomerCount} ta mijozning muddati o'tgan`,
          },
          inventoryValue: {
            uzs: formatUzs(inventoryUzs),
            usd: formatUsd(uzsToUsd(inventoryUzs, exchangeRate)),
            trend: 0,
            meta: 'Sotuv narxlari bo\'yicha',
          },
          exchangeRate: {
            value: `${exchangeRate.toLocaleString('uz-UZ')} so'm`,
            trend: 0,
          },
        },
        suppliers: {
          count: {
            value: String(supplierSummary.supplierCount),
            trend: 0,
            meta: 'Faol firmalar',
          },
          totalDebt: {
            uzs: formatUzs(parseFloat(supplierSummary.remainingDebtUzs)),
            usd: formatUsd(uzsToUsd(parseFloat(supplierSummary.remainingDebtUzs), exchangeRate)),
            trend: 0,
            meta: `Jami qarz: ${formatUzs(parseFloat(supplierSummary.totalDebtUzs))}`,
          },
          topSupplier: {
            value: supplierSummary.topSupplierName ?? '—',
            trend: 0,
            meta: supplierSummary.topSupplierName
              ? `Qarz: ${formatUzs(parseFloat(supplierSummary.topSupplierDebtUzs))}`
              : 'Qarz yo\'q',
          },
          recentPayments: (supplierSummary.recentPayments ?? []).map((p) => {
            const payment = mapSupplierPayment(p as Parameters<typeof mapSupplierPayment>[0]);
            return {
              id: payment.id,
              text: `${payment.supplierName} — ${formatUzs(payment.amountUzs)}`,
              time: relativeTime(payment.createdAt),
            };
          }),
        },
        salesTrend: buildTrendBuckets(currentSales, period, exchangeRate),
        paymentSplit: [
          { name: 'Naqd', value: cashPct, color: '#2563EB' },
          { name: 'Nasiya', value: creditPct, color: '#16A34A' },
        ],
        topProducts: current.topProducts,
        recentActivity,
      });
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Dashboard yuklanmadi');
    } finally {
      setLoading(false);
    }
  }, [period, exchangeRate]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
