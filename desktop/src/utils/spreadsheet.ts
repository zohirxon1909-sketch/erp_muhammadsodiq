import * as XLSX from 'xlsx';

export type ExportFormat = 'csv' | 'xlsx';

export function downloadSpreadsheet(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  format: ExportFormat,
) {
  if (format === 'csv') {
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `${filename}.csv`);
    return;
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `${filename}.xlsx`);
}

function escapeCsvCell(value: string | number): string {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const IMPORT_COLUMN_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'SKU'],
  barcode: ['barcode', 'Barcode', 'BARCODE'],
  name: ['name', 'Name', 'Nomi'],
  category: ['category', 'Category', 'Kategoriya'],
  unit: ['unit', 'Unit', "O'lchov"],
  purchasePrice: ['purchase price', 'Purchase Price', 'purchaseprice', 'Olish narxi'],
  sellingPrice: ['selling price', 'Selling Price', 'sellingprice', 'Sotish narxi'],
  stock: ['stock', 'Stock', 'Qoldiq'],
};

export interface ParsedProductImportRow {
  sku: string;
  barcode?: string;
  name: string;
  category: string;
  unit?: string;
  purchasePrice: string;
  sellingPrice: string;
  stock?: string;
}

export async function parseProductImportFile(file: ArrayBuffer, fileName?: string): Promise<ParsedProductImportRow[]> {
  const lowerName = (fileName ?? '').toLowerCase();
  const isExcel =
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    isXlsxBinary(file);

  if (isExcel) {
    return parseExcelBuffer(file);
  }

  const text = new TextDecoder('utf-8').decode(file);
  if (text.includes(',') || text.includes(';')) {
    return parseDelimitedText(text);
  }

  throw new Error('Fayl formati tanilmadi. CSV yoki Excel (.xlsx) yuklang.');
}

function isXlsxBinary(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function parseExcelBuffer(buffer: ArrayBuffer): ParsedProductImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!rows.length) return [];

  const headerMap = mapHeadersFromKeys(Object.keys(rows[0] ?? {}));
  return rows.map((row) => rowToImport(row, headerMap));
}

function mapHeadersFromKeys(keys: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of keys) {
    const trimmed = key.trim();
    for (const [canonical, aliases] of Object.entries(IMPORT_COLUMN_ALIASES)) {
      if (aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
        map.set(key, canonical);
        break;
      }
    }
  }
  return map;
}

function rowToImport(row: Record<string, unknown>, headerMap: Map<string, string>): ParsedProductImportRow {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = headerMap.get(key);
    if (canonical) mapped[canonical] = String(value ?? '').trim();
  }
  return {
    sku: mapped.sku ?? '',
    barcode: mapped.barcode || undefined,
    name: mapped.name ?? '',
    category: mapped.category ?? '',
    unit: mapped.unit || undefined,
    purchasePrice: mapped.purchasePrice ?? '',
    sellingPrice: mapped.sellingPrice ?? '',
    stock: mapped.stock || undefined,
  };
}

function parseDelimitedText(text: string): ParsedProductImportRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.trim());
  const headerMap = mapHeadersIndexed(headers);

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headerMap.forEach((canonical, idx) => {
      row[canonical] = (cells[idx] ?? '').trim();
    });
    return {
      sku: row.sku ?? '',
      barcode: row.barcode || undefined,
      name: row.name ?? '',
      category: row.category ?? '',
      unit: row.unit || undefined,
      purchasePrice: row.purchasePrice ?? '',
      sellingPrice: row.sellingPrice ?? '',
      stock: row.stock || undefined,
    };
  });
}

function mapHeadersIndexed(headers: string[]): Map<number, string> {
  const map = new Map<number, string>();
  headers.forEach((header, idx) => {
    const trimmed = header.trim();
    for (const [canonical, aliases] of Object.entries(IMPORT_COLUMN_ALIASES)) {
      if (aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
        map.set(idx, canonical);
        break;
      }
    }
  });
  return map;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export function validateImportRowsLocal(rows: ParsedProductImportRow[]) {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const errors: string[] = [];
    if (!row.sku) errors.push('SKU required');
    if (!row.name) errors.push('Name required');
    if (!row.category) errors.push('Category required');
    if (!row.purchasePrice || Number.isNaN(Number(row.purchasePrice))) errors.push('Invalid purchase price');
    if (!row.sellingPrice || Number.isNaN(Number(row.sellingPrice))) errors.push('Invalid selling price');
    if (row.stock && Number.isNaN(Number(row.stock))) errors.push('Invalid stock');
    const key = row.sku.toLowerCase();
    if (key && seen.has(key)) errors.push('Duplicate SKU in file');
    if (key) seen.add(key);
    return { row: index + 1, sku: row.sku, valid: errors.length === 0, errors };
  });
}
