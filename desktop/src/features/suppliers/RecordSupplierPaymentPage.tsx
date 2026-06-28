import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Card, MenuItem, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { useSupplierStore } from '@/stores/supplierStore';
import { useNotification } from '@/components/feedback/NotificationProvider';
import { formatUzs } from '@/utils/format';

const schema = z.object({
  amountUzs: z.coerce.number().min(1000, "Minimal 1 000 so'm"),
  method: z.enum(['cash', 'card', 'transfer']),
  note: z.string().optional(),
});

export function RecordSupplierPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: notifyError } = useNotification();
  const supplier = useSupplierStore((s) =>
    id ? s.suppliers.find((su) => su.id === id) : undefined,
  );
  const isLoading = useSupplierStore((s) => s.isLoading);
  const fetchSuppliers = useSupplierStore((s) => s.fetchSuppliers);
  const recordPayment = useSupplierStore((s) => s.recordPayment);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting }, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { amountUzs: 0, method: 'cash' as const, note: '' },
  });

  const amount = watch('amountUzs');

  useEffect(() => {
    if (id) void fetchSuppliers();
  }, [id, fetchSuppliers]);

  useEffect(() => {
    if (supplier) {
      reset({
        amountUzs: supplier.remainingDebtUzs,
        method: 'cash',
        note: '',
      });
    }
  }, [supplier, reset]);

  if (isLoading && !supplier) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">Yuklanmoqda…</Typography>
      </Box>
    );
  }

  if (!supplier) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">Firma topilmadi</Typography>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/suppliers')}>Orqaga</Button>
      </Box>
    );
  }

  const onSubmit = async (data: z.infer<typeof schema>) => {
    if (data.amountUzs > supplier.remainingDebtUzs) {
      notifyError("To'lov miqdori qarzdan oshmasligi kerak");
      return;
    }
    try {
      await recordPayment(supplier.id, {
        amountUzs: data.amountUzs,
        method: data.method,
        note: data.note,
      });
      success("To'lov qayd etildi");
      navigate(`/suppliers/${supplier.id}`);
    } catch {
      notifyError("To'lovni saqlashda xatolik");
    }
  };

  return (
    <>
      <PageHeader title="Firma to'lovi" subtitle={supplier.name} />
      <Card variant="outlined" sx={{ p: 3, maxWidth: 480 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Qoldiq qarz: {formatUzs(supplier.remainingDebtUzs)}
        </Typography>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <TextField
            label="Summa (UZS)"
            type="number"
            {...register('amountUzs')}
            error={!!errors.amountUzs}
            helperText={errors.amountUzs?.message}
          />
          <TextField select label="To'lov turi" {...register('method')}>
            <MenuItem value="cash">Naqd</MenuItem>
            <MenuItem value="card">Karta</MenuItem>
            <MenuItem value="transfer">O&apos;tkazma</MenuItem>
          </TextField>
          <TextField label="Izoh" multiline rows={2} {...register('note')} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={() => navigate(-1)}>Bekor</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting || supplier.remainingDebtUzs === 0 || amount > supplier.remainingDebtUzs}>
              Saqlash
            </Button>
          </Box>
        </Box>
      </Card>
    </>
  );
}
