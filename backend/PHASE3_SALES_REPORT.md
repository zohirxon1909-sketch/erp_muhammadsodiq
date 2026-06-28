# Phase 3 — Sales Module Report

**Module:** Sales (create, list, get)  
**Status:** COMPLETE  
**Date:** 2026-06-21

---

## Implemented Endpoints

| Method | Path | Permission | Idempotency | Audit |
|--------|------|------------|-------------|-------|
| GET | `/sales` | `sales.view` | — | — |
| POST | `/sales` | `sales.create` | Required | Yes |
| GET | `/sales/:id` | `sales.view` | — | — |

---

## Self Audit

| Check | Result |
|-------|--------|
| `CompanyIsolationGuard` on controller | PASS |
| `@RequireModule('sales')` | PASS |
| `@RequirePermissions` per endpoint | PASS |
| `AuditService` on POST /sales | PASS |
| Prisma `$transaction` on create | PASS |
| Single FIFO pass via `deductFifo` only | PASS |
| `sale_fifo_allocations` persisted in same TX | PASS |
| `inventory_movements` SALE audit-only | PASS |
| Frozen `exchangeRateUsed` from active rate | PASS |
| Credit/mixed → `debt_history` + customer cache | PASS |
| `totalPurchasesUzs` / `lastPurchaseAt` update | PASS |
| `IdempotencyService` 24h TTL scoped by company+endpoint+key | PASS |
| Warehouse resolved from user branch → company default | PASS |
| `sales.view_all` scopes list to own cashier | PASS |
| Decimal + `formatMoney` wire format | PASS |

---

## Contract Verification

| DTO / Behavior | OpenAPI | Match |
|----------------|---------|-------|
| `CreateSaleRequest` | § Sales DTOs | YES |
| `SaleResponse` | § Sales DTOs | YES |
| `SaleLineItemResponse` | § Sales DTOs | YES |
| `FifoAllocationResponse` | § Sales DTOs | YES |
| `SalePaymentResponse` | § Sales DTOs | YES |
| `SaleListFilters` | § Sales DTOs | YES |
| Mixed credit = `totalUzs - amountPaidUzs` | BR-09 | YES |

---

## Build Status

| Test | Status |
|------|--------|
| `npm run build` | PASS |

---

## Files Created

- `src/modules/sales/api/dto/sales.dto.ts`
- `src/modules/sales/api/sales.controller.ts`
- `src/modules/sales/application/sales.service.ts`
- `src/modules/sales/sales.module.ts`
