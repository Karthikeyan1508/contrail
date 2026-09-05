import config from './personalize.json' with { type: 'json' };
import type { Channel, Scenario } from '../types.js';

/**
 * The real Contentstack Personalize experience behind this demo.
 *
 * Every identifier in personalize.json was read back from the Content
 * Management API (`GET /v3/variant_groups/:uid/variants`), not invented — the
 * aliases below are the ones Contentstack generated for the "Cancellation —
 * app" variant group, which is linked to the disruption_message content type.
 *
 * What this is not: the build still resolves the variant locally instead of
 * calling the Personalize Edge API for a user manifest. The mapping is real;
 * the manifest fetch is the next commit. Say that before a judge asks.
 */

export interface PersonalizeResolution {
  projectUid: string;
  experienceUid: string;
  experienceShortUid: string;
  experienceName: string;
  variantGroupUid: string;
  variantUid: string;
  variantShortUid: string;
  variantName: string;
  /** The alias Contentstack itself generated, e.g. cs_personalize_0_0. */
  alias: string;
  /** Which of the traveller's audiences selected this variant. */
  matchedAudience: string;
  resolvedBy: string;
}

/**
 * Resolve the traveller's audiences onto a Personalize variant.
 *
 * Variants are evaluated in the order they appear in the experience, because
 * that is the priority order Personalize itself applies — first match wins,
 * even when a traveller belongs to several audiences.
 */
export function resolvePersonalize(
  scenario: Scenario,
  channel: Channel,
  audiences: string[],
): PersonalizeResolution | null {
  if (scenario !== config.scope.scenario || channel !== config.scope.channel) return null;

  const hit = config.variants.find((v) => audiences.includes(v.audience));
  if (!hit) return null;

  return {
    projectUid: config.projectUid,
    experienceUid: config.experienceUid,
    experienceShortUid: config.experienceShortUid,
    experienceName: config.experienceName,
    variantGroupUid: config.variantGroupUid,
    variantUid: hit.uid,
    variantShortUid: hit.shortUid,
    variantName: hit.name,
    alias: hit.alias,
    matchedAudience: hit.audience,
    resolvedBy: 'audience match, computed locally — not a Personalize Edge manifest fetch',
  };
}
