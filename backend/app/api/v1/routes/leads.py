import json
from typing import Any

import asyncpg
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status

from app.api.dependencies import get_current_user, get_db_pool
from app.api.v1.crud import audit_log, clean_payload, ensure_permission, json_ready
from app.services.telephony import queue_auto_call

router = APIRouter()

LEAD_FIELDS = [
    "project_id",
    "lead_source_id",
    "lead_code",
    "external_lead_id",
    "name",
    "phone",
    "alternate_phone",
    "email",
    "source",
    "source_data",
    "budget_min",
    "budget_max",
    "requirements",
    "status",
    "priority",
    "assigned_to",
    "last_contacted_at",
    "next_follow_up_at",
]
SOURCE_FIELDS = ["source_name", "source_key", "source_type", "is_active", "config"]
FOLLOWUP_FIELDS = ["lead_id", "assigned_to", "followup_type", "status", "title", "notes", "due_at", "completed_at"]
ACTIVITY_FIELDS = ["lead_id", "activity_type", "notes", "metadata"]


async def next_lead_code(connection: asyncpg.Connection, organization_id: int) -> str:
    count = await connection.fetchval("SELECT COUNT(*) + 1 FROM leads WHERE organization_id = $1", organization_id)
    return f"LD-{int(count):04d}"


async def create_lead_row(
    connection: asyncpg.Connection,
    *,
    organization_id: int,
    payload: dict[str, Any],
    created_by: int | None,
    source: str,
) -> asyncpg.Record:
    data = clean_payload(payload, LEAD_FIELDS)
    data.setdefault("lead_code", await next_lead_code(connection, organization_id))
    if "source_data" in payload:
        data["source_data"] = json.dumps(payload["source_data"])
    if "requirements" in payload:
        data["requirements"] = json.dumps(payload["requirements"])
    columns = ["organization_id", *data.keys()]
    row = await connection.fetchrow(
        f"""
        INSERT INTO leads ({", ".join(columns)})
        VALUES ({", ".join(f"${i}" for i in range(1, len(columns) + 1))})
        RETURNING *
        """,
        organization_id,
        *data.values(),
    )
    await connection.execute(
        """
        INSERT INTO lead_activities (organization_id, lead_id, activity_type, notes, metadata, created_by)
        VALUES ($1, $2, 'system', 'Lead created', $3::jsonb, $4)
        """,
        organization_id,
        row["id"],
        json.dumps({"source": source}),
        created_by,
    )
    return row


async def fetch_lead_detail(
    connection: asyncpg.Connection,
    organization_id: int,
    lead_id: int,
) -> dict[str, Any]:
    lead = await connection.fetchrow(
        """
        SELECT
            l.*,
            p.name AS project_name,
            ls.source_name,
            u.full_name AS assigned_to_name
        FROM leads l
        LEFT JOIN projects p ON p.id = l.project_id
        LEFT JOIN lead_sources ls ON ls.id = l.lead_source_id
        LEFT JOIN users u ON u.id = l.assigned_to
        WHERE l.id = $1 AND l.organization_id = $2
        """,
        lead_id,
        organization_id,
    )
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    followups = await connection.fetch(
        """
        SELECT lf.*, u.full_name AS assigned_to_name
        FROM lead_followups lf
        LEFT JOIN users u ON u.id = lf.assigned_to
        WHERE lf.lead_id = $1 AND lf.organization_id = $2
        ORDER BY lf.due_at DESC
        """,
        lead_id,
        organization_id,
    )
    activities = await connection.fetch(
        """
        SELECT la.*, u.full_name AS created_by_name
        FROM lead_activities la
        LEFT JOIN users u ON u.id = la.created_by
        WHERE la.lead_id = $1 AND la.organization_id = $2
        ORDER BY la.created_at DESC
        """,
        lead_id,
        organization_id,
    )
    calls = await connection.fetch(
        """
        SELECT cs.*, u.full_name AS assigned_user_name
        FROM call_sessions cs
        LEFT JOIN users u ON u.id = cs.assigned_user_id
        WHERE cs.lead_id = $1 AND cs.organization_id = $2
        ORDER BY cs.created_at DESC
        """,
        lead_id,
        organization_id,
    )
    return {
        "lead": json_ready(lead),
        "followups": json_ready(followups),
        "activities": json_ready(activities),
        "calls": json_ready(calls),
    }


@router.get("")
async def list_leads(
    status_filter: str | None = Query(default=None, alias="status"),
    assigned_to: int | None = None,
    search: str | None = None,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.view")
        rows = await connection.fetch(
            """
            SELECT
                l.*,
                p.name AS project_name,
                ls.source_name,
                u.full_name AS assigned_to_name,
                (
                    SELECT lf.due_at
                    FROM lead_followups lf
                    WHERE lf.lead_id = l.id AND lf.status = 'pending'
                    ORDER BY lf.due_at
                    LIMIT 1
                ) AS pending_followup_at
            FROM leads l
            LEFT JOIN projects p ON p.id = l.project_id
            LEFT JOIN lead_sources ls ON ls.id = l.lead_source_id
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE l.organization_id = $1
              AND ($2::varchar IS NULL OR l.status = $2)
              AND ($3::int IS NULL OR l.assigned_to = $3)
              AND (
                  $4::varchar IS NULL
                  OR l.name ILIKE '%' || $4 || '%'
                  OR l.phone ILIKE '%' || $4 || '%'
                  OR l.email ILIKE '%' || $4 || '%'
              )
            ORDER BY l.created_at DESC
            LIMIT 100
            """,
            current_user["organization_id"],
            status_filter,
            assigned_to,
            search,
        )
    return {"items": json_ready(rows)}


@router.get("/sources/list")
async def list_sources(
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.view")
        rows = await connection.fetch(
            "SELECT * FROM lead_sources WHERE organization_id = $1 ORDER BY source_name",
            current_user["organization_id"],
        )
    return {"items": json_ready(rows)}


@router.post("/sources", status_code=status.HTTP_201_CREATED)
async def create_source(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.create")
        data = clean_payload(payload, SOURCE_FIELDS)
        columns = ["organization_id", *data.keys()]
        row = await connection.fetchrow(
            f"""
            INSERT INTO lead_sources ({", ".join(columns)})
            VALUES ({", ".join(f"${i}" for i in range(1, len(columns) + 1))})
            RETURNING *
            """,
            current_user["organization_id"],
            *data.values(),
        )
    return json_ready(row)


@router.get("/{lead_id}")
async def get_lead(
    lead_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.view")
        return await fetch_lead_detail(connection, current_user["organization_id"], lead_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.create")
        async with connection.transaction():
            row = await create_lead_row(
                connection,
                organization_id=current_user["organization_id"],
                payload=payload,
                created_by=current_user["id"],
                source="api",
            )
            if payload.get("auto_call"):
                await queue_auto_call(
                    connection,
                    organization_id=current_user["organization_id"],
                    lead_id=row["id"],
                    assigned_user_id=row["assigned_to"],
                    source="new_lead_api",
                )
            await audit_log(
                connection,
                organization_id=current_user["organization_id"],
                user_id=current_user["id"],
                entity_type="lead",
                entity_id=row["id"],
                action="created",
                new_data=json_ready(row),
            )
        return await fetch_lead_detail(connection, current_user["organization_id"], row["id"])


@router.post("/webhook/{organization_slug}/{source_key}", status_code=status.HTTP_201_CREATED)
async def lead_webhook(
    organization_slug: str,
    source_key: str,
    request: Request,
    payload: dict[str, Any] = Body(...),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    token = request.query_params.get("token") or request.headers.get("x-webhook-token")
    async with pool.acquire() as connection:
        organization = await connection.fetchrow(
            "SELECT id, name, slug FROM organizations WHERE slug = $1 AND is_active = TRUE",
            organization_slug,
        )
        if organization is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        source = await connection.fetchrow(
            """
            SELECT *
            FROM lead_sources
            WHERE organization_id = $1
              AND source_key = $2
              AND is_active = TRUE
            """,
            organization["id"],
            source_key,
        )
        if source is None:
            raise HTTPException(status_code=404, detail="Lead source not found")
        source_config = source["config"] or {}
        if isinstance(source_config, str):
            source_config = json.loads(source_config)
        expected_token = source_config.get("webhook_token")
        if expected_token and token != expected_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook token")

        default_assigned_to = source_config.get("default_assigned_to")
        if default_assigned_to is None:
            default_assigned_to = await connection.fetchval(
                """
                SELECT id
                FROM users
                WHERE organization_id = $1
                  AND is_active = TRUE
                  AND phone IS NOT NULL
                ORDER BY is_super_admin DESC, id
                LIMIT 1
                """,
                organization["id"],
            )

        normalized = {
            "lead_source_id": source["id"],
            "lead_code": payload.get("lead_code"),
            "external_lead_id": payload.get("external_lead_id") or payload.get("id"),
            "name": payload.get("name") or payload.get("full_name") or payload.get("customer_name"),
            "phone": payload.get("phone") or payload.get("mobile"),
            "alternate_phone": payload.get("alternate_phone"),
            "email": payload.get("email"),
            "source": source["source_name"],
            "source_data": payload,
            "budget_min": payload.get("budget_min"),
            "budget_max": payload.get("budget_max"),
            "requirements": payload.get("requirements") or {},
            "status": "new",
            "priority": payload.get("priority", "medium"),
            "assigned_to": default_assigned_to,
        }
        if not normalized["name"] or not normalized["phone"]:
            raise HTTPException(status_code=422, detail="Lead name and phone are required")
        async with connection.transaction():
            row = await create_lead_row(
                connection,
                organization_id=organization["id"],
                payload=normalized,
                created_by=None,
                source=f"webhook:{source_key}",
            )
            call_session = None
            if source_config.get("auto_call", True):
                provider_id = source_config.get("provider_id")
                call_session = await queue_auto_call(
                    connection,
                    organization_id=organization["id"],
                    lead_id=row["id"],
                    assigned_user_id=row["assigned_to"],
                    source=f"webhook:{source_key}",
                    provider_id=provider_id,
                )
    return {
        "lead": json_ready(row),
        "call_session": json_ready(call_session) if call_session else None,
    }


@router.patch("/{lead_id}")
async def update_lead(
    lead_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.update")
        old = await connection.fetchrow(
            "SELECT * FROM leads WHERE id = $1 AND organization_id = $2",
            lead_id,
            current_user["organization_id"],
        )
        if old is None:
            raise HTTPException(status_code=404, detail="Lead not found")
        data = clean_payload(payload, LEAD_FIELDS)
        if "source_data" in payload:
            data["source_data"] = json.dumps(payload["source_data"])
        if "requirements" in payload:
            data["requirements"] = json.dumps(payload["requirements"])
        if not data:
            raise HTTPException(status_code=422, detail="No valid fields supplied")
        assignments = [f"{field} = ${index}" for index, field in enumerate(data.keys(), start=1)]
        async with connection.transaction():
            row = await connection.fetchrow(
                f"""
                UPDATE leads
                SET {", ".join(assignments)}
                WHERE id = ${len(data) + 1} AND organization_id = ${len(data) + 2}
                RETURNING *
                """,
                *data.values(),
                lead_id,
                current_user["organization_id"],
            )
            if "status" in data and data["status"] != old["status"]:
                await connection.execute(
                    """
                    INSERT INTO lead_status_history (
                        organization_id, lead_id, old_status, new_status, changed_by, reason
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    current_user["organization_id"],
                    lead_id,
                    old["status"],
                    data["status"],
                    current_user["id"],
                    payload.get("status_reason"),
                )
            await connection.execute(
                """
                INSERT INTO lead_activities (organization_id, lead_id, activity_type, notes, created_by)
                VALUES ($1, $2, 'system', 'Lead updated', $3)
                """,
                current_user["organization_id"],
                lead_id,
                current_user["id"],
            )
            await audit_log(
                connection,
                organization_id=current_user["organization_id"],
                user_id=current_user["id"],
                entity_type="lead",
                entity_id=lead_id,
                action="updated",
                old_data=json_ready(old),
                new_data=json_ready(row),
            )
        return await fetch_lead_detail(connection, current_user["organization_id"], lead_id)


@router.delete("/{lead_id}")
async def delete_lead(
    lead_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.delete")
        old = await connection.fetchrow(
            "DELETE FROM leads WHERE id = $1 AND organization_id = $2 RETURNING *",
            lead_id,
            current_user["organization_id"],
        )
        if old is None:
            raise HTTPException(status_code=404, detail="Lead not found")
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="lead",
            entity_id=lead_id,
            action="deleted",
            old_data=json_ready(old),
        )
    return {"deleted": True, "id": lead_id}


@router.post("/{lead_id}/assign")
async def assign_lead(
    lead_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.assign")
        assigned_to = int(payload["assigned_to"])
        async with connection.transaction():
            await connection.execute(
                "UPDATE leads SET assigned_to = $1 WHERE id = $2 AND organization_id = $3",
                assigned_to,
                lead_id,
                current_user["organization_id"],
            )
            await connection.execute(
                """
                INSERT INTO lead_assignments (
                    organization_id, lead_id, assigned_to, assigned_by, assignment_reason
                )
                VALUES ($1, $2, $3, $4, $5)
                """,
                current_user["organization_id"],
                lead_id,
                assigned_to,
                current_user["id"],
                payload.get("reason"),
            )
        return await fetch_lead_detail(connection, current_user["organization_id"], lead_id)


@router.post("/{lead_id}/followups", status_code=status.HTTP_201_CREATED)
async def create_followup(
    lead_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.update")
        data = clean_payload({**payload, "lead_id": lead_id}, FOLLOWUP_FIELDS)
        columns = ["organization_id", *data.keys(), "created_by"]
        row = await connection.fetchrow(
            f"""
            INSERT INTO lead_followups ({", ".join(columns)})
            VALUES ({", ".join(f"${i}" for i in range(1, len(columns) + 1))})
            RETURNING *
            """,
            current_user["organization_id"],
            *data.values(),
            current_user["id"],
        )
    return json_ready(row)


@router.post("/{lead_id}/activities", status_code=status.HTTP_201_CREATED)
async def create_activity(
    lead_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "leads.update")
        data = clean_payload({**payload, "lead_id": lead_id}, ACTIVITY_FIELDS)
        columns = ["organization_id", *data.keys(), "created_by"]
        row = await connection.fetchrow(
            f"""
            INSERT INTO lead_activities ({", ".join(columns)})
            VALUES ({", ".join(f"${i}" for i in range(1, len(columns) + 1))})
            RETURNING *
            """,
            current_user["organization_id"],
            *data.values(),
            current_user["id"],
        )
    return json_ready(row)
