"""Detect image type from magic bytes (avatars and uploads)."""


def detect_image_format(header: bytes) -> tuple[str, str] | None:
    """Return ``(file_extension, content_type)`` from magic bytes, or ``None``."""
    if len(header) < 12:
        return None
    if header.startswith(b"\xff\xd8\xff"):
        return ("jpg", "image/jpeg")
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return ("png", "image/png")
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return ("webp", "image/webp")
    return None
