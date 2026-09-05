import type { Fact, FactsLedger } from '../types.js';

export const SLOT_RE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export interface HydrateResult {
  text: string;
  used: Fact[];
  /** Slots referenced that do not exist in the ledger at all. */
  unresolved: string[];
  /** Slots that rendered empty while occupying a whole paragraph — harmless. */
  emptyStandalone: string[];
  /** Slots that rendered empty mid-sentence — breaks grammar. This is the bug. */
  emptyInline: string[];
}

export function extractSlots(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(SLOT_RE)) {
    const key = m[1]!;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** Body with every slot removed — what gate 01 scans for literals. */
export function literalText(body: string): string {
  return body.replace(SLOT_RE, ' ');
}

/**
 * A slot is "standalone" when it is the entire paragraph. An optional block
 * that renders empty is only safe if it is standalone; inline, it leaves a
 * sentence with a hole in it.
 */
export function standaloneSlots(body: string): Set<string> {
  const out = new Set<string>();
  for (const para of body.split(/\n{2,}/)) {
    const t = para.trim();
    const m = /^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/.exec(t);
    if (m) out.add(m[1]!);
  }
  return out;
}

/**
 * Substitute facts into a slotted body. This is the ONLY place a real number
 * ever enters customer-facing copy, and it can only take one from the ledger.
 */
export function hydrate(body: string, ledger: FactsLedger): HydrateResult {
  const used: Fact[] = [];
  const unresolved: string[] = [];
  const emptyStandalone: string[] = [];
  const emptyInline: string[] = [];
  const standalone = standaloneSlots(body);

  const text = body.replace(SLOT_RE, (_full, key: string) => {
    const f = ledger.facts[key];
    if (!f) {
      if (!unresolved.includes(key)) unresolved.push(key);
      // Render nothing rather than leaking braces to a customer.
      if (standalone.has(key)) emptyStandalone.push(key);
      else emptyInline.push(key);
      return '';
    }
    if (!used.some((u) => u.key === key)) used.push(f);
    if (f.display === '') {
      if (standalone.has(key)) emptyStandalone.push(key);
      else emptyInline.push(key);
      return '';
    }
    return f.display;
  });

  return { text: normalise(text), used, unresolved, emptyStandalone, emptyInline };
}

/** Optional blocks hydrate to nothing; without this the output is full of holes. */
export function normalise(s: string): string {
  return s
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([.,!?;:。、）])/g, '$1')
        .replace(/（[ \t]+/g, '（')
        .trim(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
