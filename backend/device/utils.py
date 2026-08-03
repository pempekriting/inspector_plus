import itertools
import subprocess
import threading
import time

_node_counter = itertools.count(start=1)
_node_lock = threading.Lock()


def generate_id(prefix: str) -> str:
    """Generate a monotonically increasing, thread-safe node id like 'Button_1'."""
    with _node_lock:
        n = next(_node_counter)
    return f"{prefix}_{n}"


def safe_str(value) -> str:
    """Coerce a value to string, handling MagicMock and other non-string types."""
    if isinstance(value, str):
        return value
    return ""


def find_node_by_id(tree: dict, node_id: str) -> dict | None:
    """Recursively find a node in a hierarchy tree by its id.

    Args:
        tree: The root node or any subtree.
        node_id: The id to search for.
    Returns:
        The matching node dict, or None if not found.
    """
    if not isinstance(tree, dict):
        return None
    if tree.get("id") == node_id:
        return tree
    for child in tree.get("children", []):
        found = find_node_by_id(child, node_id)
        if found:
            return found
    return None


def retry_with_backoff(fn, *args, retries: int = 3, base_delay: float = 1.0, **kwargs):
    """Execute fn with exponential backoff retry for transient failures.

    Retries on: subprocess.TimeoutExpired, OSError (device busy/connection reset).
    Does not retry on: FileNotFoundError (adb/idb not installed), non-transient errors.
    """
    last_err = None
    for attempt in range(retries):
        try:
            return fn(*args, **kwargs)
        except FileNotFoundError:
            raise
        except subprocess.TimeoutExpired as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(base_delay * (2**attempt))
            else:
                raise
        except OSError as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(base_delay * (2**attempt))
            else:
                raise
    raise last_err
