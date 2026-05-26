from typing import Any

import asyncpg
from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.api.dependencies import get_current_user, get_db_pool
from app.api.v1.crud import audit_log, clean_payload, ensure_permission, json_ready
from app.core.security import hash_password

router = APIRouter()

PERMISSIONS = {
    "dashboard": ["view"],
    "projects": ["view", "create", "update", "delete"],
    "inventory": ["view", "create", "update", "delete"],
    "maps": ["view", "create", "update", "delete"],
    "leads": ["view", "create", "update", "delete", "assign", "convert"],
    "customers": ["view", "create", "update", "delete"],
    "brokers": ["view", "create", "update", "delete"],
    "finance": ["view", "create", "update", "delete"],
    "documents": ["view", "create", "update", "delete"],
    "communication": ["view", "create", "update", "delete"],
    "hrms": ["view", "create", "update", "delete"],
    "settings": ["view", "update"],
}


async def seed_permissions(connection: asyncpg.Connection) -> None:
    for module, actions in PERMISSIONS.items():
        for action in actions:
            key = f"{module}.{action}"
            await connection.execute(
                """
                INSERT INTO permissions (permission_key, module, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (permission_key) DO UPDATE
                SET module = EXCLUDED.module,
                    description = EXCLUDED.description
                """,
                key,
                module,
                f"{action.title()} {module}",
            )


async def assign_all_permissions_to_system_admins(
    connection: asyncpg.Connection,
    organization_id: int,
) -> None:
    await connection.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        CROSS JOIN permissions p
        WHERE r.organization_id = $1
          AND r.is_system = TRUE
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """,
        organization_id,
    )


USER_FIELDS = ["full_name", "username", "email", "phone", "is_active", "is_super_admin"]
ROLE_FIELDS = ["name", "description", "is_system"]


@router.get("/permissions")
async def list_permissions(
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "hrms.view")
        await seed_permissions(connection)
        rows = await connection.fetch("SELECT * FROM permissions ORDER BY module, permission_key")
    return {"items": json_ready(rows)}


@router.get("/roles")
async def list_roles(
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "hrms.view")
        await seed_permissions(connection)
        rows = await connection.fetch(
            """
            SELECT
                r.*,
                COALESCE(
                    json_agg(p.permission_key ORDER BY p.permission_key)
                    FILTER (WHERE p.permission_key IS NOT NULL),
                    '[]'::json
                ) AS permissions
            FROM roles r
            LEFT JOIN role_permissions rp ON rp.role_id = r.id
            LEFT JOIN permissions p ON p.id = rp.permission_id
            WHERE r.organization_id = $1
            GROUP BY r.id
            ORDER BY r.name
            """,
            current_user["organization_id"],
        )
    return {"items": json_ready(rows)}


@router.post("/roles", status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "hrms.create")
        data = clean_payload(payload, ROLE_FIELDS)
        row = await connection.fetchrow(
            """
            INSERT INTO roles (organization_id, name, description, is_system)
            VALUES ($1, $2, $3, COALESCE($4, FALSE))
            RETURNING *
            """,
            current_user["organization_id"],
            data.get("name"),
            data.get("description"),
            data.get("is_system"),
        )
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="role",
            entity_id=row["id"],
            action="created",
            new_data=json_ready(row),
        )
    return json_ready(row)


@router.patch("/roles/{role_id}")
async def update_role(
    role_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "hrms.update")
        data = clean_payload(payload, ROLE_FIELDS)
        row = await connection.fetchrow(
            """
            UPDATE roles
            SET name = COALESCE($1, name),
                description = COALESCE($2, description),
                is_system = COALESCE($3, is_system)
            WHERE id = $4 AND organization_id = $5
            RETURNING *
            """,
            data.get("name"),
            data.get("description"),
            data.get("is_system"),
            role_id,
            current_user["organization_id"],
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Role not found")
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="role",
            entity_id=role_id,
            action="updated",
            new_data=json_ready(row),
        )
    return json_ready(row)


@router.put("/roles/{role_id}/permissions")
async def replace_role_permissions(
    role_id: int,
    payload: dict[str, list[str]] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    permission_keys = payload.get("permission_keys", [])
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "hrms.update")
        await seed_permissions(connection)
        role_exists = await connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM roles WHERE id = $1 AND organization_id = $2)",
            role_id,
            current_user["organization_id"],
        )
        if not role_exists:
            raise HTTPException(status_code=404, detail="Role not found")
        async with connection.transaction():
            await connection.execute("DELETE FROM role_permissions WHERE role_id = $1", role_id)
            await connection.execute(
                """
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT $1, id
                FROM permissions
                WHERE permission_key = ANY($2::varchar[])
                ON CONFLICT (role_id, permission_id) DO NOTHING
                """,
                role_id,
                permission_keys,
            )
            await audit_log(
                connection,
                organization_id=current_user["organization_id"],
                user_id=current_user["id"],
                entity_type="role",
                entity_id=role_id,
                action="permissions_updated",
                new_data={"permission_keys": permission_keys},
            )
    return {"role_id": role_id, "permission_keys": permission_keys}


@router.get("/users")
async def list_users(
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "hrms.view")
        rows = await connection.fetch(
            """
            SELECT
                u.id,
                u.full_name,
                u.username,
                u.email,
                u.phone,
                u.is_active,
                u.is_super_admin,
                u.last_login_at,
                COALESCE(json_agg(r.name ORDER BY r.name) FILTER (WHERE r.id IS NOT NULL), '[]'::json) AS roles
            FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id
            LEFT JOIN roles r ON r.id = ur.role_id
            WHERE u.organization_id = $1
            GROUP BY u.id
            ORDER BY u.full_name
            """,
            current_user["organization_id"],
        )
    return {"items": json_ready(rows)}


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "hrms.create")
        data = clean_payload(payload, USER_FIELDS)
        password = payload.get("password")
        if not password:
            raise HTTPException(status_code=422, detail="Password is required")
        row = await connection.fetchrow(
            """
            INSERT INTO users (
                organization_id, full_name, username, email, phone, password_hash,
                is_active, is_super_admin
            )
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE), COALESCE($8, FALSE))
            RETURNING id, full_name, username, email, phone, is_active, is_super_admin
            """,
            current_user["organization_id"],
            data.get("full_name"),
            data.get("username"),
            data.get("email"),
            data.get("phone"),
            hash_password(str(password)),
            data.get("is_active"),
            data.get("is_super_admin"),
        )
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="user",
            entity_id=row["id"],
            action="created",
            new_data=json_ready(row),
        )
    return json_ready(row)


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    payload: dict[str, Any] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "hrms.update")
        data = clean_payload(payload, USER_FIELDS)
        if "password" in payload:
            data["password_hash"] = hash_password(str(payload["password"]))
        fields = [*data.keys()]
        if not fields:
            raise HTTPException(status_code=422, detail="No valid fields supplied")
        assignments = [f"{field} = ${index}" for index, field in enumerate(fields, start=1)]
        row = await connection.fetchrow(
            f"""
            UPDATE users
            SET {", ".join(assignments)}
            WHERE id = ${len(fields) + 1} AND organization_id = ${len(fields) + 2}
            RETURNING id, full_name, username, email, phone, is_active, is_super_admin
            """,
            *data.values(),
            user_id,
            current_user["organization_id"],
        )
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        await audit_log(
            connection,
            organization_id=current_user["organization_id"],
            user_id=current_user["id"],
            entity_type="user",
            entity_id=user_id,
            action="updated",
            new_data=json_ready(row),
        )
    return json_ready(row)


@router.put("/users/{user_id}/roles")
async def replace_user_roles(
    user_id: int,
    payload: dict[str, list[int]] = Body(...),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict[str, Any]:
    role_ids = payload.get("role_ids", [])
    async with pool.acquire() as connection:
        await ensure_permission(connection, current_user, "hrms.update")
        user_exists = await connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND organization_id = $2)",
            user_id,
            current_user["organization_id"],
        )
        if not user_exists:
            raise HTTPException(status_code=404, detail="User not found")
        invalid_role = await connection.fetchval(
            """
            SELECT id FROM roles
            WHERE id = ANY($1::int[]) AND organization_id <> $2
            LIMIT 1
            """,
            role_ids,
            current_user["organization_id"],
        )
        if invalid_role:
            raise HTTPException(status_code=422, detail="Invalid role")
        async with connection.transaction():
            await connection.execute("DELETE FROM user_roles WHERE user_id = $1", user_id)
            await connection.execute(
                """
                INSERT INTO user_roles (user_id, role_id)
                SELECT $1, unnest($2::int[])
                ON CONFLICT (user_id, role_id) DO NOTHING
                """,
                user_id,
                role_ids,
            )
            await audit_log(
                connection,
                organization_id=current_user["organization_id"],
                user_id=current_user["id"],
                entity_type="user",
                entity_id=user_id,
                action="roles_updated",
                new_data={"role_ids": role_ids},
            )
    return {"user_id": user_id, "role_ids": role_ids}
