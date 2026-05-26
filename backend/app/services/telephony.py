import json
from typing import Any
from uuid import UUID

import asyncpg
import httpx
from fastapi import HTTPException

from app.api.v1.crud import json_ready


class ProviderConfigError(Exception):
    pass


def config_dict(provider: asyncpg.Record) -> dict[str, Any]:
    config = provider["config"] or {}
    if isinstance(config, str):
        return json.loads(config)
    return dict(config)


def callback_url(config: dict[str, Any], provider_key: str) -> str | None:
    base = config.get("callback_base_url")
    token = config.get("webhook_token")
    if not base:
        return None
    url = f"{str(base).rstrip('/')}/api/v1/communication/webhooks/{provider_key}"
    return f"{url}?token={token}" if token else url


async def default_agent_id(connection: asyncpg.Connection, organization_id: int) -> int | None:
    return await connection.fetchval(
        """
        SELECT u.id
        FROM users u
        WHERE u.organization_id = $1
          AND u.is_active = TRUE
          AND u.phone IS NOT NULL
        ORDER BY u.is_super_admin DESC, u.id
        LIMIT 1
        """,
        organization_id,
    )


async def active_provider(
    connection: asyncpg.Connection,
    organization_id: int,
    provider_key: str | None = None,
    provider_id: int | None = None,
) -> asyncpg.Record:
    provider = await connection.fetchrow(
        """
        SELECT *
        FROM telephony_providers
        WHERE organization_id = $1
          AND status = 'active'
          AND ($2::varchar IS NULL OR provider_key = $2)
          AND ($3::int IS NULL OR id = $3)
        ORDER BY id DESC
        LIMIT 1
        """,
        organization_id,
        provider_key,
        provider_id,
    )
    if provider is None:
        raise HTTPException(status_code=422, detail="No active telephony provider configured")
    return provider


async def queue_auto_call(
    connection: asyncpg.Connection,
    *,
    organization_id: int,
    lead_id: int,
    assigned_user_id: int | None,
    source: str,
    provider_id: int | None = None,
) -> asyncpg.Record:
    if assigned_user_id is None:
        assigned_user_id = await default_agent_id(connection, organization_id)
    return await connection.fetchrow(
        """
        INSERT INTO call_sessions (
            organization_id,
            provider_id,
            lead_id,
            assigned_user_id,
            trigger_source,
            direction,
            status,
            metadata
        )
        VALUES ($1, $2, $3, $4, 'lead_auto_call', 'outbound', 'queued', $5::jsonb)
        RETURNING *
        """,
        organization_id,
        provider_id,
        lead_id,
        assigned_user_id,
        json.dumps({"source": source, "flow": "agent_first_bridge"}),
    )


async def record_event(
    connection: asyncpg.Connection,
    *,
    organization_id: int,
    call_session_id: UUID,
    event_type: str,
    payload: dict[str, Any],
    call_leg_id: UUID | None = None,
) -> None:
    await connection.execute(
        """
        INSERT INTO call_events (
            organization_id,
            call_session_id,
            call_leg_id,
            event_type,
            event_payload
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        """,
        organization_id,
        call_session_id,
        call_leg_id,
        event_type,
        json.dumps(payload),
    )


async def create_leg(
    connection: asyncpg.Connection,
    *,
    organization_id: int,
    call_session_id: UUID,
    leg_type: str,
    user_id: int | None = None,
    lead_id: int | None = None,
    phone: str | None = None,
) -> asyncpg.Record:
    return await connection.fetchrow(
        """
        INSERT INTO call_legs (
            organization_id,
            call_session_id,
            leg_type,
            user_id,
            lead_id,
            phone,
            status,
            started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'queued', CURRENT_TIMESTAMP)
        RETURNING *
        """,
        organization_id,
        call_session_id,
        leg_type,
        user_id,
        lead_id,
        phone,
    )


async def provider_call(
    provider: asyncpg.Record,
    *,
    call_session: asyncpg.Record,
    leg: asyncpg.Record,
    to_number: str,
    leg_type: str,
) -> dict[str, Any]:
    config = config_dict(provider)
    adapter = config.get("adapter", "generic_http")
    if adapter != "generic_http":
        raise ProviderConfigError(f"Unsupported telephony adapter: {adapter}")

    call_url = config.get("call_url")
    if not call_url:
        raise ProviderConfigError("Provider config.call_url is required for real dialing")

    headers = {"Content-Type": "application/json"}
    auth_header = config.get("auth_header")
    auth_token = config.get("auth_token")
    if auth_header and auth_token:
        headers[str(auth_header)] = str(auth_token)

    body = {
        "session_id": str(call_session["id"]),
        "leg_id": str(leg["id"]),
        "leg_type": leg_type,
        "to": to_number,
        "from": config.get("from_number"),
        "callback_url": callback_url(config, provider["provider_key"]),
        "metadata": {
            "lead_id": call_session["lead_id"],
            "assigned_user_id": call_session["assigned_user_id"],
        },
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(str(call_url), json=body, headers=headers)
        response.raise_for_status()
        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}


async def dispatch_agent_leg(
    connection: asyncpg.Connection,
    *,
    call_session: asyncpg.Record,
    provider: asyncpg.Record,
) -> dict[str, Any]:
    agent = await connection.fetchrow(
        """
        SELECT id, full_name, phone
        FROM users
        WHERE id = $1
          AND organization_id = $2
          AND is_active = TRUE
        """,
        call_session["assigned_user_id"],
        call_session["organization_id"],
    )
    if agent is None or not agent["phone"]:
        raise HTTPException(status_code=422, detail="Assigned agent has no callable phone number")

    leg = await create_leg(
        connection,
        organization_id=call_session["organization_id"],
        call_session_id=call_session["id"],
        leg_type="agent",
        user_id=agent["id"],
        phone=agent["phone"],
    )
    provider_result = await provider_call(
        provider,
        call_session=call_session,
        leg=leg,
        to_number=agent["phone"],
        leg_type="agent",
    )
    provider_ref = provider_result.get("call_id") or provider_result.get("id") or provider_result.get("reference")
    await connection.execute(
        """
        UPDATE call_legs
        SET status = 'ringing',
            provider_leg_reference = $1,
            metadata = $2::jsonb
        WHERE id = $3
        """,
        str(provider_ref) if provider_ref else None,
        json.dumps(provider_result),
        leg["id"],
    )
    await connection.execute(
        """
        UPDATE call_sessions
        SET provider_id = $1,
            status = 'agent_dialing',
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            provider_call_reference = COALESCE($2, provider_call_reference)
        WHERE id = $3
        """,
        provider["id"],
        str(provider_ref) if provider_ref else None,
        call_session["id"],
    )
    await record_event(
        connection,
        organization_id=call_session["organization_id"],
        call_session_id=call_session["id"],
        call_leg_id=leg["id"],
        event_type="agent_leg_dispatched",
        payload=provider_result,
    )
    return {"call_session": json_ready(call_session), "agent_leg": json_ready(leg), "provider": provider_result}


async def dispatch_lead_leg(
    connection: asyncpg.Connection,
    *,
    call_session: asyncpg.Record,
    provider: asyncpg.Record,
) -> dict[str, Any]:
    lead = await connection.fetchrow(
        """
        SELECT id, name, phone
        FROM leads
        WHERE id = $1 AND organization_id = $2
        """,
        call_session["lead_id"],
        call_session["organization_id"],
    )
    if lead is None or not lead["phone"]:
        raise HTTPException(status_code=422, detail="Lead has no callable phone number")

    leg = await create_leg(
        connection,
        organization_id=call_session["organization_id"],
        call_session_id=call_session["id"],
        leg_type="lead",
        lead_id=lead["id"],
        phone=lead["phone"],
    )
    provider_result = await provider_call(
        provider,
        call_session=call_session,
        leg=leg,
        to_number=lead["phone"],
        leg_type="lead",
    )
    provider_ref = provider_result.get("call_id") or provider_result.get("id") or provider_result.get("reference")
    await connection.execute(
        """
        UPDATE call_legs
        SET status = 'ringing',
            provider_leg_reference = $1,
            metadata = $2::jsonb
        WHERE id = $3
        """,
        str(provider_ref) if provider_ref else None,
        json.dumps(provider_result),
        leg["id"],
    )
    await connection.execute(
        "UPDATE call_sessions SET status = 'lead_dialing' WHERE id = $1",
        call_session["id"],
    )
    await record_event(
        connection,
        organization_id=call_session["organization_id"],
        call_session_id=call_session["id"],
        call_leg_id=leg["id"],
        event_type="lead_leg_dispatched",
        payload=provider_result,
    )
    return {"lead_leg": json_ready(leg), "provider": provider_result}


async def mark_dispatch_failed(
    connection: asyncpg.Connection,
    call_session: asyncpg.Record,
    error: str,
) -> None:
    await connection.execute(
        """
        UPDATE call_sessions
        SET status = 'failed',
            ended_at = CURRENT_TIMESTAMP,
            disposition = 'dispatch_failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
        WHERE id = $2
        """,
        json.dumps({"dispatch_error": error}),
        call_session["id"],
    )
    await record_event(
        connection,
        organization_id=call_session["organization_id"],
        call_session_id=call_session["id"],
        event_type="dispatch_failed",
        payload={"error": error},
    )
