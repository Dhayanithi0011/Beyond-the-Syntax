from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Beyond The Syntax API"
    environment: str = "development"

    database_url: str = "postgresql+asyncpg://beyond_syntax:beyond_syntax@localhost:5432/beyond_syntax"

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]

    execution_service_url: str = "http://localhost:8100"

    # Defaults used only when a competition row doesn't override them
    default_round1_duration_seconds: int = 20 * 60
    default_round2_team_duration_seconds: int = 30 * 60

    dev_mode: bool = True  # gates /admin/dev/* endpoints — must be False in production

    class Config:
        env_file = ".env"


settings = Settings()
