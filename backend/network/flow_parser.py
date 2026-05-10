"""Parse mitmproxy binary flow files to JSON."""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def parse_flow_file(flow_file: str) -> list:
    """Parse mitmproxy binary flow file to list of flow dicts.

    mitmproxy flow files are binary format read using mitmproxy FlowReader.
    """
    if not Path(flow_file).exists():
        logger.warning(f"[flow_parser] flow file does not exist: {flow_file}")
        return []

    flows = []
    try:
        from mitmproxy.io import FlowReader

        with open(flow_file, "rb") as f:
            reader = FlowReader(f)
            for flow in reader.stream():
                flows.append(_flow_to_dict(flow))
    except ImportError as e:
        logger.warning(f"[flow_parser] mitmproxy FlowReader not available: {e}")
        flows = _parse_binary_flows_basic(flow_file)
    except Exception as e:
        logger.error(f"[flow_parser] FlowReader failed: {e}, falling back to basic parse")
        flows = _parse_binary_flows_basic(flow_file)

    logger.info(f"[flow_parser] parsed {len(flows)} flows from {flow_file}")
    return flows


def _flow_to_dict(flow) -> dict:
    """Convert mitmproxy Flow object to dict."""
    result = {
        "id": f"flow_{id(flow)}",
        "timestamp": getattr(flow.request, "timestamp_start", 0) or 0,
        "request": {
            "method": getattr(flow.request, "method", "UNKNOWN"),
            "url": str(getattr(flow.request, "url", "")),
            "host": getattr(flow.request, "pretty_host", ""),
            "path": getattr(flow.request, "path", ""),
            "headers": dict(getattr(flow.request, "headers", {})),
        },
        "response": None,
        "duration_ms": 0,
        "websocket": getattr(flow, "type", "") == "websocket",
    }

    resp = getattr(flow, "response", None)
    if resp:
        content = getattr(resp, "content", None)
        body = ""
        if content:
            try:
                body = content.decode("utf-8", errors="replace")
            except Exception:
                body = "<binary data>"
        result["response"] = {
            "status_code": getattr(resp, "status_code", 0),
            "reason": getattr(resp, "reason", ""),
            "headers": dict(getattr(resp, "headers", {})),
            "body": body,
        }
        ts_start = getattr(resp, "timestamp_start", None)
        ts_req = getattr(flow.request, "timestamp_start", None)
        if ts_start and ts_req:
            result["duration_ms"] = int((ts_start - ts_req) * 1000)

    return result


def _parse_binary_flows_basic(flow_file: str) -> list:
    """Fallback basic parser - extract URL strings from binary file."""
    import re

    flows = []
    try:
        with open(flow_file, "rb") as f:
            data = f.read()
    except Exception:
        return []

    url_pattern = rb"https?://[^\x00-\x1f\x7f\s]+"
    for match in re.finditer(url_pattern, data):
        url = match.group(0).decode("utf-8", errors="replace")
        flows.append(
            {
                "id": f"flow_{match.start()}",
                "timestamp": 0,
                "request": {"method": "UNKNOWN", "url": url, "host": "", "path": ""},
                "response": None,
                "duration_ms": 0,
                "websocket": False,
            }
        )
    return flows
