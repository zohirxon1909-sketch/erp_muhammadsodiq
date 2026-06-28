# Phase — Notifications Backend Module

**Module:** Notifications (CRUD, read/unread, alerts, login)  
**Status:** COMPLETE  
**Date:** 2026-06-26

---

## Overview

Production-grade Notifications backend with PostgreSQL persistence, JWT authentication, RBAC, company isolation, audit logging, and Swagger documentation. Supports business alert scanning (stock, debt, expired products) and automatic login notifications. Frontend integrated via REST API — no localStorage, no mocks.

---

## Implemented Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/notifications` | `notifications.view` | Paginated list (filter `read`, `category`) |
| GET | `/notifications/unread-count` | `notifications.view` | Unread count for badge |
| POST | `/notifications/mark-all-read` | `notifications.view` | Mark all as read |
| POST | `/notifications/scan-alerts` | `notifications.manage` | Scan business data and create alerts |
| POST | `/notifications` | `notifications.manage` | Create notification (admin/system) |
| GET | `/notifications/:id` | `notifications.view` | Get single notification |
| PATCH | `/notifications/:id` | `notifications.view` | Toggle read/unread |
| PATCH | `/notifications/:id/read` | `notifications.view` | Mark as read |
| PATCH | `/notifications/:id/unread` | `notifications.view` | Mark as unread |
| DELETE | `/notifications/:id` | `notifications.view` | Soft delete |

Swagger UI: `http://localhost:3000/api/docs` (tag: **Notifications**)

---

## Notification Categories

| Category | Enum | Trigger |
|----------|------|---------|
| Stock Alert | `STOCK_ALERT` | Product out of stock (qty ≤ 0) |
| Debt Alert | `DEBT_ALERT` | Customer debt overdue 30+ days |
| Supplier Debt | `SUPPLIER_DEBT` | Supplier with outstanding debt |
| Customer Debt | `CUSTOMER_DEBT` | Customer with outstanding debt |
| Low Stock | `LOW_STOCK` | Qty below `minStockLevel` |
| Expired Products | `EXPIRED_PRODUCT` | `Product.expiresAt` ≤ today |
| System | `SYSTEM` | Manual/admin or system events |
| Login | `LOGIN` | Successful login (auth service) |

Severity maps to frontend `type`: `info` | `warning` | `success` | `error`.

---

## Database

### Migration

`prisma/migrations/20260626140000_notifications_module/migration.sql`

- `NotificationSeverity`, `NotificationCategory` enums
- `notifications` table with soft delete (`deleted_at`)
- `Product.expiresAt` column for expired-product alerts
- Indexes: `(company_id, user_id, read, created_at)`, `(company_id, category, entity_id)`, `(company_id, deleted_at)`

### Model (`Notification`)

- `companyId` — company isolation
- `userId` — nullable (null = broadcast to all company users)
- `entityType` / `entityId` — linked entity for dedup
- `metadata` — JSON payload
- `read` / `readAt` — read state

### Access filter

Users see notifications where `userId` matches OR `userId` is null (company-wide), scoped to `companyId`, excluding soft-deleted rows.

### Alert deduplication

`createIfNotDuplicate()` skips creation if an unread notification with same `category` + `entityId` exists within 24 hours.

---

## Security

| Layer | Implementation |
|-------|----------------|
| JWT | Bearer token required on all routes |
| RBAC | `@RequireModule('notifications')`, `@RequirePermissions(...)` |
| Company isolation | `CompanyIsolationGuard` + `companyId` from JWT |
| Audit | CREATE/UPDATE/DELETE logged via `AuditService` |

### Permissions (seed)

| Code | Roles |
|------|-------|
| `notifications.view` | admin, manager, cashier |
| `notifications.manage` | admin |

---

## Module Structure

```
backend/src/modules/notifications/
├── api/
│   ├── notifications.controller.ts
│   └── dto/notifications.dto.ts
├── application/
│   ├── notifications.service.ts          # CRUD, read/unread, login
│   ├── notification-alerts.service.ts    # Business alert scanner
│   └── notification.types.ts
└── notifications.module.ts
```

### Auth integration

`AuthModule` imports `NotificationsModule` (forwardRef). On successful login, `AuthService` calls `createLoginNotification()`.

---

## Seed Data

`prisma/seed.ts` seeds:

- `notifications` module
- `notifications.view`, `notifications.manage` permissions
- 6 sample notifications (matching original mock content)

Run: `npx prisma db seed`

---

## Frontend Integration

| File | Purpose |
|------|---------|
| `desktop/src/api/endpoints.ts` | API paths |
| `desktop/src/api/services/notificationsApi.ts` | HTTP client |
| `desktop/src/hooks/useNotifications.ts` | List, unread count, toggle, delete |
| `desktop/src/features/notifications/NotificationsPage.tsx` | UI (tabs, mark all read, delete) |
| `desktop/src/components/organisms/TopBar.tsx` | Live unread badge, navigate to `/notifications` |

Response shape (frontend contract):

```json
{
  "id": "uuid",
  "title": "...",
  "body": "...",
  "type": "warning",
  "read": false,
  "createdAt": "2026-06-26T10:00:00.000Z"
}
```

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

**Build status:** PASS (backend `nest build`, desktop `tsc` + `vite build`)

---

## API Examples

### List unread

```
GET /api/v1/notifications?read=false&page=1&limit=20
Authorization: Bearer <token>
```

### Unread count

```
GET /api/v1/notifications/unread-count
→ { "count": 3 }
```

### Scan alerts (admin)

```
POST /api/v1/notifications/scan-alerts
→ { "created": 5 }
```

### Mark all read

```
POST /api/v1/notifications/mark-all-read
→ { "updated": 3 }
```

### Delete

```
DELETE /api/v1/notifications/:id
→ 204 No Content
```
