import { useMemo } from 'react';
import {
  Box,
  Card,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StatCard } from '@/components/organisms/StatCard';
import { SegmentedControl } from '@/components/molecules/SegmentedControl';
import { useUiStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useCurrencyStore } from '@/stores/currencyStore';
import { useDashboardData } from '@/hooks/useDashboardData';
import { formatTime } from '@/utils/format';
import { formatRate } from '@/utils/currency';
import { t } from '@/i18n';
import type { CurrencyMode, DashboardPeriod } from '@/types';
import { useAppTheme } from '@/theme/ThemeProvider';
import { designTokens } from '@/theme/tokens';

const periodOptions: { value: DashboardPeriod; label: string }[] = [
  { value: 'daily', label: t('dashboard.period.daily') },
  { value: 'weekly', label: t('dashboard.period.weekly') },
  { value: 'monthly', label: t('dashboard.period.monthly') },
  { value: 'yearly', label: t('dashboard.period.yearly') },
];

const currencyOptions: { value: CurrencyMode; label: string }[] = [
  { value: 'UZS', label: 'UZS' },
  { value: 'USD', label: 'USD' },
  { value: 'both', label: t('dashboard.currency.both') },
];

export function DashboardPage() {
  const { activeCompany } = useAuthStore();
  const {
    dashboardPeriod,
    currencyMode,
    selectedBranch,
    lastUpdated,
    setDashboardPeriod,
    setCurrencyMode,
    setSelectedBranch,
    refreshDashboard,
  } = useUiStore();
  const { resolvedMode } = useAppTheme();
  const activeRate = useCurrencyStore((s) => s.rates.find((r) => r.status === 'active')?.rate ?? 12_620);
  const { data, loading, reload } = useDashboardData(dashboardPeriod, activeRate);

  const chartColors = useMemo(
    () => ({
      uzs: resolvedMode === 'light' ? designTokens.light.currency.uzs : designTokens.dark.currency.uzs,
      usd: resolvedMode === 'light' ? designTokens.light.currency.usd : designTokens.dark.currency.usd,
      grid: resolvedMode === 'light' ? designTokens.light.border.default : designTokens.dark.border.default,
      text: resolvedMode === 'light' ? designTokens.light.foreground.secondary : designTokens.dark.foreground.secondary,
    }),
    [resolvedMode],
  );

  if (!data) {
    return (
      <Box data-screen-id="SCR-010" sx={{ maxWidth: 1600, mx: 'auto', py: 4 }}>
        <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
          {t('dashboard.title')}
        </Typography>
        <Typography color="text.secondary">
          {loading ? 'Ma\'lumotlar yuklanmoqda…' : 'Dashboard ma\'lumotlari mavjud emas'}
        </Typography>
      </Box>
    );
  }

  const { kpis, suppliers } = data;

  const periodSuffix =
    dashboardPeriod === 'daily'
      ? t('dashboard.periodSuffix.daily')
      : dashboardPeriod === 'weekly'
        ? t('dashboard.periodSuffix.weekly')
        : dashboardPeriod === 'monthly'
          ? t('dashboard.periodSuffix.monthly')
          : dashboardPeriod === 'yearly'
            ? t('dashboard.periodSuffix.yearly')
            : '';

  const handleRefresh = () => {
    refreshDashboard();
    void reload();
  };

  const showUzs = currencyMode === 'UZS' || currencyMode === 'both';
  const showUsd = currencyMode === 'USD' || currencyMode === 'both';

  return (
    <Box data-screen-id="SCR-010" sx={{ maxWidth: 1600, mx: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          mb: 3,
          minHeight: 72,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700}>
            {t('dashboard.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {activeCompany?.name ?? 'Kompaniya'} · {periodOptions.find((p) => p.value === dashboardPeriod)?.label}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{t('dashboard.branch')}</InputLabel>
            <Select
              value={selectedBranch}
              label={t('dashboard.branch')}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <MenuItem value="all">{t('dashboard.allBranches')}</MenuItem>
              <MenuItem value="main">{t('dashboard.mainBranch')}</MenuItem>
              <MenuItem value="north">{t('dashboard.northBranch')}</MenuItem>
            </Select>
          </FormControl>

          <SegmentedControl
            value={dashboardPeriod}
            options={periodOptions}
            onChange={setDashboardPeriod}
            aria-label="Davrni tanlash"
          />

          <SegmentedControl
            value={currencyMode}
            options={currencyOptions}
            onChange={setCurrencyMode}
            aria-label="Valyutani tanlash"
          />

          <Tooltip title={t('dashboard.refresh')}>
            <IconButton onClick={handleRefresh} aria-label={t('dashboard.refresh')}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          {lastUpdated && (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {t('dashboard.updated', { time: formatTime(lastUpdated) })}
            </Typography>
          )}
        </Box>
      </Box>

      {/* KPI Row A — Revenue */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 2,
        }}
      >
        <StatCard
          label={`${t('dashboard.totalSales')} ${periodSuffix}`}
          value={showUzs ? kpis.totalSales.uzs : kpis.totalSales.usd}
          secondaryValue={currencyMode === 'both' ? kpis.totalSales.usd : undefined}
          trend={kpis.totalSales.trend}
          meta={kpis.totalSales.meta}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
        <StatCard
          label={t('dashboard.saleCount')}
          value={kpis.saleCount.value}
          trend={kpis.saleCount.trend}
          meta={kpis.saleCount.meta}
          loading={loading}
        />
        <StatCard
          label={t('dashboard.avgSale')}
          value={showUzs ? kpis.avgSale.uzs : kpis.avgSale.usd}
          secondaryValue={currencyMode === 'both' ? kpis.avgSale.usd : undefined}
          trend={kpis.avgSale.trend}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
        <StatCard
          label={t('dashboard.cashSales')}
          value={showUzs ? kpis.cashSales.uzs : kpis.cashSales.usd}
          secondaryValue={currencyMode === 'both' ? kpis.cashSales.usd : undefined}
          trend={kpis.cashSales.trend}
          meta={kpis.cashSales.meta}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
      </Box>

      {/* KPI Row B — Profit */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
          mb: 2,
        }}
      >
        <StatCard
          label={t('dashboard.grossProfit')}
          value={showUzs ? kpis.grossProfit.uzs : kpis.grossProfit.usd}
          secondaryValue={currencyMode === 'both' ? kpis.grossProfit.usd : undefined}
          trend={kpis.grossProfit.trend}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
        <StatCard
          label={t('dashboard.grossMargin')}
          value={kpis.grossMargin.value}
          trend={kpis.grossMargin.trend}
          loading={loading}
        />
        <StatCard
          label={t('dashboard.cogs')}
          value={showUzs ? kpis.cogs.uzs : kpis.cogs.usd}
          secondaryValue={currencyMode === 'both' ? kpis.cogs.usd : undefined}
          trend={kpis.cogs.trend}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
      </Box>

      {/* KPI Row C — Debt */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 2,
        }}
      >
        <StatCard
          label={t('dashboard.outstandingDebt')}
          value={showUzs ? kpis.outstandingDebt.uzs : kpis.outstandingDebt.usd}
          secondaryValue={currencyMode === 'both' ? kpis.outstandingDebt.usd : undefined}
          trend={kpis.outstandingDebt.trend}
          meta={kpis.outstandingDebt.meta}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
        <StatCard
          label={`${t('dashboard.payments')} ${periodSuffix}`}
          value={showUzs ? kpis.payments.uzs : kpis.payments.usd}
          secondaryValue={currencyMode === 'both' ? kpis.payments.usd : undefined}
          trend={kpis.payments.trend}
          meta={kpis.payments.meta}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
        <StatCard
          label={t('dashboard.newDebt')}
          value={showUzs ? kpis.newDebt.uzs : kpis.newDebt.usd}
          secondaryValue={currencyMode === 'both' ? kpis.newDebt.usd : undefined}
          trend={kpis.newDebt.trend}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
        <StatCard
          label={t('dashboard.overdueDebt')}
          value={showUzs ? kpis.overdueDebt.uzs : kpis.overdueDebt.usd}
          secondaryValue={currencyMode === 'both' ? kpis.overdueDebt.usd : undefined}
          trend={kpis.overdueDebt.trend}
          meta={kpis.overdueDebt.meta}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
      </Box>

      {/* KPI Row D — Inventory + Exchange */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          label={t('dashboard.inventoryValue')}
          value={showUzs ? kpis.inventoryValue.uzs : kpis.inventoryValue.usd}
          secondaryValue={currencyMode === 'both' ? kpis.inventoryValue.usd : undefined}
          trend={kpis.inventoryValue.trend}
          meta={kpis.inventoryValue.meta}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
        <StatCard
          label={t('dashboard.exchangeRate')}
          value={formatRate(activeRate)}
          trend={kpis.exchangeRate.trend}
          meta={t('dashboard.exchangeMeta', { rate: activeRate.toLocaleString('uz-UZ') })}
          loading={loading}
        />
      </Box>

      {/* Supplier widgets */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          label="Firmalar soni"
          value={suppliers.count.value}
          trend={suppliers.count.trend}
          meta={suppliers.count.meta}
          loading={loading}
        />
        <StatCard
          label="Jami firma qarzi"
          value={showUzs ? suppliers.totalDebt.uzs : suppliers.totalDebt.usd}
          secondaryValue={currencyMode === 'both' ? suppliers.totalDebt.usd : undefined}
          trend={suppliers.totalDebt.trend}
          meta={suppliers.totalDebt.meta}
          currencyColor={showUzs ? 'uzs' : 'usd'}
          loading={loading}
        />
        <StatCard
          label="Eng katta qarzdor"
          value={suppliers.topSupplier.value}
          trend={suppliers.topSupplier.trend}
          meta={suppliers.topSupplier.meta}
          loading={loading}
        />
        <Card sx={{ p: 2, minHeight: 120 }}>
          <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.75rem', mb: 1 }}>
            So&apos;nggi firma to&apos;lovlari
          </Typography>
          {suppliers.recentPayments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">To&apos;lovlar yo&apos;q</Typography>
          ) : (
            <List dense disablePadding>
              {suppliers.recentPayments.slice(0, 3).map((p) => (
                <ListItem key={p.id} disablePadding sx={{ py: 0.25 }}>
                  <ListItemText primary={p.text} secondary={p.time} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItem>
              ))}
            </List>
          )}
        </Card>
      </Box>

      {/* Charts Row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
          gap: 2,
          mb: 3,
        }}
      >
        <Card sx={{ p: 2, minHeight: 320 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            {t('dashboard.salesTrend')}
          </Typography>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.salesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fill: chartColors.text, fontSize: 12 }} />
              <YAxis tick={{ fill: chartColors.text, fontSize: 12 }} />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: resolvedMode === 'light' ? '#fff' : '#1E293B',
                  border: `1px solid ${chartColors.grid}`,
                  borderRadius: 6,
                }}
              />
              <Legend />
              {showUzs && (
                <Area
                  type="monotone"
                  dataKey="uzs"
                  name="UZS"
                  stroke={chartColors.uzs}
                  fill={chartColors.uzs}
                  fillOpacity={0.15}
                />
              )}
              {showUsd && (
                <Area
                  type="monotone"
                  dataKey="usd"
                  name="USD"
                  stroke={chartColors.usd}
                  fill={chartColors.usd}
                  fillOpacity={0.15}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card sx={{ p: 2, minHeight: 320 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            {t('dashboard.paymentVsCredit')}
          </Typography>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.paymentSplit}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, value }) => `${name} ${value}%`}
              >
                {data.paymentSplit.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </Box>

      {/* Bottom Row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' },
          gap: 2,
        }}
      >
        <Card sx={{ p: 2, minHeight: 360 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            {t('dashboard.recentSales')}
          </Typography>
          <List dense disablePadding>
            {data.recentActivity.map((item) => (
              <ListItem key={item.id} disableGutters sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <ListItemText
                  primary={item.text}
                  secondary={item.time}
                  primaryTypographyProps={{ fontSize: '0.875rem' }}
                  secondaryTypographyProps={{ fontSize: '0.75rem' }}
                />
              </ListItem>
            ))}
          </List>
        </Card>

        <Card sx={{ p: 2 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            {t('dashboard.topProducts')}
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('dashboard.productCol')}</TableCell>
                  <TableCell align="right">{t('dashboard.qtyCol')}</TableCell>
                  {(currencyMode === 'UZS' || currencyMode === 'both') && (
                    <TableCell align="right">{t('dashboard.revenueUzs')}</TableCell>
                  )}
                  {(currencyMode === 'USD' || currencyMode === 'both') && (
                    <TableCell align="right">{t('dashboard.revenueUsd')}</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.topProducts.map((product) => (
                  <TableRow key={product.name} hover>
                    <TableCell>{product.name}</TableCell>
                    <TableCell align="right">{product.qty}</TableCell>
                    {(currencyMode === 'UZS' || currencyMode === 'both') && (
                      <TableCell align="right" sx={{ color: chartColors.uzs, fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {product.revenueUzs}
                      </TableCell>
                    )}
                    {(currencyMode === 'USD' || currencyMode === 'both') && (
                      <TableCell align="right" sx={{ color: chartColors.usd, fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {product.revenueUsd}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>
    </Box>
  );
}
