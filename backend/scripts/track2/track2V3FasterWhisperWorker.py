#!/usr/bin/env python3
"""Persistent JSON-line faster-whisper worker for Track2 V3.

The worker performs transcription only. Address extraction and candidate logic
remain in Node services.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any

from faster_whisper import WhisperModel


MODELS: dict[tuple[str, str, str], WhisperModel] = {}
MODEL_LOAD_COUNT = 0


def safe_text(value: Any, limit: int = 20000) -> str:
    return " ".join(str(value or "").split())[:limit]


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def model_for(model_name: str, device: str, compute_type: str) -> tuple[WhisperModel, bool]:
    global MODEL_LOAD_COUNT
    key = (model_name, device, compute_type)
    reused = key in MODELS
    if not reused:
        MODELS[key] = WhisperModel(model_name, device=device, compute_type=compute_type)
        MODEL_LOAD_COUNT += 1
    return MODELS[key], reused


def transcribe(request: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    audio_path = safe_text(request.get("audioPath"), 2000)
    model_name = safe_text(request.get("model") or "small", 120)
    device = safe_text(request.get("device") or "cpu", 40)
    compute_type = safe_text(request.get("computeType") or "int8", 40)
    requested_language = safe_text(request.get("requestedLanguage") or "vi", 20)
    if not audio_path:
        raise ValueError("audioPath is required")

    model, reused = model_for(model_name, device, compute_type)
    segments_iter, info = model.transcribe(
        audio_path,
        language=requested_language or None,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=True,
    )
    segments = []
    for segment in segments_iter:
        text = safe_text(segment.text, 1200)
        if not text:
            continue
        segments.append({
            "start": round(float(segment.start), 3),
            "end": round(float(segment.end), 3),
            "text": text,
        })

    transcript_text = safe_text(" ".join(segment["text"] for segment in segments), 20000)
    independently_detected = not requested_language
    return {
        "status": "OK",
        "provider": "faster-whisper",
        "model": model_name,
        "device": device,
        "computeType": compute_type,
        "requestedLanguage": requested_language or None,
        "detectedLanguage": safe_text(getattr(info, "language", ""), 20) or None
        if independently_detected else None,
        "languageProbability": round(float(getattr(info, "language_probability", 0.0)), 6)
        if independently_detected else None,
        "transcriptText": transcript_text,
        "segments": segments,
        "audioDurationSeconds": round(float(getattr(info, "duration", 0.0)), 3),
        "transcriptionRuntimeMs": round((time.perf_counter() - started) * 1000),
        "modelLoadCount": MODEL_LOAD_COUNT,
        "modelReused": reused,
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")

    for raw_line in sys.stdin:
        request_id = None
        try:
            request = json.loads(raw_line)
            request_id = request.get("id")
            response = transcribe(request)
            emit({"id": request_id, **response})
        except Exception as error:  # provider boundary: one request must not kill the worker
            emit({
                "id": request_id,
                "status": "ERROR",
                "reason": "ASR_TRANSCRIPTION_FAILED",
                "provider": "faster-whisper",
                "error": {
                    "code": type(error).__name__[:120],
                    "message": safe_text(error, 500),
                },
                "modelLoadCount": MODEL_LOAD_COUNT,
            })


if __name__ == "__main__":
    main()
