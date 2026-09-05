import type { Locale, Scenario, Segment, Channel } from '../types.js';

/**
 * The drafter composes copy from these blocks rather than looking up a static
 * table. That is what lets the Gap Detector actually CLOSE a gap live on
 * stage: any (scenario x segment x locale x channel) combination can be
 * generated, gated and published on demand.
 *
 * Every block is slotted. No block contains a literal number, time, date,
 * currency or flight designator — gate 01 enforces that on the way out.
 */

export type Tone = 'terse' | 'warm' | 'reassuring' | 'formal';

export const TONE_BY_SEGMENT: Record<Segment, Tone> = {
  platinum_solo: 'terse',
  family_connecting: 'warm',
  first_time_basic: 'reassuring',
  inbound_transfer: 'formal',
};

interface LocaleBlocks {
  scenarioLine: Record<Scenario, string>;
  toneOpener: Record<Tone, string>;
  rebook: Record<Tone, string>;
  entitlement: Record<Tone, string>;
  entitlementNone: string;
  assistance: string;
  connection: string;
  close: Record<Tone, string>;
  smsBody: string;
}

export const BLOCKS: Record<Locale, LocaleBlocks> = {
  'en-IN': {
    scenarioLine: {
      cancellation:
        '{{flight.number}} to {{flight.arrival_city}} on {{flight.date}} has been cancelled.',
      long_delay:
        '{{flight.number}} to {{flight.arrival_city}} on {{flight.date}} is running significantly late.',
      denied_boarding:
        'We were unable to board you on {{flight.number}} to {{flight.arrival_city}} on {{flight.date}}.',
      gate_change:
        '{{flight.number}} to {{flight.arrival_city}} is now departing from a different gate at {{flight.departure_airport}}.',
    },
    toneOpener: {
      terse: '',
      warm: '{{passenger.first_name}}, ',
      reassuring: 'Hello {{passenger.first_name}}. ',
      formal: 'Dear {{passenger.family_name}},\n\n',
    },
    rebook: {
      terse:
        'You are already rebooked on {{rebooking.option_1.number}}, departing {{flight.departure_airport}} at {{rebooking.option_1.dep_time}} and arriving {{rebooking.option_1.arr_time}}. Seat preference and tier benefits carry over automatically.',
      warm:
        'Everyone in your booking — all {{party.size_words}} of you — has been moved together to {{rebooking.option_1.number}}, departing {{flight.departure_airport}} at {{rebooking.option_1.dep_time}}. Nobody has been split up.',
      reassuring:
        'There is nothing you need to rebook. Your seat has already been moved to {{rebooking.option_1.number}}, which leaves {{flight.departure_airport}} at {{rebooking.option_1.dep_time}} and lands at {{rebooking.option_1.arr_time}}. Head for the same terminal you were already going to use.',
      formal:
        'You have been re-accommodated on {{rebooking.option_1.number}}, departing {{flight.departure_airport}} at {{rebooking.option_1.dep_time}}.',
    },
    entitlement: {
      terse:
        'Compensation of {{entitlement.amount}} applies under {{entitlement.rule_name}}. It is being credited to your original payment method within {{entitlement.settlement_days}} days — nothing for you to do.',
      warm:
        'Under {{entitlement.rule_name}} you are entitled to {{entitlement.amount}}. That payment has already been started and reaches your original payment method within {{entitlement.settlement_days}} days.',
      reassuring:
        'You are also owed money for this. Under {{entitlement.rule_name}} you will receive {{entitlement.amount}}. It comes back automatically to the account you paid with, within {{entitlement.settlement_days}} days.',
      formal:
        'Compensation of {{entitlement.amount}} is applicable under {{entitlement.rule_name}} and will be settled to the original payment method within {{entitlement.settlement_days}} days.',
    },
    entitlementNone:
      'Compensation due under {{entitlement.rule_name}} is calculated as {{entitlement.amount}} for this disruption.',
    assistance: '{{assistance.status}}',
    connection: '{{connection.status}}',
    close: {
      terse: '{{cta.label}}',
      warm: 'If anything here is wrong for your group, one tap gets you a person: {{cta.label}}',
      reassuring: 'Next step: {{cta.label}}',
      formal: '{{cta.label}}',
    },
    smsBody:
      '{{flight.number}} {{flight.date}} cancelled. Rebooked on {{rebooking.option_1.number}} at {{rebooking.option_1.dep_time}}. {{entitlement.amount}} due under {{entitlement.rule_name}}. {{cta.label}} in {{support.channel}}.',
  },

  'hi-IN': {
    scenarioLine: {
      cancellation:
        'आपकी फ़्लाइट {{flight.number}} ({{flight.date}}) रद्द कर दी गई है।',
      long_delay:
        'आपकी फ़्लाइट {{flight.number}} ({{flight.date}}) काफ़ी देर से चल रही है।',
      denied_boarding:
        'हम आपको {{flight.number}} ({{flight.date}}) में बोर्डिंग नहीं दे सके।',
      gate_change:
        'आपकी फ़्लाइट {{flight.number}} अब {{flight.departure_airport}} पर दूसरे गेट से रवाना होगी।',
    },
    toneOpener: {
      terse: '',
      warm: '{{passenger.first_name}} जी, ',
      reassuring: 'नमस्ते {{passenger.first_name}},\n\n',
      formal: '{{passenger.family_name}} जी,\n\n',
    },
    rebook: {
      terse:
        'आपको {{rebooking.option_1.number}} में स्थानांतरित कर दिया गया है, जो {{flight.departure_airport}} से {{rebooking.option_1.dep_time}} बजे रवाना होगी।',
      warm:
        'आपकी बुकिंग के सभी {{party.size_words}} यात्रियों को एक साथ {{rebooking.option_1.number}} में रख दिया गया है, जो {{flight.departure_airport}} से {{rebooking.option_1.dep_time}} बजे रवाना होगी। किसी को अलग नहीं किया गया है।',
      reassuring:
        'चिंता की कोई बात नहीं — आपको दोबारा बुकिंग नहीं करनी है। आपकी सीट पहले ही {{rebooking.option_1.number}} में रख दी गई है। यह {{flight.departure_airport}} से {{rebooking.option_1.dep_time}} बजे रवाना होगी और {{rebooking.option_1.arr_time}} बजे पहुँचेगी। हवाई अड्डे पर उसी टर्मिनल पर जाइए जहाँ आप पहले जाने वाले थे।',
      formal:
        'आपको {{rebooking.option_1.number}} में पुनः स्थान दिया गया है, जो {{flight.departure_airport}} से {{rebooking.option_1.dep_time}} बजे प्रस्थान करेगी।',
    },
    entitlement: {
      terse:
        '{{entitlement.rule_name}} के अनुसार {{entitlement.amount}} का मुआवज़ा लागू है, जो {{entitlement.settlement_days}} दिनों में आपके मूल भुगतान माध्यम में भेज दिया जाएगा।',
      warm:
        '{{entitlement.rule_name}} के अनुसार आपको {{entitlement.amount}} का मुआवज़ा मिलेगा। यह प्रक्रिया शुरू हो चुकी है और {{entitlement.settlement_days}} दिनों में आपके खाते में पहुँच जाएगी।',
      reassuring:
        'इसके लिए आपको पैसा भी मिलेगा। {{entitlement.rule_name}} के अनुसार आपको {{entitlement.amount}} मिलेंगे। यह अपने आप {{entitlement.settlement_days}} दिनों में उसी खाते में आ जाएगा जिससे आपने टिकट खरीदा था।',
      formal:
        '{{entitlement.rule_name}} के अंतर्गत {{entitlement.amount}} की क्षतिपूर्ति देय है, जो {{entitlement.settlement_days}} दिनों में निपटाई जाएगी।',
    },
    entitlementNone:
      '{{entitlement.rule_name}} के अनुसार इस व्यवधान के लिए देय राशि {{entitlement.amount}} है।',
    assistance: '{{assistance.status}}',
    connection: '{{connection.status}}',
    close: {
      terse: '{{cta.label}}',
      warm: 'अगर कुछ भी ठीक नहीं लगे तो एक टैप में हमसे बात कीजिए: {{cta.label}}',
      reassuring: 'अगला कदम: {{cta.label}}',
      formal: '{{cta.label}}',
    },
    smsBody:
      '{{flight.number}} {{flight.date}} रद्द। नई फ़्लाइट {{rebooking.option_1.number}}, {{rebooking.option_1.dep_time}} बजे। मुआवज़ा {{entitlement.amount}}। {{cta.label}} — {{support.channel}}।',
  },

  'ja-JP': {
    scenarioLine: {
      cancellation:
        'ご搭乗予定の {{flight.number}}（{{flight.date}}）が欠航となりました。',
      long_delay:
        'ご搭乗予定の {{flight.number}}（{{flight.date}}）に大幅な遅延が発生しております。',
      denied_boarding:
        '{{flight.number}}（{{flight.date}}）へのご搭乗をお受けできませんでした。',
      gate_change:
        '{{flight.number}}の出発ゲートが {{flight.departure_airport}}にて変更となりました。',
    },
    toneOpener: {
      terse: '',
      warm: '{{passenger.first_name}} 様、',
      reassuring: '{{passenger.first_name}} 様\n\n',
      formal: '{{passenger.family_name}} 様\n\n',
    },
    rebook: {
      terse:
        '代替便 {{rebooking.option_1.number}}へお席を移しております。{{flight.departure_airport}}を {{rebooking.option_1.dep_time}}に出発いたします。',
      warm:
        'ご同行の {{party.size_words}}名様全員を、同じ便 {{rebooking.option_1.number}}へお移ししました。{{flight.departure_airport}}を {{rebooking.option_1.dep_time}}に出発いたします。',
      reassuring:
        'お客様側でのお手続きは不要です。お席はすでに {{rebooking.option_1.number}}へ移動済みで、{{flight.departure_airport}}を {{rebooking.option_1.dep_time}}に出発し、{{rebooking.option_1.arr_time}}に到着いたします。',
      formal:
        '代替便として {{rebooking.option_1.number}}をご用意いたしました。{{flight.departure_airport}}を {{rebooking.option_1.dep_time}}に出発いたします。到着後は乗り継ぎカウンターへお越しください。',
    },
    entitlement: {
      terse:
        '{{entitlement.rule_name}}に基づき {{entitlement.amount}}の補償が適用され、{{entitlement.settlement_days}}日以内にご登録の決済方法へお支払いいたします。',
      warm:
        '{{entitlement.rule_name}}に基づき、{{entitlement.amount}}の補償が適用されます。お手続きは不要で、{{entitlement.settlement_days}}日以内にお支払いいたします。',
      reassuring:
        '補償もございます。{{entitlement.rule_name}}に基づき {{entitlement.amount}}が、{{entitlement.settlement_days}}日以内に自動的にお支払いいたします。',
      formal:
        '{{entitlement.rule_name}}に基づき、{{entitlement.amount}}の補償が適用されます。お手続きは不要で、{{entitlement.settlement_days}}日以内にご登録の決済方法へお支払いいたします。',
    },
    entitlementNone:
      '{{entitlement.rule_name}}に基づく本件の補償額は {{entitlement.amount}}です。',
    assistance: '{{assistance.status}}',
    connection: '{{connection.status}}',
    close: {
      terse: '{{cta.label}}',
      warm: 'ご不明な点がございましたら、こちらから担当者へおつなぎいたします：{{cta.label}}',
      reassuring: '次のお手続き：{{cta.label}}',
      formal: '{{cta.label}}',
    },
    smsBody:
      '{{flight.number}}（{{flight.date}}）欠航。代替便 {{rebooking.option_1.number}} {{rebooking.option_1.dep_time}}発。補償 {{entitlement.amount}}。{{cta.label}}（{{support.channel}}）',
  },
};

export interface ComposeInput {
  scenario: Scenario;
  segment: Segment;
  locale: Locale;
  channel: Channel;
  entitlementApplies: boolean;
  needsAssistance: boolean;
  hasConnection: boolean;
}

/** Deterministic composition. Same input, byte-identical output, every time. */
export function composeSlottedBody(input: ComposeInput): string {
  const b = BLOCKS[input.locale];
  const tone = TONE_BY_SEGMENT[input.segment];

  if (input.channel === 'sms') return b.smsBody;

  const parts: string[] = [];
  parts.push(b.toneOpener[tone] + b.scenarioLine[input.scenario]);

  if (tone === 'warm' && input.entitlementApplies) {
    // Warm tone leads with the entitlement — families ask about money first.
    parts.push(b.entitlement[tone]);
    parts.push(b.rebook[tone]);
  } else {
    parts.push(b.rebook[tone]);
    parts.push(input.entitlementApplies ? b.entitlement[tone] : b.entitlementNone);
  }

  if (input.needsAssistance) parts.push(b.assistance);
  if (input.hasConnection) parts.push(b.connection);

  parts.push(b.close[tone]);
  return parts.filter(Boolean).join('\n\n');
}

/** The pre-approved human-authored safe fallback for a locale and scenario. */
export function safeFallbackBody(locale: Locale, scenario: Scenario = 'cancellation'): string {
  const b = BLOCKS[locale];
  return [
    b.scenarioLine[scenario],
    b.rebook.formal,
    b.entitlementNone,
    b.assistance,
    b.connection,
    b.close.formal,
  ].join('\n\n');
}
