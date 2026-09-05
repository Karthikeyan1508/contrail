import type { FactsLedger, GateResult, Locale, Preconditions, TravellerContext } from '../../types.js';
import { claimCheck } from './claimCheck.js';
import { policyCheck, policyContextFrom } from './policyCheck.js';
import { brandCheck } from './brandCheck.js';
import { localeCheck } from './localeCheck.js';
import { adversarialCheck } from './adversarialCheck.js';

export { COMPOSITION_RULES } from './policyCheck.js';

export interface GateInput {
  body: string;
  ledger: FactsLedger;
  context: TravellerContext;
  entitlementApplies: boolean;
  locale: Locale;
  referenceLength: number;
  preconditions: Preconditions;
}

export interface GateRun {
  gates: GateResult[];
  passed: boolean;
  firstFailure: GateResult | null;
}

export const GATE_CATALOGUE = [
  { id: 'G01', name: 'Claim check', blurb: 'Every assertion resolves to a ledger slot. No literal facts in copy.' },
  { id: 'G02', name: 'Policy as code', blurb: 'Declarative regulatory and composition rules, reviewed once by legal.' },
  { id: 'G03', name: 'Brand and tone', blurb: 'Banned phrases, sentence ceilings, a required next action.' },
  { id: 'G04', name: 'Locale integrity', blurb: 'Script presence, untranslated-run detection, length drift.' },
  { id: 'G05', name: 'Adversarial pass', blurb: 'Renders against degenerate world states and checks it still reads true.' },
] as const;

/** Runs all five gates in order. Never throws — a gate crash is a gate failure. */
export function runGates(input: GateInput): GateRun {
  const gates: GateResult[] = [];
  const allowlist = Object.keys(input.ledger.facts);

  gates.push(safe('G01', 'Claim check', () => claimCheck(input.body, allowlist)));
  gates.push(
    safe('G02', 'Policy as code', () =>
      policyCheck(input.body, policyContextFrom(input.context, input.entitlementApplies)),
    ),
  );
  gates.push(safe('G03', 'Brand and tone', () => brandCheck(input.body, input.locale)));
  gates.push(
    safe('G04', 'Locale integrity', () =>
      localeCheck(input.body, input.locale, input.referenceLength),
    ),
  );
  gates.push(
    safe('G05', 'Adversarial pass', () =>
      adversarialCheck(input.body, input.ledger, input.preconditions),
    ),
  );

  const firstFailure = gates.find((g) => g.status === 'fail') ?? null;
  return { gates, passed: !firstFailure, firstFailure };
}

function safe(id: string, name: string, fn: () => GateResult): GateResult {
  try {
    return fn();
  } catch (err) {
    return {
      id,
      name,
      status: 'fail',
      ms: 0,
      findings: [
        {
          code: 'GATE_ERROR',
          message: `Gate threw: ${(err as Error).message}. A gate that cannot run is a gate that failed.`,
        },
      ],
    };
  }
}
