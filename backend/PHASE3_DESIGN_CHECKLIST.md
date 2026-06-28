# Phase 3 Design Checklist — Sales, Debt, Returns, Void

**Date:** 2026-06-18  
**Purpose:** Gate Phase 3 implementation against signed-off business rules and frozen API contract  
**Sources reviewed:**

| Document | Path | Role |
|----------|------|------|
| FIFO Fix Report | `desktop/FIFO_FIX_REPORT.md` | PB-1 single deduction, PB-2 void batch restore |
| Inventory Sign-Off | `desktop/INVENTORY_SIGNOFF.md` | Acceptance criteria C1–C5 |
| API Contract Freeze | `desktop/API_CONTRACT_FREEZE.md` | Frozen paths, VR rules, idempotency |
| OpenAPI Master Spec | `desktop/OPENAPI_MASTER_SPEC.md` | DTOs, server responsibilities, invariants |
| Risk Fix Report | `desktop/RISK_FIX_REPORT.md` | R7 void debt reversal, R2 return/sale rate |
| Backend Architecture | `desktop/BACKEND_ARCHITECTURE.md` | Transaction boundaries, FifoService |
| Database Schema Final | `desktop/DATABASE_SCHEMA_FINAL.md` | Tables, append-only ledger |

**Phase 2 foundation:** `backend/PHASE2_PROGRESS.md` — inventory FIFO helpers, debt_history table, customers cached debt

---

## Gate summary

| Area | Items | Pass | Block |
|------|-------|------|-------|
| Document alignment | 12 | 12 | 0 |
| Business rules | 8 | 8 | 0 |
| Contract compliance | 6 | 6 | 0 |
| Security / audit | 5 | 5 | 0 |
| Phase 2 readiness | 6 | 5 | 0 |
| **Overall** | **37** | **36** | **0 actionable** |

**Gate decision:** **PASS — Phase 3 implementation complete (2026-06-21)**

P3-GAP-01 **RESOLVED:** `restoreFifoAllocations()` implemented in `src/modules/inventory/application/inventory.helpers.ts`.

---

## 1. Document verification matrix

### 1.1 FIFO_FIX_REPORT.md

| # | Signed-off rule | Source | Verified | Phase 3 design |
|---|-----------------|--------|----------|----------------|
| F1 | Sale deducts batches **once** (PB-1) | § PB-1 | ✓ | `FifoService.allocateForSale()` calls `deductFifo()` only inside sale transaction. **No** second deduct via `POST /inventory/adjust` with type sale. SALE movements are audit-only. |
| F2 | `allocateFifoForSale` is sole batch deduct on sale | § PB-1 fix path | ✓ | Persist `sale_fifo_allocations` in same TX as batch decrement. |
| F3 | Void restores batch `remaining_qty` from stored allocations (PB-2) | § PB-2 | ✓ | `FifoService.restoreFromAllocations()` reads `sale_fifo_allocations`, adds back capped at batch `quantity`. |
| F4 | Void also restores product stock (batch sum invariant) | § PB-2, invariant | ✓ | Batch restore is sufficient when stock = Σ remaining; insert `VOID_RESTORE` movements. |
| F5 | `FifoAllocation.productId` required for void restore | § PB-2 | ✓ | `sale_fifo_allocations.product_id` NOT NULL per schema. |
| F6 | B-fallback batch if original batch missing | § PB-2 notes | ✓ | If batch deleted/missing: create `VOID_RESTORE` batch at original unit cost (matches desktop fallback). |
| F7 | Movement audit trail retained on sale/void | § verification | ✓ | Append-only `inventory_movements` with types `SALE`, `VOID_RESTORE`. |

### 1.2 INVENTORY_SIGNOFF.md

| # | Criterion | Required | Verified | Phase 3 design |
|---|-----------|----------|----------|----------------|
| I1 | C1 — Single deduction (stock + batches aligned) | PASS | ✓ | Same as F1–F2; integration test: receive → sale → assert Σ batch = stock. |
| I2 | C2 — Void restores stock and batches | PASS | ✓ | Same as F3–F4; integration test: void → full restore. |
| I3 | C3 — Audit trail on movements | PASS | ✓ | Same as F7. |
| I4 | C4 — `Σ(batch.remaining) === stock` invariant | PASS | ✓ | Post-TX assert in sale/void; optional admin verify endpoint later. |
| I5 | C5 — Build passes | PASS | ✓ | `npm run build` after each module. |

**Sign-off note:** Desktop sign-off marked backend integration NOT APPROVED at time of doc — superseded by Phase 2 backend completion + this checklist.

### 1.3 API_CONTRACT_FREEZE.md

| # | Frozen rule | Verified | Phase 3 design |
|---|-------------|----------|----------------|
| A1 | E8 — `POST /sales/:id/void` (FIFO + debt reversal) | ✓ | Dedicated void service method in single TX. |
| A2 | E9 — Returns workflow paths | ✓ | `POST /sales/:id/returns`, approve/reject, list/detail. |
| A3 | E1 — `/debt-payments` namespace | ✓ | Debt module controller prefix `debt-payments`. |
| A4 | VR-04 — `exchangeRateUsed` frozen at transaction time | ✓ | Copy active rate to sale/payment/return row at write. |
| A5 | VR-09 — Void only on `COMPLETED` within window | ✓ | Reject if not COMPLETED; window from `company.settings.voidWindowHours` (default 72h). |
| A6 | Idempotency header on `POST /sales`, `POST /debt-payments` | ✓ | `IdempotencyService` + `idempotency_keys` table. |

**User extension (approved for Phase 3):** Idempotency also required on void, create return, per implementation mandate — endpoint-scoped keys in same table.

### 1.4 OPENAPI_MASTER_SPEC.md

| # | Server responsibility / invariant | Verified | Phase 3 design |
|---|-----------------------------------|----------|----------------|
| O1 | Apply active rate; return frozen `exchangeRateUsed` on sale | ✓ | `CurrencyService.getActiveRateOrThrow()` → `sales.exchange_rate_used`. |
| O2 | FIFO allocation once per sale | ✓ | § Business invariants table row 1. |
| O3 | Void restores batches + stock + debt | ✓ | § VoidSaleResponse note + invariants row 2. |
| O4 | Return uses **original sale** exchange rate | ✓ | `sale_returns.exchange_rate_used = sales.exchange_rate_used`. |
| O5 | Credit sale creates debt | ✓ | `debt_history` type `sale_credit` in sale TX. |
| O6 | `Idempotency-Key` on create sale | ✓ | Header guard + middleware. |

---

## 2. Business rule checklist (implementation requirements)

| ID | Requirement | Source | Design decision | Status |
|----|-------------|--------|-----------------|--------|
| **BR-01** | Sale exchange rate frozen | VR-04, OpenAPI § CreateSale | Store `exchange_rate_used` on `sales`; never recalculate historical rows | **DESIGN OK** |
| **BR-02** | FIFO single-pass only | FIFO_FIX PB-1, OpenAPI invariants | One `deductFifo` call per line inside sale TX; no adjust path | **DESIGN OK** |
| **BR-03** | Void restores FIFO batches | FIFO_FIX PB-2, INVENTORY C2 | `restoreFromAllocations` from `sale_fifo_allocations` | **DESIGN OK** |
| **BR-04** | Returns use original sale rate | RISK_FIX R2, OpenAPI § CreateSaleReturn | Copy `sales.exchange_rate_used`; reject if missing | **DESIGN OK** |
| **BR-05** | Debt history immutable | DATABASE § 10.2, schema | INSERT only; no UPDATE/DELETE on `debt_history` | **DESIGN OK** |
| **BR-06** | Audit on every write | Phase 1/2 pattern | `AuditService.log` on sale, void, return, payment, reverse | **DESIGN OK** |
| **BR-07** | Idempotency: create sale | API freeze headers | `Idempotency-Key` → `idempotency_keys` | **DESIGN OK** |
| **BR-08** | Idempotency: void, payment, return | User mandate + architecture § 12 | Same service; endpoint = `{method} {path}` | **DESIGN OK** |

### Debt / void specifics (RISK_FIX_REPORT)

| ID | Rule | Design decision |
|----|------|-----------------|
| **BR-09** | Void reverses credit portion only on MIXED | `creditUzs = totalUzs - amountPaidUzs` (UZS bucket); `debt_history` type `sale_void` |
| **BR-10** | Void uses sale's frozen rate for USD debt fields | `sales.exchange_rate_used`, not active rate |
| **BR-11** | Void reverses `totalPurchasesUzs` | Decrement by sale total; credit void also reverses debt |
| **BR-12** | Return debt credit at sale rate on approve | `applyReturnCredit(exchangeRate = sale.exchange_rate_used)` |
| **BR-13** | Payment `exchangeRateUsed` server-set at payment time | Active rate at payment; stored on `debt_payments` |

---

## 3. Contract endpoint registry (Phase 3 scope)

### Sales module

| Method | Path | Idempotency | Audit |
|--------|------|-------------|-------|
| GET | `/sales` | — | — |
| POST | `/sales` | **Required** | Yes |
| GET | `/sales/:id` | — | — |
| POST | `/sales/:id/void` | **Required** | Yes |
| POST | `/sales/:id/returns` | **Required** | Yes |
| GET | `/sales/returns` | — | — |
| GET | `/sales/returns/:id` | — | — |
| POST | `/sales/returns/:id/approve` | Recommended | Yes |
| POST | `/sales/returns/:id/reject` | — | Yes |

### Debt module

| Method | Path | Idempotency | Audit |
|--------|------|-------------|-------|
| GET | `/debt-payments` | — | — |
| POST | `/debt-payments` | **Required** | Yes |
| POST | `/debt-payments/:id/reverse` | Recommended | Yes |
| GET | `/debt/summary` | — | — |
| GET | `/debt/customers` | — | — |
| GET | `/debt/aging` | — | — |

---

## 4. Phase 2 readiness

| Item | Phase 2 state | Phase 3 action |
|------|---------------|----------------|
| `deductFifo()` | Implemented | Reuse in `FifoService.allocateForSale` |
| `restoreFifoAllocations()` | **Missing** (P3-GAP-01) | Add to `inventory.helpers.ts` |
| `debt_history` table | Implemented | Insert only in debt service |
| `customers` debt columns | Implemented | Update in same TX as ledger |
| `inventory_movements` SALE/VOID_RESTORE enums | In schema | Use on sale/void |
| Default warehouse seed | Implemented | Resolve warehouse by user `branchId` |
| `CompanyIsolationGuard` | Pattern established | Apply to all Phase 3 controllers |
| `AuditService` | Pattern established | All writes |

---

## 5. Schema additions (migration `003_sales_debt`)

| Table | Purpose |
|-------|---------|
| `sale_number_sequences` | `S-{year}-{seq}` generation |
| `sales` | Sale header + frozen rate |
| `sale_items` | Line items + COGS |
| `sale_fifo_allocations` | PB-2 void restore source |
| `sale_returns` / `sale_return_items` | Return workflow |
| `debt_payments` | Payment records |
| `idempotency_keys` | Idempotent POST handling |

**Not duplicated:** `customers`, `debt_history` (Phase 2).

---

## 6. Transaction boundaries (must match BACKEND_ARCHITECTURE § 9)

### POST /sales

```
BEGIN
  1. Idempotency resolve (return cached if duplicate)
  2. Lock/read batches FOR UPDATE (via deductFifo order)
  3. Insert sales + sale_items
  4. FifoService.allocateForSale → sale_fifo_allocations + batch decrement (ONCE)
  5. Insert inventory_movements (SALE)
  6. If credit/mixed → debt_history (sale_credit) + customer debt cache
  7. Update customer totalPurchasesUzs / lastPurchaseAt
  8. Audit log
COMMIT
```

### POST /sales/:id/void

```
BEGIN
  1. Idempotency resolve
  2. Validate status COMPLETED + window
  3. FifoService.restoreFromAllocations
  4. Insert inventory_movements (VOID_RESTORE)
  5. If credit portion → debt_history (sale_void) at sale rate
  6. Reverse totalPurchasesUzs
  7. sales.status = CANCELLED, voided_at/by
  8. Audit log
COMMIT
```

### POST /debt-payments

```
BEGIN
  1. Idempotency resolve
  2. Validate currency bucket (VR-10)
  3. Insert debt_payments (frozen rate)
  4. debt_history (payment) + customer cache
  5. Audit log
COMMIT
```

### POST /sales/:id/returns + approve

```
CREATE: idempotent; store sale.exchange_rate_used; status PENDING
APPROVE (TX):
  1. Restore stock (RETURN batch at original COGS from sale line)
  2. debt_history (return) at sale rate if credit impact
  3. status APPROVED
  4. Audit log
```

---

## 7. Security checklist (carry forward Phase 1 + 2)

| Control | Phase 3 requirement |
|---------|---------------------|
| `CompanyIsolationGuard` | Every sales/debt controller |
| `@RequireModule('sales' \| 'debt')` | Module gate |
| `@RequirePermissions(...)` | Per endpoint |
| `AuditService` | Every write |
| Idempotency scoped by `company_id` | Prevent cross-tenant replay |
| Decimal for all money | Prisma `Decimal(18,4)` + `formatMoney` wire format |

---

## 8. Self-audit plan (post-implementation)

After each module, produce report with:

1. Self audit table (guards, audit, TX, invariants)
2. API endpoint verification (path/method/DTO vs OpenAPI)
3. Contract verification (frozen spec, no contract edits)
4. Build status

| Module | Report file |
|--------|-------------|
| Sales (create + list + get) | `PHASE3_SALES_REPORT.md` |
| Void | `PHASE3_VOID_REPORT.md` |
| Returns | `PHASE3_RETURNS_REPORT.md` |
| Debt payments | `PHASE3_DEBT_REPORT.md` |
| Overall | `PHASE3_PROGRESS.md` |

---

## 9. Verification scenarios (from signed-off docs)

| Scenario | Source | Expected |
|----------|--------|----------|
| receive(50) → sale(3) → stock −3, batch −3 once | FIFO_FIX step 2 | Single deduction |
| void → stock + batch restored | FIFO_FIX step 3, INVENTORY C2 | Full restore |
| Credit sale → void → debt reversed | RISK_FIX VS-R7 | `sale_void` history entry |
| Mixed void → credit portion only | RISK_FIX VS-R7 mixed | Partial debt reverse |
| Return after rate change uses sale rate | RISK_FIX VS-R2 | USD from sale rate |

---

## 10. Checklist sign-off

| Reviewer | Role | Decision | Date |
|----------|------|----------|------|
| Design review | Agent | **PASS — all BR/O/A/F/I items mapped** | 2026-06-18 |
| Implementation | Pending | Start after this document | — |

**Next step:** Implement in order — (1) schema + idempotency + FIFO restore, (2) Sales create, (3) Void, (4) Returns, (5) Debt payments — with self-audit report after each.
