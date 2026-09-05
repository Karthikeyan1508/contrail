import config from './personalize.json' with { type: 'json' };
import type { Channel, Scenario } from '../types.js';
import { resolveViaEdge, edgeEnabled, type EdgeResolution } from './personalizeEdge.js';

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
  /** What Contentstack's own edge said, when it was asked. */
  edge: EdgeResolution | null;
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
    resolvedBy: edgeEnabled()
      ? 'local audience match, confirmed against the Personalize Edge manifest'
      : 'local audience match (edge lookup disabled)',
    edge: null,
  };
}

/**
 * The local match, plus Contentstack's own answer for the same attributes.
 *
 * The edge call is deliberately not on the message path: the copy is already
 * assembled from the combination key by the time this runs, so a slow or
 * unreachable edge costs the traveller nothing.
 */
export function resolvePersonalizeVerified(
  scenario: Scenario,
  channel: Channel,
  audiences: string[],
  userUid: string,
  attributes: Record<string, string | number | boolean>,
): PersonalizeResolution | null {
  const local = resolvePersonalize(scenario, channel, audiences);
  if (scenario !== config.scope.scenario || channel !== config.scope.channel) return local;

  const raw = resolveViaEdge(userUid, attributes, local?.alias ?? null);
  if (!raw) return local;

  // Agreement is derived here, not cached: the boot warm-up has no local match
  // to compare against, so a cached verdict would be meaningless.
  const expected = local?.alias ?? null;
  const agrees = raw.alias === expected;
  const edge = {
    ...raw,
    agrees,
    detail: agrees
      ? `Contentstack Personalize resolved the same variant from the same attributes (${raw.ms} ms, cached at boot).`
      : `Contentstack Personalize resolved ${raw.alias ?? 'the control'}; our local match said ${expected ?? 'the control'}.`,
  };

  // Contentstack may resolve a variant where we matched none, so the receipt
  // has to be able to report the edge even without a local hit.
  if (!local) {
    if (!edge.alias) return null;
    const v = config.variants.find((x) => x.alias === edge.alias);
    return {
      projectUid: config.projectUid,
      experienceUid: config.experienceUid,
      experienceShortUid: config.experienceShortUid,
      experienceName: config.experienceName,
      variantGroupUid: config.variantGroupUid,
      variantUid: v?.uid ?? '',
      variantShortUid: edge.variantShortUid ?? '',
      variantName: v?.name ?? 'unknown',
      alias: edge.alias,
      matchedAudience: v?.audience ?? '(resolved by Contentstack)',
      resolvedBy: 'Personalize Edge manifest — no local audience matched',
      edge,
    };
  }
  return { ...local, edge };
}
