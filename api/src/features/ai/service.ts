import type { AppConfig } from '../../core/env';
import { parseWithFallback } from './deepseek';
import { PermanentAiError, TransientAiError } from './errors';
import { extractReceiptText, transcribeAudio } from './workers-ai';
import type { ReceiptImage, WorkersAiClient } from './workers-ai';
import type { CategoryOption, ParsedExpense } from './parse-output';
import type { DateReference } from './prompts';

/**
 * The AI orchestration used by the ingest consumer (and reusable by the agent): media -> text with
 * Workers AI, text -> structured expense with DeepSeek. Provider detail stays in the logs; the errors
 * thrown here carry generic messages (S9).
 */
export interface CategoryContext {
  allowedCategories: readonly string[];
  categoryOptions: readonly CategoryOption[];
}

type AiConfig = Pick<AppConfig, 'ai'>;

export async function parseReceipt(config: AiConfig, workersAi: WorkersAiClient, image: ReceiptImage, categories: CategoryContext, reference?: DateReference): Promise<ParsedExpense> {
  let text: string;
  try {
    text = await extractReceiptText(workersAi, image);
  } catch (err) {
    throw relabel(err, 'Could not read text from the uploaded receipt.');
  }
  return parseWithFallback(config.ai, { mode: 'receipt', text, ...categories, reference });
}

export async function parseVoice(
  config: AiConfig,
  workersAi: WorkersAiClient,
  audio: Uint8Array,
  mimeType: string,
  categories: CategoryContext,
  reference?: DateReference,
): Promise<ParsedExpense> {
  let text: string;
  try {
    text = await transcribeAudio(workersAi, audio, mimeType);
  } catch (err) {
    throw relabel(err, 'Could not transcribe the uploaded audio.');
  }
  return parseWithFallback(config.ai, { mode: 'voice', text, ...categories, reference });
}

/** Keep the transient/permanent classification but replace the message with a client-safe one. */
function relabel(err: unknown, message: string): Error {
  if (err instanceof TransientAiError) return new TransientAiError(message, { cause: err });
  if (err instanceof PermanentAiError) return new PermanentAiError(message, { cause: err });
  return err instanceof Error ? err : new Error(String(err));
}
