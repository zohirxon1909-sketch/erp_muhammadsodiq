# Database Schema — Final

**Version:** 1.0.0  
**Status:** FROZEN for implementation  
**Date:** 2026-06-18  
**DBMS:** PostgreSQL 16+  
**ORM:** Prisma Migrate  
**API mapping:** [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md)  
**Supersedes:** `docs/05-database/SCHEMA_DESIGN.md` (where extended or conflicting)

---

## 1. Design principles

| Principle | Rule |
|-----------|------|
| **Multi-tenancy** | Every business row scoped by `company_id` |
| **Money** | `NUMERIC(18,4)` in DB; API returns string decimals |
| **Soft delete** | `deleted_at` on customers, products, categories |
| **Stock** | Not stored on `products`; derived from batches |
| **Debt** | Ledger in `debt_history`; cached totals on `customers` |
| **Audit** | Movements and debt history append-only |
| **FIFO** | `inventory_batches.remaining_qty`; allocations in `sale_fifo_allocations` |
| **Frozen rates** | `exchange_rate_used` on sales, payments, returns |

---

## 2. Naming conventions

| Layer | Convention | Example |
|-------|------------|---------|
| Tables | snake_case plural | `sale_items` |
| Columns | snake_case | `exchange_rate_used` |
| Primary keys | `id UUID` | `gen_random_uuid()` |
| Foreign keys | `{entity}_id` | `customer_id` |
| Timestamps | `created_at`, `updated_at`, `deleted_at` | TIMESTAMPTZ |
| API JSON | camelCase (mapped at API layer) | `exchangeRateUsed` |

---

## 3. Entity relationship overview

```
companies ─┬─ branches ─ warehouses
           ├─ products ─ product_prices
           │      └─ product_categories
           ├─ inventory_batches ─ inventory_movements
           ├─ customers ─ debt_history
           │      └─ debt_payments
           ├─ sales ─ sale_items ─ sale_fifo_allocations
           │      └─ sale_returns ─ sale_return_items
           ├─ exchange_rates
           ├─ audit_logs
           └─ company_modules

users ─ devices ─ sessions
users ─ user_companies ─ roles ─ role_permissions ─ permissions
idempotency_keys (per company)
sale_number_sequences (per company)
```

---

## 4. Core platform tables

### 4.1 companies

```sql
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  code          VARCHAR(50) NOT NULL UNIQUE,
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
```

### 4.2 branches

```sql
CREATE TABLE branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          VARCHAR(255) NOT NULL,
  address       TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
```

### 4.3 users

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  blocked_at      TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.4 devices

```sql
CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  device_uuid   UUID NOT NULL,
  name          VARCHAR(255) NOT NULL,
  platform      VARCHAR(50) NOT NULL,
  os_version    VARCHAR(50),
  ip_address    INET,
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'BLOCKED')),
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_uuid)
);
```

### 4.5 sessions

```sql
CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  device_id           UUID NOT NULL REFERENCES devices(id),
  company_id          UUID REFERENCES companies(id),
  refresh_token_hash  VARCHAR(255) NOT NULL,
  ip_address          INET,
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.6 roles, permissions, user_companies

```sql
CREATE TABLE roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id),
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(100) NOT NULL UNIQUE,
  module        VARCHAR(50) NOT NULL,
  description   TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  company_id    UUID NOT NULL REFERENCES companies(id),
  role_id       UUID NOT NULL REFERENCES roles(id),
  branch_id     UUID REFERENCES branches(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
```

### 4.7 modules registry

```sql
CREATE TABLE modules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(50) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  is_core       BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE company_modules (
  company_id    UUID NOT NULL REFERENCES companies(id),
  module_id     UUID NOT NULL REFERENCES modules(id),
  enabled       BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (company_id, module_id)
);
```

---

## 5. Catalog tables

### 5.1 product_categories

```sql
CREATE TABLE product_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          VARCHAR(255) NOT NULL,
  parent_id     UUID REFERENCES product_categories(id),
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (company_id, name, parent_id)
);
```

### 5.2 products

```sql
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  sku             VARCHAR(100) NOT NULL,
  barcode         VARCHAR(100),
  name            VARCHAR(500) NOT NULL,
  category_id     UUID REFERENCES product_categories(id),
  unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'pcs',
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (company_id, sku),
  UNIQUE (company_id, barcode)
);
```

### 5.3 product_prices

Four-price model (E12 frozen):

```sql
CREATE TABLE product_prices (
  product_id           UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  purchase_price_uzs   NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (purchase_price_uzs >= 0),
  purchase_price_usd   NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (purchase_price_usd >= 0),
  sale_price_uzs       NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (sale_price_uzs >= 0),
  sale_price_usd       NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (sale_price_usd >= 0),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**API mapping:** `ProductResponse` merges `products` + `product_prices` + computed stock.

---

## 6. Inventory tables

### 6.1 warehouses

```sql
CREATE TABLE warehouses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  branch_id     UUID NOT NULL REFERENCES branches(id),
  name          VARCHAR(255) NOT NULL,
  address       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
```

### 6.2 inventory_batches

```sql
CREATE TABLE inventory_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  quantity        NUMERIC(18,4) NOT NULL CHECK (quantity >= 0),
  remaining_qty   NUMERIC(18,4) NOT NULL CHECK (remaining_qty >= 0),
  unit_cost_uzs   NUMERIC(18,4) NOT NULL CHECK (unit_cost_uzs >= 0),
  unit_cost_usd   NUMERIC(18,4) NOT NULL CHECK (unit_cost_usd >= 0),
  received_at     TIMESTAMPTZ NOT NULL,
  source_type     VARCHAR(30) NOT NULL DEFAULT 'RECEIPT',
  source_id       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (remaining_qty <= quantity)
);
```

`source_type`: `RECEIPT`, `RETURN`, `ADJUSTMENT`, `VOID_RESTORE`, `TRANSFER_IN`

### 6.3 inventory_movements

Append-only audit trail:

```sql
CREATE TABLE inventory_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  batch_id        UUID REFERENCES inventory_batches(id),
  type            VARCHAR(20) NOT NULL
                  CHECK (type IN ('RECEIPT','SALE','ADJUSTMENT','RETURN','TRANSFER','VOID_RESTORE')),
  quantity        NUMERIC(18,4) NOT NULL,
  reference_type  VARCHAR(30),
  reference_id    UUID,
  note            TEXT,
  performed_by    UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Invariant trigger (recommended):** After insert/update on batches, verify product stock view matches sum of `remaining_qty` per product/warehouse.

### 6.4 product_stock (view)

```sql
CREATE VIEW product_stock AS
SELECT
  b.company_id,
  b.product_id,
  b.warehouse_id,
  SUM(b.remaining_qty) AS stock_qty,
  COUNT(*) AS batch_count
FROM inventory_batches b
WHERE b.remaining_qty > 0
GROUP BY b.company_id, b.product_id, b.warehouse_id;

CREATE VIEW product_stock_total AS
SELECT
  company_id,
  product_id,
  SUM(stock_qty) AS stock_qty
FROM product_stock
GROUP BY company_id, product_id;
```

**API:** `ProductResponse.stock` = `product_stock_total.stock_qty` for company.

---

## 7. Customer and debt tables

### 7.1 customers

```sql
CREATE TABLE customers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id),
  name                    VARCHAR(255) NOT NULL,
  phone                   VARCHAR(20) NOT NULL,
  phone_secondary         VARCHAR(20),
  email                   VARCHAR(255),
  address                 TEXT,
  partnership_start_date  DATE,
  notes                   TEXT,
  status                  VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED','BLOCKED')),
  total_debt_uzs          NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_debt_usd          NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_purchases_uzs     NUMERIC(18,4) NOT NULL DEFAULT 0,
  last_purchase_at        TIMESTAMPTZ,
  last_payment_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);
```

Cached debt columns updated in same transaction as `debt_history` inserts.

### 7.2 debt_history

Ledger for `GET /customers/:id/debt-history`:

```sql
CREATE TABLE debt_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  customer_id         UUID NOT NULL REFERENCES customers(id),
  type                VARCHAR(30) NOT NULL
                      CHECK (type IN ('sale_credit','payment','return','adjustment','sale_void')),
  amount_uzs          NUMERIC(18,4) NOT NULL DEFAULT 0,
  amount_usd          NUMERIC(18,4) NOT NULL DEFAULT 0,
  balance_after_uzs   NUMERIC(18,4) NOT NULL,
  balance_after_usd   NUMERIC(18,4) NOT NULL,
  reference_type      VARCHAR(30),
  reference_id        UUID,
  reference_label     VARCHAR(100),
  recorded_by         UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 7.3 debt_payments

Maps to `/debt-payments`:

```sql
CREATE TABLE debt_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  customer_id         UUID NOT NULL REFERENCES customers(id),
  amount              NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  currency            VARCHAR(3) NOT NULL CHECK (currency IN ('UZS','USD')),
  amount_uzs          NUMERIC(18,4) NOT NULL,
  amount_usd          NUMERIC(18,4) NOT NULL,
  exchange_rate_used  NUMERIC(18,4) NOT NULL,
  payment_type        VARCHAR(20) NOT NULL CHECK (payment_type IN ('PARTIAL','FULL')),
  payment_method      VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH','CARD','BANK_TRANSFER')),
  notes               TEXT,
  reversed_at         TIMESTAMPTZ,
  reversal_reason     TEXT,
  received_by         UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 8. Currency tables

### 8.1 exchange_rates

```sql
CREATE TABLE exchange_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  rate            NUMERIC(18,4) NOT NULL CHECK (rate > 0),
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','ARCHIVED')),
  notes           TEXT,
  set_by          UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Rule:** Only one `ACTIVE` rate per company at a time (partial unique index).

```sql
CREATE UNIQUE INDEX uq_exchange_rates_active
  ON exchange_rates (company_id)
  WHERE status = 'ACTIVE';
```

---

## 9. Sales tables

### 9.1 sale_number_sequences

```sql
CREATE TABLE sale_number_sequences (
  company_id    UUID NOT NULL REFERENCES companies(id),
  year          INT NOT NULL,
  last_value    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year)
);
```

Generates `S-{year}-{seq}` sale numbers.

### 9.2 sales

```sql
CREATE TABLE sales (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  branch_id           UUID NOT NULL REFERENCES branches(id),
  sale_number         VARCHAR(30) NOT NULL,
  customer_id         UUID REFERENCES customers(id),
  cashier_id          UUID NOT NULL REFERENCES users(id),
  original_currency   VARCHAR(3) NOT NULL CHECK (original_currency IN ('UZS','USD')),
  exchange_rate_used  NUMERIC(18,4) NOT NULL,
  subtotal_uzs        NUMERIC(18,4) NOT NULL DEFAULT 0,
  subtotal_usd        NUMERIC(18,4) NOT NULL DEFAULT 0,
  discount_uzs        NUMERIC(18,4) NOT NULL DEFAULT 0,
  discount_usd        NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_uzs           NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_usd           NUMERIC(18,4) NOT NULL DEFAULT 0,
  payment_type        VARCHAR(20) NOT NULL CHECK (payment_type IN ('CASH','CREDIT','MIXED')),
  amount_paid_uzs     NUMERIC(18,4) NOT NULL DEFAULT 0,
  amount_paid_usd     NUMERIC(18,4) NOT NULL DEFAULT 0,
  status              VARCHAR(20) NOT NULL DEFAULT 'COMPLETED'
                      CHECK (status IN ('COMPLETED','CANCELLED','RETURNED')),
  notes               TEXT,
  voided_at           TIMESTAMPTZ,
  voided_by           UUID REFERENCES users(id),
  completed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, sale_number)
);
```

**API status mapping:** `CANCELLED` → void; `RETURNED` → full/partial return applied.

### 9.3 sale_items

```sql
CREATE TABLE sale_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_price_uzs  NUMERIC(18,4) NOT NULL,
  unit_price_usd  NUMERIC(18,4) NOT NULL,
  total_uzs       NUMERIC(18,4) NOT NULL,
  total_usd       NUMERIC(18,4) NOT NULL,
  cogs_uzs        NUMERIC(18,4) NOT NULL DEFAULT 0,
  cogs_usd        NUMERIC(18,4) NOT NULL DEFAULT 0
);
```

### 9.4 sale_fifo_allocations

```sql
CREATE TABLE sale_fifo_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  sale_id         UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id    UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  batch_id        UUID NOT NULL REFERENCES inventory_batches(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost_uzs   NUMERIC(18,4) NOT NULL,
  unit_cost_usd   NUMERIC(18,4) NOT NULL,
  cost_uzs        NUMERIC(18,4) NOT NULL,
  cost_usd        NUMERIC(18,4) NOT NULL
);
```

Required for void restore (PB-2 signed-off behavior).

### 9.5 sale_returns

```sql
CREATE TABLE sale_returns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  sale_id             UUID NOT NULL REFERENCES sales(id),
  customer_id         UUID REFERENCES customers(id),
  exchange_rate_used  NUMERIC(18,4) NOT NULL,
  amount_uzs          NUMERIC(18,4) NOT NULL,
  amount_usd          NUMERIC(18,4) NOT NULL,
  reason              TEXT NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  approved_by         UUID REFERENCES users(id),
  rejected_by         UUID REFERENCES users(id),
  decision_note       TEXT,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at          TIMESTAMPTZ
);

CREATE TABLE sale_return_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id       UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  amount_uzs      NUMERIC(18,4) NOT NULL
);
```

---

## 10. System tables

### 10.1 idempotency_keys

```sql
CREATE TABLE idempotency_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  idempotency_key VARCHAR(255) NOT NULL,
  endpoint        VARCHAR(100) NOT NULL,
  request_hash    VARCHAR(64),
  response_status INT NOT NULL,
  response_body   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  UNIQUE (company_id, idempotency_key, endpoint)
);
```

### 10.2 audit_logs

```sql
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id),
  user_id       UUID REFERENCES users(id),
  action        VARCHAR(50) NOT NULL,
  entity_type   VARCHAR(100) NOT NULL,
  entity_id     UUID,
  old_value     JSONB,
  new_value     JSONB,
  ip_address    INET,
  request_id    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

No UPDATE/DELETE on `audit_logs`, `debt_history`, `inventory_movements` (enforce via triggers or app policy).

---

## 11. Index strategy

### 11.1 Tenant indexes (all business tables)

```sql
CREATE INDEX idx_{table}_company ON {table}(company_id);
```

### 11.2 Critical indexes

| Table | Index | Purpose |
|-------|-------|---------|
| products | `(company_id, sku)` UNIQUE | SKU lookup |
| products | `(company_id, barcode)` UNIQUE WHERE barcode IS NOT NULL | Scan |
| products | GIN `to_tsvector('simple', name)` | Search |
| inventory_batches | `(company_id, product_id, received_at ASC)` | FIFO |
| inventory_batches | `(company_id, warehouse_id, product_id)` | Stock by warehouse |
| inventory_movements | `(company_id, created_at DESC)` | History |
| inventory_movements | `(company_id, product_id, created_at DESC)` | Product history |
| customers | `(company_id, phone)` | Phone search |
| customers | `(company_id, name)` | Name search |
| sales | `(company_id, created_at DESC)` | Sales list |
| sales | `(company_id, sale_number)` UNIQUE | Lookup |
| sales | `(company_id, customer_id, created_at DESC)` | Customer sales |
| sale_fifo_allocations | `(sale_id)` | Void restore |
| debt_payments | `(company_id, customer_id, created_at DESC)` | Payment history |
| debt_history | `(company_id, customer_id, created_at DESC)` | Ledger |
| exchange_rates | `(company_id, effective_from DESC)` | History |
| sessions | `(user_id) WHERE revoked_at IS NULL` | Active sessions |
| idempotency_keys | `(expires_at)` | Cleanup job |

---

## 12. Row-Level Security

Enable RLS on all tables with `company_id`:

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (company_id = current_setting('app.company_id', true)::uuid);
```

Apply same pattern to: `customers`, `sales`, `inventory_batches`, `debt_payments`, etc.

Global tables (`users`, `permissions`) use application-level guards only.

---

## 13. API ↔ table mapping

| API endpoint | Primary tables |
|--------------|----------------|
| `GET /products` | `products`, `product_prices`, `product_stock_total` |
| `POST /inventory/receive` | `inventory_batches`, `inventory_movements` |
| `POST /sales` | `sales`, `sale_items`, `sale_fifo_allocations`, `inventory_*`, `debt_history` |
| `POST /sales/:id/void` | `sales`, `sale_fifo_allocations`, `inventory_batches`, `debt_history` |
| `POST /debt-payments` | `debt_payments`, `debt_history`, `customers` |
| `GET /currency/rate` | `exchange_rates WHERE status='ACTIVE'` |
| `GET /customers/:id/debts` | `customers` (cached columns) |
| `GET /customers/:id/debt-history` | `debt_history` |

---

## 14. Constraints summary

| ID | Constraint |
|----|------------|
| DB-01 | `remaining_qty <= quantity` on batches |
| DB-02 | One ACTIVE exchange rate per company |
| DB-03 | SKU unique per company |
| DB-04 | Sale total = sum(line totals) — enforced in application transaction |
| DB-05 | FIFO allocation qty = sale item qty per product |
| DB-06 | Stock = Σ remaining_qty (view + integration tests) |
| DB-07 | Soft-deleted rows excluded from default queries (`deleted_at IS NULL`) |
| DB-08 | Debt payment currency matches debt bucket reduced |

---

## 15. Related documents

| Document | Role |
|----------|------|
| [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md) | API DTOs |
| [`BACKEND_ARCHITECTURE.md`](./BACKEND_ARCHITECTURE.md) | Transaction boundaries |
| [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) | Phased DDL rollout |
| `docs/05-database/ERD_OVERVIEW.md` | Historical ERD |
| `docs/05-database/INDEXING_STRATEGY.md` | Index monitoring |

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | FROZEN |
| Tables | 28 + 2 views |
| Amendment | Via API contract freeze process only |
