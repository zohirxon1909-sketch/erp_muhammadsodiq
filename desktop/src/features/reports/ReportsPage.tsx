import { useCallback, useMemo, useState } from 'react';
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { PageHeader } from '@/components/common/PageHeader';
import { FilterBar } from '@/components/common/FilterBar';
import { DataTable, type Column } from '@/components/common/DataTable';
import { useListState } from '@/hooks/useListState';
import { mockReports } from '@/mocks/data';
import { useNotification } from '@/components/feedback/NotificationProvider';
import type { ReportItem } from '@/types/entities';

const categories = [...new Set(mockReports.map((r) => r.category))];

function formatDateTime(iso?: string) {
  if (!iso) return 'Hali yaratilmagan';
  return new Date(iso).toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' });
}

export function ReportsPage() {
  const { info } = useNotification();
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filtered = useMemo(
    () =>
      categoryFilter === 'all'
        ? mockReports
        : mockReports.filter((r) => r.category === categoryFilter),
    [categoryFilter],
  );

  const searchFields = useCallback(
    (r: ReportItem) => [r.name, r.category, r.description],
    [],
  );

  const { search, setSearch, page, setPage, pageSize, setPageSize, sortBy, sortOrder, handleSort, paginated, total } =
    useListState(filtered, searchFields);

  const columns: Column<ReportItem>[] = useMemo(
    () => [
      { id: 'name', label: 'Hisobot nomi', sortable: true, render: (r) => r.name },
      { id: 'category', label: 'Kategoriya', sortable: true, render: (r) => r.category },
      { id: 'description', label: 'Tavsif', render: (r) => r.description },
      {
        id: 'lastGenerated',
        label: 'Oxirgi yaratilgan',
        sortable: true,
        render: (r) => formatDateTime(r.lastGenerated),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Hisobotlar"
        subtitle="Savdo, moliya va ombor hisobotlari"
        primaryAction={{
          label: 'Hisobot yaratish',
          onClick: () => info('Hisobot yaratish keyingi versiyada qo\'shiladi'),
        }}
      />

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: 'Hisobot nomi…' }}
        filters={
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Kategoriya</InputLabel>
            <Select value={categoryFilter} label="Kategoriya" onChange={(e) => setCategoryFilter(e.target.value)}>
              <MenuItem value="all">Barchasi</MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {cat}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        }
      />

      <DataTable
        columns={columns}
        rows={paginated}
        rowKey={(r) => r.id}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
      />
    </>
  );
}
