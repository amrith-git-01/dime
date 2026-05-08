from pydantic import BaseModel


class CategoryResponse(BaseModel):
    id: str
    name: str
    emoji: str
    color: str
    is_system: bool
    created_at: str
