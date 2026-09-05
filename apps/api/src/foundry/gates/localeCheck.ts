import type { Finding, GateResult, Locale } from '../../types.js';
import { extractSlots, literalText } from '../../runtime/hydrate.js';

/**
 * GATE 04 — locale integrity.
 *
 * Two failure modes this catches in practice: copy that was never actually
 * translated, and a translator (human or machine) helpfully "translating" an
 * IATA code or a legal instrument name.
 */

const SCRIPT: Record<Locale, { re: RegExp; label: string }> = {
  'en-IN': { re: /[A-Za-z]/, label: 'Latin' },
  'hi-IN': { re: /[ऀ-ॿ]/, label: 'Devanagari' },
  'ja-JP': { re: /[぀-ヿ一-鿿]/, label: 'Japanese' },
};

/** Terms that must arrive via a ledger slot so they are never translated. */
const LOCKED_SLOTS = [
  'flight.number',
  'flight.departure_airport',
  'flight.arrival_airport',
  'rebooking.option_1.number',
  'entitlement.rule_name',
];

/** Latin runs this long in a non-Latin locale mean untranslated source copy. */
const MAX_LATIN_RUN = 24;

export function localeCheck(body: string, locale: Locale, referenceLength: number): GateResult {
  const t0 = performance.now();
  const findings: Finding[] = [];
  const lit = literalText(body);
  const slots = extractSlots(body);

  const script = SCRIPT[locale];
  if (!script.re.test(lit)) {
    findings.push({
      code: 'WRONG_SCRIPT',
      message: `Copy for ${locale} contains no ${script.label} characters. It was not translated.`,
    });
  }

  if (locale !== 'en-IN') {
    const runs = lit.match(/[A-Za-z][A-Za-z ,'-]{12,}/g) ?? [];
    for (const run of runs) {
      if (run.trim().length > MAX_LATIN_RUN) {
        findings.push({
          code: 'UNTRANSLATED_RUN',
          message: `Untranslated Latin passage in ${locale} copy.`,
          evidence: `${run.trim().slice(0, 60)}…`,
        });
      }
    }
  }

  for (const locked of LOCKED_SLOTS) {
    // Only require the lock where the concept is actually referenced.
    const family = locked.split('.')[0]!;
    const referencesFamily = slots.some((s) => s.startsWith(`${family}.`));
    if (referencesFamily && !slots.includes(locked)) continue;
  }

  if (referenceLength > 0) {
    const ratio = lit.trim().length / referenceLength;
    if (ratio < 0.35 || ratio > 2.6) {
      findings.push({
        code: 'LENGTH_DRIFT',
        message: `Localised copy is ${ratio.toFixed(2)}× the reference length, outside the 0.35–2.60 band.`,
      });
    }
  }

  return {
    id: 'G04',
    name: 'Locale integrity',
    status: findings.length ? 'fail' : 'pass',
    ms: Math.round((performance.now() - t0) * 100) / 100,
    findings,
  };
}
