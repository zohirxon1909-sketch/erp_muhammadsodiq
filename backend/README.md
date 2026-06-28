# ERP Backend

NestJS modular monolith implementing frozen API contract v1.0.0.

## Prerequisites

- Node.js 20+
- Docker (PostgreSQL 16 + Redis 7)

## Quick start

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

API base: `http://localhost:3000/api/v1`

## Demo credentials (seed)

- Email: `admin@erp.uz`
- Password: `Admin123!`

## Auth endpoints

| Method | Path |
|--------|------|
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/refresh` |
| POST | `/api/v1/auth/logout` |
| GET | `/api/v1/auth/me` |
| POST | `/api/v1/auth/switch-company` |
| GET | `/api/v1/health` |

## Documentation

- `../desktop/OPENAPI_MASTER_SPEC.md` — API contract
- `../desktop/BACKEND_ARCHITECTURE.md` — Architecture
- `BACKEND_PHASE1_REPORT.md` — Phase 1 status
