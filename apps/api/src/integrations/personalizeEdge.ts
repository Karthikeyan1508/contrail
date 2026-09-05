import config from './personalize.json' with { type: 'json' };
import { env } from '../env.js';

/**
 * Contentstack Personalize Edge API.
 *
 * The flow is the one the docs describe: push the traveller's attributes for a
 * user id, fetch that user's manifest, and read the active variant for the
 * experience. Contentstack evaluates the audience rules — we do not.
 *
 * This runs *off* the customer path. The message itself is always assembled
 * from the local combination key; the edge result only enriches the provenance
 * receipt, and it is cached per user so a render never waits on the network
 * twice. If the edge is slow, unreachable, or disabled, the receipt simply says
 * so and the local resolution stands.
 */

const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 2500;

export interface EdgeResolution {
  /** The variant Contentstack itself selected, or null for the control. */
  variantShortUid: string | null;
  alias: string | null;
  /** Whether Contentstack agrees with our local audience match. */
  agrees: boolean;
  ms: number;
  detail: string;
}

const cache = new Map<string, { at: number; value: EdgeResolution }>();

export function edgeEnabled(): boolean {
  return env.personalize.edge && Boolean(config.projectUid);
}

/**
 * Ask Contentstack which variant this traveller resolves to.
 * `expectedAlias` is our own answer, so the receipt can report agreement.
 */
export function resolveViaEdge(
  userUid: string,
  attributes: Record<string, string | number | boolean>,
  expectedAlias: string | null,
): EdgeResolution | null {
  if (!edgeEnabled()) return null;

  const hit = cache.get(userUid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  // Cache miss: refresh behind the render rather than in front of it. The
  // receipt reports the local match this time and the edge verdict from the
  // next render on — which is why the cache is warmed at boot.
  void refreshEdge(userUid, attributes, expectedAlias);
  return null;
}

/** Do the round trip and fill the cache. Awaited only by the boot warm-up. */
export async function refreshEdge(
  userUid: string,
  attributes: Record<string, string | number | boolean>,
  expectedAlias: string | null,
): Promise<EdgeResolution | null> {
  if (!edgeEnabled()) return null;

  const started = performance.now();
  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-project-uid': config.projectUid,
      'x-cs-personalize-user-uid': userUid,
    };

    // Attributes first — the manifest is evaluated against whatever this user
    // last had set, so an unseeded user always resolves to the control.
    const set = await withTimeout(
      fetch(`${env.personalize.edgeHost}/user-attributes`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(attributes),
      }),
    );
    if (!set.ok) throw new Error(`user-attributes ${set.status}`);

    const res = await withTimeout(
      fetch(`${env.personalize.edgeHost}/manifest`, { headers }),
    );
    if (!res.ok) throw new Error(`manifest ${res.status}`);

    const json = (await res.json()) as { activeVariants?: Record<string, string | null> };
    const shortUid = json.activeVariants?.[config.experienceShortUid] ?? null;
    const alias = shortUid === null ? null : `cs_personalize_${config.experienceShortUid}_${shortUid}`;
    const ms = round(performance.now() - started);

    const value: EdgeResolution = {
      variantShortUid: shortUid,
      alias,
      agrees: alias === expectedAlias,
      ms,
      detail:
        alias === expectedAlias
          ? `Contentstack Personalize resolved the same variant from the same attributes (${ms} ms).`
          : `Contentstack Personalize resolved ${alias ?? 'the control'}; our local match said ${expectedAlias ?? 'the control'}.`,
    };

    cache.set(userUid, { at: Date.now(), value });
    return value;
  } catch (err) {
    return {
      variantShortUid: null,
      alias: null,
      agrees: false,
      ms: round(performance.now() - started),
      detail: `Edge lookup unavailable (${(err as Error).message}); the local audience match stands.`,
    };
  }
}

async function withTimeout(p: Promise<Response>): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    clearTimeout(timer);
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
