"""Run the fictional RFI 91 API/browser smoke pass and capture review evidence.

Uses temporary Stellis data and browser profile on GN100. Agent turns use the
configured managed sandbox; no Gmail or Calendar write endpoint is called.
Requires the existing Firefox, geckodriver, Xvfb, ffmpeg, and venv.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8767/api/v1"
WD = "http://127.0.0.1:4445"
KEY = "element-6066-11e4-a52e-4f735466cecf"


def request(url: str, method: str = "GET", payload: dict | None = None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = Request(url, data=body, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=180) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        raise AssertionError(f"{method} {url}: {exc.code} {exc.read().decode()[:500]}") from exc


def wait_ready(url: str) -> None:
    for _ in range(150):
        try:
            request(url)
            return
        except (URLError, OSError):
            time.sleep(0.2)
    raise RuntimeError(f"Service did not start: {url}")


def webdriver(session: str, path: str, method: str = "GET", payload: dict | None = None):
    return request(f"{WD}/session/{session}{path}", method, payload)["value"]


def capture(session: str, name: str, folder: Path) -> None:
    data = webdriver(session, "/screenshot")
    (folder / f"{name}.png").write_bytes(base64.b64decode(data))


def browse(session: str, url: str, needle: str, screenshot: str, folder: Path) -> None:
    webdriver(session, "/url", "POST", {"url": url})
    for _ in range(80):
        text = webdriver(session, "/execute/sync", "POST", {
            "script": "return document.body.innerText", "args": []})
        if needle in text:
            break
        time.sleep(0.25)
    else:
        raise AssertionError(f"Browser page {url} did not show {needle!r}")
    time.sleep(1.2)
    capture(session, screenshot, folder)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-dir", type=Path, default=ROOT / "docs/evidence/rfi91")
    args = parser.parse_args()
    evidence = args.evidence_dir.resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    temp = tempfile.mkdtemp(prefix="stellis-rfi91-walkthrough-")
    processes: list[subprocess.Popen] = []
    session = None
    app_log = open(Path(temp) / "app.log", "w")
    try:
        env = os.environ.copy()
        env.update(STELLIS_DATA_DIR=temp, STELLIS_AUTH_MODE="off", PYTHONPATH=str(ROOT / "src"),
                   STELLIS_NEMOCLAW_SANDBOX="stellis-claw", DISPLAY=":98",
                   XDG_RUNTIME_DIR="/run/user/1000",
                   STELLIS_VOICE_WHISPER_MODEL="/home/springbuilt/stellis-models/voice/whisper-base-en",
                   STELLIS_VOICE_KOKORO_MODEL="/home/springbuilt/stellis-models/voice/kokoro/kokoro-v1.0.onnx",
                   STELLIS_VOICE_KOKORO_VOICES="/home/springbuilt/stellis-models/voice/kokoro/voices-v1.0.bin")
        xvfb = subprocess.Popen(["Xvfb", ":98", "-screen", "0", "1280x800x24", "-nolisten", "tcp"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        processes.append(xvfb)
        app = subprocess.Popen([os.environ.get("STELLIS_PYTHON", "python3"), "-m", "uvicorn",
                                "stellis.server:app", "--host", "127.0.0.1", "--port", "8767"],
                               cwd=ROOT, env=env, stdout=app_log, stderr=subprocess.STDOUT)
        processes.append(app)
        driver = subprocess.Popen(["geckodriver", "--port", "4445"], env=env,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        processes.append(driver)
        wait_ready(API + "/agents")
        wait_ready("http://127.0.0.1:4445/status")
        result = request(API + "/samples/rfi91", "POST", {})
        again = request(API + "/samples/rfi91", "POST", {})
        assert result["installed"] and result["conversation_id"] == again["conversation_id"]
        assert len(result["projects"]) == 4
        conversation_id = result["conversation_id"]
        water = next(x for x in result["projects"] if x["key"] == "water-treatment")
        books = request(API + "/notebooks")["notebooks"]
        assert len({x["id"] for x in books}) >= 4
        pages = request(API + "/pages?notebook_id=" + water["notebook_id"])
        assert len(pages) >= 2
        transcript = request(API + "/conversations/" + conversation_id + "/transcript")
        segments = transcript["segments"]
        assert len(segments) >= 5
        assert any("October" in segment["text"] or "22" in segment["text"] for segment in segments)
        notes = request(API + "/conversations/" + conversation_id + "/notes")
        assert "C316" in notes["markdown"]
        search = request(API + "/search?q=RFI%2091")
        assert search
        audio_request = Request(API + "/conversations/" + conversation_id + "/audio",
                                headers={"Range": "bytes=0-1023"})
        with urlopen(audio_request, timeout=30) as response:
            assert response.status in (200, 206) and response.read(1024)
        selected = segments[0]
        selection = {"segment_id": selected["id"], "start_offset": 0,
                     "end_offset": min(3, len(selected["text"])),
                     "expected_revision": transcript["revision"]}
        highlight = request(API + "/conversations/" + conversation_id + "/highlights", "POST", selection)
        comment = request(API + "/conversations/" + conversation_id + "/comments", "POST",
                          {**selection, "body": "Sample walkthrough comment"})
        request(API + "/conversations/" + conversation_id + "/comments/" + comment["id"], "PATCH",
                {"body": "Reviewed sample comment"})
        request(API + "/conversations/" + conversation_id + "/highlights/" + highlight["id"], "DELETE")
        request(API + "/conversations/" + conversation_id + "/comments/" + comment["id"], "DELETE")
        throwaway = request(API + "/pages", "POST", {"title": "Walkthrough throwaway", "markdown": "Sample"})
        request(API + "/pages/" + throwaway["id"] + "/trash", "POST", {})
        assert any(item["id"] == throwaway["id"] for item in request(API + "/trash"))
        request(API + "/trash/" + throwaway["id"] + "/restore", "POST", {})
        assert request(API + "/pages/" + throwaway["id"])["title"] == "Walkthrough throwaway"
        person_link = request(API + "/conversations/" + conversation_id + "/person-links", "PUT", {
            "segment_id": selected["id"], "scope": "segment",
            "name": "Alex Example (sample)", "expected_revision": transcript["revision"]})
        person_id = person_link["person_id"]
        profile = request(API + "/persons/" + person_id)
        assert profile["total_link_count"] >= 1 and profile["conversations"][0]["conversation_id"] == conversation_id
        request(API + "/persons/" + person_id, "PATCH", {"name": "Alex Contractor (sample)"})
        renamed = request(API + "/conversations/" + conversation_id + "/transcript")
        assert renamed["segments"][0]["speaker_display_name"] == "Alex Contractor (sample)"
        assert any(item["id"] == person_id and item["name"] == "Alex Contractor (sample)"
                   for item in request(API + "/persons"))
        print("PASS: seed, notebooks, pages, transcript, notes, search, audio, annotations, speaker, trash and restore", flush=True)
        answer = request(API + "/agents/" + water["agent_id"] + "/ask", "POST",
                         {"question": "What keeps RFI 91 open?", "notebook_id": water["notebook_id"]})
        content = answer["agent_message"]["content"].lower()
        assert "schedule" in content and "certificate" in content and ("open" in content or "pending" in content), content
        assert "22" not in content or "target" in content or "response" in content, content
        assert answer["cited_sources"], "Managed answer did not cite project evidence"
        print("PASS: managed agent answered from project sources", flush=True)
        specialist = next(project for project in result["projects"] if project["key"] != "water-treatment")
        job = request(API + "/agents/" + water["agent_id"] + "/delegations", "POST", {
            "specialist_id": specialist["agent_id"], "notebook_id": water["notebook_id"],
            "question": "What evidence remains for RFI 91 and how should we respond?",
            "recipient": "manager@example.com", "subject": "Re: RFI 91 isolation valve",
            "fixture": True})
        for _ in range(150):
            jobs = request(API + "/agents/" + water["agent_id"] + "/delegations")
            current = next(item for item in jobs if item["id"] == job["id"])
            if current["state"] in ("succeeded", "failed", "interrupted"):
                break
            time.sleep(1)
        else:
            raise AssertionError("Delegated sample job did not finish")
        assert current["state"] == "succeeded", current
        draft = current["draft_body"].lower()
        assert "engineering" in draft and ("review" in draft or "sign-off" in draft), draft
        assert "schedule" in draft and "certificate" in draft, draft
        assert current["gmail_draft_id"].startswith("sample-draft-"), current
        assert current["sources"] and current["research"], current
        print("PASS: delegated specialist research and sample draft", flush=True)

        caps = {"capabilities": {"alwaysMatch": {
            "browserName": "firefox", "moz:firefoxOptions": {"args": [],
                "prefs": {"media.navigator.streams.fake": True, "media.navigator.permission.disabled": True}}}}}
        session = request(WD + "/session", "POST", caps)["value"]["sessionId"]
        webdriver(session, "/window/rect", "POST", {"width": 1280, "height": 800, "x": 0, "y": 0})
        video = evidence / "rfi91-walkthrough.mp4"
        movie = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                                  "-f", "x11grab", "-video_size", "1280x800", "-framerate", "8",
                                  "-i", ":98", "-c:v", "libx264", "-preset", "ultrafast",
                                  "-crf", "32", "-pix_fmt", "yuv420p", str(video)],
                                 env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        processes.append(movie)
        browse(session, "http://127.0.0.1:8767/", "RFI 91", "home", evidence)
        browse(session, "http://127.0.0.1:8767/notebook/" + water["notebook_id"],
               "Water Treatment", "notebook", evidence)
        browse(session, "http://127.0.0.1:8767/conversation/" + conversation_id,
               "RFI 91", "conversation", evidence)
        webdriver(session, "/execute/sync", "POST", {"script": "[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Transcript')?.click();", "args": []})
        time.sleep(1)
        rendered = webdriver(session, "/execute/sync", "POST", {"script": "return document.querySelectorAll('.segment').length", "args": []})
        assert rendered >= 5, "Saved fixture transcript did not render"
        webdriver(session, "/execute/sync", "POST", {"script": "document.querySelector('.segment').scrollIntoView();", "args": []})
        time.sleep(0.5)
        capture(session, "transcript", evidence)
        browse(session, "http://127.0.0.1:8767/chat/" + water["agent_id"],
               "Mira", "agent", evidence)
        webdriver(session, "/execute/sync", "POST", {"script": "document.querySelector('.agent-thread')?.scrollIntoView();", "args": []})
        time.sleep(1)
        capture(session, "agent-thread", evidence)
        webdriver(session, "/execute/sync", "POST", {
            "script": "document.querySelector('.agent-delegation')?.scrollIntoView();", "args": []})
        time.sleep(0.8)
        delegation_view = webdriver(session, "/execute/sync", "POST", {
            "script": "return document.querySelector('.agent-delegation')?.innerText || ''", "args": []})
        assert "Research notes" in delegation_view and "Draft" in delegation_view, delegation_view
        capture(session, "delegation", evidence)
        availability = request(API + "/agents/voice/availability")
        assert availability["ready"], availability
        call = webdriver(session, "/element", "POST", {
            "using": "xpath", "value": "//button[normalize-space(.)='Call']"})
        webdriver(session, "/element/" + call[KEY] + "/click", "POST", {})
        for _ in range(100):
            state = webdriver(session, "/execute/sync", "POST", {
                "script": "return document.body.innerText", "args": []})
            if "Call connected" in state and "End call" in state:
                break
            time.sleep(0.25)
        else:
            raise AssertionError("Voice call did not connect: " + state[-600:])
        capture(session, "call-connected", evidence)
        time.sleep(2)
        end = webdriver(session, "/element", "POST", {
            "using": "xpath", "value": "//button[normalize-space(.)='End call']"})
        webdriver(session, "/element/" + end[KEY] + "/click", "POST", {})
        for _ in range(120):
            state = webdriver(session, "/execute/sync", "POST", {
                "script": "return document.body.innerText", "args": []})
            if "Call saved in Conversations." in state:
                break
            time.sleep(0.25)
        else:
            raise AssertionError("Voice call did not save: " + state[-600:])
        capture(session, "call-saved", evidence)
        messages = request(API + "/agents/" + water["agent_id"] + "/messages")
        assert any(item["role"] == "system" and "Call recording saved:" in item["content"]
                   for item in messages), "Saved call was not linked to the agent thread"
        print("PASS: browser WebRTC call, recording, and agent thread link", flush=True)
        webdriver(session, "/window/rect", "POST", {"width": 390, "height": 760, "x": 0, "y": 0})
        browse(session, "http://127.0.0.1:8767/conversation/" + conversation_id,
               "RFI 91", "mobile-conversation", evidence)
        dimensions = webdriver(session, "/execute/sync", "POST", {
            "script": "return {width:document.documentElement.scrollWidth, viewport:window.innerWidth}", "args": []})
        assert dimensions["viewport"] <= 600 and dimensions["width"] <= dimensions["viewport"] + 3, dimensions
        webdriver(session, "/window/rect", "POST", {"width": 1280, "height": 800, "x": 0, "y": 0})
        browse(session, "http://127.0.0.1:8767/", "RFI 91", "home-final", evidence)
        movie.terminate()
        movie.wait(timeout=15)
        processes.remove(movie)
        assert video.stat().st_size > 10_000
        print("PASS: browser Home, notebook, conversation, agent, screen recording", flush=True)
        print(f"Evidence: {evidence}", flush=True)
    finally:
        if session:
            try:
                webdriver(session, "", "DELETE")
            except Exception:
                pass
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
        app_log.close()
        shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    main()
