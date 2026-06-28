import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { useInventoryStore } from '@/stores/inventoryStore';
import { useNotification } from '@/components/feedback/NotificationProvider';
import { categoriesApi } from '@/api/services';
import { useCurrencyStore } from '@/stores/currencyStore';
import { PRODUCT_UNITS } from '@/constants/productUnits';
import { productUzsFromUsd, productUsdFromUzs } from '@/utils/currency';
import { formatUzs, formatUsd } from '@/utils/format';
import type { Category } from '@/types/entities';

const schema = z.object({
  name: z.string().min(2, 'Nom talab qilinadi'),
  sku: z.string().min(2, 'SKU talab qilinadi'),
  categoryId: z.string().min(1, 'Kategoriya tanlang'),
  barcode: z.string().optional(),
  unitOfMeasure: z.string().min(1),
  unitsPerBox: z.coerce.number().int().min(1, 'Kamida 1'),
  minStockLevel: z.coerce.number().min(0).optional(),
  priceCurrency: z.enum(['UZS', 'USD']),
  purchasePrice: z.coerce.number().min(0.01, 'Olish narxi musbat bo\'lishi kerak'),
  salePrice: z.coerce.number().min(0.01, 'Sotish narxi musbat bo\'lishi kerak'),
  initialStock: z.coerce.number().min(0).optional(),
});

type FormData = z.infer<typeof schema>;

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { success, error: notifyError } = useNotification();
  const existing = useInventoryStore((s) => (id ? s.getProductById(id) : undefined));
  const createProduct = useInventoryStore((s) => s.createProduct);
  const updateProduct = useInventoryStore((s) => s.updateProduct);
  const warehouses = useInventoryStore((s) => s.warehouses);
  const [categories, setCategories] = useState<Category[]>([]);
  const exchangeRate = useCurrencyStore((s) => s.rates.find((r) => r.status === 'active')?.rate ?? 12_620);

  useEffect(() => {
    void categoriesApi.list().then(setCategories);
  }, []);

  const { register, handleSubmit, reset, control, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      sku: '',
      categoryId: '',
      barcode: '',
      unitOfMeasure: 'pcs',
      unitsPerBox: 1,
      minStockLevel: 0,
      priceCurrency: 'UZS',
      purchasePrice: 0,
      salePrice: 0,
      initialStock: 0,
    },
  });

  const priceCurrency = watch('priceCurrency');
  const purchasePrice = watch('purchasePrice');
  const salePrice = watch('salePrice');

  useEffect(() => {
    if (!existing || !categories.length) return;
    const match = categories.find((c) => c.name === existing.category);
    reset({
      name: existing.name,
      sku: existing.sku,
      categoryId: match?.id ?? '',
      barcode: existing.barcode ?? '',
      unitOfMeasure: existing.unitOfMeasure || 'pcs',
      unitsPerBox: existing.unitsPerBox || 1,
      minStockLevel: existing.minStockLevel ?? 0,
      priceCurrency: 'UZS',
      purchasePrice: existing.purchasePriceUzs || Math.round(existing.priceUzs * 0.72),
      salePrice: existing.priceUzs,
    });
  }, [existing, categories, reset]);

  const purchaseUzs =
    priceCurrency === 'UZS' ? purchasePrice : productUzsFromUsd(purchasePrice, exchangeRate);
  const saleUzs =
    priceCurrency === 'UZS' ? salePrice : productUzsFromUsd(salePrice, exchangeRate);

  const onSubmit = async (data: FormData) => {
    const purchasePriceUzs =
      data.priceCurrency === 'UZS'
        ? Math.round(data.purchasePrice)
        : productUzsFromUsd(data.purchasePrice, exchangeRate);
    const salePriceUzs =
      data.priceCurrency === 'UZS'
        ? Math.round(data.salePrice)
        : productUzsFromUsd(data.salePrice, exchangeRate);

    const payload = {
      name: data.name,
      barcode: data.barcode?.trim() || undefined,
      categoryId: data.categoryId,
      unitOfMeasure: data.unitOfMeasure,
      unitsPerBox: data.unitsPerBox,
      minStockLevel: data.minStockLevel ?? 0,
      purchasePriceUzs,
      salePriceUzs,
      salePriceUsd: productUsdFromUzs(salePriceUzs, exchangeRate),
    };

    try {
      if (isEdit && id) {
        const updated = await updateProduct(id, payload);
        success('Mahsulot yangilandi');
        navigate(`/products/${updated.id}`);
        return;
      }

      const created = await createProduct({
        sku: data.sku,
        ...payload,
        initialStock: data.initialStock,
        initialWarehouseId: data.initialStock ? warehouses[0]?.id : undefined,
      });
      success('Mahsulot yaratildi');
      navigate(`/products/${created.id}`);
    } catch (err: unknown) {
      notifyError((err as { message?: string }).message ?? 'Saqlashda xatolik');
    }
  };

  if (isEdit && !existing) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Button onClick={() => navigate('/products')}>Mahsulotlar ro&apos;yxatiga qaytish</Button>
      </Box>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}
        subtitle={existing?.sku}
      />
      <Card variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Nomi" {...register('name')} error={!!errors.name} helperText={errors.name?.message} />
          <TextField label="SKU" {...register('sku')} disabled={isEdit} error={!!errors.sku} helperText={errors.sku?.message} />
          <TextField select label="Kategoriya" {...register('categoryId')} error={!!errors.categoryId} helperText={errors.categoryId?.message}>
            {categories.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </TextField>
          <TextField label="Shtrix-kod" {...register('barcode')} helperText="Skaner yoki qo'lda kiriting" />

          <Controller
            name="unitOfMeasure"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>O&apos;lchov birligi</InputLabel>
                <Select {...field} label="O'lchov birligi">
                  {PRODUCT_UNITS.map((u) => (
                    <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <TextField
            label="Karobkada nechta mahsulot"
            type="number"
            {...register('unitsPerBox')}
            error={!!errors.unitsPerBox}
            helperText={errors.unitsPerBox?.message ?? 'Masalan: 24 dona = 1 karobka'}
          />

          <TextField
            label="Minimal qoldiq"
            type="number"
            {...register('minStockLevel')}
            helperText="Qoldiq shu qiymatdan past bo'lsa ogohlantirish"
          />

          <Controller
            name="priceCurrency"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth>
                <InputLabel>Valyuta</InputLabel>
                <Select {...field} label="Valyuta">
                  <MenuItem value="UZS">UZS (so&apos;m)</MenuItem>
                  <MenuItem value="USD">USD ($)</MenuItem>
                </Select>
              </FormControl>
            )}
          />

          <TextField
            label={priceCurrency === 'UZS' ? 'Olish narxi (UZS)' : 'Olish narxi (USD)'}
            type="number"
            inputProps={{ step: priceCurrency === 'USD' ? 0.01 : 1 }}
            {...register('purchasePrice')}
            error={!!errors.purchasePrice}
            helperText={errors.purchasePrice?.message}
          />
          <TextField
            label={priceCurrency === 'UZS' ? 'Sotish narxi (UZS)' : 'Sotish narxi (USD)'}
            type="number"
            inputProps={{ step: priceCurrency === 'USD' ? 0.01 : 1 }}
            {...register('salePrice')}
            error={!!errors.salePrice}
            helperText={errors.salePrice?.message}
          />

          <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Kurs: 1 USD = {exchangeRate.toLocaleString('uz-UZ')} so&apos;m
            </Typography>
            <Typography variant="body2">
              Olish: {formatUzs(purchaseUzs)} / {formatUsd(productUsdFromUzs(purchaseUzs, exchangeRate))}
            </Typography>
            <Typography variant="body2">
              Sotish: {formatUzs(saleUzs)} / {formatUsd(productUsdFromUzs(saleUzs, exchangeRate))}
            </Typography>
          </Box>

          {!isEdit && (
            <TextField label="Boshlang'ich zaxira" type="number" {...register('initialStock')} helperText="Ixtiyoriy — omborga qabul qiladi" />
          )}
          {isEdit && existing && (
            <TextField label="Joriy zaxira (faqat ko'rish)" value={existing.stock} disabled />
          )}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={() => navigate(-1)}>Bekor qilish</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting}>
              Saqlash
            </Button>
          </Box>
        </Box>
      </Card>
    </>
  );
}
