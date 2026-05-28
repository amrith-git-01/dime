"""Errors raised during media-to-text preprocessing (before DeepSeek parse)."""


class PreprocessError(RuntimeError):
    """Base error for Groq preprocess stage."""


class TranscriptionError(PreprocessError):
    """Speech-to-text failed or returned empty transcript."""


class OcrError(PreprocessError):
    """Receipt OCR failed or returned empty text."""
