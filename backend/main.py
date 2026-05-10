import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import settings, shared_limiter
from dependencies import shutdown_all_bridges
from errors import AppError, app_error_handler
from network.routes import router as network_router
from routers.commands import router as commands_router
from routers.device import router as device_router
from routers.health import router as health_router
from routers.hierarchy import router as hierarchy_router
from routers.recorder import router as recorder_router

# --- Logging setup ---
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# --- Lifespan: graceful shutdown ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: startup and shutdown."""
    logger.info("InspectorPlus backend starting up")
    yield
    logger.info("InspectorPlus backend shutting down")
    # Shutdown mitmproxy
    try:
        from network.mitm_manager import MitmproxyManager

        MitmproxyManager.get_instance().stop()
    except Exception as e:
        logger.warning("Failed to stop mitmproxy during shutdown: %s", e)
    # Shutdown all bridges
    shutdown_all_bridges()
    logger.info("All bridges shut down cleanly")


app = FastAPI(title="Inspector Plus API", version=settings.APP_VERSION, lifespan=lifespan)


# --- Request ID middleware ---
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add request ID for tracing."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    start_time = time.time()

    logger.info(
        "Request started",
        extra={"request_id": request_id, "method": request.method, "path": request.url.path},
    )

    response = await call_next(request)

    duration_ms = (time.time() - start_time) * 1000
    logger.info(
        "Request completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2),
        },
    )

    response.headers["X-Request-ID"] = request_id
    return response


# --- API key auth middleware (optional, disabled when API_KEY is not set) ---
@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    """Optional API key authentication. Disabled when API_KEY env var is unset."""
    if settings.API_KEY is None:
        return await call_next(request)
    # Exempt health/readiness endpoints
    if request.url.path in ("/health", "/ready"):
        return await call_next(request)
    api_key = request.headers.get("X-API-Key")
    if api_key != settings.API_KEY:
        return JSONResponse(status_code=401, content={"error": "unauthorized", "detail": "Invalid or missing API key"})
    return await call_next(request)


# --- Error handlers ---
app.add_exception_handler(AppError, app_error_handler)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic RequestValidationError with 422 status."""
    return JSONResponse(
        status_code=422,
        content={"error": "validation_error", "detail": str(exc.errors())},
        headers={"X-Request-ID": getattr(request.state, "request_id", "")},
    )


# --- CORS ---
_cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
_is_localhost = any("localhost" in o or "127.0.0.1" in o for o in _cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"] if not _is_localhost else ["*"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"] if not _is_localhost else ["*"],
)


# --- Rate Limiter ---
app.state.limiter = shared_limiter
limiter = shared_limiter  # backward compat for test fixtures
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# --- Include routers ---
app.include_router(health_router, tags=["health"])
app.include_router(hierarchy_router, tags=["hierarchy"])
app.include_router(device_router, tags=["device"])
app.include_router(recorder_router, tags=["recorder"])
app.include_router(commands_router, tags=["commands"])
app.include_router(network_router, prefix="/network", tags=["network"])


# --- Backward-compatible re-exports for tests ---
# These symbols moved to dedicated modules but tests still import from main.
from dependencies import (  # noqa: E402, F401
    _android_bridge,
    _android_bridges,
    _get_first_android_device,
    _ios_bridges,
    _is_ios_udid,
    get_bridge,
)
from errors import (  # noqa: E402, F401
    CommandExecutionError,
    DeviceNotFoundError,
    HierarchyNotFoundError,
    NetworkError,
    ScreenshotError,
    UnsupportedOnPlatformError,
)
from validation import validate_command as _validate_adb_command  # noqa: E402, F401
