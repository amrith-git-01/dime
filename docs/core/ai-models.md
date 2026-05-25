# 🤖 AI Models — Expense Tracker App

> **Approach:** Free cloud APIs, multi-provider, use-case specific model assignment
> **On-Device AI:** Removed — too slow, storage heavy, limited device support
> **Last Updated:** May 2026

---

## 📋 Table of Contents

1. [Why Cloud AI](#why-cloud-ai)
2. [Providers Overview](#providers-overview)
3. [Full Model Comparison Table](#full-model-comparison-table)
4. [Use Case → Model Assignment](#use-case--model-assignment)
5. [Fallback Chain](#fallback-chain)
6. [File Input / Output Handling](#file-input--output-handling)
7. [Architecture Notes](#architecture-notes)

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

| Provider | Free Tier | Auth Required |
|---|---|---|
| **Google AI Studio** | Yes — model dependent limits | API key, no credit card |
| **NVIDIA NIM** | Yes — 40 RPM shared | API key, no credit card |
| **Groq** | Yes — model dependent limits | API key, no credit card |

---

## Full Model Comparison Table

| Model | Provider | Images | Audio | Context | RPM | RPD | TPM |
|---|---|---|---|---|---|---|---|
| Gemma 3 4B | Google AI Studio | ✅ | ❌ | 128K | 30 | 14.4K | 15K |
| Gemma 3 12B | Google AI Studio | ✅ | ❌ | 128K | 30 | 14.4K | 15K |
| Gemma 3 27B | Google AI Studio | ✅ | ❌ | 128K | 30 | 14.4K | 15K |
| Gemma 4 26B | Google AI Studio | ✅ | ❌ | 256K | 15 | 1.5K | Unlimited |
| Gemma 4 31B | Google AI Studio | ✅ | ❌ | 256K | 15 | 1.5K | Unlimited |
| Gemma 3n E4B | NVIDIA NIM | ✅ | ✅ | 128K | 40* | — | — |
| Gemma 3n E2B | NVIDIA NIM | ✅ | ✅ | 128K | 40* | — | — |
| Llama 3.1 8B Instant | Groq | ❌ | ❌ | 128K | 30 | 14.4K | 6K |
| Llama 3.3 70B Versatile | Groq | ❌ | ❌ | 128K | 30 | 1K | 12K |
| GPT-OSS 20B | Groq | ❌ | ❌ | 128K | 30 | 1K | 8K |
| GPT-OSS 120B | Groq | ❌ | ❌ | 128K | 30 | 1K | 8K |

> *NVIDIA NIM 40 RPM is a **shared pool** across both Gemma 3n models combined — not per model.

**Column definitions:**
- **RPM** — Requests per minute
- **RPD** — Requests per day
- **TPM** — Tokens per minute (shared across all requests in that minute)

---

## Use Case → Model Assignment

Each use case has a dedicated primary model. Categorization is **not a separate call** — it is baked into the same prompt as parsing, so every model returns structured fields + category in one round trip.

---

### 1. SMS / Notification Parsing + Auto-Categorization

**Job:** Bank SMS or UPI notification arrives → extract `{ merchant, amount, type, date, category }` → show in bottom sheet within 2 seconds.

**Requirements:**
- Speed critical — bottom sheet is waiting
- Text only input
- Small input (one SMS string), small structured JSON output
- Highest frequency task — fires on every transaction

**Primary:** `Gemma 3 4B` — Google AI Studio
- Smallest and fastest of the Google models
- 14.4K RPD — highest daily budget for this high-frequency task
- 15K TPM — SMS prompts are small (~200-300 tokens), won't choke
- Auto-categorization baked into same prompt — one call, full structured output

---

### 2. Receipt Scanning (Image Input) + Auto-Categorization

**Job:** User captures receipt photo → extract `{ merchant, amount, date, line_items, category }` → show confirm card.

**Requirements:**
- Vision / image input required
- OCR capability for Indian receipts (Hindi, Tamil, printed + handwritten)
- Not time critical — user is reviewing, 3-5 seconds acceptable
- Token heavy — images consume many tokens

**Primary:** `Gemma 4 26B` — Google AI Studio
- Unlimited TPM — image token consumption never hits a wall
- 256K context — handles large receipts with many line items
- Best vision + OCR capability in our free stack
- MoE architecture (only 4B active params) — fast despite large model size

---

### 3. Voice Input + Auto-Categorization

**Job:** User speaks expense → "I spent 250 on chai at the office" → extract `{ merchant, amount, type, date, category }`.

**Requirements:**
- Audio input support — only models with this capability qualify
- Fast enough for real-time feel
- Structured output same as SMS parsing

**Primary:** `Gemma 3n E4B` — NVIDIA NIM
- Only free models in our stack that natively accept audio input
- E4B is more capable than E2B, better extraction accuracy
- 40 RPM pool — voice input is lower frequency than SMS, won't strain limits
- Edge-optimized architecture — fast inference

---

### 4. Report Generation

**Job:** Generate monthly/weekly spending report from full transaction history → structured analysis, trends, insights, recommendations.

**Requirements:**
- Long context — full month of transactions could be 5K-20K tokens of input
- Large output — detailed report is 2K-5K tokens
- Async — runs in background, latency irrelevant
- Strong reasoning — pattern detection, trend analysis, anomaly detection

**Primary:** `Gemma 4 31B` — Google AI Studio
- **Unlimited TPM** — critical for long transaction history input + long report output
- 256K context — handles a full year of transaction history if needed
- Dense 31B model — best reasoning quality in our Google stack
- 1.5K RPD — reports run rarely (weekly/monthly), more than enough

---

### 5. AI Chatbot (Real-Time)

**Job:** User asks natural language questions — "How much did I spend on food last week?" or "Am I on track with my budget?" → instant conversational answer.

**Requirements:**
- Real-time — user is waiting, needs fast response
- Strong reasoning + instruction following
- Conversational context (multi-turn chat history)
- Lower frequency than SMS parsing

**Primary:** `GPT-OSS 20B` — Groq
- 1000+ tokens/sec on Groq LPU — fastest reasoning model in our stack
- Matches OpenAI o3-mini on benchmarks — strong reasoning for financial queries
- Configurable reasoning effort (low/medium/high) — use low for simple queries, high for complex analysis
- Full chain-of-thought access — useful for debugging prompt issues
- 1K RPD — chatbot queries are infrequent, sufficient for early user base

---

## Fallback Chain

All fallback logic lives in FastAPI. If primary returns 429 (rate limit), retry with fallback. App never sees the failure.

| Use Case | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| SMS / Notification Parsing | Gemma 3 4B (Google) | Gemma 3 12B (Google) | Llama 3.1 8B (Groq) |
| Receipt Scanning | Gemma 4 26B (Google) | Gemma 4 31B (Google) | Gemma 3n E4B (NVIDIA) |
| Voice Input | Gemma 3n E4B (NVIDIA) | Gemma 3n E2B (NVIDIA) | — |
| Report Generation | Gemma 4 31B (Google) | Gemma 4 26B (Google) | GPT-OSS 120B (Groq) |
| AI Chatbot | GPT-OSS 20B (Groq) | GPT-OSS 120B (Groq) | Llama 3.3 70B (Groq) |

**Remaining models in fallback pool only:**
- Gemma 3 12B, Gemma 3 27B — SMS parsing fallbacks + general purpose
- Gemma 4 31B — receipt scanning fallback + report generation primary
- Gemma 3n E2B — voice fallback
- Llama 3.1 8B, Llama 3.3 70B — Groq-side fallbacks
- GPT-OSS 120B — chatbot fallback + report fallback

---

## File Input / Output Handling

None of the models accept raw PDF files directly. File handling is managed by FastAPI before and after model calls.

### Input Side (FastAPI pre-processing)

| Input Type | Handling |
|---|---|
| **Receipt image (JPG/PNG)** | Send directly to model as base64 image |
| **Receipt PDF** | Convert each page to image via `pdf2image` → send as image |
| **Voice memo (audio file)** | Send directly to NVIDIA Gemma 3n as audio |
| **Bank SMS (text)** | Send as plain text prompt |

### Output Side (FastAPI post-processing)

All models output **text only**. File generation happens in FastAPI after model response:

| Output Type | Handling |
|---|---|
| **Structured expense fields** | Parse JSON from model response → save to DB |
| **PDF report** | Model returns markdown/text → FastAPI renders PDF via `weasyprint` or `reportlab` |
| **Chat response** | Model returns text → stream to app via SSE |

---

## Architecture Notes

**All AI calls go through FastAPI — never directly from the app.**

```
React Native App
      ↓ HTTPS
FastAPI Backend
      ├── /ai/parse-sms      → Google AI Studio (Gemma 3 4B)
      ├── /ai/scan-receipt   → Google AI Studio (Gemma 4 26B)
      ├── /ai/parse-voice    → NVIDIA NIM (Gemma 3n E4B)
      ├── /ai/generate-report → Google AI Studio (Gemma 4 31B)
      └── /ai/chat           → Groq (GPT-OSS 20B)
```

**Why backend-only:**
- API keys never exposed to client
- Fallback logic centralised — one place to update
- Caching: merchant→category mappings cached in Postgres, repeat merchants never hit AI API
- Rate limit tracking across all users — prevent one user exhausting free tier for everyone

**Merchant caching (key optimisation):**
Once a merchant is categorised (e.g. "Swiggy" → Food & Dining), the result is stored in `merchant_category_mappings` table. Every subsequent Swiggy transaction skips the AI call entirely and uses the cached mapping. This dramatically reduces API usage for high-frequency merchants.

---

> *Document maintained as part of project planning. Last updated May 2026.*
