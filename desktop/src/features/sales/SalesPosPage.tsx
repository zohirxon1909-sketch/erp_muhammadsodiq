import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Grid,
  IconButton,
  Paper,
  TextField,
  Typography,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import PaymentIcon from '@mui/icons-material/Payment';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PageHeader } from '@/components/common/PageHeader';
import { SegmentedControl } from '@/components/molecules/SegmentedControl';
import { BarcodeInput } from './components/BarcodeInput';
import { CustomerPicker } from './components/CustomerPicker';
import { PaymentDialog } from './components/PaymentDialog';
import { BelowCostConfirmDialog } from './components/BelowCostConfirmDialog';
import { InsufficientStockDialog } from './components/InsufficientStockDialog';
import { SaleSuccessOverlay } from './components/SaleSuccessOverlay';
import { usePosCartStore, lineStockQty } from '@/stores/posCartStore';
import { refreshAfterSaleMutation } from '@/utils/domainRefresh';
import { useCurrencyStore } from '@/stores/currencyStore';
import { useNotification } from '@/components/feedback/NotificationProvider';
import { productsApi, salesApi } from '@/api/services';
import { formatUzs, formatUsd } from '@/utils/format';
import { productUsdFromUzs, lineTotalUsd } from '@/utils/currency';
import { cartLineBaseQuantity } from '@/constants/productUnits';
import type { Product } from '@/types/entities';
import type { PaymentDialogData, SaleDetail } from '@/types/sales';
import { useDisclosure } from '@/hooks/useListState';
import { useSalesStore } from '@/stores/salesStore';

const PosProductCard = memo(function PosProductCard({
  product,
  currency,
  exchangeRate,
  onAdd,
}: {
  product: Product;
  currency: 'UZS' | 'USD';
  exchangeRate: number;
  onAdd: (p: Product) => void;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        p: 1.5,
        cursor: 'pointer',
        height: '100%',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
      }}
      onClick={() => onAdd(product)}
    >
      <Typography variant="caption" color="text.secondary">
        {product.sku}
      </Typography>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, lineHeight: 1.3 }}>
        {product.name}
      </Typography>
      <Typography variant="body2" color="primary.main" fontWeight={700}>
        {currency === 'UZS'
          ? formatUzs(product.priceUzs)
          : formatUsd(productUsdFromUzs(product.priceUzs, exchangeRate))}
      </Typography>
      <Chip
        size="small"
        label={`Qoldiq: ${product.stock}`}
        color={product.stock <= product.minStockLevel ? 'warning' : 'default'}
        sx={{ mt: 0.5, height: 20, fontSize: '0.65rem' }}
      />
    </Card>
  );
});

export function SalesPosPage() {
  const { success, error: notifyError } = useNotification();
  const items = usePosCartStore((s) => s.items);
  const customer = usePosCartStore((s) => s.customer);
  const currency = usePosCartStore((s) => s.currency);
  const isProcessing = usePosCartStore((s) => s.isProcessing);
  const addProduct = usePosCartStore((s) => s.addProduct);
  const setQuantity = usePosCartStore((s) => s.setQuantity);
  const setSaleUnit = usePosCartStore((s) => s.setSaleUnit);
  const setUnitPrice = usePosCartStore((s) => s.setUnitPrice);
  const removeLine = usePosCartStore((s) => s.removeLine);
  const setCustomer = usePosCartStore((s) => s.setCustomer);
  const setCurrency = usePosCartStore((s) => s.setCurrency);
  const clearCart = usePosCartStore((s) => s.clearCart);
  const setProcessing = usePosCartStore((s) => s.setProcessing);

  const exchangeRate = useCurrencyStore((s) => s.rates.find((r) => r.status === 'active')?.rate ?? 12_620);
  const { totalUzs, totalUsd, itemCount } = useMemo(() => {
    const totalUzs = items.reduce(
      (s, i) => s + lineStockQty(i) * i.unitPriceUzs,
      0,
    );
    return {
      totalUzs,
      totalUsd: lineTotalUsd(totalUzs, exchangeRate),
      itemCount: items.reduce((s, i) => s + lineStockQty(i), 0),
    };
  }, [items, exchangeRate]);

  const belowCostLines = useMemo(
    () =>
      items.filter(
        (i) => i.product.purchasePriceUzs > 0 && i.unitPriceUzs < i.product.purchasePriceUzs,
      ),
    [items],
  );

  const paymentDialog = useDisclosure();
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [barcode, setBarcode] = useState('');
  const [posProducts, setPosProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [stockError, setStockError] = useState<{ product: Product; requested: number } | null>(null);
  const [completedSale, setCompletedSale] = useState<SaleDetail | null>(null);
  const [belowCostOpen, setBelowCostOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PaymentDialogData | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    void productsApi
      .posProducts(searchDebounced || undefined, 60)
      .then((data) => {
        if (!cancelled) setPosProducts(data.filter((p) => p.status === 'active' && p.stock > 0));
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchDebounced]);

  const tryAddProduct = useCallback(
    (product: Product, qty = 1, saleUnit: 'piece' | 'box' = 'piece') => {
      const ok = addProduct(product, qty, saleUnit);
      if (!ok) {
        const existing = items.find((i) => i.product.id === product.id);
        const requested =
          (existing ? lineStockQty(existing) : 0) +
          cartLineBaseQuantity(qty, saleUnit, product.unitsPerBox);
        setStockError({ product, requested });
      }
    },
    [addProduct, items],
  );

  const handleBarcodeScan = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      try {
        const product = await productsApi.getByBarcode(trimmed);
        if (product.status !== 'active' || product.stock <= 0) {
          notifyError('Mahsulot mavjud emas yoki zaxirasi tugagan');
          return;
        }
        tryAddProduct(product);
        success(`${product.name} savatga qo'shildi`);
      } catch {
        const local = posProducts.find(
          (p) =>
            p.barcode === trimmed ||
            p.sku.toLowerCase() === trimmed.toLowerCase(),
        );
        if (local) {
          tryAddProduct(local);
          success(`${local.name} savatga qo'shildi`);
        } else {
          notifyError('Mahsulot topilmadi');
        }
      }
    },
    [tryAddProduct, success, notifyError, posProducts],
  );

  const submitSale = async (data: PaymentDialogData) => {
    setProcessing(true);
    try {
      const paymentType =
        data.method === 'cash' ? 'CASH' : data.method === 'credit' ? 'CREDIT' : 'MIXED';

      const amountPaidUzs =
        data.method === 'credit'
          ? 0
          : currency === 'USD' && data.method === 'cash'
            ? 0
            : Math.round(data.receivedUzs);

      const amountPaidUsd =
        currency === 'USD' && data.method === 'cash' && data.receivedUsd != null
          ? data.receivedUsd
          : undefined;

      const sale = await salesApi.create({
        customerId: customer?.id,
        originalCurrency: currency,
        paymentType,
        amountPaidUzs,
        amountPaidUsd,
        lineItems: items.map((item) => ({
          productId: item.product.id,
          quantity: lineStockQty(item),
          unitPriceUzs: item.unitPriceUzs,
        })),
      });
      paymentDialog.onClose();
      setBelowCostOpen(false);
      setPendingPayment(null);
      clearCart();
      setCompletedSale(sale);
      useSalesStore.getState().setLastCompletedSaleId(sale.id);
      await refreshAfterSaleMutation();
      success('Sotuv muvaffaqiyatli yakunlandi');
    } catch (err: unknown) {
      notifyError((err as { message?: string }).message ?? 'Sotuvda xatolik');
    } finally {
      setProcessing(false);
    }
  };

  const handleCompletePayment = async (data: PaymentDialogData) => {
    if ((data.method === 'credit' || data.method === 'mixed') && !customer) {
      notifyError('Nasiya yoki aralash to\'lov uchun mijoz tanlang');
      return;
    }

    if (belowCostLines.length > 0) {
      setPendingPayment(data);
      paymentDialog.onClose();
      setBelowCostOpen(true);
      return;
    }

    await submitSale(data);
  };

  const handleBelowCostConfirm = async () => {
    if (!pendingPayment) return;
    setBelowCostOpen(false);
    success('Olish narxidan arzon narxda sotish tasdiqlandi');
    await submitSale(pendingPayment);
  };

  const handleBelowCostCancel = () => {
    setBelowCostOpen(false);
    setPendingPayment(null);
    paymentDialog.onOpen();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Shtrix-kod"]')?.focus();
      }
      if ((e.key === 'F8' || e.key === 'F9') && items.length > 0) {
        e.preventDefault();
        paymentDialog.onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length, paymentDialog.onOpen]);

  const productGrid = useMemo(
    () =>
      posProducts.map((product) => (
        <Grid key={product.id} size={{ xs: 6, sm: 4, lg: 3 }}>
          <PosProductCard
            product={product}
            currency={currency}
            exchangeRate={exchangeRate}
            onAdd={(p) => tryAddProduct(p)}
          />
        </Grid>
      )),
    [posProducts, currency, exchangeRate, tryAddProduct],
  );

  return (
    <>
      <PageHeader
        title="Yangi sotuv (POS)"
        subtitle="Mahsulot qo'shing va to'lovni yakunlang"
        secondaryActions={
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
              Kurs: 1 USD = {exchangeRate.toLocaleString()} so&apos;m
            </Typography>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => {
                clearCart();
                success('Yangi savat boshlandi');
              }}
            >
              Yangi savat
            </Button>
          </>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <BarcodeInput
            value={barcode}
            onChange={setBarcode}
            onScan={handleBarcodeScan}
            autoFocus
          />

          <TextField
            fullWidth
            size="small"
            placeholder="Mahsulot nomi, SKU yoki shtrix-kod…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ my: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
          />

          {productsLoading ? (
            <Typography color="text.secondary">Mahsulotlar yuklanmoqda…</Typography>
          ) : (
            <Grid container spacing={1.5}>{productGrid}</Grid>
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper variant="outlined" sx={{ p: 2, position: 'sticky', top: 16 }}>
            <CustomerPicker value={customer} onChange={setCustomer} />

            <Box sx={{ my: 2 }}>
              <SegmentedControl
                value={currency}
                options={[
                  { value: 'UZS', label: 'UZS' },
                  { value: 'USD', label: 'USD' },
                ]}
                onChange={setCurrency}
                aria-label="Valyuta"
              />
            </Box>

            <Divider sx={{ mb: 2 }} />
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Savat ({itemCount})
            </Typography>

            {items.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                Savat bo&apos;sh. Mahsulot qo&apos;shing.
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 360, overflow: 'auto', mb: 2 }}>
                {items.map((item) => (
                  <Box key={item.product.id} sx={{ mb: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {item.product.name}
                      {item.product.purchasePriceUzs > 0 &&
                        item.unitPriceUzs < item.product.purchasePriceUzs && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="warning.main"
                            sx={{ ml: 1 }}
                          >
                            (olish narxidan arzon)
                          </Typography>
                        )}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                      <TextField
                        size="small"
                        type="number"
                        label="Narx (dona)"
                        value={item.unitPriceUzs}
                        onChange={(e) =>
                          setUnitPrice(item.product.id, Number(e.target.value) || 0)
                        }
                        sx={{ flex: 1 }}
                      />
                      {item.product.unitsPerBox > 1 && (
                        <ToggleButtonGroup
                          size="small"
                          exclusive
                          value={item.saleUnit}
                          onChange={(_, v) => v && setSaleUnit(item.product.id, v)}
                        >
                          <ToggleButton value="piece">Dona</ToggleButton>
                          <ToggleButton value="box">Karobka</ToggleButton>
                        </ToggleButtonGroup>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                      <IconButton size="small" onClick={() => setQuantity(item.product.id, item.quantity - 1)}>
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="body2" sx={{ minWidth: 48, textAlign: 'center' }}>
                        {item.quantity} {item.saleUnit === 'box' ? 'kar.' : 'dona'}
                        {item.saleUnit === 'box' && (
                          <Typography component="span" variant="caption" display="block" color="text.secondary">
                            = {lineStockQty(item)} dona
                          </Typography>
                        )}
                      </Typography>
                      <IconButton size="small" onClick={() => tryAddProduct(item.product, 1, item.saleUnit)}>
                        <AddIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => removeLine(item.product.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="body2" fontWeight={600} sx={{ ml: 'auto' }}>
                        {formatUzs(lineStockQty(item) * item.unitPriceUzs)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body1" fontWeight={600}>Jami</Typography>
              <Typography variant="h6" fontWeight={700}>
                {currency === 'UZS' ? formatUzs(totalUzs) : formatUsd(totalUsd)}
              </Typography>
            </Box>

            <Button
              fullWidth
              variant="outlined"
              size="large"
              startIcon={<PaymentIcon />}
              disabled={items.length === 0 || isProcessing}
              onClick={paymentDialog.onOpen}
              sx={{ mb: 1 }}
            >
              To&apos;lov (F8)
            </Button>
            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={<PointOfSaleIcon />}
              disabled={items.length === 0 || isProcessing}
              onClick={paymentDialog.onOpen}
            >
              Sotuvni yakunlash (F9)
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <PaymentDialog
        open={paymentDialog.open}
        totalUzs={totalUzs}
        totalUsd={totalUsd}
        currency={currency}
        hasCustomer={Boolean(customer)}
        loading={isProcessing}
        onClose={paymentDialog.onClose}
        onConfirm={handleCompletePayment}
      />

      <BelowCostConfirmDialog
        open={belowCostOpen}
        lines={belowCostLines}
        onCancel={handleBelowCostCancel}
        onConfirm={() => void handleBelowCostConfirm()}
      />

      <InsufficientStockDialog
        open={Boolean(stockError)}
        productName={stockError?.product.name ?? ''}
        available={stockError?.product.stock ?? 0}
        requested={stockError?.requested ?? 0}
        onClose={() => setStockError(null)}
        onReduce={() => {
          if (stockError) {
            const existing = items.find((i) => i.product.id === stockError.product.id);
            if (existing) setQuantity(stockError.product.id, stockError.product.stock);
            else tryAddProduct(stockError.product, stockError.product.stock);
            setStockError(null);
          }
        }}
      />

      <SaleSuccessOverlay
        sale={completedSale}
        onNewCart={() => {
          setCompletedSale(null);
          clearCart();
        }}
        onClose={() => setCompletedSale(null)}
      />
    </>
  );
}
