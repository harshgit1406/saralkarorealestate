import json
from typing import Any
from uuid import UUID

import asyncpg
import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status

from app.api.dependencies import get_current_user, get_db_pool
from app.api.v1.crud import ensure_permission, json_ready
from app.services.telephony import (
    ProviderConfigError,
    active_provider,
    config_dict,
    dispatch_agent_leg,
    dispatch_lead_leg,
    mark_dispatch_failed,
    record_event,
)

router = APIRouter()


@router.post("/auto-call/dispatch")
async def dispatch_auto_calls(
    limit: int = Query(default=10, le=50),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "communication.create")
        sessions = await connection.fetch(
            """
            SELECT *
            FROM call_sessions
            WHERE organization_id = $1
              AND trigger_source = 'lead_auto_call'
              AND status = 'queued'
            ORDER BY created_at
            LIMIT $2
            """,
            current_user["organization_id"],
            limit,
        )
        results = []
        for call_session in sessions:
            try:
                provider = await active_provider(
                    connection,
                    call_session["organization_id"],
                    None,
                    call_session["provider_id"],
                )
                result = await dispatch_agent_leg(
                    connection,
                    call_session=call_session,
                    provider=provider,
                )
                results.append({"session_id": str(call_session["id"]), "status": "agent_dialing", "result": result})
            except (ProviderConfigError, httpx.HTTPError, HTTPException) as exc:
                detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
                await mark_dispatch_failed(connection, call_session, str(detail))
                results.append({"session_id": str(call_session["id"]), "status": "failed", "error": str(detail)})
    return {"items": results}


@router.get("/auto-call/queue")
async def auto_call_queue(
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "communication.view")
        rows = await connection.fetch(
            """
            SELECT
                cs.*,
                l.name AS lead_name,
                l.phone AS lead_phone,
                u.full_name AS agent_name,
                u.phone AS agent_phone
            FROM call_sessions cs
            LEFT JOIN leads l ON l.id = cs.lead_id
            LEFT JOIN users u ON u.id = cs.assigned_user_id
            WHERE cs.organization_id = $1
              AND cs.trigger_source = 'lead_auto_call'
            ORDER BY cs.created_at DESC
            LIMIT 100
            """,
            current_user["organization_id"],
        )
    return {"items": json_ready(rows)}


@router.post("/webhooks/{provider_key}", status_code=status.HTTP_202_ACCEPTED)
async def telephony_webhook(
    provider_key: str,
    request: Request,
    payload: dict[str, Any] = Body(...),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    token = request.query_params.get("token") or request.headers.get("x-webhook-token")
    session_id = payload.get("session_id") or payload.get("call_session_id")
    leg_id = payload.get("leg_id") or payload.get("call_leg_id")
    event = payload.get("event") or payload.get("status") or payload.get("event_type")
    if not session_id or not event:
        raise HTTPException(status_code=422, detail="session_id and event are required")

    async with pool.acquire() as connection:
        session = await connection.fetchrow(
            "SELECT * FROM call_sessions WHERE id = $1",
            UUID(str(session_id)),
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Call session not found")
        provider = await active_provider(connection, session["organization_id"], provider_key)
        config = config_dict(provider)
        expected_token = config.get("webhook_token")
        if expected_token and token != expected_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook token")

        leg_uuid = UUID(str(leg_id)) if leg_id else None
        await record_event(
            connection,
            organization_id=session["organization_id"],
            call_session_id=session["id"],
            call_leg_id=leg_uuid,
            event_type=str(event),
            payload=payload,
        )

        normalized = str(event).lower()
        if leg_uuid and normalized in {"agent_answered", "answered", "agent.connected"}:
            leg = await connection.fetchrow("SELECT * FROM call_legs WHERE id = $1", leg_uuid)
            if leg and leg["leg_type"] == "agent":
                await connection.execute(
                    """
                    UPDATE call_legs
                    SET status = 'answered',
                        answered_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    """,
                    leg_uuid,
                )
                await connection.execute(
                    "UPDATE call_sessions SET status = 'agent_answered' WHERE id = $1",
                    session["id"],
                )
                refreshed = await connection.fetchrow("SELECT * FROM call_sessions WHERE id = $1", session["id"])
                try:
                    lead_result = await dispatch_lead_leg(
                        connection,
                        call_session=refreshed,
                        provider=provider,
                    )
                except (ProviderConfigError, httpx.HTTPError, HTTPException) as exc:
                    detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
                    await mark_dispatch_failed(connection, refreshed, str(detail))
                    return {"accepted": True, "next": "lead_dispatch_failed", "error": str(detail)}
                return {"accepted": True, "next": "lead_dialing", "result": lead_result}

        if leg_uuid and normalized in {"lead_answered", "lead.connected"}:
            await connection.execute(
                """
                UPDATE call_legs
                SET status = 'answered',
                    answered_at = CURRENT_TIMESTAMP
                WHERE id = $1
                """,
                leg_uuid,
            )
            await connection.execute(
                """
                UPDATE call_sessions
                SET status = 'bridged',
                    bridged_at = COALESCE(bridged_at, CURRENT_TIMESTAMP)
                WHERE id = $1
                """,
                session["id"],
            )
            return {"accepted": True, "next": "bridged"}

        if normalized in {"completed", "call_completed", "hangup"}:
            if leg_uuid:
                await connection.execute(
                    """
                    UPDATE call_legs
                    SET status = 'completed',
                        ended_at = CURRENT_TIMESTAMP,
                        duration_seconds = COALESCE($1::int, duration_seconds)
                    WHERE id = $2
                    """,
                    payload.get("duration_seconds"),
                    leg_uuid,
                )
            open_legs = await connection.fetchval(
                """
                SELECT COUNT(*)
                FROM call_legs
                WHERE call_session_id = $1
                  AND status NOT IN ('completed', 'failed', 'cancelled', 'busy', 'no_answer')
                """,
                session["id"],
            )
            if not open_legs:
                await connection.execute(
                    """
                    UPDATE call_sessions
                    SET status = 'completed',
                        ended_at = CURRENT_TIMESTAMP,
                        disposition = COALESCE($1, disposition),
                        recording_url = COALESCE($2, recording_url)
                    WHERE id = $3
                    """,
                    payload.get("disposition"),
                    payload.get("recording_url"),
                    session["id"],
                )
            return {"accepted": True, "next": "completed"}

        if normalized in {"failed", "busy", "no_answer", "missed", "cancelled"}:
            mapped = "no_answer" if normalized == "missed" else normalized
            if leg_uuid:
                await connection.execute(
                    "UPDATE call_legs SET status = $1, ended_at = CURRENT_TIMESTAMP WHERE id = $2",
                    mapped,
                    leg_uuid,
                )
            await connection.execute(
                """
                UPDATE call_sessions
                SET status = CASE WHEN $1 = 'cancelled' THEN 'cancelled' ELSE 'failed' END,
                    ended_at = CURRENT_TIMESTAMP,
                    disposition = $1,
                    metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
                WHERE id = $3
                """,
                mapped,
                json.dumps({"last_provider_payload": payload}),
                session["id"],
            )
            return {"accepted": True, "next": mapped}

    return {"accepted": True, "next": "event_recorded"}
