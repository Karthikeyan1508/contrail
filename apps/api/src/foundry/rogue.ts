import type { Locale, Segment } from '../types.js';

/**
 * THE GUARDRAILS-OFF PATH.
 *
 * This is what an ungoverned model puts in front of a customer: fluent,
 * confident, and wrong. Every line here is a real failure mode observed in
 * production GenAI comms — a hallucinated amount, the wrong regulatory
 * instrument, an offer that outranks a legal entitlement, a dropped
 * accessibility commitment, and a claim instruction for a payment that is
 * actually automatic.
 *
 * It is generated ONCE, deterministically, and cached — so the demo cannot
 * fail live on stage.
 */

const ROGUE: Partial<Record<`${Segment}:${Locale}`, string>> = {
  'platinum_solo:en-IN': `Dear valued customer,

We apologise for any inconvenience caused. Your flight 6E-860 from Bengaluru to Delhi on 5 September 2026 has been cancelled due to circumstances beyond our control.

As a Platinum member we would like to offer you complimentary lounge access and a free upgrade on your next booking while you wait!

You have been rebooked onto flight 6E-6039 departing at 17:00.

Under EU Regulation 261/2004 you may be entitled to compensation of up to EUR 600. Please submit a claim form within 30 days on our website.`,

  'family_connecting:en-IN': `Dear valued customer,

We apologise for any inconvenience caused. Flight 6E-860 on 5 Sept 2026 has been cancelled.

Good news — we would like to offer your family of 4 a complimentary hotel voucher and lounge access while you wait for the next available flight!

Your new flight 6E-6039 departs at 17:00 from Bengaluru, arriving 19:50.

You are entitled to ₹25,000 compensation under EU Regulation 261/2004. Please submit a claim form within 30 days to receive this payment.`,

  'first_time_basic:hi-IN': `प्रिय ग्राहक,

असुविधा के लिए हमें खेद है। आपकी फ़्लाइट 6E-860 (5 सितंबर 2026) रद्द कर दी गई है।

आपके लिए हमने मुफ्त होटल और लाउंज की सुविधा रखी है!

EU Regulation 261/2004 के तहत आपको ₹15,000 का मुआवज़ा मिलेगा। कृपया 30 दिनों के भीतर क्लेम फॉर्म भरें।

आपकी नई फ़्लाइट 6E-6039 है जो 17:00 बजे रवाना होगी।`,

  'inbound_transfer:ja-JP': `お客様各位

この度はご迷惑をおかけし誠に申し訳ございません。6E-860便（2026年9月5日）は欠航となりました。

特典として、ラウンジのご利用と無料ホテルクーポンをご用意しております！

代替便は6E-6039便、17:00発でございます。

DGCA規則に基づき、25,000ルピーの補償が適用されます。30日以内に請求フォームをご提出ください。`,
};

const GENERIC: Record<Locale, string> = {
  'en-IN': `Dear valued customer,

We apologise for any inconvenience caused. Your flight 6E-860 on 5 September 2026 has been disrupted.

We would like to offer you a complimentary hotel voucher while you wait!

You have been rebooked onto 6E-6039 at 17:00. Under EU Regulation 261/2004 you may claim up to EUR 600 — please submit a claim form within 30 days.`,

  'hi-IN': `प्रिय ग्राहक,

असुविधा के लिए हमें खेद है। आपकी फ़्लाइट 6E-860 (5 सितंबर 2026) प्रभावित हुई है।

हम आपको मुफ्त होटल की सुविधा दे रहे हैं!

EU Regulation 261/2004 के तहत ₹15,000 तक का दावा करें। कृपया 30 दिनों में क्लेम फॉर्म भरें।`,

  'ja-JP': `お客様各位

この度はご迷惑をおかけし誠に申し訳ございません。6E-860便（2026年9月5日）に変更が生じました。

無料ホテルクーポンをご用意しております！

DGCA規則に基づき25,000ルピーまで請求可能です。30日以内に請求フォームをご提出ください。`,
};

export function rogueOutput(segment: Segment, locale: Locale): string {
  return ROGUE[`${segment}:${locale}`] ?? GENERIC[locale];
}

/**
 * What the rogue output gets WRONG factually, for the side-by-side callout.
 * Computed against the resolved entitlement at render time.
 */
export function rogueFactualErrors(
  correctAmount: string,
  correctRegime: string,
): Array<{ claim: string; truth: string }> {
  return [
    {
      claim: 'States the compensation amount as a figure it produced itself',
      truth: `Policy engine resolves ${correctAmount} for this passenger`,
    },
    {
      claim: 'Cites the wrong regulatory instrument',
      truth: `This passenger falls under ${correctRegime}`,
    },
    {
      claim: 'Instructs the passenger to submit a claim form',
      truth: 'Settlement is automatic to the original payment method',
    },
    {
      claim: 'Promises a complimentary hotel and lounge access',
      truth: 'Duty-of-care provisions are conditional and not owed here',
    },
  ];
}
