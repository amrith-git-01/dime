# 🤖 AI Models — Expense Tracker App

> **Approach:** Two-stage pipeline — Groq preprocess (media→text), DeepSeek V4 Flash parse (text→JSON)
> **On-Device AI:** Removed — too slow, storage heavy, limited device support
> **Last Updated:** May 2026 (DeepSeek Flash pipeline)

---

## 📋 Table of Contents

1. [Why Cloud AI](#why-cloud-ai)
2. [Providers Overview](#providers-overview)
3. [Pipeline](#pipeline-implemented)
4. [Model IDs](#model-ids)
5. [File Input / Output Handling](#file-input--output-handling)
6. [Architecture Notes](#architecture-notes)

---

## Why Cloud AI

The original plan used **Gemma 4 E2B on-device via ML Kit GenAI API**. This was dropped for the following reasons:

- **Speed:** On-device inference is slow (12–20 tokens/sec) — unacceptable for real-time SMS detection bottom sheet
- **Storage:** ~1.3 GB model download on first launch — poor first-time user experience
- **Device coverage:** Requires AICore (Snapdragon 8 Gen 1+ / Tensor G2+) — excludes large portion of mid-range Indian Android market
- **Cost:** Free cloud APIs exist with generous limits — no trade-off needed

All AI processing now happens via **FastAPI backend** which calls cloud providers. The app never calls AI APIs directly.

---

## Providers Overview

| Provider     | Role in pipeline                            | Auth               |
| ------------ | ------------------------------------------- | ------------------ |
| **DeepSeek** | Stage 2 — structured JSON parse (all modes) | `DEEPSEEK_API_KEY` |
| **Groq**     | Stage 1 — Whisper STT + Scout receipt OCR   | `GROQ_API_KEY`     |

DeepSeek V4 Flash is **text-in / text-out only**. Images and audio never go to DeepSeek directly.

---

## Pipeline (implemented)

| Input                   | Stage 1 (Groq)                                               | Stage 2 (DeepSeek)                              |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| SMS / notification text | —                                                            | `deepseek-v4-flash` → `ParseExpenseResult` JSON |
| Receipt image           | `meta-llama/llama-4-scout-17b-16e-instruct` OCR → plain text | `deepseek-v4-flash` parse OCR text              |
| Voice audio             | `whisper-large-v3-turbo` → `whisper-large-v3` transcript     | `deepseek-v4-flash` parse transcript            |

Code: `backend/features/ai/preprocess/` (Groq), `backend/features/ai/service.py` (DeepSeek).

---

## Model IDs

| Step               | Model                                       | Env                             |
| ------------------ | ------------------------------------------- | ------------------------------- |
| Parse brain        | `deepseek-v4-flash`                         | `AI_MODEL`, `AI_PARSE_FALLBACK` |
| Voice STT primary  | `whisper-large-v3-turbo`                    | `GROQ_WHISPER_PRIMARY`          |
| Voice STT fallback | `whisper-large-v3`                          | `GROQ_WHISPER_FALLBACK`         |
| Receipt OCR        | `meta-llama/llama-4-scout-17b-16e-instruct` | `GROQ_VISION_OCR_MODEL`         |

Parse fallback chain (`AI_PARSE_FALLBACK`): comma-separated `deepseek:model_id` entries only, e.g. `deepseek:deepseek-v4-flash,deepseek:deepseek-chat`.

Thinking mode is **disabled** on Flash for expense parse (`thinking.type = disabled`).

---

## File Input / Output Handling

### Input (FastAPI)

| Input           | Stage 1                          | Stage 2                           |
| --------------- | -------------------------------- | --------------------------------- |
| Receipt JPG/PNG | Groq Scout — OCR plain text only | DeepSeek — JSON fields + category |
| Voice memo      | Groq Whisper — transcript        | DeepSeek — JSON fields + category |
| Bank SMS        | —                                | DeepSeek — JSON fields + category |

Audio is normalized to WAV/MP3 via ffmpeg when needed (`features/ai/voice_audio.py`).

### Output

DeepSeek returns JSON text → validated as `ParseExpenseResult` → transaction row in Postgres.

`raw_model` on saved transactions reflects the **DeepSeek** model used for parse, not Whisper/Scout.

---

## Architecture Notes

**All AI calls go through FastAPI — never directly from the app.**

```
React Native App
      ↓ HTTPS (multipart receipt/voice, 202 async)
FastAPI workers
      ├── preprocess (Groq): image→text, audio→text
      └── parse (DeepSeek): text→ParseExpenseResult JSON
      ↓
TransactionService.create_manual
```

**Env template:** `backend/.env.example`

**Probe script:** `python -m scripts.test_models` (DeepSeek + Groq Whisper + Scout)

**Future (out of scope):** report generation, AI chatbot — product plans only; not wired to this pipeline yet.

**Merchant caching (key optimisation):**
Once a merchant is categorised (e.g. "Swiggy" → Food & Dining), the result can be stored in `merchant_category_mappings`. Repeat merchants may skip AI for categorization.

---

> _Document maintained as part of project planning. Last updated May 2026._
