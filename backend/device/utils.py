import subprocess
import time


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
                time.sleep(base_delay * (2 ** attempt))
            else:
                raise
        except OSError as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(base_delay * (2 ** attempt))
            else:
                raise
    raise last_err