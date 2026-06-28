import { useState } from 'react';
import {
  Box,
  Button,
  Card,
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
import { mockBranches, mockCompanySettings } from '@/mocks/data';
import type { Branch } from '@/mocks/data';
import { useAppTheme } from '@/theme/ThemeProvider';

const branchColumns: Column<Branch>[] = [
  { id: 'name', label: 'Filial nomi', render: (r) => r.name },
  { id: 'address', label: 'Manzil', render: (r) => r.address },
  { id: 'phone', label: 'Telefon', render: (r) => r.phone },
  { id: 'manager', label: 'Menejer', render: (r) => r.manager },
  {
    id: 'status',
    label: 'Holat',
    render: (r) => (
      <StatusChip
        label={r.status === 'active' ? 'Faol' : 'Nofaol'}
        color={r.status === 'active' ? 'success' : 'default'}
      />
    ),
  },
];

export function SettingsPage() {
  const [tab, setTab] = useState(0);
  const [company, setCompany] = useState(mockCompanySettings);
  const { resolvedMode, setMode } = useAppTheme();
  const [notifications, setNotifications] = useState(true);

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
                  value={company.name}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="STIR"
                  value={company.tin}
                  onChange={(e) => setCompany({ ...company, tin: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Manzil"
                  value={company.address}
                  onChange={(e) => setCompany({ ...company, address: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Telefon"
                  value={company.phone}
                  onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Email"
                  value={company.email}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Asosiy valyuta</InputLabel>
                  <Select
                    value={company.defaultCurrency}
                    label="Asosiy valyuta"
                    onChange={(e) =>
                      setCompany({ ...company, defaultCurrency: e.target.value as typeof company.defaultCurrency })
                    }
                  >
                    <MenuItem value="UZS">Faqat UZS</MenuItem>
                    <MenuItem value="USD">Faqat USD</MenuItem>
                    <MenuItem value="both">UZS va USD</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Vaqt mintaqasi" value={company.timezone} disabled />
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
                label="Qorong'u mavzu"
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
              <FormControlLabel control={<Switch defaultChecked />} label="Avtomatik zaxira nusxa" />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                Har kecha soat 02:00 da zaxira nusxa olish
              </Typography>
            </Box>
          )}

          {tab === 2 && (
            <DataTable columns={branchColumns} rows={mockBranches} rowKey={(r) => r.id} dense />
          )}
        </Box>
      </Card>
    </>
  );
}
