# Phase — Debt Aging Backend Module

**Module:** Debt Aging (Customer + Supplier)  
**Status:** COMPLETE  
**Date:** 2026-06-26

---

## Overview

Production-grade Debt Aging backend with customer and supplier aging, standard buckets (0–30, 31–60, 61–90, 91–120, 120+), summary, filters, export, audit logging, RBAC, company isolation, migration indexes, seed permissions, and Swagger documentation.

Age is calculated from the **oldest unpaid credit** (`sale_credit` for customers, `receipt_credit` for suppliers) in debt history, not from `lastPaymentAt`.

---

## Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/debt/aging` | `debt.aging` | Customer bucket summary (+ supplier buckets) — backward compatible with dashboard |
| GET | `/debt/aging/summary` | `debt.aging` | Combined customer + supplier summary |
| GET | `/debt/aging/customers` | `debt.aging` | Paginated customer aging rows |
| GET | `/debt/aging/suppliers` | `debt.aging` | Paginated supplier aging rows |
| GET | `/debt/aging/report` | `debt.aging` | Full report: summary + buckets + paginated rows |
| POST | `/debt/aging/export` | `debt.aging.export` | Export CSV / XLSX / PDF (audit logged) |

Swagger UI: `http://localhost:3000/api/docs` (tag: **Debt Aging**)

---

## Aging Buckets

| Bucket | Days |
|--------|------|
| `0-30` | 0 – 30 |
| `31-60` | 31 – 60 |
| `61-90` | 61 – 90 |
| `91-120` | 91 – 120 |
| `120+` | 121+ |

Shared logic: `src/modules/debt/application/debt-aging.util.ts`  
Also used by `debt` report template `aging` in Reports module.

---

## Query Filters

| Param | Type | Description |
|-------|------|-------------|
| `entityType` | `customer` \| `supplier` \| `all` | Report scope (default `all`) |
| `bucket` | bucket label | Filter by aging bucket |
| `q` | string | Search name / phone |
| `customerId` | UUID | Single customer |
| `supplierId` | UUID | Single supplier |
| `asOf` | ISO date | Aging reference date (default today) |
| `page` / `limit` | number | Pagination |

---

## Files

| Path | Role |
|------|------|
| `src/modules/debt/application/debt-aging.util.ts` | Bucket definitions and helpers |
| `src/modules/debt/application/debt-aging.service.ts` | Core aging logic, export, audit |
| `src/modules/debt/api/debt-aging.controller.ts` | REST API + Swagger |
| `src/modules/debt/api/dto/debt-aging.dto.ts` | DTOs |
| `src/modules/reports/application/providers/debt-report.provider.ts` | Aligned report `aging` template |

---

## Database

### Migration

`prisma/migrations/20260626200000_debt_aging_module/migration.sql`

- Index `debt_history(company_id, type, created_at)` — customer aging queries
- Index `supplier_debt_history(company_id, type, created_at)` — supplier aging queries

No new tables; aging is computed at runtime from `customers`, `suppliers`, `debt_history`, `supplier_debt_history`.

---

## Security

| Control | Implementation |
|---------|----------------|
| Authentication | JWT Bearer |
| Company isolation | `CompanyIsolationGuard` |
| RBAC | `debt.aging`, `debt.aging.export` |
| Module gate | `@RequireModule('debt')` |
| Audit | Export actions → `audit_log` (`entityType: debt_aging`, `action: EXPORT`) |

### Permissions (seed)

| Code | Description |
|------|-------------|
| `debt.aging` | View aging reports |
| `debt.aging.export` | Export aging reports |

`Cashier` role includes `debt.aging` (view only). `Admin` / `Manager` have full access including export.

### Demo seed data

Seed creates 5 customers and 3 suppliers with `sale_credit` / `receipt_credit` history spanning all aging buckets (15–150 days). Idempotent marker: customer phone `+998901000001`.

---

## Export

`POST /debt/aging/export` body:

```json
{
  "format": "CSV",
  "entityType": "all",
  "bucket": "61-90",
  "q": "Karim"
}
```

Formats: `CSV`, `XLSX`, `PDF` (`ReportExportFormat` enum).

---

## Backward Compatibility

`GET /debt/aging` response shape preserved for dashboard:

```json
{
  "asOf": "2026-06-26T...",
  "buckets": [
    { "label": "0-30", "debtUzs": "...", "debtUsd": "...", "customerCount": 3 }
  ],
  "suppliers": [
    { "label": "0-30", "debtUzs": "...", "entityCount": 1 }
  ]
}
```

Buckets updated from legacy `90+` to `91-120` + `120+`.

---

## Build & Verify

```powershell
cd d:\erp\backend
d:\erp\.tools\node-v22.12.0-win-x64\node.exe node_modules\@nestjs\cli\bin\nest.js build
```

Apply migration:

```powershell
npx prisma migrate deploy
npx prisma db seed
```

---

## Test Plan

- [ ] `GET /debt/aging` — 5 customer buckets + supplier summary
- [ ] `GET /debt/aging/customers?bucket=61-90` — filtered rows
- [ ] `GET /debt/aging/suppliers` — supplier rows with UZS debt
- [ ] `GET /debt/aging/summary` — combined totals
- [ ] `GET /debt/aging/report?entityType=all&page=1&limit=20`
- [ ] `POST /debt/aging/export` — file download + audit log entry
- [ ] User without `debt.aging` → 403
- [ ] Reports `debt/aging` template uses same bucket labels
- [ ] Dashboard KPI overdue calculation still works
