import type { AppConfig } from '../../core/env';
import { parseWithFallback } from './deepseek';
import { PermanentAiError, TransientAiError } from './errors';
import { extractReceiptText, transcribeAudio } from './groq';
import type { ReceiptImage } from './groq';
import type { CategoryOption, ParsedExpense } from './parse-output';

/**
 * The AI orchestration used by the ingest consumer (and reusable by the agent): media -> text with
 * Groq, text -> structured expense with DeepSeek. Provider detail stays in the logs; the errors
 * thrown here carry generic messages (S9).
 */
export interface CategoryContext {
  allowedCategories: readonly string[];
  categoryOptions: readonly CategoryOption[];
}

type AiConfig = Pick<AppConfig, 'ai' | 'groq'>;

export async function parseReceipt(config: AiConfig, image: ReceiptImage, categories: CategoryContext): Promise<ParsedExpense> {
  let text: string;
  try {
    text = await extractReceiptText(config.groq, config.ai, image);
  } catch (err) {
    throw relabel(err, 'Could not read text from the uploaded receipt.');
  }
  return parseWithFallback(config.ai, { mode: 'receipt', text, ...categories });
}

export async function parseVoice(config: AiConfig, audio: Uint8Array, mimeType: string, categories: CategoryContext): Promise<ParsedExpense> {
  let text: string;
  try {
    text = await transcribeAudio(config.groq, config.ai, audio, mimeType);
  } catch (err) {
    throw relabel(err, 'Could not transcribe the uploaded audio.');
  }
  return parseWithFallback(config.ai, { mode: 'voice', text, ...categories });
}

export function parseSms(config: AiConfig, body: string, categories: CategoryContext): Promise<ParsedExpense> {
  return parseWithFallback(config.ai, { mode: 'sms', text: body, ...categories });
}

/** Keep the transient/permanent classification but replace the message with a client-safe one. */
function relabel(err: unknown, message: string): Error {
  if (err instanceof TransientAiError) return new TransientAiError(message, { cause: err });
  if (err instanceof PermanentAiError) return new PermanentAiError(message, { cause: err });
  return err instanceof Error ? err : new Error(String(err));
}
