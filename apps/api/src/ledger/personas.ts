import type { Persona } from '../types.js';

/**
 * Four passengers on the same cancelled flight. Chosen so that the correct
 * message for each differs on a DIFFERENT axis: tone, entitlement, language,
 * and regulatory regime. That is the point of the demo wall.
 */
export const PERSONAS: Persona[] = [
  {
    id: 'pax-priya',
    name: 'Priya Raghunathan',
    familyName: 'Raghunathan',
    firstName: 'Priya',
    pnr: 'QH4T2X',
    segment: 'platinum_solo',
    locale: 'en-IN',
    channel: 'app',
    tier: 'platinum',
    partySize: 1,
    hasChild: false,
    accessibility: [],
    onwardConnection: null,
    fareBrand: 'business',
    noticeMinutes: 90,
    regime: 'DGCA',
    headline: 'Platinum · solo · same-day return',
    mustDiffer:
      'Terse. Self-serve rebooking. Tier benefits carried over. No hand-holding.',
  },
  {
    id: 'pax-fernandes',
    name: 'Anita Fernandes +3',
    familyName: 'Fernandes',
    firstName: 'Anita',
    pnr: 'KL9WQ2',
    segment: 'family_connecting',
    locale: 'en-IN',
    channel: 'app',
    tier: 'blue',
    partySize: 4,
    hasChild: true,
    accessibility: ['wheelchair'],
    onwardConnection: {
      carrier: 'AI',
      number: 'AI-143',
      departsInMinutes: 260,
      international: true,
    },
    fareBrand: 'flex',
    noticeMinutes: 90,
    regime: 'DGCA',
    headline: '4 pax · child + wheelchair · intl connection at risk',
    mustDiffer:
      'Entitlement stated before anything else. Assistance re-confirmed. Connection protected. Human contact offered.',
  },
  {
    id: 'pax-rahul',
    name: 'Rahul Meena',
    familyName: 'Meena',
    firstName: 'Rahul',
    pnr: 'ZT7P1M',
    segment: 'first_time_basic',
    locale: 'hi-IN',
    channel: 'app',
    tier: 'none',
    partySize: 1,
    hasChild: false,
    accessibility: [],
    onwardConnection: null,
    fareBrand: 'basic',
    noticeMinutes: 90,
    regime: 'DGCA',
    headline: 'First flight ever · Hindi · basic fare',
    mustDiffer:
      'Hindi. Plain language, no jargon. Explains what physically happens next, step by step.',
  },
  {
    id: 'pax-tanaka',
    name: 'Yuki Tanaka',
    familyName: 'Tanaka',
    firstName: 'Yuki',
    pnr: 'RB5N8D',
    segment: 'inbound_transfer',
    locale: 'ja-JP',
    channel: 'app',
    tier: 'gold',
    partySize: 1,
    hasChild: false,
    accessibility: [],
    onwardConnection: {
      carrier: 'NH',
      number: 'NH-828',
      departsInMinutes: 95,
      international: true,
    },
    fareBrand: 'flex',
    noticeMinutes: 90,
    regime: 'EU261',
    headline: 'Inbound transfer · Japanese · cross-regime entitlement',
    mustDiffer:
      'Japanese. Arrival-side instructions. Correct entitlement under the OTHER regulatory regime.',
  },
];

export function getPersona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
