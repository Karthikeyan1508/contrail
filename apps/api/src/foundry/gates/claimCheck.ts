import type { Finding, GateResult } from '../../types.js';
import { extractSlots, literalText } from '../../runtime/hydrate.js';

/**
 * GATE 01 — the one that makes hallucinated facts structurally impossible.
 *
 * Two halves:
 *   a) every slot referenced must exist in the ledger schema allowlist
 *   b) the literal text between slots must contain NO facts at all —
 *      no digits, no currency marks, no bare flight designators
 *
 * If the model wants to state a number it has exactly one way to do it: ask
 * the ledger for it by name.
 */

const CURRENCY_MARKS = /[₹€$¥£]|(?:\bINR\b|\bEUR\b|\bUSD\b|\bJPY\b|\bGBP\b|\bRs\.?\b)/g;
const ANY_DIGIT = /[0-9०-९０-９]/g;
const TIME_LIKE = /\b\d{1,2}\s*[:.]\s*\d{2}\b/g;
const FLIGHT_LIKE = /\b[A-Z0-9]{2}\s?-?\s?\d{2,4}\b/g;
const PNR_LIKE = /\b(?=[A-Z0-9]{6}\b)(?=.*\d)[A-Z0-9]{6}\b/g;

function evidence(text: string, index: number, len: number): string {
  const from = Math.max(0, index - 26);
  const to = Math.min(text.length, index + len + 26);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
}

function scan(text: string, re: RegExp, code: string, message: string): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
    const hit = m[0];
    if (seen.has(hit)) continue;
    seen.add(hit);
    out.push({
      code,
      message: `${message}: "${hit.trim()}"`,
      evidence: evidence(text, m.index ?? 0, hit.length),
    });
  }
  return out;
}

export function claimCheck(body: string, allowlist: string[]): GateResult {
  const t0 = performance.now();
  const findings: Finding[] = [];

  // (a) slot allowlist
  for (const slot of extractSlots(body)) {
    if (!allowlist.includes(slot)) {
      findings.push({
        code: 'UNKNOWN_SLOT',
        message: `Slot "${slot}" does not exist in the facts ledger schema. The model invented a fact source.`,
        evidence: `{{${slot}}}`,
      });
    }
  }

  // (b) no facts in the literal text
  const lit = literalText(body);
  findings.push(...scan(lit, TIME_LIKE, 'LITERAL_TIME', 'Hard-coded time in copy'));
  findings.push(...scan(lit, FLIGHT_LIKE, 'LITERAL_FLIGHT', 'Hard-coded flight designator in copy'));
  findings.push(...scan(lit, PNR_LIKE, 'LITERAL_PNR', 'Hard-coded booking reference in copy'));
  findings.push(...scan(lit, CURRENCY_MARKS, 'LITERAL_CURRENCY', 'Currency stated outside a ledger slot'));
  findings.push(...scan(lit, ANY_DIGIT, 'LITERAL_NUMBER', 'Digit outside a ledger slot'));

  return {
    id: 'G01',
    name: 'Claim check',
    status: findings.length ? 'fail' : 'pass',
    ms: round(performance.now() - t0),
    findings,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
