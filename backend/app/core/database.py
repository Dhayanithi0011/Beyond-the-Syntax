from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.core.config import settings

# statement_cache_size=0: required when the connection goes through Supabase's
# transaction-mode pooler, whose sessions don't support asyncpg prepared
# statements. Harmless for direct connections too.
engine = create_async_engine(
    settings.database_url,
    echo=settings.environment == "development",
    connect_args={"statement_cache_size": 0},
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    async with SessionLocal() as session:
        yield session
