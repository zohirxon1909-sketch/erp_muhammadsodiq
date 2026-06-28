import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Chip,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';

export interface Column<T> {
  id: string;
  label: string;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
  onRowClick?: (row: T) => void;
  selectedIds?: string[];
  dense?: boolean;
  stickyHeader?: boolean;
  maxHeight?: number | string;
}

function DataTableRowInner<T>({
  row,
  id,
  columns,
  selected,
  onRowClick,
}: {
  row: T;
  id: string;
  columns: Column<T>[];
  selected?: boolean;
  onRowClick?: (row: T) => void;
}) {
  return (
    <TableRow
      hover
      selected={selected}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
    >
      {columns.map((col) => (
        <TableCell key={col.id} align={col.align}>
          {col.render(row)}
        </TableCell>
      ))}
    </TableRow>
  );
}

const DataTableRow = memo(DataTableRowInner) as typeof DataTableRowInner;

function DataTableInner<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyMessage = "Ma'lumot topilmadi",
  page = 0,
  pageSize = 20,
  total,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder = 'asc',
  onSort,
  onRowClick,
  selectedIds,
  dense,
  stickyHeader = false,
  maxHeight = 640,
}: DataTableProps<T>) {
  const showPagination = onPageChange !== undefined;
  const totalCount = total ?? rows.length;
  const onRowClickRef = useRef(onRowClick);
  onRowClickRef.current = onRowClick;

  const stableOnRowClick = useCallback((row: T) => {
    onRowClickRef.current?.(row);
  }, []);

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height={40} sx={{ mb: 1 }} />
        ))}
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <TableContainer sx={stickyHeader ? { maxHeight } : undefined}>
        <Table size={dense ? 'small' : 'medium'} stickyHeader={stickyHeader}>
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align}
                  width={col.width}
                  sx={{ fontWeight: 600, bgcolor: 'background.paper' }}
                >
                  {col.sortable && onSort ? (
                    <TableSortLabel
                      active={sortBy === col.id}
                      direction={sortBy === col.id ? sortOrder : 'asc'}
                      onClick={() => onSort(col.id)}
                    >
                      {col.label}
                    </TableSortLabel>
                  ) : (
                    col.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">{emptyMessage}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const id = rowKey(row);
                return (
                  <DataTableRow
                    key={id}
                    id={id}
                    row={row}
                    columns={columns}
                    selected={selectedIds?.includes(id)}
                    onRowClick={onRowClick ? stableOnRowClick : undefined}
                  />
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {showPagination && (
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, p) => onPageChange!(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => onPageSizeChange?.(parseInt(e.target.value, 10))}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="Sahifada:"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
        />
      )}
    </Paper>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;

export function StatusChip({
  label,
  color = 'default',
}: {
  label: string;
  color?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
}) {
  return <Chip label={label} size="small" color={color} variant="outlined" />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Box sx={{ textAlign: 'center', py: 8, px: 2 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" mb={2}>
          {description}
        </Typography>
      )}
      {action}
    </Box>
  );
}
