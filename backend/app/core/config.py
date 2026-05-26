from functools import cached_property
from typing import Literal

from pydantic import AnyUrl, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET_KEY = "change-me-in-development-only-32-bytes-minimum"  # noqa: S105


class Settings(BaseSettings):
    app_name: str = "RealState API"
    app_env: Literal["development", "test", "production"] = "development"
    debug: bool = False

    database_url: AnyUrl = Field(
        default="postgresql://realstate:realstate_password@localhost:5433/realstate"
    )
    db_pool_min_size: int = 1
    db_pool_max_size: int = 10

    secret_key: str = DEV_SECRET_KEY
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    bootstrap_enabled: bool = True
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.app_env == "production" and self.secret_key == DEV_SECRET_KEY:
            raise ValueError("SECRET_KEY must be set to a strong unique value in production")
        if self.app_env == "production" and self.bootstrap_enabled:
            raise ValueError("BOOTSTRAP_ENABLED must be false in production")
        return self

    @cached_property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()
