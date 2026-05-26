# RealState ERP

Multi-tenant real estate ERP + CRM SaaS for managing projects, inventory maps, leads, customers, bookings, payments, communication, HRMS users, roles, and permissions.

## Stack

- Backend: FastAPI, asyncpg, PostgreSQL
- Frontend: React, Vite, TypeScript
- Database: PostgreSQL Docker Compose with pgAdmin
- Auth: JWT access/refresh tokens

## Main Features

- Secure login and first admin bootstrap
- Organization/workspace-based data isolation
- Role and permission access control
- Lead CRM with third-party webhook intake
- Auto-call queue flow for new leads
- Inventory hierarchy using projects, plots, floors, flats, shops, etc.
- Database-driven SVG inventory map
- Bookings, payment plans, stages, and payments
- Customers, brokers, documents, communication, activity, and audit logs

## Run Locally

Start database:

```powershell
cd database
docker compose up -d
```

Start backend:

```powershell
cd backend
uv sync --no-managed-python
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Start frontend:

```powershell
cd Frontend
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

## First Login

If no user exists, create first admin:

```powershell
Invoke-RestMethod -Method Post http://localhost:8000/api/v1/auth/bootstrap `
  -ContentType "application/json" `
  -Body '{
    "organization_name": "BLF Developers",
    "organization_slug": "blf",
    "full_name": "Admin User",
    "username": "admin",
    "email": "admin@example.com",
    "password": "ChangeMe123!"
  }'
```

Then login with:

```text
Workspace: blf
Email: admin@example.com
Password: ChangeMe123!
```

## Sample Data

Load demo ERP data:

```powershell
Get-Content database\seed_sample_data.sql | docker exec -i realstate-postgres psql -U realstate -d realstate
Get-Content database\seed_plot_map.sql | docker exec -i realstate-postgres psql -U realstate -d realstate
```

Sample login:

```text
Workspace: saral
Email: admin@saralrealestate.com
Password: ChangeMe123!
```

## API Docs

```text
http://localhost:8000/docs
```

Important API groups:

```text
/api/v1/auth
/api/v1/workspace/pages
/api/v1/leads
/api/v1/inventory
/api/v1/finance
/api/v1/communication
/api/v1/hrms
/api/v1/settings
```

## pgAdmin

```text
URL: http://localhost:5050
Email: admin@realstateapp.com
Password: admin_password
```

Database connection inside pgAdmin:

```text
Host: postgres
Port: 5432
Database: realstate
Username: realstate
Password: realstate_password
```
