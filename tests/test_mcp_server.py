"""MCP tool discovery, bearer boundary, and source result contract."""

import json
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from stellis import pages
from stellis.server import app


class MCPServerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"STELLIS_DATA_DIR": self.temp.name,
            "STELLIS_AUTH_MODE": "required", "STELLIS_DEV_ACCOUNT": "0", "STELLIS_MCP_TOKEN": "t" * 40})
        self.env.start()
        self.client = TestClient(app)
        self.headers = {"Authorization": "Bearer " + "t" * 40, "Accept": "application/json, text/event-stream",
                        "MCP-Protocol-Version": "2025-06-18"}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def call(self, method, params=None):
        return self.client.post("/mcp", headers=self.headers,
            json={"jsonrpc":"2.0", "id":1, "method":method, "params":params or {}})

    def test_auth_initialize_and_search(self):
        self.assertEqual(self.client.post("/mcp", json={"jsonrpc":"2.0","id":1,"method":"ping"}).status_code, 401)
        self.assertEqual(self.call("initialize").json()["result"]["protocolVersion"], "2025-06-18")
        tools = self.call("tools/list").json()["result"]["tools"]
        self.assertEqual([tool["name"] for tool in tools], ["search_sources"])
        page = pages.create("RFI 91 specification", None, "Valve material is stainless steel")
        result = self.call("tools/call", {"name":"search_sources", "arguments":{"query":"stainless"}}).json()["result"]
        self.assertEqual(result["structuredContent"]["results"][0]["source_id"], page["id"])
        self.assertEqual(result["structuredContent"]["results"][0]["target"], f"/page/{page['id']}")
        self.assertEqual(json.loads(result["content"][0]["text"]), result["structuredContent"])

    def test_rejects_bad_origin_and_invalid_tool(self):
        self.assertEqual(self.client.post("/mcp", headers={**self.headers, "Origin":"https://evil.example"},
            json={"jsonrpc":"2.0","id":1,"method":"ping"}).status_code, 403)
        self.assertEqual(self.call("tools/call", {"name":"missing"}).json()["error"]["code"], -32602)
        self.assertEqual(self.client.get("/mcp", headers=self.headers).status_code, 405)


if __name__ == "__main__":
    unittest.main()
