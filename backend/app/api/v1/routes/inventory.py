import json
from typing import Any

import asyncpg
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user, get_db_pool
from app.api.v1.crud import audit_log, clean_payload, ensure_permission, json_ready

router = APIRouter()

ENTITY_FIELDS = [
    "project_id",
    "parent_id",
    "entity_type",
    "entity_code",
    "name",
    "inventory_status",
    "lifecycle_stage",
    "level_no",
    "path",
    "sort_order",
    "metadata",
]
DIMENSION_FIELDS = [
    "area",
    "carpet_area",
    "builtup_area",
    "saleable_area",
    "length",
    "width",
    "measurement_unit",
]
PRICING_FIELDS = ["base_price", "final_price", "price_per_sqft", "currency", "pricing_metadata"]
DETAIL_FIELDS = ["facing", "bhk_type", "display_note", "notes", "metadata"]
MAP_FIELDS = ["project_id", "map_name", "map_engine", "version_no", "is_published", "map_data", "thumbnail_url"]
ELEMENT_FIELDS = ["project_map_id", "inventory_entity_id", "element_id", "element_type", "is_interactive", "metadata"]


async def assert_project(
    connection: asyncpg.Connection,
    organization_id: int,
    project_id: int,
) -> None:
    exists = await connection.fetchval(
        "SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1 AND organization_id = $2)",
        project_id,
        organization_id,
    )
    if not exists:
        raise HTTPException(status_code=422, detail="Invalid project_id")


async def upsert_one_to_one(
    connection: asyncpg.Connection,
    *,
    table: str,
    organization_id: int,
    inventory_entity_id: int,
    payload: dict[str, Any],
    fields: list[str],
) -> dict[str, Any] | None:
    data = clean_payload(payload, fields)
    if not data:
        return None
    columns = ["organization_id", "inventory_entity_id", *data.keys()]
    placeholders = [f"${index}" for index in range(1, len(columns) + 1)]
    update_columns = [f"{column} = EXCLUDED.{column}" for column in data.keys()]
    row = await connection.fetchrow(
        f"""
        INSERT INTO {table} ({", ".join(columns)})
        VALUES ({", ".join(placeholders)})
        ON CONFLICT (inventory_entity_id) DO UPDATE
        SET {", ".join(update_columns)}
        RETURNING *
        """,
        organization_id,
        inventory_entity_id,
        *data.values(),
    )
    return json_ready(row)


async def fetch_inventory_detail(
    connection: asyncpg.Connection,
    organization_id: int,
    entity_id: int,
) -> dict[str, Any]:
    row = await connection.fetchrow(
        """
        SELECT
            ie.*,
            p.name AS project_name,
            row_to_json(dim) AS dimensions,
            row_to_json(pr) AS pricing,
            row_to_json(det) AS details,
            (
                SELECT row_to_json(bdata)
                FROM (
                    SELECT
                        b.*,
                        c.full_name AS customer_name,
                        c.phone AS customer_phone,
                        l.name AS lead_name
                    FROM bookings b
                    LEFT JOIN booking_applicants ba ON ba.booking_id = b.id AND ba.is_primary = TRUE
                    LEFT JOIN customers c ON c.id = ba.customer_id
                    LEFT JOIN leads l ON l.id = b.lead_id
                    WHERE b.inventory_entity_id = ie.id
                      AND b.booking_status IN ('reserved', 'confirmed')
                    ORDER BY b.created_at DESC
                    LIMIT 1
                ) bdata
            ) AS active_booking
        FROM inventory_entities ie
        JOIN projects p ON p.id = ie.project_id
        LEFT JOIN inventory_dimensions dim ON dim.inventory_entity_id = ie.id
        LEFT JOIN inventory_pricing pr ON pr.inventory_entity_id = ie.id
        LEFT JOIN inventory_details det ON det.inventory_entity_id = ie.id
        WHERE ie.id = $1 AND ie.organization_id = $2
        """,
        entity_id,
        organization_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Inventory entity not found")
    return json_ready(row)


@router.get("/entities")
async def list_entities(
    project_id: int | None = None,
    parent_id: int | None = None,
    entity_type: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "inventory.view")
        rows = await connection.fetch(
            """
            SELECT
                ie.*,
                p.name AS project_name,
                dim.saleable_area,
                dim.carpet_area,
                pr.final_price,
                pr.price_per_sqft,
                det.facing,
                det.bhk_type,
                det.display_note
            FROM inventory_entities ie
            JOIN projects p ON p.id = ie.project_id
            LEFT JOIN inventory_dimensions dim ON dim.inventory_entity_id = ie.id
            LEFT JOIN inventory_pricing pr ON pr.inventory_entity_id = ie.id
            LEFT JOIN inventory_details det ON det.inventory_entity_id = ie.id
            WHERE ie.organization_id = $1
              AND ($2::int IS NULL OR ie.project_id = $2)
              AND ($3::int IS NULL OR ie.parent_id = $3)
              AND ($4::varchar IS NULL OR ie.entity_type = $4)
              AND ($5::varchar IS NULL OR ie.inventory_status = $5)
            ORDER BY ie.path, ie.sort_order, ie.entity_code
            """,
            current_user["organization_id"],
            project_id,
            parent_id,
            entity_type,
            status_filter,
        )
    return {"items": json_ready(rows)}


@router.get("/entities/{entity_id}")
async def get_entity(
    entity_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "inventory.view")
        return await fetch_inventory_detail(connection, current_user["organization_id"], entity_id)


@router.post("/entities", status_code=status.HTTP_201_CREATED)
async def create_entity(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "inventory.create")
        await assert_project(connection, current_user["organization_id"], int(payload["project_id"]))
        async with connection.transaction():
            entity_data = clean_payload(payload, ENTITY_FIELDS)
            columns = ["organization_id", *entity_data.keys()]
            row = await connection.fetchrow(
                f"""
                INSERT INTO inventory_entities ({", ".join(columns)})
                VALUES ({", ".join(f"${i}" for i in range(1, len(columns) + 1))})
                RETURNING *
                """,
                current_user["organization_id"],
                *entity_data.values(),
            )
            await upsert_one_to_one(
                connection,
                table="inventory_dimensions",
                organization_id=current_user["organization_id"],
                inventory_entity_id=row["id"],
                payload=payload.get("dimensions", {}),
                fields=DIMENSION_FIELDS,
            )
            await upsert_one_to_one(
                connection,
                table="inventory_pricing",
                organization_id=current_user["organization_id"],
                inventory_entity_id=row["id"],
                payload=payload.get("pricing", {}),
                fields=PRICING_FIELDS,
            )
            await upsert_one_to_one(
                connection,
                table="inventory_details",
                organization_id=current_user["organization_id"],
                inventory_entity_id=row["id"],
                payload=payload.get("details", {}),
                fields=DETAIL_FIELDS,
            )
            detail = await fetch_inventory_detail(connection, current_user["organization_id"], row["id"])
            await audit_log(
                connection,
                organization_id=current_user["organization_id"],
                user_id=current_user["id"],
                entity_type="inventory",
                entity_id=row["id"],
                action="created",
                new_data=detail,
            )
    return detail


@router.patch("/entities/{entity_id}")
async def update_entity(
    entity_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "inventory.update")
        old = await fetch_inventory_detail(connection, current_user["organization_id"], entity_id)
        async with connection.transaction():
            entity_data = clean_payload(payload, ENTITY_FIELDS)
            if entity_data:
                assignments = [
                    f"{column} = ${index}" for index, column in enumerate(entity_data.keys(), start=1)
                ]
                await connection.execute(
                    f"""
                    UPDATE inventory_entities
                    SET {", ".join(assignments)}
                    WHERE id = ${len(entity_data) + 1} AND organization_id = ${len(entity_data) + 2}
                    """,
                    *entity_data.values(),
                    entity_id,
                    current_user["organization_id"],
                )
            await upsert_one_to_one(
                connection,
                table="inventory_dimensions",
                organization_id=current_user["organization_id"],
                inventory_entity_id=entity_id,
                payload=payload.get("dimensions", {}),
                fields=DIMENSION_FIELDS,
            )
            await upsert_one_to_one(
                connection,
                table="inventory_pricing",
                organization_id=current_user["organization_id"],
                inventory_entity_id=entity_id,
                payload=payload.get("pricing", {}),
                fields=PRICING_FIELDS,
            )
            await upsert_one_to_one(
                connection,
                table="inventory_details",
                organization_id=current_user["organization_id"],
                inventory_entity_id=entity_id,
                payload=payload.get("details", {}),
                fields=DETAIL_FIELDS,
            )
            detail = await fetch_inventory_detail(connection, current_user["organization_id"], entity_id)
            await audit_log(
                connection,
                organization_id=current_user["organization_id"],
                user_id=current_user["id"],
                entity_type="inventory",
                entity_id=entity_id,
                action="updated",
                old_data=old,
                new_data=detail,
            )
    return detail


@router.delete("/entities/{entity_id}")
async def delete_entity(
    entity_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "inventory.delete")
        old = await fetch_inventory_detail(connection, current_user["organization_id"], entity_id)
        deleted = await connection.fetchrow(
            "DELETE FROM inventory_entities WHERE id = $1 AND organization_id = $2 RETURNING id",
            entity_id,
            current_user["organization_id"],
        )
        if deleted is None:
            raise HTTPException(status_code=404, detail="Inventory entity not found")
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="inventory",
            entity_id=entity_id,
            action="deleted",
            old_data=old,
        )
    return {"deleted": True, "id": entity_id}


@router.get("/tree")
async def inventory_tree(
    project_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "inventory.view")
        await assert_project(connection, current_user["organization_id"], project_id)
        rows = await connection.fetch(
            """
            SELECT id, parent_id, entity_type, entity_code, name, inventory_status, level_no, path, sort_order
            FROM inventory_entities
            WHERE organization_id = $1 AND project_id = $2
            ORDER BY level_no, sort_order, entity_code
            """,
            current_user["organization_id"],
            project_id,
        )
    return {"items": json_ready(rows)}


@router.get("/map")
async def inventory_map(
    project_id: int,
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "inventory.view")
        project = await connection.fetchrow(
            "SELECT * FROM projects WHERE id = $1 AND organization_id = $2",
            project_id,
            current_user["organization_id"],
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        project_map = await connection.fetchrow(
            """
            SELECT * FROM project_maps
            WHERE project_id = $1 AND organization_id = $2 AND is_published = TRUE
            ORDER BY version_no DESC, id DESC
            LIMIT 1
            """,
            project_id,
            current_user["organization_id"],
        )
        elements = await connection.fetch(
            """
            SELECT
                me.*,
                ie.entity_code,
                ie.name AS inventory_name,
                ie.entity_type AS inventory_type,
                ie.inventory_status,
                pr.final_price,
                dim.saleable_area
            FROM map_elements me
            LEFT JOIN inventory_entities ie ON ie.id = me.inventory_entity_id
            LEFT JOIN inventory_pricing pr ON pr.inventory_entity_id = ie.id
            LEFT JOIN inventory_dimensions dim ON dim.inventory_entity_id = ie.id
            WHERE me.organization_id = $1
              AND ($2::int IS NULL OR me.project_map_id = $2)
            ORDER BY me.element_id
            """,
            current_user["organization_id"],
            project_map["id"] if project_map else None,
        )
        units = await connection.fetch(
            """
            SELECT
                ie.id,
                ie.entity_code AS code,
                ie.name,
                ie.entity_type AS type,
                ie.inventory_status AS status,
                ie.parent_id,
                ie.path,
                dim.saleable_area AS area,
                det.bhk_type AS bhk,
                pr.final_price AS price
            FROM inventory_entities ie
            LEFT JOIN inventory_dimensions dim ON dim.inventory_entity_id = ie.id
            LEFT JOIN inventory_details det ON det.inventory_entity_id = ie.id
            LEFT JOIN inventory_pricing pr ON pr.inventory_entity_id = ie.id
            WHERE ie.organization_id = $1
              AND ie.project_id = $2
              AND ie.entity_type IN ('flat', 'plot', 'villa', 'shop', 'office')
            ORDER BY ie.sort_order, ie.entity_code
            """,
            current_user["organization_id"],
            project_id,
        )
    return {
        "project": json_ready(project),
        "map": json_ready(project_map),
        "elements": json_ready(elements),
        "units": json_ready(units),
    }


@router.post("/maps", status_code=status.HTTP_201_CREATED)
async def create_map(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "maps.create")
        await assert_project(connection, current_user["organization_id"], int(payload["project_id"]))
        data = clean_payload(payload, MAP_FIELDS)
        data["map_data"] = json.dumps(payload.get("map_data", {}))
        row = await connection.fetchrow(
            f"""
            INSERT INTO project_maps (organization_id, {", ".join(data.keys())}, created_by)
            VALUES ($1, {", ".join(f"${i}" for i in range(2, len(data) + 2))}, ${len(data) + 2})
            RETURNING *
            """,
            current_user["organization_id"],
            *data.values(),
            current_user["id"],
        )
    return json_ready(row)


@router.post("/map-elements", status_code=status.HTTP_201_CREATED)
async def create_map_element(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "maps.create")
        data = clean_payload(payload, ELEMENT_FIELDS)
        row = await connection.fetchrow(
            f"""
            INSERT INTO map_elements (organization_id, {", ".join(data.keys())})
            VALUES ($1, {", ".join(f"${i}" for i in range(2, len(data) + 2))})
            RETURNING *
            """,
            current_user["organization_id"],
            *data.values(),
        )
    return json_ready(row)
