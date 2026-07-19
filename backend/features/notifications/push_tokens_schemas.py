from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PushTokenBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=8)
    platform: Literal["android"] = "android"


class PushTokenDeleteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str | None = None


class PushTokenResponse(BaseModel):
    token: str

