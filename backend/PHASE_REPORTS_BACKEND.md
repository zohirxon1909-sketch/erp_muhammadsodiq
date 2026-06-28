# Phase — Reports Backend Module

**Module:** Reports (catalog, category reports, export, jobs)  
**Status:** COMPLETE  
**Date:** 2026-06-26

---

## Overview

Production-grade Reports backend module implementing all 8 report categories with pagination, filtering, sorting, search, totals, summary, KPI, and export (PDF, Excel, CSV). Follows existing NestJS modular monolith patterns with JWT, RBAC, company isolation, and audit logging.

---

## Implemented Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/reports/catalog` | `reports.view` | Paginated report catalog |
| GET | `/reports` | `reports.view` | Alias for catalog |
| GET | `/reports/sales` | `reports.sales` | Sales reports |
| GET | `/reports/products` | `reports.sales` | Product reports |
| GET | `/reports/inventory` | `reports.inventory` | Inventory reports |
| GET | `/reports/customers` | `reports.view` | Customer reports |
| GET | `/reports/suppliers` | `reports.view` | Supplier reports |
| GET | `/reports/debt` | `reports.debt` | Debt reports |
| GET | `/reports/expenses` | `reports.financial` | Expense reports |
| GET | `/reports/profit` | `reports.financial` | Profit reports |
| GET | `/reports/cogs` | `reports.financial` | COGS / FIFO detail |
| POST | `/reports/generate` | `reports.generate` | Export PDF/XLSX/CSV |
| GET | `/reports/jobs/:id` | `reports.view` | Job status |
| GET | `/reports/jobs/:id/download` | `reports.view` | Download file |
| GET | `/reports/:id/download` | `reports.view` | Alternate download path |
| GET | `/reports/history` | `reports.view` | Recent exports |

Swagger UI: `http://localhost:3000/api/docs`

---

## Report Categories & Templates

### Sales (`reports.sales`)
| Template | Description |
|----------|-------------|
| `daily_summary` | Daily sales totals |
| `detail` | All sales in period |
| `by_product` | Revenue per product |
| `by_category` | Revenue per category |
| `by_cashier` | Cashier performance |
| `by_branch` | Branch revenue |
| `returns` | Approved returns |

### Products (`reports.sales`)
| Template | Description |
|----------|-------------|
| `turnover` | Product turnover |
| `top_selling` | Top sellers |
| `slow_moving` | Unsold products |

### Inventory (`reports.inventory`)
| Template | Description |
|----------|-------------|
| `stock_level` | Current stock |
| `valuation` | Value by category |
| `low_stock` | Below minimum |
| `movements` | Movement history |
| `batches` | Active FIFO batches |

### Customers (`reports.view`)
| Template | Description |
|----------|-------------|
| `summary` | Customer overview |
| `top_buyers` | Top purchasers |

### Suppliers (`reports.view`)
| Template | Description |
|----------|-------------|
| `summary` | Supplier overview |
| `debt_list` | Suppliers with debt |

### Debt (`reports.debt`)
| Template | Description |
|----------|-------------|
| `summary` | Debtor list |
| `aging` | Aging buckets |
| `payments` | Payment history |
| `top_debtors` | Highest balances |

### Expenses (`reports.financial`)
| Template | Description |
|----------|-------------|
| `by_category` | Expenses by category |
| `detail` | Expense line items |
| `monthly_trend` | Monthly trend |

### Profit (`reports.financial`)
| Template | Description |
|----------|-------------|
| `gross_profit` | P&L summary |
| `by_product` | Product profitability |
| `by_category` | Category profitability |
| `cogs_detail` | FIFO COGS allocations |

---

## Common Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | `daily` \| `weekly` \| `monthly` \| `yearly` \| `custom` | Date preset (default: `monthly`) |
| `date_from` | ISO date | Required when `period=custom` |
| `date_to` | ISO date | Required when `period=custom` |
| `branch_id` | UUID | Branch filter |
| `warehouse_id` | UUID | Warehouse filter |
| `currency` | `UZS` \| `USD` \| `BOTH` | Column display |
| `template` | string | Report variant |
| `page` | int | Pagination (default 1) |
| `limit` | int | Page size (default 20, max 100) |
| `sort` | string | e.g. `name:desc,totalUzs:asc` |
| `q` | string | Search filter |

---

## Response Shape (all category endpoints)

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 },
  "summary": {},
  "totals": {},
  "kpi": [{ "id": "kpi_sales", "label": "Savdolar", "value": "42" }]
}
```

Matches frontend `PaginatedResponse<T>` + extended analytics fields. Frontend contract unchanged — mock data remains until integration.

---

## Export Workflow

1. `POST /reports/generate` with `template`, `category`, `format` (PDF/XLSX/CSV)
2. Rows < 1,000 → synchronous response with `downloadUrl`
3. Rows ≥ 1,000 → async `jobId`, poll `GET /reports/jobs/:id`
4. Download via `GET /reports/jobs/:id/download`
5. Files stored in `uploads/reports/{companyId}/`, expire after 24h

---

## Prisma Changes

### New Models
- `Expense` — operational expenses for expense reports
- `ReportJob` — export job tracking and history

### New Enums
- `ReportPeriod`, `ReportExportFormat`, `ReportJobStatus`, `ExpenseCategory`

### Migration
`prisma/migrations/20260626100000_reports_module/migration.sql`

### Performance Indexes
- `expenses(company_id, expense_date DESC)`
- `expenses(company_id, category, expense_date DESC)`
- `report_jobs(company_id, user_id, created_at DESC)`
- `sales(company_id, status, created_at DESC)` — report query optimization
- `inventory_movements(company_id, type, created_at DESC)`

---

## Security

| Control | Implementation |
|---------|----------------|
| JWT | Global `JwtAuthGuard` |
| RBAC | `@RequirePermissions` per endpoint |
| Module gate | `@RequireModule('reports')` |
| Company isolation | `CompanyIsolationGuard` + `companyId` in all queries |
| Audit log | `AuditService` on report generation |
| Sales scope | Cashiers without `sales.view_all` see own sales only |

### Permissions (seeded)
- `reports.view`, `reports.generate`
- `reports.sales`, `reports.inventory`, `reports.debt`, `reports.financial`, `reports.audit`

### Roles
- **Admin/Manager:** all reports permissions
- **Cashier/Warehouse:** no reports access

---

## Dependencies Added

| Package | Purpose |
|---------|---------|
| `@nestjs/swagger` | OpenAPI documentation |
| `exceljs` | XLSX export |
| `pdfkit` | PDF export |

CSV export uses native UTF-8 BOM encoding.

---

## Self Audit

| Check | Result |
|-------|--------|
| `CompanyIsolationGuard` on controller | PASS |
| `@RequireModule('reports')` | PASS |
| `@RequirePermissions` per endpoint | PASS |
| `AuditService` on generate | PASS |
| Prisma migration + indexes | PASS |
| Company-scoped queries | PASS |
| Cancelled sales excluded from revenue | PASS |
| Dual currency (UZS/USD separate) | PASS |
| Pagination meta format | PASS |
| Swagger at `/api/docs` | PASS |
| Frontend contract unchanged | PASS |

---

## Build & Deploy

```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
npm run prisma:seed   # optional: permissions + sample expenses
```

| Test | Status |
|------|--------|
| `npx tsc -p tsconfig.build.json --noEmit` | PASS |
| `npm run build` | PASS |

---

## Files Created

```
src/modules/reports/
├── reports.module.ts
├── api/
│   ├── reports.controller.ts
│   └── dto/reports.dto.ts
└── application/
    ├── reports.service.ts
    ├── report-export.service.ts
    ├── report-catalog.ts
    ├── report-period.util.ts
    ├── report.types.ts
    ├── export/report-exporter.ts
    └── providers/
        ├── report-query.helpers.ts
        ├── sales-report.provider.ts
        ├── product-report.provider.ts
        ├── inventory-report.provider.ts
        ├── customer-report.provider.ts
        ├── supplier-report.provider.ts
        ├── debt-report.provider.ts
        ├── expense-report.provider.ts
        └── profit-report.provider.ts

prisma/migrations/20260626100000_reports_module/migration.sql
```

## Files Modified

- `prisma/schema.prisma` — Expense, ReportJob models
- `prisma/seed.ts` — reports module, permissions, sample expenses
- `src/app.module.ts` — ReportsModule import
- `src/main.ts` — Swagger setup
- `package.json` — swagger, exceljs, pdfkit

---

## Known Limitations / Future

1. Debt aging uses per-customer last credit lookup — consider materialized view for large datasets
2. Scheduled reports (Phase 2) — not implemented
3. `reports.audit` permission defined but audit log export template pending
4. Background job queue (Bull) — exports run inline; async flag based on row count threshold only

---

## Frontend Integration (when ready)

Wire `reportsApi.ts` to these endpoints without changing response shapes. Catalog maps directly to `ReportItem`. Category endpoints extend `PaginatedResponse` with `summary`, `totals`, `kpi`.
