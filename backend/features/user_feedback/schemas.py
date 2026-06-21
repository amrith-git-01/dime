from typing import Literal

from pydantic import BaseModel, Field, field_validator

FeedbackType = Literal["bug", "idea", "enhancement"]


class FeedbackCreateBody(BaseModel):
    type: FeedbackType
    message: str = Field(..., min_length=1, max_length=1000)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        return value.strip()


class FeedbackCreateResponse(BaseModel):
    id: str
