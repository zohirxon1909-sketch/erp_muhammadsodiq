# Backend Integration Readiness Audit

**Audit date:** 2026-06-18 (post–contract freeze)  
**Prior audit:** 2026-06-18 (pre-freeze)  
**Scope:** Verify frontend and legacy docs against **frozen canonical contract**  
**Single source of truth:** [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md)  
**Freeze record:** [`API_CONTRACT_FREEZE.md`](./API_CONTRACT_FREEZE.md)

---

## Executive summary

| Phase | Status |
|-------|--------|
| Core ERP business logic sign-off | **PASS** |
| Contract Alignment Phase (E1–E12) | **COMPLETE** |
| Canonical API contract frozen | **YES** — v1.0.0 |
| Products module contract | **UNBLOCKED** |
| Frontend aligned to frozen contract | **PARTIAL** — alignment work remains |
| Backend implementation | **APPROVED TO BEGIN** |

**Pre-freeze verdict:** PARTIAL — no module READY, Product BLOCKED.  
**Post-freeze verdict:** Contract **READY** for all seven modules; frontend integration **PARTIAL**; backend **approved**.

---

## E1–E12 resolution status

| ID | Resolution | Status |
|----|------------|--------|
| E1 | `/debt-payments` | ✓ Frozen |
| E2 | `/currency/rate`, `/currency/rates`, `/currency/convert` | ✓ Frozen |
| E3 | `PATCH /customers/:id` | ✓ Frozen |
| E4 | `DELETE /customers/:id` (soft) | ✓ Frozen |
| E5 | `/customers/:id/debts` + `/debt-history` | ✓ Frozen |
| E6 | `POST /inventory/receive` | ✓ Frozen |
| E7 | `POST /inventory/adjust` | ✓ Frozen |
| E8 | `POST /sales/:id/void` | ✓ Frozen |
| E9 | `POST /sales/:id/returns` + returns workflow | ✓ Frozen |
| E10 | `{ data, meta: { page, limit, total, totalPages } }` | ✓ Frozen |
| E11 | `{ error: { code, message, details, requestId } }` | ✓ Frozen |
| E12 | Four prices + `categoryId`; stock read-only | ✓ Frozen |

---

## Module readiness — contract vs frontend

Legend: **Contract** = frozen spec complete. **Frontend** = current `desktop/src` alignment.

### Summary table

| Module | Contract | Frontend | Contract status | Integration status |
|--------|----------|----------|-----------------|-------------------|
| Auth | ✓ | Partial | **READY** | **PARTIAL** |
| Customers | ✓ | Partial | **READY** | **PARTIAL** |
| Products | ✓ | Blocked → Partial | **READY** | **PARTIAL** |
| Inventory | ✓ | Partial | **READY** | **PARTIAL** |
| Sales | ✓ | Partial | **READY** | **PARTIAL** |
| Payments | ✓ | Partial | **READY** | **PARTIAL** |
| Currency | ✓ | Partial | **READY** | **PARTIAL** |

---

### 1. Auth

| Aspect | Frozen contract | Frontend today | Status |
|--------|-----------------|----------------|--------|
| Request DTOs | `LoginRequest`, `RefreshRequest`, `SwitchCompanyRequest` | Login form only; no `deviceInfo` | Contract **READY** / FE **PARTIAL** |
| Response DTOs | `LoginResponse` with tokens, permissions, modules | Mock `{ user, companies, tokens }` | **PARTIAL** |
| Validation | Password ≥ 8; deviceInfo required | Store min 4 chars | **PARTIAL** |
| Error handling | Nested `ErrorResponse` | Flat reject object | **PARTIAL** |
| Pagination | N/A | N/A | **READY** |
| Filters | N/A | N/A | **READY** |
| Sorting | N/A | N/A | **READY** |

**Frozen endpoints:** `POST /auth/login`, `/refresh`, `/logout`, `GET /auth/me`, `POST /auth/switch-company`  
**Frontend gap:** No `authApi`; login bypasses axios.

---

### 2. Customers

| Aspect | Frozen contract | Frontend today | Status |
|--------|-----------------|----------------|--------|
| Request DTOs | `CreateCustomerRequest` / `UpdateCustomerRequest` (full fields) | `CreateCustomerInput` subset | Contract **READY** / FE **PARTIAL** |
| Response DTOs | `CustomerResponse` with E.164 phone, four-price debts as strings | `Customer` with number amounts | **PARTIAL** |
| Validation | VR-02 phone E.164; VR-07 delete guard | Zod form validation | **PARTIAL** |
| Error handling | `ErrorResponse` | Generic toast | **PARTIAL** |
| Pagination | `page`, `limit`, `meta` | `ListParams` unused; client paginate | **PARTIAL** |
| Filters | `status`, `q`, `sort` | Client-only | **PARTIAL** |
| Sorting | `sort=name:asc` etc. | Client `useListState` | **PARTIAL** |

**Frozen paths:** PATCH not PUT; DELETE not archive; `/debts` + `/debt-history`  
**Frontend gap:** `customersApi.update` uses PUT; `archive` uses POST; lists read store.

---

### 3. Products *(unblocked)*

| Aspect | Frozen contract | Frontend today | Status |
|--------|-----------------|----------------|--------|
| Request DTOs | `CreateProductRequest` — four prices, `categoryId` | Form: two prices, category string | Contract **READY** / FE **PARTIAL** |
| Response DTOs | `ProductResponse` full model | `Product` simplified | **PARTIAL** |
| Validation | VR-05 SKU; VR-06 barcode; VR-08 delete guard | Zod on forms | **PARTIAL** |
| Error handling | `DUPLICATE_SKU`, `DUPLICATE_BARCODE` | Local only | **PARTIAL** |
| Pagination | Server paginated list | Store + client | **PARTIAL** |
| Filters | `categoryId`, `stockLevel`, `status`, `q` | Client only | **PARTIAL** |
| Sorting | Server `sort` | Client only | **PARTIAL** |

**Frozen endpoints:** Full CRUD + search + barcode + categories + `/pos/products`  
**Frontend gap:** No `productsApi`; entity model must extend to four prices + `categoryId`.  
**Blocker cleared:** Contract defines complete Product module — backend may implement.

---

### 4. Inventory

| Aspect | Frozen contract | Frontend today | Status |
|--------|-----------------|----------------|--------|
| Request DTOs | `ReceiveStockRequest`, `AdjustStockRequest`, `TransferStockRequest` | Store methods | Contract **READY** / FE **PARTIAL** |
| Response DTOs | `InventoryBatchResponse`, `StockMovementResponse`, `StockLevelResponse` | Simplified types; `remaining` vs `remainingQty` | **PARTIAL** |
| Validation | VR-03 quantity > 0; FIFO invariants | Store (signed off) | Contract **READY** |
| Error handling | `INSUFFICIENT_STOCK` with details | POS dialog / store | **PARTIAL** |
| Pagination | Server on batches, movements, stock | Client on store | **PARTIAL** |
| Filters | `productId`, `warehouseId`, `type`, dates | Client only | **PARTIAL** |
| Sorting | Server defaults documented | Client only | **PARTIAL** |

**Frozen writes:** `POST /inventory/receive`, `/adjust`, `/transfers`  
**Frontend gap:** Receive/adjust store-only; `inventoryApi` read partial.

---

### 5. Sales

| Aspect | Frozen contract | Frontend today | Status |
|--------|-----------------|----------------|--------|
| Request DTOs | `CreateSaleRequest` — lineItems `{ productId, quantity }` only | `CreateSalePayload` sends full Product cart | Contract **READY** / FE **PARTIAL** |
| Response DTOs | `SaleResponse` + FIFO + frozen rate | `SaleDetail` — close alignment needed | **PARTIAL** |
| Validation | Idempotency-Key; server stock check | Store pre-check | **PARTIAL** |
| Error handling | `INSUFFICIENT_STOCK` 422 | Generic catch | **PARTIAL** |
| Pagination | Server list filters | Client on store | **PARTIAL** |
| Filters | status, paymentType, customerId, dates | Client + permissions | **PARTIAL** |
| Sorting | Server | Client | **PARTIAL** |

**Frozen paths:** `POST /sales/:id/void`; `POST /sales/:id/returns`  
**Frontend gap:** Void on store; return path differs; no idempotency header.

---

### 6. Payments (debt)

| Aspect | Frozen contract | Frontend today | Status |
|--------|-----------------|----------------|--------|
| Request DTOs | `CreateDebtPaymentRequest` with currency, paymentType | `RecordPaymentInput` — UZS only | Contract **READY** / FE **PARTIAL** |
| Response DTOs | `DebtPaymentResponse` with frozen rate | `Payment` simplified | **PARTIAL** |
| Validation | VR-10; idempotency | Zod + UI debt cap | **PARTIAL** |
| Error handling | Standard envelope | Generic toast | **PARTIAL** |
| Pagination | Server | Client | **PARTIAL** |
| Filters | customerId, currency, dates | Client | **PARTIAL** |
| Sorting | Server | Client | **PARTIAL** |

**Frozen path:** `/debt-payments` (not `/payments`)  
**Frontend gap:** Wrong endpoint constant; missing summary/aging/reverse.

---

### 7. Currency

| Aspect | Frozen contract | Frontend today | Status |
|--------|-----------------|----------------|--------|
| Request DTOs | `SetExchangeRateRequest`, `ConvertCurrencyRequest` | `{ rate }` only | Contract **READY** / FE **PARTIAL** |
| Response DTOs | `CurrentRateResponse`, `ExchangeRateResponse` | `ExchangeRate` number rate | **PARTIAL** |
| Validation | VR-11 rate > 0 | UI min 1000 | **PARTIAL** |
| Error handling | Standard envelope | Generic toast | **PARTIAL** |
| Pagination | `/currency/rates` paginated | Array from wrong path | **PARTIAL** |
| Filters | from/to on history | Client search | **PARTIAL** |
| Sorting | `effectiveFrom:desc` | Client | **PARTIAL** |

**Frozen paths:** `/currency/rate`, `/currency/rates`, `/currency/convert`  
**Frontend gap:** Uses `/settings/exchange-rates`.

---

## Cross-cutting readiness

| Concern | Frozen contract | Frontend | Contract | Frontend align |
|---------|-----------------|----------|----------|----------------|
| Pagination schema | `meta.limit` | `pageSize` flat | **READY** | **PARTIAL** |
| Error schema | Nested `error` object | Flat reject | **READY** | **PARTIAL** |
| Filter query params | Per-endpoint tables in spec | Client-only | **READY** | **PARTIAL** |
| Sort query | `sort=field:dir` | Client `useListState` | **READY** | **PARTIAL** |
| Money wire format | String decimals | JSON numbers | **READY** | **PARTIAL** |
| Idempotency | Sales + debt-payments | Not sent | **READY** | **PARTIAL** |
| OpenAPI machine file | Markdown master spec | None | **READY** (doc) | N/A |

---

## Gate decision (post-freeze)

| Gate | Pre-freeze | Post-freeze |
|------|------------|-------------|
| E1–E12 resolved | ✗ | **✓** |
| Single canonical contract | ✗ | **✓** `OPENAPI_MASTER_SPEC.md` |
| Products module | BLOCKED | **UNBLOCKED** |
| All module contracts defined | PARTIAL | **READY** |
| Frontend aligned | PARTIAL | **PARTIAL** (unchanged — next phase) |
| Backend implementation | NOT APPROVED | **APPROVED TO BEGIN** |

---

## Approved next phases

### Phase 1 — Backend implementation (APPROVED)

Implement server against `OPENAPI_MASTER_SPEC.md` v1.0.0. No contract changes without freeze amendment.

Suggested order:

1. Auth + company context
2. Currency (rate drives USD derivation)
3. Products + categories
4. Inventory (receive/adjust + FIFO)
5. Customers + debt-payments
6. Sales + returns + void

### Phase 2 — Frontend contract alignment (required before production cutover)

Track checklist in `API_CONTRACT_FREEZE.md`:

- Update `endpoints.ts`, types, `*Api` services, mock handler, error interceptor
- Add `authApi`, `productsApi`
- Wire server pagination/filters on list pages

### Phase 3 — Integration testing

- Contract tests: mock handler + future backend vs OpenAPI master spec
- Re-run inventory consistency scenarios against API-backed stores

---

## What is explicitly not approved

| Item | Status |
|------|--------|
| Production cutover with current frontend paths | **NOT APPROVED** |
| Contract changes without version bump | **NOT APPROVED** |
| Skipping frontend alignment before go-live | **NOT APPROVED** |

---

## Sign-off

| Milestone | Result |
|-----------|--------|
| Contract Alignment Phase | **COMPLETE** |
| API Contract Freeze v1.0.0 | **FROZEN** |
| Backend Integration Readiness (contract) | **READY** |
| Backend Implementation | **APPROVED TO BEGIN** |
| Production deployment | Pending Phase 2 frontend alignment |

**Related:** `API_CONTRACT_FREEZE.md`, `OPENAPI_MASTER_SPEC.md`, `INVENTORY_SIGNOFF.md`, `ERP_SIGNOFF_AUDIT.md`
