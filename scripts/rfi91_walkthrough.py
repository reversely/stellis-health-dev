"""Run the fictional RFI 91 API/browser smoke pass and capture review evidence.

Uses temporary Stellis data and browser profile on GN100. No external accounts
are touched. Requires the existing Firefox, geckodriver, Xvfb, ffmpeg, and venv.
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
        with urlopen(req, timeout=40) as response:
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
                   XDG_RUNTIME_DIR="/run/user/1000")
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
        print("PASS: seed, notebooks, pages, transcript, notes, search, audio, annotations, trash and restore", flush=True)

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
