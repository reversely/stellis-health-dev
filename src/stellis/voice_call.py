"""Pipecat voice calls attached to durable agent Chat threads."""

from __future__ import annotations

import asyncio
import importlib.util
import logging
import os
import re
from pathlib import Path
from typing import Any

from stellis import agent_runtime, agents

_log = logging.getLogger(__name__)
_handler: Any = None
_calls: dict[str, dict[str, Any]] = {}
_ICE_SERVER = "stun:stun.l.google.com:19302"


def availability() -> dict[str, object]:
    """Require explicit local model paths so starting a call never downloads models."""
    if not agent_runtime.configured():
        return {"ready": False, "reason": "Agent replies are unavailable on this device."}
    if importlib.util.find_spec("pipecat") is None:
        return {"ready": False, "reason": "Voice calling is not installed on this device."}
    paths = [os.environ.get(key, "") for key in (
        "STELLIS_VOICE_WHISPER_MODEL", "STELLIS_VOICE_KOKORO_MODEL",
        "STELLIS_VOICE_KOKORO_VOICES")]
    if not all(path and Path(path).exists() for path in paths):
        return {"ready": False, "reason": "Voice models are not installed on this device."}
    return {"ready": True, "reason": "", "ice_servers": [{"urls": _ICE_SERVER}]}


def _speech_text(text: str) -> str:
    """Keep trusted links in Chat while speaking only their visible labels."""
    return re.sub(r"\[([^]]+)\]\((?:/[^)]+|https://[^)]+)\)", r"\1", text)


async def offer(agent_id: str, sdp: str, kind: str) -> dict[str, str]:
    """Answer a browser offer with Pipecat's SmallWebRTC peer transport."""
    global _handler
    agents.get(agent_id)
    status = availability()
    if not status["ready"]:
        raise RuntimeError(str(status["reason"]))
    if kind != "offer" or len(sdp) > 100_000:
        raise ValueError("Invalid call offer")
    from pipecat.transports.smallwebrtc.request_handler import (
        SmallWebRTCRequest, SmallWebRTCRequestHandler,
    )
    from pipecat.transports.smallwebrtc.connection import IceServer

    if _handler is None:
        _handler = SmallWebRTCRequestHandler(ice_servers=[IceServer(urls=_ICE_SERVER)])

    async def connected(connection: Any) -> None:
        pc_id = connection.pc_id
        agents.append_message(agent_id, "system", "Voice call started.")
        task = asyncio.create_task(_run_call(agent_id, connection), name=f"agent-call-{pc_id}")
        _calls[pc_id] = {"agent_id": agent_id, "task": task, "worker": None, "runner": None}

        def finished(done: asyncio.Task) -> None:
            _calls.pop(pc_id, None)
            agents.append_message(agent_id, "system", "Voice call ended.")
            if not done.cancelled() and done.exception() is not None:
                _log.exception("Voice call failed", exc_info=done.exception())

        task.add_done_callback(finished)

    answer = await _handler.handle_web_request(SmallWebRTCRequest(sdp=sdp, type=kind), connected)
    if not answer:
        raise RuntimeError("Call connection failed")
    return answer


async def _run_call(agent_id: str, connection: Any) -> None:
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.frames.frames import (Frame, InterruptionFrame, LLMContextFrame,
                                       LLMFullResponseEndFrame, LLMFullResponseStartFrame, TextFrame)
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.worker import PipelineWorker
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContextAggregatorPair, LLMUserAggregatorParams,
    )
    from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
    from pipecat.services.kokoro.tts import KokoroTTSService
    from pipecat.services.whisper.stt import WhisperSTTService
    from pipecat.transports.base_transport import TransportParams
    from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
    from pipecat.workers.runner import WorkerRunner

    class NemoClawReply(FrameProcessor):
        def __init__(self) -> None:
            super().__init__()
            self.pending: asyncio.Task | None = None

        async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
            await super().process_frame(frame, direction)
            if isinstance(frame, InterruptionFrame):
                if self.pending:
                    await self.cancel_task(self.pending)
                    self.pending = None
                await self.push_frame(frame, direction)
                return
            if isinstance(frame, LLMContextFrame):
                messages = frame.context.get_messages()
                latest = messages[-1] if messages else None
                question = (latest.get("content", "") if isinstance(latest, dict)
                            and latest.get("role") == "user" else "")
                if isinstance(question, str) and question.strip():
                    if self.pending:
                        await self.cancel_task(self.pending)
                    self.pending = self.create_task(self.reply(question.strip()))
                return
            await self.push_frame(frame, direction)

        async def reply(self, question: str) -> None:
            await self.push_frame(LLMFullResponseStartFrame())
            try:
                result = await agent_runtime.ask(agent_id, question)
                answer = str(result["agent_message"]["content"])
                frame = TextFrame(_speech_text(answer))
                frame.includes_inter_frame_spaces = True
                await self.push_frame(frame)
            except asyncio.CancelledError:
                raise
            except (agent_runtime.AgentRunError, ValueError, LookupError) as exc:
                await self.push_error(error_msg=str(exc), exception=exc)
            finally:
                await self.push_frame(LLMFullResponseEndFrame())

    transport = SmallWebRTCTransport(connection, TransportParams(
        audio_in_enabled=True, audio_out_enabled=True))
    stt = WhisperSTTService(settings=WhisperSTTService.Settings(
        model=os.environ["STELLIS_VOICE_WHISPER_MODEL"]))
    tts = KokoroTTSService(
        model_path=os.environ["STELLIS_VOICE_KOKORO_MODEL"],
        voices_path=os.environ["STELLIS_VOICE_KOKORO_VOICES"],
        settings=KokoroTTSService.Settings(voice="af_heart"))
    user, assistant = LLMContextAggregatorPair(
        LLMContext(), user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()))
    worker = PipelineWorker(Pipeline([
        transport.input(), stt, user, NemoClawReply(), tts, transport.output(), assistant,
    ]), idle_timeout_secs=1800, enable_rtvi=False)
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    session = _calls.get(connection.pc_id)
    if session is None:
        await runner.cancel()
        return
    session.update(worker=worker, runner=runner)

    @transport.event_handler("on_client_disconnected")
    async def disconnected(_transport: Any, _client: Any) -> None:
        asyncio.create_task(runner.cancel())

    try:
        await runner.run()
    finally:
        await connection.disconnect()


async def stop_reply(agent_id: str, pc_id: str) -> None:
    """Interrupt current speech without ending the peer connection."""
    from pipecat.frames.frames import InterruptionFrame

    session = _calls.get(pc_id)
    if not session or session["agent_id"] != agent_id:
        raise LookupError("Call not found")
    if session["worker"] is not None:
        await session["worker"].queue_frames([InterruptionFrame()])


async def end(agent_id: str, pc_id: str) -> None:
    session = _calls.get(pc_id)
    if not session or session["agent_id"] != agent_id:
        raise LookupError("Call not found")
    if session["runner"] is not None:
        await session["runner"].cancel()
    elif session["task"] is not None:
        session["task"].cancel()
    try:
        await asyncio.wait_for(asyncio.gather(session["task"], return_exceptions=True), timeout=10)
    except asyncio.TimeoutError:
        session["task"].cancel()


async def close() -> None:
    """Release peer connections when the device service shuts down."""
    global _handler
    sessions = list(_calls.values())
    for session in sessions:
        if session["runner"] is not None:
            try:
                await asyncio.wait_for(session["runner"].cancel(), timeout=5)
            except asyncio.TimeoutError:
                session["task"].cancel()
        else:
            session["task"].cancel()
    if _handler is not None:
        await _handler.close()
        _handler = None
    if sessions:
        try:
            await asyncio.wait_for(asyncio.gather(
                *(session["task"] for session in sessions), return_exceptions=True), timeout=10)
        except asyncio.TimeoutError:
            for session in sessions:
                session["task"].cancel()
