# P0 Fix Report

**Project:** ERP Desktop (`d:\erp\desktop`)  
**Date:** 2026-06-18  
**Scope:** P0-1 Currency conversion · P0-2 Localization (Uzbek default)  
**Verification:** `npm run typecheck` ✅ · `npm run build` ✅

---

## Executive Summary

Two business-critical P0 issues were fixed:

| ID | Issue | Status |
|----|-------|--------|
| P0-1 | Exchange rate changes did not propagate to prices, POS, debt, and payments | **Fixed** |
| P0-2 | Large parts of UI remained in English | **Fixed** (Uzbek default; i18n scaffold retained) |

Historical transactions remain frozen at their recorded exchange rate. All live balances and catalog prices derive USD from canonical UZS using the **current active rate**.

---

## P0-1 — Currency Conversion

### Root cause

1. **Dual static prices** — Products stored independent `priceUzs` and `priceUsd` values from mock seed data (computed at ~12,620 UZS/USD). Changing the rate did not recompute USD.
2. **No global sync on rate change** — `currencyStore.setRate()` archived old rates but never updated dependent stores.
3. **POS/debt used stale USD** — Cart totals and debt displays summed or displayed stored `priceUsd` / `debtUsd` instead of deriving from UZS at the active rate.
4. **Historical vs live not separated** — Live debt USD was treated as a separate accumulated balance instead of a derived field from `debtUzs`.

### Architecture applied

| Domain | Canonical | USD handling | Historical freeze |
|--------|-----------|--------------|-------------------|
| Product catalog | `priceUzs` | `productUsdFromUzs(priceUzs, activeRate)` | N/A (live catalog) |
| Customer debt balance | `debtUzs` | `uzsToUsd(debtUzs, activeRate)` | N/A (live balance) |
| Sales / returns | Line `priceUzs`, sale `totalUzs` | Computed at **sale `exchangeRate`** | Frozen on completed sale |
| Payments / debt history | `amountUzs` | `amountUsd` stored at transaction rate | Frozen per entry |

### Fixes applied

- **`currencySync.ts`** — Central `applyExchangeRate(rate)` syncs inventory product USD and customer debt USD from UZS.
- **`CurrencyBootstrap`** — Runs sync whenever the active rate changes (app mount + rate updates).
- **`currencyStore.setRate()`** — Calls `applyExchangeRate()` after persisting a new active rate.
- **`inventoryStore`** — `syncProductPricesWithRate`, `updateProductPriceUzs/Usd` keep UZS canonical.
- **`customerStore`** — `syncDebtUsdWithRate`; payments/credits store frozen `amountUsd` at transaction rate.
- **`posCartStore.getTotals()`** — USD total from UZS sum via `lineTotalUsd(totalUzs, activeRate)`.
- **`salesStore`** — Line and sale USD computed at sale rate; returns use the original sale's frozen rate.
- **UI pages** — Products, prices, POS, debt, customer profile display USD via live rate helpers.

### Manual verification checklist

1. Open **Sozlamalar → Valyuta kursi** (or `/settings/exchange-rates`).
2. Set a new rate (e.g. 1 USD = 13 000 so'm).
3. Confirm **Mahsulotlar**, **Narx boshqaruvi**, and **POS** USD columns update immediately.
4. Confirm **Qarzdorlik** and customer profile USD debt updates.
5. Complete a sale — open sale detail; `exchangeRate` chip shows rate at checkout time.
6. Change rate again — old sale totals unchanged; new POS sale uses new rate.

---

## P0-2 — Localization (Uzbek default)

### Root cause

- No centralized i18n layer; strings were hard-coded per component.
- Mock dashboard data, notification type chips, and some shell copy remained in English.
- `i18n/index.ts` catalog registration was incomplete (`{ uz }` shorthand without explicit mapping).

### Fixes applied

- **`src/i18n/`** — `t()` helper, default locale `uz`, `locales/uz.ts` with shell, company-select, dashboard, and common keys.
- **Shell** — TopBar, ConnectionIndicator, CompanySelectPage wired to `t()`.
- **Dashboard** — KPI labels, controls, chart section titles via `t()`; mock KPI meta, activity feed, payment split, and date labels translated in `mocks/dashboard.ts`.
- **Notifications** — Type chips show Uzbek labels (Ma'lumot, Ogohlantirish, …) instead of raw English enum values.
- **Shared components** — DataTable pagination, ConfirmDialog, FormDialog, ErrorBoundary, PermissionDeniedPage, LoginPage already Uzbek; verified unchanged.
- **Navigation** — `config/navigation.ts` sidebar labels already Uzbek.

### Intentionally unchanged (acceptable for P0)

- Product/brand names in mock data (Samsung, iPhone, etc.).
- Field labels like **Email**, **SKU**, **STIR** (standard Uzbek business terms).
- Chart series keys **UZS** / **USD** (currency codes, not UI copy).
- Technical `Error` class names in dev-only console paths.

Multilingual support remains prepared via the `t()` / locale catalog pattern; adding `ru` or `en` later requires only new locale files.

---

## Files changed

### Currency (P0-1)

| File | Change |
|------|--------|
| `src/services/currencySync.ts` | **New** — global rate sync |
| `src/app/CurrencyBootstrap.tsx` | **New** — reactive sync on active rate |
| `src/app/providers.tsx` | Mount CurrencyBootstrap |
| `src/utils/currency.ts` | UZS/USD helpers, product/line derivations |
| `src/stores/currencyStore.ts` | `setRate` triggers sync |
| `src/stores/inventoryStore.ts` | Price sync with rate |
| `src/stores/customerStore.ts` | Debt USD sync; transaction freeze |
| `src/stores/posCartStore.ts` | Totals from UZS + active rate |
| `src/stores/salesStore.ts` | Sale/return USD at sale rate |
| `src/features/sales/SalesPosPage.tsx` | Live USD display |
| `src/features/products/ProductsPage.tsx` | Live USD column |
| `src/features/products/PriceManagementPage.tsx` | Bidirectional UZS/USD with rate |
| `src/features/products/ProductFormPage.tsx` | Normalize on save |
| `src/features/products/ProductFormDialog.tsx` | Normalize on save |
| `src/features/products/ProductDetailPage.tsx` | Computed USD display |
| `src/features/customers/CustomerDebtPage.tsx` | Live debt USD |
| `src/features/customers/CustomerProfilePage.tsx` | Live debt USD secondary |
| `src/features/customers/RecordPaymentPage.tsx` | Reactive rate selector |
| `src/pages/DashboardPage.tsx` | Live exchange rate KPI |

### Localization (P0-2)

| File | Change |
|------|--------|
| `src/i18n/index.ts` | **New/fixed** — `t()`, catalog `{ uz: uz }` |
| `src/i18n/locales/uz.ts` | **New/extended** — translation keys |
| `src/components/organisms/TopBar.tsx` | Uzbek via `t()` |
| `src/components/molecules/ConnectionIndicator.tsx` | Uzbek labels |
| `src/pages/CompanySelectPage.tsx` | Uzbek via `t()`; TS syntax fix |
| `src/pages/DashboardPage.tsx` | Dashboard i18n keys |
| `src/features/notifications/NotificationsPage.tsx` | Uzbek type chip labels |
| `src/mocks/dashboard.ts` | Uzbek KPI meta, activity, chart labels |

---

## Remaining P1 issues (do not start until P0 verified)

From frontend audit — **not addressed in this P0 pass**:

| Priority | Issue | Location |
|----------|-------|----------|
| P1 | Category CRUD not synced to shared store | `CategoriesPage` |
| P1 | RolesPage mutations are mock-only (no persist) | `RolesPage` / `adminStore` |
| P1 | Settings (company prefs, theme aside) not persisted | `SettingsPage` |

### P2 backlog (explicitly out of scope)

- Reports / Analytics live data
- Dashboard KPIs tied to real sales (currently mock)
- Notifications persistence
- Real API backend integration
- Forgot-password flow
- Full second-locale (`en`) catalog

---

## Recommended sign-off test

```
1. Login → select company
2. Currency page: change rate to 13000
3. Products list + POS: USD prices change; UZS unchanged
4. Customer with debt: USD debt updates; UZS unchanged
5. Complete POS sale → sale detail shows frozen rate
6. Change rate again → historical sale unchanged
7. Walk sidebar + header: Uzbek labels throughout
8. Dashboard: no English meta/activity strings
```

---

*P0 fixes only. No new features. P1 work blocked until product owner confirms P0 verification.*
