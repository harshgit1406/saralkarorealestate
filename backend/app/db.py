import asyncpg

from app.core.config import settings


async def create_db_pool() -> asyncpg.Pool:
    return await asyncpg.create_pool(
        dsn=str(settings.database_url),
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        command_timeout=30,
    )


async def close_db_pool(pool: asyncpg.Pool | None) -> None:
    if pool is not None:
        await pool.close()
