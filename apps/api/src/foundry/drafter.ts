import type { FactsLedger, Locale, VariantKey } from '../types.js';
import { composeSlottedBody, TONE_BY_SEGMENT } from './blocks.js';
import { complete } from '../integrations/llm.js';
import { extractSlots } from '../runtime/hydrate.js';

export const PROMPT_VERSION = 'contrail-drafter@2026.09.1';

export interface DraftInput {
  key: VariantKey;
  ledger: FactsLedger;
  entitlementApplies: boolean;
  needsAssistance: boolean;
  hasConnection: boolean;
}

export interface Draft {
  slottedBody: string;
  provider: string;
  model: string;
  deterministic: boolean;
  promptVersion: string;
  attempts: number;
  fellBackToTemplate: boolean;
}

const SYSTEM = `You write customer-facing airline disruption copy for a governed content pipeline.

ABSOLUTE CONSTRAINTS — output that breaks any of these is discarded by an automated gate:
1. You may NEVER write a literal number, time, date, currency amount, flight number or booking reference. Not one digit.
2. Every fact must be expressed as a slot: {{slot.name}}. You may only use slots from the ALLOWED SLOTS list.
3. If a fact you want is not in the list, restructure the sentence. Do not invent a slot.
4. Where a compensation entitlement applies, state it before any commercial offer.
5. End with exactly one next action, expressed as {{cta.label}}.
6. Do not tell the passenger to submit or file a claim.
7. Write in the requested locale. Leave airport codes, flight designators and legal instrument names to their slots.

Return ONLY the message body. No preamble, no explanation, no markdown fences.`;

/**
 * Governed draft. Tries the model when one is configured, validates the shape
 * of what comes back, and falls back to deterministic composition otherwise.
 * The fallback is not a degraded mode — it is the demo-safe default.
 */
export async function draft(input: DraftInput): Promise<Draft> {
  const template = composeSlottedBody({
    scenario: input.key.scenario,
    segment: input.key.segment,
    locale: input.key.locale,
    channel: input.key.channel,
    entitlementApplies: input.entitlementApplies,
    needsAssistance: input.needsAssistance,
    hasConnection: input.hasConnection,
  });

  const allowed = Object.keys(input.ledger.facts);

  const user = [
    `LOCALE: ${input.key.locale}`,
    `SCENARIO: ${input.key.scenario}`,
    `SEGMENT: ${input.key.segment} (tone: ${TONE_BY_SEGMENT[input.key.segment]})`,
    `CHANNEL: ${input.key.channel}`,
    `ENTITLEMENT APPLIES: ${input.entitlementApplies}`,
    `MUST ADDRESS ASSISTANCE: ${input.needsAssistance}`,
    `MUST ADDRESS ONWARD CONNECTION: ${input.hasConnection}`,
    '',
    'ALLOWED SLOTS:',
    ...allowed.map((s) => `  {{${s}}}`),
    '',
    'A known-good variant for a neighbouring combination, for reference only:',
    template,
  ].join('\n');

  const res = await complete(SYSTEM, user);

  if (res && looksValid(res.text, allowed, input.key.locale)) {
    return {
      slottedBody: res.text,
      provider: res.provider,
      model: res.model,
      deterministic: false,
      promptVersion: PROMPT_VERSION,
      attempts: 1,
      fellBackToTemplate: false,
    };
  }

  return {
    slottedBody: template,
    provider: 'contrail',
    model: 'deterministic-composer',
    deterministic: true,
    promptVersion: PROMPT_VERSION,
    attempts: res ? 2 : 1,
    fellBackToTemplate: Boolean(res),
  };
}

/** Cheap pre-gate sanity check so obviously broken model output never enters the pipeline. */
function looksValid(text: string, allowed: string[], _locale: Locale): boolean {
  if (!text || text.length < 40 || text.length > 2400) return false;
  if (text.includes('```')) return false;
  const slots = extractSlots(text);
  if (!slots.length) return false;
  return slots.every((s) => allowed.includes(s));
}
