# ERP Sign-Off Audit

**Project:** ERP Desktop (`d:\erp\desktop`)  
**Date:** 2026-06-18  
**Scope:** End-to-end core ERP workflow (13 scenarios)  
**Mode:** Mock API + Zustand persisted stores (pre–backend integration)  
**Method:** Static code trace, store logic review, targeted simulation of FIFO/debt paths  
**Build:** `npm run typecheck` ✅  

**Feature development:** Frozen — audit only, no new features added.

---

## Executive decision

| Question | Answer |
|----------|--------|
| Is Core ERP logic ready for **Backend Integration**? | **No — conditional hold** |
| Can backend work start in parallel on **auth / customers / payments API**? | **Yes**, with contract tests |
| Must be fixed **before** production or integrated inventory/sales API? | **Yes — FIFO blockers (PB-1, PB-2)** |

Core **debt**, **currency**, **payments**, **returns (rate)**, and **void debt reversal** flows are verified after P0 + R7/R2 fixes. **Inventory/FIFO consistency** has confirmed defects that block full sign-off.

---

## Consistency matrix

| Domain | Status | Notes |
|--------|--------|-------|
| **Inventory (qty)** | ⚠️ Partial | `product.stock` updates correctly on receive/sale/void/return |
| **FIFO batches** | ❌ Fail | Double deduction on sale; void does not restore batch layers |
| **Debt (UZS)** | ✅ Pass | Credit, payment, return, void paths balance correctly |
| **Currency** | ✅ Pass | UZS canonical; sale/return/void use frozen rate; live debt USD syncs |
| **Audit history** | ⚠️ Partial | Types complete; seed history imperfect; purchases double-count on credit |
| **Sales ↔ Customer link** | ⚠️ Partial | New sales have `customerId`; seed mock sales do not |

---

## Scenario results (1–13)

| # | Scenario | Result | Evidence |
|---|----------|--------|----------|
| 1 | **Login** | ✅ **Pass** | `authStore.login` → company select → `selectCompany` → role permissions; guards redirect cashier to POS, manager to dashboard |
| 2 | **Customer creation** | ✅ **Pass** | `CustomerFormPage` → `customersApi.create` → `customerStore.createCustomer`; zero debt, active status |
| 3 | **Product creation** | ✅ **Pass** | `ProductFormPage` → `inventoryStore.createProduct`; USD normalized via `productUsdFromUzs`; optional initial stock creates FIFO batch |
| 4 | **Inventory receive** | ✅ **Pass** | `InventoryReceivePage` → `receiveStock`; stock ↑, batch created, movement logged, warehouse value updated |
| 5 | **FIFO allocation** | ❌ **Fail** | **PB-1:** `buildSaleDetail` calls `allocateFifoForSale` **and** `completeSale` calls `adjustStock(-qty)` which deducts batches again → **2× batch consumption per sale** |
| 6 | **Sale (cash)** | ✅ **Pass** | POS → `salesApi.create` → `completeSale`; totals, stock ↓, `exchangeRate` stored; no debt |
| 7 | **Credit sale** | ⚠️ **Pass with warning** | Debt + history at sale rate ✅; **`totalPurchasesUzs` double increment** (see W-1) |
| 8 | **Payment** | ✅ **Pass** | `recordPayment` reduces `debtUzs`; frozen `amountUsd`; payment + debt history entries |
| 9 | **Return** | ✅ **Pass** | `createReturn` / `approveReturn` use **sale `exchangeRate`**; stock restored; debt reduced for credit/mixed |
| 10 | **Void sale** | ⚠️ **Pass with warning** | R7 fix: debt reversed + `sale_void` history ✅; stock qty restored ✅; **FIFO batches not restored** (see PB-2) |
| 11 | **Exchange rate change** | ✅ **Pass** | `currencyStore.setRate` → `applyExchangeRate`; products + live debt USD sync via `CurrencyBootstrap` |
| 12 | **Debt recalculation** | ✅ **Pass** | `syncDebtUsdWithRate`; UI derives USD from `debtUzs` at active rate |
| 13 | **Customer profile history** | ⚠️ **Pass with warning** | Tabs: sales / payments / debt history; new transactions linked; **seed sales lack `customerId`** (W-2) |

---

## Passed scenarios (summary)

1. Login & authorization routing  
2. Customer CRUD (create via API mock)  
3. Product create with currency-normalized prices  
4. Inventory receive → batch + movement  
6. Cash POS sale end-to-end  
7. Credit sale debt posting (UZS + frozen USD at sale rate)  
8. Customer payment recording  
9. Return create/approve with sale-rate USD consistency  
10. Void sale debt reversal (R7) + audit entry  
11. Exchange rate propagation to catalog and live debt  
12. Live debt USD recalculation after rate change  
13. Customer profile displays debt history types (`sale_credit`, `payment`, `return`, `sale_void`)

---

## Failed scenarios

### F-1 — FIFO double deduction on every sale (Production blocker **PB-1**)

**Location:** `salesStore.ts` → `buildSaleDetail` + `completeSale`

**Flow:**
1. `buildSaleDetail` → `allocateFifoForSale()` deducts `batch.remaining` and records allocations on the sale.
2. `completeSale` → `adjustStock(-qty)` deducts `batch.remaining` **again** for the same quantity.

**Impact:** Batch layers drain twice; `sum(batch.remaining)` diverges from `product.stock`; COGS/FIFO tab on sale detail may not match warehouse batches; fallback allocation (`B-fallback`) triggered incorrectly.

**Simulation:** Selling 3 units reduced batch remaining by **6** (expected 3).

---

### F-2 — Void / adjustment does not restore FIFO batches (Production blocker **PB-2**)

**Location:** `salesStore.voidSale` → `adjustStock(+qty, 'adjustment')`

**Flow:** Positive `adjustStock` increases `product.stock` but **does not** create or restore batch `remaining` (only negative deltas call `allocateFifo`).

**Impact:** After void, stock count recovers but FIFO layers stay depleted → permanent batch vs stock mismatch.

**Related:** Return restock uses `restoreStockFromReturn` which creates new batches (partial mitigation for returns only).

---

## Warnings (non-blocking for backend API design)

| ID | Issue | Impact |
|----|-------|--------|
| **W-1** | `totalPurchasesUzs` double-count on credit sales | `applySaleCredit` adds `creditUzs`; `completeSale` adds full `totalUzs` — profile KPI inflated; void reverses both increments |
| **W-2** | Seed `mockSales` have no `customerId` | Customer profile “Savdolar” tab empty for seed customers; new sales OK |
| **W-3** | Dashboard KPIs are static mock | Not tied to live stores (documented in currency audit R1) |
| **W-4** | Inventory receive / product create bypass mock API | Pages call `inventoryStore` directly; no `POST /inventory/receive` handler — backend must define contracts |
| **W-5** | Return restock batches use `costUzs: 0` when unspecified | COGS accuracy on returned goods |
| **W-6** | Seed debt history `balanceAfter*` may not match recomputed balances | Cleared after real transactions in fresh session |

---

## Production blockers

| ID | Blocker | Must fix before |
|----|---------|-----------------|
| **PB-1** | Remove duplicate FIFO deduction on sale (single path: either sale allocation or adjustStock, not both) | Integrated inventory API / production |
| **PB-2** | Restore or recreate FIFO batches on void (mirror `restoreStockFromReturn` pattern) | Production inventory accuracy |
| **PB-3** | *(Recommended)* Fix `totalPurchasesUzs` double-count on credit sales | Financial reporting accuracy |

**Not production blockers for backend phase:** Dashboard mock data, POS cart staleness (R3), USD display mode (R4), reports/analytics placeholders.

---

## Remaining risks (post sign-off scope)

| Risk | Severity | Area |
|------|----------|------|
| FIFO batch vs stock drift | **Critical** | Inventory |
| Mock API incomplete vs UI | High | Backend integration |
| Persisted localStorage state across dev sessions | Medium | QA / testing |
| No automated E2E test suite | Medium | Regression |
| Partial return on mixed-payment sales | Low | Debt allocation |
| `updateProductPrices` bypass without rate sync | Low | Catalog |

---

## Backend integration readiness

### Ready to integrate (stable store contracts)

| Module | Store / API surface | Notes |
|--------|-------------------|-------|
| Auth | `authStore`, `POST /auth/login` mock | Replace mock with real tokens; keep permission model |
| Customers | `customerStore`, CRUD + archive mock routes | `createCustomer`, `recordPayment`, debt history |
| Sales | `salesStore`, `POST /sales` | Payload: `CreateSalePayload` with `exchangeRate` |
| Returns | `salesStore`, `POST /returns`, approve/reject | Must preserve sale-rate semantics |
| Currency | `currencyStore`, `POST /settings/exchange-rates` | Rate change triggers sync hook |
| Payments | `customerStore.recordPayment`, `POST /payments` | UZS canonical |

### Integrate only after FIFO fix

| Module | Reason |
|--------|--------|
| Inventory / batches / FIFO | PB-1, PB-2 — server-side allocation must not replicate double-deduct |
| Warehouse valuation | Depends on correct batch costs |

### Suggested backend contract priorities

1. **Phase A:** Auth, companies, customers, currency rates  
2. **Phase B:** Sales, payments, debt history (include `exchangeRate` on every monetary transaction)  
3. **Phase C:** Returns + void (transactional; idempotent)  
4. **Phase D:** Inventory receive, batches, FIFO allocation (**after PB-1/PB-2 resolved**)

---

## Manual QA script (recommended before backend kickoff)

```
Prerequisites: Clear localStorage OR fresh browser profile

1. Login dilshod@market.uz → select company
2. Create customer "Audit Test" → verify profile opens
3. Create product 100 000 UZS → receive 20 units → verify batch on Batches page
4. Note batch remaining sum = 20
5. POS cash sale 3 units → batch remaining should be 17 (FAIL today: ~14)
6. Credit sale 200 000 UZS to customer → debt +200k
7. Record payment 100 000 → debt 100k
8. Change rate 12620 → 13000 → product USD ↓, debt USD updates
9. Return from credit sale → return USD at sale rate
10. New credit sale → void → debt restored, sale_void in history
11. Customer profile → debt history shows all event types
```

---

## Related documents

| Document | Content |
|----------|---------|
| `P0_FIX_REPORT.md` | Currency + localization P0 |
| `CURRENCY_AUDIT_REPORT.md` | Full currency domain audit |
| `RISK_FIX_REPORT.md` | R7 void debt, R2 return rate |
| `FRONTEND_AUDIT_REPORT.md` | Route/page audit |

---

## Sign-off statement

| Stakeholder action | Recommendation |
|--------------------|----------------|
| **Core ERP business flow (debt/currency/sales/payments/returns/void)** | Approved for backend API design and mock replacement |
| **Core ERP inventory/FIFO** | **Not approved** until PB-1 and PB-2 are resolved |
| **Overall Backend Integration phase** | **Proceed with Phase A–B**; **hold Phase D** until inventory fixes land |

---

*Audit completed with feature development frozen. No application code was modified for this sign-off.*
