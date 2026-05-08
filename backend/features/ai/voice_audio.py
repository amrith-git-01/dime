"""Normalize recorded voice to formats NVIDIA Gemma 3n chat API accepts (WAV or MP3 only)."""

from __future__ import annotations

import os
import shutil
import subprocess
from typing import Literal

NvidiaVoiceFormat = Literal["wav", "mp3"]


class VoiceAudioNormalizeError(RuntimeError):
    pass


def _resolve_ffmpeg_executable() -> tuple[str | None, str | None]:
    """Return ``(path, None)`` or ``(None, reason)`` for diagnostics."""
    system = shutil.which("ffmpeg")
    if system:
        return system, None
    try:
        import imageio_ffmpeg
    except ImportError:
        return None, (
            "imageio_ffmpeg is not installed in this Python environment. "
            "From backend/: run `uv sync` (or `pip install imageio-ffmpeg`), then restart the API."
        )
    try:
        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        return None, f"imageio_ffmpeg.get_ffmpeg_exe() failed: {exc}"
    if not exe or not os.path.isfile(exe):
        return None, f"imageio_ffmpeg returned no usable ffmpeg binary (got {exe!r})"
    return exe, None


def normalize_voice_audio_for_nvidia(
    audio_bytes: bytes,
    mime_type: str,
) -> tuple[bytes, NvidiaVoiceFormat]:
    """Return audio bytes and NVIDIA ``input_audio.format`` value (``wav`` or ``mp3`` only)."""
    lowered = (mime_type or "").lower()
    raw = bytes(audio_bytes)
    if not raw:
        raise VoiceAudioNormalizeError("Empty audio payload")

    if "wav" in lowered or lowered.endswith("audio/wav") or "x-wav" in lowered:
        return raw, "wav"
    if "mp3" in lowered or "mpeg" in lowered:
        return raw, "mp3"

    ffmpeg, ffmpeg_err = _resolve_ffmpeg_executable()
    if not ffmpeg:
        raise VoiceAudioNormalizeError(
            ffmpeg_err
            or "No ffmpeg executable found; install system ffmpeg or add imageio-ffmpeg and restart."
        )

    # Single-channel WAV @ 16 kHz — aligns with Gemma 3n "single channel" audio notes.
    proc = subprocess.run(
        [
            ffmpeg,
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-f",
            "wav",
            "-ac",
            "1",
            "-ar",
            "16000",
            "pipe:1",
        ],
        input=raw,
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", errors="replace")[:400]
        raise VoiceAudioNormalizeError(f"ffmpeg transcode failed: {err or proc.returncode}")

    out = proc.stdout
    if not out:
        raise VoiceAudioNormalizeError("ffmpeg produced empty output")
    return out, "wav"
