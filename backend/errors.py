from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base class for operational errors."""

    def __init__(self, message: str, code: str, status_code: int):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


class DeviceNotFoundError(AppError):
    def __init__(self, detail: str = "No device connected"):
        super().__init__(detail, "DEVICE_NOT_FOUND", 404)


class HierarchyNotFoundError(AppError):
    def __init__(self, detail: str = "No hierarchy found. Is a device connected?"):
        super().__init__(detail, "HIERARCHY_NOT_FOUND", 404)


class CommandExecutionError(AppError):
    def __init__(self, detail: str):
        super().__init__(detail, "COMMAND_EXECUTION_FAILED", 500)


class ScreenshotError(AppError):
    def __init__(self, detail: str = "Failed to capture screenshot"):
        super().__init__(detail, "SCREENSHOT_FAILED", 500)


class UnsupportedOnPlatformError(AppError):
    def __init__(self, action: str, platform: str):
        super().__init__(f"{action} is not supported on {platform}", "UNSUPPORTED_ACTION", 400)


class NetworkError(AppError):
    def __init__(self, detail: str = "Network operation failed"):
        super().__init__(detail, "NETWORK_ERROR", 500)


async def app_error_handler(request: Request, exc: AppError):
    """Handle typed AppError exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.code, "detail": exc.message},
        headers={"X-Request-ID": getattr(request.state, "request_id", "")},
    )
