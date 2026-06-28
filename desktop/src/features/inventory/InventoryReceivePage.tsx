import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, MenuItem, TextField } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { SupplierFormDialog } from '@/features/suppliers/SupplierFormPage';
import { useInventoryStore } from '@/stores/inventoryStore';
import { useSupplierStore } from '@/stores/supplierStore';
import { useNotification } from '@/components/feedback/NotificationProvider';

const OTHER_SUPPLIER = '__other__';

const schema = z.object({
  productId: z.string().min(1, 'Mahsulotni tanlang'),
  warehouseId: z.string().min(1, 'Omborni tanlang'),
  supplierId: z.string().min(1, 'Firmni tanlang'),
  paymentType: z.enum(['CASH', 'CREDIT']),
  quantity: z.coerce.number().min(1, 'Miqdor kamida 1'),
  unitCostUzs: z.coerce.number().min(0, 'Narx 0 dan katta bo\'lishi kerak'),
  note: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function InventoryReceivePage() {
  const { success } = useNotification();
  const products = useInventoryStore((s) => s.products);
  const warehouses = useInventoryStore((s) => s.warehouses);
  const receiveStock = useInventoryStore((s) => s.receiveStock);
  const allSuppliers = useSupplierStore((s) => s.suppliers);
  const fetchSuppliers = useSupplierStore((s) => s.fetchSuppliers);
  const suppliers = useMemo(
    () => allSuppliers.filter((s) => s.status !== 'archived'),
    [allSuppliers],
  );
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);

  useEffect(() => {
    void fetchSuppliers();
  }, [fetchSuppliers]);

  const { register, handleSubmit, control, setValue, watch, formState: { errors, isSubmitting }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      productId: '',
      warehouseId: '',
      supplierId: '',
      paymentType: 'CASH',
      quantity: 1,
      unitCostUzs: 0,
      note: '',
    },
  });

  const productId = watch('productId');
  const selectedProduct = products.find((p) => p.id === productId);

  const onSubmit = async (data: FormData) => {
    const product = products.find((p) => p.id === data.productId);
    if (!product) return;
    const cost = data.unitCostUzs || Math.round(product.purchasePriceUzs || product.priceUzs * 0.72);
    await receiveStock({
      productId: product.id,
      quantity: data.quantity,
      costUzs: cost,
      warehouseId: data.warehouseId,
      supplierId: data.supplierId,
      paymentType: data.paymentType,
      note: data.note,
    });
    const paymentLabel = data.paymentType === 'CREDIT' ? ' (qarz yozildi)' : '';
    success(`${data.quantity} dona qabul qilindi${paymentLabel}`);
    reset({
      productId: '',
      warehouseId: data.warehouseId,
      supplierId: data.supplierId,
      paymentType: data.paymentType,
      quantity: 1,
      unitCostUzs: 0,
      note: '',
    });
  };

  return (
    <>
      <PageHeader title="Zaxira qabul qilish" subtitle="Omborga mahsulot kirimi va FIFO partiya" />
      <Card variant="outlined" sx={{ p: 3, maxWidth: 520 }}>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField select label="Mahsulot" {...register('productId')} error={!!errors.productId} helperText={errors.productId?.message}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              setValue('productId', e.target.value);
              if (p) setValue('unitCostUzs', Math.round(p.purchasePriceUzs || p.priceUzs * 0.72));
            }}
          >
            {products.filter((p) => p.status === 'active').map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </TextField>
          <TextField select label="Ombor" {...register('warehouseId')} error={!!errors.warehouseId} helperText={errors.warehouseId?.message}>
            {warehouses.map((w) => (
              <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
            ))}
          </TextField>
          <Controller
            name="supplierId"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="Firma"
                value={field.value}
                error={!!errors.supplierId}
                helperText={errors.supplierId?.message}
                onChange={(e) => {
                  if (e.target.value === OTHER_SUPPLIER) {
                    setSupplierDialogOpen(true);
                    return;
                  }
                  field.onChange(e.target.value);
                }}
              >
                {suppliers.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
                <MenuItem value={OTHER_SUPPLIER}>Boshqa…</MenuItem>
              </TextField>
            )}
          />
          <TextField select label="To'lov turi" {...register('paymentType')} error={!!errors.paymentType}>
            <MenuItem value="CASH">Naqd</MenuItem>
            <MenuItem value="CREDIT">Qarz</MenuItem>
          </TextField>
          <TextField label="Miqdor" type="number" {...register('quantity')} error={!!errors.quantity} helperText={errors.quantity?.message} />
          <TextField
            label="Birlik narxi (UZS)"
            type="number"
            {...register('unitCostUzs')}
            error={!!errors.unitCostUzs}
            helperText={errors.unitCostUzs?.message ?? (selectedProduct ? `Tavsiya: ${Math.round(selectedProduct.purchasePriceUzs)}` : undefined)}
          />
          <TextField label="Izoh" multiline rows={2} {...register('note')} />
          <Button type="submit" variant="contained" disabled={isSubmitting}>Qabul qilish</Button>
        </Box>
      </Card>

      <SupplierFormDialog
        open={supplierDialogOpen}
        onClose={() => setSupplierDialogOpen(false)}
        onCreated={(supplierId) => setValue('supplierId', supplierId)}
      />
    </>
  );
}
