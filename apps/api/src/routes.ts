import { Router } from 'express';
import { z } from 'zod';
import { PERSONAS, getPersona } from './ledger/personas.js';
import { buildLedger } from './ledger/buildLedger.js';
import { assemble } from './runtime/assemble.js';
import { coverage, SCENARIOS, SEGMENTS, LOCALES, CHANNELS } from './runtime/coverage.js';
import { runFoundry } from './foundry/run.js';
import { getRepository, repositoryNote } from './store/index.js';
import { GATE_CATALOGUE, COMPOSITION_RULES } from './foundry/gates/index.js';
import { RULE_SETS } from './policy/engine.js';
import { activeProvider, getFlightSnapshot } from './integrations/flightStatus.js';
import { amadeusConfigured, aviationstackConfigured, contentstackConfigured, env, llmConfigured } from './env.js';
import type { Scenario, VariantKey } from './types.js';

export const router: Router = Router();

const scenarioSchema = z.enum(['cancellation', 'long_delay', 'denied_boarding', 'gate_change']);
const variantKeySchema = z.object({
  scenario: scenarioSchema,
  segment: z.enum(['platinum_solo', 'family_connecting', 'first_time_basic', 'inbound_transfer']),
  locale: z.enum(['en-IN', 'hi-IN', 'ja-JP']),
  channel: z.enum(['app', 'email', 'sms', 'web']),
});

function wrap(fn: (req: any, res: any) => Promise<unknown>) {
  return (req: any, res: any) => {
    fn(req, res).catch((err: Error) => {
      console.error('[contrail]', err);
      res.status(500).json({ error: err.message });
    });
  };
}

// ---------------------------------------------------------------- health ---
router.get(
  '/health',
  wrap(async (_req, res) => {
    const repo = await getRepository();
    const flight = await getFlightSnapshot();
    res.json({
      ok: true,
      time: new Date().toISOString(),
      subsystems: {
        // Key stays `amadeus` for wire compatibility with the frontend; the
        // provider that actually answered is named in `provider` and `detail`.
        amadeus: {
          mode: flight.live ? 'live' : 'fixture',
          provider: activeProvider(),
          configured: amadeusConfigured || aviationstackConfigured,
          detail: flight.sourceDetail,
          flight: flight.designator,
          status: flight.status,
        },
        contentstack: {
          mode: repo.kind,
          configured: contentstackConfigured,
          detail: repositoryNote(),
          contentType: env.contentstack.contentType,
        },
        llm: {
          mode: llmConfigured ? 'live' : 'deterministic',
          configured: llmConfigured,
          detail: llmConfigured
            ? `${env.llm.provider} generation with gate-enforced slots`
            : 'Deterministic composer — repeatable output, no key required',
        },
      },
    });
  }),
);

// -------------------------------------------------------------- personas ---
router.get('/personas', (_req, res) => {
  res.json({
    personas: PERSONAS.map((p) => ({
      id: p.id,
      name: p.name,
      headline: p.headline,
      mustDiffer: p.mustDiffer,
      segment: p.segment,
      locale: p.locale,
      channel: p.channel,
      tier: p.tier,
      partySize: p.partySize,
      regime: p.regime,
      fareBrand: p.fareBrand,
      accessibility: p.accessibility,
      hasOnwardConnection: Boolean(p.onwardConnection),
      pnr: p.pnr,
    })),
  });
});

// --------------------------------------------------------------- context ---
const contextSchema = z.object({
  passengerId: z.string(),
  scenario: scenarioSchema.default('cancellation'),
});

router.post(
  '/context',
  wrap(async (req, res) => {
    const { passengerId, scenario } = contextSchema.parse(req.body);
    const persona = getPersona(passengerId);
    if (!persona) return res.status(404).json({ error: `Unknown passenger ${passengerId}` });

    const { ledger, context, entitlement, flight } = await buildLedger(persona, scenario);
    res.json({
      context,
      facts: Object.values(ledger.facts),
      entitlement,
      flight: {
        designator: flight.designator,
        status: flight.status,
        live: flight.live,
        provider: flight.provider,
        sourceDetail: flight.sourceDetail,
        departure: flight.departure,
        arrival: flight.arrival,
        blockTimeMinutes: flight.blockTimeMinutes,
        rebookingOptions: flight.rebookingOptions,
      },
    });
  }),
);

// ---------------------------------------------------------------- render ---
const renderSchema = z.object({
  passengerId: z.string(),
  scenario: scenarioSchema.default('cancellation'),
  guardrails: z.boolean().default(true),
  autoFillGap: z.boolean().default(false),
});

router.post(
  '/render',
  wrap(async (req, res) => {
    const body = renderSchema.parse(req.body);
    const persona = getPersona(body.passengerId);
    if (!persona) return res.status(404).json({ error: `Unknown passenger ${body.passengerId}` });

    const result = await assemble(persona, body.scenario as Scenario, {
      guardrails: body.guardrails,
      autoFillGap: body.autoFillGap,
    });
    res.json(result);
  }),
);

/** Render the whole demo wall in one call — four passengers, one flight. */
router.post(
  '/render-all',
  wrap(async (req, res) => {
    const schema = z.object({
      scenario: scenarioSchema.default('cancellation'),
      guardrails: z.boolean().default(true),
      autoFillGap: z.boolean().default(false),
    });
    const body = schema.parse(req.body ?? {});
    const results = [];
    for (const persona of PERSONAS) {
      results.push({
        passengerId: persona.id,
        name: persona.name,
        headline: persona.headline,
        mustDiffer: persona.mustDiffer,
        result: await assemble(persona, body.scenario as Scenario, {
          guardrails: body.guardrails,
          autoFillGap: body.autoFillGap,
        }),
      });
    }
    res.json({ scenario: body.scenario, guardrails: body.guardrails, results });
  }),
);

// -------------------------------------------------------------- coverage ---
router.get('/coverage', wrap(async (_req, res) => res.json(await coverage())));

// --------------------------------------------------------------- foundry ---
const foundrySchema = z.object({
  keys: z.array(variantKeySchema).min(1).max(48).optional(),
  fillGaps: z.boolean().default(false),
  seedDemo: z.boolean().default(false),
});

router.post(
  '/foundry/run',
  wrap(async (req, res) => {
    const body = foundrySchema.parse(req.body ?? {});
    let keys: VariantKey[] = body.keys ?? [];

    if (body.seedDemo) keys = demoKeys();

    if (body.fillGaps) {
      const repo = await getRepository();
      const gaps = await repo.gaps();
      keys = [
        ...keys,
        ...gaps.map((g) => ({
          scenario: g.scenario,
          segment: g.segment,
          locale: g.locale,
          channel: g.channel,
        })),
      ];
    }

    if (!keys.length) return res.status(400).json({ error: 'Nothing to generate.' });

    const deduped = dedupe(keys).slice(0, 48);
    const outcomes = await runFoundry(deduped);
    res.json({
      requested: deduped.length,
      published: outcomes.filter((o) => o.published).length,
      escalated: outcomes.filter((o) => !o.published).length,
      outcomes,
    });
  }),
);

// -------------------------------------------------------------- variants ---
router.get(
  '/variants',
  wrap(async (_req, res) => {
    const repo = await getRepository();
    res.json({ repository: repo.kind, note: repositoryNote(), variants: await repo.list() });
  }),
);

router.post(
  '/variants/:uid/rollback',
  wrap(async (req, res) => {
    const repo = await getRepository();
    const restored = await repo.rollback(String(req.params.uid));
    if (!restored) return res.status(404).json({ error: 'No such variant, or no prior version.' });
    res.json({ variant: restored });
  }),
);

router.delete(
  '/variants',
  wrap(async (_req, res) => {
    const repo = await getRepository();
    const all = await repo.list();
    for (const v of all) await repo.remove(v.uid);
    res.json({ removed: all.length });
  }),
);

// ---------------------------------------------------------------- policy ---
router.get('/policy', (_req, res) => {
  res.json({
    gates: GATE_CATALOGUE,
    composition: COMPOSITION_RULES,
    regimes: RULE_SETS,
    dimensions: { scenarios: SCENARIOS, segments: SEGMENTS, locales: LOCALES, channels: CHANNELS },
  });
});

function demoKeys(): VariantKey[] {
  const keys: VariantKey[] = [];
  for (const p of PERSONAS) {
    keys.push({ scenario: 'cancellation', segment: p.segment, locale: p.locale, channel: p.channel });
  }
  // A little extra coverage so the heatmap is not all red on first run.
  keys.push({ scenario: 'cancellation', segment: 'platinum_solo', locale: 'hi-IN', channel: 'app' });
  keys.push({ scenario: 'cancellation', segment: 'first_time_basic', locale: 'en-IN', channel: 'app' });
  keys.push({ scenario: 'long_delay', segment: 'platinum_solo', locale: 'en-IN', channel: 'app' });
  keys.push({ scenario: 'long_delay', segment: 'family_connecting', locale: 'en-IN', channel: 'app' });
  keys.push({ scenario: 'cancellation', segment: 'platinum_solo', locale: 'en-IN', channel: 'sms' });
  return keys;
}

function dedupe(keys: VariantKey[]): VariantKey[] {
  const seen = new Set<string>();
  return keys.filter((k) => {
    const s = `${k.scenario}|${k.segment}|${k.locale}|${k.channel}`;
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}
