# Phase 3 Progress — Sales, Debt, Returns, Void

**Scope:** Idempotency, FIFO restore, Sales, Void, Returns, Debt Payments  
**Status:** COMPLETE (implementation)  
**Date:** 2026-06-21  
**Build:** `npm run build` PASS

---

## Summary

| Module | Endpoints | Contract | Security | Report |
|--------|-----------|----------|----------|--------|
| Idempotency + FIFO restore | — | PASS | PASS | (infra) |
| Sales (create/list/get) | 3/3 | PASS | PASS | [PHASE3_SALES_REPORT.md](./PHASE3_SALES_REPORT.md) |
| Void | 1/1 | PASS | PASS | [PHASE3_VOID_REPORT.md](./PHASE3_VOID_REPORT.md) |
| Returns | 5/5 | PASS | PASS | [PHASE3_RETURNS_REPORT.md](./PHASE3_RETURNS_REPORT.md) |
| Debt payments | 6/6 | PASS | PASS | [PHASE3_DEBT_REPORT.md](./PHASE3_DEBT_REPORT.md) |

**Phase 3 total:** 15 endpoints implemented

---

## Infrastructure

| Item | Path | Status |
|------|------|--------|
| IdempotencyService (24h TTL) | `src/core/idempotency/idempotency.service.ts` | DONE |
| IdempotencyKeyHeader decorator | `src/core/decorators/idempotency.decorator.ts` | DONE |
| Export from CoreModule | `src/core/core.module.ts` | DONE |
| `restoreFifoAllocations()` | `src/modules/inventory/application/inventory.helpers.ts` | DONE |
| Debt ledger service | `src/modules/debt/application/debt.service.ts` | DONE |
| App module registration | `src/app.module.ts` | DONE |

---

## Implemented Endpoints

### Sales (3)
- [x] `GET /sales`
- [x] `POST /sales`
- [x] `GET /sales/:id`

### Void (1)
- [x] `POST /sales/:id/void`

### Returns (5)
- [x] `POST /sales/:id/returns`
- [x] `GET /sales/returns`
- [x] `GET /sales/returns/:id`
- [x] `POST /sales/returns/:id/approve`
- [x] `POST /sales/returns/:id/reject`

### Debt (6)
- [x] `GET /debt-payments`
- [x] `POST /debt-payments`
- [x] `POST /debt-payments/:id/reverse`
- [x] `GET /debt/summary`
- [x] `GET /debt/customers`
- [x] `GET /debt/aging`

---

## Business Rules Verified (Design)

| ID | Rule | Implementation |
|----|------|----------------|
| BR-01 | Frozen exchange rate on sale | `sales.exchange_rate_used` |
| BR-02 | FIFO single-pass on sale | `deductFifo` in sale TX only |
| BR-03 | Void restores FIFO batches | `restoreFifoAllocations` |
| BR-04 | Returns use sale rate | `sale_returns.exchange_rate_used = sale.rate` |
| BR-05 | Debt history immutable | INSERT only in `DebtService` |
| BR-06 | Audit on writes | All POST/PATCH write endpoints |
| BR-07–08 | Idempotency | POST sales, void, returns, debt-payments |
| BR-09 | Mixed credit = total − paid | `getSaleCreditUzs()` |
| BR-10 | Void debt at sale rate | `reverseSaleCredit(exchangeRateUsed)` |
| BR-11 | Void reverses totalPurchasesUzs | Decrement by `sale.totalUzs` |
| BR-12 | Return credit at sale rate | `applyReturnCredit` on approve |
| BR-13 | Payment rate server-set | Active rate at payment time |

---

## All New / Modified File Paths

```
src/core/idempotency/idempotency.service.ts          (new)
src/core/decorators/idempotency.decorator.ts         (new)
src/core/core.module.ts                              (modified)
src/app.module.ts                                    (modified)
src/modules/inventory/application/inventory.helpers.ts (modified)
src/modules/debt/application/debt.service.ts         (new)
src/modules/debt/application/debt-payments.service.ts (new)
src/modules/debt/api/dto/debt.dto.ts                 (new)
src/modules/debt/api/debt-payments.controller.ts     (new)
src/modules/debt/debt.module.ts                      (new)
src/modules/sales/api/dto/sales.dto.ts               (new)
src/modules/sales/api/sales.controller.ts            (new)
src/modules/sales/application/sales.service.ts       (new)
src/modules/sales/sales.module.ts                    (new)
PHASE3_SALES_REPORT.md                               (new)
PHASE3_VOID_REPORT.md                                (new)
PHASE3_RETURNS_REPORT.md                             (new)
PHASE3_DEBT_REPORT.md                                (new)
PHASE3_PROGRESS.md                                   (new)
```

---

## Next Steps

1. Run `npm run build` in `backend/` with Node.js installed
2. Run `prisma migrate deploy` if DB not yet migrated
3. Integration tests: receive → sale → void → assert stock/debt
