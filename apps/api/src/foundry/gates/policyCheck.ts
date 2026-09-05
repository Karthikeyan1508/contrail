import type { Finding, GateResult, Regime, TravellerContext } from '../../types.js';
import rules from '../../policy/composition.rules.json' with { type: 'json' };
import { extractSlots } from '../../runtime/hydrate.js';

/**
 * GATE 02 — policy as code.
 *
 * These rules are written once, reviewed by legal once, and then enforced on
 * every generation forever. Nothing here is a prompt instruction; every rule
 * is a mechanical assertion over the slotted body.
 */

export interface PolicyContext {
  entitlementApplies: boolean;
  accessibility: string[];
  hasOnwardConnection: boolean;
  regime: Regime;
}

const REGIME_MARKERS: Record<Regime, RegExp> = {
  DGCA: /\b(DGCA|Series\s*M|Civil Aviation Requirement)\b/i,
  EU261: /\b(EU\s*261|261\s*\/\s*2004|Regulation\s*\(EC\))/i,
};

export const COMPOSITION_RULES = rules;

export function policyCheck(body: string, ctx: PolicyContext): GateResult {
  const t0 = performance.now();
  const findings: Finding[] = [];
  const slots = extractSlots(body);
  const lower = body.toLowerCase();

  for (const rule of rules.rules) {
    if (!applies(rule, ctx)) continue;

    if ('requireSlots' in rule && Array.isArray(rule.requireSlots)) {
      for (const slot of rule.requireSlots) {
        if (!slots.includes(slot)) {
          findings.push({
            code: 'MISSING_REQUIRED_SLOT',
            ruleId: rule.id,
            message: `${rule.id} ${rule.name}: the variant must reference {{${slot}}} and does not.`,
            evidence: rule.rationale,
          });
        }
      }
    }

    if ('forbidTokens' in rule && Array.isArray(rule.forbidTokens)) {
      for (const token of rule.forbidTokens) {
        if (lower.includes(token.toLowerCase())) {
          findings.push({
            code: 'FORBIDDEN_TOKEN',
            ruleId: rule.id,
            message: `${rule.id} ${rule.name}: copy contains "${token}".`,
            evidence: rule.rationale,
          });
        }
      }
    }

    if ('orderingBefore' in rule && rule.orderingBefore) {
      const anchor = `{{${rule.orderingBefore.slot}}}`;
      const idx = body.indexOf(anchor);
      if (idx > -1) {
        const before = body.slice(0, idx).toLowerCase();
        for (const token of rule.orderingBefore.mustNotContainTokens) {
          if (before.includes(token.toLowerCase())) {
            findings.push({
              code: 'ORDERING_VIOLATION',
              ruleId: rule.id,
              message: `${rule.id} ${rule.name}: "${token}" appears before the entitlement is stated.`,
              evidence: rule.rationale,
            });
          }
        }
      }
    }

    if ('regimeConsistency' in rule && rule.regimeConsistency) {
      const other: Regime = ctx.regime === 'DGCA' ? 'EU261' : 'DGCA';
      if (REGIME_MARKERS[other].test(body)) {
        findings.push({
          code: 'WRONG_REGIME',
          ruleId: rule.id,
          message: `${rule.id} ${rule.name}: copy cites ${other} but this passenger falls under ${ctx.regime}.`,
          evidence: rule.rationale,
        });
      }
    }
  }

  return {
    id: 'G02',
    name: 'Policy as code',
    status: findings.length ? 'fail' : 'pass',
    ms: Math.round((performance.now() - t0) * 100) / 100,
    findings,
  };
}

type Rule = (typeof rules.rules)[number];

function applies(rule: Rule, ctx: PolicyContext): boolean {
  if (!('when' in rule) || !rule.when) return true;
  const w = rule.when as Record<string, unknown>;
  if ('entitlementApplies' in w && w.entitlementApplies !== ctx.entitlementApplies) return false;
  if ('hasOnwardConnection' in w && w.hasOnwardConnection !== ctx.hasOnwardConnection) return false;
  if ('accessibilityIncludes' in w && !ctx.accessibility.includes(String(w.accessibilityIncludes)))
    return false;
  return true;
}

export function policyContextFrom(
  ctx: TravellerContext,
  entitlementApplies: boolean,
): PolicyContext {
  return {
    entitlementApplies,
    accessibility: ctx.accessibility,
    hasOnwardConnection: Boolean(ctx.onwardConnection),
    regime: ctx.regime,
  };
}
