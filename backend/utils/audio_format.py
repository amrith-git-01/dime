"""Detect recorded-voice container from magic bytes (never trust the client MIME)."""


def detect_audio_format(header: bytes) -> tuple[str, str] | None:
    """Return ``(file_extension, content_type)`` from magic bytes, or ``None``.

    Covers what the app records (m4a/mp4, wav, mp3, webm, caf) plus aac and ogg.
    """
    if len(header) < 12:
        return None
    if header.startswith(b"RIFF") and header[8:12] == b"WAVE":
        return ("wav", "audio/wav")
    if header[4:8] == b"ftyp":
        return ("m4a", "audio/mp4")
    if header.startswith(b"ID3"):
        return ("mp3", "audio/mpeg")
    if header[0] == 0xFF and (header[1] & 0xE0) == 0xE0:
        # MPEG audio frame sync; layer bits 00 mean ADTS AAC rather than MP3.
        if (header[1] & 0x06) == 0x00:
            return ("aac", "audio/aac")
        return ("mp3", "audio/mpeg")
    if header.startswith(b"OggS"):
        return ("ogg", "audio/ogg")
    if header.startswith(b"\x1a\x45\xdf\xa3"):
        return ("webm", "audio/webm")
    if header.startswith(b"caff"):
        return ("caf", "audio/x-caf")
    return None
