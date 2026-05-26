import json
from collections.abc import Iterable
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import HTTPException, status

JsonDict = dict[str, Any]


def json_ready(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime | date | time):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, asyncpg.Record):
        return {key: json_ready(value[key]) for key in value.keys()}
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    return value


def clean_payload(payload: JsonDict, allowed_fields: Iterable[str]) -> JsonDict:
    allowed = set(allowed_fields)
    cleaned = {key: value for key, value in payload.items() if key in allowed}
    return {key: json.dumps(value) if isinstance(value, (dict, list)) else value for key, value in cleaned.items()}


async def ensure_permission(
    connection: asyncpg.Connection,
    user: asyncpg.Record,
    permission_key: str,
) -> None:
    if user["is_super_admin"]:
        return

    has_permission = await connection.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM user_roles ur
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p ON p.id = rp.permission_id
            WHERE ur.user_id = $1
              AND p.permission_key = $2
        )
        """,
        user["id"],
        permission_key,
    )
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {permission_key}",
        )


async def audit_log(
    connection: asyncpg.Connection,
    *,
    organization_id: int,
    user_id: int,
    entity_type: str,
    entity_id: int,
    action: str,
    old_data: JsonDict | None = None,
    new_data: JsonDict | None = None,
) -> None:
    await connection.execute(
        """
        INSERT INTO audit_logs (
            organization_id, user_id, entity_type, entity_id, action, old_data, new_data
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
        """,
        organization_id,
        user_id,
        entity_type,
        entity_id,
        action,
        json.dumps(old_data) if old_data is not None else None,
        json.dumps(new_data) if new_data is not None else None,
    )


async def create_row(
    connection: asyncpg.Connection,
    *,
    table: str,
    organization_id: int,
    payload: JsonDict,
    allowed_fields: Iterable[str],
) -> JsonDict:
    data = clean_payload(payload, allowed_fields)
    if not data:
        raise HTTPException(status_code=422, detail="No valid fields supplied")

    columns = ["organization_id", *data.keys()]
    placeholders = [f"${index}" for index in range(1, len(columns) + 1)]
    values = [organization_id, *data.values()]
    row = await connection.fetchrow(
        f"""
        INSERT INTO {table} ({", ".join(columns)})
        VALUES ({", ".join(placeholders)})
        RETURNING *
        """,
        *values,
    )
    return json_ready(row)


async def update_row(
    connection: asyncpg.Connection,
    *,
    table: str,
    row_id: int,
    organization_id: int,
    payload: JsonDict,
    allowed_fields: Iterable[str],
) -> tuple[JsonDict, JsonDict]:
    data = clean_payload(payload, allowed_fields)
    if not data:
        raise HTTPException(status_code=422, detail="No valid fields supplied")

    old = await connection.fetchrow(
        f"SELECT * FROM {table} WHERE id = $1 AND organization_id = $2",
        row_id,
        organization_id,
    )
    if old is None:
        raise HTTPException(status_code=404, detail="Record not found")

    assignments = [f"{column} = ${index}" for index, column in enumerate(data.keys(), start=1)]
    values = [*data.values(), row_id, organization_id]
    updated = await connection.fetchrow(
        f"""
        UPDATE {table}
        SET {", ".join(assignments)}
        WHERE id = ${len(values) - 1}
          AND organization_id = ${len(values)}
        RETURNING *
        """,
        *values,
    )
    return json_ready(old), json_ready(updated)


async def delete_row(
    connection: asyncpg.Connection,
    *,
    table: str,
    row_id: int,
    organization_id: int,
) -> JsonDict:
    old = await connection.fetchrow(
        f"DELETE FROM {table} WHERE id = $1 AND organization_id = $2 RETURNING *",
        row_id,
        organization_id,
    )
    if old is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return json_ready(old)
