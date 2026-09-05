import type { Fact, FactsLedger, Finding, GateResult, Preconditions } from '../../types.js';
import { hydrate } from '../../runtime/hydrate.js';

/**
 * GATE 05 — adversarial pass.
 *
 * Renders the variant against deliberately degenerate states of the world and
 * asserts the output is still true and still reads like a sentence.
 *
 * Cases that contradict the variant's declared preconditions are skipped, not
 * because they do not matter, but because the runtime refuses to select this
 * variant in those states. That is enforced in assemble(), not assumed here.
 */

interface Case {
  id: string;
  label: string;
  /** Skip when the variant declares this state unreachable. */
  skipWhen?: (p: Preconditions) => boolean;
  /** Facts this case deliberately removes, so their absence is not a finding. */
  expectMissing?: string[];
  mutate: (l: FactsLedger) => FactsLedger;
}

const CASES: Case[] = [
  {
    id: 'ADV-NO-COMP',
    label: 'No compensation due',
    skipWhen: (p) => p.entitlementApplies,
    mutate: (l) =>
      patch(l, {
        'entitlement.amount': { value: 0, display: 'no cash compensation' },
      }),
  },
  {
    id: 'ADV-NO-INVENTORY',
    label: 'No re-accommodation inventory',
    skipWhen: (p) => p.rebookingAvailable,
    mutate: (l) =>
      patch(l, {
        'rebooking.option_1.number': { value: '', display: '' },
        'rebooking.option_1.dep_time': { value: '', display: '' },
        'rebooking.option_1.arr_time': { value: '', display: '' },
      }),
  },
  {
    id: 'ADV-SOLO',
    label: 'Party of one on a group template',
    mutate: (l) =>
      patch(l, {
        'party.size': { value: 1, display: '1' },
        'party.size_words': { value: 1, display: 'one' },
      }),
  },
  {
    id: 'ADV-NO-ASSIST',
    label: 'Assistance request absent',
    skipWhen: (p) => p.assistanceRequired,
    mutate: (l) => patch(l, { 'assistance.status': { value: false, display: '' } }),
  },
  {
    id: 'ADV-NO-CONNECTION',
    label: 'Onward connection absent',
    skipWhen: (p) => p.connectionPresent,
    mutate: (l) => patch(l, { 'connection.status': { value: 'none', display: '' } }),
  },
  {
    id: 'ADV-MISSING-FACT',
    label: 'Optional upstream fact unavailable',
    expectMissing: ['loyalty.tier'],
    mutate: (l) => {
      const clone = structuredClone(l);
      delete clone.facts['loyalty.tier'];
      return clone;
    },
  },
  {
    id: 'ADV-LONG-VALUE',
    label: 'Unusually long fact value',
    mutate: (l) =>
      patch(l, {
        'flight.arrival_city': {
          value: 'x',
          display: 'Thiruvananthapuram International (Trivandrum)',
        },
      }),
  },
];

const BAD_TOKENS = ['undefined', 'null', 'NaN', '[object Object]', '{{', '}}'];

export function adversarialCheck(
  body: string,
  ledger: FactsLedger,
  pre: Preconditions,
): GateResult {
  const t0 = performance.now();
  const findings: Finding[] = [];
  let ran = 0;

  for (const c of CASES) {
    if (c.skipWhen?.(pre)) continue;
    ran++;

    const { text, unresolved, emptyInline } = hydrate(body, c.mutate(ledger));
    const expected = new Set(c.expectMissing ?? []);

    for (const slot of unresolved) {
      if (expected.has(slot)) continue;
      findings.push({
        code: 'UNRESOLVED_SLOT',
        message: `${c.label}: {{${slot}}} is not in the ledger and would render as nothing.`,
        evidence: c.id,
      });
    }

    for (const slot of emptyInline) {
      findings.push({
        code: 'INLINE_EMPTY_SLOT',
        message: `${c.label}: {{${slot}}} renders empty mid-sentence, leaving a hole in the copy. Put optional blocks on their own paragraph.`,
        evidence: c.id,
      });
    }

    for (const bad of BAD_TOKENS) {
      if (text.includes(bad)) {
        findings.push({
          code: 'RENDER_ARTEFACT',
          message: `${c.label}: output contains "${bad}".`,
          evidence: c.id,
        });
      }
    }

    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (/^[.,;:—、。]/.test(t)) {
        findings.push({
          code: 'DANGLING_PUNCTUATION',
          message: `${c.label}: a line begins with punctuation because a slot rendered empty.`,
          evidence: t.slice(0, 60),
        });
      }
    }

    if (/\b(entitled to|compensation of)\s+no cash compensation\b/i.test(text)) {
      findings.push({
        code: 'NONSENSE_ENTITLEMENT',
        message: `${c.label}: copy asserts an entitlement while the resolved amount is nil.`,
        evidence: c.id,
      });
    }
  }

  return {
    id: 'G05',
    name: 'Adversarial pass',
    status: findings.length ? 'fail' : 'pass',
    ms: Math.round((performance.now() - t0) * 100) / 100,
    findings: dedupe(findings),
  };
}

function dedupe(f: Finding[]): Finding[] {
  const seen = new Set<string>();
  return f.filter((x) => {
    const k = `${x.code}|${x.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function patch(
  ledger: FactsLedger,
  changes: Record<string, Partial<Pick<Fact, 'value' | 'display'>>>,
): FactsLedger {
  const clone = structuredClone(ledger);
  for (const [key, change] of Object.entries(changes)) {
    const existing = clone.facts[key];
    if (existing) Object.assign(existing, change);
  }
  return clone;
}
