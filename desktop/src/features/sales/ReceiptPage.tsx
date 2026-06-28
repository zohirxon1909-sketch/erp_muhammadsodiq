import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Divider, Paper, Typography } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { useSalesStore } from '@/stores/salesStore';
import { formatUzs, formatUsd } from '@/utils/format';
import { useNotification } from '@/components/feedback/NotificationProvider';

export function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success } = useNotification();
  const sale = useSalesStore((s) => s.getSaleById(id ?? ''));

  if (!sale) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">Chek topilmadi</Typography>
        <Button sx={{ mt: 2 }} onClick={() => navigate(-1)}>Orqaga</Button>
      </Box>
    );
  }

  const handlePrint = () => {
    window.print();
    success('Chop etish dialogi ochildi');
  };

  return (
    <Box sx={{ maxWidth: 400, mx: 'auto' }}>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, '@media print': { display: 'none' } }}>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint}>
          Chop etish
        </Button>
        <Button onClick={() => navigate(`/sales/history/${sale.id}`)}>Tafsilotlar</Button>
      </Box>

      <Paper
        id="receipt"
        sx={{
          p: 3,
          fontFamily: 'monospace',
          '@media print': { boxShadow: 'none', border: 'none' },
        }}
      >
        <Typography align="center" fontWeight={700} fontSize={18}>
          ERP SAVDO CHEKI
        </Typography>
        <Typography align="center" variant="body2" color="text.secondary">
          {sale.number}
        </Typography>
        <Typography align="center" variant="caption" display="block" sx={{ mb: 2 }}>
          {new Date(sale.createdAt).toLocaleString('uz-UZ')}
        </Typography>
        <Divider sx={{ mb: 2 }} />
        {sale.lineItems.map((l) => (
          <Box key={l.productId} sx={{ mb: 1 }}>
            <Typography variant="body2" fontWeight={600}>
              {l.productName}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption">
                {l.quantity} x {formatUzs(l.unitPriceUzs)}
              </Typography>
              <Typography variant="caption">{formatUzs(l.totalUzs)}</Typography>
            </Box>
          </Box>
        ))}
        <Divider sx={{ my: 2 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography fontWeight={700}>JAMI</Typography>
          <Typography fontWeight={700}>{formatUzs(sale.totalUzs)}</Typography>
        </Box>
        <Typography variant="caption" align="right" display="block">
          {formatUsd(sale.totalUsd)}
        </Typography>
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption">Mijoz: {sale.customerName}</Typography>
        <Typography variant="caption" display="block">
          Kassir: {sale.cashier}
        </Typography>
        <Typography variant="caption" display="block" align="center" sx={{ mt: 2 }}>
          Xaridingiz uchun rahmat!
        </Typography>
      </Paper>
    </Box>
  );
}
