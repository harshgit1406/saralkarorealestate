# Backend

FastAPI backend for the real estate ERP.

## Setup

```powershell
cd backend
Copy-Item .env.example .env
uv sync
```

Update `SECRET_KEY` in `.env` before using this beyond local development. Use at least 32 random bytes.

## Run

Make sure the database is running first:

```powershell
cd ../database
docker compose up -d
```

Start the API:

```powershell
cd ../backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs:

```text
http://localhost:8000/docs
```

## First Admin

Create the first organization and super admin:

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

After creating the first admin, set this in `.env`:

```text
BOOTSTRAP_ENABLED=false
```

## Login

```powershell
Invoke-RestMethod -Method Post http://localhost:8000/api/v1/auth/login `
  -ContentType "application/json" `
  -Body '{
    "organization_slug": "blf",
    "username_or_email": "admin@example.com",
    "password": "ChangeMe123!",
    "device_label": "Local dev"
  }'
```
