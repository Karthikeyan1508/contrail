import type { Finding, GateResult, Locale } from '../../types.js';
import { literalText } from '../../runtime/hydrate.js';

/**
 * GATE 03 — brand and tone, as machine-checkable assertions rather than a
 * style guide nobody reads.
 */

const BANNED = [
  'we apologise for any inconvenience',
  'we apologize for any inconvenience',
  'please be advised',
  'due to circumstances beyond our control',
  'at this moment in time',
  'valued customer',
  'we regret to inform you',
  'thank you for your patience and understanding',
  'असुविधा के लिए हमें खेद है',
  'प्रिय ग्राहक',
  'ご迷惑をおかけし',
  'お客様各位',
];

const MAX_SENTENCE_WORDS = 34;
const MAX_PARAGRAPHS = 7;

const SENTENCE_SPLIT = /(?<=[.!?。！？])\s+/;

export function brandCheck(body: string, locale: Locale): GateResult {
  const t0 = performance.now();
  const findings: Finding[] = [];
  const lower = body.toLowerCase();

  for (const phrase of BANNED) {
    if (lower.includes(phrase)) {
      findings.push({
        code: 'BANNED_PHRASE',
        message: `Banned phrase in copy: "${phrase}". It signals a template, not a response.`,
        evidence: phrase,
      });
    }
  }

  if (/!/.test(literalText(body))) {
    findings.push({
      code: 'EXCLAMATION',
      message: 'Exclamation marks are not used in disruption copy. Nothing here is good news.',
    });
  }

  if (locale === 'en-IN') {
    for (const sentence of literalText(body).split(SENTENCE_SPLIT)) {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      if (words.length > MAX_SENTENCE_WORDS) {
        findings.push({
          code: 'SENTENCE_TOO_LONG',
          message: `Sentence runs to ${words.length} words, over the ${MAX_SENTENCE_WORDS}-word ceiling.`,
          evidence: `${sentence.trim().slice(0, 90)}…`,
        });
      }
    }
  }

  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim());
  if (paragraphs.length > MAX_PARAGRAPHS) {
    findings.push({
      code: 'TOO_LONG',
      message: `${paragraphs.length} paragraphs, over the ${MAX_PARAGRAPHS}-paragraph ceiling for a disruption notice.`,
    });
  }

  if (!body.includes('{{cta.label}}')) {
    findings.push({
      code: 'NO_ACTION',
      message: 'Copy does not end in a next action.',
    });
  }

  return {
    id: 'G03',
    name: 'Brand and tone',
    status: findings.length ? 'fail' : 'pass',
    ms: Math.round((performance.now() - t0) * 100) / 100,
    findings,
  };
}
