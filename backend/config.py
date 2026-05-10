import os
import shutil

from slowapi import Limiter
from slowapi.util import get_remote_address


class Settings:
    """Centralized application settings read from environment variables."""

    APP_VERSION: str = os.environ.get("APP_VERSION", "0.0.1")
    ANDROID_HOME: str = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT", "")
    ANDROID_SERIAL: str | None = os.environ.get("ANDROID_SERIAL")
    CORS_ORIGINS: str = os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,app://localhost,tauri://localhost"
    )
    API_KEY: str | None = os.environ.get("API_KEY")
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")

    @staticmethod
    def get_adb_path() -> str:
        """Resolve the adb binary path from ANDROID_HOME or PATH."""
        android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
        if android_home:
            adb_path = os.path.join(android_home, "platform-tools", "adb")
            if os.path.isfile(adb_path):
                return adb_path
        return shutil.which("adb") or "adb"


settings = Settings()

# Shared rate limiter instance used by all routers
shared_limiter = Limiter(key_func=get_remote_address, default_limits=["30 per second"])
