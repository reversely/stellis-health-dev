"""Call recovery keeps controls responsive when recognition cannot finish."""
import asyncio
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import numpy as np
from stellis import intake_voice


class Detector:
    def __init__(self):
        self.segments = []
        self.detected = True
        self.front = SimpleNamespace(start=0, samples=np.ones(1600))

    def empty(self):
        return not self.segments

    def flush(self):
        self.segments.append(self.front)

    def pop(self):
        self.segments.pop(0)

    def reset(self):
        self.detected = False


class CallRecoveryTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.messages = []
        self.engine = SimpleNamespace(vad=lambda: Detector(), transcribe=lambda samples: '')
        self.call = intake_voice.Call(AsyncMock(side_effect=self.messages.append), AsyncMock(), self.engine)

    async def asyncTearDown(self):
        await self.call.close()

    async def test_unclear_answer_reports_recovery_then_accepts_next_answer(self):
        self.call._answer = AsyncMock()
        with patch.object(intake_voice.debug_data, 'save_answer_audio'):
            await self.call._answer_audio(np.ones(16000), time.perf_counter())
            self.assertTrue(any(m['type']=='error' and 'repeat' in m['message'] for m in self.messages))
            self.assertEqual(self.messages[-1], {'type':'state','state':'listening'})
            self.engine.transcribe = lambda samples: 'Manage my appointments'
            await self.call._answer_audio(np.ones(16000), time.perf_counter())
        self.assertEqual(self.call._answer.await_args.args[0], 'Manage my appointments')

    async def test_echo_stays_silent(self):
        self.call.speaking = 'What would you like to track'
        self.engine.transcribe = lambda samples: 'What would you like to track'
        with patch.object(intake_voice.debug_data, 'save_answer_audio'):
            await self.call._answer_audio(np.ones(16000), time.perf_counter(), 2)
        self.assertFalse(any(m['type']=='error' for m in self.messages))

    async def test_stalled_recognition_does_not_block_controls_and_falls_back(self):
        self.engine.transcribe = lambda samples: (time.sleep(.08) or 'late answer')
        self.call._answer = AsyncMock()
        with patch.object(intake_voice, 'RECOGNITION_TIMEOUT_S', .01):
            await self.call._queue_answer(np.ones(16000), time.perf_counter(), 0)
            await asyncio.wait_for(self.call.message({'type':'speaker','on':False}), .02)
            self.assertFalse(self.call.speaker)
            await self.call.recognizing
        self.assertIsNone(self.call.engine)
        self.assertEqual(self.messages[-1], {'type':'state','state':'typing'})
        self.call._answer.assert_not_awaited()
        await self.call.text('My typed answer')
        self.call._answer.assert_awaited_once()

    async def test_recognition_exception_leaves_call_usable(self):
        def fail(samples):
            raise RuntimeError('Model failure')
        self.engine.transcribe = fail
        await self.call._answer_audio(np.ones(16000), time.perf_counter())
        self.assertIsNone(self.call.engine)
        self.assertTrue(any(m['type']=='mic' and not m['ok'] for m in self.messages))

    async def test_done_speaking_flushes_once_and_resets_detector(self):
        self.call.detecting = True
        self.call.history = np.ones(1600)
        self.call._queue_answer = AsyncMock()
        detector = self.call.vad
        await self.call.message({'type':'finish_answer'})
        await self.call.message({'type':'finish_answer'})
        self.call._queue_answer.assert_awaited_once()
        self.assertFalse(detector.detected)
        self.assertFalse(self.call.detecting)
        self.assertEqual(len(self.call.history), 0)
        self.assertEqual(self.messages[-1]['state'], 'transcribing')

    async def test_pending_answers_are_bounded(self):
        self.call.recognizing = asyncio.create_task(asyncio.sleep(30))
        for _ in range(intake_voice.MAX_QUEUED_ANSWERS + 3):
            await self.call._queue_answer(np.ones(1600), time.perf_counter(), 0)
        self.assertEqual(self.call.answers.qsize(), intake_voice.MAX_QUEUED_ANSWERS)
        self.assertTrue(any(m['type']=='error' for m in self.messages))

    async def test_synthesis_failure_preserves_reply_as_text(self):
        self.engine.speak = lambda text: (_ for _ in ()).throw(RuntimeError('Voice failure'))
        await self.call._say('Your reply remains available', 1)
        self.assertEqual(self.messages[-1]['type'], 'say')
        self.assertFalse(self.messages[-1]['audio'])
        self.assertEqual(self.messages[-1]['text'], 'Your reply remains available')

    async def test_typed_answer_cancels_pending_recognition(self):
        self.call._answer = AsyncMock()
        self.call.recognizing = asyncio.create_task(asyncio.sleep(30))
        self.call.answers.put_nowait((np.ones(1600), time.perf_counter(), 0))
        await self.call.text('Use this typed answer')
        self.assertTrue(self.call.recognizing.cancelled())
        self.assertTrue(self.call.answers.empty())
        self.assertEqual(self.call._answer.await_args.args[0], 'Use this typed answer')

    async def test_stalled_synthesis_returns_the_original_reply_as_text(self):
        self.engine.speak = lambda text: (time.sleep(.08) or (b'\0\0', 16000))
        with patch.object(intake_voice, 'SYNTHESIS_TIMEOUT_S', .01):
            await self.call._say('Keep the complete reply', 1)
        self.assertFalse(self.messages[-1]['audio'])
        self.assertEqual(self.messages[-1]['text'], 'Keep the complete reply')

    async def test_playback_completion_reveals_speech_already_in_progress(self):
        self.call.detecting = True
        self.call.speaking_until = float('inf')
        await self.call.message({'type':'played'})
        self.assertEqual(self.messages[-1], {'type':'state','state':'hearing'})
