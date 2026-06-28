# Risk Fix Report — R7 & R2

**Project:** ERP Desktop (`d:\erp\desktop`)  
**Date:** 2026-06-18  
**Scope:** Business-critical audit risks from `CURRENCY_AUDIT_REPORT.md`  
**Verification:** `npm run typecheck` ✅  
**Out of scope (not touched):** R1, R3, R4

---

## Summary

| Risk | Title | Status |
|------|-------|--------|
| **R7** | Void sale debt reversal | **Fixed** |
| **R2** | Return rate consistency | **Fixed** |

---

## R7 — Void Sale Debt Reversal

### Root cause

`voidSale` in `salesStore.ts` only restored inventory stock and marked the sale `voided`. It did **not**:

- Reverse nasiya (credit) or mixed credit posted via `applySaleCredit`
- Write a debt-history audit entry
- Roll back `totalPurchasesUzs` added at checkout

Credit/mixed sales therefore left orphan receivables on the customer balance after void.

### Fix applied

1. **`getSaleCreditUzs(sale)`** — Computes the receivable portion:
   - `credit` → full `totalUzs`
   - `mixed` → `totalUzs − receivedUzs` (cash portion from payment record)
   - `cash` → `0`

2. **`reverseSaleCredit(...)`** in `customerStore` — Mirrors `applySaleCredit` in reverse:
   - Reduces `debtUzs` / `debtUsd`
   - Appends debt history with type **`sale_void`**, reference = sale number
   - USD amounts use the **sale’s frozen `exchangeRate`**

3. **`voidSale`** extended to:
   - Restore stock (unchanged)
   - Call `reverseSaleCredit` when `creditUzs > 0`
   - Reverse purchase totals: `totalPurchasesUzs −= totalUzs + (creditUzs > 0 ? creditUzs : 0)` (undoes both `completeSale` paths)
   - `syncDebtUsdWithRate(activeRate)` for live USD display
   - Mark sale `voided`

4. **`sale_void`** added to `DebtHistoryEntry.type` and customer profile labels.

### Files changed (R7)

| File | Change |
|------|--------|
| `src/types/entities.ts` | Added `sale_void` debt history type |
| `src/stores/customerStore.ts` | Added `reverseSaleCredit` |
| `src/stores/salesStore.ts` | `getSaleCreditUzs`, extended `voidSale` |
| `src/features/customers/CustomerProfilePage.tsx` | Label for `sale_void` |

---

## R2 — Return Rate Consistency

### Root cause

- **`applyReturnCredit`** used `getActiveRate()` when recording debt history USD, while **`createReturn`** correctly computed `amountUsd` at the **sale’s `exchangeRate`**.
- **`applySaleCredit`** also used `getActiveRate()` instead of the checkout rate passed on the sale, causing sale vs debt-history USD mismatch if rates differed between sale completion and store read.
- **`createReturn`** fell back to active rate when `sale.exchangeRate` was missing.

### Fix applied

1. **`applySaleCredit`** — New required parameter `exchangeRate`; all USD fields use sale rate.
2. **`applyReturnCredit`** — New required parameter `exchangeRate`; debt history uses sale rate.
3. **`completeSale`** — Passes `sale.exchangeRate` into `applySaleCredit`.
4. **`approveReturn`** — Passes `sale.exchangeRate` into `applyReturnCredit`; syncs live `debtUsd` after.
5. **`createReturn`** — Uses **only** `sale.exchangeRate`; throws if missing (no active-rate fallback).

Return record `amountUsd` and debt-history `amountUsd` now both derive from the **original sale rate**.

### Files changed (R2)

| File | Change |
|------|--------|
| `src/stores/customerStore.ts` | `exchangeRate` param on `applySaleCredit` / `applyReturnCredit` |
| `src/stores/salesStore.ts` | Pass sale rate; remove active-rate fallback in `createReturn` |

---

## Verification steps

### VS-R7 — Void credit sale

1. Set exchange rate (e.g. 13 000).
2. Complete POS **nasiya** sale for customer with known amount (e.g. 500 000 so'm).
3. Confirm customer `debtUzs` increased by 500 000; debt history shows `Savdo (nasiya)`.
4. Open sale detail → **Sotuvni bekor qilish**.
5. Confirm:
   - Stock restored
   - Customer `debtUzs` decreased by 500 000
   - Debt history shows **`Savdo bekor qilindi`** referencing sale number
   - Sale status = `Bekor qilingan`
   - No unmatched credit remains

### VS-R7 — Void mixed sale

1. Complete **aralash** sale: e.g. total 600 000, cash 200 000, credit 400 000.
2. Void sale.
3. Confirm debt reduced by **400 000** (not full 600 000).

### VS-R7 — Void cash sale (with customer)

1. Complete cash sale with customer selected.
2. Void sale.
3. Confirm debt unchanged; `totalPurchasesUzs` reduced by sale total only.

### VS-R2 — Return after rate change

1. Complete **credit** sale at rate **12 620** (note sale `totalUsd` on detail).
2. Change active rate to **13 500**.
3. Create and **approve** return for full sale amount.
4. Confirm:
   - Return `amountUsd` = `uzsToUsd(amountUzs, 12620)` (not 13 500)
   - Debt history return entry `amountUsd` matches return record
   - `amountUsd` ≠ `uzsToUsd(amountUzs, 13500)`

### VS-R2 — New credit sale uses checkout rate

1. Set rate to 13 000; complete credit sale.
2. Open customer debt history → `Savdo (nasiya)` entry `amountUsd` = `uzsToUsd(creditUzs, 13000)`.

---

## Remaining risks (not fixed in this pass)

| ID | Risk | Notes |
|----|------|-------|
| **R1** | Dashboard USD KPIs static | Mock data; does not follow live rate |
| **R3** | POS cart stale product snapshot | Price changes while cart open |
| **R4** | POS USD mode display-only | Payment inputs remain UZS |
| **R5** | Product form USD field ignored on save | UX confusion |
| **R6** | `updateProductPrices` bypass | Unused in UI; can desync UZS/USD |
| **R8** | Seed mock USD drift | Until first `CurrencyBootstrap` sync |
| **R9** | Payment journal frozen USD | By design for audit |
| **—** | `totalPurchasesUzs` double increment on credit sales | `applySaleCredit` and `completeSale` both add; void now reverses both increments; root duplicate not refactored |
| **—** | Void does not restore FIFO batches | Stock qty restored via adjustment; batch layers not rebuilt |
| **—** | Partial return on mixed sale | Full return amount reduces debt; cash/credit split not reallocated |

---

## Manual QA checklist

```
[ ] VS-R7 credit void — debt + history reversed
[ ] VS-R7 mixed void — credit portion only reversed
[ ] VS-R7 cash void — no debt change, purchases reversed
[ ] VS-R2 return USD at sale rate after rate change
[ ] VS-R2 new sale credit history USD at checkout rate
[ ] npm run typecheck passes
```

---

*Fixes only — no new features. R1, R3, R4 deferred per instruction.*
