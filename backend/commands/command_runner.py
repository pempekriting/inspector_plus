"""Shared subprocess result handling for AppCommands and IOSAppCommands.

Both command classes ran the same try/run/timeout/error-string shape for
every method (install/uninstall/launch/list). This centralizes it so the
error-handling behavior can't silently diverge between platforms.
"""

import subprocess
from collections.abc import Callable


def run_and_report(
    run_fn: Callable[[], subprocess.CompletedProcess],
    action: str,
    success_message: str | Callable[[subprocess.CompletedProcess], str] | None = None,
) -> tuple[bool, str]:
    """Run a subprocess command and translate the result into a (success, message) tuple.

    Args:
        run_fn: Zero-arg callable that performs the subprocess call and returns
            its CompletedProcess (may raise subprocess.TimeoutExpired or any
            other exception).
        action: Human-readable action name used in timeout/failure messages
            (e.g. "Install", "Uninstall").
        success_message: Message to return on success — a literal string, a
            callable receiving the CompletedProcess, or None to default to
            the command's stripped stdout.

    Returns:
        (True, message) on returncode == 0, otherwise (False, message).
    """
    try:
        result = run_fn()
        if result.returncode == 0:
            if callable(success_message):
                return (True, success_message(result))
            if success_message is not None:
                return (True, success_message)
            return (True, result.stdout.strip())
        return (False, result.stderr.strip() or result.stdout.strip())
    except subprocess.TimeoutExpired:
        return (False, f"{action} command timed out")
    except Exception as e:
        return (False, f"{action} failed: {e!s}")
