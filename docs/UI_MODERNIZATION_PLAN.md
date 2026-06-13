# A1 Suite — UI Modernization & Migration Plan

**Status:** Proposed (research complete, awaiting kickoff approval)
**Date:** 2026-06-11
**Scope:** Migrate the A1 Suite web interface from the current hand-rolled React SPA to a
modern, design-system-based interface — incrementally, with the app shipping continuously.
**Inputs:** three research sweeps (2026-06-11): (1) UX patterns of best-in-class business
software (Linear, Attio, Mercury, Stripe, Midday, Twenty, Notion/Airtable, Odoo 17/18,
ERPNext v16, Xero/QuickBooks redesigns); (2) toolchains verified from the `package.json`
of 10 comparable open-source products; (3) migration strategy literature and postmortems
(Slack, Shopify Polaris, Airbnb, Notion, GitHub Primer). Sources in Appendix A.

---

## 1. Goals and non-goals

**Goals**

1. A modern, fast, keyboard-first interface competitive with Linear/Attio-class products,
   specialized for accounting/ERP work (data-dense tables, document flows, audit trails).
2. A maintainable codebase: TypeScript, design tokens, one shared component library,
   per-route code splitting — replacing one 12.5k-line `main.jsx` and one 12.7k-line CSS file.
3. First-class hy/ru localization in the UI (the server already switches via `A1_LOCALE`;
   the UI currently hardcodes Armenian strings in JSX).
4. Keep the product fully offline and self-hostable: no CDN fonts/scripts, single static
   bundle served by the existing Fastify server.
5. The app keeps shipping during the entire migration. No big-bang rewrite.

**Non-goals**

- No backend/API changes. The Fastify REST API is stable and stays as-is.
- No redesign of business workflows during the port (see "port, then improve", §6).
- No SSR/meta-framework adoption (§4.2 — argued and rejected).
- No full-parity mobile app (mobile = companion scope, §5.6).

---

## 2. Current state (audit, 2026-06-11)

| Dimension | Today |
|---|---|
| Build | Vite 6 + `@vitejs/plugin-react`, output to `public/`, served by Fastify :4100 |
| Framework | React 18.3, plain JSX, no TypeScript |
| Code shape | `web/src/main.jsx` **12,536 lines** (shell + most screens, 221 `useState`); ~10 module files (`finance.jsx` 679, `purchase.jsx` 378, `inventory.jsx` 264, `crm.jsx` 203, `docs.jsx` 169, `people.jsx` 151, `projects.jsx` 147, `desk.jsx` 76, `forms.jsx` 67, `compliance.jsx` 49) + `copilot.jsx` 237 |
| Styling | `styles.css` **12,749 lines**, hand-written; only **14** CSS custom properties at `:root` vs **659** hardcoded `color:` declarations; no dark mode; no `@media` queries |
| Routing | Custom 60-line helper (`suite-routes.js`): `/app/:appId` with aliases; 13 app ids: crm, finance, copilot, desk, campaigns, projects, inventory, purchase, people, docs, analytics, flow, forms |
| Data | Raw `fetch` + `loadOr(fallback, fetcher)` resilience helper; ~100 datasets loaded after login; no cache layer, no invalidation, no optimistic updates |
| Components | None shared — bespoke markup per screen |
| i18n | Armenian strings hardcoded in JSX (`lang="hy"`, `hy-AM` number formatting inline); no extraction layer; collides with the shipped server-side AM↔RU locale switch |
| Tests | None on the UI (server suite is strong) |
| Brand | A1 brand system: master teal tile + product-colored tiles; current tokens `--brand:#0f3b3c`, `--teal:#00897b`, `--copper`, `--ruby`, `--amber`, `--blue` |

The strengths to preserve: the API is complete and battle-tested; the route map is small and
clean (one path segment per app); `loadOr`'s "one failing panel must not blank the workspace"
philosophy; the A1 brand palette.

---

## 3. What best-in-class looks like (research synthesis)

### 3.1 What each studied product teaches

- **Linear** — the interaction grammar: every action reachable 4 ways (button, shortcut,
  context menu, Cmd+K); single-key actions + chorded nav (`G then I`); `Space` = peek panel;
  optimistic writes + universal Cmd+Z undo instead of confirmation dialogs; two-column triage
  Inbox; dynamic saved views; LCH theming that derives whole light/dark/high-contrast themes
  from 3 variables (base, accent, contrast) — replaced 98 hand-defined variables per theme.
- **Attio** — Objects→Records→Attributes with views as lenses (grid/kanban over the same
  records); dense spreadsheet grid (1px borders, Inter, status pills); record sidebar with
  inline editing + activity log; **AI-as-column** (agent output rendered as a reviewable
  attribute across thousands of records) — the best AI-in-CRM pattern found.
- **Mercury** — restraint: ONE filled CTA per section; calm visual system for money software;
  task-oriented dashboard (do the thing from the dashboard, not navigate-then-do).
- **Stripe Dashboard** — `/` global search across records; pinned + recently-visited shortcuts
  as navigation; list views = 14 filters + customizable columns; "needs attention" items as
  first-class dashboard content; skeleton loading everywhere, never spinners.
- **Midday** — **Magic Inbox**: incoming receipts/invoices auto-matched to bank transactions,
  reconciliation as confirm/reassign cards; AI assistant returns **artifacts** (rendered
  tables/charts from JSON-schema outputs), not prose; scope discipline.
- **Twenty** — proof that a small open-source team reaches Linear-class quality with React +
  a strict design system; public Figma files; saved/shared/default views with persistent
  filters.
- **Notion/Airtable** — side-peek vs center-peek vs full-page record opening (user-choosable);
  2-level grouping with per-group aggregations; personal vs shared views; row-height density
  toggle; warning: view UX dies without a fast data layer underneath.
- **Odoo 17/18** — the ERP incumbent's modernization = fewer clicks, contextual quick
  actions, sticky table headers, **human-readable deep-link URLs** (`/odoo/project/5/tasks`),
  PWA-scoped mobile (POS, barcode, time clock) — not visual styling alone.
- **ERPNext v16 / Frappe Espresso** — one open design system (public Figma) applied across
  every app of the suite to cut cognitive load; persistent sidebar + revamped nav.
- **Xero vs QuickBooks 2025 redesigns — the cautionary tale** — accountants punished
  click-count regressions and forced migration ("things that used to take one click now take
  several"); Xero's co-created opt-in rollout was received well, Intuit's forced rollout
  caused a revolt. **Keystroke parity and opt-in transitions are hard requirements** for
  finance users.

### 3.2 Top 15 patterns to adopt (ranked by impact for A1)

1. **Cmd+K command palette** — navigation + actions (new invoice, record payment) + global
   record search (contact, invoice #, account code) in one fuzzy surface; context-aware per
   screen. Library: `cmdk`.
2. **One excellent data table used everywhere** — density toggle (compact/default/
   comfortable), frozen identifying column, right-aligned monetary columns with tabular
   numerals, full gridlines for transaction logs, column show/hide/reorder, inline edit, bulk
   select, virtualized rows, per-user persisted view config. This single component IS the
   product for Finance/Inventory/Purchase.
3. **Saved dynamic views** — filters + sort + grouping + visible columns saved as named
   personal/team views ("Overdue AR > 100k AMD", "Unreconciled this month"); records
   enter/leave automatically.
4. **Peek side panel** — `Space`/click on any row opens a right panel (summary, inline-editable
   key fields, activity log) without leaving the list; Esc closes; full page one keystroke away.
5. **Optimistic UI + universal undo — with intent-preview gates on fiscal actions** —
   instant apply + undo toast for drafts/metadata; deliberate preview-confirm for posting
   journal entries, finalizing VAT returns, submitting e-invoices. Never auto-post.
6. **Keyboard grammar shared across all apps** — `C`=create, `E`=edit, `X`=select,
   `G then I`=invoices, `G then D`=deals, `?`=shortcut overlay. Same grammar in all 13 apps.
7. **Triage Inbox** (Linear inbox × Midday Magic Inbox) — incoming e-invoices (SRC), receipts,
   and bank lines auto-matched to transactions, presented as confirm/reassign/snooze cards
   with J/K navigation. *The killer feature for Armenian/Russian SMB bookkeeping.*
8. **AI copilot as docked side panel returning artifacts, gated by approval** — chat renders
   tables/charts (not walls of text); proposed actions appear as previews requiring confirm;
   every agent action lands in the audit trail; autonomy dial per action type.
9. **Period-close checklist** — owned, dependency-ordered close tasks with approval gates and
   a progress dashboard; turns existing trial-balance/VAT features into a controller workflow
   no regional competitor has.
10. **Bulk actions on every list** — select 200 bank lines, categorize once, one undo.
11. **Document pipeline steppers** — Quote → Invoice → Payment, Bill → Payment, PO → Receipt →
    Bill as clickable lifecycle bars with one-click "create next document".
12. **One suite shell** — collapsible per-app sidebar + persistent app rail + top bar (global
    search, notifications, org/locale switcher); identical chrome in all apps; settings as
    card-sorted buckets with internal search.
13. **Three-variable LCH theming** — derive light/dark/high-contrast from base + accent +
    contrast à la Linear; A1 brand teal as base, product accent per app tile; dark mode and
    accessibility themes become nearly free.
14. **Empty states that teach + demo data** — every empty list says what will live there and
    offers ONE primary action; value-ordered onboarding checklist; "load sample company"
    button so the dashboard is never blank.
15. **Skeletons + readable URLs + companion-scoped mobile** — content-shaped skeletons;
    deep links like `/finance/invoices/INV-042`; mobile/PWA limited to approve / capture
    receipt / check balances / notifications.

### 3.3 Accounting-specific imperatives

- Table excellence beats everything else — accountants live in ledgers.
- Document flows are guided state machines, not disconnected forms.
- Audit trail UX in three tiers: per-record activity feed; field-level history next to
  critical fields (amounts, account codes, VAT codes); version diff for review.
- Undo for drafts; friction for posted/fiscal documents.
- AI with approval gates is the only acceptable AI in accounting.
- Don't move accountants' cheese: keystroke parity, classic-view escape hatch during the
  transition, opt-in beta cohort.

---

## 4. Target stack (evidence-based, June 2026)

### 4.1 What advanced teams actually use

Verified from default-branch `package.json` of midday, twenty, cal.com, documenso,
trigger.dev, supabase studio, openstatus, dub, frappe-ui, odoo (2026-06-11):

- **TanStack Query v5: 7/9** React products. **react-hook-form + zod: 8/9.**
- **shadcn-style vendored Radix component package: 6/9** (midday, documenso, supabase,
  openstatus, dub, cal.com). Twenty is on Base UI; shadcn CLI v4 now supports both.
- **TanStack Table v8 (6/9) + TanStack Virtual** in every data-dense product.
- **cmdk** (5×), **sonner** (6×), **lucide-react** (6×), **dnd-kit** (5×), **date-fns** (6×).
- AI chat: unanimously **Vercel AI SDK v6 + `@ai-sdk/react` `useChat` + `streamdown`**.
- Genuinely multilingual products (twenty, documenso) use **Lingui v5**, not i18next.
- Freshest toolchains: Tailwind **v4** (cal.com, supabase, openstatus), TypeScript **6.0**,
  Vite 8 (supabase), Vitest 4, Biome 2.

### 4.2 Architecture call: stay a Vite SPA

No Next.js / TanStack Start / SSR. Reasons: the product is a logged-in, offline,
self-hosted desktop tool (SSR/SEO buys nothing); Fastify already owns API + static serving,
and a meta-framework would add a second server runtime to the single-bundle install story;
the closest self-hosted comparable (Twenty) ships exactly this shape. If a meta-framework is
ever forced, React Router v7 framework mode is the self-host-friendly path — not needed now.

### 4.3 The stack

| Concern | Choice | Why (one line) |
|---|---|---|
| Build | **Vite 8** (+ React Compiler babel plugin) | Stable Mar 2026, Rolldown = 10–30× faster builds; direct upgrade path from Vite 6; same `public/` output. |
| Language | **TypeScript 6.0**, incremental (`allowJs`) | Strict-by-default; the cheapest fix for a 12.5k-line JSX file; midday/supabase already on 6.0. |
| Routing | **TanStack Router v1**, file-based, code-split per route | Only fully type-safe params/search in pure SPA mode; mature; search-params double as saved-view URL state. |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`), tokens as CSS variables, dark = `.dark` class | Replaces 12.7k lines of CSS with utilities + ~200 lines of tokens; zero config files in v4. |
| Components | **shadcn/ui (CLI v4) on Radix** | Vendored code = no runtime lock-in, fully offline, accessible; the 6/9 consensus model. |
| Fonts | `@fontsource-variable/inter` + `@fontsource/noto-sans-armenian` | npm-bundled woff2 — offline, guaranteed Armenian glyph coverage. |
| Server state | **TanStack Query v5** + thin typed fetch that `zod.parse`s responses | The 7/9 consensus; cache + invalidation + optimistic updates power patterns #2–#11. |
| Validation | **Zod 4** schemas in `packages/schemas`, shared client/server | Single source of truth; Fastify validator-compiler can consume the same schemas later. |
| Forms | **react-hook-form 7** + `@hookform/resolvers` | 8/9 consensus; uncontrolled perf suits large accounting forms. |
| Tables | **TanStack Table v8 + Virtual v3** (headless) | The exact midday/supabase/trigger combo; Tailwind-styled, zero CSS baggage; add `react-data-grid` later only if a true spreadsheet view is demanded. |
| Kanban/DnD | **dnd-kit** (`core` 6 + `sortable`) | Accessible keyboard DnD; 5/9 consensus (`@dnd-kit/react` still 0.x — later). |
| Client state | **zustand 5** (session, locale, UI prefs only) | Server data lives in Query; smallest thing that works. |
| Charts | **Recharts 3**, lazy-loaded | 5/9 consensus incl. midday's finance dashboards; SVG = printable reports. |
| Palette | **cmdk** | The standard; kbar is abandoned beta. |
| i18n | **Lingui v5** (.po catalogs, macros) + native `Intl.NumberFormat`/`PluralRules` | Compile-time ICU handles ru one/few/many + hy plurals; .po files translators know; zero CDN. |
| Dates | **date-fns v4** + `@date-fns/tz` | Tree-shakable, hy/ru locales included. |
| Icons / toasts / motion | **lucide-react** / **sonner** / **motion v12** (sparingly) | Cohort consensus; motion only where it earns its weight. |
| AI copilot | **Vercel AI SDK v6** (`ai` + `@ai-sdk/react`) + `streamdown`; server side inside Fastify | Unanimous cohort pattern; provider-agnostic → works with local models for the offline story. |
| Testing | **Vitest 4** + Testing Library; **Playwright** E2E + `toHaveScreenshot` | The 2026 default pair; Playwright is the migration safety net (§7 Phase 0). |
| Lint/format | **Biome 2** | One fast tool; midday/documenso/cal.com all switched. |
| Workspace | **pnpm workspaces**: `web/` (app), `packages/schemas`, `packages/ui` | Smallest structure enabling shared zod schemas; add turbo only if build times demand. |

### 4.4 Explicitly avoided

Next.js/TanStack Start (adds a server to an offline product; Start barely past RC) ·
AG Grid (needed features are Enterprise-licensed; ~1MB) · Glide Data Grid (canvas breaks
find-in-page, screen readers, and Armenian IME/complex-script editing) · MUI/AntD/Mantine
(runtime CSS-in-JS, theming fights Tailwind) · Emotion/styled-components (Twenty is spending
engineer-years migrating OFF Emotion) · Recoil (archived) · react-beautiful-dnd (archived) ·
kbar (perpetual beta) · i18next for greenfield (runtime JSON + plugin sprawl; Lingui's
compile-time ICU fits hy/ru better) · SWR (Query won) · moment (dead) · Tremor (post-
acquisition limbo) · tRPC (would force rewriting a working REST API; shared zod schemas +
typed fetch = 80% of the safety for 5% of the cost).

---

## 5. Target experience definition (A1-specific)

1. **Shell** — left app rail (A1 product tiles, ≤13 apps → Slack-style always-visible rail);
   per-app collapsible sidebar; top bar: Cmd+K search, notifications, org switcher,
   locale switcher (hy/ru/en), theme toggle. Identical chrome in every app.
2. **Theming** — A1 brand system: master teal `#1E3A3A` family as base, product accent per
   app (HH amber/dark-red, CRM blue, copper/ruby accents), LCH-derived light/dark/
   high-contrast from base+accent+contrast variables. Tokens defined once, consumed by both
   Tailwind `@theme` and (during migration) legacy CSS.
3. **URLs** — readable deep links: `/finance/invoices/INV-042`, `/crm/deals?view=pipeline`.
   Old `/app/:appId` paths 301-redirect forever.
4. **i18n** — every string through Lingui `t`-macros; hy + ru + en catalogs; money via the
   existing server locale facade conventions (`Intl.NumberFormat('hy-AM'|'ru-RU')`, AMD ֏
   subunit 0 / RUB ₽ subunit 2 — mirrors `server/locale.js` money facade).
5. **Fiscal UX rules** — optimistic+undo for drafts; preview-confirm gates for post/finalize/
   submit; field-level history on amounts/account codes/VAT codes; AI proposes, human approves.
6. **Mobile posture** — responsive shell, but scoped: approve, capture receipt, check
   balances, read notifications. No mobile journal entry.

---

## 6. Migration principles (ranked, from the strategy research)

1. **Safety net before anything** — Playwright golden flows + screenshot baselines in BOTH
   hy and ru locales, committed before the first refactor commit.
2. **Strangler-fig inside one app; flip the shell first** — the custom 60-line router is the
   cheapest seam in the codebase; replacing it buys every later step. Module federation is
   overkill for one team — one repo, one Vite build, lazy `import()` per module.
3. **Slack-style import walls** — `src/legacy/**` and `src/modern/**` with ESLint/Biome
   `no-restricted-imports`; `src/adapters/` is the only door between them.
4. **Tokens first** (Shopify Polaris lesson) — extract `--color-*`, `--space-*`, `--font-*`
   from `styles.css`; point BOTH legacy CSS and Tailwind `@theme` at the same variables;
   palette can then never drift between old and new screens.
5. **CSS containment via `@layer`** — wrap legacy: `@layer legacy { @import "./styles.css"; }`
   with explicit order `@layer legacy, theme, base, components, utilities;`. Tailwind
   **preflight OFF** until the shell flip, then scoped to the modern subtree
   (`@scope`/postcss-prefix-selector). **No shadow DOM** (breaks Radix portals, forms, ARIA).
6. **TypeScript ratchet** — `allowJs: true`, all new files strict TSX; error-count ratchet
   test in CI so the count only goes down; type the API boundary first (highest ROI).
7. **Query early, Router at the flip** — TanStack Query adopts screen-by-screen around the
   existing fetch helpers; TanStack Router replaces the custom helper wholesale in ONE PR
   where every route renders a `<LegacyScreen>` adapter (two routers must never coexist).
8. **New features land in modern only; legacy dies on a schedule** — deletion in the same PR
   as the replacement; weekly coverage dashboard (% routes migrated, `main.jsx` LOC,
   `styles.css` LOC, TS %); the documented failure mode is the permanent hybrid.
9. **Port, then improve** — first pass per screen is like-for-like on the new stack; UX
   changes are separate post-port tickets. The shell flip is the ONE sanctioned visible
   redesign moment. Visual baselines enforce this mechanically.
10. **Measure from reality** — bundle-size budget in CI from day one; perceived-perf claims
    only from P95 measurements.

---

## 7. Phased plan

> **Per-screen Definition of Done** (applies from Phase 4 on): strict TSX · tokens/shadcn
> only, zero `styles.css` classes · strings in Lingui (hy+ru) · data via TanStack Query +
> zod-validated client · Playwright screenshot baselines in both locales · keystroke parity
> with the legacy screen documented · **legacy screen code deleted in the same PR**.

### Phase 0 — Safety net & inventory (1–2 weeks)
- Route inventory from `suite-routes.js` (13 apps × screens, params, traffic rank).
- Playwright E2E + `toHaveScreenshot` for 2–3 golden flows per module (create invoice,
  post opening balances, VAT return view, CRM deal move, PO receipt…), run in **hy and ru**,
  volatile regions masked, baselines committed. Seed fixture dataset incl. fiscal documents
  with known totals (reuse server test fixtures).
- CI: test suite + bundle-size budget on every PR. Network-blocked offline smoke job.
- **Exit:** suite green twice consecutively; flake ≈ 0; route map doc exists.

### Phase 1 — Token bridge + CSS containment (1–2 weeks)
- Extract design tokens from `styles.css` → `tokens.css` (the existing 14 variables grow to
  a full scale: color ramps from the A1 palette, spacing, radii, type, shadows, LCH theme
  derivation for dark/high-contrast).
- Codemod-assisted replacement of the 659 raw `color:` values with `var(--…)` (Atlassian
  pattern: suggested replacements, manually reviewed).
- Wrap legacy CSS in `@layer legacy`; install Tailwind v4 with preflight off, `@theme`
  mapped to the same tokens; declare layer order.
- **Exit:** zero visual diffs vs Phase-0 baselines; a Tailwind-styled probe component renders
  correctly inside a legacy page.

### Phase 2 — Data & type boundary (2–3 weeks, parallel with Phase 1)
- `tsconfig`: `allowJs: true`, `checkJs: false`, strict for new files; Biome 2; import walls.
- `packages/schemas`: zod 4 schemas for the top ~20 endpoints (Finance + CRM first); typed
  fetch client (`zod.parse` in dev, log-only in prod so a schema bug never blanks a screen —
  preserves the `loadOr` philosophy).
- TanStack Query provider at the root; TS-error ratchet test in CI.
- **Exit:** Finance + CRM endpoints schema'd; ratchet enforced; new-code-is-TS lint-enforced.

### Phase 3 — Shell flip (2–4 weeks; the one visible redesign)
- New TSX shell: app rail + sidebar + top bar + Cmd+K palette (navigation-only at first) +
  Lingui provider + LCH theme provider + auth gate — built on tokens/shadcn.
- TanStack Router replaces the custom helper in ONE PR; every route renders
  `<LegacyScreen component={X}/>` adapters; `/app/:appId` → new-path redirect shim.
- Preflight enabled scoped to the modern subtree.
- **Exit:** all golden flows pass; visual diffs confined to nav chrome (deliberate
  re-baseline); old router deleted; rollback = single revert.

### Phase 4 — Pilot module: Desk or Forms (1–2 weeks)
- Smallest, lowest-fiscal-risk modules (`desk.jsx` 76 lines, `forms.jsx` 67) — the
  Slack emoji-picker move. Migrate to full DoD, building the first shared components
  (DataTable, PeekPanel, FilterBar, EmptyState, Stepper) in `packages/ui`.
- Write the **screen migration playbook** an AI agent can execute mechanically
  (convert → validate → feed errors back → retry; the Airbnb LLM-migration pattern).
- **Exit:** module 100% DoD; playbook proven on ≥3 screens; per-screen cycle time known.

### Phase 5 — Finance (4–8 weeks; highest value, highest risk)
- FIRST: fiscal characterization tests asserting rendered **text** of totals/VAT/AMD-RUB
  formatting on fixture documents (screenshots are too coarse for off-by-one-dram bugs);
  centralize all number/date formatting into one `Intl`-based module mirroring
  `server/locale.js` money semantics (subunit 0/2) before touching any screen.
- Migrate screen-by-screen (trial balance, statements, VAT, invoices, bills, payroll,
  opening balances, chart of accounts…), one PR per screen; introduce pattern upgrades only
  AFTER the port of each screen (saved views, peek panel, bulk actions, pipeline steppers).
- **Exit:** Finance 100% DoD; fiscal assertions green; `finance.jsx` + its styles deleted.

### Phase 6 — Long tail (repeat per module)
- Order: CRM → Purchase → Inventory → People → Docs → Projects → Copilot (rebuilt on AI SDK
  `useChat` + streamdown + approval-gated actions) → Analytics/Flow/Campaigns.
- Weekly coverage dashboard: % routes migrated, `main.jsx` LOC remaining, `styles.css` LOC
  remaining, TS %. New features build in modern only.
- **Exit per module:** 100% DoD + legacy deletion.

### Phase 7 — Teardown (1 week)
- Delete `styles.css` and `@layer legacy`; preflight global; `allowJs: false`, full strict;
  delete `LegacyScreen` adapter + import walls; final re-baseline; offline smoke green.
- **Exit:** no file named `main.jsx`; bundle budget met.

### Phase 8 — Experience upgrades (post-migration, prioritized backlog)
Now on solid ground, ship the differentiators from §3.2 that aren't part of like-for-like
ports: Triage Inbox (e-invoice/bank-line matching), period-close checklist, AI-as-column
suggestions, keyboard grammar completion (`G then …` everywhere), onboarding checklist +
sample company, three-tier audit trail UX.

**Realistic calendar for one developer + AI agents:** Phases 0–4 ≈ 6–10 weeks; Finance ≈
1–2 months; long tail ≈ 2–4 months. Slack's full strangler took ~2 years for a large team
and codebase; this codebase is ~28k lines of UI — months, not years, IF the per-screen
playbook + agent loop from Phase 4 holds (Airbnb's agents migrated 75% of 3.5k files in
4 hours once the validate-retry loop existed).

---

## 8. Top risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | CSS bleed both directions (preflight nukes legacy; unlayered legacy overrides Tailwind) | Preflight off until shell flip, then scoped; legacy wrapped in lowest-priority `@layer legacy`; explicit layer order; screenshot gate on every PR. No shadow DOM. |
| 2 | Fiscal display regressions (totals, VAT, AMD/RUB formatting) | Characterization tests assert rendered text on frozen fixtures; one central `Intl` formatting module mirroring server money semantics before any Finance screen moves; backend is stable, so any displayed-number diff is by definition a frontend bug. |
| 3 | i18n extraction debt explodes mid-migration | Extraction is part of per-screen DoD, never a "later" project; lint rule blocks new hardcoded strings; baselines run in both locales (Armenian word lengths break layouts that pass in Russian). |
| 4 | Scope creep — redesigning while porting | "Port, then improve"; the shell flip is the one sanctioned redesign; visual baselines fail "improved" screens mechanically; §3.2 upgrades live in Phase 8 backlog. |
| 5 | Permanent hybrid / dual-maintenance forever | Same-PR legacy deletion; lint-enforced "new features modern-only"; weekly coverage dashboard; per-module deletion dates. |
| 6 | Router/data coexistence breakage | Never two routers: custom helper survives until Phase 3, then wholesale swap with all-legacy adapters + redirect shim; Query adopted before Router so loaders reuse queryFns. |
| 7 | Flaky visual tests erode trust in the safety net | Mask volatile regions; pin one browser+OS in CI; viewport (not full-page) shots for dashboards; re-baseline only via explicit reviewed commits. |
| 8 | Offline/bundle regression | CI bundle budget from Phase 0; fonts/icons/i18n catalogs bundled from npm (no CDN, no http-backend); network-blocked Playwright job every release. |
| 9 | Accountant-user revolt (the QuickBooks lesson) | Keystroke parity documented per screen in DoD; pilot cohort opt-in before default-on; legacy escape hatch until module exit criteria met. |

---

## 9. Governance & metrics

- **Coverage dashboard (weekly):** routes migrated %, `main.jsx` LOC, `styles.css` LOC,
  TypeScript %, TS-error ratchet count, bundle size, screenshot-suite flake rate.
- **CI gates on every PR:** server suite (`--test-concurrency=4`), UI unit (Vitest),
  golden-flow E2E + screenshots (hy+ru), bundle budget, lint walls, TS ratchet.
- **Release gate:** offline smoke (network-blocked) + fiscal characterization suite.

## 10. Immediate next steps (first two weeks, concrete)

1. Approve this plan (or amend stack/sequencing).
2. Phase 0 kickoff: route inventory doc; Playwright + fixtures; golden flows for Finance,
   CRM, Desk in hy+ru; CI wiring; bundle budget baseline.
3. Phase 1 prep in parallel: token extraction PR scaffolding (`tokens.css`, `@layer`
   wrapper, Tailwind v4 install with preflight off).
4. Decision to record at kickoff: pilot module (Desk vs Forms) and Inter vs keeping the
   current type stack as the UI face (token-level swap either way).

---

## Appendix A — Key sources

UX: Linear redesign & docs (linear.app/now/how-we-redesigned-the-linear-ui, /docs/conceptual-model, /docs/inbox, /docs/peek) · Attio quick actions & AI attributes (attio.com) · Stripe dashboard docs + changelog · Midday (github.com/midday-ai/midday) · Twenty releases · Notion/Airtable view docs · Odoo 17/18 release notes · ERPNext v16 / Espresso Figma · QuickBooks Modern Reports + community backlash threads · Xero reimagined blog · pencilandpaper.io enterprise tables & navigation · NN/g empty states · smashingmagazine.com agentic-AI UX patterns (2026).

Toolchain (package.json evidence read 2026-06-11): midday-ai/midday, twentyhq/twenty, calcom/cal.com, documenso/documenso, triggerdotdev/trigger.dev, supabase/supabase, openstatusHQ/openstatus, dubinc/dub, frappe/frappe-ui, odoo/odoo · tailwindcss.com/blog/tailwindcss-v4-3 · vite.dev/blog/announcing-vite8 · react.dev 19.2 + React Compiler 1.0 · TypeScript 6.0 announcement · zod.dev/v4 · TanStack Router/Start docs · shadcn/ui changelog (CLI v4, Base UI support).

Migration: Slack desktop rewrite (slack.engineering) · Shopify Polaris uplift · Atlassian migrate-to-tokens · GitHub Primer · Airbnb ts-migrate + LLM-driven test migration · Frontend Mastery migration guide · CSS-Tricks cascade layers + Playwright visual regression · Tailwind preflight/scoping discussions (#15866, #15803, #6694) · Mixmax & Dylan Vann incremental TS · TanStack Router migration checklist · Notion native-app performance posts · understandlegacycode.com golden master.
