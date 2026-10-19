"""Capture a connected Gmail-to-agent browser check using an unsent test draft.

Runs against the authenticated owner workspace on GN100. The temporary agent,
Gmail draft, browser session, and account session are removed in ``finally``.
No mail is sent and no new software or models are installed.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
from urllib.request import Request, urlopen

import httpx

from stellis import agent_runtime, agents, auth, calendar, gmail_api

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/evidence/rfi91/connected-mail.png"
BROWSER = "http://127.0.0.1:4446"
APP = "http://127.0.0.1:8765"


def wd(path: str, method: str = "GET", payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    request = Request(BROWSER + path, data=data, method=method,
                      headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)["value"]


def browser_capture(token: str, agent_id: str, marker: str) -> None:
    processes = []
    session = None
    try:
        env = {**os.environ, "DISPLAY": ":99", "XDG_RUNTIME_DIR": "/run/user/1000"}
        processes.append(subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1280x800x24",
                                           "-nolisten", "tcp"], env=env,
                                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        processes.append(subprocess.Popen(["geckodriver", "--port", "4446"], env=env,
                                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        for _ in range(100):
            try:
                wd("/status")
                break
            except OSError:
                time.sleep(0.2)
        else:
            raise RuntimeError("Browser driver did not start")
        capabilities = {"capabilities": {"alwaysMatch": {
            "browserName": "firefox", "moz:firefoxOptions": {"args": []}}}}
        session = wd("/session", "POST", capabilities)["sessionId"]
        path = f"/session/{session}"
        wd(path + "/window/rect", "POST", {"width": 1280, "height": 800, "x": 0, "y": 0})
        wd(path + "/url", "POST", {"url": APP + "/auth"})
        wd(path + "/cookie", "POST", {"cookie": {"name": auth.COOKIE_NAME,
            "value": token, "path": "/", "httpOnly": True, "sameSite": "Lax"}})
        wd(path + "/url", "POST", {"url": APP + "/chat/" + agent_id})
        for _ in range(120):
            body = wd(path + "/execute/sync", "POST", {
                "script": "return document.body.innerText", "args": []})
            if marker in body and "engineering" in body.lower() and "Email:" in body:
                break
            time.sleep(0.25)
        else:
            raise AssertionError("Connected mail answer did not render in Chat")
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        EVIDENCE.write_bytes(base64.b64decode(wd(path + "/screenshot")))
        print("PASS connected Gmail answer and citation rendered in browser", flush=True)
        print("Evidence:", EVIDENCE, flush=True)
    finally:
        if session:
            try:
                wd(f"/session/{session}", "DELETE")
            except OSError:
                pass
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


async def main() -> None:
    if os.environ.get("STELLIS_ACCOUNT_ID") != "1" or not agent_runtime.configured():
        raise RuntimeError("Run with the owner account and managed sandbox configuration")
    marker = str(secrets.randbelow(900000) + 100000)
    draft_id = None
    agent_id = None
    session_token = None
    try:
        email = (await gmail_api.profile())["email"]
        draft_id = (await gmail_api.create_draft([email], f"RFI {marker} Stellis connected test",
            "The valve certificate is received. Engineering sign-off remains before closure. "
            "This is a temporary unsent test draft."))["id"]
        agent_id = agents.create(f"Mail test {marker}", "Temporary evidence checker")["id"]
        reply = await agent_runtime.ask(agent_id,
            f"What does the email for RFI {marker} say remains before closure?")
        citations = reply["cited_sources"]
        assert "engineering" in reply["agent_message"]["content"].lower()
        assert any(str(item["target"]).startswith("https://mail.google.com/") for item in citations)
        print("PASS managed agent cited connected Gmail evidence", flush=True)
        session_token = auth.create_session(1)
        await asyncio.to_thread(browser_capture, session_token, agent_id, marker)
    finally:
        if session_token:
            auth.revoke(session_token)
        if agent_id:
            agents.delete(agent_id)
        if draft_id:
            token = await calendar._access_token("google")
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.delete(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/drafts/{draft_id}",
                    headers={"Authorization": f"Bearer {token}"})
            assert response.status_code in (200, 204), response.status_code
            print("PASS temporary Gmail draft deleted", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
