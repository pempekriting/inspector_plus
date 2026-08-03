from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from validation import validate_command


class TapRequest(BaseModel):
    x: int = Field(..., ge=0, le=10000, description="X coordinate")
    y: int = Field(..., ge=0, le=10000, description="Y coordinate")
    coordinateMode: Literal["absolute", "relative"] = Field(default="absolute", description="absolute or relative")


class TextInputRequest(BaseModel):
    text: str = Field(..., max_length=1000, description="Text to input")


class SwipeRequest(BaseModel):
    startX: int = Field(..., ge=0, le=10000)
    startY: int = Field(..., ge=0, le=10000)
    endX: int = Field(..., ge=0, le=10000)
    endY: int = Field(..., ge=0, le=10000)
    duration: int = Field(default=300, ge=0, le=5000, description="Duration in ms")
    coordinateMode: Literal["absolute", "relative"] = Field(default="absolute", description="absolute or relative")


class DragRequest(BaseModel):
    startX: int = Field(..., ge=0, le=10000)
    startY: int = Field(..., ge=0, le=10000)
    endX: int = Field(..., ge=0, le=10000)
    endY: int = Field(..., ge=0, le=10000)
    duration: int = Field(default=500, ge=0, le=5000)
    coordinateMode: Literal["absolute", "relative"] = Field(default="absolute", description="absolute or relative")


class PinchRequest(BaseModel):
    x: int = Field(..., ge=0, le=10000, description="Center X of pinch area")
    y: int = Field(..., ge=0, le=10000, description="Center Y of pinch area")
    scale: float = Field(..., gt=0, description="Pinch scale: <1 for pinch in, >1 for pinch out")


class PressKeyRequest(BaseModel):
    key: Literal["home", "back", "recent"] = Field(..., description="Key name")


class GestureAction(BaseModel):
    type: Literal["move", "pointerDown", "pointerUp", "pause"] = Field(..., description="Action type")
    x: int | None = Field(None, ge=0, le=10000, description="X coordinate (required for move)")
    y: int | None = Field(None, ge=0, le=10000, description="Y coordinate (required for move)")
    duration: int | None = Field(None, ge=0, le=10000, description="Duration in ms (for move or pause)")
    pointer: int | None = Field(None, ge=0, le=4, description="Pointer index 0-4 (default 0)")
    button: Literal["left", "right"] | None = Field(None, description="Button: left, right (for pointerDown/Up)")


class GestureExecuteRequest(BaseModel):
    actions: list[GestureAction] = Field(..., min_length=1, description="List of gesture actions")
    coordinateMode: Literal["absolute", "relative"] = Field(default="absolute", description="absolute or relative")
    udid: str | None = None


class CommandRequest(BaseModel):
    type: str = Field(..., min_length=1, max_length=50, description="Command type")
    params: dict[str, Any] | None = None


class CommandResponse(BaseModel):
    success: bool
    output: str
    error: str | None = None


class AdbCommandRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=500)

    @field_validator("command")
    @classmethod
    def validate_command_field(cls, v: str) -> str:
        ok, reason = validate_command(v)
        if not ok:
            raise ValueError(reason)
        return v


class SwitchContextRequest(BaseModel):
    contextId: str

    @field_validator("contextId")
    @classmethod
    def validate_context_id(cls, v: str) -> str:
        if not v or len(v) > 255:
            raise ValueError("contextId must be 1-255 characters")
        for ch in ["&", "|", ";", "`", "$", "(", ")", "<", ">"]:
            if ch in v:
                raise ValueError(f"contextId contains forbidden character: {ch}")
        return v


class RecordStepRequest(BaseModel):
    sessionId: str
    action: str
    nodeId: str
    locator: dict
    value: str | None = None


class ExportRequest(BaseModel):
    sessionId: str
    lang: Literal["python", "java", "kotlin", "javascript", "typescript", "ruby"] = Field(default="python")
    platform: Literal["android", "ios"] = Field(default="android")


class ExecuteScriptRequest(BaseModel):
    script: str = Field(..., min_length=1, max_length=2000, description="Shell script or command to execute")
    platform: Literal["android", "ios"] | None = Field(None, description="Override platform")


class SelectDeviceRequest(BaseModel):
    udid: str | None = None
