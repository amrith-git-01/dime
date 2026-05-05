from pydantic import BaseModel, Field


class MeResponse(BaseModel):
    id: str
    email: str | None = None
    username: str | None = None
    avatar_url: str | None = None
    currency: str | None = None


class ProfileUpdateBody(BaseModel):
    username: str = Field(..., min_length=3, max_length=20)
    currency: str = Field(default="INR", min_length=1, max_length=10)
    avatar_url: str | None = None
