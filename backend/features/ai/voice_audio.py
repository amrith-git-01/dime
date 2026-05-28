"""Normalize recorded voice to WAV/MP3 for Groq Whisper."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

TranscriptionAudioFormat = Literal["wav", "mp3"]

# A valid spoken clip at 16 kHz mono should be several KB. 78 bytes is just a
# WAV header from ffmpeg with no decoded samples.
_MIN_NORMALIZED_AUDIO_BYTES = 1024


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


def _input_suffix_for_mime(mime_type: str) -> str:
    lowered = (mime_type or "").lower()
    if "mp4" in lowered or "m4a" in lowered:
        return ".m4a"
    if "wav" in lowered or "x-wav" in lowered:
        return ".wav"
    if "mp3" in lowered or "mpeg" in lowered:
        return ".mp3"
    if "webm" in lowered:
        return ".webm"
    return ".audio"


def _validate_normalized_audio(audio_bytes: bytes, *, source: str) -> None:
    if len(audio_bytes) <= _MIN_NORMALIZED_AUDIO_BYTES:
        raise VoiceAudioNormalizeError(
            f"{source} produced too little audio ({len(audio_bytes)} bytes). "
            "Recording may be empty or ffmpeg could not decode samples."
        )


def _transcode_with_seekable_files(
    *,
    ffmpeg: str,
    raw: bytes,
    mime_type: str,
) -> bytes:
    suffix = _input_suffix_for_mime(mime_type)
    input_path: str | None = None
    output_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as input_file:
            input_file.write(raw)
            input_path = input_file.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as output_file:
            output_path = output_file.name

        proc = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-loglevel",
                "error",
                "-i",
                input_path,
                "-f",
                "wav",
                "-ac",
                "1",
                "-ar",
                "16000",
                output_path,
            ],
            capture_output=True,
            timeout=120,
        )
        if proc.returncode != 0:
            err = (proc.stderr or b"").decode("utf-8", errors="replace")[:400]
            raise VoiceAudioNormalizeError(f"ffmpeg transcode failed: {err or proc.returncode}")

        out = Path(output_path).read_bytes()
        if not out:
            raise VoiceAudioNormalizeError("ffmpeg produced empty output")
        _validate_normalized_audio(out, source="ffmpeg")
        return out
    finally:
        for path in (input_path, output_path):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass


def normalize_audio_for_transcription(
    audio_bytes: bytes,
    mime_type: str,
) -> tuple[bytes, TranscriptionAudioFormat]:
    """Return audio bytes and format (``wav`` or ``mp3``) for Groq Whisper."""
    lowered = (mime_type or "").lower()
    raw = bytes(audio_bytes)
    if not raw:
        raise VoiceAudioNormalizeError("Empty audio payload")

    logger.info(
        "[voice-pipeline] normalize-start mime=%s in_bytes=%d",
        mime_type,
        len(raw),
    )

    if "wav" in lowered or lowered.endswith("audio/wav") or "x-wav" in lowered:
        _validate_normalized_audio(raw, source="wav passthrough")
        logger.info(
            "[voice-pipeline] normalize-passthrough format=wav out_bytes=%d",
            len(raw),
        )
        return raw, "wav"
    if "mp3" in lowered or "mpeg" in lowered:
        _validate_normalized_audio(raw, source="mp3 passthrough")
        logger.info(
            "[voice-pipeline] normalize-passthrough format=mp3 out_bytes=%d",
            len(raw),
        )
        return raw, "mp3"

    ffmpeg, ffmpeg_err = _resolve_ffmpeg_executable()
    if not ffmpeg:
        raise VoiceAudioNormalizeError(
            ffmpeg_err
            or "No ffmpeg executable found; install system ffmpeg or add imageio-ffmpeg and restart."
        )

    out = _transcode_with_seekable_files(
        ffmpeg=ffmpeg,
        raw=raw,
        mime_type=mime_type,
    )
    logger.info(
        "[voice-pipeline] normalize-transcoded format=wav in_bytes=%d out_bytes=%d",
        len(raw),
        len(out),
    )
    return out, "wav"
