# Database

Dockerized PostgreSQL setup for the real estate app.

## Start

```powershell
cd database
docker compose up -d
```

On first startup, Postgres runs `init.sql` automatically and creates the schema.

pgAdmin starts at:

```text
http://localhost:5050
```

Default pgAdmin login:

```text
Email: admin@realstateapp.com
Password: admin_password
```

## Connection

Default local connection string:

```text
postgresql://realstate:realstate_password@localhost:5433/realstate
```

When adding the server inside pgAdmin, use Docker's internal service name:

```text
Host: postgres
Port: 5432
Database: realstate
Username: realstate
Password: realstate_password
```

Override the defaults by copying `.env.example` to `.env` and editing the values:

```powershell
Copy-Item .env.example .env
```

## Useful Commands

```powershell
docker compose ps
docker compose logs -f postgres
docker compose logs -f pgadmin
docker compose exec postgres psql -U realstate -d realstate
docker compose down
```

To reset the database and rerun `init.sql`, remove the volume:

```powershell
docker compose down -v
docker compose up -d
```
