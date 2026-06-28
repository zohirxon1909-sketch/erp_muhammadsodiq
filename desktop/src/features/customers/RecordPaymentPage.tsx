import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Card, MenuItem, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { useCustomerStore } from '@/stores/customerStore';
import { useCurrencyStore } from '@/stores/currencyStore';
import { useAuthStore } from '@/stores/authStore';
import { useNotification } from '@/components/feedback/NotificationProvider';
import { formatUzs } from '@/utils/format';

const schema = z.object({
  amountUzs: z.coerce.number().min(1000, 'Minimal 1 000 so\'m'),
  method: z.enum(['cash', 'card', 'transfer']),
  note: z.string().optional(),
});

export function RecordPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: notifyError } = useNotification();
  const customer = useCustomerStore((s) => s.getCustomerById(id ?? ''));
  const user = useAuthStore((s) => s.user);
  const activeRate = useCurrencyStore((s) => s.rates.find((r) => r.status === 'active')?.rate ?? 12_620);

  const { register, handleSubmit, formState: { errors, isSubmitting }, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { amountUzs: customer?.debtUzs ?? 0, method: 'cash' as const, note: '' },
  });

  const amount = watch('amountUzs');

  if (!customer) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">Mijoz topilmadi</Typography>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/customers')}>Orqaga</Button>
      </Box>
    );
  }

  const onSubmit = async (data: z.infer<typeof schema>) => {
    if (data.amountUzs > customer.debtUzs) {
      notifyError('To\'lov miqdori qarzdan oshmasligi kerak');
      return;
    }
    try {
      const recordedBy = user ? `${user.firstName} ${user.lastName}`.trim() : 'Kassir';
      await useCustomerStore.getState().recordPayment(customer.id, {
        amountUzs: data.amountUzs,
        method: data.method,
        note: data.note,
        recordedBy,
      });
      success('To\'lov qayd etildi');
      navigate(`/customers/${customer.id}`);
    } catch {
      notifyError('To\'lovni saqlashda xatolik');
    }
  };

  return (
    <>
      <PageHeader title="To'lov qabul qilish" subtitle={customer.name} />
      <Card variant="outlined" sx={{ p: 3, maxWidth: 480 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Joriy qarz: {formatUzs(customer.debtUzs)}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Kurs: 1 USD = {activeRate.toLocaleString()} so&apos;m
        </Typography>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Summa (UZS)"
            type="number"
            {...register('amountUzs')}
            error={!!errors.amountUzs}
            helperText={errors.amountUzs?.message ?? (amount > customer.debtUzs ? 'Qarzdan oshib ketdi' : undefined)}
          />
          <TextField select label="To'lov usuli" {...register('method')}>
            <MenuItem value="cash">Naqd</MenuItem>
            <MenuItem value="card">Karta</MenuItem>
            <MenuItem value="transfer">O&apos;tkazma</MenuItem>
          </TextField>
          <TextField label="Izoh" multiline rows={2} {...register('note')} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={() => navigate(-1)}>Bekor qilish</Button>
            <Button type="submit" variant="contained" disabled={isSubmitting || customer.debtUzs === 0}>
              Saqlash
            </Button>
          </Box>
        </Box>
      </Card>
    </>
  );
}
