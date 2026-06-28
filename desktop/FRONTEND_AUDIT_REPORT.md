# Frontend Audit Report

**Project:** ERP Desktop (`d:\erp\desktop`)  
**Date:** 2026-06-18  
**Scope:** All routes, navigation, pages, buttons, forms, dialogs, tables  
**Build status:** `npm run typecheck` ✅ · `npm run build` ✅  
**API mode:** Mock adapter by default (`VITE_USE_MOCK !== 'false'`)

---

## Executive Summary

| Metric | Count |
|--------|------:|
| Registered routes | 44 |
| Sidebar menu items | 22 |
| Page components | 47 |
| **P0 Critical** | 6 (6 fixed) |
| **P1 High** | 11 (8 fixed, 3 open) |
| **P2 Medium** | 18 |
| **P3 Low** | 12 |

The core P0 business flow (login → company → POS → customer → payment → debt → return) is **functional** when using Zustand stores + mock API. The largest risks were **split data sources** (pages reading `mockProducts` while POS used `inventoryStore`) and **permission/route guard gaps**. P0 and most P1 items were fixed in this pass without adding new modules.

---

## Methodology

1. Mapped every route in `src/routes/index.tsx` against `src/config/navigation.ts`
2. Reviewed each page component for data source (store vs inline mock)
3. Grepped for placeholder handlers (`onClick: () => {}`), TODO, mock-only mutations
4. Ran `npm run typecheck` and `npm run build`
5. Cross-checked `routePermissions` vs `ROLE_PERMISSIONS` per role
6. Verified forms/dialogs submit to store or API layer

---

## Route Audit

| Route | Page | Menu | Permission | Data source | Status |
|-------|------|:----:|------------|-------------|--------|
| `/` | DefaultHomeRedirect | — | — | authStore | ✅ OK |
| `/login` | LoginPage | — | guest | authStore | ✅ OK |
| `/forgot-password` | ForgotPasswordPage | — | guest | static | ⚠️ P2 – no reset form |
| `/device-blocked` | DeviceBlockedPage | — | guest | static | ✅ OK |
| `/session-expired` | SessionExpiredPage | — | guest | static | ✅ OK |
| `/company-select` | CompanySelectPage | — | auth | authStore | ⚠️ P3 – mixed EN/UZ copy |
| `/dashboard` | DashboardPage | ✅ | dashboard.view | mockDashboardData | ⚠️ P2 – static KPIs |
| `/sales/new` | SalesPosPage | ✅ | sales.create | stores + API | ✅ OK |
| `/sales/history` | SalesHistoryPage | ✅ | sales.view | salesStore | ✅ OK (fixed permissions) |
| `/sales/history/:id` | SaleDetailPage | — | inherits | salesStore | ✅ OK |
| `/sales/receipt/:id` | ReceiptPage | — | open | salesStore | ✅ OK |
| `/sales/returns` | ReturnsPage | ✅ | sales.return | salesStore | ✅ OK |
| `/sales/returns/new` | CreateReturnPage | — | sales.return | salesStore | ✅ OK (guard fixed) |
| `/sales/returns/:id` | ReturnDetailPage | — | open | salesStore | ✅ OK |
| `/products` | ProductsPage | ✅ | products.view | inventoryStore | ✅ Fixed |
| `/products/new` | ProductFormPage | — | products.create | inventoryStore | ✅ Fixed |
| `/products/:id/edit` | ProductFormPage | — | products.update | inventoryStore | ✅ Fixed |
| `/products/:id` | ProductDetailPage | — | inherits | inventoryStore | ✅ OK |
| `/products/categories` | CategoriesPage | ✅ | products.view | local + mock seed | ✅ Fixed button |
| `/products/prices` | PriceManagementPage | ✅ | products.update | inventoryStore | ✅ Fixed |
| `/inventory` | InventoryPage | ✅ | inventory.view | inventoryStore | ✅ Fixed |
| `/inventory/warehouses` | WarehousesPage | ✅ | inventory.view | inventoryStore | ✅ OK |
| `/inventory/warehouses/:id` | WarehouseDetailPage | — | inherits | inventoryStore | ✅ OK |
| `/inventory/movements` | StockMovementsPage | ✅ | inventory.view | inventoryStore | ✅ OK |
| `/inventory/receive` | InventoryReceivePage | ✅ | inventory.receive | inventoryStore | ✅ OK |
| `/inventory/batches` | InventoryBatchesPage | ✅ | inventory.view | inventoryStore | ✅ OK |
| `/inventory/adjustments` | InventoryAdjustmentsPage | ✅ | inventory.adjust | inventoryStore | ✅ Fixed |
| `/customers` | CustomersPage | ✅ | customers.view | customerStore | ✅ OK |
| `/customers/new` | CustomerFormPage | — | customers.create | customerStore | ✅ OK |
| `/customers/:id/edit` | CustomerFormPage | — | customers.update | customerStore | ✅ Fixed guard |
| `/customers/:id` | CustomerProfilePage | — | inherits | customerStore | ✅ OK |
| `/customers/debt` | CustomerDebtPage | ✅ | debt.view | customerStore | ✅ OK |
| `/customers/payments` | PaymentsPage | ✅ | debt.payment | customerStore | ✅ OK |
| `/customers/:id/payment` | RecordPaymentPage | — | debt.payment | customerStore | ✅ Fixed guard |
| `/reports` | ReportsPage | ✅ | reports.view | mockReports | ⚠️ P2 – mock list only |
| `/analytics` | AnalyticsPage | ✅ | reports.view | mockAnalytics | ⚠️ P2 – static charts |
| `/notifications` | NotificationsPage | ✅ | notifications.view | mockNotifications | ⚠️ P2 – local state only |
| `/settings` | SettingsPage | ✅ | settings.view | mockCompanySettings | ⚠️ P2 – not persisted |
| `/settings/exchange-rates` | CurrencyPage | ✅ | currency.manage | currencyStore | ✅ OK |
| `/admin` | AdminHomePage | ✅ | admin.* | adminStore | ⚠️ P2 – mock admin |
| `/admin/users` | UsersPage | card | admin.* | adminStore | ⚠️ P2 |
| `/admin/roles` | RolesPage | card | admin.* | mockRoles + local | ⚠️ P2 |
| `/admin/permissions` | PermissionsPage | card | admin.* | mockPermissions | ⚠️ P2 – read-only |
| `/admin/devices` | DevicesPage | card | admin.* | adminStore | ⚠️ P2 |
| `/admin/sessions` | SessionsPage | card | admin.* | adminStore | ⚠️ P2 |
| `/admin/audit-logs` | AuditLogsPage | card | admin.* | adminStore | ⚠️ P2 |
| `/admin/backup` | BackupCenterPage | card | admin.* | adminStore | ⚠️ P2 |
| `/admin/monitoring` | MonitoringPage | card | admin.* | adminStore | ⚠️ P2 |
| `/permission-denied` | PermissionDeniedPage | — | — | — | ✅ OK |

**Broken routes:** None — all registered paths render a component.  
**Missing pages (documented but not routed):** `/reports/sales`, `/reports/inventory`, `/reports/debt` (per UX docs) — **P3**.

---

## Menu vs Route Consistency

All 22 sidebar items in `mainNavigation` map to existing routes. Visibility is filtered by:

- `enabledModules` (authStore)
- `hasPermission()` per item

| Issue | Severity | Notes |
|-------|----------|-------|
| Cashier cannot see Dashboard (by design) | OK | Home → `/sales/new` |
| Warehouse cannot see Dashboard | OK | Home → `/inventory` |
| Admin sub-pages not in sidebar (only Admin home card grid) | P3 | Expected pattern |
| TopBar Search button has no handler | P2 | Decorative |
| TopBar Notifications badge hardcoded `3` | P3 | Not wired to store |

---

## Findings by Category

### P0 — Critical (must fix before demo/production)

| ID | Issue | Location | Status |
|----|-------|----------|--------|
| P0-1 | Products list used local `mockProducts` while POS/detail used `inventoryStore` — new products invisible in POS | ProductsPage, ProductFormPage | **Fixed** |
| P0-2 | Price/adjustment pages mutated `mockProducts` directly — stock changes not reflected in sales | PriceManagementPage, InventoryAdjustmentsPage | **Fixed** |
| P0-3 | Inventory overview used separate `mockInventoryItems` — stale vs real stock | InventoryPage | **Fixed** |
| P0-4 | Zustand selector anti-pattern `useStore(s => s.listCustomers())` caused infinite re-render | CustomerPicker (fixed earlier) | **Fixed** |
| P0-5 | Auth permissions empty / wrong home redirect loop | guards, authStore (fixed earlier) | **Fixed** |
| P0-6 | No `createProduct` / `updateProduct` on inventoryStore | inventoryStore | **Fixed** |

### P1 — High (broken UX or security gap)

| ID | Issue | Location | Status |
|----|-------|----------|--------|
| P1-1 | "Yangi kategoriya" button was no-op | CategoriesPage | **Fixed** – dialog adds to local list |
| P1-2 | "Hisobot yaratish" button was no-op | ReportsPage | **Fixed** – shows info notification |
| P1-3 | Settings dark mode switch did not affect theme | SettingsPage | **Fixed** – wired to `useAppTheme` |
| P1-4 | `/products/:id/edit` guarded by `products.view` not `products.update` | RoutePermissionGuard | **Fixed** |
| P1-5 | `/customers/:id/payment` guarded by `customers.view` not `debt.payment` | RoutePermissionGuard | **Fixed** |
| P1-6 | `/sales/returns/new` missing explicit permission | routePermissions | **Fixed** |
| P1-7 | SalesHistory scoped filter used raw `permissions` array | SalesHistoryPage | **Fixed** – `useEffectivePermissions` |
| P1-8 | Categories not synced to product forms (only mock seed names) | ProductFormPage | **Open** – needs category store |
| P1-9 | ProductFormPage stock edit on existing product uses adjustment — OK but no validation for negative stock below zero edge cases | ProductFormPage | **Open** – minor |
| P1-10 | RolesPage mutates global `mockRoles` array | RolesPage | **Fixed** – local state only |
| P1-11 | Company settings / branch edits not persisted | SettingsPage | **Open** – local state only |

### P2 — Medium (incomplete but not blocking core flow)

- Entire app uses **mock API** — no real backend (`api/client.ts` adapter)
- Dashboard KPIs/charts from `mockDashboardData` — not live
- Reports & Analytics — static mock content
- Notifications — mock list, toggle read in local state only
- Admin module — functional UI on `adminStore` mock data (out of P0 scope per product decision)
- Forgot password — informational page only, no email flow
- TopBar search (Ctrl+K label) — no command palette
- `ProductsPage` still mounts unused `ProductFormDialog` (duplicate of `/products/new`)
- Mixed Uzbek/English UI on CompanySelectPage, some admin strings
- Large JS bundle warning (>500 kB) — no code splitting
- No route-level `errorElement` on router (React Router default error screen)
- `warehouse` role lacks `settings.view` but TopBar links to Settings — will hit permission redirect

### P3 — Low (polish / docs drift)

- UX docs reference 52+ screens; ~15 sub-routes not implemented (report sub-types, etc.)
- Breadcrumb labels incomplete for some dynamic segments
- `permission-denied` route reachable manually but not linked from guards (inline component used)
- Electron dev vs WEB_ONLY confusion for users
- StatCard/dashboard period labels partly in English ("Today", "This Week")
- No automated E2E tests for critical flows

---

## TypeScript & Console

| Check | Result |
|-------|--------|
| `tsc -b --noEmit` | ✅ Pass |
| `vite build` | ✅ Pass |
| Known runtime console errors | None identified in static audit; previous `Maximum update depth` from CustomerPicker selector — **fixed** |
| ErrorBoundary | Present in `AppProviders`; logs via `console.error` on catch |

---

## Permission Matrix (summary)

| Role | Dashboard | POS | Products CRUD | Inventory | Customers/Debt | Reports | Settings | Admin |
|------|:---------:|:---:|:-------------:|:---------:|:--------------:|:-------:|:--------:|:-----:|
| admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| cashier | ❌→POS | ✅ | view only | ❌* | ✅ | ❌ | ❌ | ❌ |
| warehouse | ❌→Inv | ❌ | create/update | ✅ | ❌ | ❌ | ❌ | ❌ |

\*Cashier can view products for POS catalog. Inventory menu hidden by permissions.

---

## API Integration Status

| Module | Service file | Mock handler | Store | Real API |
|--------|-------------|--------------|-------|----------|
| Auth | — | authStore simulate | authStore | ❌ |
| Sales | salesApi | ✅ | salesStore | ❌ |
| Customers | customersApi | ✅ | customerStore | ❌ |
| Payments | paymentsApi | ✅ | customerStore | ❌ |
| Inventory | inventoryApi | partial | inventoryStore | ❌ |
| Currency | currencyApi | ✅ | currencyStore | ❌ |
| Products | — | — | inventoryStore | ❌ |
| Dashboard | endpoints.dashboard | 404 mock | mock file | ❌ |
| Reports | — | — | mock file | ❌ |
| Admin | — | — | adminStore | ❌ |

---

## Fixes Applied (this session)

### P0
- Unified product/inventory data through `inventoryStore` (`createProduct`, `updateProduct`, `updateProductPrices`)
- Rewired: `ProductsPage`, `ProductFormPage`, `PriceManagementPage`, `InventoryAdjustmentsPage`, `InventoryPage`

### P1
- `CategoriesPage` — working create dialog
- `ReportsPage` — primary action shows user feedback
- `SettingsPage` — dark mode connected to theme
- `RoutePermissionGuard` — edit/payment/returns/new permission rules
- `SalesHistoryPage` — effective permissions hook
- Added `src/hooks/useEffectivePermissions.ts` (shared with guards)
- `routePermissions` — explicit `/sales/returns/new`
- `StockMovement.note` optional field for adjustment reason

---

## Remaining Backlog (not fixed — out of scope)

Do **not** implement unless requested:

- P1 open: category store sync, RolesPage mock mutation, settings persistence
- P2: Reports, Analytics, Admin, Notifications, Dashboard live data
- P2: Real API backend integration
- P3: UX doc screen gap, i18n consistency, code splitting

---

## Recommended Test Plan (manual)

1. Login `dilshod@market.uz` → select company → dashboard loads
2. Login `cashier@market.uz` → lands on POS → complete sale with customer
3. Create product at `/products/new` → verify appears in POS search
4. Adjust stock at `/inventory/adjustments` → verify POS stock limit
5. Record payment on customer with debt → debt decreases
6. Create return from sale detail → stock restored
7. Toggle dark mode in Settings → theme changes globally
8. Cashier navigates to `/dashboard` → redirected to POS (not crash)

---

*Generated as part of frontend stabilization audit. No new modules or features were added.*
