import type { Gap, Variant, VariantKey } from '../types.js';

export function keyOf(k: VariantKey): string {
  return `${k.scenario}|${k.segment}|${k.locale}|${k.channel}`;
}

export function parseKey(s: string): VariantKey {
  const [scenario, segment, locale, channel] = s.split('|');
  return {
    scenario: scenario as VariantKey['scenario'],
    segment: segment as VariantKey['segment'],
    locale: locale as VariantKey['locale'],
    channel: channel as VariantKey['channel'],
  };
}

export function variantAlias(k: VariantKey): string {
  // Mirrors the Contentstack Personalize alias convention:
  //   cs_personalize_<experience short uid>_<variant short uid>
  // The experience is scenario x channel; the variant is segment x locale.
  //
  // Both halves are sanitised but deliberately NOT truncated. Clipping them to
  // 12 and 18 characters made "cancellation_sms" collapse to "cancellation",
  // so the app and sms variants of one scenario claimed the same alias — two
  // distinct variants, one identifier.
  const part = (v: string) => v.replace(/[^a-z0-9_]/gi, '').toLowerCase();
  const experience = `${part(k.scenario)}_${part(k.channel)}`;
  const variant = `${part(k.segment)}_${part(k.locale)}`;
  return `cs_personalize_${experience}_${variant}`;
}

export interface VariantRepository {
  readonly kind: 'local' | 'contentstack';
  init(): Promise<void>;
  get(key: VariantKey): Promise<Variant | null>;
  list(): Promise<Variant[]>;
  upsert(variant: Variant): Promise<Variant>;
  rollback(uid: string): Promise<Variant | null>;
  remove(uid: string): Promise<boolean>;
  /** Runtime observed a request for this combination. Drives the gap queue. */
  observe(key: VariantKey): Promise<void>;
  gaps(): Promise<Gap[]>;
  observations(): Promise<Record<string, { hits: number; firstSeenAt: string }>>;
}
