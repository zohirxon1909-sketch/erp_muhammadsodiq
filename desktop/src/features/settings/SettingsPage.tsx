import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, StatusChip, type Column } from '@/components/common/DataTable';
import { useAuthStore } from '@/stores/authStore';
import { inventoryApi } from '@/api/services/domainApi';
import { useAppTheme } from '@/theme/ThemeProvider';

const branchColumns: Column<any>[] = [
  { id: 'name', label: 'Filial nomi', render: (r) => r.name },
  { id: 'code', label: 'Filial kodi', render: (r) => r.code || '—' },
  {
    id: 'status',
    label: 'Holat',
    render: (r) => (
      <StatusChip
        label={r.status === 'ACTIVE' ? 'Faol' : 'Nofaol'}
        color={r.status === 'ACTIVE' ? 'success' : 'default'}
      />
    ),
  },
];

export function SettingsPage() {
  const [tab, setTab] = useState(0);
  const { activeCompany } = useAuthStore();
  const { resolvedMode, setMode } = useAppTheme();
  const [notifications, setNotifications] = useState(true);

  const [branches, setBranches] = useState<any[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const [companyDetails, setCompanyDetails] = useState({
    name: '',
    tin: '—',
    address: 'O\'zbekiston, Toshkent sh.',
    phone: '+998 (--) --- -- --',
    email: 'info@erp.uz',
    defaultCurrency: 'both',
  });

  useEffect(() => {
    if (activeCompany) {
      setCompanyDetails((prev) => ({
        ...prev,
        name: activeCompany.name,
      }));
    }
  }, [activeCompany]);

  useEffect(() => {
    if (tab === 2) {
      setLoadingBranches(true);
      setBranchError(null);
      inventoryApi
        .listBranches()
        .then((data) => {
          setBranches(data);
        })
        .catch((err) => {
          setBranchError((err as { message?: string }).message ?? 'Filiallarni yuklashda xatolik yuz berdi');
        })
        .finally(() => {
          setLoadingBranches(false);
        });
    }
  }, [tab]);

  return (
    <>
      <PageHeader title="Sozlamalar" subtitle="Kompaniya, afzalliklar va filiallar" />

      <Card variant="outlined" sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label="Kompaniya" />
          <Tab label="Afzalliklar" />
          <Tab label="Filiallar" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {tab === 0 && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Kompaniya nomi"
                  value={companyDetails.name}
                  disabled
                  helperText="Kompaniya nomini o'zgartirish faqat tizim administratori orqali amalga oshiriladi"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="STIR (TIN)"
                  value={companyDetails.tin}
                  disabled
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Manzil"
                  value={companyDetails.address}
                  disabled
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Telefon"
                  value={companyDetails.phone}
                  disabled
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Email"
                  value={companyDetails.email}
                  disabled
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth disabled>
                  <InputLabel>Asosiy valyuta</InputLabel>
                  <Select
                    value={companyDetails.defaultCurrency}
                    label="Asosiy valyuta"
                    readOnly
                  >
                    <MenuItem value="UZS">Faqat UZS</MenuItem>
                    <MenuItem value="USD">Faqat USD</MenuItem>
                    <MenuItem value="both">UZS va USD (Ikkala valyuta)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Vaqt mintaqasi" value="Asia/Tashkent" disabled />
              </Grid>
            </Grid>
          )}

          {tab === 1 && (
            <Box sx={{ maxWidth: 480 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={resolvedMode === 'dark'}
                    onChange={(e) => setMode(e.target.checked ? 'dark' : 'light')}
                  />
                }
                label="Qorong'u mavzu (Tungi rejim)"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: 4 }}>
                Interfeys rang sxemasini o&apos;zgartirish
              </Typography>
              <FormControlLabel
                control={<Switch checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />}
                label="Bildirishnomalar"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: 4 }}>
                Past qoldiq va to&apos;lovlar haqida xabarlar
              </Typography>
              <FormControlLabel control={<Switch defaultChecked disabled />} label="Avtomatik zaxira nusxa" />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                Har kecha soat 02:00 da zaxira nusxa olish (Tizim tomonidan avtomatlashtirilgan)
              </Typography>
            </Box>
          )}

          {tab === 2 && (
            <>
              {loadingBranches ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : branchError ? (
                <Typography color="error">{branchError}</Typography>
              ) : (
                <DataTable columns={branchColumns} rows={branches} rowKey={(r) => r.id} dense />
              )}
            </>
          )}
        </Box>
      </Card>
    </>
  );
}
