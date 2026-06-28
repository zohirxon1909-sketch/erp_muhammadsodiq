import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Typography,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { formatUzs } from '@/utils/format';
import type { CartLine } from '@/types/sales';

interface BelowCostConfirmDialogProps {
  open: boolean;
  lines: CartLine[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function BelowCostConfirmDialog({
  open,
  lines,
  onConfirm,
  onCancel,
}: BelowCostConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: 'warning.main', fontWeight: 700 }}>
        Olish narxidan arzonroq sotilyapti!
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2, fontWeight: 500 }}>
          Quyidagi mahsulotlar olish narxidan arzon narxda sotilmoqda. Davom etasizmi?
        </Typography>
        <List dense>
          {lines.map((line) => (
            <ListItem key={`${line.product.id}-${line.saleUnit}`} disablePadding>
              <ListItemText
                primary={line.product.name}
                secondary={`Sotuv: ${formatUzs(line.unitPriceUzs)} · Olish narxi: ${formatUzs(line.product.purchasePriceUzs)}`}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} variant="outlined">
          Yo&apos;q, orqaga
        </Button>
        <Button variant="contained" color="warning" onClick={onConfirm}>
          Ha, sotilsin
        </Button>
      </DialogActions>
    </Dialog>
  );
}
