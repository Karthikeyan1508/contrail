import type {
  CoverageReport,
  FoundryOutcome,
  Health,
  PolicyPayload,
  RenderResult,
  Scenario,
  VariantKey,
  WallEntry,
} from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<Health>('/health'),

  renderWall: (scenario: Scenario, guardrails: boolean, autoFillGap: boolean) =>
    req<{ scenario: Scenario; guardrails: boolean; results: WallEntry[] }>('/render-all', {
      method: 'POST',
      body: JSON.stringify({ scenario, guardrails, autoFillGap }),
    }),

  render: (passengerId: string, scenario: Scenario, guardrails: boolean) =>
    req<RenderResult>('/render', {
      method: 'POST',
      body: JSON.stringify({ passengerId, scenario, guardrails }),
    }),

  coverage: () => req<CoverageReport>('/coverage'),

  policy: () => req<PolicyPayload>('/policy'),

  runFoundry: (body: { keys?: VariantKey[]; fillGaps?: boolean; seedDemo?: boolean }) =>
    req<{ requested: number; published: number; escalated: number; outcomes: FoundryOutcome[] }>(
      '/foundry/run',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  rollback: (uid: string) =>
    req<{ variant: { version: number; variantAlias: string } }>(`/variants/${uid}/rollback`, {
      method: 'POST',
    }),

  clearVariants: () => req<{ removed: number }>('/variants', { method: 'DELETE' }),
};

export const SCENARIO_LABEL: Record<Scenario, string> = {
  cancellation: 'Cancellation',
  long_delay: 'Long delay',
  denied_boarding: 'Denied boarding',
  gate_change: 'Gate change',
};

export const SEGMENT_LABEL: Record<string, string> = {
  platinum_solo: 'Platinum solo',
  family_connecting: 'Family connecting',
  first_time_basic: 'First-time basic',
  inbound_transfer: 'Inbound transfer',
};
