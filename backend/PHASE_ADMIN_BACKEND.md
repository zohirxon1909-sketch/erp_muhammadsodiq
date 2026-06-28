# Phase — Admin Backend Module

**Module:** Admin (users, security, backup, monitoring, logs)  
**Status:** COMPLETE  
**Date:** 2026-06-26

---

## Overview

Production-grade Admin backend extending the existing administration module with backup/restore, monitoring, health checks, queue status, and log viewer. PostgreSQL persistence, JWT, RBAC, company isolation, audit logging, and Swagger documentation. Frontend mock backup data removed — all admin operations use REST API.

---

## Implemented Endpoints

### Core Admin (existing)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/admin/overview` | `admin.*` | Dashboard KPIs |
| GET | `/admin/users` | `admin.users.view` | Paginated users |
| POST | `/admin/users` | `admin.users.view` | Create user |
| PATCH | `/admin/users/:id/status` | `admin.users.view` | Block/unblock user |
| GET | `/admin/sessions` | `admin.*` | Active sessions |
| POST | `/admin/sessions/:id/revoke` | `admin.*` | Revoke session |
| GET | `/admin/devices` | `admin.*` | Devices list |
| PATCH | `/admin/devices/:id/status` | `admin.*` | Block/unblock device |
| GET | `/admin/audit-logs` | `admin.audit.view` | Audit log list |
| GET | `/admin/roles` | `admin.*` | Roles (read-only) |
| GET | `/admin/permissions` | `admin.*` | Permissions (read-only) |

### Backup (new)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/admin/backups` | `admin.*` | Backup history |
| POST | `/admin/backups` | `admin.*` | Manual backup |
| GET | `/admin/backups/schedule` | `admin.*` | Automatic backup settings |
| PATCH | `/admin/backups/schedule` | `admin.*` | Update automatic backup |
| GET | `/admin/backups/:id` | `admin.*` | Backup job detail |
| GET | `/admin/backups/:id/download` | `admin.*` | Download backup file |
| POST | `/admin/backups/:id/restore` | `admin.*` | Restore from backup |

### Monitoring (new)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/admin/monitoring` | `admin.*` | System metrics (DB, Redis, memory, disk, queue, backup age) |
| GET | `/admin/monitoring/health` | `admin.*` | Health check probe |
| GET | `/admin/monitoring/queue` | `admin.*` | Report job queue status |
| GET | `/admin/logs` | `admin.audit.view` | Log viewer (audit-based) |

Swagger UI: `http://localhost:3000/api/docs` (tag: **Admin**)

---

## Backup System

### Types

| Enum | Values |
|------|--------|
| `BackupType` | FULL, INCREMENTAL |
| `BackupJobStatus` | PENDING, RUNNING, COMPLETED, FAILED |
| `BackupTrigger` | MANUAL, AUTOMATIC |

### Manual Backup

Exports company-scoped data (categories, products, customers, suppliers) to gzip JSON in `uploads/backups/{companyId}/{jobId}.json.gz`.

### Restore

Validates backup file, upserts categories/products/customers/suppliers within a transaction. Audit logged with action `RESTORE`.

### Automatic Backup

Schedule stored in `Company.settings.backup`:

```json
{
  "enabled": false,
  "hourUtc": 2,
  "type": "incremental",
  "retentionDays": 30
}
```

External cron can call `POST /admin/backups` with `AUTOMATIC` trigger when schedule is enabled.

---

## Monitoring Metrics

| Metric ID | Source |
|-----------|--------|
| `api` | API latency |
| `database` | PostgreSQL `pg_database_size` |
| `redis` | Redis PING (optional — warning if unavailable) |
| `memory` | `process.memoryUsage()` vs `os.totalmem()` |
| `disk` | `uploads/` directory size |
| `queue` | `report_jobs` pending/processing counts |
| `backup` | Last completed backup age |

---

## Database

### Migration

`prisma/migrations/20260626160000_admin_backup_monitoring/migration.sql`

- `backup_jobs` table with company isolation
- Indexes on `(company_id, status, created_at)` and `(company_id, created_at)`

### Model (`BackupJob`)

- `companyId`, `userId`, `type`, `trigger`, `status`
- `filePath`, `fileName`, `mimeType`, `fileSize`
- `errorMessage`, `metadata`, `completedAt`

---

## Security

| Layer | Implementation |
|-------|----------------|
| JWT | Bearer token required |
| RBAC | `@RequireModule('admin')`, `@RequirePermissions(...)` |
| Company isolation | `CompanyIsolationGuard` + `companyId` from JWT |
| Audit | CREATE (backup), RESTORE, UPDATE (schedule), all user/session/device mutations |

### Permissions (seed)

| Code | Description |
|------|-------------|
| `admin.*` | Full admin (Administrator role) |
| `admin.users.view` | View/manage users |
| `admin.audit.view` | Audit logs + log viewer |

---

## Module Structure

```
backend/src/modules/admin/
├── api/
│   ├── admin.controller.ts
│   └── dto/admin.dto.ts
├── application/
│   ├── admin.service.ts
│   └── admin-backup-monitoring.service.ts
└── admin.module.ts
```

---

## Seed Data

- 3 sample `backup_jobs` (full/incremental completed, failed manual)
- Existing admin users, roles, permissions unchanged

Run: `npx prisma db seed`

---

## Frontend Integration

| File | Purpose |
|------|---------|
| `desktop/src/api/endpoints.ts` | Admin backup/monitoring/log paths |
| `desktop/src/api/services/adminApi.ts` | HTTP client |
| `desktop/src/stores/adminStore.ts` | State (no mock backups) |
| `desktop/src/features/admin/BackupCenterPage.tsx` | Backup history, manual backup, restore, schedule |
| `desktop/src/features/admin/MonitoringPage.tsx` | Live system metrics |
| `desktop/src/features/admin/LogViewerPage.tsx` | System log viewer |

**Removed:** `mockBackups` usage from `adminStore` (mock data file retained for legacy reference only).

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

### Manual backup

```
POST /api/v1/admin/backups
Authorization: Bearer <token>
Content-Type: application/json

{ "type": "FULL" }
```

### Restore

```
POST /api/v1/admin/backups/:id/restore
```

### Monitoring

```
GET /api/v1/admin/monitoring
→ { "metrics": [...], "systemStatus": "healthy", "health": {...}, "queue": {...} }
```

### Automatic backup schedule

```
PATCH /api/v1/admin/backups/schedule
{ "enabled": true, "hourUtc": 2, "type": "incremental" }
```

### Log viewer

```
GET /api/v1/admin/logs?page=1&limit=50
```

---

## Bug Fixes (this phase)

- Fixed `buildPaginationMeta(page, limit, total)` argument order in `admin.service.ts` (was incorrectly passing `total` as first arg)
- Added Swagger `@ApiTags('Admin')` to controller

---

## Known Limitations

- Automatic backup requires external scheduler (cron) to invoke API
- Restore upserts master data only (not sales/inventory transactions)
- Redis monitoring shows warning when Redis is optional/unavailable
- Log viewer uses audit log table (no file-based application logs)
