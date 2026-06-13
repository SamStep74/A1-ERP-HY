# RFC: RUB kopeck (minor-unit) precision migration

**Status:** Complete — S1 money-scale facade, S2 scale-aware shared accounting reports, S3
ledger posting/report minor-unit contract, S4 app VAT/money splitters, S5 app input validators,
S6 active currency defaults, S7 RU tax rounding, and S8 defensive data migration are implemented.
**Scope:** A1-Suite-Local money model. Add RUB kopeck precision end-to-end while keeping AMD
and all Armenian (AM) behavior **byte-for-byte identical**.
**Author:** generated from a codebase-wide money-precision analysis (5-facet sweep of
`server/db.js`, `server/ledger.js`, `server/app.js`, `server/accounting.js`, and the vendored
currency engines).

---

## 1. Problem

Every money value is stored as a whole-currency-unit **SQLite `INTEGER`** and forced to a whole
integer via bare `Math.round` at the posting boundary (`server/ledger.js:106` `postEntry`, **7**
pre-rounding callers, and **~56** `Math.round` money sites in `server/app.js`).

This is **lossless for AMD** because AMD's minor unit *is* its major unit
(`a1-localization-am` declares `subunit: 0`; `roundAmd` = round-to-whole-dram). It **silently
truncates kopecks for RUB**, which has `subunit: 2` (`a1-localization-ru` `KOPECKS_PER_RUBLE = 100`,
`roundRub` → 2-decimal). Kopecks are lost **at write time**, before any value reaches
`accounting.js`.

The locale facade (`server/locale.js`) already knows the per-currency scale
(`meta.currency.subunit`) and exposes a per-locale `money.round`, yet `ledger.js`, `app.js`, and
`accounting.js` never consult `subunit` — they hard-code whole-unit `Math.round`, and
`accounting.roundMoney` uses an inconsistent 2-dp model (harmless today only because every value
is already an integer).

**Hard constraint:** the chosen scheme must leave existing AMD rows and AM golden-master outputs
unchanged.

---

## 2. Options considered

| Option | Approach | Verdict |
|---|---|---|
| **A. Integer minor units everywhere** | Redefine the semantic contract of existing `INTEGER` money columns from "whole major units" to "integer minor units" (`minor = round(major·10^subunit)`); scale from `meta.currency.subunit`. No column type change. | Strong |
| **B. REAL / DECIMAL columns** | Store fractional major units in `REAL`. | ❌ Rejected — floats re-introduce the rounding drift we're fixing, break double-entry balance, force a ~280-column type migration, and break the AM no-op. Money-as-float is the anti-pattern. |
| **C. Per-row currency + scale column** | Keep whole-unit integers, add a companion minor/scale column per money row. | ❌ Rejected — doubles the money-column surface, scatters currency branching across ~280 columns, over-engineered for a one-currency-per-org product. |
| **D. Integer minor units, per-locale (per-org) scale** ✅ | Option A, but the scale is resolved from the **active locale / `org.currency`** at read/write time (not a per-row column). One org = one currency, so every row in a tenant shares one subunit. | **Recommended** |

## 3. Recommendation — Option D

Store every money column as an `INTEGER` count of **minor units** (`minor = round(major·10^subunit)`),
with `subunit` resolved from the locale/org facade (`locale.meta.currency.subunit`), **not** a
per-row column. Chosen because it makes AMD a **literal no-op in both dimensions**:

1. AMD `subunit = 0` → factor `10^0 = 1`, so `toMinor`/`fromMinor` are the identity on AMD values —
   every AM computation and golden master is bit-identical.
2. Because the codebase is **one-currency-per-org** (`organizations.currency`, `db.js:47`; and
   `ledger_journal` has no currency column → mono-currency by org), AMD-tenant data is **never
   rescaled or rewritten at all**.
3. Before any migration reads `org.currency` as the scale source, `seedIfEmpty` and the migration
   preflight must initialize/update the tenant's `organizations.locale` and `organizations.currency`
   from the active locale. A fresh `A1_LOCALE=ru` database must not keep the seeded `hy-AM`/`AMD`
   organization and then store RUB as whole rubles.

RUB gets exact integer kopecks. The entire concern is isolated behind **one new money-scale
utility** exposed through the `locale.money` facade (`subunit`, `toMinor(major)→int`,
`fromMinor(int)→major`), so call sites stop hard-coding `Math.round` and instead express intent
("round to whole minor unit"). Integer arithmetic preserves double-entry balance and the
derive-one-leg-by-subtraction discipline exactly — avoiding Option B's fatal flaw.
All integer arithmetic is bounded by `Number.MAX_SAFE_INTEGER`; S3 must either lower per-row major
amount caps after multiplying by `10^subunit` or move RUB aggregate summation to BigInt/SQLite-side
integer arithmetic before relying on exactness claims for large portfolios.

> **RU tax/contribution amount exception:** RU tax computations (НДФЛ, страховые взносы) round to **whole rubles**
> per НК РФ ст. 52. Storage stays exact kopecks; those specific computations apply whole-ruble
> rounding via a **separate, clearly-named** facade helper (`roundToWholeMajor`) — never the
> storage rounder.

---

## 4. Schema changes

**No column type changes and no new minor-unit/scale columns.** All ~280 money `INTEGER` columns
across ~150 tables keep type `INTEGER`; only their documented **semantic contract** changes from
"whole major units" to "integer minor units". This is a contract/comment change, not DDL.

- **Canonical target:** `ledger_journal.amount` (`db.js:870`, `INTEGER NOT NULL`, no currency
  column → mono-currency by org). Index `idx_ledger_journal_source` does **not** reference `amount`,
  so semantics shift is index-safe.
- **Core finance/CRM/inventory money columns** (no DDL, semantics → minor units): `invoices.total/vat`;
  `finance_draft_invoices.subtotal/vat/total`; `finance_payments.amount`; `expenses.subtotal/vat/total`;
  `bills.subtotal/vat/total`; `bill_payments.amount`; `finance_bank_transactions.amount`;
  `finance_src_exports.subtotal/vat/total`; `finance_vat_returns.{output_vat,input_vat,taxable_sales,taxable_purchases,net,payable,credit_carried}`;
  `quotes.subtotal/vat/total`; `quote_lines.unit_price/total`; `purchase_orders.subtotal/vat/total`;
  `purchase_order_lines.unit_cost/subtotal/vat/total`; `purchase_vendor_prices.unit_cost`;
  `catalog_items.list_price/standard_cost`; `stock_quants.average_cost`; `stock_moves.unit_cost/total_cost`;
  `payroll_runs.{gross,income_tax,pension,stamp_duty,total_deductions,net}`; `people_employees.gross_salary`;
  `deals.value`; `customers.lifetime_value/open_receivables`; `crm_leads.estimated_value`;
  `marketing_campaigns.budget`; `crm_deal_forecasts.weighted_value`; `crm_collection_promises.promised_amount`;
  `ai_invoice_overdue_explanations.amount/vat` (checksum input copied from invoice totals).
- **`pilot_*` templated cohort** (~120 tables, derived/denormalized, also carry `payload` JSON +
  `checksum`): `subtotal/total/amount/monthly_total/setup_fee/monthly_ops_fee/first_month_total` shift
  to minor-unit semantics as **one templated change**, not 120 bespoke ones.
- **Currency defaults (orthogonal bug, bundle here):** the **15** `currency TEXT NOT NULL DEFAULT 'AMD'`
  columns (`db.js:47` `organizations` [root config], 246, 278, 378, 405, 500, 551, 616, 716, 796, 837,
  889, 1088, 1102, 1123) mislabel RUB rows as AMD when `currency` is omitted on INSERT. Derive the
  default from `locale.money.code` or drop the `DEFAULT` and force callers to supply it.
- **Non-targets (leave unchanged):** `analytics_metric_snapshots.metric_value REAL` (generic metric —
  do **not** model money as REAL); `quantity`/`received_quantity`/`reserved_quantity`/`min_quantity`
  (unit counts); `probability`/`score`/`health_score`/`confidence`/`match_confidence`/`attribution_weight`
  (non-money).

---

## 5. Code changes

1. **`server/locale.js` money facade (the single seam):** extend both the AM (`~60-66`) and RU
   (`~132-138`) money namespaces with `subunit` (from `meta.currency.subunit`), `toMinor(major)→int`,
   `fromMinor(int)→major` (backed by `10^subunit`), and a tax-only `roundToWholeMajor` (RU →
   `money.roundToWholeRubles`; AM → `roundAmd`). AM `toMinor`/`fromMinor` collapse to `roundAmd`
   (scale 1). RU `toMinor = round(roundRub(v)·100)` via the same EPSILON-safe path; `fromMinor = kopecks/100`.
   Stop dropping `KOPECKS_PER_RUBLE`/`roundToWholeRubles` at the adapter.
2. **`server/ledger.js:106` `postEntry` (THE chokepoint):** replace `Math.round(Number(amount)||0)`
   with subunit-aware conversion. **Define the input contract** unambiguously (recommended: callers
   pass already-minor-unit integers; `postEntry` asserts integer, no re-scaling) so payments
   (which don't pre-round) and invoices/expenses/bills/payroll (which do) scale identically.
3. **`server/ledger.js` pre-rounding callers:** make every money field subunit-aware before
   `postEntry` and keep **derive-one-leg-by-subtraction in integer minor units** — `postOpeningBalance`,
   `postInvoicePosted` (net = subtotal | total−vat), `postExpensePosted`, `postBillPosted`,
   `postPayrollRun` (deductions = totalDeductions | gross−net; `employerContributions` = the most
   kopeck-exposed RU leg).
4. **`server/ledger.js` report paths:** `openingBalances`, `trialBalance`, `vatReport` operate on
   minor units and **descale for display** (`fromMinor`). **Fix the balanced tolerance** (`< 0.01`,
   a whole-currency epsilon meaningless on integer kopecks) → exact `=== 0` (or `< 1` minor unit).
5. **`server/accounting.js:20` `roundMoney`:** redefine for integer-minor-unit semantics (no `*100/100`
   on already-minor integers). Make it scale-aware via the **existing options-injection pattern** (the
   file is intentionally currency-agnostic and must **not** import locale). Retighten the epsilons
   (`> 0.0001` nonZero, `< 0.01` balanced) to `!== 0` / `< 1` minor unit. Ship to **both** runtimes
   (Node `require` + browser `window.HHVAccounting`) simultaneously. Thread that scale/descale
   option through **every** exported report calculator and caller (`calculateSummary`,
   `calculateTaxReport`, `calculateReceivables`, `calculatePayables`, budget/cash-flow/reporting
   callers such as `ledger.payablesReport`), not only `financialStatements`, so RUB reports never
   surface 100x minor-unit totals.
6. **`server/app.js`:** actually **use** `locale.active().money` (imported but unused for precision).
   Route the three VAT splitters through one facade-backed helper, preserving `subtotal+vat===total`
   by deriving one leg: `splitVatInclusive`, `calculateCrmQuoteTotals` per-line split, and the stray
   hardcoded `Math.round(total/1.2)` (also fix its `resolveVatRate` bypass). Migrate VAT-on-net /
   gross-up / weighted-avg-cost sites to minor-unit rounding.
7. **`server/app.js` input validators:** fix the regex+`Math.round` **pairs** so user-entered kopecks
   aren't silently dropped (expense amount, the 4 `normalize*` validators, employee salary, CRM lead
   value, bank-transaction import). Validate against the active currency's subunit and convert via
   `toMinor`. For RUB, cap validated major-unit inputs so `major * 100` and expected aggregate sums
   stay within `Number.MAX_SAFE_INTEGER`, or explicitly route aggregate math through BigInt/SQLite
   integer summation.
8. **`server/app.js` hardcoded `'AMD'`:** derive currency from `locale.active().money.code` at the 6
   SQL INSERT literals and the `|| 'AMD'` response defaults (bundled with the schema DEFAULT review).
9. **RU tax/contribution amount rounding:** wherever RU needs whole rubles (НДФЛ, страховые взносы), call
   `roundToWholeMajor` explicitly — never the storage rounder.

---

## 6. Data migration

Existing rows are **all currently AMD whole-dram integers**, so under Option D the migration is a
**literal no-op for existing data**: AMD `subunit = 0` → factor `10^0 = 1` → `minor = round(major·1)`
= the existing value unchanged. **No AMD value is rewritten.**

Implemented as an **idempotent, double-application-guarded** step in `server/db.js` with a
`money_precision_migrations` marker. The migration discovers tenant money targets from SQLite
schema metadata, verifies every currency-bearing target row matches `organizations.currency`, records
pre/post per-table SHA-256 checksums, and multiplies money columns by `10^subunit` **only** for orgs
whose currency has `subunit > 0`. On AMD databases every affected row remains `subunit 0`, so no
money value is rewritten and pre/post checksums are equal. Fresh `A1_LOCALE=ru` databases seed
`ru-RU`/`RUB` first, then scale the legacy whole-ruble seed rows into stored kopecks once and record
the report under the marker.

**Forward path for RUB:** a new RUB tenant writes integer kopecks from day one via the facade
(`toMinor` at every write site) — no backfill ever needed. The `subunit > 0` branch exists only to
correctly rescale any RUB rows written under the old whole-ruble code (none expected). `pilot_*` rows
embed amounts in `payload` JSON + checksum: AMD-only today (untouched by the no-op); any future RUB
pilot rows must be **re-derived and re-checksummed**, not blindly multiplied.

**Net: zero risk to current data; RUB precision is forward-only behind the facade.**

---

## 7. AM no-op guarantee

AMD/AM stays byte-identical because AMD `subunit = 0` and the whole migration is parameterized by
`scale = 10^subunit`:

1. `toMinor(major) = round(major·1) = roundAmd(major)` (the exact function already in use);
   `fromMinor(int) = int/1 = int` (identity).
2. Every `Math.round` site replaced by "round to whole minor unit" computes the identical value for
   AMD (a minor unit *is* a major unit).
3. `accounting.roundMoney` becomes identity on already-integer AMD values (its 2-dp capacity was
   always dead on whole integers).
4. No AMD row is rescaled (factor 1; scale read from `org.currency`, AMD never touched).
5. Derive-by-subtraction and double-entry balance unchanged (integer arithmetic exact at scale 1).
6. Epsilon tightenings (`0.01` → `0`/`< 1` minor unit) only make balance checks **stricter** on
   values that for AMD were always exact integers, so no AM assertion flips.

RUB (`subunit 2`, scale 100) is the **only** locale whose behavior changes.

---

## 8. Slices (incremental, behind the facade)

| # | Slice | Risk |
|---|---|---|
| **S1** | DONE — Money-scale utility behind the locale facade (`subunit`/`toMinor`/`fromMinor`/`roundToWholeMajor`); pure addition, unit-tested (AM identity, RU ×100 EPSILON-safe). | low |
| **S2** | DONE — Make `accounting.js` scale-aware via options injection; retighten epsilons; ship Node + browser together. | medium |
| **S3** | DONE — Migrate `ledger.js` posting + report sites; define `postEntry` minor-unit contract; fix balanced tolerance → `=== 0`; inject active money scale into finance statements. | **high** |
| **S4** | DONE — Migrate `app.js` VAT splitters + gross-up / VAT-on-net / weighted-avg-cost sites; unify stored-minor split helpers; fix stray `/1.2` rate bypass. | **high** |
| **S5** | DONE — Fix `app.js` input validators (regex+convert pairs) to honor subunit. | medium |
| **S6** | DONE — Kill hardcoded `'AMD'` (6 INSERTs + 15 column DEFAULTs) → derive from `locale.money.code`. | medium |
| **S7** | DONE — RU tax/contribution whole-ruble rounding (`roundToWholeMajor`) for НДФЛ / взносы; storage stays kopecks. | medium |
| **S8** | DONE — Defensive no-op data migration (idempotent, subunit-keyed) + RUB enablement; checksum verification. | low |

**S4 checkpoint proof (2026-06-07):** `server/app.js` now routes project billing, workflow draft
invoice creation, CRM quote totals, purchase explicit unit costs, stock explicit unit costs, and
purchase VAT-on-net calculations through shared locale minor-unit helpers. Verification passed:
focused project/VAT S4 suite (11 pass), adjacent catalog/purchase suite (14 pass), full `npm test`
(786 pass, 0 fail, 0 cancelled), `npm run build:ui` with the existing Vite large-chunk warning, and
fresh smoke (`apps=12`, `kpis=4`).

**S5 checkpoint proof (2026-06-07):** `server/app.js` now validates money input text/number shapes
against the active locale subunit before converting stored app-table money to integer minor units.
Finance expense/bill/payment/receipt/bank imports, opening balances, payroll run/preview inputs,
People salary, CRM lead/deal value, collection promises, project hourly billing, catalog prices,
inventory unit costs, and purchase/vendor unit costs no longer drop RUB kopecks. Calculator and
ledger boundaries descale stored values back to major units before invoking existing major-unit
engines, while AM integer-only validators still reject fractional money where they rejected it
before. Verification passed: focused S5 validator suites (7 pass), opening-balance regression (5
pass), `git diff --check`, full `npm test` (793 pass, 0 fail, 0 cancelled), `npm run build:ui`
with the existing Vite large-chunk warning, and fresh smoke (`apps=12`, `kpis=4`).

**S6 checkpoint proof (2026-06-07):** `server/db.js` now derives seed locale/currency from the
active locale and removes the 15 reviewed SQL currency defaults instead of relying on
`DEFAULT 'AMD'`. Runtime insert/fallback paths in `server/app.js` now use the active currency or
the source row currency for project billing, CRM leads/deals/quotes, catalog items, purchase
vendor prices/orders, finance draft invoices/payments/expenses/bills/bill payments/bank imports,
collection promises, analytics units, and pilot packet currency fields. Regression coverage proves
fresh RU seeds store `ru-RU`/`RUB`, fresh AM seeds still store `hy-AM`/`AMD`, every reviewed
currency column has no SQL default, seeded RU money-bearing rows are RUB, and omitted-currency
runtime inserts inherit RUB. Verification passed: syntax checks for `server/app.js`, `server/db.js`,
the new S6 test, and patched direct-insert tests; exact hardcoded-AMD scans in `server/app.js` and
`server/db.js`; focused S6/kopeck/catalog/purchase/finance/project/docs regression (73 pass);
`git diff --check`; full `npm test` (796 pass, 0 fail, 0 cancelled); `npm run build:ui` with the
existing Vite large-chunk warning; and fresh smoke (`apps=12`, `kpis=4`).

**S7 checkpoint proof (2026-06-07):** the vendored RU payroll engine now routes employer unified
and SME страховые взносы through the whole-ruble tax helper instead of the kopeck storage rounder,
matching the existing НДФЛ whole-ruble treatment while preserving kopecks on gross, net, and
employer-cost amounts. The app payroll preview/run boundary still stores all money as integer
minor units, so rounded RU tax/contribution amounts become whole-ruble values expressed in kopecks
without changing ledger display semantics. Regression coverage proves `100000.50 RUB` keeps salary
kopecks but stores employer insurance as `3000000` kopecks, verifies 50-kopeck whole-ruble round-up
for both НДФЛ and страховые взносы, and checks payroll preview/run ledger rows plus trial-balance
reporting for a rounded-up tax case. Verification passed: syntax checks for
`server/vendor/a1-localization-ru/src/payroll.js`, `test/kopeck-s7-ru-tax-rounding.test.js`, the
patched S5 payroll validator test, and the RU vendor wiring test; focused RU payroll/locale/kopeck
regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/localization-ru-vendor-wiring.test.js test/locale-money-scale.test.js test/kopeck-s7-ru-tax-rounding.test.js test/kopeck-s5-app-validators.test.js test/payroll-endpoints.test.js test/ledger-ru-payroll-contributions.test.js`, 30 pass, 0 fail);
`git diff --check`; full `npm test` (799 pass, 0 fail, 0 cancelled); `npm run build:ui` with the
existing Vite large-chunk warning; and fresh smoke (`apps=12`, `kpis=4`).

**S8 checkpoint proof (2026-06-07):** `server/db.js` now runs the final defensive money-precision
migration after seed/repair layers. The migration marker is inserted once, checksum reports cover the
money target tables and columns, AMD legacy rows stay unchanged with equal before/after checksums,
RUB legacy rows scale from whole rubles to kopecks once, mixed per-row currency evidence fails before
the marker is written, and fresh RU seeds store money as kopecks behind the marker. Verification
passed: syntax checks for `server/db.js` and `test/kopeck-s8-data-migration.test.js`; focused S8
migration regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/kopeck-s8-data-migration.test.js`, 4 pass, 0 fail);
wider kopeck/accounting regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/kopeck-s8-data-migration.test.js test/kopeck-s6-active-currency-defaults.test.js test/kopeck-s7-ru-tax-rounding.test.js test/kopeck-s5-app-validators.test.js test/kopeck-input-validators.test.js test/project-billing.test.js test/catalog.test.js test/purchase.test.js test/payroll-endpoints.test.js test/ledger-ru-posting.test.js test/ledger-ru-payroll-contributions.test.js test/vat-rate-versioning.test.js`, 57 pass, 0 fail);
`git diff --check`; full `npm test` (803 pass, 0 fail, 0 cancelled); `npm run build:ui` with the
existing Vite large-chunk warning; and fresh smoke (`apps=12`, `kpis=4`).

---

## 9. Key risks & mitigations

- **`postEntry` contract ambiguity** — 7 callers pre-round, payments do not; a fuzzy contract scales
  payments differently → broken balance. *Mitigation: assert minor-unit-integers-in (S3).*
- **Derive-by-subtraction drift** — net/vat (or net/deductions) legs penny-safe only if operands share
  scale; the loose `0.01` tolerance could *hide* a 1-kopeck imbalance. *Mitigation: subtract in minor
  units AND tighten tolerance to `=== 0`.*
- **Cross-runtime divergence** — `accounting.js` is shared by Node + browser; one-sided change makes
  offline reports diverge from the API. *Mitigation: S2 ships both, scale injected not imported.*
- **Three parallel VAT splitters** must migrate consistently or totals disagree at the kopeck level.
  *Mitigation: S4 unifies them.*
- **Validators drop kopecks** if regex and conversion aren't changed atomically. *Mitigation: S5.*
- **Hardcoded `'AMD'`** mislabels RUB rows even after precision is fixed. *Mitigation: S6.*
- **RU tax/contribution amounts** legally round to whole rubles — a blanket ×100 is wrong there. *Mitigation: S7
  uses a distinct whole-ruble rounder for НДФЛ and страховые взносы.*
- **Float temptation** (`metric_value REAL` exists) — re-introduces the bug. *Mitigation: REAL ruled
  out for money.*
- **One-currency-per-org invariant** must hold for runtime scale resolution. *Mitigation: S8 asserts
  currency-bearing rows match `organizations.currency` before writing the migration marker.*

---

## 10. Test strategy

- **AM golden-master (regression gate, every slice):** capture current AM outputs as fixtures
  (`api.test.js`, ACC-AR/AP/RPT/STMT characterization suites, seeded INSERT values); assert
  byte-identical AMD storage / ledger / trial balance / statements / aging / VAT after each slice.
  Run `node --test --test-concurrency=4 --test-timeout=60000` (per project memory: bare `node --test`
  swaps a 16 GB Mac to disk → ENOSPC/fake hangs).
- **RU kopeck round-trip:** `toMinor`/`fromMinor` exact inverses for RUB (`123.45 → 12345 → 123.45`),
  EPSILON-safe at float traps (`0.155`, `0.145`), AM identity (factor 1).
- **Double-entry invariant:** every posted entry balances exactly (`debit_minor === credit_minor`),
  AMD + RUB, including derive-by-subtraction documents.
- **VAT-split invariant:** `subtotal + vat === total` in minor units across all three splitters,
  AMD + RUB.
- **Input validators:** RUB `"100.50"` stored as `10050` kopecks (not truncated); AMD `"100.50"` per
  AM rules.
- **Cross-runtime parity:** `accounting.js` in Node vs browser-like context → identical report output.
- **Tax base:** RU НДФЛ/взносы round to whole rubles via `roundToWholeMajor` while storage stays kopecks.
- **Migration:** prove literal no-op on the all-AMD DB (row-count + per-table checksum unchanged) and
  idempotent under double application.
- **E2E (Playwright):** RUB invoice/quote/payment with kopecks → display `1 234,56 ₽` round-trips from
  stored kopecks.
- Target ≥ 80% coverage on the new facade utility and all changed money paths.

---

## 11. Effort

**Medium-to-large.** The **data migration is trivial** (provably a no-op on all-AMD data); the cost
is **breadth of code change, not depth**: ~56 `Math.round` money sites in `app.js`, ~10 round/post/
split/report sites in `ledger.js`, `roundMoney` + 2 epsilons in `accounting.js` (×2 runtimes), and the
facade extension — all mechanical, all funneling through **one** facade utility, with AMD a literal
no-op bounding the regression surface to the golden masters. ~8 slices (S1–S8) deliverable
incrementally; S3/S4 carry the double-entry / VAT invariants and are the high-risk core. Rough
estimate **~1.5–2.5 engineer-weeks** with golden-master gating. The `pilot_*` cohort (~120 tables) is
one templated change, keeping schema scope manageable.
