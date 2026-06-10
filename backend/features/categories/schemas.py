from pydantic import BaseModel, Field


class CategoryResponse(BaseModel):
    id: str
    name: str
    icon_name: str
    color: str
    is_system: bool
    created_at: str
    user_id: str | None = None


class CreateCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    icon_name: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=16)


class UpdateCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    icon_name: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=16)


class CategoryDeleteImpactResponse(BaseModel):
    transaction_count: int = Field(ge=0)
