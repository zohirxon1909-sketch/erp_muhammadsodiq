# OpenAPI Master Spec — ERP REST API v1

**OpenAPI version:** 3.1.0 (documented)  
**API version:** 1.0.0  
**Status:** FROZEN — single source of truth  
**Companion:** [`API_CONTRACT_FREEZE.md`](./API_CONTRACT_FREEZE.md)

```yaml
openapi: 3.1.0
info:
  title: ERP REST API
  version: 1.0.0
  description: Canonical contract for Auth, Customers, Products, Inventory, Sales, Debt Payments, Currency
servers:
  - url: https://api.erp.example.com/api/v1
    description: Production
  - url: http://localhost:3000/api/v1
    description: Local development
```

---

## Security

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

All endpoints except `POST /auth/login`, `POST /auth/refresh`, and `GET /health` require `bearerAuth`.

---

## Components — Schemas

### Primitives

#### MoneyAmount
String decimal, up to 4 fractional digits. Example: `"1250000.0000"`.

#### CurrencyCode
Enum: `UZS` | `USD`

#### Uuid
String, UUID v4 format.

#### DateTime
String, ISO 8601 with timezone.

---

### Pagination

#### PaginationQuery (query parameters)

| Field | Type | Default | Max | Description |
|-------|------|---------|-----|-------------|
| `page` | integer | 1 | — | 1-based page |
| `limit` | integer | 20 | 100 | Page size |

#### SortQuery

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `sort` | string | `createdAt:desc` | Comma-separated `field:asc\|desc`; max 3 fields |

#### SearchQuery

| Field | Type | Description |
|-------|------|-------------|
| `q` | string | Case-insensitive search term |

#### PaginationMeta

```json
{
  "page": 1,
  "limit": 20,
  "total": 150,
  "totalPages": 8
}
```

#### PaginatedResponse (generic)

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

### Errors

#### ErrorResponse

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {},
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### ValidationErrorDetails

```json
{
  "fields": [
    { "field": "phone", "message": "Must be valid E.164", "code": "INVALID_PHONE" }
  ]
}
```

#### Error codes

| code | HTTP | details shape |
|------|------|---------------|
| `VALIDATION_ERROR` | 400 | `ValidationErrorDetails` |
| `UNAUTHORIZED` | 401 | — |
| `TOKEN_EXPIRED` | 401 | — |
| `SESSION_REVOKED` | 401 | — |
| `FORBIDDEN` | 403 | — |
| `MODULE_DISABLED` | 403 | `{ moduleCode }` |
| `USER_BLOCKED` | 403 | — |
| `DEVICE_BLOCKED` | 403 | — |
| `NOT_FOUND` | 404 | `{ resource, id }` |
| `DUPLICATE_SKU` | 409 | `{ sku }` |
| `DUPLICATE_BARCODE` | 409 | `{ barcode }` |
| `INSUFFICIENT_STOCK` | 422 | `{ productId, available, requested }` |
| `INVALID_CURRENCY` | 422 | — |
| `BUSINESS_RULE_VIOLATION` | 422 | context-specific |
| `RATE_LIMITED` | 429 | `{ retryAfterSeconds }` |
| `INTERNAL_ERROR` | 500 | — |

---

## Components — Auth DTOs

### LoginRequest

```json
{
  "email": "user@example.com",
  "password": "string",
  "deviceInfo": {
    "deviceId": "uuid",
    "name": "Desktop ERP",
    "platform": "windows",
    "osVersion": "10.0.22631"
  }
}
```

| Field | Required | Validation |
|-------|----------|------------|
| email | yes | Valid email |
| password | yes | Min 8 chars |
| deviceInfo.deviceId | yes | UUID |
| deviceInfo.name | yes | 1–255 chars |
| deviceInfo.platform | yes | `windows`, `macos`, `linux`, `ios`, `android`, `web` |

### LoginResponse

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "expiresIn": 900,
  "user": { "$ref": "UserSummary" },
  "companies": [{ "$ref": "CompanySummary" }],
  "permissions": ["sales.create", "products.view"],
  "modules": ["sales", "inventory", "products"]
}
```

### RefreshRequest

```json
{ "refreshToken": "jwt" }
```

### RefreshResponse

Same shape as `LoginResponse` (new token pair).

### SwitchCompanyRequest

```json
{ "companyId": "uuid" }
```

### SwitchCompanyResponse

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "expiresIn": 900,
  "activeCompany": { "$ref": "CompanySummary" },
  "permissions": [],
  "modules": []
}
```

### MeResponse

```json
{
  "user": { "$ref": "UserSummary" },
  "activeCompany": { "$ref": "CompanySummary" },
  "permissions": [],
  "modules": []
}
```

### UserSummary

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "Malika",
  "lastName": "Tosheva",
  "role": "cashier",
  "status": "ACTIVE"
}
```

### CompanySummary

```json
{
  "id": "uuid",
  "name": "Market — Tashkent",
  "code": "MKT-TAS",
  "role": "manager",
  "branchCount": 3
}
```

---

## Components — Customer DTOs

### CustomerResponse

```json
{
  "id": "uuid",
  "name": "Aziz Karimov",
  "phone": "+998901234567",
  "phoneSecondary": null,
  "email": null,
  "address": "Toshkent",
  "partnershipStartDate": "2024-01-15",
  "notes": null,
  "status": "ACTIVE",
  "debtUzs": "1500000.0000",
  "debtUsd": "0.0000",
  "totalPurchasesUzs": "8500000.0000",
  "lastPurchaseAt": "2026-06-18T11:45:00+05:00",
  "createdAt": "2024-01-15T10:00:00+05:00",
  "updatedAt": "2026-06-18T11:45:00+05:00"
}
```

### CreateCustomerRequest

| Field | Required | Validation |
|-------|----------|------------|
| name | yes | 2–255 chars |
| phone | yes | E.164 |
| phoneSecondary | no | E.164 |
| email | no | Email format |
| address | no | Max 1000 chars |
| partnershipStartDate | no | ISO date |
| notes | no | Max 2000 chars |
| status | no | Default `ACTIVE` |

### UpdateCustomerRequest

Partial of `CreateCustomerRequest` (PATCH semantics).

### CustomerListFilters (query)

| Param | Type | Description |
|-------|------|-------------|
| `status` | enum | `ACTIVE`, `INACTIVE`, `ARCHIVED`, `BLOCKED` |
| `q` | string | Name or phone search |
| `sort` | string | Default `name:asc`. Allowed: `name`, `createdAt`, `debtUzs`, `lastPurchaseAt` |

### CustomerDebtsResponse

```json
{
  "customerId": "uuid",
  "debtUzs": "1500000.0000",
  "debtUsd": "120.5000",
  "lastPaymentAt": "2026-06-10T09:00:00+05:00"
}
```

### DebtHistoryEntry

```json
{
  "id": "uuid",
  "customerId": "uuid",
  "type": "sale_credit",
  "amountUzs": "500000.0000",
  "amountUsd": "39.6000",
  "balanceAfterUzs": "1500000.0000",
  "balanceAfterUsd": "0.0000",
  "reference": "S-2026-004521",
  "createdAt": "2026-06-18T10:20:00+05:00",
  "recordedBy": "Malika Tosheva"
}
```

`type` enum: `sale_credit` | `payment` | `return` | `adjustment` | `sale_void`

### DebtHistoryFilters

| Param | Type |
|-------|------|
| `type` | DebtHistoryEntry.type |
| `from`, `to` | ISO date |
| `sort` | Default `createdAt:desc` |

---

## Components — Product DTOs *(unblocked)*

### ProductResponse

```json
{
  "id": "uuid",
  "sku": "ELC-001",
  "barcode": "8806095123456",
  "name": "Samsung Galaxy A54",
  "categoryId": "uuid",
  "categoryName": "Telefonlar",
  "status": "ACTIVE",
  "purchasePriceUzs": "3240000.0000",
  "purchasePriceUsd": "256.0000",
  "salePriceUzs": "4500000.0000",
  "salePriceUsd": "356.5000",
  "stock": "42.0000",
  "unitOfMeasure": "pcs",
  "createdAt": "2025-01-01T00:00:00+05:00",
  "updatedAt": "2026-06-18T00:00:00+05:00"
}
```

| Field | Notes |
|-------|-------|
| stock | **Read-only** — sum of `batch.remainingQty` for product |
| sku | Immutable after create |
| prices | All ≥ 0; USD derived from UZS at active rate on write unless both provided |

### CreateProductRequest

| Field | Required | Validation |
|-------|----------|------------|
| sku | yes | Unique per company; 1–100 chars |
| name | yes | 1–500 chars |
| categoryId | yes | UUID |
| barcode | no | Unique per company if set |
| unitOfMeasure | no | Default `pcs` |
| purchasePriceUzs | yes | ≥ 0 |
| salePriceUzs | yes | ≥ 0 |
| purchasePriceUsd | no | Computed if omitted |
| salePriceUsd | no | Computed if omitted |
| status | no | Default `ACTIVE` |
| initialStock | no | If > 0, triggers receive flow (see inventory) |
| initialWarehouseId | conditional | Required when initialStock > 0 |

### UpdateProductRequest

Partial; **sku cannot change**. Price and metadata fields only.

### ProductListFilters

| Param | Type |
|-------|------|
| `status` | `ACTIVE`, `INACTIVE`, `ARCHIVED` |
| `categoryId` | UUID |
| `stockLevel` | `in_stock`, `low`, `out` |
| `q` | string |
| `sort` | `name`, `sku`, `stock`, `salePriceUzs`, `createdAt` |

### ProductSearchResponse

```json
{
  "data": [{ "$ref": "ProductResponse" }]
}
```
Non-paginated; max 20 results for POS/search endpoints.

### CategoryResponse

```json
{
  "id": "uuid",
  "name": "Telefonlar",
  "parentId": null,
  "productCount": 3,
  "sortOrder": 0
}
```

### CreateCategoryRequest

```json
{ "name": "Telefonlar", "parentId": null, "sortOrder": 0 }
```

---

## Components — Inventory DTOs

### WarehouseResponse

```json
{
  "id": "uuid",
  "name": "Asosiy ombor",
  "branchId": "uuid",
  "branchName": "Markaziy filial",
  "address": "Toshkent",
  "productCount": 856,
  "totalValueUzs": "520000000.0000"
}
```

### InventoryBatchResponse

```json
{
  "id": "uuid",
  "productId": "uuid",
  "productName": "Samsung Galaxy A54",
  "sku": "ELC-001",
  "quantity": "50.0000",
  "remainingQty": "42.0000",
  "unitCostUzs": "3240000.0000",
  "unitCostUsd": "256.0000",
  "warehouseId": "uuid",
  "warehouseName": "Asosiy ombor",
  "receivedAt": "2026-06-18T09:15:00+05:00"
}
```

### StockMovementResponse

```json
{
  "id": "uuid",
  "type": "RECEIPT",
  "productId": "uuid",
  "productName": "Samsung Galaxy A54",
  "sku": "ELC-001",
  "quantity": "50.0000",
  "warehouseId": "uuid",
  "warehouseName": "Asosiy ombor",
  "referenceType": "receive",
  "referenceId": "uuid",
  "note": null,
  "createdAt": "2026-06-18T09:15:00+05:00",
  "performedBy": "Jasur Rahimov"
}
```

### StockLevelResponse

```json
{
  "productId": "uuid",
  "sku": "ELC-001",
  "productName": "Samsung Galaxy A54",
  "warehouseId": "uuid",
  "stock": "42.0000",
  "batchCount": 1
}
```

### ReceiveStockRequest

```json
{
  "productId": "uuid",
  "warehouseId": "uuid",
  "quantity": "50.0000",
  "unitCostUzs": "3240000.0000",
  "unitCostUsd": "256.0000",
  "note": "Supplier invoice #123"
}
```

| Validation |
|------------|
| quantity > 0 |
| unitCostUzs ≥ 0 |
| Creates batch + RECEIPT movement + updates product stock |

### ReceiveStockResponse

```json
{
  "batch": { "$ref": "InventoryBatchResponse" },
  "movement": { "$ref": "StockMovementResponse" },
  "productStock": "92.0000"
}
```

### AdjustStockRequest

```json
{
  "productId": "uuid",
  "warehouseId": "uuid",
  "quantityDelta": "-5.0000",
  "reason": "Inventarizatsiya",
  "reasonCode": "COUNT_CORRECTION"
}
```

| Validation |
|------------|
| quantityDelta ≠ 0 |
| Negative delta applies FIFO batch deduction (non-sale) |
| Positive delta creates adjustment batch |

### TransferStockRequest

```json
{
  "productId": "uuid",
  "fromWarehouseId": "uuid",
  "toWarehouseId": "uuid",
  "quantity": "20.0000",
  "note": "Filialga o'tkazish"
}
```

### InventoryListFilters (batches / movements / stock)

| Param | Applies to |
|-------|------------|
| `productId` | batches, movements, stock |
| `warehouseId` | batches, movements, stock |
| `type` | movements |
| `from`, `to` | movements |
| `sort` | batches: `receivedAt:desc`; movements: `createdAt:desc` |

---

## Components — Sales DTOs

### CreateSaleRequest

```json
{
  "customerId": "uuid",
  "originalCurrency": "UZS",
  "paymentType": "MIXED",
  "amountPaidUzs": "400000.0000",
  "amountPaidUsd": "0.0000",
  "notes": null,
  "lineItems": [
    { "productId": "uuid", "quantity": "3.0000" }
  ]
}
```

| Field | Required | Validation |
|-------|----------|------------|
| customerId | conditional | Required for CREDIT and MIXED |
| originalCurrency | yes | UZS or USD |
| paymentType | yes | CASH, CREDIT, MIXED |
| amountPaidUzs/Usd | conditional | Per payment type rules |
| lineItems | yes | Min 1 item; quantity > 0 |

**Server responsibilities:** Apply active exchange rate; compute unit prices from product sale prices; run FIFO allocation once; create debt if credit portion; return frozen `exchangeRateUsed`.

**Headers:** `Idempotency-Key` required.

### SaleResponse

```json
{
  "id": "uuid",
  "number": "S-2026-004522",
  "customerId": "uuid",
  "customerName": "Aziz Karimov",
  "cashierId": "uuid",
  "cashierName": "Malika Tosheva",
  "originalCurrency": "UZS",
  "exchangeRateUsed": "12620.0000",
  "totalUzs": "13500000.0000",
  "totalUsd": "1069.7300",
  "paymentType": "MIXED",
  "amountPaidUzs": "400000.0000",
  "amountPaidUsd": "0.0000",
  "status": "COMPLETED",
  "createdAt": "2026-06-18T11:45:00+05:00",
  "lineItems": [{ "$ref": "SaleLineItemResponse" }],
  "fifoAllocations": [{ "$ref": "FifoAllocationResponse" }],
  "payments": [{ "$ref": "SalePaymentResponse" }]
}
```

### SaleLineItemResponse

```json
{
  "id": "uuid",
  "productId": "uuid",
  "productName": "Samsung Galaxy A54",
  "sku": "ELC-001",
  "quantity": "3.0000",
  "unitPriceUzs": "4500000.0000",
  "unitPriceUsd": "356.5000",
  "totalUzs": "13500000.0000",
  "totalUsd": "1069.7300",
  "cogsUzs": "9720000.0000",
  "cogsUsd": "768.0000"
}
```

### FifoAllocationResponse

```json
{
  "id": "uuid",
  "saleItemId": "uuid",
  "batchId": "uuid",
  "productId": "uuid",
  "productName": "Samsung Galaxy A54",
  "quantity": "3.0000",
  "unitCostUzs": "3240000.0000",
  "unitCostUsd": "256.0000",
  "costUzs": "9720000.0000",
  "costUsd": "768.0000"
}
```

### SalePaymentResponse

```json
{
  "method": "MIXED",
  "amountUzs": "13500000.0000",
  "amountUsd": "1069.7300",
  "receivedUzs": "400000.0000",
  "changeUzs": "0.0000"
}
```

### VoidSaleResponse

Same as `SaleResponse` with `status: "CANCELLED"`. Restores FIFO batches and debt per signed-off business rules.

### SaleListFilters

| Param | Type |
|-------|------|
| `status` | COMPLETED, CANCELLED, RETURNED |
| `paymentType` | CASH, CREDIT, MIXED |
| `customerId` | UUID |
| `cashierId` | UUID |
| `from`, `to` | ISO date |
| `q` | Sale number or customer name |
| `sort` | `createdAt`, `totalUzs`, `number` |

### CreateSaleReturnRequest

```json
{
  "reason": "Mahsulot nuqsonli",
  "lineItems": [
    { "productId": "uuid", "quantity": "1.0000" }
  ]
}
```

Uses **original sale exchange rate** for amounts (BR signed off).

### SaleReturnResponse

```json
{
  "id": "uuid",
  "saleId": "uuid",
  "saleNumber": "S-2026-004521",
  "customerId": "uuid",
  "customerName": "Aziz Karimov",
  "amountUzs": "4500000.0000",
  "amountUsd": "356.5000",
  "exchangeRateUsed": "12620.0000",
  "reason": "Mahsulot nuqsonli",
  "status": "PENDING",
  "createdAt": "2026-06-18T12:00:00+05:00",
  "lineItems": [
    {
      "productId": "uuid",
      "productName": "Samsung Galaxy A54",
      "quantity": "1.0000",
      "amountUzs": "4500000.0000"
    }
  ]
}
```

### ApproveReturnRequest / RejectReturnRequest

```json
{ "note": "Optional manager note" }
```

---

## Components — Debt Payment DTOs

### CreateDebtPaymentRequest

```json
{
  "customerId": "uuid",
  "amount": "500000.0000",
  "currency": "UZS",
  "paymentMethod": "CASH",
  "paymentType": "PARTIAL",
  "notes": "Naqd to'lov"
}
```

| Field | Validation |
|-------|------------|
| amount | > 0 |
| currency | UZS reduces UZS debt only; USD reduces USD debt only |
| paymentType | PARTIAL or FULL |
| exchangeRateUsed | **Server-set** from active rate at payment time |

**Headers:** `Idempotency-Key` required.

### DebtPaymentResponse

```json
{
  "id": "uuid",
  "customerId": "uuid",
  "customerName": "Aziz Karimov",
  "amount": "500000.0000",
  "currency": "UZS",
  "amountUzs": "500000.0000",
  "amountUsd": "39.6200",
  "exchangeRateUsed": "12620.0000",
  "paymentType": "PARTIAL",
  "paymentMethod": "CASH",
  "createdAt": "2026-06-18T14:00:00+05:00",
  "recordedBy": "Malika Tosheva",
  "notes": null
}
```

### ReverseDebtPaymentRequest

```json
{ "reason": "Xato kiritilgan" }
```

### DebtPaymentListFilters

| Param | Type |
|-------|------|
| `customerId` | UUID |
| `currency` | UZS, USD |
| `paymentMethod` | CASH, CARD, BANK_TRANSFER |
| `from`, `to` | ISO date |
| `sort` | `createdAt:desc` |

### DebtSummaryResponse

```json
{
  "totalDebtUzs": "12500000.0000",
  "totalDebtUsd": "980.5000",
  "customerCount": 42,
  "overdueCustomerCount": 8
}
```

### DebtAgingResponse

```json
{
  "buckets": [
    { "label": "0-30", "debtUzs": "5000000.0000", "debtUsd": "0.0000", "customerCount": 20 },
    { "label": "31-60", "debtUzs": "3000000.0000", "debtUsd": "120.0000", "customerCount": 10 }
  ]
}
```

---

## Components — Currency DTOs

### CurrentRateResponse

```json
{
  "id": "uuid",
  "rate": "12620.0000",
  "effectiveFrom": "2026-06-18T08:00:00+05:00",
  "setBy": "Admin User",
  "status": "ACTIVE"
}
```

### ExchangeRateResponse (history item)

```json
{
  "id": "uuid",
  "rate": "12620.0000",
  "effectiveFrom": "2026-06-18T08:00:00+05:00",
  "setBy": "Admin User",
  "status": "ACTIVE",
  "notes": null,
  "createdAt": "2026-06-18T08:00:00+05:00"
}
```

### SetExchangeRateRequest

```json
{
  "rate": "12750.0000",
  "notes": "Markaziy bank kursi"
}
```

| Validation | rate > 0; archives previous ACTIVE rate |

### ConvertCurrencyRequest

```json
{
  "amount": "1000000.0000",
  "fromCurrency": "UZS",
  "toCurrency": "USD"
}
```

### ConvertCurrencyResponse

```json
{
  "amount": "1000000.0000",
  "fromCurrency": "UZS",
  "convertedAmount": "78.7400",
  "toCurrency": "USD",
  "rateUsed": "12700.0000"
}
```

### RateHistoryFilters

| Param | Type |
|-------|------|
| `from`, `to` | ISO date |
| `sort` | `effectiveFrom:desc` |

---

## Paths — Auth

| Method | Path | Request | Response | Errors |
|--------|------|---------|----------|--------|
| POST | `/auth/login` | LoginRequest | LoginResponse | 400, 401, 403, 429 |
| POST | `/auth/refresh` | RefreshRequest | RefreshResponse | 401 |
| POST | `/auth/logout` | — | 204 | 401 |
| GET | `/auth/me` | — | MeResponse | 401 |
| POST | `/auth/switch-company` | SwitchCompanyRequest | SwitchCompanyResponse | 401, 403 |

---

## Paths — Customers

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/customers` | PaginationQuery + CustomerListFilters | PaginatedResponse\<CustomerResponse\> |
| GET | `/customers/search` | `q` (min 2 chars) | ProductSearchResponse-style list, max 20 |
| GET | `/customers/:id` | — | CustomerResponse |
| POST | `/customers` | CreateCustomerRequest | CustomerResponse (201) |
| PATCH | `/customers/:id` | UpdateCustomerRequest | CustomerResponse |
| DELETE | `/customers/:id` | — | 204 (soft delete) |
| GET | `/customers/:id/debts` | — | CustomerDebtsResponse |
| GET | `/customers/:id/debt-history` | PaginationQuery + DebtHistoryFilters | PaginatedResponse\<DebtHistoryEntry\> |

---

## Paths — Products

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/products` | PaginationQuery + ProductListFilters | PaginatedResponse\<ProductResponse\> |
| GET | `/products/search` | `q` | `{ data: ProductResponse[] }` max 20 |
| GET | `/products/barcode/:code` | — | ProductResponse |
| GET | `/products/:id` | — | ProductResponse |
| POST | `/products` | CreateProductRequest | ProductResponse (201) |
| PATCH | `/products/:id` | UpdateProductRequest | ProductResponse |
| DELETE | `/products/:id` | — | 204 |
| GET | `/categories` | — | `{ data: CategoryResponse[] }` |
| POST | `/categories` | CreateCategoryRequest | CategoryResponse (201) |
| PATCH | `/categories/:id` | Partial CreateCategoryRequest | CategoryResponse |
| DELETE | `/categories/:id` | — | 204 |
| GET | `/pos/products` | `q`, `limit` (max 50) | `{ data: ProductResponse[] }` |

---

## Paths — Inventory

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/inventory/stock` | PaginationQuery + filters | PaginatedResponse\<StockLevelResponse\> |
| GET | `/inventory/batches` | PaginationQuery + filters | PaginatedResponse\<InventoryBatchResponse\> |
| GET | `/inventory/batches/:id` | — | InventoryBatchResponse |
| GET | `/inventory/movements` | PaginationQuery + filters | PaginatedResponse\<StockMovementResponse\> |
| POST | `/inventory/receive` | ReceiveStockRequest | ReceiveStockResponse (201) |
| POST | `/inventory/adjust` | AdjustStockRequest | `{ movement, productStock }` (201) |
| POST | `/inventory/transfers` | TransferStockRequest | `{ movements[] }` (201) |
| GET | `/warehouses` | — | `{ data: WarehouseResponse[] }` |
| GET | `/warehouses/:id` | — | WarehouseResponse + batches + movements |
| POST | `/warehouses` | Create warehouse body | WarehouseResponse (201) |

---

## Paths — Sales

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/sales` | PaginationQuery + SaleListFilters | PaginatedResponse\<SaleResponse\> |
| POST | `/sales` | CreateSaleRequest | SaleResponse (201) |
| GET | `/sales/:id` | — | SaleResponse |
| POST | `/sales/:id/void` | `{ note? }` | SaleResponse |
| POST | `/sales/:id/returns` | CreateSaleReturnRequest | SaleReturnResponse (201) |
| GET | `/sales/returns` | PaginationQuery + status filter | PaginatedResponse\<SaleReturnResponse\> |
| GET | `/sales/returns/:id` | — | SaleReturnResponse |
| POST | `/sales/returns/:id/approve` | ApproveReturnRequest | SaleReturnResponse |
| POST | `/sales/returns/:id/reject` | RejectReturnRequest | SaleReturnResponse |

---

## Paths — Debt Payments

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/debt-payments` | PaginationQuery + DebtPaymentListFilters | PaginatedResponse\<DebtPaymentResponse\> |
| POST | `/debt-payments` | CreateDebtPaymentRequest | DebtPaymentResponse (201) |
| POST | `/debt-payments/:id/reverse` | ReverseDebtPaymentRequest | DebtPaymentResponse |
| GET | `/debt/summary` | — | DebtSummaryResponse |
| GET | `/debt/customers` | PaginationQuery | PaginatedResponse\<CustomerResponse\> |
| GET | `/debt/aging` | — | DebtAgingResponse |

---

## Paths — Currency

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/currency/rate` | — | CurrentRateResponse |
| GET | `/currency/rates` | PaginationQuery + RateHistoryFilters | PaginatedResponse\<ExchangeRateResponse\> |
| POST | `/currency/rates` | SetExchangeRateRequest | ExchangeRateResponse (201) |
| POST | `/currency/convert` | ConvertCurrencyRequest | ConvertCurrencyResponse |

---

## Paths — System

| Method | Path | Response |
|--------|------|----------|
| GET | `/health` | `{ status: "ok", version: "1.0.0" }` |

---

## Business invariants (server-enforced)

These mirror signed-off desktop store logic:

| Invariant | Enforcement |
|-----------|-------------|
| FIFO single deduction on sale | Allocate in sale transaction only; no double batch deduct |
| Void restores batches + stock | Match `restoreStockFromVoid` behavior |
| Frozen exchange rate | Stored on sale, payment, return |
| Debt currency isolation | UZS payment → UZS debt only |
| Stock = Σ batch remaining | Reject responses where inconsistent |
| Return uses sale rate | Not current rate |

---

## Document control

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | FROZEN |
| Supersedes | `docs/06-api/REST_API_REFERENCE.md` (where conflicts) |
| Amendment | Via `API_CONTRACT_FREEZE.md` log only |

**Machine-readable export:** This document is authoritative. A future `openapi.yaml` export may be generated from this spec without changing semantics.
