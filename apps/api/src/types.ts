// ---------------------------------------------------------------------------
// Contrail domain types. Everything the system can say about the world lives
// in the FactsLedger; everything it is allowed to say is a slot into it.
// ---------------------------------------------------------------------------

export type FactSource =
  // whichever source answered for flight data
  | 'aviationstack'
  | 'amadeus'
  | 'fixture'
  | 'policy-engine'
  | 'crm'
  | 'inventory'
  | 'fixture';

export interface Fact {
  /** Dotted path used as the slot name, e.g. "flight.number". */
  key: string;
  /** Machine value. */
  value: string | number | boolean | null;
  /** Locale-rendered string form actually substituted into copy. */
  display: string;
  source: FactSource;
  /** Human-readable provenance, e.g. "AviationStack live — 6E860 BLR->DEL". */
  sourceDetail: string;
  retrievedAt: string;
  /** 0..1 */
  confidence: number;
  citation?: string;
}

export interface FactsLedger {
  pnr: string;
  passengerId: string;
  generatedAt: string;
  /** Keyed by Fact.key. This IS the slot allowlist. */
  facts: Record<string, Fact>;
}

export type Scenario =
  | 'cancellation'
  | 'long_delay'
  | 'denied_boarding'
  | 'gate_change';

export type Segment =
  | 'platinum_solo'
  | 'family_connecting'
  | 'first_time_basic'
  | 'inbound_transfer';

export type Locale = 'en-IN' | 'hi-IN' | 'ja-JP';

export type Channel = 'app' | 'email' | 'sms' | 'web';

export type Regime = 'DGCA' | 'EU261';

export interface Persona {
  id: string;
  name: string;
  familyName: string;
  firstName: string;
  pnr: string;
  segment: Segment;
  locale: Locale;
  channel: Channel;
  tier: 'platinum' | 'gold' | 'blue' | 'none';
  partySize: number;
  hasChild: boolean;
  accessibility: string[];
  onwardConnection: null | {
    carrier: string;
    number: string;
    departsInMinutes: number;
    international: boolean;
  };
  fareBrand: 'basic' | 'flex' | 'business';
  /** Minutes of notice the passenger received before departure. */
  noticeMinutes: number;
  regime: Regime;
  /** Short label used on the demo tile. */
  headline: string;
  /** What the message must do differently for this person. */
  mustDiffer: string;
}

/**
 * The shape handed to Contentstack Personalize as user attributes, plus the
 * audiences those attributes resolve to.
 */
export interface TravellerContext {
  passengerId: string;
  name: string;
  scenario: Scenario;
  segment: Segment;
  locale: Locale;
  channel: Channel;
  regime: Regime;
  tier: Persona['tier'];
  partySize: number;
  hasChild: boolean;
  accessibility: string[];
  onwardConnection: Persona['onwardConnection'];
  fareBrand: Persona['fareBrand'];
  noticeMinutes: number;
  /** -> Contentstack Personalize attributes */
  attributes: Record<string, string | number | boolean>;
  /** -> Contentstack Personalize audiences */
  audiences: string[];
  headline: string;
  mustDiffer: string;
}

export interface Entitlement {
  applies: boolean;
  amount: number;
  currency: 'INR' | 'EUR';
  display: string;
  ruleId: string;
  ruleName: string;
  citation: string;
  settlementDays: number;
  /** Step-by-step trace of how the amount was derived. */
  reasoning: string[];
  dutyOfCare: string[];
}

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

export interface VariantKey {
  scenario: Scenario;
  segment: Segment;
  locale: Locale;
  channel: Channel;
}

export interface ProvenanceRecord {
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
}

/**
 * What must be true about the world for this variant to be showable. The
 * runtime checks these before selecting it; gate 05 uses them to know which
 * degenerate states are genuinely reachable for this variant.
 */
export interface Preconditions {
  entitlementApplies: boolean;
  rebookingAvailable: boolean;
  assistanceRequired: boolean;
  connectionPresent: boolean;
}

export interface Variant {
  uid: string;
  key: VariantKey;
  preconditions: Preconditions;
  /** The slotted body. Contains {{slots}}, never literals. */
  slottedBody: string;
  /** Slots referenced by slottedBody. */
  slots: string[];
  version: number;
  status: 'published' | 'blocked' | 'draft';
  provenance: ProvenanceRecord;
  /** Prior versions, newest first. Powers rollback. */
  history: Array<{ version: number; slottedBody: string; at: string }>;
  variantAlias: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsedFact extends Fact {}

export interface RenderProvenance {
  facts: UsedFact[];
  rule: {
    id: string;
    name: string;
    citation: string;
    computedValue: string;
    reasoning: string[];
  } | null;
  model: ProvenanceRecord['model'];
  gates: GateResult[];
  approval: ProvenanceRecord['approval'];
  variant: {
    uid: string;
    alias: string;
    version: number;
    key: VariantKey;
    slottedBody: string;
  };
  timings: { selectMs: number; hydrateMs: number; totalMs: number };
  fallbackUsed: boolean;
  /** Non-empty when a stored variant existed but its preconditions did not hold. */
  preconditionMismatch: string[];
}

export interface BlockedInfo {
  gate: string;
  gateId: string;
  rule: string;
  findings: Finding[];
  rawOutput: string;
  gates: GateResult[];
}

export interface UngovernedInfo {
  text: string;
  gates: GateResult[];
  totalFindings: number;
  factualErrors: Array<{ claim: string; truth: string }>;
}

export interface RenderResult {
  message: string | null;
  blocked: BlockedInfo | null;
  provenance: RenderProvenance | null;
  ungoverned: UngovernedInfo | null;
  guardrails: boolean;
  context: TravellerContext;
  entitlement: Entitlement;
  flight: { designator: string; live: boolean; sourceDetail: string; status: string };
}

export type CoverageState = 'covered' | 'gap' | 'unobserved';

export interface CoverageCell {
  scenario: Scenario;
  segment: Segment;
  locale: Locale;
  channel: Channel;
  state: CoverageState;
  hits: number;
  variantUid?: string;
}

export interface Gap {
  combination: string;
  scenario: Scenario;
  segment: Segment;
  locale: Locale;
  channel: Channel;
  firstSeenAt: string;
  hits: number;
}
