from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.core.config import settings

# statement_cache_size=0: required when the connection goes through Supabase's
# transaction-mode pooler, whose sessions don't support asyncpg prepared
# statements. Harmless for direct connections too.
# pool_size/max_overflow kept well under Supabase's session-mode limit (15
# clients) so a busy app can never exhaust it; pool_recycle dodges the pooler's
# idle-connection timeout.
engine = create_async_engine(
    settings.database_url,
    echo=settings.environment == "development",
    connect_args={"statement_cache_size": 0},
    pool_size=3,
    max_overflow=2,
    pool_pre_ping=True,
    pool_recycle=1500,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    async with SessionLocal() as session:
        yield session
