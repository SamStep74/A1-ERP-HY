# Deep Research Reconciliation: Zoho One vs Salesforce Analysis

Generated: 2026-05-26  
Source report: `../deep-research-report.md`

## Executive Decision

The attached research report changes the Armosphera One plan from "one-to-one Zoho One localization" into a more precise product strategy:

- Use Zoho One as the benchmark for suite ergonomics: one organization, one admin plane, broad app coverage, app assignments, centralized identity, and one invoice.
- Use Salesforce as the benchmark for platform discipline: Customer 360, sales/service depth, data semantics, evented APIs, governance, security, partner-style integrations, and AI guardrails.
- Build Armosphera One as a focused Armenian operating layer, not as a full clone of either vendor.

For this project, "focused" does not mean dropping Armenian finance. HayHashvapah already exists and is part of the product moat, so it should become the suite finance/accounting engine. The report's warning against rebuilding payroll, generic office tools, email hosting, calendaring, HRIS, and chat should be applied to commodity capabilities only.

## Adopt / Localize / Defer / Reject

| Finding from research report | Decision | Armosphera One consequence |
|---|---|---|
| Zoho One is stronger for breadth, standardization, central administration, and one invoice. | Adopt | Keep the suite shell, launcher, app catalog, user/app entitlement model, role administration, audit log, and subscription concept as core. |
| Salesforce is stronger for CRM depth, platform/data extensibility, ecosystem reach, AI/agent layer, and enterprise deployment controls. | Localize | Do not copy Salesforce scale; implement Salesforce-grade patterns for customer profile, sales process, service console, workflow governance, analytics semantics, and AI guardrails. |
| Avoid cloning either suite end-to-end. | Adopt | Replace "build all 50+ app equivalents" with a smaller platform: identity, CRM, deal/order orchestration, service, workflow, integration, analytics, documents, and Armenian finance. |
| Build a focused operating layer for customer/account master data, Tube/order orchestration, service/ticketing, workflow/integration automation, analytics, roles/admin, documents/contracts, and selected mobile/field workflows. | Adopt | This becomes the primary roadmap structure after the shell. |
| Integrate commodity capabilities such as email, calendaring, office docs, payroll, and generic chat rather than rebuilding them. | Localize | Integrate Gmail/Google Calendar/Drive/WhatsApp/Telegram. Do not build email hosting, office suite, or generic chat. Payroll is the exception only where HayHashvapah already provides Armenian payroll/accounting functionality. |
| Salesforce is not a single all-department suite equivalent to Zoho One. | Adopt | Avoid treating Salesforce as an app-count checklist. Use it only for depth benchmarks in CRM, service, data, automation, security, and AI. |
| Zoho's builder layer includes low-code, Flow, RPA, extensions, and serverless. | Localize | Build an internal Workflow Studio and Integration Hub first. Defer RPA and end-user low-code until domain APIs stabilize. |
| Salesforce platform depth comes from Agentforce 360, Data 360, MuleSoft, Flow Automation, DevOps, custom apps, portals, and trust/infrastructure. | Localize | Build API-first services, event bus, connector contracts, audit, semantic metrics, and deployment/security controls before broad AI autonomy. |
| Finance/payroll/HR are broader native Zoho categories, while Salesforce usually relies more on ecosystem/partners. | Localize | Keep HayHashvapah as first-class Finance because Armenian accounting/tax localization is strategic. Defer full HRIS, generic payroll replacement, and broad back-office clones. |
| Use stable APIs, events, and identity standards rather than one-off glue or brittle UI automation. | Adopt | Add app boundary contracts, event schema, idempotent jobs, OAuth/OIDC/SAML/SCIM direction, and connector error handling to the implementation plan. |
| Recent enterprise-agent research suggests complex software automation is still hard and requires structured workflows. | Adopt | AI remains advisory by default. High-risk actions require permission checks, audit, and human approval. |
| MVP could be about four months for a focused team, followed by expansion. | Localize | Use as sequencing guidance, not a committed date. Current prototype remains the shell; next milestone is Customer 360/event bus/Service Hub, not a broad app clone. |
| Security/compliance bar includes TLS, encryption at rest, SSO/MFA, least privilege, immutable audit, privacy/export/delete, backup/restore, SDLC scans, and AI governance. | Adopt | Promote security/compliance from later hardening to day-one acceptance criteria for tenant/admin/workflow/legal/accounting features. |

## Superseded Assumptions

These assumptions in the earlier planning should now be treated as superseded:

- "One-to-one localization" should not mean one app for every Zoho app. It means one-to-one coverage of the important business workflows, localized for Armenia.
- "Salesforce-grade" should not mean enterprise marketplace scale. It means disciplined CRM/service/data/automation/security design.
- "Zoho parity" should not pull us into commodity rebuilds such as mail hosting, office docs, generic chat, broad website builder, or full HRIS.
- AI should not be planned as autonomous suite control. It should start as a permission-aware assistant inside structured workflows.

## Reworked Product Modules

| Module | Status in revised plan | Reason |
|---|---|---|
| Identity, org model, roles, audit | P0 | Required foundation for all suite functions. |
| Core CRM | P0 | Highest-reuse object layer for customer operations. |
| Customer 360 master profile | P0 | The central data product; connects CRM, service, finance, campaigns, documents, and legal state. |
| Deal/order orchestration | P0 | Converts Tube into operational and financial work. |
| Service Hub / Desk | P0 | Promoted because Salesforce service depth is a key benchmark and Armenian SMBs need operator workflows. |
| Workflow Studio | P0 | Product multiplier; must support approvals, dry-run, audit, and retries. |
| Integration Hub | P1 | Needed for Gmail, Calendar, Drive, WhatsApp, Telegram, e-signature, bank/accounting, and future migrations. |
| Operational Analytics | P1 | Semantic metrics and drill-downs are more important than generic charts. |
| HayHashvapah Finance | P0 | Differentiated Armenia-specific accounting/tax/payroll/e-invoicing engine. |
| Document Hub / contracts / e-sign | P1 | Required for quotes, contracts, approvals, signatures, and archives. |
| Inventory / fulfillment | P2 | Valuable for retail/distribution/logistics; after order and finance foundations. |
| Mobile / field workflows | P2 | Useful for sales/service visits; after core data and tasks are stable. |
| Partner/customer portal | P3 | Important later; not needed before internal operating flow is proven. |
| Low-code extension SDK | P3 | Only after stable domain APIs/events exist. |
| AI copilot / agents | P2/P3 | Start narrow in P1 as assistant functions; broader agent layer later. |

## Revised MVP Boundary

The current shell remains useful, but the next MVP should prove the focused operating layer:

1. Tenant identity, roles, app entitlements, and audit.
2. Canonical customer profile with merge/source lineage.
3. Core CRM objects: leads, accounts/customers, contacts, opportunities/deals, activities.
4. Deal-to-order / quote-to-invoice orchestration into HayHashvapah.
5. Service tickets and operator console tied to Customer 360.
6. Workflow events, approvals, dry-run, retries, and audit.
7. Integration stubs for Gmail, Calendar, Drive, WhatsApp/Telegram, e-signature, and finance sync.
8. Operational analytics with defined metrics and drill-downs.
9. Armenian legal/accounting source registry with review status.
10. Permission-aware AI assistant for customer brief, legal/tax RAG, ticket reply draft, deal risk, and workflow suggestion.

## Do Not Build First

The report is explicit enough to narrow the scope. These should remain integrations or later modules:

- Email hosting.
- Full calendar product.
- Office productivity suite.
- Generic internal chat.
- General website builder.
- Full HRIS.
- Marketplace/extension ecosystem.
- RPA.
- Autonomous agents that act across the suite without approval.

## Architecture Direction

The prototype can remain Node/Fastify/SQLite while we prove flows. The production architecture should move toward:

- API-first service boundaries.
- Append-only event log and idempotent workflow jobs.
- PostgreSQL as system-of-record database.
- Object storage for documents.
- Search index for cross-app search.
- Analytics store or warehouse for time-series metrics.
- OIDC/SAML/SCIM-ready identity.
- Secret manager and encrypted tenant credentials.
- Backup/restore tests and RPO/RTO targets.
- Human approval gates for legal, financial, external-message, and AI-generated actions.

## Immediate Plan Changes

1. Keep the Armosphera One shell, but stop expanding it by app count.
2. Build Customer 360 schema and event bus next.
3. Promote Service Hub to the same priority as CRM.
4. Treat Workflow Studio and Integration Hub as core platform, not optional extras.
5. Tie HayHashvapah finance into the customer profile and event flow immediately.
6. Add security/compliance acceptance criteria to every implementation phase.
7. Add a "commodity integration" backlog bucket for Gmail, Calendar, Drive, WhatsApp, Telegram, e-signature, and external migration.
8. Add "defer" tags to office suite, generic chat, HRIS, RPA, marketplace, and autonomous agents.
