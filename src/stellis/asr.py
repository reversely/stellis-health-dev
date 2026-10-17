"""On-device English transcription with whisper.cpp through pywhispercpp.

The result has the same shape as `whisper-cli -ojf` JSON, so word timing and
loop repair read it unchanged: a list of passages with millisecond offsets,
text, and tokens carrying their own offsets and probability. Beam search with
five beams and best-of-five matches whisper-cli's defaults.
"""

from __future__ import annotations

import threading
from pathlib import Path

import numpy as np

_MODELS: dict[str, object] = {}
_LOCK = threading.Lock()


def _model(path: Path):
    from pywhispercpp.model import Model

    key = str(path)
    # pywhispercpp exits the process on a path it cannot load, so check first.
    if not Path(key).is_file():
        raise RuntimeError("Local speech model is unavailable")
    with _LOCK:
        if key not in _MODELS:
            # Strategy 1 is beam search in whisper.cpp's sampling enum.
            _MODELS[key] = Model(key, params_sampling_strategy=1, redirect_whispercpp_logs_to=None)
        return _MODELS[key]


def _text(value: object) -> str:
    return value.decode("utf-8", "replace") if isinstance(value, bytes) else str(value)


def _params(vocabulary: list[str] | None, max_context: int | None, threads: int) -> dict[str, object]:
    params: dict[str, object] = {"language": "en", "n_threads": threads, "token_timestamps": True,
                                 "beam_search": {"beam_size": 5, "patience": -1.0}, "greedy": {"best_of": 5},
                                 "print_progress": False, "print_realtime": False}
    if vocabulary:
        params["initial_prompt"] = "Vocabulary: " + ", ".join(vocabulary)
    if max_context is not None:
        params["n_max_text_ctx"] = max_context
    return params


def transcribe(audio: np.ndarray, model_path: Path, vocabulary: list[str] | None = None,
               max_context: int | None = None, threads: int = 4) -> list[dict[str, object]]:
    """Transcribe mono 16 kHz float audio into whisper-cli shaped passages."""
    import _pywhispercpp as native

    params = _params(vocabulary, max_context, threads)
    model = _model(model_path)
    with _LOCK:
        model.transcribe(np.ascontiguousarray(audio, dtype=np.float32), **params)
        context = model._ctx
        passages = []
        for index in range(native.whisper_full_n_segments(context)):
            tokens = []
            for position in range(native.whisper_full_n_tokens(context, index)):
                data = native.whisper_full_get_token_data(context, index, position)
                tokens.append({"text": _text(native.whisper_full_get_token_text(context, index, position)),
                               "offsets": {"from": int(data.t0) * 10, "to": int(data.t1) * 10}, "p": float(data.p)})
            passages.append({"offsets": {"from": int(native.whisper_full_get_segment_t0(context, index)) * 10,
                                         "to": int(native.whisper_full_get_segment_t1(context, index)) * 10},
                             "text": _text(native.whisper_full_get_segment_text(context, index)), "tokens": tokens})
    return passages
