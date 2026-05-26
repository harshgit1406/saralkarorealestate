import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db import close_db_pool, create_db_pool


async def main() -> None:
    pool = await create_db_pool()
    try:
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = ANY($1::text[])
                ORDER BY table_name
                """,
                ["auth_sessions", "organizations", "users"],
            )
            table_names = [row["table_name"] for row in rows]
            print(f"Connected. Auth tables found: {', '.join(table_names)}")
    finally:
        await close_db_pool(pool)


if __name__ == "__main__":
    asyncio.run(main())
