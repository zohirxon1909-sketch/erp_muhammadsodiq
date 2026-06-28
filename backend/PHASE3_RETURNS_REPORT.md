# Phase 3 — Returns Module Report

**Module:** Sale returns workflow  
**Status:** COMPLETE  
**Date:** 2026-06-21

---

## Implemented Endpoints

| Method | Path | Permission | Idempotency | Audit |
|--------|------|------------|-------------|-------|
| POST | `/sales/:id/returns` | `sales.return` | Required | Yes |
| GET | `/sales/returns` | `sales.view` | — | — |
| GET | `/sales/returns/:id` | `sales.view` | — | — |
| POST | `/sales/returns/:id/approve` | `sales.return` | — | Yes |
| POST | `/sales/returns/:id/reject` | `sales.return` | — | Yes |

---

## Self Audit

| Check | Result |
|-------|--------|
| `CompanyIsolationGuard` | PASS |
| `@RequireModule('sales')` | PASS |
| Create stores `sale.exchange_rate_used` on return | PASS |
| Return amounts computed from sale line unit prices | PASS |
| Approve restores stock via RETURN batch at original COGS | PASS |
| `inventory_movements` type RETURN on approve | PASS |
| Credit/mixed sales → `applyReturnCredit` at sale rate | PASS |
| Sale status → RETURNED on approve | PASS |
| Reject sets status REJECTED without stock/debt changes | PASS |
| Idempotency on create return | PASS |
| Route order: `/sales/returns` before `/sales/:id` | PASS |

---

## Contract Verification

| DTO / Behavior | OpenAPI | Match |
|----------------|---------|-------|
| `CreateSaleReturnRequest` | § Sales DTOs | YES |
| `SaleReturnResponse` | § Sales DTOs | YES |
| Approve/Reject `{ note? }` | § Sales DTOs | YES |
| Return uses original sale rate (R2) | RISK_FIX | YES |

---

## Build Status

| Test | Status |
|------|--------|
| `npm run build` | PASS |

---

## Files Used

- `src/modules/sales/application/sales.service.ts` — return methods
- `src/modules/debt/application/debt.service.ts` — `applyReturnCredit()`
