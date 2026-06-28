# Phase 2 — Currency Module Report

**Module:** Currency  
**Status:** COMPLETE  
**Date:** 2026-06-18

---

## Implemented Endpoints

| Method | Path | Permission | Audit on Write |
|--------|------|------------|----------------|
| GET | `/currency/rate` | `currency.view` | — |
| GET | `/currency/rates` | `currency.view` | — |
| POST | `/currency/rates` | `currency.manage` | Yes |
| POST | `/currency/convert` | `currency.view` | — |

---

## Self Audit

| Check | Result |
|-------|--------|
| `CompanyIsolationGuard` on controller | PASS |
| `@RequireModule('currency')` | PASS |
| Permission guards on all routes | PASS |
| `AuditService` on `POST /currency/rates` | PASS |
| Prisma `$transaction` on set rate (archive + create) | PASS |
| Decimal / `formatMoney` for all money fields | PASS |
| Only one ACTIVE rate per company (DB partial unique index) | PASS |
| Previous ACTIVE archived on new rate | PASS |

---

## Contract Verification

| DTO / Behavior | OpenAPI | Match |
|----------------|---------|-------|
| `CurrentRateResponse` shape | § Currency DTOs | YES |
| `ExchangeRateResponse` shape | § Currency DTOs | YES |
| `SetExchangeRateRequest` validation (rate > 0) | § Currency DTOs | YES |
| `ConvertCurrencyRequest/Response` | § Currency DTOs | YES |
| Paginated `GET /currency/rates` | § Pagination | YES |
| Error codes (`INVALID_CURRENCY`, validation) | § Errors | YES |

---

## Security Compliance

| Control | Status |
|---------|--------|
| JWT required | PASS |
| Company isolation | PASS |
| Module gate (`currency`) | PASS |
| Permission gate | PASS |
| No cross-company rate access | PASS |

---

## Test Status

| Test | Status |
|------|--------|
| `npm run build` | PASS |
| Runtime / e2e | NOT RUN (no DB in CI env) |

---

## Notes

- Seed creates demo rate `12620.0000` for `MKT-TAS`.
- `POST /currency/convert` is read-only; no audit required per business semantics.
