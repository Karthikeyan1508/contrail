import { env } from '../env.js';
import type { Gap, Variant, VariantKey } from '../types.js';
import { keyOf, parseKey, type VariantRepository } from '../store/repository.js';
import { LocalRepository } from '../store/localRepository.js';

/**
 * Contentstack-backed variant repository.
 *
 * Writes through the Content Management API and reads through the Content
 * Delivery API, exactly as a production content supply chain would. Set
 * CONTENTSTACK_MODE=live once the stack, content type and tokens exist.
 *
 * Observations (the gap queue) stay local — they are runtime telemetry, not
 * content, and belong with your analytics rather than in the CMS.
 */

const HOSTS: Record<string, { cma: string; cda: string }> = {
  na: { cma: 'https://api.contentstack.io/v3', cda: 'https://cdn.contentstack.io/v3' },
  eu: { cma: 'https://eu-api.contentstack.com/v3', cda: 'https://eu-cdn.contentstack.com/v3' },
  'azure-na': {
    cma: 'https://azure-na-api.contentstack.com/v3',
    cda: 'https://azure-na-cdn.contentstack.com/v3',
  },
  'azure-eu': {
    cma: 'https://azure-eu-api.contentstack.com/v3',
    cda: 'https://azure-eu-cdn.contentstack.com/v3',
  },
  'gcp-na': {
    cma: 'https://gcp-na-api.contentstack.com/v3',
    cda: 'https://gcp-na-cdn.contentstack.com/v3',
  },
};

interface CsEntry {
  uid: string;
  title: string;
  _version?: number;
  combination_key: string;
  scenario: string;
  segment: string;
  locale_code: string;
  channel: string;
  slotted_body: string;
  variant_alias: string;
  provenance: unknown;
}

export class ContentstackRepository implements VariantRepository {
  readonly kind = 'contentstack' as const;
  /** Observations and rollback history stay on disk alongside the CMS. */
  private readonly sidecar = new LocalRepository();
  private readonly hosts = HOSTS[env.contentstack.region] ?? HOSTS.eu!;
  /**
   * Runtime read cache. Contentstack is the system of record; this map is the
   * edge.
   *
   * Without it, every variant selection is a Content Delivery API round trip —
   * measured at ~65 ms against 0.01 ms from memory — which puts a network call
   * on the customer path, the exact thing this architecture exists to remove.
   * It also made the demo depend on venue wifi.
   *
   * Every write goes through upsert/remove/rollback, so the cache is corrected
   * there rather than expiring on a timer. The trade-off: an entry edited
   * directly in the Contentstack UI is not picked up until the API restarts.
   */
  private cache: Map<string, Variant> | null = null;

  async init(): Promise<void> {
    await this.sidecar.init();
    await this.ping();
    await this.warm();
  }

  /** Populate the cache once, on first use. */
  private async warm(): Promise<Map<string, Variant>> {
    if (this.cache) return this.cache;
    const entries = await this.fetchAll();
    this.cache = new Map(entries.map((v) => [keyOf(v.key), v]));
    return this.cache;
  }

  private headersCma(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      api_key: env.contentstack.apiKey,
      authorization: env.contentstack.managementToken,
    };
  }

  private headersCda(): Record<string, string> {
    return {
      api_key: env.contentstack.apiKey,
      access_token: env.contentstack.deliveryToken,
    };
  }

  private async ping(): Promise<void> {
    const res = await fetch(
      `${this.hosts.cma}/content_types/${env.contentstack.contentType}`,
      { headers: this.headersCma() },
    );
    if (!res.ok) {
      throw new Error(
        `Contentstack content type "${env.contentstack.contentType}" not reachable (${res.status}). ` +
          `Create it, or set CONTENTSTACK_MODE=local.`,
      );
    }
  }

  /** On the customer path — a map lookup, never a network call. */
  async get(key: VariantKey): Promise<Variant | null> {
    return (await this.warm()).get(keyOf(key)) ?? null;
  }

  async list(): Promise<Variant[]> {
    const cache = await this.warm();
    return [...cache.values()].sort((a, b) => a.variantAlias.localeCompare(b.variantAlias));
  }

  /** The one Content Delivery API read, on boot. */
  private async fetchAll(): Promise<Variant[]> {
    const url =
      `${this.hosts.cda}/content_types/${env.contentstack.contentType}/entries` +
      `?environment=${env.contentstack.environment}&limit=200`;
    const res = await fetch(url, { headers: this.headersCda() });
    if (!res.ok) return [];
    const json = (await res.json()) as { entries?: CsEntry[] };
    return (json.entries ?? []).map((e) => this.toVariant(e));
  }

  async upsert(variant: Variant): Promise<Variant> {
    const existing = await this.findEntryUid(keyOf(variant.key));
    const payload = {
      entry: {
        title: `${variant.key.scenario} · ${variant.key.segment} · ${variant.key.locale} · ${variant.key.channel}`,
        combination_key: keyOf(variant.key),
        scenario: variant.key.scenario,
        segment: variant.key.segment,
        locale_code: variant.key.locale,
        channel: variant.key.channel,
        slotted_body: variant.slottedBody,
        variant_alias: variant.variantAlias,
        // Contentstack has no arbitrary-JSON field type, so these travel as
        // stringified JSON in multiline text fields. See parseJsonField below.
        preconditions: JSON.stringify(variant.preconditions),
        provenance: JSON.stringify(variant.provenance),
      },
    };

    const url = existing
      ? `${this.hosts.cma}/content_types/${env.contentstack.contentType}/entries/${existing}`
      : `${this.hosts.cma}/content_types/${env.contentstack.contentType}/entries`;

    const res = await fetch(url, {
      method: existing ? 'PUT' : 'POST',
      headers: this.headersCma(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Contentstack upsert failed: ${res.status} ${await res.text()}`);

    const json = (await res.json()) as { entry: CsEntry };
    await this.publish(json.entry.uid);
    await this.sidecar.upsert({ ...variant, uid: json.entry.uid });

    // Keep the runtime cache correct without a refetch, so a variant published
    // by the foundry is selectable immediately — this is what closes the gap
    // loop in one round.
    const saved = this.toVariant(json.entry, variant);
    (await this.warm()).set(keyOf(variant.key), saved);
    return saved;
  }

  private async publish(entryUid: string): Promise<void> {
    // The locale must exist in the stack, and the environment must be one the
    // delivery token can read. Get either wrong and the entry is created but
    // never published: the CDA then returns an empty list and the app looks
    // empty with no error anywhere. So this failure is raised, not swallowed.
    const res = await fetch(
      `${this.hosts.cma}/content_types/${env.contentstack.contentType}/entries/${entryUid}/publish`,
      {
        method: 'POST',
        headers: this.headersCma(),
        body: JSON.stringify({
          entry: {
            environments: [env.contentstack.environment],
            locales: [env.contentstack.locale],
          },
        }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Contentstack publish failed for ${entryUid}: ${res.status} ${await res.text()} ` +
          `(environment "${env.contentstack.environment}", locale "${env.contentstack.locale}")`,
      );
    }
  }

  private async findEntryUid(combinationKey: string): Promise<string | null> {
    const q = encodeURIComponent(JSON.stringify({ combination_key: combinationKey }));
    const res = await fetch(
      `${this.hosts.cma}/content_types/${env.contentstack.contentType}/entries?query=${q}&limit=1`,
      { headers: this.headersCma() },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { entries?: CsEntry[] };
    return json.entries?.[0]?.uid ?? null;
  }

  async rollback(uid: string): Promise<Variant | null> {
    const restored = await this.sidecar.rollback(uid);
    if (restored) await this.upsert(restored);
    return restored;
  }

  async remove(uid: string): Promise<boolean> {
    const res = await fetch(
      `${this.hosts.cma}/content_types/${env.contentstack.contentType}/entries/${uid}`,
      { method: 'DELETE', headers: this.headersCma() },
    );
    await this.sidecar.remove(uid);
    this.cache = null; // rare, and off the demo path — just re-warm on next read
    return res.ok;
  }

  observe(key: VariantKey): Promise<void> {
    return this.sidecar.observe(key);
  }

  observations(): ReturnType<VariantRepository['observations']> {
    return this.sidecar.observations();
  }

  async gaps(): Promise<Gap[]> {
    const [obs, published] = await Promise.all([this.sidecar.observations(), this.list()]);
    const have = new Set(published.map((v) => keyOf(v.key)));
    return Object.entries(obs)
      .filter(([k]) => !have.has(k))
      .map(([k, o]) => ({ combination: k, ...parseKey(k), firstSeenAt: o.firstSeenAt, hits: o.hits }))
      .sort((a, b) => b.hits - a.hits);
  }

  private toVariant(e: CsEntry, base?: Variant): Variant {
    const key = parseKey(e.combination_key);
    return {
      uid: e.uid,
      key,
      preconditions:
        base?.preconditions ??
        parseJsonField<Variant['preconditions']>(
          (e as unknown as { preconditions?: unknown }).preconditions,
        ) ?? {
          entitlementApplies: true,
          rebookingAvailable: true,
          assistanceRequired: false,
          connectionPresent: false,
        },
      slottedBody: e.slotted_body,
      slots: base?.slots ?? [],
      version: e._version ?? base?.version ?? 1,
      status: 'published',
      provenance:
        parseJsonField<Variant['provenance']>(e.provenance) ??
        (base?.provenance as Variant['provenance']),
      history: base?.history ?? [],
      variantAlias: e.variant_alias,
      createdAt: base?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Contentstack has no arbitrary-JSON field type — `data_type: 'json'` is
 * reserved for the JSON rich-text editor and is rejected for a plain object.
 * So `preconditions` and `provenance` are stored as stringified JSON in
 * multiline text fields. Entries written by hand, or by an older build, may
 * still hold an object, so both shapes are accepted on read.
 */
function parseJsonField<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

/** The content type Contentstack needs. Printed by `npm run seed`. */
export const CONTENT_TYPE_SCHEMA = {
  content_type: {
    title: 'Disruption Message',
    uid: env.contentstack.contentType,
    schema: [
      { display_name: 'Title', uid: 'title', data_type: 'text', field_metadata: { _default: true }, unique: false, mandatory: true },
      { display_name: 'Combination Key', uid: 'combination_key', data_type: 'text', unique: true, mandatory: true },
      { display_name: 'Scenario', uid: 'scenario', data_type: 'text', mandatory: true },
      { display_name: 'Segment', uid: 'segment', data_type: 'text', mandatory: true },
      { display_name: 'Locale Code', uid: 'locale_code', data_type: 'text', mandatory: true },
      { display_name: 'Channel', uid: 'channel', data_type: 'text', mandatory: true },
      { display_name: 'Slotted Body', uid: 'slotted_body', data_type: 'text', field_metadata: { multiline: true }, mandatory: true },
      { display_name: 'Variant Alias', uid: 'variant_alias', data_type: 'text', mandatory: false },
      { display_name: 'Preconditions', uid: 'preconditions', data_type: 'text', field_metadata: { multiline: true }, mandatory: false },
      { display_name: 'Provenance', uid: 'provenance', data_type: 'text', field_metadata: { multiline: true }, mandatory: false },
    ],
  },
};
