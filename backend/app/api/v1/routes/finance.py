from typing import Any

import asyncpg
from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.api.dependencies import get_current_user, get_db_pool
from app.api.v1.crud import audit_log, clean_payload, ensure_permission, json_ready

router = APIRouter()

BOOKING_FIELDS = [
    "inventory_entity_id",
    "lead_id",
    "booking_code",
    "booking_status",
    "booking_amount",
    "payment_plan_id",
    "booked_at",
    "cancelled_at",
]
STAGE_FIELDS = [
    "booking_id",
    "stage_name",
    "sequence_no",
    "stage_status",
    "stage_type",
    "requires_payment",
    "is_locked",
    "is_completed",
    "percentage",
    "amount",
    "paid_amount",
    "remaining_amount",
    "due_date",
    "completed_at",
]
PLAN_STAGE_FIELDS = [
    "payment_plan_id",
    "stage_name",
    "sequence_no",
    "percentage",
    "trigger_type",
    "requires_payment",
    "stage_type",
]


async def next_booking_code(connection: asyncpg.Connection, organization_id: int) -> str:
    count = await connection.fetchval(
        "SELECT COUNT(*) + 1 FROM bookings WHERE organization_id = $1",
        organization_id,
    )
    return f"BK-{int(count):04d}"


@router.get("/bookings")
async def list_bookings(
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "finance.view")
        rows = await connection.fetch(
            """
            SELECT
                b.*,
                ie.entity_code,
                ie.name AS inventory_name,
                c.full_name AS customer_name,
                pp.name AS payment_plan_name
            FROM bookings b
            JOIN inventory_entities ie ON ie.id = b.inventory_entity_id
            LEFT JOIN payment_plans pp ON pp.id = b.payment_plan_id
            LEFT JOIN booking_applicants ba ON ba.booking_id = b.id AND ba.is_primary = TRUE
            LEFT JOIN customers c ON c.id = ba.customer_id
            WHERE b.organization_id = $1
            ORDER BY b.created_at DESC
            """,
            current_user["organization_id"],
        )
    return {"items": json_ready(rows)}


@router.get("/bookings/{booking_id}")
async def get_booking(
    booking_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "finance.view")
        booking = await connection.fetchrow(
            "SELECT * FROM bookings WHERE id = $1 AND organization_id = $2",
            booking_id,
            current_user["organization_id"],
        )
        if booking is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        stages = await connection.fetch(
            "SELECT * FROM booking_stages WHERE booking_id = $1 AND organization_id = $2 ORDER BY sequence_no",
            booking_id,
            current_user["organization_id"],
        )
        applicants = await connection.fetch(
            """
            SELECT ba.*, c.full_name, c.phone, c.email
            FROM booking_applicants ba
            JOIN customers c ON c.id = ba.customer_id
            WHERE ba.booking_id = $1 AND ba.organization_id = $2
            ORDER BY ba.is_primary DESC, ba.id
            """,
            booking_id,
            current_user["organization_id"],
        )
        payments = await connection.fetch(
            "SELECT * FROM payments WHERE booking_id = $1 AND organization_id = $2 ORDER BY created_at DESC",
            booking_id,
            current_user["organization_id"],
        )
    return {
        "booking": json_ready(booking),
        "stages": json_ready(stages),
        "applicants": json_ready(applicants),
        "payments": json_ready(payments),
    }


@router.post("/bookings", status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "finance.create")
        data = clean_payload(payload, BOOKING_FIELDS)
        data.setdefault("booking_code", await next_booking_code(connection, current_user["organization_id"]))
        data["created_by"] = current_user["id"]
        async with connection.transaction():
            columns = ["organization_id", *data.keys()]
            booking = await connection.fetchrow(
                f"""
                INSERT INTO bookings ({", ".join(columns)})
                VALUES ({", ".join(f"${i}" for i in range(1, len(columns) + 1))})
                RETURNING *
                """,
                current_user["organization_id"],
                *data.values(),
            )
            customer_id = payload.get("customer_id")
            if customer_id:
                await connection.execute(
                    """
                    INSERT INTO booking_applicants (
                        organization_id, booking_id, customer_id, applicant_role, ownership_percentage, is_primary
                    )
                    VALUES ($1, $2, $3, 'primary', 100, TRUE)
                    ON CONFLICT (booking_id, customer_id) DO UPDATE SET is_primary = TRUE
                    """,
                    current_user["organization_id"],
                    booking["id"],
                    int(customer_id),
                )
            if booking["payment_plan_id"]:
                stages = await connection.fetch(
                    """
                    SELECT * FROM payment_plan_stages
                    WHERE payment_plan_id = $1 AND organization_id = $2
                    ORDER BY sequence_no
                    """,
                    booking["payment_plan_id"],
                    current_user["organization_id"],
                )
                for stage in stages:
                    amount = None
                    if booking["booking_amount"] and stage["percentage"]:
                        amount = float(booking["booking_amount"]) * float(stage["percentage"]) / 100
                    await connection.execute(
                        """
                        INSERT INTO booking_stages (
                            organization_id, booking_id, stage_name, sequence_no, stage_type,
                            requires_payment, percentage, amount, paid_amount, remaining_amount
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $8)
                        ON CONFLICT (booking_id, sequence_no) DO NOTHING
                        """,
                        current_user["organization_id"],
                        booking["id"],
                        stage["stage_name"],
                        stage["sequence_no"],
                        stage["stage_type"],
                        stage["requires_payment"],
                        stage["percentage"],
                        amount,
                    )
            await connection.execute(
                """
                UPDATE inventory_entities
                SET inventory_status = CASE WHEN $1 = 'confirmed' THEN 'booked' ELSE inventory_status END
                WHERE id = $2 AND organization_id = $3
                """,
                booking["booking_status"],
                booking["inventory_entity_id"],
                current_user["organization_id"],
            )
            await audit_log(
                connection,
                organization_id=current_user["organization_id"],
                user_id=current_user["id"],
                entity_type="booking",
                entity_id=booking["id"],
                action="created",
                new_data=json_ready(booking),
            )
        return await get_booking(booking["id"], current_user, pool)


@router.patch("/bookings/{booking_id}")
async def update_booking(
    booking_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "finance.update")
        data = clean_payload(payload, BOOKING_FIELDS)
        if not data:
            raise HTTPException(status_code=422, detail="No valid fields supplied")
        assignments = [f"{field} = ${index}" for index, field in enumerate(data.keys(), start=1)]
        row = await connection.fetchrow(
            f"""
            UPDATE bookings
            SET {", ".join(assignments)}
            WHERE id = ${len(data) + 1} AND organization_id = ${len(data) + 2}
            RETURNING *
            """,
            *data.values(),
            booking_id,
            current_user["organization_id"],
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Booking not found")
        return await get_booking(booking_id, current_user, pool)


@router.post("/booking-stages", status_code=status.HTTP_201_CREATED)
async def create_booking_stage(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "finance.create")
        data = clean_payload(payload, STAGE_FIELDS)
        columns = ["organization_id", *data.keys()]
        row = await connection.fetchrow(
            f"""
            INSERT INTO booking_stages ({", ".join(columns)})
            VALUES ({", ".join(f"${i}" for i in range(1, len(columns) + 1))})
            RETURNING *
            """,
            current_user["organization_id"],
            *data.values(),
        )
    return json_ready(row)


@router.patch("/booking-stages/{stage_id}")
async def update_booking_stage(
    stage_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "finance.update")
        data = clean_payload(payload, STAGE_FIELDS)
        if not data:
            raise HTTPException(status_code=422, detail="No valid fields supplied")
        assignments = [f"{field} = ${index}" for index, field in enumerate(data.keys(), start=1)]
        row = await connection.fetchrow(
            f"""
            UPDATE booking_stages
            SET {", ".join(assignments)}
            WHERE id = ${len(data) + 1} AND organization_id = ${len(data) + 2}
            RETURNING *
            """,
            *data.values(),
            stage_id,
            current_user["organization_id"],
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Booking stage not found")
    return json_ready(row)


@router.post("/payment-plan-stages", status_code=status.HTTP_201_CREATED)
async def create_payment_plan_stage(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "finance.create")
        data = clean_payload(payload, PLAN_STAGE_FIELDS)
        columns = ["organization_id", *data.keys()]
        row = await connection.fetchrow(
            f"""
            INSERT INTO payment_plan_stages ({", ".join(columns)})
            VALUES ({", ".join(f"${i}" for i in range(1, len(columns) + 1))})
            RETURNING *
            """,
            current_user["organization_id"],
            *data.values(),
        )
    return json_ready(row)
