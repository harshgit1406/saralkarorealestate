import asyncpg
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


async def get_db_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> asyncpg.Record:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
        organization_id = int(payload["org"])
        session_id = str(payload["sid"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

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
                u.is_active,
                u.is_super_admin,
                u.last_login_at,
                u.created_at,
                o.name AS organization_name,
                o.slug AS organization_slug
            FROM users u
            JOIN organizations o ON o.id = u.organization_id
            JOIN auth_sessions s ON s.user_id = u.id
            WHERE u.id = $1
              AND u.organization_id = $2
              AND s.id = $3
              AND s.revoked_at IS NULL
              AND s.expires_at > CURRENT_TIMESTAMP
            """,
            user_id,
            organization_id,
            session_id,
        )

    if user is None or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return user
