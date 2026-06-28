# Backend Architecture

**Version:** 1.0.0  
**Status:** Approved for implementation  
**Date:** 2026-06-18  
**Stack:** Node.js 20 LTS · NestJS 10+ · PostgreSQL 16 · Redis 7 · Prisma  
**API contract:** [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md) (frozen v1.0.0)

---

## 1. Purpose

This document defines the backend system architecture for ERP Phase 1. It describes **how** the server is structured to implement the frozen REST API and signed-off business rules (FIFO, currency freeze, debt consistency, inventory invariants).

**Out of scope:** Source code, Dockerfiles, infrastructure-as-code, FastAPI, or any non-NestJS stack.

---

## 2. Architectural style

### 2.1 Modular monolith

Single deployable API service with **bounded modules** inside one process and one PostgreSQL database.

| Choice | Rationale |
|--------|-----------|
| Modular monolith | ACID transactions across sale + FIFO + debt; simpler ops than microservices |
| Clean Architecture per module | Testable domain logic; API layer stays thin |
| Event bus (in-process) | Decouple modules without cross-module SQL |
| Future extraction | Any module can become a service later via declared boundaries |

### 2.2 System context

```
┌─────────────────┐     HTTPS/WSS      ┌──────────────────────────────┐
│ Desktop Client  │◄──────────────────►│  ERP API (NestJS monolith)   │
│ (Electron/React)│                    │  /api/v1/*                   │
└─────────────────┘                    └───────────┬──────────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
              ┌─────▼─────┐              ┌───────▼───────┐           ┌───────▼───────┐
              │ PostgreSQL │              │    Redis      │           │  Object store │
              │ (primary)  │              │ cache/sessions│           │ (reports/backup)│
              └───────────┘              └───────────────┘           └───────────────┘
```

---

## 3. Repository layout (planned)

```
backend/
├── prisma/
│   ├── schema.prisma          # Generated from DATABASE_SCHEMA_FINAL
│   ├── migrations/            # Versioned SQL (see MIGRATION_PLAN.md)
│   └── seed.ts
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── core/                  # Shared kernel
│   │   ├── database/
│   │   ├── events/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── filters/           # ErrorResponse mapping
│   │   └── value-objects/     # Money, Currency, Quantity
│   ├── modules/
│   │   ├── auth/
│   │   ├── company/
│   │   ├── products/
│   │   ├── inventory/
│   │   ├── fifo/              # Domain service used by sales/inventory
│   │   ├── currency/
│   │   ├── customers/
│   │   ├── sales/
│   │   ├── debt/
│   │   ├── admin/
│   │   ├── audit/
│   │   └── notifications/
│   └── websocket/
└── test/
```

Each feature module follows the same internal layers (see §4).

---

## 4. Module internal structure

```
src/modules/{name}/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── repositories/          # Interfaces only
│   └── events/
├── application/
│   ├── use-cases/             # One class per command/query
│   ├── services/
│   └── mappers/               # Entity ↔ API DTO
├── infrastructure/
│   ├── repositories/          # Prisma implementations
│   └── persistence/
├── api/
│   ├── controllers/
│   ├── dto/                   # class-validator; mirrors OpenAPI
│   └── guards/                # Module + permission guards
└── {name}.module.ts
```

### Layer rules

| Layer | May depend on | Must not |
|-------|---------------|----------|
| Domain | Nothing external | Import NestJS, Prisma, HTTP |
| Application | Domain | Call HTTP or raw Prisma in use-cases (via repo interfaces) |
| Infrastructure | Domain, Application | Expose Prisma types to API |
| API | Application DTOs | Contain business rules |

---

## 5. Module registry and dependencies

Phase 1 modules aligned with [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md):

| Module | API prefix | Depends on | Publishes events |
|--------|------------|------------|------------------|
| **core** | — | — | — |
| **auth** | `/auth/*` | core | `user.logged_in`, `session.revoked` |
| **company** | `/auth/switch-company` | auth | `company.switched` |
| **currency** | `/currency/*` | company | `currency.rate_updated` |
| **products** | `/products/*`, `/categories/*`, `/pos/products` | company, currency | `product.created`, `product.updated` |
| **inventory** | `/inventory/*`, `/warehouses/*` | products | `inventory.stock_changed`, `inventory.batch_created` |
| **fifo** | (internal) | inventory | — |
| **customers** | `/customers/*` | company | `customer.updated` |
| **sales** | `/sales/*` | products, inventory, fifo, currency, customers | `sale.completed`, `sale.voided`, `sale.returned` |
| **debt** | `/debt-payments/*`, `/debt/*` | customers, sales, currency | `payment.received`, `payment.reversed` |
| **admin** | `/admin/*` | auth | — |
| **audit** | (subscriber) | core | — |

### Module enable/disable

- `company_modules` table stores per-company flags.
- Global `ModuleGuard` checks enabled modules before routing.
- Disabled module → `403 MODULE_DISABLED` per frozen error contract.

---

## 6. Request lifecycle

```
HTTP Request
  → Middleware (requestId, logging, helmet)
  → JwtAuthGuard (except public routes)
  → CompanyContextInterceptor (sets companyId from JWT + X-Company-Id)
  → ModuleGuard
  → PermissionsGuard (RBAC code from JWT)
  → ValidationPipe (class-validator → 400 VALIDATION_ERROR)
  → Controller
  → UseCase (application layer)
  → UnitOfWork.begin()
  → Domain logic + repositories
  → UnitOfWork.commit()
  → Map to response DTO (camelCase, string money)
  → HttpExceptionFilter → ErrorResponse envelope
```

### Headers (frozen)

| Header | Usage |
|--------|-------|
| `Authorization: Bearer` | JWT access token |
| `X-Device-Id` | Device tracking; required post-login |
| `X-Company-Id` | Active company when user has multiple |
| `X-Request-Id` | Correlation; echoed in `error.requestId` |
| `Idempotency-Key` | Required on `POST /sales`, `POST /debt-payments` |

---

## 7. Authentication and authorization

### 7.1 Token strategy

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access JWT | 15 minutes | Client memory |
| Refresh token | 7 days | Hashed in `sessions`; client secure storage |

JWT payload: `sub`, `email`, `companyId`, `branchId`, `sessionId`, `deviceId`, `permissions[]`.

### 7.2 Session model

- Login creates/updates `devices` row and `sessions` row.
- Refresh rotates refresh token hash; old session invalidated.
- Logout sets `sessions.revoked_at`.
- Admin force-logout revokes by session or device.

### 7.3 RBAC

- Permissions stored in DB; assigned to roles; users linked via `user_companies`.
- Controller methods declare `@RequirePermission('sales.create')`.
- Special scopes: `sales.view_all`, `inventory.oversell`.

---

## 8. Multi-tenancy

### 8.1 Company isolation

Every business table includes `company_id`. All queries **must** filter by active company from JWT context.

### 8.2 Row-Level Security (PostgreSQL)

RLS policies on tenant tables:

```sql
-- Pattern (applied per table in migration phase)
USING (company_id = current_setting('app.company_id')::uuid)
```

Application sets `SET LOCAL app.company_id = ...` at transaction start via Prisma middleware.

### 8.3 Branch context

Sales and inventory movements record `branch_id` / `warehouse_id`. Branch comes from user default or POS session override (future).

---

## 9. Transaction boundaries (critical paths)

All multi-step business operations run in **one database transaction**.

### 9.1 Complete sale (`POST /sales`)

```
BEGIN
  1. Resolve idempotency key (return cached response if duplicate)
  2. Lock product rows / validate stock (FOR UPDATE on batches)
  3. Insert sale + sale_items
  4. FifoService.allocate(saleItems) → sale_fifo_allocations + decrement remaining_qty
  5. Insert inventory_movements (type SALE)
  6. Verify Σ(batch.remaining_qty) = computed stock per product
  7. If credit/mixed → DebtService.applySaleCredit (debt_history row)
  8. Insert audit_log
COMMIT
  → Emit sale.completed (after commit)
```

**Invariant:** FIFO deducted **once** per sale line (matches signed-off desktop logic).

### 9.2 Void sale (`POST /sales/:id/void`)

```
BEGIN
  1. Load sale + fifo_allocations
  2. Restore batch remaining_qty from allocations
  3. Insert VOID_RESTORE movements; adjust stock
  4. Reverse debt if credit portion
  5. Set sale.status = CANCELLED
  6. debt_history type sale_void
COMMIT
```

### 9.3 Receive stock (`POST /inventory/receive`)

```
BEGIN
  1. Insert inventory_batches
  2. Insert inventory_movements (RECEIPT)
COMMIT
```

Stock is **never** stored on `products` — computed as `SUM(remaining_qty)` or materialized in a view.

### 9.4 Adjust stock (`POST /inventory/adjust`)

```
BEGIN
  1. If delta < 0 → FifoService.allocate (non-sale path)
  2. If delta > 0 → create adjustment batch
  3. Insert movement (ADJUSTMENT)
COMMIT
```

### 9.5 Record debt payment (`POST /debt-payments`)

```
BEGIN
  1. Idempotency check
  2. Validate currency matches debt bucket
  3. Insert debt_payments with frozen exchange_rate_used
  4. Update customer cached debt totals
  5. Insert debt_history (type payment)
COMMIT
```

---

## 10. FIFO engine (internal module)

`FifoService` is shared by **sales** and **inventory adjust**:

| Method | Caller | Behavior |
|--------|--------|----------|
| `allocate(productId, warehouseId, qty, context)` | Sale completion | FIFO by `received_at ASC`; persist allocations |
| `allocate(productId, warehouseId, qty, context)` | Negative adjust | Same batch deduction; no sale allocation rows |
| `restore(allocations[])` | Void sale | Reverse batch quantities |
| `restoreFromReturn(items[])` | Approved return | Create return batch at original COGS |

**Consistency check:** `InventoryConsistencyService.verify(companyId)` — optional admin endpoint; run in CI integration tests.

---

## 11. Currency service

| Responsibility | Detail |
|----------------|--------|
| Active rate | Latest `exchange_rates` row per company where `status = ACTIVE` |
| Set rate | Archive previous ACTIVE; insert new row |
| Transaction freeze | Copy `rate` to `exchange_rate_used` on sale/payment/return |
| USD derivation | On product price update: `salePriceUsd = salePriceUzs / rate` |
| Convert preview | Stateless; no DB write |

Historical transactions **never** recalculate when rate changes (signed-off rule).

---

## 12. Idempotency

Table `idempotency_keys`:

| Column | Purpose |
|--------|---------|
| `key` | Client `Idempotency-Key` header |
| `company_id` | Tenant scope |
| `endpoint` | e.g. `POST /sales` |
| `response_body` | JSONB cached response |
| `created_at` | TTL 24 hours |

Duplicate key within TTL → return cached `201` response without re-executing.

---

## 13. API ↔ database mapping

| API resource | Primary tables |
|--------------|----------------|
| `ProductResponse.stock` | `VIEW product_stock` or runtime `SUM(inventory_batches.remaining_qty)` |
| `CustomerResponse.debtUzs/Usd` | Cached on `customers` + verified against `debt_history` |
| `SaleResponse.fifoAllocations` | `sale_fifo_allocations` join `inventory_batches` |
| `DebtHistoryEntry` | `debt_history` ledger table |
| `StockMovementResponse` | `inventory_movements` |

Naming: DB columns `snake_case`; API JSON `camelCase`; mappers translate at API boundary.

---

## 14. Error handling

Global `HttpExceptionFilter` maps exceptions to frozen envelope:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "...",
    "details": { "productId": "...", "available": "5.0000", "requested": "10.0000" },
    "requestId": "..."
  }
}
```

Domain exceptions carry `code` + `details`; filter never leaks stack traces in production.

---

## 15. Pagination, filter, sort

Implemented in **application query layer** (not controllers):

| Concern | Implementation |
|---------|----------------|
| Pagination | Prisma `skip/take` from `page`, `limit`; count query for `meta.total` |
| Sort | Whitelist map: API field → DB column |
| Filters | Typed filter DTOs per endpoint |
| Search | PostgreSQL `ILIKE` + `tsvector` on products/customers |

Response shape always `{ data, meta }` per contract freeze.

---

## 16. Caching (Redis)

| Key pattern | TTL | Purpose |
|-------------|-----|---------|
| `rate:{companyId}` | 5 min | Active exchange rate |
| `session:{sessionId}` | 15 min | Session validation cache |
| `idempotency:{companyId}:{key}` | 24 h | Fast idempotency lookup (also persisted in PG) |
| `ratelimit:login:{ip}` | 15 min | Login attempt counter |

Cache is **never** source of truth for inventory or debt.

---

## 17. WebSocket gateway

Socket.io on same NestJS process:

| Event | Trigger |
|-------|---------|
| `sale.completed` | After sale commit |
| `payment.received` | After debt payment |
| `inventory.stock_changed` | After receive/adjust/sale/void |
| `currency.rate_updated` | After new rate |
| `module.disabled` | Admin disables module |

Clients authenticate with JWT + `deviceId` on connect.

---

## 18. Audit and observability

| Concern | Approach |
|---------|----------|
| Audit trail | `audit_logs` + append-only `debt_history`, `inventory_movements` |
| Structured logs | Winston JSON; include `requestId`, `companyId`, `userId` |
| Metrics | Prometheus: request latency, sale throughput, DB pool |
| Health | `GET /health` — DB + Redis ping |

---

## 19. Security controls

| Control | Implementation |
|---------|----------------|
| Password hashing | bcrypt (12 rounds) or argon2id |
| Rate limiting | `@nestjs/throttler` — login 5/15min per IP |
| Helmet | Security headers |
| CORS | Desktop app origin whitelist |
| SQL injection | Prisma parameterized queries only |
| Mass assignment | Explicit DTO fields per endpoint |

---

## 20. Testing strategy (planned)

| Layer | Focus |
|-------|-------|
| Unit | Domain + FIFO + currency math |
| Integration | Prisma + PostgreSQL test container; sale/void/return flows |
| Contract | Responses validated against OpenAPI master spec |
| E2E | Critical paths: login → receive → sale → void → payment |

**Mandatory integration scenarios** (from inventory sign-off):

- Sale deducts stock and batches once  
- Void restores both  
- `Σ(batch.remaining_qty) === product stock` after each operation  

---

## 21. Deployment topology (reference)

| Environment | Components |
|-------------|------------|
| Development | Docker Compose: API + PostgreSQL + Redis |
| Staging | Single VM or k8s pod; managed PostgreSQL |
| Production | N API replicas behind Nginx; PgBouncer; Redis cluster; nightly pg_dump |

---

## 22. Implementation order

Matches [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) and readiness audit:

1. Core + auth + company context  
2. Currency  
3. Products + categories  
4. Inventory + warehouses + FIFO  
5. Customers + debt ledger  
6. Sales + returns + void  
7. Debt payments + reports hooks  
8. Admin + audit + WebSocket  

---

## 23. Related documents

| Document | Role |
|----------|------|
| [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md) | API contract (frozen) |
| [`API_CONTRACT_FREEZE.md`](./API_CONTRACT_FREEZE.md) | Contract governance |
| [`DATABASE_SCHEMA_FINAL.md`](./DATABASE_SCHEMA_FINAL.md) | PostgreSQL schema |
| [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) | Phased migrations |
| [`BACKEND_INTEGRATION_READINESS.md`](./BACKEND_INTEGRATION_READINESS.md) | Integration gates |
| `docs/01-governance/MODULAR_ARCHITECTURE.md` | Original module design |
| `docs/01-governance/TECHNOLOGY_STACK.md` | Stack decisions |

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Approved for implementation |
| Next review | After Migration 006 (sales module) |
