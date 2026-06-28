# Phase 3 — Void Module Report

**Module:** Sale void (`POST /sales/:id/void`)  
**Status:** COMPLETE  
**Date:** 2026-06-21

---

## Implemented Endpoints

| Method | Path | Permission | Idempotency | Audit |
|--------|------|------------|-------------|-------|
| POST | `/sales/:id/void` | `sales.cancel` | Required | Yes |

---

## Self Audit

| Check | Result |
|-------|--------|
| `CompanyIsolationGuard` | PASS |
| `@RequireModule('sales')` | PASS |
| `@RequirePermissions('sales.cancel')` | PASS |
| `AuditService` on void | PASS |
| Single TX: restore FIFO + debt + status | PASS |
| Only `COMPLETED` sales voidable | PASS |
| Void window from `company.settings.voidWindowHours` (default 72h) | PASS |
| `restoreFifoAllocations` from `sale_fifo_allocations` | PASS |
| B-fallback batch on missing original batch | PASS |
| `VOID_RESTORE` inventory movements | PASS |
| Credit reversal via `reverseSaleCredit` at sale rate | PASS |
| Mixed void reverses credit portion only | PASS |
| `totalPurchasesUzs` decremented by sale total | PASS |
| Status → `CANCELLED`, `voidedAt`/`voidedBy` set | PASS |
| Idempotency scoped endpoint `POST /sales/{id}/void` | PASS |

---

## Contract Verification

| Rule | Source | Match |
|------|--------|-------|
| `VoidSaleResponse` = `SaleResponse` with CANCELLED | OpenAPI | YES |
| PB-2 batch restore | FIFO_FIX_REPORT | YES |
| R7 debt reversal | RISK_FIX_REPORT | YES |
| VR-09 void window | API_CONTRACT_FREEZE | YES |

---

## Build Status

| Test | Status |
|------|--------|
| `npm run build` | PASS |

---

## Files Modified / Used

- `src/modules/inventory/application/inventory.helpers.ts` — `restoreFifoAllocations()`
- `src/modules/debt/application/debt.service.ts` — `reverseSaleCredit()`
- `src/modules/sales/application/sales.service.ts` — `voidSale()`
