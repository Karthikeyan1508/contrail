import type {
  Entitlement,
  Persona,
  Regime,
  Scenario,
} from '../types.js';
import dgca from './dgca.rules.json' with { type: 'json' };
import eu261 from './eu261.rules.json' with { type: 'json' };

export const RULE_SETS = { DGCA: dgca, EU261: eu261 } as const;

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const EUR = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export interface EntitlementInput {
  regime: Regime;
  scenario: Scenario;
  noticeMinutes: number;
  blockTimeMinutes: number;
  distanceKm: number;
  delayMinutes: number;
  scheduledDepartureHour: number;
}

/**
 * Deterministic entitlement resolution. Produces the amount AND the audit
 * trail that produced it — the trail is what the provenance drawer renders.
 */
export function resolveEntitlement(input: EntitlementInput): Entitlement {
  const reasoning: string[] = [];

  if (input.regime === 'EU261') {
    const set = eu261;
    reasoning.push(
      `Applicable instrument: ${set.instrument} (passenger itinerary engages EU jurisdiction).`,
    );

    const band = pickNoticeBand(set.cancellation.noticeBands, input.noticeMinutes);
    reasoning.push(
      `Notice given: ${formatMinutes(input.noticeMinutes)} before scheduled departure → band ${band.id} (${band.name}).`,
    );

    if (!band.compensable || input.scenario !== 'cancellation') {
      reasoning.push('Band is not compensable. Duty of care still applies.');
      return {
        applies: false,
        amount: 0,
        currency: 'EUR',
        display: 'no cash compensation',
        ruleId: band.id,
        ruleName: band.name,
        citation: set.citation,
        settlementDays: set.settlementDays,
        reasoning,
        dutyOfCare: dutyOfCare(set.dutyOfCare, input.delayMinutes, input.scheduledDepartureHour),
      };
    }

    const tier =
      set.cancellation.distanceTiers.find(
        (t) => t.maxDistanceKm !== null && input.distanceKm <= t.maxDistanceKm,
      ) ?? set.cancellation.distanceTiers[set.cancellation.distanceTiers.length - 1]!;

    reasoning.push(
      `Great-circle distance ${input.distanceKm.toLocaleString('en-IE')} km → tier ${tier.id} (${tier.label}).`,
    );
    reasoning.push(`Amount set by ${set.compensationArticle}.`);
    reasoning.push(`Compensation resolved: ${EUR.format(tier.amount)}.`);

    return {
      applies: true,
      amount: tier.amount,
      currency: 'EUR',
      display: EUR.format(tier.amount),
      ruleId: `${band.id}/${tier.id}`,
      ruleName: set.instrument,
      citation: set.citation,
      settlementDays: set.settlementDays,
      reasoning,
      dutyOfCare: dutyOfCare(set.dutyOfCare, input.delayMinutes, input.scheduledDepartureHour),
    };
  }

  // ---- DGCA -------------------------------------------------------------
  const set = dgca;
  reasoning.push(`Applicable instrument: ${set.instrument} (domestic Indian sector).`);

  if (input.scenario === 'denied_boarding') {
    const tier = set.deniedBoarding.tiers[1]!;
    reasoning.push(`Denied boarding tier ${tier.id} (${tier.label}).`);
    return {
      applies: tier.amount > 0,
      amount: tier.amount,
      currency: 'INR',
      display: INR.format(tier.amount),
      ruleId: tier.id,
      ruleName: set.instrument,
      citation: set.citation,
      settlementDays: set.settlementDays,
      reasoning,
      dutyOfCare: dutyOfCare(set.dutyOfCare, input.delayMinutes, input.scheduledDepartureHour),
    };
  }

  const band = pickNoticeBand(set.cancellation.noticeBands, input.noticeMinutes);
  reasoning.push(
    `Notice given: ${formatMinutes(input.noticeMinutes)} before scheduled departure → band ${band.id} (${band.name}).`,
  );

  if (!band.compensable || input.scenario !== 'cancellation') {
    reasoning.push('Band is not compensable. Duty of care still applies.');
    return {
      applies: false,
      amount: 0,
      currency: 'INR',
      display: 'no cash compensation',
      ruleId: band.id,
      ruleName: band.name,
      citation: set.citation,
      settlementDays: set.settlementDays,
      reasoning,
      dutyOfCare: dutyOfCare(set.dutyOfCare, input.delayMinutes, input.scheduledDepartureHour),
    };
  }

  const tier =
    set.cancellation.blockTimeTiers.find(
      (t) => t.maxBlockMinutes !== null && input.blockTimeMinutes <= t.maxBlockMinutes,
    ) ?? set.cancellation.blockTimeTiers[set.cancellation.blockTimeTiers.length - 1]!;

  reasoning.push(
    `Scheduled block time ${formatMinutes(input.blockTimeMinutes)} → tier ${tier.id} (${tier.label}).`,
  );
  reasoning.push(set.amountBasis);
  reasoning.push(`Compensation resolved: ${INR.format(tier.amount)}.`);

  return {
    applies: true,
    amount: tier.amount,
    currency: 'INR',
    display: INR.format(tier.amount),
    ruleId: `${band.id}/${tier.id}`,
    ruleName: set.instrument,
    citation: set.citation,
    settlementDays: set.settlementDays,
    reasoning,
    dutyOfCare: dutyOfCare(set.dutyOfCare, input.delayMinutes, input.scheduledDepartureHour),
  };
}

interface NoticeBand {
  id: string;
  name: string;
  minNoticeMinutes: number;
  compensable: boolean;
  note: string;
}

function pickNoticeBand(bands: NoticeBand[], noticeMinutes: number): NoticeBand {
  const sorted = [...bands].sort((a, b) => b.minNoticeMinutes - a.minNoticeMinutes);
  return sorted.find((b) => noticeMinutes >= b.minNoticeMinutes) ?? sorted[sorted.length - 1]!;
}

interface DutyRule {
  id: string;
  afterMinutes: number;
  provision: string;
  nightOnly?: boolean;
}

function dutyOfCare(rules: DutyRule[], delayMinutes: number, hour: number): string[] {
  return rules
    .filter((r) => delayMinutes >= r.afterMinutes)
    .filter((r) => !r.nightOnly || hour >= 20 || hour <= 3)
    .map((r) => `${r.id}: ${r.provision}`);
}

function formatMinutes(m: number): string {
  if (m >= 1440) {
    const d = Math.floor(m / 1440);
    const h = Math.round((m % 1440) / 60);
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h}h ${mm}m` : `${h}h`;
  }
  return `${m}m`;
}

export function entitlementInputFor(
  persona: Persona,
  scenario: Scenario,
  blockTimeMinutes: number,
  distanceKm: number,
  delayMinutes: number,
  scheduledDepartureHour: number,
): EntitlementInput {
  return {
    regime: persona.regime,
    scenario,
    noticeMinutes: persona.noticeMinutes,
    blockTimeMinutes,
    distanceKm,
    delayMinutes,
    scheduledDepartureHour,
  };
}
