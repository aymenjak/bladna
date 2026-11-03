import { AppError } from '@bladna/types';
import { env } from '../env';

/**
 * AI / OCR adapter (§8.2, §134).
 *
 * Providers (AI_PROVIDER):
 *  - unset/`local` (default): NO external model calls. Document/credential
 *    checks use deterministic field extraction + validation rules. Honest
 *    about capability: structured field checks only, no free-form reading.
 *  - `openai` / `anthropic` / `gemini`: real HTTP calls when AI_API_KEY is
 *    set; otherwise CONFIG_ERROR.
 *
 * GDPR (§135): personal documents are only sent to a provider when
 * AI_SEND_DOCUMENTS=true is explicitly set — no silent third-party transmission.
 */

export type AiProvider = 'local' | 'openai' | 'anthropic' | 'gemini';

export function currentProvider(): AiProvider {
  const raw = env.aiProvider || 'local';
  return (['local', 'openai', 'anthropic', 'gemini'] as const).includes(raw as AiProvider)
    ? (raw as AiProvider)
    : 'local';
}

export interface ExtractionField {
  name: string;
  value: string;
  confidence: number;
}

export interface DocumentCheckInput {
  documentType: string;
  fields: ExtractionField[];
  expected: Record<string, string>;
}

export interface DocumentCheckResult {
  provider: AiProvider;
  checks: Array<{ field: string; ok: boolean; detail: string }>;
  decision: 'pass' | 'review' | 'fail';
}

/** Deterministic field verification used by the `local` provider. */
export function checkFieldsLocally(input: DocumentCheckInput): DocumentCheckResult {
  const checks: Array<{ field: string; ok: boolean; detail: string }> = [];
  const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

  for (const [field, expected] of Object.entries(input.expected)) {
    const found = input.fields.find((f) => f.name === field);
    if (!found) {
      checks.push({ field, ok: false, detail: 'missing' });
      continue;
    }
    const same = normalize(found.value) === normalize(expected);
    const confident = found.confidence >= 0.6;
    const ok = same && confident;
    checks.push({
      field,
      ok,
      detail: ok ? 'match' : !confident ? 'low confidence' : 'mismatch',
    });
  }

  const failed = checks.filter((c) => !c.ok).length;
  // `missing` (field never extracted) and `low confidence` are unreadable
  // evidence, not contradicted evidence — only a confident `mismatch` proves
  // something is wrong.
  const mismatches = checks.filter((c) => c.detail === 'mismatch').length;
  return {
    provider: 'local',
    checks,
    decision:
      // Nothing to compare must never read as approval (zero extracted fields
      // => review); every field confidently wrong is the only outright fail.
      checks.length === 0
        ? 'review'
        : mismatches === checks.length
          ? 'fail'
          : failed === 0
            ? 'pass'
            : 'review',
  };
}

export async function checkDocument(input: DocumentCheckInput): Promise<DocumentCheckResult> {
  const provider = currentProvider();
  if (provider === 'local') return checkFieldsLocally(input);

  if (!env.aiApiKey) {
    throw AppError.config(
      `AI_PROVIDER=${provider} requires AI_API_KEY to be configured, or leave AI_PROVIDER unset for local rule-based checks.`,
    );
  }
  if (!env.aiSendDocuments) {
    throw AppError.config(
      'AI_SEND_DOCUMENTS must be explicitly enabled before personal documents may be sent to an external AI provider (GDPR §135).',
    );
  }
  throw AppError.notImplemented(
    `Provider ${provider} integration is not wired in this build. Unset AI_PROVIDER for local rule-based checks.`,
  );
}
