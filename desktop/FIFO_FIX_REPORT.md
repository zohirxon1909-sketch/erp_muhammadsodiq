# FIFO Fix Report — PB-1 & PB-2

**Date:** 2026-06-18  
**Status:** Fixed and verified  
**Scope:** Inventory consistency only — backend integration remains blocked until sign-off (see `INVENTORY_SIGNOFF.md`).

---

## Executive summary

Two production blockers caused product stock and FIFO batch totals to diverge:

| ID | Issue | Root cause | Fix |
|----|-------|------------|-----|
| **PB-1** | Double FIFO deduction on sale | `allocateFifoForSale()` and `adjustStock(-qty, 'sale')` both reduced batch `remaining` | Batch allocation on negative `adjustStock` skipped when `type === 'sale'` |
| **PB-2** | Void restored stock but not batches | `voidSale` only called `adjustStock(+qty)` | New `restoreStockFromVoid()` restores batches from stored `fifoAllocations`, then restores product stock |

Inventory is now deducted **exactly once** per sale, and void reverses **both** product stock and FIFO batches while preserving movement audit entries.

---

## PB-1 — FIFO double deduction

### Problem

Sale completion path:

```
completeSale()
  └─ buildSaleDetail()
       └─ allocateFifoForSale()     → deducts batch.remaining
  └─ adjustStock(-qty, 'sale')       → also called allocateFifo() on negative delta
```

Result: for a sale of quantity `N`, batch `remaining` dropped by `2N` while `product.stock` dropped by `N`.

### Root cause

`adjustStock` unconditionally ran FIFO allocation on any negative delta:

```typescript
if (quantityDelta < 0) {
  batches: allocateFifo(...)
}
```

Sales already allocate FIFO in `buildSaleDetail` via `allocateFifoForSale`, which applies the same `allocateFifo` helper and updates batches before stock is adjusted.

### Fix

`adjustStock` now allocates FIFO on negative deltas **only when the movement is not a sale**:

```173:176:desktop/src/stores/inventoryStore.ts
        if (quantityDelta < 0 && type !== 'sale') {
          set((s) => ({
            batches: allocateFifo(s.batches, productId, Math.abs(quantityDelta)),
          }));
```

**Sale path (single deduction):**

1. `allocateFifoForSale` — deducts batches, records `fifoAllocations` on the sale
2. `adjustStock(-qty, 'sale')` — deducts `product.stock` only; batches untouched

**Other outbound paths** (manual adjustment, transfer, etc.) still use `adjustStock` with FIFO when `type !== 'sale'`.

---

## PB-2 — FIFO restore on void

### Problem

`voidSale` restored product stock via `adjustStock(+qty)` but never increased batch `remaining`. After void, `product.stock` increased while `Σ(batch.remaining)` stayed at post-sale levels.

### Fix

Added `restoreStockFromVoid()` in `inventoryStore.ts`:

1. **`restoreFifoAllocations`** — for each stored allocation, adds quantity back to the matching batch (`remaining`, capped at `quantity`); handles `B-fallback` batches by creating a new batch row
2. **`adjustStock(+qty, 'adjustment', …)`** per line item — restores `product.stock` with audit note `Savdo bekor qilindi: {saleNumber}`

`voidSale` in `salesStore.ts` now calls `restoreStockFromVoid` with `sale.lineItems` and `sale.fifoAllocations` instead of per-line `adjustStock` only.

### `productId` on allocations

`FifoAllocation` now includes `productId` so void restore does not rely on fragile product-name matching:

```23:28:desktop/src/types/sales.ts
export interface FifoAllocation {
  batchId: string;
  productId: string;
  productName: string;
  quantity: number;
  costUzs: number;
}
```

---

## Files changed

| File | Change |
|------|--------|
| `src/stores/inventoryStore.ts` | PB-1 guard in `adjustStock`; `getBatchRemainingTotal`, `restoreFifoAllocations`, `restoreStockFromVoid`, `verifyInventoryConsistency`; `productId` on `allocateFifoForSale` return |
| `src/stores/salesStore.ts` | `voidSale` uses `restoreStockFromVoid` |
| `src/types/sales.ts` | `FifoAllocation.productId` added |
| `src/audit/inventoryConsistencyAudit.ts` | Automated audit script (new) |

---

## Verification

### Automated audit

```bash
cd desktop
npx tsx src/audit/inventoryConsistencyAudit.ts
```

**Result (2026-06-18): OVERALL PASS**

| Step | Check | Result |
|------|-------|--------|
| 1 | Seed: `Σ(batch.remaining) === product.stock` for all products | PASS |
| 2 | Sell 3× p1: stock 42→39, batches 42→39 (single deduction) | PASS |
| 3 | Void sale: stock 42, batches 42 (full restore) | PASS |
| 4 | Full catalog consistency | PASS |

### Typecheck

```bash
npm run typecheck
```

Exit code 0.

### Invariant

For every product:

```
Σ(batch.remaining where batch.productId = product.id) === product.stock
```

Enforced by `verifyInventoryConsistency()` in `inventoryStore.ts`.

---

## Notes for operators

- **Existing browser localStorage** may still contain pre-fix inconsistent state from earlier sessions. Clear `erp-inventory` / `erp-sales` in devtools or use a fresh profile before relying on live data.
- **Legacy mock sales** in seed data have empty `fifoAllocations`; voiding those historical records would restore stock only. New sales always persist allocations.
- **Manual stock increases** via product edit (`adjustStock` positive, type `adjustment`) add product stock without a matching batch — a known separate gap for inbound adjustments outside `receiveStock`.

---

## Backend integration

**Do not proceed** with backend integration until `INVENTORY_SIGNOFF.md` is accepted and production data is verified clean.
