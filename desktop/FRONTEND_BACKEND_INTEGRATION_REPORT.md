# Frontend ↔ Backend Integration Report

**Date:** 2026-06-18  
**Phase:** Backend ↔ Desktop Integration  
**Contract:** Frozen — [`OPENAPI_MASTER_SPEC.md`](./OPENAPI_MASTER_SPEC.md), [`API_CONTRACT_FREEZE.md`](./API_CONTRACT_FREEZE.md)  
**Default API:** `http://localhost:3000/api/v1` (`VITE_USE_MOCK=false`)

---

## Executive summary

| Area | Status |
|------|--------|
| Auth | **CONNECTED** |
| Currency | **CONNECTED** |
| Products | **CONNECTED** |
| Categories | **CONNECTED** |
| Customers | **CONNECTED** |
| Inventory | **CONNECTED** |
| Sales | **CONNECTED** |
| Payments (debt) | **CONNECTED** |
| Returns | **CONNECTED** |
| Void | **CONNECTED** |
| Admin / Reports / Dashboard | **MOCK** (out of scope) |

Core ERP flows now call the NestJS backend. Zustand stores are thin API-backed caches; duplicated FIFO, debt, and sale-completion logic was removed from the frontend. The backend is the source of truth.

**Demo credentials:** `admin@erp.uz` / `Admin123!` (company `MKT-TAS`)

---

## Architecture changes

| Before | After |
|--------|-------|
| `localStorage` persist + `mockHandlers` adapter (default) | Real axios client; mock opt-in via `VITE_USE_MOCK=true` |
| Stores computed sales, FIFO, debt | Stores fetch/mutate via `src/api/services/*` |
| `currencySync.ts` recalculated prices/debt | No-op — backend owns conversions |
| `completeSale` in `salesStore` | `salesApi.create` from POS |
| `customersApi.archive` | `DELETE /customers/:id` via store |
| Flat pagination `{ total, pageSize }` | `{ data, meta: { page, limit, total, totalPages } }` |
| Money as `number` in requests | `toMoneyString()` decimal strings on wire |

**Bootstrap:** `DataBootstrap` loads rates, inventory, customers, payments, sales, and returns when a company is selected.

**New API layer:** `src/api/services/` (`authApi`, `catalogApi`, `domainApi`, `salesApi`) + `src/api/mappers.ts`.

---

## Connected endpoints

### Auth (`authApi` → `authStore`)

| Method | Endpoint | Used by |
|--------|----------|---------|
| POST | `/auth/login` | Login, session restore |
| POST | `/auth/logout` | Logout |
| POST | `/auth/refresh` | Token refresh (401 path) |
| GET | `/auth/me` | `hydrateSession` |
| POST | `/auth/switch-company` | Company select |

Headers: `Authorization`, `X-Company-Id`, `X-Device-Id`.

### Currency (`currencyApi` → `currencyStore`)

| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/currency/rate` | Active rate |
| GET | `/currency/rates` | Rate history |
| POST | `/currency/rates` | Set new rate (`CurrencyPage`) |

### Products & categories (`productsApi`, `categoriesApi`)

| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/products` | Inventory store, product lists |
| GET | `/products/:id` | Product detail |
| GET | `/products/search` | Search (API ready) |
| GET | `/products/barcode/:code` | Barcode scan (API ready) |
| POST | `/products` | Product create |
| PATCH | `/products/:id` | Product update, price management |
| DELETE | `/products/:id` | API ready (no UI yet) |
| GET | `/pos/products` | API ready (POS uses store cache) |
| GET | `/categories` | Categories page, product forms |
| POST | `/categories` | Categories page |
| PATCH | `/categories/:id` | API ready (no edit UI) |
| DELETE | `/categories/:id` | API ready (no delete UI) |

### Inventory (`inventoryApi` → `inventoryStore`)

| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/inventory/batches` | Batches page |
| GET | `/inventory/movements` | Movements page |
| POST | `/inventory/receive` | Receive stock |
| POST | `/inventory/adjust` | Adjustments |
| GET | `/warehouses` | Warehouse list |
| GET | `/warehouses/:id` | Warehouse detail |
| POST | `/warehouses` | API ready (no create UI) |
| GET | `/inventory/stock` | API exposed; UI uses product `stock` field |
| POST | `/inventory/transfers` | **Not wired** (no UI) |

### Customers & debt (`customersApi`, `debtApi` → stores)

| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/customers` | Customer list |
| GET | `/customers/search` | API ready |
| GET | `/customers/:id` | API ready |
| POST | `/customers` | Customer form |
| PATCH | `/customers/:id` | Customer form |
| DELETE | `/customers/:id` | Archive customer |
| GET | `/customers/:id/debts` | API ready (not used in UI yet) |
| GET | `/customers/:id/debt-history` | Customer profile |
| GET | `/debt-payments` | Payments list |
| POST | `/debt-payments` | Record payment (`Idempotency-Key`) |
| POST | `/debt-payments/:id/reverse` | API ready (no reverse UI) |
| GET | `/debt/summary` | API ready |
| GET | `/debt/customers` | API ready |
| GET | `/debt/aging` | API ready |

### Sales, void, returns (`salesApi` → `salesStore`)

| Method | Endpoint | Used by |
|--------|----------|---------|
| GET | `/sales` | Sales history |
| POST | `/sales` | POS checkout (`Idempotency-Key`) |
| GET | `/sales/:id` | Sale detail |
| POST | `/sales/:id/void` | Void sale (`Idempotency-Key`) |
| POST | `/sales/:id/returns` | Create return |
| GET | `/sales/returns` | Returns list |
| GET | `/sales/returns/:id` | Return detail |
| POST | `/sales/returns/:id/approve` | Approve return |
| POST | `/sales/returns/:id/reject` | Reject return |

### Health

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/health` | Not wired in UI; `ConnectionIndicator` uses app state |

---

## Removed frontend business logic

| Removed | Replacement |
|---------|-------------|
| `salesStore.completeSale` | `salesApi.create` |
| FIFO batch deduction in `inventoryStore` | Backend on sale/void/return |
| `customerStore` debt application on payment | `debtApi.recordPayment` + refetch |
| `currencySync.applyExchangeRate` / `syncAllWithActiveRate` | No-op |
| localStorage persist on domain stores | In-memory cache + `DataBootstrap` refetch |
| Mock email heuristics in auth | Real `authApi.login` |
| `inventoryConsistencyAudit` FIFO steps | Deprecated — backend-owned |

**Display-only helpers retained:** `getSaleCreditUzs`, `productUsdFromUzs` (UI formatting, not persistence).

---

## Remaining mocks

These modules were **not** in the integration scope (no Phase 1–3 backend modules):

| Module | Files | Data source |
|--------|-------|-------------|
| Dashboard | `pages/DashboardPage.tsx` | `mocks/dashboard.ts` |
| Reports | `features/reports/ReportsPage.tsx` | `mocks/data.ts` |
| Analytics | `features/reports/AnalyticsPage.tsx` | `mocks/data.ts` |
| Notifications | `features/notifications/NotificationsPage.tsx` | `mocks/data.ts` |
| Settings / branches | `features/settings/SettingsPage.tsx` | `mocks/data.ts` |
| Admin users/roles/devices | `stores/adminStore.ts`, admin pages | `mocks/data.ts` |

**Legacy mock adapter:** `src/api/mockHandlers.ts` — **stale/broken** if `VITE_USE_MOCK=true` (references removed `completeSale`, old paths like `/payments`, `PUT /customers`). Use real API for integration testing.

**Static mock data file:** `src/mocks/data.ts` — still imported by out-of-scope pages only.

---

## API errors & runtime notes

| Issue | Severity | Notes |
|-------|----------|-------|
| Backend not running | Blocker | All domain calls fail with network error |
| 401 on expired token | Expected | Client logs out via interceptor |
| `npm run typecheck` | Unverified in CI shell | Node/npm not available in agent environment; IDE linter clean |
| POS stock check | Client-side only | Final stock validation is server-side; insufficient stock returns API error |
| Pagination limit 100 | Low | Lists truncate at 100 items until paging UI added |
| Company switch | Medium | `DataBootstrap` refetches on `activeCompanyId` change |
| Sale detail loading | Low | Shows "not found" briefly before `fetchSaleById` completes |

**Error envelope:** Client parses `{ error: { code, message, details, requestId } }` per frozen contract.

---

## Contract mismatches (UI adaptations — API unchanged)

These are **intentional frontend mappings**; the frozen API contract was not modified.

| Wire (API) | UI entity | Mapper / note |
|------------|-----------|---------------|
| `ACTIVE`, `COMPLETED`, etc. | `active`, `completed` | `mappers.ts` `lowerStatus` |
| Four prices + `categoryId` | `priceUzs`, `priceUsd`, `category` (name) | `mapProduct` derives display fields |
| `purchasePriceUzs` on create | Form uses `priceUzs × 0.72` heuristic | **UI-only** estimate until edit |
| `DELETE /customers/:id` | "Archive" action | Semantics aligned |
| `POST /debt-payments` | `Payment` entity | `mapDebtPayment` |
| `paymentMethod: CASH\|CARD\|BANK_TRANSFER` | `cash\|card\|transfer` | `customerStore.methodToApi` |
| `User.name` | `firstName` + `lastName` | `mapUser` |
| Product stock on wire | Read-only in forms | Stock changes via receive/adjust only |

---

## Environment

Copy [`.env.example`](./.env.example):

```env
VITE_API_URL=http://localhost:3000/api/v1
VITE_USE_MOCK=false
```

**Backend startup (separate terminal):**

```bash
cd backend
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
```

**Desktop:**

```bash
cd desktop
npm run dev
```

---

## Manual test checklist

- [ ] Login with `admin@erp.uz` / `Admin123!`
- [ ] Select company `MKT-TAS` if prompted
- [ ] Currency page shows rate history; set new rate refreshes list
- [ ] Categories: list + create
- [ ] Products: create, edit, price management
- [ ] Inventory: receive, adjust, batches, movements
- [ ] Customers: create, edit, archive, debt history tab
- [ ] Record debt payment
- [ ] POS: complete cash/credit/mixed sale
- [ ] Sale detail: void
- [ ] Create return → approve/reject on return detail

---

## Files touched (integration)

**Created:** `src/api/services/*`, `src/api/mappers.ts`, `src/app/DataBootstrap.tsx`, `src/utils/money.ts`, `src/utils/deviceId.ts`, `src/utils/idempotency.ts`, `.env.example`

**Rewritten stores:** `authStore`, `currencyStore`, `inventoryStore`, `customerStore`, `salesStore`

**Updated pages:** POS, sale/return detail, customers, products, categories, currency, inventory, payments

**Deprecated:** `src/audit/inventoryConsistencyAudit.ts` (backend-owned FIFO)

---

## Next steps (optional, out of scope)

1. Wire dashboard/reports to future analytics API
2. Add pagination UI for large lists
3. Use `GET /pos/products` in POS for server-side search
4. Remove or rewrite `mockHandlers.ts` for offline dev
5. Wire `POST /inventory/transfers` when transfers UI exists
6. Debt summary/aging pages using `/debt/*` endpoints

---

**Integration phase status:** **COMPLETE** for Auth, Currency, Products, Categories, Customers, Inventory, Sales, Payments, Returns, and Void.
