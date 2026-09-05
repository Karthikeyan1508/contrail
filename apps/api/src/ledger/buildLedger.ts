import type {
  Entitlement,
  Fact,
  FactSource,
  FactsLedger,
  Locale,
  Persona,
  Scenario,
  TravellerContext,
} from '../types.js';
import { getFlightSnapshot, type FlightSnapshot } from '../integrations/amadeus.js';
import { entitlementInputFor, resolveEntitlement } from '../policy/engine.js';

const TZ = 'Asia/Kolkata';

function fact(
  key: string,
  value: Fact['value'],
  display: string,
  source: FactSource,
  sourceDetail: string,
  confidence = 1,
  citation?: string,
): Fact {
  return {
    key,
    value,
    display,
    source,
    sourceDetail,
    retrievedAt: new Date().toISOString(),
    confidence,
    citation,
  };
}

function timeFor(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

function dateFor(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(new Date(iso));
}

const COPY: Record<
  Locale,
  {
    tier: Record<string, string>;
    assistanceCarried: string;
    assistanceNone: string;
    connectionProtected: string;
    connectionAtRisk: string;
    connectionNone: string;
    ctaSelfServe: string;
    ctaAgent: string;
    ctaConfirm: string;
    support: string;
    partyWords: (n: number) => string;
  }
> = {
  'en-IN': {
    tier: { platinum: 'Platinum', gold: 'Gold', blue: 'Blue', none: 'member' },
    assistanceCarried:
      'Your booked wheelchair assistance has been carried over to the new flight and re-confirmed with the ground team.',
    assistanceNone: '',
    connectionProtected:
      'Your onward international flight is protected — the new arrival still meets the minimum connection time.',
    connectionAtRisk:
      'Your onward international flight is at risk, so we have held a seat for you on the next available departure as well.',
    connectionNone: '',
    ctaSelfServe: 'Review or change your new flight',
    ctaAgent: 'Talk to a disruption specialist now',
    ctaConfirm: 'Confirm your new seat',
    support: 'the app',
    partyWords: (n) => ['', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n),
  },
  'hi-IN': {
    tier: { platinum: 'प्लैटिनम', gold: 'गोल्ड', blue: 'ब्लू', none: 'यात्री' },
    assistanceCarried:
      'आपकी बुक की गई व्हीलचेयर सहायता नई फ़्लाइट में भी जारी रहेगी और ग्राउंड टीम को इसकी पुष्टि दे दी गई है।',
    assistanceNone: '',
    connectionProtected:
      'आपकी आगे की अंतरराष्ट्रीय फ़्लाइट सुरक्षित है — नई फ़्लाइट समय पर पहुँचा देगी।',
    connectionAtRisk:
      'आपकी आगे की फ़्लाइट छूट सकती है, इसलिए हमने अगली उपलब्ध फ़्लाइट में भी आपके लिए सीट रोक दी है।',
    connectionNone: '',
    ctaSelfServe: 'अपनी नई फ़्लाइट देखें या बदलें',
    ctaAgent: 'अभी हमारी टीम से बात करें',
    ctaConfirm: 'अपनी नई सीट पक्की करें',
    support: 'ऐप',
    partyWords: (n) => ['', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह'][n] ?? String(n),
  },
  'ja-JP': {
    tier: { platinum: 'プラチナ', gold: 'ゴールド', blue: 'ブルー', none: 'お客様' },
    assistanceCarried:
      'ご予約の車椅子サポートは新しい便に引き継がれ、地上係員に再確認済みです。',
    assistanceNone: '',
    connectionProtected:
      'お乗り継ぎの国際線は確保されています。新しい到着時刻でも最低乗り継ぎ時間を満たします。',
    connectionAtRisk:
      'お乗り継ぎの国際線に間に合わない可能性があるため、次の便にもお席を確保しております。',
    connectionNone: '',
    ctaSelfServe: '新しい便を確認・変更する',
    ctaAgent: '担当者に今すぐ相談する',
    ctaConfirm: '新しいお席を確定する',
    support: 'アプリ',
    partyWords: (n) => ['', '一', '二', '三', '四', '五', '六'][n] ?? String(n),
  },
};

export interface LedgerBundle {
  ledger: FactsLedger;
  context: TravellerContext;
  entitlement: Entitlement;
  flight: FlightSnapshot;
}

export async function buildLedger(
  persona: Persona,
  scenario: Scenario = 'cancellation',
): Promise<LedgerBundle> {
  const flight = await getFlightSnapshot();
  const locale = persona.locale;
  const copy = COPY[locale];

  const depHour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }).format(
      new Date(flight.departure.scheduledTime),
    ),
  );

  const entitlement = resolveEntitlement(
    entitlementInputFor(persona, scenario, flight.blockTimeMinutes, flight.distanceKm, 0, depHour),
  );

  const amadeusSrc: [FactSource, string] = ['amadeus', flight.sourceDetail];
  const crmSrc: [FactSource, string] = ['crm', 'Passenger Service System — PNR record'];
  const invSrc: [FactSource, string] = ['inventory', 'Amadeus availability — re-accommodation inventory'];
  const polSrc: [FactSource, string] = ['policy-engine', 'Contrail policy engine (deterministic)'];

  const opt1 = flight.rebookingOptions[0];
  const opt2 = flight.rebookingOptions[1];

  const facts: Fact[] = [
    fact('passenger.first_name', persona.firstName, persona.firstName, ...crmSrc),
    fact('passenger.family_name', persona.familyName, persona.familyName, ...crmSrc),
    fact('passenger.full_name', persona.name, persona.name, ...crmSrc),
    fact('passenger.pnr', persona.pnr, persona.pnr, ...crmSrc),
    fact('party.size', persona.partySize, String(persona.partySize), ...crmSrc),
    fact('party.size_words', persona.partySize, copy.partyWords(persona.partySize), ...crmSrc),
    fact('loyalty.tier', persona.tier, copy.tier[persona.tier] ?? persona.tier, ...crmSrc),

    fact('flight.number', flight.designator, flight.designator, ...amadeusSrc),
    fact('flight.status', flight.status, flight.status.toLowerCase(), ...amadeusSrc),
    fact('flight.date', flight.scheduledDepartureDate, dateFor(flight.departure.scheduledTime, locale), ...amadeusSrc),
    fact('flight.departure_airport', flight.departure.iataCode, flight.departure.iataCode, ...amadeusSrc),
    fact('flight.arrival_airport', flight.arrival.iataCode, flight.arrival.iataCode, ...amadeusSrc),
    fact('flight.departure_city', flight.departure.city, flight.departure.city, ...amadeusSrc),
    fact('flight.arrival_city', flight.arrival.city, flight.arrival.city, ...amadeusSrc),
    fact('flight.departure_terminal', flight.departure.terminal, flight.departure.terminal, ...amadeusSrc),
    fact('flight.aircraft', flight.aircraft, flight.aircraft, ...amadeusSrc),
    fact('flight.scheduled_dep_time', flight.departure.scheduledTime, timeFor(flight.departure.scheduledTime, locale), ...amadeusSrc),

    fact('rebooking.option_1.number', opt1?.designator ?? '', opt1?.designator ?? '—', ...invSrc, opt1 ? 1 : 0.2),
    fact('rebooking.option_1.dep_time', opt1?.departureTime ?? '', opt1 ? timeFor(opt1.departureTime, locale) : '—', ...invSrc, opt1 ? 1 : 0.2),
    fact('rebooking.option_1.arr_time', opt1?.arrivalTime ?? '', opt1 ? timeFor(opt1.arrivalTime, locale) : '—', ...invSrc, opt1 ? 1 : 0.2),
    fact('rebooking.option_2.number', opt2?.designator ?? '', opt2?.designator ?? '—', ...invSrc, opt2 ? 1 : 0.2),
    fact('rebooking.option_2.dep_time', opt2?.departureTime ?? '', opt2 ? timeFor(opt2.departureTime, locale) : '—', ...invSrc, opt2 ? 1 : 0.2),

    fact(
      'entitlement.amount',
      entitlement.amount,
      entitlement.display,
      ...polSrc,
      1,
      entitlement.citation,
    ),
    fact('entitlement.rule_name', entitlement.ruleId, entitlement.ruleName, ...polSrc, 1, entitlement.citation),
    fact('entitlement.settlement_days', entitlement.settlementDays, String(entitlement.settlementDays), ...polSrc, 1, entitlement.citation),

    fact(
      'assistance.status',
      persona.accessibility.includes('wheelchair'),
      persona.accessibility.includes('wheelchair') ? copy.assistanceCarried : copy.assistanceNone,
      ...crmSrc,
    ),
    fact(
      'connection.status',
      persona.onwardConnection ? (persona.onwardConnection.departsInMinutes < 150 ? 'at_risk' : 'protected') : 'none',
      persona.onwardConnection
        ? persona.onwardConnection.departsInMinutes < 150
          ? copy.connectionAtRisk
          : copy.connectionProtected
        : copy.connectionNone,
      ...invSrc,
    ),

    fact(
      'cta.label',
      persona.segment,
      persona.segment === 'platinum_solo'
        ? copy.ctaSelfServe
        : persona.segment === 'family_connecting'
          ? copy.ctaAgent
          : copy.ctaConfirm,
      ...polSrc,
    ),
    fact('support.channel', 'app', copy.support, ...polSrc),
  ];

  const ledger: FactsLedger = {
    pnr: persona.pnr,
    passengerId: persona.id,
    generatedAt: new Date().toISOString(),
    facts: Object.fromEntries(facts.map((f) => [f.key, f])),
  };

  const context: TravellerContext = {
    passengerId: persona.id,
    name: persona.name,
    scenario,
    segment: persona.segment,
    locale: persona.locale,
    channel: persona.channel,
    regime: persona.regime,
    tier: persona.tier,
    partySize: persona.partySize,
    hasChild: persona.hasChild,
    accessibility: persona.accessibility,
    onwardConnection: persona.onwardConnection,
    fareBrand: persona.fareBrand,
    noticeMinutes: persona.noticeMinutes,
    attributes: {
      tier: persona.tier,
      locale: persona.locale,
      partySize: persona.partySize,
      hasChild: persona.hasChild,
      hasAccessibilityRequest: persona.accessibility.length > 0,
      hasOnwardConnection: Boolean(persona.onwardConnection),
      fareBrand: persona.fareBrand,
      regime: persona.regime,
      scenario,
    },
    audiences: audiencesFor(persona),
    headline: persona.headline,
    mustDiffer: persona.mustDiffer,
  };

  return { ledger, context, entitlement, flight };
}

function audiencesFor(p: Persona): string[] {
  const a: string[] = [];
  if (p.tier === 'platinum' || p.tier === 'gold') a.push('high_value_travellers');
  if (p.partySize > 1) a.push('group_travellers');
  if (p.accessibility.length) a.push('assistance_required');
  if (p.onwardConnection) a.push('connecting_passengers');
  if (p.tier === 'none' && p.fareBrand === 'basic') a.push('price_led_first_time');
  if (p.regime === 'EU261') a.push('eu_regime');
  a.push(`locale_${p.locale.replace('-', '_').toLowerCase()}`);
  return a;
}

/** The slot allowlist gate 01 validates against. */
export function slotAllowlist(ledger: FactsLedger): string[] {
  return Object.keys(ledger.facts);
}
