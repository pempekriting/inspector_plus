import contextlib
import logging
import os
import socket
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_TMP_BASE = os.environ.get("TMP_BASE_DIR", tempfile.gettempdir())
_CAPTURE_DIR = os.path.join(_TMP_BASE, "inspectorplus", "network_capture")
os.makedirs(_CAPTURE_DIR, exist_ok=True)


class MitmproxyManager:
    """Singleton manager for mitmdump process lifecycle."""

    _instance: Optional["MitmproxyManager"] = None
    _lock = threading.Lock()

    def __init__(self):
        self._process: subprocess.Popen | None = None
        self._port: int = 8080
        self._flow_file: str = ""
        self._pid_file: str = os.path.join(_CAPTURE_DIR, "mitmdump.pid")
        self._running = False
        self._flows_cache: list = []

    @classmethod
    def get_instance(cls) -> "MitmproxyManager":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance. Used for test isolation."""
        with cls._lock:
            if cls._instance is not None:
                if cls._instance._running and cls._instance._process:
                    cls._instance._process.terminate()
                    with contextlib.suppress(Exception):
                        cls._instance._process.wait(timeout=1)
                cls._instance = None

    def start(self, port: int = 8080) -> dict:
        """Start mitmdump in background, capturing to flow file."""
        if self._running and self._process and self._process.poll() is None:
            return {"success": True, "running": True, "port": self._port}

        self._port = port
        timestamp = int(time.time())
        self._flow_file = os.path.join(_CAPTURE_DIR, f"flows_{timestamp}.mitm")

        mitmdump_path = self._find_mitmdump()
        if not mitmdump_path:
            return {
                "success": False,
                "error": "mitmdump not found. Install mitmproxy: pip install mitmproxy",
            }

        # Try the requested port first, then auto-find next available
        for attempt_port in [port, port + 1, port + 2, port + 3, port + 4]:
            cmd = [
                mitmdump_path,
                "-p",
                str(attempt_port),
                "-w",
                self._flow_file,
            ]
            try:
                self._process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                # Give it a moment to start or fail
                import time as _time

                _time.sleep(0.5)
                if self._process.poll() is not None:
                    # Process died, port likely in use, try next
                    self._process = None
                    continue
                self._port = attempt_port
                self._running = True
                with open(self._pid_file, "w") as f:
                    f.write(str(self._process.pid))

                # Verify mitmdump is actually listening before declaring success
                try:
                    with socket.create_connection(("127.0.0.1", attempt_port), timeout=2):
                        pass
                except Exception:
                    # Not listening — process may have forked and died
                    self._process.terminate()
                    with contextlib.suppress(Exception):
                        self._process.wait(timeout=1)
                    self._process = None
                    self._running = False
                    logger.warning(f"[MitmproxyManager] mitmdump not listening on port {attempt_port}, trying next")
                    continue

                logger.info(f"[MitmproxyManager] started mitmdump on port {attempt_port}, PID={self._process.pid}")
                return {
                    "success": True,
                    "running": True,
                    "port": attempt_port,
                    "pid": self._process.pid,
                }
            except Exception as e:
                logger.warning(f"[MitmproxyManager] port {attempt_port} failed: {e}")
                self._process = None
                continue

        logger.error("[MitmproxyManager] no available port found for mitmdump")
        return {"success": False, "error": f"No available port found near {port}"}

    def stop(self) -> dict:
        """Stop mitmdump process and kill anything listening on its port."""

        # Kill by port to handle forked processes
        for attempt_port in range(self._port, self._port - 5, -1):
            try:
                result = subprocess.run(
                    ["lsof", "-ti", f":{attempt_port}"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if result.stdout.strip():
                    pids = result.stdout.strip().split("\n")
                    for pid in pids:
                        try:
                            subprocess.run(["kill", "-9", pid], timeout=5)
                            logger.info(f"[MitmproxyManager] killed PID {pid} on port {attempt_port}")
                        except Exception:
                            pass
            except Exception:
                pass

        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=3)
            except Exception:
                pass
            self._process = None

        self._running = False
        self._flow_file = ""
        if os.path.exists(self._pid_file):
            os.remove(self._pid_file)

        logger.info("[MitmproxyManager] stopped")
        return {"success": True, "running": False}

    def is_running(self) -> bool:
        """Check if mitmdump is running."""
        if not self._running or self._process is None:
            return False
        return self._process.poll() is None

    def get_status(self) -> dict:
        """Return current status."""
        return {
            "running": self.is_running(),
            "port": self._port,
            "flow_file": self._flow_file if self._running else None,
            "flows_count": len(self._flows_cache),
        }

    def get_flows(self, since: float = 0) -> list:
        """Get captured flows from flow file."""
        if not self._flow_file or not Path(self._flow_file).exists():
            logger.warning(f"[MitmproxyManager] get_flows: no flow file at {self._flow_file}")
            return []

        try:
            from network.flow_parser import parse_flow_file

            flows = parse_flow_file(self._flow_file)
            filtered = [f for f in flows if f.get("timestamp", 0) > since]
            logger.info(
                f"[MitmproxyManager] get_flows: parsed {len(flows)} flows, {len(filtered)} after since filter, file={self._flow_file}"
            )
            self._flows_cache = filtered
            return filtered
        except Exception as e:
            logger.error(f"[MitmproxyManager] get_flows failed: {e}")
            return self._flows_cache

    def get_latest_flow_file(self) -> str:
        """Get path to latest flow file."""
        return self._flow_file

    def _find_mitmdump(self) -> str | None:
        """Find mitmdump in PATH."""
        import shutil as sh

        mitmdump = sh.which("mitmdump")
        if mitmdump:
            return mitmdump
        try:
            subprocess.run(["mitmdump", "--version"], capture_output=True, timeout=5)
            return "mitmdump"
        except Exception:
            pass
        return None
