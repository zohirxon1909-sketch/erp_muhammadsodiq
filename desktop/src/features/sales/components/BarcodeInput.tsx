import { useEffect, useRef } from 'react';
import { TextField, InputAdornment } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';

interface BarcodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onScan: (barcode: string) => void;
  autoFocus?: boolean;
}

export function BarcodeInput({ value, onChange, onScan, autoFocus }: BarcodeInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault();
      onScan(value.trim());
      onChange('');
    }
  };

  return (
    <TextField
      inputRef={ref}
      fullWidth
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="Shtrix-kodni skanerlang yoki kiriting…"
      sx={{ '& .MuiOutlinedInput-root': { height: 56 } }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <QrCodeScannerIcon color="primary" />
          </InputAdornment>
        ),
      }}
      aria-label="Shtrix-kod"
    />
  );
}
