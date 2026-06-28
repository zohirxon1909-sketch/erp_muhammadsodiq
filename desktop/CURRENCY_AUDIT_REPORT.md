# Currency Audit Report

**Project:** ERP Desktop (`d:\erp\desktop`)  
**Date:** 2026-06-18  
**Scope:** Post P0-1 currency fix — read-only audit (no code changes)  
**Build reference:** P0 fix accepted; `npm run typecheck` / `npm run build` passing at time of P0 delivery

---

## Audit Summary

| Area | UZS | USD | Rate reactive | Historical freeze | Verdict |
|------|:---:|:---:|:-------------:|:-----------------:|---------|
| Products | ✅ | ✅ | ✅ | N/A (live catalog) | **Verified** |
| Inventory | ✅ | — | ✅ (via priceUzs) | N/A | **Verified** |
| Stock batches | ✅ | — | — | ✅ (cost at receipt) | **Verified** |
| FIFO | ✅ | — | — | ✅ (on sale record) | **Verified** |
| Sales | ✅ | ✅ | — | ✅ | **Verified** |
| POS | ✅ | ✅ | ✅ | ✅ (at checkout) | **Verified** |
| Debt (live) | ✅ | ✅ | ✅ | N/A | **Verified** |
| Payments | ✅ | ✅ | — | ✅ | **Verified** |
| Customer profile | ✅ | ✅ | ✅ | ✅ (history UZS) | **Verified** |
| Reports | — | — | — | — | **Not applicable** |
| Dashboard KPIs | ⚠️ | ⚠️ | ⚠️ partial | N/A (mock) | **Partial** |

**Core rule in code:** UZS is canonical for live product prices and customer debt balances. USD is derived via `uzsToUsd(amount, rate)` except where explicitly frozen on completed transactions.

---

## Currency Engine Reference

**Source:** `src/utils/currency.ts`

| Function | Behavior | Precision |
|----------|----------|-----------|
| `uzsToUsd(uzs, rate)` | `round(uzs / rate × 100) / 100` | USD: 2 decimals |
| `usdToUzs(usd, rate)` | `round(usd × rate)` | UZS: integer (so'm) |
| `productUsdFromUzs` | Alias of `uzsToUsd` | 2 decimals |
| `productUzsFromUsd` | Alias of `usdToUzs` | integer |
| `lineTotalUsd` | Alias of `uzsToUsd` on line/sale total UZS | 2 decimals |

**Sync pipeline:** `currencyStore.setRate()` → `applyExchangeRate()` → `inventoryStore.syncProductPricesWithRate()` + `customerStore.syncDebtUsdWithRate()`.  
**Bootstrap:** `CurrencyBootstrap` re-syncs on every active-rate change at app mount and after rate updates.

**Formatting:** `formatUzs` — integer grouping + ` so'm`; `formatUsd` — `$` + 2 decimals (`en-US` locale).

---

## Verified Areas (Detail)

### 1. Products

| Check | Result | Evidence |
|-------|--------|----------|
| UZS canonical | ✅ | `inventoryStore.syncProductPricesWithRate` only updates `priceUsd` from `priceUzs` |
| USD display at live rate | ✅ | `ProductsPage`, `ProductDetailPage`, `PriceManagementPage` use `productUsdFromUzs(..., exchangeRate)` |
| Rate change propagation | ✅ | `CurrencyBootstrap` + `setRate` → full product USD sync |
| Create/edit normalize USD | ✅ | `ProductFormPage`, `ProductFormDialog` save `priceUsd = productUsdFromUzs(priceUzs, rate)` |
| Bidirectional price edit | ✅ | `updateProductPriceUzs` / `updateProductPriceUsd` in `PriceManagementPage` |

**Verified files:** `inventoryStore.ts`, `ProductsPage.tsx`, `ProductFormPage.tsx`, `ProductFormDialog.tsx`, `PriceManagementPage.tsx`, `ProductDetailPage.tsx`

---

### 2. Inventory

| Check | Result | Evidence |
|-------|--------|----------|
| Valuation currency | UZS only | `InventoryPage` computes `valueUzs = round(stock × priceUzs × 0.72)` |
| Reacts to price change | ✅ | Recalculates from live `priceUzs` in store |
| Reacts to rate change | N/A (correct) | Stock value in so'm should not change when FX rate changes |
| USD column | None | By design — no false USD inventory figures |

**Verified files:** `InventoryPage.tsx`, `WarehouseDetailPage.tsx`

---

### 3. Stock Batches

| Check | Result | Evidence |
|-------|--------|----------|
| Cost field | `costUzs` only | `ProductBatch.costUzs` set at receive (`receiveStock`) or seed (72% of sale price) |
| USD | Not used | No conversion on batch records |
| Rate sensitivity | None | Batch cost is historical purchase cost in UZS |

**Verified files:** `inventoryStore.ts` (`receiveStock`, `buildInitialBatches`), `InventoryBatchesPage.tsx`, `InventoryReceivePage.tsx`

---

### 4. FIFO

| Check | Result | Evidence |
|-------|--------|----------|
| Allocation cost | UZS | `allocateFifoForSale` stores `costUzs = batch.costUzs × qty` |
| Frozen on sale | ✅ | `salesStore.buildSaleDetail` persists `fifoAllocations[]` on `SaleDetail` |
| Sale price vs COGS | Independent | Sale line prices from product `priceUzs`; FIFO cost from batch `costUzs` |
| USD on FIFO tab | None | `SaleDetailPage` FIFO tab shows `formatUzs(f.costUzs)` only |

**Verified files:** `inventoryStore.ts` (`allocateFifoForSale`), `salesStore.ts`, `SaleDetailPage.tsx`

---

### 5. Sales

| Check | Result | Evidence |
|-------|--------|----------|
| Line UZS | ✅ | `lineUzs = product.priceUzs × qty` at checkout |
| Line USD | ✅ | `uzsToUsd(unitPriceUzs, saleRate)` per line; `lineTotalUsd(lineUzs, saleRate)` |
| Sale total USD | ✅ | Derived from **total UZS** (not sum of rounded line USD) — avoids rounding drift |
| `exchangeRate` stored | ✅ | `SaleDetail.exchangeRate` from POS payload |
| Historical immutability | ✅ | Persisted sale records; mock seed uses fixed `exchangeRate: 12_620` |
| List/detail display | ✅ | `SalesHistoryPage`, `SaleDetailPage`, `ReceiptPage` show frozen `totalUzs` / `totalUsd` |

**Verified files:** `salesStore.ts` (`buildSaleDetail`), `SalesHistoryPage.tsx`, `SaleDetailPage.tsx`, `ReceiptPage.tsx`

---

### 6. POS

| Check | Result | Evidence |
|-------|--------|----------|
| Cart total UZS | ✅ | Sum of `item.product.priceUzs × qty` |
| Cart total USD | ✅ | `lineTotalUsd(totalUzs, getActiveRate())` in `posCartStore.getTotals()` |
| Display USD mode | ✅ | `productUsdFromUzs(product.priceUzs, exchangeRate)` — not stored `priceUsd` |
| Checkout rate | ✅ | `SalesPosPage` passes reactive `exchangeRate` to `salesApi.create` |
| Payment settlement | UZS | `PaymentDialog` always records `receivedUzs` / `creditAmountUzs` |
| Rate shown in UI | ✅ | Header shows current rate |

**Verified files:** `posCartStore.ts`, `SalesPosPage.tsx`, `PaymentDialog.tsx`

---

### 7. Debt

| Check | Result | Evidence |
|-------|--------|----------|
| Live balance UZS | ✅ | Canonical `customer.debtUzs` |
| Live balance USD | ✅ | `syncDebtUsdWithRate` + UI derives via `productUsdFromUzs(debtUzs, rate)` |
| Sale credit | ✅ | `applySaleCredit` adds UZS; stores `amountUsd` at **transaction rate** |
| Payment | ✅ | `recordPayment` reduces UZS; stores frozen `amountUsd` |
| Debt list totals | ✅ | `CustomerDebtPage` sums UZS; USD total from `productUsdFromUzs(totalDebtUzs, rate)` |
| Debt history UZS | ✅ Frozen | `amountUzs`, `balanceAfterUzs` stored per entry |
| Debt history USD in UI | Hidden | Profile debt tab shows UZS only (stored `amountUsd` not displayed) |

**Verified files:** `customerStore.ts`, `CustomerDebtPage.tsx`, `CustomerProfilePage.tsx`, `CustomerPicker.tsx` (UZS debt only)

---

### 8. Payments

| Check | Result | Evidence |
|-------|--------|----------|
| Input | UZS only | `RecordPaymentPage` schema: `amountUzs` |
| Stored USD | Frozen | `amountUsd = uzsToUsd(amountUzs, rateAtPayment)` |
| Journal display | ✅ | `PaymentsPage` shows frozen `amountUzs` + `amountUsd` |
| Rate at payment | ✅ | `recordPayment` uses `getActiveRate()` at submit time |
| Overpayment guard | UZS | Validates against `customer.debtUzs` |

**Verified files:** `customerStore.ts`, `RecordPaymentPage.tsx`, `PaymentsPage.tsx`

---

### 9. Customer Profile

| Check | Result | Evidence |
|-------|--------|----------|
| Debt stat UZS | ✅ | `formatUzs(customer.debtUzs)` |
| Debt stat USD (secondary) | ✅ | `productUsdFromUzs(debtUzs, exchangeRate)` — live rate |
| Sales tab | UZS only | Frozen sale amounts |
| Payments tab | UZS only | Correct for display consistency |
| Rate reactivity | ✅ | Reactive `exchangeRate` selector |

**Verified files:** `CustomerProfilePage.tsx`

---

### 10. Reports

| Check | Result | Evidence |
|-------|--------|----------|
| Currency logic | None | `ReportsPage` lists mock metadata only; no generation or totals |
| Risk | Low | No incorrect conversions; reports simply not implemented |

**Verified files:** `ReportsPage.tsx`, `mocks/data.ts` (`mockReports`)

---

### 11. Dashboard KPIs

| Check | Result | Evidence |
|-------|--------|----------|
| Exchange rate KPI | ✅ Live | `formatRate(activeRate)` from `currencyStore` |
| All other KPIs | ⚠️ Static mock | `mockDashboardData` — hardcoded UZS/USD strings at ~12 620 rate |
| Sales trend chart | ⚠️ Static | Mock `uzs`/`usd` numeric pairs; USD does not update with rate |
| Inventory value KPI | ⚠️ Static | Mock `$67,320.00` unrelated to live inventory store |
| Outstanding debt KPI | ⚠️ Static | Does not read `customerStore` totals |

**Verdict:** Only the **exchange rate stat card** reflects live currency state. Other USD KPIs are **demonstration data** and will disagree with live modules after a rate change. This is acceptable for mock dashboard scope but must be documented for operators.

**Verified files:** `DashboardPage.tsx`, `mocks/dashboard.ts`

---

## Rounding & Precision Audit

### Rules observed in code

| Domain | UZS | USD |
|--------|-----|-----|
| Product sale price | Integer input | 2 dp derived |
| Sale/payment/debt transaction | Integer | 2 dp frozen at transaction |
| Display | Space-separated integer + so'm | `$X,XXX.XX` |

### Verified behavior

1. **Sale total USD** is computed from **aggregate UZS**, not sum of per-line USD → prevents cumulative rounding error (verified in `buildSaleDetail`).
2. **Round-trip drift** exists when converting UZS → USD → UZS (by design of 2 dp USD):

   | UZS | Rate | USD | Round-trip UZS | Drift |
   |-----|------|-----|----------------|-------|
   | 4 500 000 | 12 620 | 356.58 | 4 500 040 | +40 so'm |
   | 4 500 000 | 13 000 | 346.15 | 4 499 950 | −50 so'm |
   | 35 000 | 13 000 | 2.69 | 34 970 | −30 so'm |

   **Impact:** Editing price via **USD field** (`updateProductPriceUsd`) can shift UZS by tens of so'm. UZS-first entry avoids this.

3. **POS change calculation** uses integer UZS (`calcChange(receivedUzs, totalUzs)`) — correct for cash.

4. **Currency page rate input** uses `parseInt` — fractional rates (e.g. 12620.5) not supported; aligns with integer UZS/USD business rule.

---

## Historical Transaction Freezing

| Entity | Frozen fields | Rate used | Verified |
|--------|---------------|-----------|----------|
| Completed sale | `totalUzs`, `totalUsd`, `exchangeRate`, line prices, `payments[].amountUsd` | Rate at checkout | ✅ |
| Sale receipt | Same as sale | Sale rate | ✅ |
| Payment record | `amountUzs`, `amountUsd` | Rate at payment | ✅ |
| Debt history entry | `amountUzs`, `amountUsd`, `balanceAfterUzs`, `balanceAfterUsd` | Rate at entry creation | ✅ |
| Return record (create) | `amountUzs`, `amountUsd` | **Sale's** `exchangeRate` | ✅ |
| FIFO allocation on sale | `costUzs` | N/A (COGS in UZS) | ✅ |
| Mock seed sales | Reconstructed with `exchangeRate: 12_620` | Fixed seed | ✅ |

**After rate change:** Opening an old sale/receipt/payment still shows original USD. Confirmed by architecture; sale store is persisted and not recomputed.

---

## Remaining Risks

| ID | Severity | Area | Description |
|----|----------|------|-------------|
| R1 | **Medium** | Dashboard | USD KPIs and charts use static mock data; misleading after rate change except exchange-rate card |
| R2 | **Medium** | Returns / debt | `approveReturn` → `applyReturnCredit` records debt history `amountUsd` at **current** rate, while return `amountUsd` was computed at **sale** rate — audit trail inconsistency |
| R3 | **Medium** | POS cart | Cart holds product **snapshot**; if `priceUzs` changes while cart is open, totals use stale snapshot until item re-added |
| R4 | **Medium** | POS USD mode | `PaymentDialog` shows USD total but all cash/credit inputs remain UZS — display-only USD toggle; operators may expect USD payment entry |
| R5 | **Low** | Product form | USD field editable in UI but save path ignores manual USD (always derives from UZS) — confusing if user edits USD only |
| R6 | **Low** | `updateProductPrices` | Store API allows setting arbitrary UZS+USD pair without rate sync — unused in UI today but bypass exists |
| R7 | **Low** | Void sale | `voidSale` restores stock but does **not** reverse customer credit debt for credit/mixed sales |
| R8 | **Low** | Seed data | Mock `priceUsd` / `debtUsd` / payment `amountUsd` may not exactly equal `uzsToUsd` at 12 620 until first `CurrencyBootstrap` sync |
| R9 | **Low** | Payments journal | `PaymentsPage` shows frozen historical `amountUsd`; after rate change, USD column does not reflect “current equivalent” (correct for audit, may confuse users expecting live conversion) |
| R10 | **Info** | Reports | No currency reporting until report generation is built |

---

## Edge Cases

| # | Scenario | Expected | Actual | Status |
|---|----------|----------|--------|--------|
| E1 | Change rate 12 620 → 13 000 | Product USD ↓, UZS unchanged | Sync via `applyExchangeRate` | ✅ |
| E2 | Complete sale at 13 000, then rate → 14 000 | Sale USD unchanged | Frozen on `SaleDetail` | ✅ |
| E3 | Record payment, then change rate | Payment `amountUsd` unchanged; live debt USD updates | Matches | ✅ |
| E4 | Customer with debt, rate changes | `debtUzs` same; displayed USD updates | Matches | ✅ |
| E5 | Edit price via USD in Price Management | UZS recalculated with possible ±drift | `usdToUzs` rounding | ⚠️ Accept with awareness |
| E6 | POS currency = USD | Show USD prices/total | Display OK; payment still UZS | ⚠️ See R4 |
| E7 | Return approved on credit sale | Debt reduced by return UZS | Works; USD in debt history may use wrong rate | ⚠️ See R2 |
| E8 | Void credit sale | Debt should decrease | Debt **not** reversed | ❌ See R7 |
| E9 | Rate = 0 or negative | Safe zero | `uzsToUsd` / `usdToUzs` return 0 | ✅ |
| E10 | Mixed payment credit + rate change before submit | N/A | Credit stored in UZS at checkout rate | ✅ |
| E11 | Dashboard debt KPI vs Customer debt page | Should align | Dashboard mock ≠ live store | ⚠️ See R1 |
| E12 | Inventory value after rate change | UZS value unchanged | Correct (local currency valuation) | ✅ |

---

## Test Scenarios (Manual QA)

### TS-1 — Rate propagation (live data)

1. Note product P1: UZS price and computed USD at current rate.
2. Set new rate on **Valyuta kursi** (e.g. 13 000).
3. Verify: **Mahsulotlar**, **Narx boshqaruvi**, **POS** catalog USD updated; UZS unchanged.
4. Verify: **Qarzdorlik** USD column and profile debt secondary USD updated.

**Pass criteria:** USD values = `round(priceUzs / 13000, 2)` for products; debt USD = `round(debtUzs / 13000, 2)`.

---

### TS-2 — Historical sale freeze

1. Set rate to 12 620. Complete POS sale (note total USD on receipt).
2. Change rate to 13 000.
3. Open **Sotuvlar tarixi** → sale detail → verify `totalUsd` and **Kurs** chip still show 12 620-era values.

**Pass criteria:** Sale `exchangeRate`, `totalUsd`, line `unitPriceUsd` unchanged.

---

### TS-3 — Payment freeze

1. At rate 13 000, record payment of 1 000 000 so'm for a debtor.
2. Change rate to 14 000.
3. Open **To'lovlar** journal → verify payment `amountUsd` ≈ `1000000/13000` (76.92), not 14 000 equivalent.

**Pass criteria:** Frozen `amountUsd`; live debt balance USD uses 14 000.

---

### TS-4 — POS checkout rate capture

1. Set rate 13 000. Add items. Open payment dialog (note USD total if in USD mode).
2. Before confirming, change rate to 13 500 in another tab/window (or admin).
3. Complete sale.

**Pass criteria:** Sale stores rate active **at submit** (13 000 if no re-fetch) — document actual behavior: rate read at render/submit from store; if rate changed mid-dialog, next `getTotals()` reflects new rate on POS screen but submit uses `exchangeRate` from component state at click time.

---

### TS-5 — Credit sale debt

1. Select customer with no debt. Complete nasiya sale for 500 000 so'm at rate 13 000.
2. Verify customer `debtUzs` += 500 000; debt USD ≈ 38.46.
3. Change rate to 12 000. Verify same customer debt UZS still 500 000; USD ≈ 41.67.

**Pass criteria:** UZS debt exact; USD derived live.

---

### TS-6 — Return on credit sale (R2 regression)

1. Complete credit sale at rate 12 620. Create and approve return.
2. Compare return `amountUsd` vs debt history entry `amountUsd` for the return line.

**Pass criteria (current code):** UZS amounts match; USD may differ if rate changed between sale and approval — **known risk R2**.

---

### TS-7 — Rounding: USD price edit

1. On **Narx boshqaruvi**, set USD price for 35 000 so'm product at rate 13 000 (2.69 USD).
2. Save via USD field. Note resulting UZS (may be 34 970).

**Pass criteria:** Document drift; prefer UZS-first entry for exact so'm prices.

---

### TS-8 — Dashboard vs live (R1)

1. Change rate to 13 000.
2. Compare dashboard **Jami savdo (USD)**, **Jami qarzdorlik (USD)** with POS/customer modules.

**Pass criteria:** Dashboard mock KPIs **will not match** live data — expected until dashboard wired to stores.

---

### TS-9 — FIFO / batches (no FX)

1. Receive stock with cost 720 000 so'm. Complete sale allocating FIFO.
2. Change exchange rate.

**Pass criteria:** Batch `costUzs` and sale FIFO tab costs unchanged; only sale **selling price** USD on receipt tied to sale rate.

---

### TS-10 — Inventory valuation (UZS only)

1. Note **Ombor → Jami qiymat** (UZS).
2. Change rate to 13 500.

**Pass criteria:** UZS total unchanged (stock × cost factor × priceUzs).

---

## Files Reviewed

| Layer | Files |
|-------|-------|
| Core | `utils/currency.ts`, `utils/format.ts`, `services/currencySync.ts`, `app/CurrencyBootstrap.tsx` |
| Stores | `currencyStore.ts`, `inventoryStore.ts`, `customerStore.ts`, `salesStore.ts`, `posCartStore.ts` |
| Products | `ProductsPage.tsx`, `ProductFormPage.tsx`, `ProductFormDialog.tsx`, `PriceManagementPage.tsx`, `ProductDetailPage.tsx` |
| Inventory | `InventoryPage.tsx`, `InventoryBatchesPage.tsx`, `InventoryReceivePage.tsx`, `WarehouseDetailPage.tsx` |
| Sales/POS | `SalesPosPage.tsx`, `posCartStore.ts`, `PaymentDialog.tsx`, `SalesHistoryPage.tsx`, `SaleDetailPage.tsx`, `ReceiptPage.tsx`, `CreateReturnPage.tsx`, `ReturnDetailPage.tsx`, `ReturnsPage.tsx` |
| Debt/Payments | `CustomerDebtPage.tsx`, `CustomerProfilePage.tsx`, `RecordPaymentPage.tsx`, `PaymentsPage.tsx`, `CustomerPicker.tsx` |
| Finance | `CurrencyPage.tsx` |
| Dashboard/Reports | `DashboardPage.tsx`, `mocks/dashboard.ts`, `ReportsPage.tsx` |
| API | `api/mockHandlers.ts` (currency POST → `setRate`) |

---

## Conclusion

**Live operational modules (products, POS, sales, debt, payments, customer profile)** implement the P0 currency model correctly:

- UZS is canonical for live balances and catalog prices.
- USD is derived at the active rate for display and live balances.
- Completed sales, payments, and sale-linked returns freeze monetary USD at transaction/sale rates.
- Rounding is consistent (USD 2 dp, UZS integer) with documented round-trip drift when entering via USD.

**Gaps** are concentrated in **mock dashboard KPIs**, **return debt-history rate alignment**, **POS cart staleness**, and **void-sale debt reversal** — none of which invalidate the accepted P0 fix for day-to-day pricing and checkout, but should be tracked before production hardening.

---

*Audit only — no features implemented. See `P0_FIX_REPORT.md` for fix history and P1 backlog.*
