import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
  Box,
  Alert,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { PaymentMethod } from '@/types/sales';
import { formatUzs, formatUsd } from '@/utils/format';
import { calcChange } from '@/stores/posCartStore';

interface PaymentDialogProps {
  open: boolean;
  totalUzs: number;
  totalUsd: number;
  currency: 'UZS' | 'USD';
  hasCustomer: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (data: {
    method: PaymentMethod;
    receivedUzs: number;
    receivedUsd?: number;
    creditAmountUzs: number;
  }) => void;
}

export function PaymentDialog({
  open,
  totalUzs,
  totalUsd,
  currency,
  hasCustomer,
  loading,
  onClose,
  onConfirm,
}: PaymentDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [received, setReceived] = useState('');
  const [credit, setCredit] = useState('');

  const isUsdCash = currency === 'USD' && method === 'cash';
  const isUsdCredit = currency === 'USD' && method === 'credit';
  const payTotal = isUsdCash ? totalUsd : totalUzs;

  const receivedNum = parseFloat(received.replace(/\s/g, '').replace(',', '.')) || 0;
  const creditNum = parseFloat(credit.replace(/\s/g, '')) || 0;
  const change = method === 'cash' ? calcChange(receivedNum, payTotal) : 0;

  const mixedCreditAuto = Math.max(0, totalUzs - receivedNum);
  const effectiveCredit = method === 'mixed' ? (creditNum > 0 ? creditNum : mixedCreditAuto) : 0;

  const validationError = useMemo(() => {
    if (method === 'credit' && !hasCustomer) {
      return 'Nasiyaga sotish uchun mijoz tanlang.';
    }
    if (method === 'mixed' && !hasCustomer) {
      return 'Aralash to\'lov uchun mijoz tanlang.';
    }
    if (method === 'cash') {
      if (isUsdCash) {
        if (receivedNum + 0.001 < totalUsd) {
          return `Naqd to'lov yetarli emas. Kamida $${totalUsd.toFixed(2)} kerak.`;
        }
      } else if (receivedNum < totalUzs) {
        return `Naqd to'lov yetarli emas. Kamida ${formatUzs(totalUzs)} kerak.`;
      }
    }
    if (method === 'mixed') {
      if (receivedNum <= 0) {
        return 'Naqd qism 0 dan katta bo\'lishi kerak.';
      }
      if (receivedNum >= totalUzs) {
        return 'Aralash to\'lovda naqd qism jami summadan kam bo\'lishi kerak.';
      }
      const creditPart = creditNum > 0 ? creditNum : mixedCreditAuto;
      if (Math.abs(receivedNum + creditPart - totalUzs) > 1) {
        return `Naqd + nasiya jami ${formatUzs(totalUzs)} ga teng bo\'lishi kerak.`;
      }
    }
    return null;
  }, [method, hasCustomer, receivedNum, creditNum, totalUzs, totalUsd, isUsdCash, mixedCreditAuto]);

  useEffect(() => {
    if (!open) return;
    setMethod('cash');
    if (currency === 'USD') {
      setReceived(totalUsd.toFixed(2));
    } else {
      setReceived(String(Math.ceil(totalUzs)));
    }
    setCredit('0');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat ochilishda
  }, [open]);

  useEffect(() => {
    if (method === 'mixed' && open) {
      const next = String(Math.max(0, Math.round(totalUzs - receivedNum)));
      setCredit((prev) => (prev === next ? prev : next));
    }
  }, [method, receivedNum, totalUzs, open]);

  const handleConfirm = () => {
    if (validationError) return;
    const receivedUzs =
      method === 'cash' && isUsdCash ? 0 : method === 'credit' ? 0 : Math.round(receivedNum);
    const receivedUsd =
      method === 'cash' && isUsdCash ? receivedNum : undefined;

    onConfirm({
      method,
      receivedUzs,
      receivedUsd,
      creditAmountUzs:
        method === 'credit' ? totalUzs : method === 'mixed' ? effectiveCredit : 0,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>To&apos;lov</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Jami to&apos;lov
          </Typography>
          <Typography variant="h5" fontWeight={700}>
            {currency === 'UZS' ? formatUzs(totalUzs) : formatUsd(totalUsd)}
          </Typography>
          {currency === 'USD' && (
            <Typography variant="caption" color="text.secondary">
              ({formatUzs(totalUzs)} ekvivalent)
            </Typography>
          )}
        </Box>

        <FormControl sx={{ mb: 2 }}>
          <FormLabel>To&apos;lov turi</FormLabel>
          <RadioGroup
            row
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            <FormControlLabel value="cash" control={<Radio />} label="Naqd" />
            <FormControlLabel
              value="credit"
              control={<Radio />}
              label="Nasiya (qarz)"
              disabled={!hasCustomer}
            />
            <FormControlLabel
              value="mixed"
              control={<Radio />}
              label="Aralash"
              disabled={!hasCustomer}
            />
          </RadioGroup>
        </FormControl>

        {currency === 'USD' && method === 'mixed' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Aralash to&apos;lov UZS da hisoblanadi (naqd + nasiya = {formatUzs(totalUzs)}).
          </Alert>
        )}

        {!hasCustomer && (method === 'credit' || method === 'mixed') && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Nasiyaga sotish uchun mijoz tanlang.
          </Alert>
        )}

        {validationError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {validationError}
          </Alert>
        )}

        {method === 'cash' && (
          <>
            <TextField
              fullWidth
              label={isUsdCash ? 'Qabul qilingan summa (USD)' : 'Qabul qilingan summa (UZS)'}
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              sx={{ mb: 1 }}
              inputProps={isUsdCash ? { step: '0.01', min: 0 } : { step: 1, min: 0 }}
            />
            {change > 0 && (
              <Typography variant="body2" color="success.main">
                Qaytim: {isUsdCash ? formatUsd(change) : formatUzs(change)}
              </Typography>
            )}
          </>
        )}

        {method === 'credit' && hasCustomer && (
          <Alert severity="info">
            Butun summa ({isUsdCredit ? formatUsd(totalUsd) : formatUzs(totalUzs)}) mijoz qarziga yoziladi.
          </Alert>
        )}

        {method === 'mixed' && (
          <>
            <TextField
              fullWidth
              label="Naqd qism (UZS)"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Nasiya qismi (UZS)"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              helperText={`Qolgan: ${formatUzs(mixedCreditAuto)}`}
            />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Bekor qilish
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={loading || Boolean(validationError)}
        >
          {loading ? 'Jarayonda…' : 'Tasdiqlash'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

