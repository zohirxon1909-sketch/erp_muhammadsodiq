# Phase — Analytics Backend Module

**Module:** Analytics (KPI, charts, domain analytics, top lists)  
**Status:** COMPLETE  
**Date:** 2026-06-26

---

## Overview

Production-grade Analytics backend with Redis caching, optimized aggregation SQL, company isolation, RBAC, audit logging, and OpenAPI documentation. Frontend `AnalyticsPage` wired to live API — mocks removed.

---

## Implemented Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/analytics/overview` | `analytics.view` | KPI metrics + chart + highlights |
| GET | `/analytics/metrics` | `analytics.view` | KPI cards only |
| GET | `/analytics/dashboard/kpi` | `analytics.view` | Dashboard-style KPI aggregates |
| GET | `/analytics/sales` | `analytics.view` | Sales analytics |
| GET | `/analytics/revenue` | `analytics.view` | Revenue analytics |
| GET | `/analytics/profit` | `analytics.view` | Profit analytics (gross/net, COGS, expenses) |
| GET | `/analytics/suppliers` | `analytics.view` | Supplier analytics |
| GET | `/analytics/customers` | `analytics.view` | Customer analytics |
| GET | `/analytics/products` | `analytics.view` | Product analytics |
| GET | `/analytics/top/products` | `analytics.view` | Top selling products |
| GET | `/analytics/top/customers` | `analytics.view` | Top customers by revenue |
| GET | `/analytics/top/suppliers` | `analytics.view` | Top suppliers by receipts |
| GET | `/analytics/charts/revenue-profit` | `analytics.view` | Chart series (revenue, profit, orders) |

Swagger: `http://localhost:3000/api/docs` → **Analytics** tag

---

## Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | `daily` \| `weekly` \| `monthly` \| `yearly` \| `custom` | Default: `monthly` |
| `date_from` | ISO date | Required when `period=custom` |
| `date_to` | ISO date | Required when `period=custom` |
| `branch_id` | UUID | Optional branch filter |
| `months` | 1–24 | Chart data points (default: 6 for monthly) |
| `limit` | 1–50 | Top-list size (default: 10) |

---

## Response Shapes

### `GET /analytics/overview`

```json
{
  "metrics": [
    { "id": "am_revenue", "label": "Oylik daromad", "value": "1.2 mlrd so'm", "change": 14.2, "period": "iyun 2026" }
  ],
  "chart": [
    { "month": "Yan", "revenue": 980000000, "profit": 235000000, "orders": 2840 }
  ],
  "highlights": {
    "peakMonth": { "label": "Iyun", "revenue": 1240000000 },
    "avgCheckChange": { "percent": -2.1, "period": "iyun 2026" }
  }
}
```

Matches frontend `AnalyticsOverview` type.

### Domain endpoints (`/sales`, `/revenue`, `/profit`, etc.)

```json
{
  "period": "monthly",
  "label": "iyun 2026",
  "summary": { ... },
  "comparison": { ... }
}
```

### Top lists

```json
{
  "data": [
    { "rank": 1, "name": "...", "revenueUzs": "4500000.0000", ... }
  ]
}
```

---

## Caching (Redis)

| Period | TTL |
|--------|-----|
| daily | 60s |
| weekly | 120s |
| monthly | 300s |
| yearly | 600s |
| custom | 180s |

- Key pattern: `analytics:{companyId}:{endpoint}:{paramsHash}`
- Graceful fallback if Redis unavailable (cache miss → query DB)
- `AnalyticsCacheService.invalidateCompany()` for future cache bust on mutations

---

## Aggregation SQL

All heavy metrics use `Prisma.$queryRaw` with parameterized `company_id` filters:

| Query | Tables | Optimization |
|-------|--------|--------------|
| Sales aggregate | `sales` + `sale_items` subquery | Single pass COGS join |
| Chart buckets | `date_trunc` + GROUP BY | Limited to N buckets |
| Top products | `sale_items` → `sales` → `products` | ORDER BY revenue LIMIT |
| Top customers | `sales` → `customers` | DISTINCT customer aggregation |
| Top suppliers | `supplier_receipts` → `suppliers` | Period-scoped receipts |
| Return rate | `sale_returns` + `sales` subqueries | Parallel scalar subqueries |
| Inventory value | `inventory_batches` | `SUM(remaining_qty * unit_cost)` |

Cashiers without `sales.view_all` see only their own sales (`cashier_id` filter).

---

## Security

| Control | Implementation |
|---------|----------------|
| JWT | Global `JwtAuthGuard` |
| RBAC | `@RequirePermissions('analytics.view')` |
| Module gate | `@RequireModule('analytics')` |
| Company isolation | `CompanyIsolationGuard` + `company_id` in all SQL |
| Audit | `AuditService` on `GET /analytics/overview` |
| Sales scope | Cashier-scoped when no `sales.view_all` |

### Permissions (seeded)

- `analytics.view` — Admin, Manager

### Module

- `analytics` — enabled for all companies in seed

---

## Prisma / Migration

`prisma/migrations/20260626120000_analytics_module/migration.sql`

Indexes added:
- `sales(company_id, status, created_at DESC)`
- `sales(company_id, branch_id, created_at DESC)`
- `sale_returns(company_id, status, created_at DESC)`
- `customers(company_id, created_at DESC)`
- `supplier_receipts(company_id, created_at DESC)`
- `supplier_payments(company_id, created_at DESC)`
- `expenses(company_id, expense_date DESC)`

No new tables — analytics is computed from existing transactional data.

---

## Frontend Integration

| File | Change |
|------|--------|
| `src/api/endpoints.ts` | Analytics endpoint map |
| `src/api/services/analyticsApi.ts` | API client |
| `src/hooks/useAnalyticsData.ts` | Data hook |
| `src/features/reports/AnalyticsPage.tsx` | Live API, loading/error states |
| `src/types/entities.ts` | `AnalyticsMetric`, `AnalyticsChartPoint`, `AnalyticsOverview` |
| `src/config/permissions.ts` | `analytics.view`, `analytics` module |

Mocks no longer used by AnalyticsPage.

---

## Self Audit

| Check | Result |
|-------|--------|
| `CompanyIsolationGuard` | PASS |
| `@RequireModule('analytics')` | PASS |
| `@RequirePermissions('analytics.view')` | PASS |
| Redis caching with TTL | PASS |
| Aggregation SQL (not N+1 loops) | PASS |
| Audit on overview access | PASS |
| Cancelled sales excluded | PASS |
| Dual currency in dashboard KPI | PASS |
| Swagger Analytics tag | PASS |
| Frontend mock removed | PASS |
| Migration + indexes | PASS |

---

## Build Status

| Project | Command | Status |
|---------|---------|--------|
| Backend | `npx tsc -p tsconfig.build.json --noEmit` | PASS |
| Backend | `npm run build` | PASS |
| Desktop | `npm run build` | PASS |

---

## Deploy

```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed
npm run build
npm run start:dev
```

Ensure `REDIS_URL` is set (default: `redis://localhost:6379`). Analytics works without Redis but without cache.

---

## Files Created

```
src/modules/analytics/
├── analytics.module.ts
├── api/
│   ├── analytics.controller.ts
│   └── dto/analytics.dto.ts
└── application/
    ├── analytics.service.ts
    ├── analytics-cache.service.ts
    ├── analytics-queries.service.ts
    └── analytics-period.util.ts

prisma/migrations/20260626120000_analytics_module/migration.sql
```

## Files Modified

- `prisma/seed.ts` — `analytics` module, `analytics.view` permission
- `src/app.module.ts` — `AnalyticsModule`
- `src/main.ts` — Swagger Analytics tag, import fix
- `desktop/` — API integration (see Frontend Integration)

---

## Known Limitations / Future

1. Chart always uses monthly buckets for multi-month view (by design for AnalyticsPage)
2. Dashboard page still uses client-side aggregation — can migrate to `/analytics/dashboard/kpi`
3. No period selector UI on AnalyticsPage yet (defaults to `monthly`)
4. Cache invalidation on sale create not wired (TTL-based expiry only)
