# Phase — Warehouse Backend Module

**Module:** Warehouse (CRUD, transfers, stock by warehouse, dashboard, reports)  
**Status:** COMPLETE  
**Date:** 2026-06-26

---

## Overview

Production-grade warehouse management built on the existing inventory module with FIFO-preserving transfers, multiple warehouses per company, company isolation, audit logging, and Swagger documentation. Frontend wired to real APIs — no mocks.

---

## Implemented Endpoints

### Warehouses

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/warehouses` | `inventory.view` | List active warehouses with stock stats |
| POST | `/warehouses` | `warehouses.manage` | Create warehouse |
| GET | `/warehouses/:id` | `inventory.view` | Warehouse detail + batches + movements |
| PATCH | `/warehouses/:id` | `warehouses.manage` | Update warehouse |
| POST | `/warehouses/:id/deactivate` | `warehouses.manage` | Deactivate (blocked if stock remains) |
| GET | `/warehouses/:id/dashboard` | `inventory.view` | Warehouse KPI dashboard |
| GET | `/warehouses/:id/reports` | `inventory.view` | Warehouse inventory reports |

### Inventory / Transfers

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/inventory/stock` | `inventory.view` | Stock by product + warehouse |
| GET | `/inventory/transfers` | `inventory.view` | Grouped transfer history |
| POST | `/inventory/transfers` | `inventory.transfer` | FIFO transfer (same branch) |
| GET | `/branches` | `inventory.view` | Branches for warehouse assignment |

Existing: receive, adjust, batches, movements (unchanged).

Swagger UI: `http://localhost:3000/api/docs` (tag: **Inventory**)

---

## FIFO Guarantee

Transfers use `deductFifo()` on source warehouse (oldest batch first) and create `TRANSFER_IN` batches at destination preserving unit cost. No sale FIFO allocations are modified.

Transfer flow:
1. Deduct FIFO slices from source
2. Create out `TRANSFER` movements (negative qty)
3. Create in batches (`TRANSFER_IN`, `sourceId` = original batch)
4. Create in `TRANSFER` movements (positive qty)
5. Link all movements via `referenceId` = transfer group id

**Same-branch rule:** `fromWarehouse.branchId` must equal `toWarehouse.branchId`.

---

## Database

### Migration

`prisma/migrations/20260626180000_warehouse_module/migration.sql`

- `warehouses.is_default` column
- Partial unique index: one default warehouse per company

### Seed

- `Asosiy ombor` (default)
- `Shimol ombori` (Shimol filiali)
- `Zaxira ombori` (Markaziy filial)

---

## Security

| Layer | Implementation |
|-------|----------------|
| JWT | Bearer token required |
| RBAC | `inventory.view`, `inventory.transfer`, `warehouses.manage` |
| Company isolation | `CompanyIsolationGuard` + `companyId` from JWT |
| Audit | CREATE/UPDATE on warehouse; CREATE on transfer |

---

## Module Structure

```
backend/src/modules/inventory/
├── api/
│   ├── inventory.controller.ts
│   └── dto/inventory.dto.ts
├── application/
│   ├── inventory.service.ts
│   └── inventory.helpers.ts   # FIFO core (unchanged contract)
└── inventory.module.ts
```

---

## Frontend Integration

| File | Purpose |
|------|---------|
| `desktop/src/api/endpoints.ts` | Warehouse + transfer paths |
| `desktop/src/api/services/domainApi.ts` | `inventoryApi` (transfer, CRUD, dashboard) |
| `desktop/src/stores/inventoryStore.ts` | State — stock levels, transfers, warehouse CRUD |
| `desktop/src/features/inventory/InventoryPage.tsx` | Stock by warehouse (`GET /inventory/stock`) |
| `desktop/src/features/inventory/WarehousesPage.tsx` | List + create warehouse |
| `desktop/src/features/inventory/WarehouseDetailPage.tsx` | Dashboard, batches, reports |
| `desktop/src/features/inventory/TransferPage.tsx` | Transfer + history |

---

## Build & Deploy

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run build

cd ../desktop
npm run build
```

**Build status:** PASS

---

## API Examples

### Create warehouse

```
POST /api/v1/warehouses
{ "name": "Zaxira ombori", "branchId": "uuid", "address": "..." }
```

### Transfer (FIFO)

```
POST /api/v1/inventory/transfers
{
  "productId": "uuid",
  "fromWarehouseId": "uuid",
  "toWarehouseId": "uuid",
  "quantity": "10"
}
```

### Transfer history

```
GET /api/v1/inventory/transfers?page=1&limit=20
```

### Warehouse dashboard

```
GET /api/v1/warehouses/:id/dashboard
```

### Stock by warehouse

```
GET /api/v1/inventory/stock?warehouseId=uuid
```

---

## Bug Fixes (this phase)

- Transfer `referenceId` now set on all movements in group (including first out movement)
- Same-branch validation enforced on transfers
- Frontend `InventoryPage` uses real per-warehouse stock API instead of product-level aggregate
