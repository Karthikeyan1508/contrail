import type {
  BlockedInfo,
  Persona,
  Preconditions,
  RenderProvenance,
  RenderResult,
  Scenario,
  UngovernedInfo,
  Variant,
  VariantKey,
} from '../types.js';
import { buildLedger } from '../ledger/buildLedger.js';
import { getRepository } from '../store/index.js';
import { hydrate, extractSlots, literalText } from './hydrate.js';
import { runGates } from '../foundry/gates/index.js';
import { rogueFactualErrors, rogueOutput } from '../foundry/rogue.js';
import { safeFallbackBody } from '../foundry/blocks.js';
import { generateAndPublish } from '../foundry/run.js';
import { variantAlias } from '../store/repository.js';
import { resolvePersonalize } from '../integrations/personalize.js';

export interface AssembleOptions {
  guardrails: boolean;
  /** Close a coverage gap on demand instead of falling back. Demo gold. */
  autoFillGap?: boolean;
}

/**
 * THE RUNTIME PATH.
 *
 * No inference happens here. Select a pre-approved variant, hydrate its slots
 * from the ledger, log a receipt. Single-digit milliseconds, cacheable, and
 * incapable of saying anything that was not approved.
 */
export async function assemble(
  persona: Persona,
  scenario: Scenario,
  opts: AssembleOptions,
): Promise<RenderResult> {
  const tStart = performance.now();
  const { ledger, context, entitlement, flight } = await buildLedger(persona, scenario);
  const repo = await getRepository();

  const key: VariantKey = {
    scenario,
    segment: persona.segment,
    locale: persona.locale,
    channel: persona.channel,
  };

  // Runtime always records what it was asked for. This IS the gap queue.
  await repo.observe(key);

  const live: Preconditions = {
    entitlementApplies: entitlement.applies,
    rebookingAvailable: Boolean(ledger.facts['rebooking.option_1.number']?.display),
    assistanceRequired: persona.accessibility.length > 0,
    connectionPresent: Boolean(persona.onwardConnection),
  };

  const tSelect = performance.now();
  let variant: Variant | null = await repo.get(key);
  let fallbackUsed = false;
  let preconditionMismatch: string[] = [];

  if (!variant && opts.autoFillGap) {
    const outcome = await generateAndPublish(key);
    if (outcome.published) variant = await repo.get(key);
  }

  // A variant is only showable in the world state it was authored for.
  if (variant) {
    preconditionMismatch = comparePreconditions(variant.preconditions, live);
    if (preconditionMismatch.length) variant = null;
  }

  if (!variant) {
    fallbackUsed = true;
    const body = safeFallbackBody(persona.locale, scenario);
    variant = {
      uid: 'safe-fallback',
      key,
      preconditions: live,
      slottedBody: body,
      slots: extractSlots(body),
      version: 0,
      status: 'published',
      variantAlias: `${variantAlias(key)}__fallback`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
      provenance: {
        model: {
          provider: 'human',
          name: 'pre-approved safe fallback',
          promptVersion: 'n/a',
          generatedAt: new Date().toISOString(),
          deterministic: true,
        },
        gates: [],
        approval: {
          by: 'content operations (standing approval)',
          at: new Date().toISOString(),
          entryUid: 'safe-fallback',
          version: 0,
          repository: repo.kind,
        },
      },
    };
  }
  const selectMs = round(performance.now() - tSelect);

  const tHydrate = performance.now();
  const hydrated = hydrate(variant.slottedBody, ledger);
  const hydrateMs = round(performance.now() - tHydrate);

  // Always evaluate the ungoverned candidate so the UI can show, on the same
  // screen, exactly what the gates stopped.
  const rogueText = rogueOutput(persona.segment, persona.locale);
  const rogueRun = runGates({
    body: rogueText,
    ledger,
    context,
    entitlementApplies: entitlement.applies,
    locale: persona.locale,
    referenceLength: literalText(safeFallbackBody('en-IN')).trim().length,
    // The ungoverned candidate declares nothing, so every adversarial case runs.
    preconditions: {
      entitlementApplies: false,
      rebookingAvailable: false,
      assistanceRequired: false,
      connectionPresent: false,
    },
  });

  const ungoverned: UngovernedInfo = {
    text: rogueText,
    gates: rogueRun.gates,
    totalFindings: rogueRun.gates.reduce((n, g) => n + g.findings.length, 0),
    factualErrors: rogueFactualErrors(entitlement.display, entitlement.ruleName),
  };

  const provenance: RenderProvenance = {
    facts: hydrated.used,
    rule: entitlement.applies
      ? {
          id: entitlement.ruleId,
          name: entitlement.ruleName,
          citation: entitlement.citation,
          computedValue: entitlement.display,
          reasoning: entitlement.reasoning,
        }
      : null,
    model: variant.provenance.model,
    gates: variant.provenance.gates,
    approval: { ...variant.provenance.approval, entryUid: variant.uid, version: variant.version },
    variant: {
      uid: variant.uid,
      alias: variant.variantAlias,
      version: variant.version,
      key: variant.key,
      slottedBody: variant.slottedBody,
    },
    personalize: resolvePersonalize(scenario, persona.channel, context.audiences),
    timings: { selectMs, hydrateMs, totalMs: round(performance.now() - tStart) },
    fallbackUsed,
    preconditionMismatch,
  };

  const blocked: BlockedInfo | null = rogueRun.firstFailure
    ? {
        gate: rogueRun.firstFailure.name,
        gateId: rogueRun.firstFailure.id,
        rule:
          rogueRun.firstFailure.findings[0]?.ruleId ??
          rogueRun.firstFailure.findings[0]?.code ??
          'unknown',
        findings: rogueRun.gates.flatMap((g) => g.findings),
        rawOutput: rogueText,
        gates: rogueRun.gates,
      }
    : null;

  const flightMeta = {
    designator: flight.designator,
    live: flight.live,
    provider: flight.provider,
    sourceDetail: flight.sourceDetail,
    status: flight.status,
  };

  if (!opts.guardrails) {
    return {
      message: rogueText,
      blocked: null,
      provenance: null,
      ungoverned,
      guardrails: false,
      context,
      entitlement,
      flight: flightMeta,
    };
  }

  return {
    message: hydrated.text,
    blocked,
    provenance,
    ungoverned,
    guardrails: true,
    context,
    entitlement,
    flight: flightMeta,
  };
}

function comparePreconditions(authored: Preconditions, live: Preconditions): string[] {
  const out: string[] = [];
  for (const k of Object.keys(live) as Array<keyof Preconditions>) {
    if (authored[k] !== live[k]) {
      out.push(`${k}: variant authored for ${authored[k]}, world state is ${live[k]}`);
    }
  }
  return out;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
