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

TABLES = {
    "customers": {
        "table": "customers",
        "permission": "customers",
        "entity": "customer",
        "fields": [
            "customer_code",
            "full_name",
            "phone",
            "email",
            "pan_no",
            "aadhaar_no",
            "address",
            "kyc_status",
        ],
        "order": "created_at DESC",
    },
    "brokers": {
        "table": "brokers",
        "permission": "brokers",
        "entity": "broker",
        "fields": [
            "broker_code",
            "username",
            "full_name",
            "company_name",
            "phone",
            "email",
            "address",
            "kyc_status",
        ],
        "order": "created_at DESC",
    },
    "payment-plans": {
        "table": "payment_plans",
        "permission": "finance",
        "entity": "payment_plan",
        "fields": ["name", "plan_type", "description"],
        "order": "name",
    },
    "payments": {
        "table": "payments",
        "permission": "finance",
        "entity": "payment",
        "fields": [
            "booking_id",
            "booking_stage_id",
            "customer_id",
            "payment_code",
            "amount",
            "payment_mode",
            "transaction_type",
            "reference_no",
            "payment_status",
            "paid_at",
        ],
        "order": "created_at DESC",
    },
    "documents": {
        "table": "documents",
        "permission": "documents",
        "entity": "document",
        "fields": [
            "file_name",
            "file_url",
            "mime_type",
            "file_size_bytes",
            "document_type",
            "verification_status",
            "verified_by",
            "verified_at",
            "uploaded_by",
        ],
        "order": "uploaded_at DESC",
    },
    "message-templates": {
        "table": "message_templates",
        "permission": "communication",
        "entity": "message_template",
        "fields": ["template_name", "channel", "provider_template_id", "content", "variables", "is_active"],
        "order": "template_name",
    },
    "messages": {
        "table": "outbound_messages",
        "permission": "communication",
        "entity": "outbound_message",
        "fields": [
            "lead_id",
            "customer_id",
            "booking_id",
            "template_id",
            "channel",
            "recipient_phone",
            "recipient_email",
            "content",
            "status",
            "provider_message_id",
            "sent_by",
            "sent_at",
        ],
        "order": "created_at DESC",
    },
    "calls": {
        "table": "call_sessions",
        "permission": "communication",
        "entity": "call_session",
        "fields": [
            "provider_id",
            "lead_id",
            "assigned_user_id",
            "trigger_source",
            "direction",
            "status",
            "started_at",
            "bridged_at",
            "ended_at",
            "disposition",
            "recording_url",
            "provider_call_reference",
            "metadata",
        ],
        "order": "created_at DESC",
    },
}


def config_or_404(resource: str) -> dict[str, Any]:
    config = TABLES.get(resource)
    if not config:
        raise HTTPException(status_code=404, detail="Resource not found")
    return config


def audit_entity_id(row_id: Any) -> int:
    return row_id if isinstance(row_id, int) else 0


@router.get("/{resource}")
async def list_resource(
    resource: str,
    limit: int = Query(default=100, le=500),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    config = config_or_404(resource)
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, f"{config['permission']}.view")
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM {config["table"]}
            WHERE organization_id = $1
            ORDER BY {config["order"]}
            LIMIT $2
            """,
            current_user["organization_id"],
            limit,
        )
    return {"items": json_ready(rows)}


@router.get("/{resource}/{row_id}")
async def get_resource(
    resource: str,
    row_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    config = config_or_404(resource)
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, f"{config['permission']}.view")
        row = await connection.fetchrow(
            f"SELECT * FROM {config['table']} WHERE id = $1 AND organization_id = $2",
            row_id,
            current_user["organization_id"],
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Record not found")
    return json_ready(row)


@router.post("/{resource}", status_code=status.HTTP_201_CREATED)
async def create_resource(
    resource: str,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    config = config_or_404(resource)
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, f"{config['permission']}.create")
        row = await create_row(
            connection,
            table=config["table"],
            organization_id=current_user["organization_id"],
            payload=payload,
            allowed_fields=config["fields"],
        )
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type=config["entity"],
            entity_id=audit_entity_id(row["id"]),
            action="created",
            new_data=row,
        )
    return row


@router.patch("/{resource}/{row_id}")
async def update_resource(
    resource: str,
    row_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    config = config_or_404(resource)
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, f"{config['permission']}.update")
        old, row = await update_row(
            connection,
            table=config["table"],
            row_id=row_id,
            organization_id=current_user["organization_id"],
            payload=payload,
            allowed_fields=config["fields"],
        )
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type=config["entity"],
            entity_id=audit_entity_id(row_id),
            action="updated",
            old_data=old,
            new_data=row,
        )
    return row


@router.delete("/{resource}/{row_id}")
async def delete_resource(
    resource: str,
    row_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    config = config_or_404(resource)
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, f"{config['permission']}.delete")
        old = await delete_row(
            connection,
            table=config["table"],
            row_id=row_id,
            organization_id=current_user["organization_id"],
        )
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type=config["entity"],
            entity_id=audit_entity_id(row_id),
            action="deleted",
            old_data=old,
        )
    return {"deleted": True, "id": row_id}
