import type { Persona, Segment, VariantKey } from '../types.js';

const DEFAULTS: Record<Segment, Omit<Persona, 'id' | 'name' | 'familyName' | 'firstName' | 'pnr' | 'locale' | 'channel'>> = {
  platinum_solo: {
    segment: 'platinum_solo', tier: 'platinum', partySize: 1, hasChild: false,
    accessibility: [], onwardConnection: null, fareBrand: 'business',
    noticeMinutes: 90, regime: 'DGCA',
    headline: 'Platinum · solo', mustDiffer: 'Terse, self-serve, tier benefits carried over.',
  },
  family_connecting: {
    segment: 'family_connecting', tier: 'blue', partySize: 4, hasChild: true,
    accessibility: ['wheelchair'],
    onwardConnection: { carrier: 'AI', number: 'AI-143', departsInMinutes: 260, international: true },
    fareBrand: 'flex', noticeMinutes: 90, regime: 'DGCA',
    headline: 'Family · connecting', mustDiffer: 'Entitlement first, assistance and connection addressed.',
  },
  first_time_basic: {
    segment: 'first_time_basic', tier: 'none', partySize: 1, hasChild: false,
    accessibility: [], onwardConnection: null, fareBrand: 'basic',
    noticeMinutes: 90, regime: 'DGCA',
    headline: 'First-time · basic fare', mustDiffer: 'Plain language, step by step.',
  },
  inbound_transfer: {
    segment: 'inbound_transfer', tier: 'gold', partySize: 1, hasChild: false,
    accessibility: [],
    onwardConnection: { carrier: 'NH', number: 'NH-828', departsInMinutes: 95, international: true },
    fareBrand: 'flex', noticeMinutes: 90, regime: 'EU261',
    headline: 'Inbound transfer', mustDiffer: 'Arrival-side instructions, cross-regime entitlement.',
  },
};

/**
 * A representative passenger for an arbitrary variant key. This is what lets
 * the foundry generate for a combination no real passenger has hit yet — the
 * mechanism behind closing a gap live on stage.
 */
export function syntheticPersona(key: VariantKey): Persona {
  const base = DEFAULTS[key.segment];
  return {
    ...base,
    id: `synthetic-${key.segment}-${key.locale}-${key.channel}`,
    name: 'Representative Passenger',
    familyName: 'Passenger',
    firstName: 'Representative',
    pnr: 'SYN000',
    locale: key.locale,
    channel: key.channel,
  };
}
