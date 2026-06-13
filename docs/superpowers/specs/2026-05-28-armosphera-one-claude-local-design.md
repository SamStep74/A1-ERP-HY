# Armosphera One Claude — Local-Server Edition: Design Spec

**Status:** Proposed — awaiting owner review before implementation planning
**Date:** 2026-05-28
**Author:** Claude (continuation of the Armosphera-One / HayHashvapah / Armosphera CRM line of work)
**Decision-maker:** Samvel

---

## Executive summary

**Armosphera One Claude** is a sovereign, self-hostable Armenian business operating system that delivers one-to-one *functional* parity with Zoho One, runs entirely on the customer's own server, and sends **no data off the box except AI calls the customer explicitly opts into**.

It is built by **evolving the existing `Armosphera-One` prototype** (37+ working slices) into a self-contained local-server product, folding in the **HayHashvapah** accounting engine (incl. RA-law RAG) as the Finance module and the **Armosphera CRM** assets for CRM/Desk/Campaigns. The standalone apps keep running until each module reaches parity.

The strategic wedge: **Zoho One is ~45+ apps and is cloud-only as a suite** — Zoho offers on-prem for individual products (Creator, Analytics) but never the unified suite. A self-hostable, Armenia-resident equivalent does not exist. Armosphera One Claude targets Armenian organizations that legally or operationally cannot use foreign clouds: government, banks/credit organizations, healthcare, legal, defense-adjacent, and privacy-conscious SMBs.

## Locked decisions (this revision)

1. **Scope:** Phased path to **full one-to-one Zoho One functional parity**, localized for Armenia. Keep the focused core already built (CRM, Finance, Service, Workflow, Customer 360) as the spine; expand app-by-app, ordered by Armenian SMB value. This reverses the earlier Cowork `DEEP_RESEARCH_RECONCILIATION.md` decision to permanently stay a "focused layer."
2. **Foundation:** **Evolve `Armosphera-One`** (Fastify + React + SQLite, 37 slices) re-architected for local-server.
3. **Packaging:** **Self-contained, offline-capable** single bundle. Data + DB stay local; zero outbound calls except opt-in AI. Vendored npm libraries are acceptable (they run offline). Optional bundled local AI so even AI is on-prem.
4. **Name:** **Armosphera One Claude** (matches the "Claude-continued fork" convention: HayHashvapah Web Claude, armosphera-smb-crm-claude).

## Product thesis & positioning

- **What it is:** the breadth of a full business suite — sales, finance, support, marketing, projects, HR, documents, analytics, automation, AI — localized for Armenia, on the customer's own hardware.
- **The moat (three layers):** sovereignty (on-prem, Armenia-resident, air-gap-capable) + Armenian localization (hy-first UI, AMD, ՀՎՀՀ/TIN, tax/accounting, legal RAG, ՀԴՄ/SRC, e-signature) + suite breadth.
- **Parity contract:** the *engine, flows, and functions* mirror Zoho One; the *legal database and localization* are Armenian-native, not literal translations. Where Zoho marks features English-only (several Zia capabilities), Armosphera One Claude is Armenian-first by design.

## Architecture — one self-contained bundle

A single Node/Fastify process serves a React/Vite suite shell as static assets and hosts all app modules in-process. One SQLite (WAL) database. Local file storage for documents/blobs. Optional bundled Ollama/Gemma for on-prem AI. Outbound network is **off by default**; only opt-in AI and opt-in channels (Telegram/WhatsApp/SMTP) may ever egress, per-org toggle, keys server-side.

```
Single Node/Fastify process (one port)
  React/Vite suite shell  ──►  served as static assets
  App modules: Directory · CRM · Finance · Desk · Campaigns · Forms ·
               Projects · People · Docs/Sign · Analytics · Flow · ...
  Suite kernel: auth · RBAC · app-entitlements · event bus · audit ·
                Customer 360 · workflow engine · legal registry
  SQLite (WAL)  +  local file storage
  Optional bundled AI: Ollama + Gemma (fully on-prem)
  AI gateway ──(opt-in only, per-org)──► Claude / OpenAI
```

**Key architectural decisions:**

- **One process, one DB, no inter-service network hops.** Each Zoho-equivalent app is an internal module, not a microservice. (Armosphera-One already re-implements CRM/Finance logic internally rather than mounting standalone apps over the network — we continue that pattern; it is what makes "self-contained" real.)
- **DB = SQLite (WAL)** for v1: matches all three existing apps, zero-admin, file-level backup, ideal for single-server. Documented escape hatch to PostgreSQL if an install outgrows it.
- **AI is local-first:** bundled Ollama/Gemma so the assistant and legal RAG work air-gapped. Cloud models are a per-org opt-in toggle; keys stored server-side; PII masked before any cloud call; never the default.
- **Auditable by construction:** append-only event log + immutable audit (already in Armosphera-One) are the spine.

## Consolidation plan (rationalizing existing assets)

| Existing asset | Role in Armosphera One Claude |
|---|---|
| **Armosphera-One** (37 slices) | The **spine**. Re-architected for local-server. Customer 360, event bus, Service Hub, Workflow Studio, governance, grounded AI briefs all carry forward. |
| **HayHashvapah Web Claude** | Accounting engine + **RA-law RAG (4,856 chunks, BM25 + bge-m3)** + payroll + ՀԴՄ become the **Finance module's engine**, ported in (not a separate service). Standalone app keeps running until the module reaches parity. |
| **Armosphera CRM** | Catalog, quote PDFs, email (IMAP/SMTP), Telegram/WhatsApp, import/export feed the **CRM + Desk + Campaigns** modules. |
| **`suite/`** ("HayHashvapah-One", reached Phase 3 w/ event bus) | **Superseded** by the Armosphera-One spine. **Harvest** its event-bus publisher/receiver patterns first, then retire the duplicate. |
| **`orchestrator/`** | Its local-first, confirmation-gated, PII-masking patterns become the **internal event-bus + workflow contracts** (no longer an external MCP bridge). |

## One-to-one parity map: Zoho One → Armosphera One Claude

End state = functional parity with Zoho One's ~45 apps, expressed as coherent Armenian modules. Phase tags: **P0** = built/near-built, **P1/P2/P3** = expansion waves ordered by Armenian SMB value. The living, app-by-app checklist is maintained in `docs/ZOHO_ONE_FEATURE_MAP.md`.

| Zoho One app(s) | Armosphera One Claude module | Phase |
|---|---|---|
| Directory, admin, security, MDM, OneAuth, Vault | **Directory & Admin** — auth, RBAC, app-entitlements, MFA, audit, secrets | P0 ✓ |
| CRM, Bigin | **CRM** — leads, deals, forecast categories, deal health, quotes, Tube, activities | P0 ✓ |
| Books, Invoice, Expense, Payroll, Billing | **Finance** — HayHashvapah engine: accounting, VAT, payroll, ՀԴՄ/SRC, period locks, receivables | P0 ✓ |
| Desk, Assist | **Desk** — cases, SLA, operator console, escalation, CSAT, knowledge | P0 ✓ |
| Flow (RPA deferred) | **Flow / Workflow Studio** — events, approvals, dry-run, retry, rollback, versioning | P0 ✓ |
| Contracts, Sign | **Docs & Sign** — templates, e-sign evidence, signed archive | P0/P1 (evidence built) |
| Analytics, DataPrep, Embedded BI | **Analytics** — semantic metrics, drill-down, role dashboards, exports | P1 |
| Forms, Survey, PageSense | **Forms** — lead capture, consent tracking, surveys/NPS | P1 |
| Campaigns, Marketing Automation, Social | **Campaigns** — segments, sequences, ROI attribution; Telegram/WhatsApp-first | P1 |
| WorkDrive, Writer, Notebook | **Docs / Files** — per-tenant/customer document store, templates | P1 |
| Projects, Sprints | **Projects** — projects, tasks, milestones, time entries | P2 |
| People, Recruit | **People** — directory, leave/attendance-lite, onboarding, payroll handoff | P2 |
| Inventory, Commerce, Checkout | **Inventory / Commerce** — stock, orders, payment links | P2 |
| Bookings | **Bookings** — scheduling for clinics/beauty/services | P2 |
| SalesIQ, Mail, TeamInbox | **Inbox / Chat** — omni-channel intake (Telegram/WhatsApp/email) | P2 |
| Sites, LandingPage, Backstage, Thrive, Webinar | **Sites / Events** — landing pages, events, loyalty | P3 |
| Creator | **Creator-lite** — custom fields/modules, no-code applets | P3 |
| Cliq, Connect, Meeting, Learn | **Collab** — team chat, meetings, internal learning | P3 |
| Log360 | **Security & IT log** — immutable audit export, SIEM-style view | P3 |

**Priority rules when Zoho breadth and depth conflict:**

1. Ship the narrower, deeper workflow first (Salesforce-grade depth) over shallow breadth.
2. Defer any feature lacking Armenian SMB/localization value, even if Zoho has it.
3. Anything touching tax/payroll/accounting/legal/signature/personal-data requires source citation + effective date + review status.
4. AI that can act externally or change money/legal state requires human approval.
5. A feature not testable end-to-end with local demo data does not count as shipped.

## Data & tenancy model

- **Single organization per install** (a company self-hosts for itself), with **multi-company inside it** (matches HayHashvapah — e.g. an accounting firm serving several legal entities). One SQLite DB; `org`/`company` scoping on every row.
- Canonical entities (mostly built): `organization, user, role, app_assignment, contact, deal, quote, invoice, payment, task, ticket, message, employee, document, automation_rule, audit_event, legal_source, legal_article, entity_link`, plus **Customer 360 profile + source lineage + append-only event log**.
- Internal event bus topics (built): `lead.created, deal.stage_changed, quote.sent, quote.accepted, invoice.created, invoice.paid, payment.overdue, ticket.created, task.due, employee.created, document.signed, legal_source.updated` (extended per module).

## AI & legal-RAG

- **Default = local** (bundled Ollama/Gemma) so RAG works offline. **Cloud = opt-in** per org; key server-side; PII masked before egress.
- **Legal RAG:** HayHashvapah's 13 RA-law corpus (BM25 + bge-m3 hybrid) broadened into a maintained `am_legal_knowledge` registry — versioned sources, effective dates, citations, accountant/lawyer **review status** surfaced in the UI.
- **Guardrails (built):** AI is advisory; write/financial/legal/external actions require explicit human approval; every tax/legal answer cites source + effective date + review status; no third-party telemetry by default.

## Localization & legal database

Armenian-first (hy default; ru/en supported): AMD default, ՀՎՀՀ/TIN validation, Armenian dates/phones/marz/address, VAT 20% (Tax Code Art. 63), payroll tables (income tax, funded pension, stamp duty — accountant-reviewed/versioned), ՀԴՄ/SRC offline export packets, e-signature evidence packets, personal-data export/delete governance (RA Law on Protection of Personal Data, in force 2015-07-01). Initial legal source classes: Tax Code, Law on Financial Accounting, Personal Data law, e-Document/e-Signature law, Civil Code, Labor Code, SRC instructions/file-online/e-invoicing.

> Production tax/accounting/legal behavior must be reviewed by a qualified Armenian accountant and lawyer. The app shows citations, effective dates, and review status for every rule it applies.

## Design system

Reuse the **already-unified** tokens (no new design work). The Armosphera-One CSS implements them; CRM and HayHashvapah share them:

```
--canvas #f6f8f4   --surface #ffffff   --surface-soft #edf3ef
--ink #172322      --muted #5f6f6c     --line #dce5df
--brand #0f3b3c (deep green)   --teal #00897b   --copper #c46f3d
--ruby #b23a48     --amber #d78b2f     --blue #2d6cdf
--radius 8px       font: Inter, "Noto Sans Armenian", system-ui
```

First screen is the logged-in suite workspace (app launcher + tasks + alerts + customer/revenue/tax state + next actions), never a marketing landing page.

## Security & compliance posture (the moat)

Day-one acceptance criteria, not later hardening:

- Outbound network **off by default**; opt-in egress allowlist for AI/channels.
- Field-level visibility/redaction for tax, financial, payroll, personal-data, legal notes (built).
- MFA-ready admin; immutable append-only audit; expanded least-privilege roles (Owner, Admin, Accountant, Salesperson, Service Manager, Support, Auditor — built).
- Tenant backup/restore proof with secret exclusion (built); personal-data export + deletion-retention assessment (built).
- Secrets stored 0600 and masked; signed install bundle; restore-into-empty-tenant plan.

## Packaging & install

- Runs as a launchd/systemd service (like HayHashvapah on `:8090`), data in an OS app-support directory **outside any synced folder** (no OneDrive/iCloud).
- One-command install script; optional bundled Ollama model pull; backup cron (WAL checkpoint + rotated copies).
- **No Docker required** (self-contained choice). A Compose file ships as an optional alternative for ops teams that prefer it.
- Optional reverse-proxy/TLS for LAN/intranet access; no public internet exposure required.

## Build sequence (first milestones)

1. **Consolidation foundation:** fork `Armosphera-One` → `Armosphera One Claude`; strip SaaS framing; add local-server config (outbound-off default, bundled-AI path, app-support data dir); harvest `suite/` event-bus patterns then retire it; green tests + smoke.
2. **Finance engine port:** bring HayHashvapah accounting + law-RAG + payroll in as the Finance module (largest single value transfer).
3. **CRM / Desk / Channels hardening** from existing slices + CRM assets.
4. **P1 wave:** Analytics → Forms → Campaigns → Docs/Sign.
5. Each module ships with tests, Armenian demo data, and the security acceptance criteria.

## Assumptions

- SQLite (not Postgres) for v1; documented path to Postgres if needed.
- Single organization per install, multi-company inside it.
- Fork into a **new folder `Armosphera One Claude`** (sibling under `AI Agents/`) rather than mutating the SaaS `Armosphera-One` in place — the SaaS prototype stays intact as reference.
- Finance logic is *ported into* the suite; standalone HayHashvapah keeps running independently until the Finance module reaches parity.

## Open questions / risks

- **45-app surface is large.** Parity is the end state, not the v1 boundary; risk is shallow apps. Mitigation: phase gates, "not shipped unless E2E-testable" rule.
- **Bundled AI quality.** Local Gemma is weak at synthesis; legal answers may need cloud opt-in for accuracy. Mitigation: grounding + citations + review status; one-click provider switch.
- **Legal accuracy.** Requires accountant/lawyer sign-off before any calculation is marketed as compliant.
- **Official SRC/e-invoice integration** feasibility (APIs, credentials, certification) is unverified; v1 produces offline export packets for accountant submission, not live filing.
- **Folder/git topology:** new product gets its own repo; this spec lives in the HayHashvapah planning-hub repo alongside prior research docs.

## Sources

- Zoho One: https://www.zoho.com/one/pricing/ , https://www.zoho.com/one/apps.html , https://www.zoho.com/one/plan-details.html
- Zoho on-prem (individual products only): https://www.zoho.com/creator/help/on-premise/overview.html , https://www.zoho.com/analytics/onpremise.html
- Zoho CRM / Books: https://www.zoho.com/crm/features.html , https://www.zoho.com/bh/books/help/getting-started/zoho-books.html
- RA legal anchors: https://www.arlis.am/ , https://www.pdpa.am/en/legislation , https://src.am/ , https://www.e-gov.am/
- Prior research: `docs/ARMOSPHERA_ONE_RESEARCH.md`, `docs/ZOHO_ONE_FEATURE_MAP.md`, `../Armosphera-One/docs/{ZOHO_SALESFORCE_REWORKED_PLAN,DEEP_RESEARCH_RECONCILIATION,PRODUCT_BASELINE}.md`
