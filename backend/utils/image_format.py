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


_HEIF_BRANDS = frozenset({b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1"})


def detect_receipt_image_format(header: bytes) -> tuple[str, str] | None:
    """Like ``detect_image_format`` but also accepts HEIC/HEIF (``ftyp`` brand sniffing)."""
    detected = detect_image_format(header)
    if detected:
        return detected
    if len(header) >= 12 and header[4:8] == b"ftyp":
        brand = header[8:12]
        if brand in {b"heic", b"heix", b"hevc", b"hevx"}:
            return ("heic", "image/heic")
        if brand in _HEIF_BRANDS:
            return ("heif", "image/heif")
    return None
