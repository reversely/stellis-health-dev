"""Stateless, bearer-protected Streamable HTTP MCP for local source tools."""

from __future__ import annotations

import hmac
import json
import os

from fastapi import Request
from fastapi.responses import JSONResponse, Response

from stellis import source_search

PROTOCOL_VERSION = "2025-06-18"
TOOL = {
    "name": "search_sources",
    "description": "Search current transcript passages, meeting notes and pages. Results include source links and audio times.",
    "inputSchema": {"type": "object", "properties": {
        "query": {"type": "string", "minLength": 1},
        "notebook_id": {"type": "string"},
        "limit": {"type": "integer", "minimum": 1, "maximum": 100}},
        "required": ["query"], "additionalProperties": False},
    "annotations": {"readOnlyHint": True},
}


def _error(identifier: object, code: int, message: str) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": identifier, "error": {"code": code, "message": message}})


async def handle(request: Request) -> Response:
    """Respond to the small, read-only MCP surface without a sandbox secret file."""
    token = os.environ.get("STELLIS_MCP_TOKEN", "")
    if len(token) < 32:
        return JSONResponse({"detail": "MCP is not configured"}, status_code=503)
    expected_origin = f"{request.url.scheme}://{request.headers.get('host')}"
    if (origin := request.headers.get("origin")) and origin != expected_origin:
        return JSONResponse({"detail": "Origin rejected"}, status_code=403)
    supplied = request.headers.get("authorization", "")
    if not supplied.startswith("Bearer ") or not hmac.compare_digest(supplied[7:], token):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401,
                            headers={"WWW-Authenticate": "Bearer"})
    if request.method != "POST":
        return Response(status_code=405, headers={"Allow": "POST"})
    if "application/json" not in request.headers.get("content-type", ""):
        return JSONResponse({"detail": "Expected JSON"}, status_code=415)
    if request.headers.get("mcp-protocol-version", PROTOCOL_VERSION) not in (PROTOCOL_VERSION, "2025-03-26"):
        return JSONResponse({"detail": "Unsupported MCP protocol version"}, status_code=400)
    try:
        payload = await request.json()
    except (ValueError, UnicodeDecodeError):
        return _error(None, -32700, "Invalid JSON")
    if not isinstance(payload, dict) or payload.get("jsonrpc") != "2.0" or not isinstance(payload.get("method"), str):
        return _error(payload.get("id") if isinstance(payload, dict) else None, -32600, "Invalid request")
    if "id" not in payload:
        return Response(status_code=202)
    identifier = payload["id"]
    method = payload["method"]
    params = payload.get("params") or {}
    if method == "initialize":
        result = {"protocolVersion": PROTOCOL_VERSION, "capabilities": {"tools": {"listChanged": False}},
                  "serverInfo": {"name": "stellis", "version": "0.1.0"}}
    elif method == "ping":
        result = {}
    elif method == "tools/list":
        result = {"tools": [TOOL]}
    elif method == "tools/call":
        if not isinstance(params, dict) or params.get("name") != TOOL["name"]:
            return _error(identifier, -32602, "Unknown tool")
        args = params.get("arguments") or {}
        if not isinstance(args, dict) or set(args) - {"query", "notebook_id", "limit"}:
            return _error(identifier, -32602, "Invalid tool arguments")
        try:
            query = args.get("query")
            if not isinstance(query, str) or ("notebook_id" in args and not isinstance(args["notebook_id"], str)):
                raise ValueError("Invalid search query")
            if not isinstance(args.get("limit", 30), int):
                raise ValueError("Invalid search limit")
            results = source_search.search_sources(query, args.get("notebook_id"), args.get("limit", 30))
        except ValueError as exc:
            return _error(identifier, -32602, str(exc))
        result = {"content": [{"type": "text", "text": json.dumps({"results": results}, ensure_ascii=False)}],
                  "structuredContent": {"results": results}, "isError": False}
    else:
        return _error(identifier, -32601, "Method not found")
    return JSONResponse({"jsonrpc": "2.0", "id": identifier, "result": result})
