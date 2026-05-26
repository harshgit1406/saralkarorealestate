from typing import Any

import asyncpg
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user, get_db_pool
from app.api.v1.crud import (
    audit_log,
    create_row,
    delete_row,
    ensure_permission,
    json_ready,
    update_row,
)

router = APIRouter()

PROJECT_FIELDS = ["name", "project_code", "project_type", "location", "description", "status"]


@router.get("")
async def list_projects(
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "projects.view")
        rows = await connection.fetch(
            """
            SELECT
                p.*,
                COUNT(ie.id) FILTER (
                    WHERE ie.entity_type IN ('flat', 'plot', 'villa', 'shop', 'office')
                ) AS inventory_count
            FROM projects p
            LEFT JOIN inventory_entities ie ON ie.project_id = p.id
            WHERE p.organization_id = $1
              AND ($2::varchar IS NULL OR p.status = $2)
            GROUP BY p.id
            ORDER BY p.created_at DESC
            """,
            current_user["organization_id"],
            status_filter,
        )
    return {"items": json_ready(rows)}


@router.get("/{project_id}")
async def get_project(
    project_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "projects.view")
        row = await connection.fetchrow(
            "SELECT * FROM projects WHERE id = $1 AND organization_id = $2",
            project_id,
            current_user["organization_id"],
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Project not found")
    return json_ready(row)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "projects.create")
        row = await create_row(
            connection,
            table="projects",
            organization_id=current_user["organization_id"],
            payload=payload,
            allowed_fields=PROJECT_FIELDS,
        )
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="project",
            entity_id=row["id"],
            action="created",
            new_data=row,
        )
    return row


@router.patch("/{project_id}")
async def update_project(
    project_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "projects.update")
        old, row = await update_row(
            connection,
            table="projects",
            row_id=project_id,
            organization_id=current_user["organization_id"],
            payload=payload,
            allowed_fields=PROJECT_FIELDS,
        )
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="project",
            entity_id=project_id,
            action="updated",
            old_data=old,
            new_data=row,
        )
    return row


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "projects.delete")
        old = await delete_row(
            connection,
            table="projects",
            row_id=project_id,
            organization_id=current_user["organization_id"],
        )
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="project",
            entity_id=project_id,
            action="deleted",
            old_data=old,
        )
    return {"deleted": True, "id": project_id}
