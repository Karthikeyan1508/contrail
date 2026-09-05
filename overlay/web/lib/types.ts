// Mirrors @contrail/api. Kept hand-written so the frontend has zero build
// coupling to the backend package.

export type Scenario = 'cancellation' | 'long_delay' | 'denied_boarding' | 'gate_change';
export type Segment = 'platinum_solo' | 'family_connecting' | 'first_time_basic' | 'inbound_transfer';
export type Locale = 'en-IN' | 'hi-IN' | 'ja-JP';
export type Channel = 'app' | 'email' | 'sms' | 'web';
export type GateStatus = 'pass' | 'fail' | 'skip';

export interface Finding {
  code: string;
  message: string;
  evidence?: string;
  ruleId?: string;
}

export interface GateResult {
  id: string;
  name: string;
  status: GateStatus;
  ms: number;
  findings: Finding[];
}

export interface Fact {
  key: string;
  value: string | number | boolean | null;
  display: string;
  source: string;
  sourceDetail: string;
  retrievedAt: string;
  confidence: number;
  citation?: string;
}

export interface VariantKey {
  scenario: Scenario;
  segment: Segment;
  locale: Locale;
  channel: Channel;
}

export interface RenderProvenance {
  facts: Fact[];
  rule: {
    id: string;
    name: string;
    citation: string;
    computedValue: string;
    reasoning: string[];
  } | null;
  model: {
    provider: string;
    name: string;
    promptVersion: string;
    generatedAt: string;
    deterministic: boolean;
  };
  gates: GateResult[];
  approval: {
    by: string;
    at: string;
    entryUid: string;
    version: number;
    repository: 'local' | 'contentstack';
  };
  variant: {
    uid: string;
    alias: string;
    version: number;
    key: VariantKey;
    slottedBody: string;
  };
  timings: { selectMs: number; hydrateMs: number; totalMs: number };
  fallbackUsed: boolean;
  preconditionMismatch: string[];
}

export interface UngovernedInfo {
  text: string;
  gates: GateResult[];
  totalFindings: number;
  factualErrors: Array<{ claim: string; truth: string }>;
}

export interface Entitlement {
  applies: boolean;
  amount: number;
  currency: string;
  display: string;
  ruleId: string;
  ruleName: string;
  citation: string;
  settlementDays: number;
  reasoning: string[];
  dutyOfCare: string[];
}

export interface RenderResult {
  message: string | null;
  blocked: {
    gate: string;
    gateId: string;
    rule: string;
    findings: Finding[];
    rawOutput: string;
    gates: GateResult[];
  } | null;
  provenance: RenderProvenance | null;
  ungoverned: UngovernedInfo | null;
  guardrails: boolean;
  entitlement: Entitlement;
  flight: {
    designator: string;
    live: boolean;
    provider: string;
    sourceDetail: string;
    status: string;
  };
  context: {
    passengerId: string;
    name: string;
    segment: Segment;
    locale: Locale;
    channel: Channel;
    regime: string;
    tier: string;
    partySize: number;
    audiences: string[];
    attributes: Record<string, string | number | boolean>;
    headline: string;
    mustDiffer: string;
  };
}

export interface WallEntry {
  passengerId: string;
  name: string;
  headline: string;
  mustDiffer: string;
  result: RenderResult;
}

export interface Health {
  ok: boolean;
  subsystems: Record<
    'amadeus' | 'contentstack' | 'llm',
    { mode: string; configured: boolean; detail: string; [k: string]: unknown }
  >;
}

export interface CoverageCell extends VariantKey {
  state: 'covered' | 'gap' | 'unobserved';
  hits: number;
  variantUid?: string;
}

export interface Gap extends VariantKey {
  combination: string;
  firstSeenAt: string;
  hits: number;
}

export interface CoverageReport {
  matrix: CoverageCell[];
  gaps: Gap[];
  totals: {
    cells: number;
    covered: number;
    gaps: number;
    unobserved: number;
    coveragePct: number;
    contentDebtHours: number;
  };
  dimensions: {
    scenarios: Scenario[];
    segments: Segment[];
    locales: Locale[];
    channels: Channel[];
  };
}

export interface FoundryOutcome {
  key: VariantKey;
  combination: string;
  published: boolean;
  gates: GateResult[];
  slottedBody: string;
  variantUid: string | null;
  variantAlias: string;
  attempts: number;
  deterministic: boolean;
  model: string;
  ms: number;
  reason?: string;
}

export interface PolicyPayload {
  gates: Array<{ id: string; name: string; blurb: string }>;
  composition: {
    version: string;
    description: string;
    rules: Array<Record<string, unknown> & { id: string; name: string; rationale: string; severity: string }>;
  };
  regimes: Record<string, { instrument: string; citation: string; [k: string]: unknown }>;
}
