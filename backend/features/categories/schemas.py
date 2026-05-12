from pydantic import BaseModel


class CategoryResponse(BaseModel):
    id: str
    name: str
    icon_name: str
    color: str
    is_system: bool
    created_at: str
