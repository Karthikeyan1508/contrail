/**
 * Seeds the variant store so the demo wall renders on first load, then prints
 * the Contentstack content-type schema you need if you switch to live mode.
 */
import { runFoundry } from '../foundry/run.js';
import { coverage } from '../runtime/coverage.js';
import { getRepository, repositoryNote } from '../store/index.js';
import { CONTENT_TYPE_SCHEMA } from '../integrations/contentstack.js';
import { PERSONAS } from '../ledger/personas.js';
import type { VariantKey } from '../types.js';

const keys: VariantKey[] = [
  ...PERSONAS.map((p) => ({
    scenario: 'cancellation' as const,
    segment: p.segment,
    locale: p.locale,
    channel: p.channel,
  })),
  { scenario: 'cancellation', segment: 'platinum_solo', locale: 'hi-IN', channel: 'app' },
  { scenario: 'cancellation', segment: 'first_time_basic', locale: 'en-IN', channel: 'app' },
  { scenario: 'long_delay', segment: 'platinum_solo', locale: 'en-IN', channel: 'app' },
  { scenario: 'long_delay', segment: 'family_connecting', locale: 'en-IN', channel: 'app' },
  { scenario: 'cancellation', segment: 'platinum_solo', locale: 'en-IN', channel: 'sms' },
];

const repo = await getRepository();
console.log(`\nVariant store: ${repo.kind} — ${repositoryNote()}\n`);

const outcomes = await runFoundry(keys);
for (const o of outcomes) {
  const mark = o.published ? 'PUBLISHED' : 'ESCALATED';
  console.log(`  ${mark.padEnd(10)} ${o.combination.padEnd(52)} ${o.ms}ms`);
  if (!o.published) {
    for (const g of o.gates.filter((x) => x.status === 'fail')) {
      for (const f of g.findings) console.log(`             ${g.id} ${f.code}: ${f.message}`);
    }
  }
}

const cov = await coverage();
console.log(
  `\n  coverage ${cov.totals.covered}/${cov.totals.cells} cells (${cov.totals.coveragePct}%), ` +
    `content debt ${cov.totals.contentDebtHours}h\n`,
);

if (process.argv.includes('--print-schema')) {
  console.log('Contentstack content type schema:\n');
  console.log(JSON.stringify(CONTENT_TYPE_SCHEMA, null, 2));
}
