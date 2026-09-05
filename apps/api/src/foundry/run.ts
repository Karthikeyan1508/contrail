import { randomUUID } from 'node:crypto';
import type { GateResult, Preconditions, Variant, VariantKey } from '../types.js';
import { buildLedger } from '../ledger/buildLedger.js';
import { syntheticPersona } from '../ledger/synthetic.js';
import { getRepository } from '../store/index.js';
import { variantAlias } from '../store/repository.js';
import { draft } from './drafter.js';
import { runGates } from './gates/index.js';
import { extractSlots, literalText } from '../runtime/hydrate.js';
import { safeFallbackBody } from './blocks.js';

export interface FoundryOutcome {
  key: VariantKey;
  combination: string;
  published: boolean;
  gates: GateResult[];
  slottedBody: string;
  variantUid: string | null;
  variantAlias: string;
  attempts: number;
  deterministic: boolean;
  model: string;
  ms: number;
  reason?: string;
}

const MAX_ATTEMPTS = 2;

/**
 * Generate → gate → publish, for one combination.
 *
 * On failure the draft goes back to the drafter annotated with the rules it
 * violated. After MAX_ATTEMPTS the combination is left uncovered and escalates
 * to the human review queue, which is exactly what should happen.
 */
export async function generateAndPublish(key: VariantKey): Promise<FoundryOutcome> {
  const t0 = performance.now();
  const persona = syntheticPersona(key);
  const { ledger, context, entitlement } = await buildLedger(persona, key.scenario);
  const repo = await getRepository();

  const referenceLength = literalText(safeFallbackBody('en-IN')).trim().length;

  const preconditions: Preconditions = {
    entitlementApplies: entitlement.applies,
    rebookingAvailable: Boolean(ledger.facts['rebooking.option_1.number']?.display),
    assistanceRequired: persona.accessibility.length > 0,
    connectionPresent: Boolean(persona.onwardConnection),
  };

  let last: { body: string; gates: GateResult[]; model: string; deterministic: boolean } | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const d = await draft({
      key,
      ledger,
      entitlementApplies: entitlement.applies,
      needsAssistance: persona.accessibility.length > 0,
      hasConnection: Boolean(persona.onwardConnection),
    });

    const run = runGates({
      body: d.slottedBody,
      ledger,
      context,
      entitlementApplies: entitlement.applies,
      locale: key.locale,
      referenceLength,
      preconditions,
    });

    last = { body: d.slottedBody, gates: run.gates, model: d.model, deterministic: d.deterministic };

    if (run.passed) {
      const variant: Variant = {
        uid: randomUUID(),
        key,
        preconditions,
        slottedBody: d.slottedBody,
        slots: extractSlots(d.slottedBody),
        version: 1,
        status: 'published',
        variantAlias: variantAlias(key),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: [],
        provenance: {
          model: {
            provider: d.provider,
            name: d.model,
            promptVersion: d.promptVersion,
            generatedAt: new Date().toISOString(),
            deterministic: d.deterministic,
          },
          gates: run.gates,
          approval: {
            by: 'contrail-foundry (automated, policy-bound)',
            at: new Date().toISOString(),
            entryUid: '',
            version: 1,
            repository: repo.kind,
          },
        },
      };

      const saved = await repo.upsert(variant);
      saved.provenance.approval.entryUid = saved.uid;
      saved.provenance.approval.version = saved.version;

      return {
        key,
        combination: `${key.scenario}|${key.segment}|${key.locale}|${key.channel}`,
        published: true,
        gates: run.gates,
        slottedBody: saved.slottedBody,
        variantUid: saved.uid,
        variantAlias: saved.variantAlias,
        attempts: attempt,
        deterministic: d.deterministic,
        model: d.model,
        ms: Math.round(performance.now() - t0),
      };
    }
  }

  return {
    key,
    combination: `${key.scenario}|${key.segment}|${key.locale}|${key.channel}`,
    published: false,
    gates: last?.gates ?? [],
    slottedBody: last?.body ?? '',
    variantUid: null,
    variantAlias: variantAlias(key),
    attempts: MAX_ATTEMPTS,
    deterministic: last?.deterministic ?? true,
    model: last?.model ?? 'unknown',
    ms: Math.round(performance.now() - t0),
    reason: 'Escalated to human review — gates could not be satisfied within the retry budget.',
  };
}

export async function runFoundry(keys: VariantKey[]): Promise<FoundryOutcome[]> {
  const out: FoundryOutcome[] = [];
  for (const key of keys) out.push(await generateAndPublish(key));
  return out;
}
