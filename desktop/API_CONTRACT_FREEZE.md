# API Contract Freeze

**Version:** 1.0.0  
**Status:** FROZEN  
**Effective date:** 2026-06-18  
**Base URL:** `/api/v1`  
**Single source of truth:** [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md)

---

## Purpose

This document freezes the canonical ERP REST API contract after Contract Alignment Phase. All prior documentation (`docs/06-api/*`, `docs/08-modules/*`) is **superseded** by `OPENAPI_MASTER_SPEC.md` where conflicts exist.

**In scope:** Endpoint paths, HTTP verbs, DTOs, validation rules, pagination, filters, sorting, error envelope.  
**Out of scope:** Backend implementation, database migrations, frontend code changes.

---

## Freeze policy

| Rule | Description |
|------|-------------|
| **Breaking changes** | Require version bump to `/api/v2` and written migration note |
| **Additive changes** | New optional fields, new endpoints — allowed in `1.x` with spec patch |
| **Field removal / rename** | Breaking |
| **Enum value removal** | Breaking |
| **Path change** | Breaking |

Changes after freeze must update `OPENAPI_MASTER_SPEC.md` version and add an entry to the **Amendment log** at the bottom of this file.

---

## E1–E12 resolution (locked)

| ID | Issue | **Frozen decision** | Supersedes |
|----|-------|---------------------|------------|
| **E1** | Payment route namespace | **`/debt-payments`** for list and create. `/payments` and `/debt/payments` are **deprecated**. | REST ref wins over module doc |
| **E2** | Currency routes | **`GET /currency/rate`** (current), **`GET /currency/rates`** (history, paginated), **`POST /currency/rates`** (set rate), **`POST /currency/convert`** (preview). `/settings/exchange-rates` is **deprecated**. | Unified under `/currency/*` |
| **E3** | Customer update verb | **`PATCH /customers/:id`** only. `PUT` is **not supported**. | REST ref + module doc |
| **E4** | Customer delete | **`DELETE /customers/:id`** — soft delete (`deletedAt` set). `POST …/archive` is **deprecated**; use DELETE or `PATCH` with `status: ARCHIVED`. | REST ref |
| **E5** | Customer debt endpoints | **`GET /customers/:id/debts`** — balance summary. **`GET /customers/:id/debt-history`** — paginated ledger (`DebtHistoryEntry[]`). | Both endpoints retained |
| **E6** | Inventory receive | **`POST /inventory/receive`** — atomic receive (batch + movement + stock). `POST /inventory/batches` is **not** a public write API. | REST ref |
| **E7** | Inventory adjust | **`POST /inventory/adjust`** — stock adjustment with reason. `/inventory/adjustments` plural path is **deprecated**. | REST ref |
| **E8** | Sale void | **`POST /sales/:id/void`** — void completed sale (FIFO + debt reversal). Store-only void is **invalid** post-integration. | REST ref |
| **E9** | Sale return | **`POST /sales/:id/returns`** — create return against sale. **`GET /sales/returns`** — list returns. **`POST /sales/returns/:id/approve`** / **`reject`** — workflow (frozen extension). `/sales/returns` standalone POST without sale id is **deprecated**. | Module doc + frontend workflow |
| **E10** | Pagination wrapper | **`{ data, meta: { page, limit, total, totalPages } }`** — query params **`page`**, **`limit`** (default 20, max 100). `pageSize` is **deprecated**. | API_DESIGN |
| **E11** | Error envelope | **`{ error: { code, message, details?, requestId } }`** — flat `{ message, code }` is **deprecated**. | ERROR_HANDLING |
| **E12** | Product model | **Four prices** (`purchasePriceUzs/Usd`, `salePriceUzs/Usd`) + **`categoryId`** (UUID). Stock is **read-only computed** from batch sums. Two-price model is **deprecated**. | DOMAIN_MODEL + SCHEMA_DESIGN |

---

## Global conventions

### Headers (all authenticated requests)

```
Authorization: Bearer {accessToken}
Content-Type: application/json
Accept: application/json
X-Request-Id: {uuid}          // optional client-generated
X-Device-Id: {deviceUuid}      // required after login
X-Company-Id: {companyUuid}    // required when user has multiple companies
Idempotency-Key: {uuid}        // required on POST /sales, POST /debt-payments
```

### JSON field naming

**camelCase** for all JSON property names (e.g. `exchangeRateUsed`, `categoryId`).

### Identifiers

UUID v4 strings. Sale numbers are human-readable strings (`S-2026-000001`) separate from `id`.

### Timestamps

ISO 8601 with timezone: `2026-06-18T14:30:00+05:00`.

### Money on the wire

Amount fields use **string decimals** with up to 4 fractional digits:

```json
"1250000.0000"
```

Currency is a separate field or suffix (`amountUzs`, `amountUsd`, or `currency: "UZS"|"USD"`). Clients may parse to number for display; servers must not use IEEE float for persistence.

### Enums (canonical casing)

| Domain | Values |
|--------|--------|
| Entity status | `ACTIVE`, `INACTIVE`, `ARCHIVED`, `BLOCKED` |
| Sale status | `COMPLETED`, `CANCELLED`, `RETURNED` |
| Sale payment type | `CASH`, `CREDIT`, `MIXED` |
| Currency | `UZS`, `USD` |
| Movement type | `RECEIPT`, `SALE`, `ADJUSTMENT`, `RETURN`, `TRANSFER`, `VOID_RESTORE` |
| Debt payment type | `PARTIAL`, `FULL` |
| Payment method | `CASH`, `CARD`, `BANK_TRANSFER` |
| Return status | `PENDING`, `APPROVED`, `REJECTED` |

---

## Module endpoint registry (frozen)

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke session |
| GET | `/auth/me` | Profile, permissions, modules |
| POST | `/auth/switch-company` | Switch company context |

### Customers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/customers` | List (paginated, filterable) |
| GET | `/customers/search` | POS quick search |
| GET | `/customers/:id` | Detail |
| POST | `/customers` | Create |
| PATCH | `/customers/:id` | Update |
| DELETE | `/customers/:id` | Soft delete |
| GET | `/customers/:id/debts` | Debt balance summary |
| GET | `/customers/:id/debt-history` | Debt ledger (paginated) |

### Products *(unblocked)*

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products` | List (paginated, filterable) |
| GET | `/products/search` | Search by name/sku |
| GET | `/products/barcode/:code` | Barcode lookup |
| GET | `/products/:id` | Detail + stock summary |
| POST | `/products` | Create |
| PATCH | `/products/:id` | Update (SKU immutable) |
| DELETE | `/products/:id` | Soft delete |
| GET | `/categories` | Category tree/list |
| POST | `/categories` | Create category |
| PATCH | `/categories/:id` | Update category |
| DELETE | `/categories/:id` | Delete (blocked if products assigned) |
| GET | `/pos/products` | POS-optimized product search |

### Inventory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/inventory/stock` | Stock levels by product/warehouse |
| GET | `/inventory/batches` | Batch list (paginated, filterable) |
| GET | `/inventory/batches/:id` | Batch detail |
| GET | `/inventory/movements` | Movement history (paginated) |
| POST | `/inventory/receive` | Receive stock (creates batch) |
| POST | `/inventory/adjust` | Stock adjustment |
| POST | `/inventory/transfers` | Inter-warehouse transfer |
| GET | `/warehouses` | List warehouses |
| GET | `/warehouses/:id` | Warehouse detail |
| POST | `/warehouses` | Create warehouse |

### Sales

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sales` | List (paginated, filterable) |
| POST | `/sales` | Create and complete sale |
| GET | `/sales/:id` | Detail + line items + FIFO allocations |
| POST | `/sales/:id/void` | Void sale |
| POST | `/sales/:id/returns` | Create return |
| GET | `/sales/returns` | List returns |
| GET | `/sales/returns/:id` | Return detail |
| POST | `/sales/returns/:id/approve` | Approve return |
| POST | `/sales/returns/:id/reject` | Reject return |

### Payments (debt)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/debt-payments` | Payment history (paginated) |
| POST | `/debt-payments` | Record debt payment |
| POST | `/debt-payments/:id/reverse` | Reverse payment |
| GET | `/debt/summary` | Company debt summary |
| GET | `/debt/customers` | Customers with debt |
| GET | `/debt/aging` | Aging report |

### Currency

| Method | Path | Description |
|--------|------|-------------|
| GET | `/currency/rate` | Current active rate |
| GET | `/currency/rates` | Rate history (paginated) |
| POST | `/currency/rates` | Set new rate |
| POST | `/currency/convert` | Preview conversion (non-persistent) |

---

## Shared schemas (summary)

Full JSON Schema definitions are in `OPENAPI_MASTER_SPEC.md`.

| Schema | Purpose |
|--------|---------|
| `PaginatedResponse<T>` | List wrapper with `meta` |
| `PaginationQuery` | `page`, `limit` |
| `SortQuery` | `sort=field:asc\|desc` (repeatable max 3) |
| `SearchQuery` | `q` full-text |
| `FilterQuery` | Resource-specific (documented per endpoint) |
| `ErrorResponse` | Standard error envelope |
| `MoneyAmount` | String decimal amount |
| `ValidationErrorDetails` | Field-level errors in `details.fields[]` |

---

## Validation rules (cross-module)

| Rule ID | Rule |
|---------|------|
| VR-01 | All required fields must be present; unknown fields ignored (not rejected) in v1 |
| VR-02 | Phone numbers normalized to E.164 (`+998…`) on create/update |
| VR-03 | `quantity` > 0 for sales, returns, receive |
| VR-04 | `exchangeRateUsed` frozen on sale/payment/return at transaction time |
| VR-05 | SKU unique per company; immutable after create |
| VR-06 | Barcode unique per company when provided |
| VR-07 | DELETE customer blocked when `debtUzs > 0` or `debtUsd > 0` |
| VR-08 | DELETE product blocked when computed `stock > 0` |
| VR-09 | Sale void only on `COMPLETED` status within configured window |
| VR-10 | Payment amount > 0; currency must match debt bucket reduced |
| VR-11 | Exchange rate > 0 |
| VR-12 | Password ≥ 8 characters on login (server enforced) |

---

## Pagination, filter, sort (frozen)

### Pagination query

```
?page=1&limit=20
```

### Pagination response

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Sort query

```
?sort=createdAt:desc
?sort=name:asc,createdAt:desc
```

Allowed sort fields are listed per endpoint in `OPENAPI_MASTER_SPEC.md`.

### Search query

```
?q=search_term
```

### Common filters

| Param | Applies to |
|-------|------------|
| `status` | customers, products, sales, returns |
| `categoryId` | products |
| `customerId` | sales, debt-payments |
| `warehouseId` | inventory/batches, stock |
| `productId` | batches, movements |
| `type` | movements, debt-history |
| `from`, `to` | sales, movements, debt-payments, rates (ISO date) |

---

## Error handling (frozen)

### Envelope

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Not enough stock for product",
    "details": {
      "productId": "uuid",
      "available": "5.0000",
      "requested": "10.0000"
    },
    "requestId": "uuid"
  }
}
```

### Required client actions

| Code | HTTP | Client action |
|------|------|---------------|
| `TOKEN_EXPIRED` | 401 | Call `/auth/refresh`, retry once |
| `SESSION_REVOKED` | 401 | Logout, redirect login |
| `INSUFFICIENT_STOCK` | 422 | Show available quantity |
| `DUPLICATE_SKU` | 409 | Highlight SKU field |
| `MODULE_DISABLED` | 403 | Hide module |
| `VALIDATION_ERROR` | 400 | Map `details.fields` to form |

Full catalog in `OPENAPI_MASTER_SPEC.md`.

---

## Products module — unblock record

Product module is **unblocked** by this freeze:

| Requirement | Status |
|-------------|--------|
| Full CRUD endpoints defined | ✓ |
| Four-price DTO aligned to domain model | ✓ |
| `categoryId` UUID reference | ✓ |
| Stock as computed read-only field | ✓ |
| Search + barcode lookup | ✓ |
| Category endpoints | ✓ |
| POS product search | ✓ |
| Validation rules (SKU, barcode, delete guards) | ✓ |

Frontend must implement `productsApi` against this contract before live backend cutover.

---

## Deprecated paths (do not implement)

| Deprecated | Replace with |
|------------|--------------|
| `/payments` | `/debt-payments` |
| `/settings/exchange-rates` | `/currency/rates`, `/currency/rate` |
| `PUT /customers/:id` | `PATCH /customers/:id` |
| `POST /customers/:id/archive` | `DELETE /customers/:id` |
| `POST /inventory/batches` (public write) | `POST /inventory/receive` |
| `POST /inventory/adjustments` | `POST /inventory/adjust` |
| `POST /sales/returns` (without sale id) | `POST /sales/:id/returns` |
| Flat error `{ message, code }` | `ErrorResponse` envelope |
| `{ total, pageSize }` pagination | `{ meta: { total, limit, totalPages } }` |

---

## Frontend alignment checklist (post-freeze, not in this phase)

- [ ] Update `endpoints.ts` to frozen paths
- [ ] Add `authApi`, `productsApi`
- [ ] Align `PaginatedResponse` and error interceptor
- [ ] Wire `ListParams` on all list methods
- [ ] Extend `Product` type to four prices + `categoryId`
- [ ] Route void/receive/adjust through API
- [ ] Update mock handler to frozen contract

---

## Amendment log

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-18 | Initial contract freeze; E1–E12 resolved; Products unblocked |

---

## Sign-off

| Milestone | Status |
|-----------|--------|
| Contract Alignment Phase | **COMPLETE** |
| API contract frozen | **YES** |
| Backend implementation | **Approved to begin** after readiness re-audit |

See [`BACKEND_INTEGRATION_READINESS.md`](./BACKEND_INTEGRATION_READINESS.md) (post-freeze audit).
