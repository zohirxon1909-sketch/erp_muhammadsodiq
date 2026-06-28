# Migration Plan

**Version:** 1.0.0  
**Status:** Approved for implementation  
**Date:** 2026-06-18  
**Tool:** Prisma Migrate  
**Target schema:** [`DATABASE_SCHEMA_FINAL.md`](./DATABASE_SCHEMA_FINAL.md)  
**Architecture:** [`BACKEND_ARCHITECTURE.md`](./BACKEND_ARCHITECTURE.md)  
**API contract:** [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md) v1.0.0

---

## 1. Purpose

This plan defines **how** the PostgreSQL schema is introduced in ordered, testable phases. It contains **migration strategy and sequencing only** — no migration SQL files, no Prisma schema, no application code.

---

## 2. Principles

| # | Principle |
|---|-----------|
| P1 | All DDL via versioned Prisma migrations — no manual production DDL |
| P2 | Migrations are forward-only in production |
| P3 | Each migration is independently deployable and reversible on staging |
| P4 | Destructive changes use expand → migrate → contract pattern |
| P5 | Every migration phase has defined rollback on staging and verification checklist |
| P6 | Seed data separated from migrations (`prisma/seed.ts`) |
| P7 | Business invariant tests run after migrations 006 and 007 |

---

## 3. Naming convention

```
YYYYMMDDHHMMSS_{phase}_{description}

Examples:
20260618100001_001_init_core
20260618100002_002_auth_rbac
20260618100003_003_currency
```

Prisma generates timestamp; rename description in PR review for clarity.

---

## 4. Environment workflow

```
Developer updates schema.prisma (from DATABASE_SCHEMA_FINAL)
  → prisma migrate dev --name {phase_description}
  → Review generated SQL in PR
  → CI: migrate deploy on ephemeral PostgreSQL
  → CI: run integration tests for completed modules
  → Merge → staging: migrate deploy + smoke tests
  → Production: migrate deploy (maintenance window if noted)
```

### CI gates per migration

| Gate | Requirement |
|------|-------------|
| SQL review | No destructive DDL without expand/contract note |
| Migrate | `prisma migrate deploy` succeeds on empty + latest DB |
| Seed | `prisma db seed` succeeds (dev/staging only) |
| Tests | Module integration tests for affected domain |
| RLS | Policies applied where `company_id` exists |

---

## 5. Phase overview

| Phase | Migration ID | Module | Tables / objects | API endpoints unlocked |
|-------|--------------|--------|------------------|------------------------|
| **0** | — | Prerequisites | Docker PG + Redis; empty repo scaffold | — |
| **1** | `001_init_core` | Core platform | companies, branches, modules, company_modules | — |
| **2** | `002_auth_rbac` | Auth | users, devices, sessions, roles, permissions, role_permissions, user_companies | `/auth/*` |
| **3** | `003_currency` | Currency | exchange_rates + active unique index | `/currency/*` |
| **4** | `004_products` | Products | product_categories, products, product_prices | `/products/*`, `/categories/*`, `/pos/products` |
| **5** | `005_inventory` | Inventory | warehouses, inventory_batches, inventory_movements, stock views | `/inventory/*`, `/warehouses/*` |
| **6** | `006_customers_debt` | Customers + debt ledger | customers, debt_history, debt_payments | `/customers/*`, `/debt-payments`, `/debt/*` |
| **7** | `007_sales` | Sales + FIFO | sale_number_sequences, sales, sale_items, sale_fifo_allocations, sale_returns, sale_return_items, idempotency_keys | `/sales/*` |
| **8** | `008_system` | System | audit_logs; RLS on all tenant tables; cleanup indexes | `/admin/audit-logs` (partial) |

**Total:** 8 migration phases (+ Phase 0 setup).

---

## 6. Phase details

### Phase 0 — Prerequisites (no migration)

**Deliverables:**

- `backend/` repository scaffold per BACKEND_ARCHITECTURE.md
- Docker Compose: PostgreSQL 16, Redis 7
- CI pipeline stub: lint, migrate, test
- Prisma initialized with empty schema

**Exit criteria:** `prisma migrate status` runs; database connects.

---

### Phase 1 — `001_init_core`

**Creates:**

- `companies`
- `branches`
- `modules` (seed registry rows in seed.ts)
- `company_modules`

**Seed (dev/staging):**

- Demo company `MKT-TAS`
- Default branch
- All Phase 1 modules enabled

**Verification:**

- [ ] Company + branch insert/query
- [ ] Module enable flag readable

**Rollback (staging):** Drop tables in reverse FK order.

**API unlocked:** None (foundation only).

---

### Phase 2 — `002_auth_rbac`

**Creates:**

- `users`, `devices`, `sessions`
- `roles`, `permissions`, `role_permissions`, `user_companies`

**Seed:**

- System permissions catalog (sales.create, products.view, etc.)
- Roles: Admin, Manager, Cashier, Warehouse
- Demo admin user (dev only; never in production seed)

**Verification:**

- [ ] Login flow persists session
- [ ] JWT contains companyId + permissions
- [ ] Unique email constraint enforced

**Zero-downtime notes:** N/A (greenfield).

**API unlocked:** `POST /auth/login`, `/refresh`, `/logout`, `GET /auth/me`, `POST /auth/switch-company`

---

### Phase 3 — `003_currency`

**Creates:**

- `exchange_rates`
- Partial unique index `uq_exchange_rates_active`

**Verification:**

- [ ] Set rate archives previous ACTIVE
- [ ] Only one ACTIVE rate per company
- [ ] `GET /currency/rate` returns correct row

**Business rule test:**

- [ ] Rate > 0 rejected

**API unlocked:** `/currency/rate`, `/currency/rates`, `POST /currency/rates`, `/currency/convert`

---

### Phase 4 — `004_products`

**Creates:**

- `product_categories`
- `products`
- `product_prices`

**Indexes:**

- SKU unique per company
- Barcode unique partial
- Full-text on name

**Verification:**

- [ ] Create product with four prices
- [ ] PATCH cannot change SKU
- [ ] DUPLICATE_SKU on conflict
- [ ] Soft delete sets deleted_at
- [ ] Category tree with parent_id

**Products module unblocked:** Full CRUD contract implementable.

**API unlocked:** All `/products/*`, `/categories/*`, `/pos/products`

---

### Phase 5 — `005_inventory`

**Creates:**

- `warehouses`
- `inventory_batches`
- `inventory_movements`
- Views: `product_stock`, `product_stock_total`

**Verification:**

- [ ] Receive creates batch + movement; stock view updates
- [ ] Adjust negative applies FIFO batch deduction
- [ ] Adjust positive creates adjustment batch
- [ ] `remaining_qty <= quantity` constraint holds
- [ ] **Invariant:** Σ remaining_qty matches stock view

**Integration scenarios (from inventory sign-off):**

- [ ] Receive 50 → stock 50
- [ ] Adjust -5 → stock 45; batches reduced
- [ ] Transfer between warehouses (if implemented in same phase API)

**API unlocked:** `/inventory/stock`, `/batches`, `/movements`, `POST /receive`, `POST /adjust`, `/warehouses/*`

---

### Phase 6 — `006_customers_debt`

**Creates:**

- `customers`
- `debt_history`
- `debt_payments`

**Verification:**

- [ ] Customer CRUD with soft delete
- [ ] DELETE blocked when debt > 0
- [ ] Payment reduces correct currency bucket
- [ ] debt_history row on payment with balance_after
- [ ] Phone normalized to E.164 on write

**API unlocked:** `/customers/*`, `/debt-payments`, `/debt/summary`, `/debt/customers`, `/debt/aging`

**Depends on:** Phase 3 (exchange rate for payment USD fields)

---

### Phase 7 — `007_sales`

**Creates:**

- `sale_number_sequences`
- `sales`, `sale_items`, `sale_fifo_allocations`
- `sale_returns`, `sale_return_items`
- `idempotency_keys`

**Verification — sale completion:**

- [ ] POST /sales with lineItems `{ productId, quantity }` only
- [ ] Server computes prices from product_prices + frozen rate
- [ ] FIFO allocations created; batches decremented once
- [ ] **Invariant:** stock view matches batch sums post-sale
- [ ] Credit sale creates debt_history (sale_credit)
- [ ] Idempotency-Key returns same response on replay

**Verification — void (PB-2):**

- [ ] POST /sales/:id/void restores batch remaining_qty from allocations
- [ ] debt_history sale_void row
- [ ] Status → CANCELLED

**Verification — return:**

- [ ] POST /sales/:id/returns creates PENDING return
- [ ] Approve creates return batch; uses **original sale exchange rate**
- [ ] Reject leaves inventory unchanged

**Critical regression suite:**

```
receive(50) → sale(3) → assert stock 47 → void → assert stock 50
```

**API unlocked:** Full `/sales/*` including void and returns workflow

**Depends on:** Phases 4, 5, 6, 3

---

### Phase 8 — `008_system`

**Creates:**

- `audit_logs`
- RLS policies on all `company_id` tables
- Index cleanup / CONCURRENTLY indexes for production scale
- Scheduled job definition for `idempotency_keys` expiry (document only)

**Verification:**

- [ ] Audit row on product create, sale, payment
- [ ] RLS blocks cross-company read in integration test
- [ ] audit_logs append-only (no UPDATE/DELETE)

**API unlocked:** Admin audit endpoints (future admin module)

---

## 7. Seed data strategy

| Environment | Seed content |
|-------------|--------------|
| **Development** | Demo company, users, categories, sample products, warehouse, exchange rate |
| **Staging** | Minimal: modules, permissions, roles, one test company |
| **Production** | Modules + permissions + system roles only; **no demo users** |

Seed runs **after** migrate deploy; never embedded in migration SQL.

---

## 8. Zero-downtime rules (production)

| Scenario | Approach |
|----------|----------|
| Add column | Nullable first → backfill job → NOT NULL + default |
| Rename column | Add new → dual-write → migrate reads → drop old |
| Add index | `CREATE INDEX CONCURRENTLY` in dedicated migration |
| Drop column | Remove from code first; drop in later release |
| Add table | Safe anytime before code depends on it |

Phase 1–8 are greenfield; these rules apply to post-v1 changes.

---

## 9. Data migration (future)

When connecting existing desktop localStorage/mock data to backend:

| Source | Target | Notes |
|--------|--------|-------|
| Mock products | `products` + `product_prices` | Map two-price → four-price; set purchase = sale × 0.72 if missing |
| Mock batches | `inventory_batches` | Preserve remaining_qty = stock |
| Mock sales | Not imported v1 | Fresh start recommended |
| Exchange rate history | `exchange_rates` | Import active rate only |

Dedicated **import migration script** (Phase 9, out of v1 scope) — not part of initial 8 phases.

---

## 10. Rollback strategy

| Environment | Rollback |
|-------------|----------|
| **Development** | `prisma migrate reset` (destructive) |
| **Staging** | Restore DB snapshot before deploy; or apply manual down SQL tested in PR |
| **Production** | Forward-fix only; restore from backup if catastrophic |

Each phase PR includes **staging rollback notes** in description.

---

## 11. Timeline estimate (implementation planning)

| Phase | Effort (dev-days) | Cumulative API coverage |
|-------|-------------------|-------------------------|
| 0 | 1 | — |
| 1 | 1 | — |
| 2 | 3 | Auth |
| 3 | 1 | Currency |
| 4 | 3 | Products |
| 5 | 4 | Inventory |
| 6 | 3 | Customers + debt |
| 7 | 5 | Sales + FIFO |
| 8 | 2 | System hardening |
| **Total** | **~23 dev-days** | Full Phase 1 API |

Estimates exclude frontend alignment and exclude reports/dashboard modules.

---

## 12. Verification matrix (post all phases)

| Sign-off area | Migration phase | Test |
|---------------|-----------------|------|
| Inventory consistency | 5, 7 | Σ batch = stock after sale/void |
| FIFO single deduction | 7 | Sale reduces batch once |
| FIFO void restore | 7 | Void restores batches |
| Currency freeze | 3, 7 | sale.exchange_rate_used immutable |
| Debt consistency | 6, 7 | Credit/void/payment ledger balances |
| API contract | All | Contract tests vs OpenAPI master spec |

---

## 13. Dependencies graph

```
001_init_core
    └── 002_auth_rbac
            └── 003_currency
                    ├── 004_products
                    │       └── 005_inventory
                    │               └── 007_sales
                    └── 006_customers_debt
                            └── 007_sales
                                    └── 008_system
```

`007_sales` requires 003, 004, 005, 006 complete.

---

## 14. Out of scope (v1 migrations)

| Item | Reason |
|------|--------|
| Reports tables | Reports module pending per business sign-off |
| Dashboard materialized views | KPI refinement pending |
| Notifications persistence | Phase 2 backend |
| Mobile-specific tables | Mobile app pending |
| Multi-company billing | Future |

---

## 15. Post-migration: frontend alignment gate

After Phase 7 deploys to staging:

1. Update frontend `endpoints.ts` to frozen paths (E1–E12)
2. Implement `authApi`, `productsApi`
3. Point `VITE_USE_MOCK=false` at staging API
4. Run E2E: login → receive → sale → void → payment

Production cutover blocked until this gate passes (per BACKEND_INTEGRATION_READINESS.md).

---

## 16. Related documents

| Document | Role |
|----------|------|
| [`DATABASE_SCHEMA_FINAL.md`](./DATABASE_SCHEMA_FINAL.md) | Table definitions |
| [`BACKEND_ARCHITECTURE.md`](./BACKEND_ARCHITECTURE.md) | Transaction design |
| [`API_CONTRACT_FREEZE.md`](./API_CONTRACT_FREEZE.md) | API governance |
| [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md) | Endpoint contract |
| `docs/05-database/MIGRATION_STRATEGY.md` | Original strategy (superseded by this plan) |

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Approved |
| Migrations planned | 8 |
| Code artifacts | None (planning only) |
