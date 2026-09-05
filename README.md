# Contrail

**A governed AI content supply chain for airline disruption communications.**

Generate customer-facing copy at scale with an LLM, prove it safe before it ships,
and assemble it deterministically at runtime — so a hallucinated compensation
figure is structurally impossible rather than statistically unlikely.

Built for *Beyond GenAI: Crafting the Future of Customer-Facing Enterprise
Applications* — Amadeus × Contentstack, Bengaluru.

---

## The idea in one paragraph

Personalization demands variety. Enterprise demands determinism. Airlines resolve
that tension by hand-authoring templates, which is why disruption messages are
generic and late. Bolting an LLM onto the app does not fix it, because no legal
team will sign off a probabilistic model free-texting a passenger's statutory
entitlement in real time.

Contrail takes generation **off the customer path**. An agentic foundry writes
*slotted* copy — `{{entitlement.amount}}`, never `₹10,000` — runs it through five
mechanical gates, and publishes approved variants into Contentstack with a
provenance record. At runtime a deterministic assembler picks the pre-approved
variant and injects real values from a typed facts ledger. Sub-millisecond,
cacheable, auditable, rollback-able, and incapable of saying anything a human
policy did not permit.

---

## Quick start

**Requirements:** Node 20+ and npm. No API keys needed — the whole system runs on
fixtures and deterministic generation out of the box.

### Windows (PowerShell)

```powershell
cd contrail
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
npm run dev
```

### macOS / Linux / Git Bash / WSL

```bash
cd contrail
bash scripts/setup.sh
npm run dev
```

Then open **http://localhost:3000**.

The setup script asks you one question — the project name when the shadcn CLI
scaffolds the Next app. **Answer `web`.** Everything else is automatic.

| | |
|---|---|
| Web | http://localhost:3000 |
| API health | http://localhost:4000/api/health |

### What setup actually does

1. Installs the API (`apps/api`) and copies `.env.example` → `.env`
2. Scaffolds `apps/web` with **your exact shadcn preset**
   (`npx shadcn@latest init --preset b1sAmW2JU --template next` — nova style,
   mist base, cyan theme, geist, lucide, small radius)
3. Runs `npx shadcn@latest add` for all 23 components the app uses
4. Copies the Contrail frontend source from `overlay/web` into `apps/web`
   (pages, components, lib) and installs `next-themes` + `geist`
5. Installs workspace dependencies and seeds the variant store

The UI is composed **entirely from shadcn components** — nothing is hand-rolled.
`overlay/web` contains the pages, the app shell components, a typed API client,
and types.

---

## Repository layout

```
contrail/
├── apps/
│   ├── api/                    Node + Express + TypeScript. The whole system.
│   │   └── src/
│   │       ├── ledger/         Typed facts ledger + personas + synthetic personas
│   │       ├── policy/         DGCA / EU261 rule sets, composition rules, engine
│   │       ├── foundry/        Drafter, rogue generator, the five gates
│   │       ├── runtime/        Hydration, assembly, provenance, coverage
│   │       ├── integrations/   Amadeus, Contentstack, LLM — all with fallbacks
│   │       └── store/          Variant repository (local + Contentstack)
│   └── web/                    Created by setup. shadcn preset + Contrail source.
├── overlay/web/                The Contrail frontend source, copied into apps/web
└── scripts/                    setup.ps1 / setup.sh
```

---

## Architecture

```
  AMADEUS  ─┐
  POLICY   ─┼─▶ [1] FACTS LEDGER ──┬──▶ [2] CONTENT FOUNDRY ──▶ Contentstack
  CRM      ─┘                      │      draft → 5 gates       (variants +
                                   │      pass ▸ publish         provenance)
                                   │      fail ▸ retry / human        │
                                   │                                  ▼
                                   └────────▶ [3] RUNTIME ASSEMBLER ◀─┘
                                              select · hydrate · receipt
                                                       │
                                        gap detected ──┘
                                        feeds the work queue back to [2]
```

### 1. Facts ledger — `apps/api/src/ledger/`

The single source of truth. Nothing that is not in the ledger can appear in a
message. Every fact carries `value`, `display`, `source`, `sourceDetail`,
`retrievedAt`, `confidence` and, where relevant, a legal `citation`. That
metadata is what makes the provenance drawer possible.

Facts come from Amadeus (flight status, re-accommodation inventory), the policy
engine (a computed entitlement), and the PNR (tier, party size, accessibility,
onward connection). Display values are locale-rendered, so the *same* slot
produces `18:40`, `₹10,000` and `7` correctly formatted for `en-IN`, `hi-IN` or
`ja-JP`.

### 2. Content foundry — `apps/api/src/foundry/`

Runs off the customer path. Composes slotted copy from a locale × tone block
library (or an LLM, when a key is configured), then puts it through five gates.
Anything that passes is written to the variant store with a provenance record.
Anything that fails twice escalates to human review, which is the correct
outcome, not a bug.

Variants declare **preconditions** — what must be true about the world for them
to be showable. The runtime enforces those before selection.

### 3. Runtime assembler — `apps/api/src/runtime/`

No inference. Select the pre-approved variant, hydrate its slots, log a receipt,
record the observation. Typical timings from the running system: **select 0.01 ms,
hydrate 0.10 ms.** If no variant covers the combination, it serves a
human-approved safe fallback and files a gap — which is what makes the loop
self-healing.

---

## The five gates — `apps/api/src/foundry/gates/`

None of them is "ask another LLM if this looks fine". All five are mechanical.

| | Gate | What it actually does |
|---|---|---|
| **G01** | Claim check | Every slot must exist in the ledger schema, **and the literal text between slots must contain no digits, currency marks, times or flight designators at all.** The model is left exactly one way to state a number: ask the ledger for it by name. |
| **G02** | Policy as code | Declarative rules in `policy/composition.rules.json`: required slots, forbidden tokens, ordering constraints (no commercial offer before the entitlement), and regime consistency. This is the file legal signs off once. |
| **G03** | Brand and tone | Banned phrases, sentence-length ceiling, no exclamation marks, a required next action. |
| **G04** | Locale integrity | Script presence, untranslated-Latin-run detection, length drift against the reference. |
| **G05** | Adversarial pass | Renders the variant against degenerate world states (no compensation due, no inventory, party of one, optional fact missing, unusually long value) and asserts the copy still reads true. Cases contradicting a declared precondition are skipped, because the runtime refuses to select the variant in those states. |

Run against the deliberately ungoverned output, these fire **30 findings in about
3 ms**.

---

## The demo

1. **The wall.** Four passengers on one cancelled flight render side by side.
   Priya (platinum, terse, `₹10,000` DGCA), the Fernandes family (entitlement
   first, wheelchair re-confirmed, connection protected), Rahul (Hindi, plain
   language, step by step), Ms. Tanaka (Japanese, `€400` under EU261 — a
   *different regime*). Let the judges read. Don't narrate.

2. **Provenance.** Open the drawer on any card: every fact and its source, the
   rule that computed the amount with its full derivation and citation, the model
   and prompt version, the five gates with timings, the approver, and a rollback
   control. Then the **Source** tab — the stored variant contains no numbers at
   all.

3. **Guardrails off.** Flip the switch. Raw model output replaces every message:
   wrong amount, wrong regulatory instrument, a hotel voucher the fare doesn't
   permit, the wheelchair commitment silently dropped, and a claim form for a
   payment that is automatic. Leave it on screen and stay quiet for three
   seconds. Then flip it back and open **blocked** to see exactly which rules
   fired.

4. **The loop.** Switch the scenario to *Denied boarding* — no variant exists, so
   the safe fallback serves and a gap is logged. Go to **Coverage**, see the gap
   in the queue, hit **Close gaps**, come back. The correct scenario-specific
   copy is now there, gated and published.

---

## Running with real credentials

Everything is optional and degrades gracefully. The header badges show which mode
each subsystem is in, so a judge asking "is this all mocked?" gets an answer on
screen.

### Amadeus

```env
AMADEUS_CLIENT_ID=...
AMADEUS_CLIENT_SECRET=...
DEMO_CARRIER_CODE=6E
DEMO_FLIGHT_NUMBER=860
DEMO_FLIGHT_DATE=2026-09-05
```

Uses On-Demand Flight Status (`GET /v2/schedule/flights`) against the test
environment. Any failure falls back to the cached fixture and says so in the
badge tooltip — the demo cannot break on conference wifi.

### Contentstack

```env
CONTENTSTACK_MODE=live
CONTENTSTACK_API_KEY=...
CONTENTSTACK_DELIVERY_TOKEN=...
CONTENTSTACK_MANAGEMENT_TOKEN=...
CONTENTSTACK_ENVIRONMENT=production
CONTENTSTACK_REGION=eu
```

Print the content type you need to create:

```bash
npm run seed --workspace apps/api -- --print-schema
```

Fields: `title`, `combination_key` (unique), `scenario`, `segment`,
`locale_code`, `channel`, `slotted_body` (multiline), `variant_alias`,
`preconditions` (JSON), `provenance` (JSON).

Writes go through the Content Management API and publish; reads go through the
Content Delivery API. `variant_alias` follows the Personalize convention
(`cs_personalize_<experience>_<variant>`) so the same entries slot into a
Personalize experience with audiences mapped from `context.attributes`.

### LLM

```env
LLM_PROVIDER=anthropic     # or openai
ANTHROPIC_API_KEY=...
```

The drafter's system prompt forbids literals and constrains it to the ledger's
slot allowlist. Output that fails a cheap shape check never enters the pipeline,
and the deterministic composer takes over. **For a stage demo, leaving this off
is the right call** — the output is then byte-identical every run.

---

## API reference

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Which mode each subsystem is in |
| `GET` | `/api/personas` | The four demo passengers |
| `POST` | `/api/context` | `{ passengerId, scenario }` → traveller context + full facts ledger |
| `POST` | `/api/render` | `{ passengerId, scenario, guardrails, autoFillGap }` → message, provenance, blocked candidate |
| `POST` | `/api/render-all` | The whole demo wall in one call |
| `GET` | `/api/coverage` | Matrix, gap queue, totals, content debt |
| `POST` | `/api/foundry/run` | `{ keys?, fillGaps?, seedDemo? }` → per-variant gate outcomes |
| `GET` | `/api/variants` | Everything in the store |
| `POST` | `/api/variants/:uid/rollback` | Restore the previous version |
| `DELETE` | `/api/variants` | Clear the store |
| `GET` | `/api/policy` | Gate catalogue, composition rules, both regimes |

The browser never calls Amadeus or Contentstack. Next rewrites `/api/*` to the
API, so there is one boundary and no CORS.

---

## Commands

```bash
npm run dev          # both apps, colour-coded
npm run build        # typecheck + build both
npm run typecheck    # both
npm run seed         # regenerate the demo variant set
npm run dev:api      # API only, on :4000
npm run dev:web      # web only, on :3000
```

---

## Notes before you present

- **Verify the DGCA figures** in `apps/api/src/policy/dgca.rules.json` against the
  current CAR before quoting them on stage. They are encoded as data precisely so
  they are easy to correct.
- **Check the live Amadeus catalogue** — the older ML prediction endpoints have
  moved around. The risk signal is deliberately pluggable, so nothing breaks if
  one is unavailable.
- The business case is arithmetic, not a borrowed statistic: 40 scenarios × 12
  locales × 6 segments × 4 channels = 11,520 variants; at 20 minutes of human
  authoring and review each, that is roughly two person-years per refresh cycle.
  The **Coverage** page computes the same number live from the real matrix.
