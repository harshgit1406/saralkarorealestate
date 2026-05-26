from datetime import timedelta

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.api.dependencies import get_current_user, get_db_pool
from app.core.config import settings
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    utc_now,
    verify_password,
)
from app.schemas.auth import (
    AuthTokens,
    BootstrapRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    UserProfile,
)

router = APIRouter()


def user_profile_from_record(user: asyncpg.Record) -> UserProfile:
    return UserProfile(
        id=user["id"],
        organization_id=user["organization_id"],
        organization_name=user["organization_name"],
        organization_slug=user["organization_slug"],
        full_name=user["full_name"],
        username=user["username"],
        email=user["email"],
        phone=user["phone"],
        is_super_admin=user["is_super_admin"],
    )


async def issue_tokens(
    connection: asyncpg.Connection,
    *,
    request: Request,
    user: asyncpg.Record,
    device_label: str | None,
) -> AuthTokens:
    refresh_token = new_refresh_token()
    refresh_token_hash = hash_refresh_token(refresh_token)
    refresh_expires_at = utc_now() + timedelta(days=settings.refresh_token_expire_days)

    session_id = await connection.fetchval(
        """
        INSERT INTO auth_sessions (
            organization_id,
            user_id,
            refresh_token_hash,
            device_label,
            ip_address,
            user_agent,
            expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        """,
        user["organization_id"],
        user["id"],
        refresh_token_hash,
        device_label,
        request.client.host if request.client else None,
        request.headers.get("user-agent"),
        refresh_expires_at.replace(tzinfo=None),
    )

    access_token = create_access_token(
        user_id=user["id"],
        organization_id=user["organization_id"],
        session_id=str(session_id),
    )

    return AuthTokens(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=user_profile_from_record(user),
    )


@router.post("/bootstrap", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
async def bootstrap_first_admin(
    payload: BootstrapRequest,
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> UserProfile:
    if not settings.bootstrap_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bootstrap is disabled",
        )

    async with pool.acquire() as connection:
        existing_user_count = await connection.fetchval("SELECT COUNT(*) FROM users")
        if existing_user_count:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bootstrap can only run before users exist",
            )

        async with connection.transaction():
            organization = await connection.fetchrow(
                """
                INSERT INTO organizations (name, slug, email, is_active)
                VALUES ($1, $2, $3, TRUE)
                RETURNING id, name, slug
                """,
                payload.organization_name,
                payload.organization_slug,
                payload.email,
            )
            user = await connection.fetchrow(
                """
                INSERT INTO users (
                    organization_id,
                    full_name,
                    username,
                    email,
                    password_hash,
                    is_active,
                    is_super_admin
                )
                VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
                RETURNING
                    id,
                    organization_id,
                    full_name,
                    username,
                    email,
                    phone,
                    is_super_admin,
                    $6::varchar AS organization_name,
                    $7::varchar AS organization_slug
                """,
                organization["id"],
                payload.full_name,
                payload.username,
                payload.email,
                hash_password(payload.password),
                organization["name"],
                organization["slug"],
            )

    return user_profile_from_record(user)


@router.post("/login", response_model=AuthTokens)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> AuthTokens:
    async with pool.acquire() as connection:
        user = await connection.fetchrow(
            """
            SELECT
                u.id,
                u.organization_id,
                u.full_name,
                u.username,
                u.email,
                u.phone,
                u.password_hash,
                u.is_active,
                u.is_super_admin,
                o.name AS organization_name,
                o.slug AS organization_slug
            FROM users u
            JOIN organizations o ON o.id = u.organization_id
            WHERE o.slug = $1
              AND o.is_active = TRUE
              AND (
                LOWER(u.email) = LOWER($2)
                OR LOWER(u.username) = LOWER($2)
              )
            """,
            payload.organization_slug,
            payload.username_or_email,
        )

        if user is None or not user["is_active"] or not verify_password(
            payload.password, user["password_hash"]
        ):
            await connection.execute(
                """
                INSERT INTO auth_login_attempts (
                    organization_id,
                    user_id,
                    username_or_email,
                    ip_address,
                    success
                )
                VALUES ($1, $2, $3, $4, FALSE)
                """,
                user["organization_id"] if user else None,
                user["id"] if user else None,
                payload.username_or_email,
                request.client.host if request.client else None,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        async with connection.transaction():
            await connection.execute(
                """
                INSERT INTO auth_login_attempts (
                    organization_id,
                    user_id,
                    username_or_email,
                    ip_address,
                    success
                )
                VALUES ($1, $2, $3, $4, TRUE)
                """,
                user["organization_id"],
                user["id"],
                payload.username_or_email,
                request.client.host if request.client else None,
            )
            await connection.execute(
                "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1",
                user["id"],
            )
            tokens = await issue_tokens(
                connection,
                request=request,
                user=user,
                device_label=payload.device_label,
            )

    response.headers["Cache-Control"] = "no-store"
    return tokens


@router.post("/refresh", response_model=AuthTokens)
async def refresh_tokens(
    payload: RefreshRequest,
    request: Request,
    response: Response,
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> AuthTokens:
    incoming_hash = hash_refresh_token(payload.refresh_token)

    async with pool.acquire() as connection:
        session = await connection.fetchrow(
            """
            SELECT
                s.id AS session_id,
                s.device_label,
                u.id,
                u.organization_id,
                u.full_name,
                u.username,
                u.email,
                u.phone,
                u.is_active,
                u.is_super_admin,
                o.name AS organization_name,
                o.slug AS organization_slug
            FROM auth_sessions s
            JOIN users u ON u.id = s.user_id
            JOIN organizations o ON o.id = s.organization_id
            WHERE s.refresh_token_hash = $1
              AND s.revoked_at IS NULL
              AND s.expires_at > CURRENT_TIMESTAMP
              AND u.is_active = TRUE
              AND o.is_active = TRUE
            """,
            incoming_hash,
        )

        if session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )

        async with connection.transaction():
            await connection.execute(
                "UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1",
                session["session_id"],
            )
            tokens = await issue_tokens(
                connection,
                request=request,
                user=session,
                device_label=session["device_label"],
            )

    response.headers["Cache-Control"] = "no-store"
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: LogoutRequest,
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> Response:
    await pool.execute(
        """
        UPDATE auth_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE refresh_token_hash = $1
          AND revoked_at IS NULL
        """,
        hash_refresh_token(payload.refresh_token),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserProfile)
async def me(current_user: asyncpg.Record = Depends(get_current_user)) -> UserProfile:
    return user_profile_from_record(current_user)
