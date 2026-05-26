from typing import Any

import asyncpg
from fastapi import APIRouter, Body, Depends, HTTPException

from app.api.dependencies import get_current_user, get_db_pool
from app.api.v1.crud import audit_log, clean_payload, ensure_permission, json_ready

router = APIRouter()

ORG_FIELDS = ["name", "slug", "phone", "email", "address", "is_active"]


@router.get("/organization")
async def get_organization(
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "settings.view")
        row = await connection.fetchrow(
            "SELECT * FROM organizations WHERE id = $1",
            current_user["organization_id"],
        )
    return json_ready(row)


@router.patch("/organization")
async def update_organization(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "settings.update")
        data = clean_payload(payload, ORG_FIELDS)
        if not data:
            raise HTTPException(status_code=422, detail="No valid fields supplied")
        old = await connection.fetchrow(
            "SELECT * FROM organizations WHERE id = $1",
            current_user["organization_id"],
        )
        assignments = [f"{field} = ${index}" for index, field in enumerate(data.keys(), start=1)]
        row = await connection.fetchrow(
            f"""
            UPDATE organizations
            SET {", ".join(assignments)}
            WHERE id = ${len(data) + 1}
            RETURNING *
            """,
            *data.values(),
            current_user["organization_id"],
        )
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="organization",
            entity_id=current_user["organization_id"],
            action="updated",
            old_data=json_ready(old),
            new_data=json_ready(row),
        )
    return json_ready(row)
