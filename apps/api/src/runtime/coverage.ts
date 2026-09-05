import type { Channel, CoverageCell, Gap, Locale, Scenario, Segment } from '../types.js';
import { getRepository } from '../store/index.js';
import { keyOf } from '../store/repository.js';

export const SCENARIOS: Scenario[] = ['cancellation', 'long_delay', 'denied_boarding', 'gate_change'];
export const SEGMENTS: Segment[] = ['platinum_solo', 'family_connecting', 'first_time_basic', 'inbound_transfer'];
export const LOCALES: Locale[] = ['en-IN', 'hi-IN', 'ja-JP'];
export const CHANNELS: Channel[] = ['app', 'email', 'sms', 'web'];

export interface CoverageReport {
  matrix: CoverageCell[];
  gaps: Gap[];
  totals: {
    cells: number;
    covered: number;
    gaps: number;
    unobserved: number;
    coveragePct: number;
    contentDebtHours: number;
  };
  dimensions: {
    scenarios: Scenario[];
    segments: Segment[];
    locales: Locale[];
    channels: Channel[];
  };
}

/** Minutes a human takes to author and review one variant, conservatively. */
const MINUTES_PER_VARIANT = 20;

export async function coverage(): Promise<CoverageReport> {
  const repo = await getRepository();
  const [variants, obs, gaps] = await Promise.all([repo.list(), repo.observations(), repo.gaps()]);

  const have = new Map(variants.map((v) => [keyOf(v.key), v]));
  const matrix: CoverageCell[] = [];

  for (const scenario of SCENARIOS) {
    for (const segment of SEGMENTS) {
      for (const locale of LOCALES) {
        for (const channel of CHANNELS) {
          const k = keyOf({ scenario, segment, locale, channel });
          const variant = have.get(k);
          const hits = obs[k]?.hits ?? 0;
          matrix.push({
            scenario,
            segment,
            locale,
            channel,
            hits,
            state: variant ? 'covered' : hits > 0 ? 'gap' : 'unobserved',
            variantUid: variant?.uid,
          });
        }
      }
    }
  }

  const covered = matrix.filter((c) => c.state === 'covered').length;
  const gapCount = matrix.filter((c) => c.state === 'gap').length;
  const unobserved = matrix.length - covered - gapCount;

  return {
    matrix,
    gaps,
    totals: {
      cells: matrix.length,
      covered,
      gaps: gapCount,
      unobserved,
      coveragePct: Math.round((covered / matrix.length) * 1000) / 10,
      contentDebtHours: Math.round(((matrix.length - covered) * MINUTES_PER_VARIANT) / 60),
    },
    dimensions: { scenarios: SCENARIOS, segments: SEGMENTS, locales: LOCALES, channels: CHANNELS },
  };
}
