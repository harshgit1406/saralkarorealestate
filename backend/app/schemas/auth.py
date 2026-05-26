from pydantic import BaseModel, EmailStr, Field, field_validator


class UserProfile(BaseModel):
    id: int
    organization_id: int
    organization_name: str
    organization_slug: str
    full_name: str
    username: str
    email: EmailStr
    phone: str | None = None
    is_super_admin: bool


class BootstrapRequest(BaseModel):
    organization_name: str = Field(min_length=2, max_length=150)
    organization_slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    full_name: str = Field(min_length=2, max_length=100)
    username: str = Field(min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        has_upper = any(char.isupper() for char in value)
        has_lower = any(char.islower() for char in value)
        has_digit = any(char.isdigit() for char in value)
        has_symbol = any(not char.isalnum() for char in value)
        if not all([has_upper, has_lower, has_digit, has_symbol]):
            raise ValueError(
                "Password must include uppercase, lowercase, number, and symbol characters"
            )
        return value


class LoginRequest(BaseModel):
    organization_slug: str = Field(min_length=2, max_length=100)
    username_or_email: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=1, max_length=128)
    device_label: str | None = Field(default=None, max_length=150)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=256)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=256)


class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int
    user: UserProfile
