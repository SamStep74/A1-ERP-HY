# Armosphera One Reworked Plan: Zoho One Breadth + Salesforce-Grade Depth

Generated: 2026-05-26  
Status: revised planning baseline after processing `deep-research-report.md`.

## Source Note

The external ChatGPT Deep Research report named `Zoho One vs Salesforce Analysis` has been provided locally as `deep-research-report.md` and reconciled in `docs/DEEP_RESEARCH_RECONCILIATION.md`.

The key instruction from that report is: do not clone either suite end-to-end. Build a focused operating layer that takes Zoho's suite ergonomics, Salesforce's platform discipline, and Armosphera/HayHashvapah's Armenian-localized domain advantage.

## Revised Product Thesis

Armosphera One should not be a literal clone of either Zoho One or Salesforce.

The correct target is:

- Zoho One-style suite breadth: one organization, one login, one app launcher, one admin console, one invoice, and coherent apps for sales, finance, service, marketing, projects, HR, documents, analytics, automation, and AI.
- Salesforce-grade operating depth in the areas that matter most: Customer 360, sales process management, service console, data foundation, automation governance, analytics, and AI-assisted work.
- Armenian-localized execution as the actual moat: Armenian UI and terminology, AMD, ՀՎՀՀ/TIN, Armenian tax/accounting, SRC/file-online/e-invoice workflows, legal-source citations, HayHashvapah accounting depth, Telegram/WhatsApp-first communication, and Armenia-hosted or private-tenant data posture.
- Integration-first scope control: email hosting, calendaring, office documents, generic chat, full HRIS, generic website builder, RPA, and broad marketplace features are not first-build differentiators.

## What Changes From The Original Zoho-First Plan

### 1. Customer 360 Becomes The Core Data Product

The current Customer 360 demo must become the shared profile layer for the suite, not just a dashboard card.

Build a canonical `customer_profile` domain that joins:

- CRM leads, contacts, accounts, deals, quotes, activities, and owner history.
- HayHashvapah invoices, payments, receivables, VAT/accounting status, and period-lock state.
- Service tickets, conversations, SLA state, knowledge articles used, and satisfaction outcomes.
- Campaign touchpoints, consents, forms, segments, bookings, and attribution.
- Legal/compliance signals: personal-data consent, processing purpose, tax identity validation, contract/signature status, and rule citations.

Salesforce reference point: Data 360 / Customer 360 emphasizes a unified customer view across marketing, sales, service, and commerce, while the Agentforce 360 platform is described as aligning data, agent, and application layers around consistent customer context.

### 2. Service Is Promoted To A First-Class App

The original plan treated support/service as partial and later-stage. That is too weak if Salesforce service depth is part of the benchmark.

Armosphera One Desk should move to P0/P1 and include:

- Case/ticket model with customer, channel, status, priority, owner, SLA, and resolution.
- Operator console with current customer context, prior invoices/deals, legal notes, and suggested next action.
- Telegram/WhatsApp/email/manual intake before broad omnichannel expansion.
- Knowledge base articles and Armenian answer templates.
- AI-assisted draft replies, but with human approval and source-visible grounding.
- Supervisor view for queue load, stale tickets, AI-handled interactions, and escalation.

Salesforce reference point: Service Cloud positions case management, service console, knowledge, AI recommendations, digital channels, and supervisor/command-center visibility as central service capabilities.

### 3. CRM Must Become A Revenue Operating System

The current CRM foundation is useful, but the next plan needs Salesforce-grade sales process discipline:

- Lead scoring and routing.
- Activity capture and timeline.
- Opportunity/deal health.
- Forecast categories and weighted forecast.
- Sales stages with required fields and exit criteria.
- Quote approval and contract approval flow.
- Price books, bundles, discounts, tax-aware quote-to-invoice handoff.
- Sales coaching signals and next-best-action suggestions.

Salesforce reference point: Sales Cloud emphasizes activity management, lead management, account/opportunity management, forecast management, Tube management, reporting dashboards, workflow automation, and quote/contract approvals.

### 4. Automation Needs Governance, Not Just Triggers

Armosphera One Flow should become an internal event bus plus workflow engine with deterministic guardrails.

Minimum model:

- Event types: `lead_created`, `deal_stage_changed`, `quote_accepted`, `invoice_created`, `invoice_overdue`, `ticket_created`, `ticket_escalated`, `consent_changed`, `period_closed`.
- Rule builder: trigger, filter, action, approval requirement, retry policy, owner, audit state.
- Human approval gates for financial, legal, external-message, and AI-generated actions.
- Dry-run and test-event mode for every workflow.
- Complete audit trail and rollback/disable controls.

Salesforce reference point: Agentforce 360 publicly frames hybrid reasoning and deterministic workflow control as part of production-grade AI agents. For Armosphera, the practical implementation should start with deterministic workflows and narrow AI suggestions, not autonomous broad action.

### 5. Analytics Becomes A Semantic Layer

The current analytics endpoint is a dashboard aggregator. The reworked plan requires a small semantic layer:

- Standard metrics with definitions: Tube value, forecast, conversion, CAC-lite, campaign ROI, receivables aging, overdue exposure, ticket backlog, SLA risk, tax/VAT readiness.
- Drill-down from KPI to record list.
- Time-series snapshots.
- Exportable owner/accountant reports.
- Role-aware dashboards for owner, salesperson, operator, support, accountant, and admin.

Salesforce reference point: Salesforce bundles CRM analytics, Tableau-oriented insight, and Data 360 context. Armosphera should not copy Tableau; it should provide Armenian SMB-ready metrics that are explainable and tied to source records.

### 6. AI Is A Controlled Assistant, Not A Product Slogan

AI scope should be narrowed and testable:

- Armenian legal/tax RAG with citations and effective dates.
- Customer 360 briefing.
- Draft WhatsApp/Telegram/email replies.
- Deal risk explanation.
- Invoice overdue explanation and suggested follow-up.
- Ticket summarization and knowledge recommendation.
- Admin workflow builder helper.

Every AI result must show grounding, confidence, and whether it is advisory only. Financial/legal outputs need accountant/lawyer review status.

## Revised Implementation Phases

### Phase 0: Deep Research Reconciliation

Acceptance:

- `deep-research-report.md` is treated as the imported source report.
- Material findings are classified as `adopt`, `localize`, `defer`, or `reject` in `docs/DEEP_RESEARCH_RECONCILIATION.md`.
- The feature map is updated with Salesforce depth and platform-discipline implications.
- Any conflicting assumption in earlier docs is superseded by the reconciliation doc.

Status: completed for the current report.

### Phase 1: Suite Foundation Hardening

Current project already has a working shell, demo tenant, app launcher, entitlements, Customer 360 demo, legal sources, analytics, and tests.

Next changes:

- Add canonical customer profile tables and merge rules.
- Add suite event table and append-only event API.
- Add app boundary contracts for CRM, Finance, Desk, Campaigns, Analytics, and Flow.
- Add integration boundary contracts for Gmail, Calendar, Drive, WhatsApp, Telegram, e-signature, and finance sync without rebuilding those commodity products.
- Add role model beyond `owner/admin/operator/support`: accountant, salesperson, service manager, auditor.
- Add field-level visibility for tax, financial, and personal-data fields.
- Add importable legal-source review status.
- Add security/compliance acceptance criteria: MFA-ready admin path, immutable audit events, export/delete workflow stub, backup/restore proof, and secret-management boundary.

Acceptance:

- Tests prove app entitlements, field visibility, event emission, audit logging, and profile joins.
- Demo data includes at least one customer with CRM, finance, ticket, campaign, consent, and legal/tax context.

### Phase 2: Salesforce-Grade CRM Core

Build:

- Lead/account/contact/deal/activity objects.
- Tube stages with required fields.
- Forecast and deal health.
- Lead scoring/routing.
- Quote approval and quote-to-invoice handoff.
- Customer timeline.

Acceptance:

- A lead can be captured, scored, converted, quoted, approved, won, and handed to HayHashvapah invoice flow.
- Audit and Customer 360 reflect every step.

### Phase 3: Desk / Service Console

Build:

- Ticket model and support queue.
- Conversation/channel intake.
- SLA-lite rules.
- Knowledge base.
- AI draft replies with source grounding.
- Supervisor command view.

Acceptance:

- A WhatsApp/Telegram-style inbound message creates a case, links to Customer 360, suggests a knowledge answer, records a human-approved reply, and updates queue metrics.

### Phase 4: HayHashvapah Finance As The Accounting Engine

Build:

- CRM quote/deal to invoice.
- Invoice status and receivables sync back to Customer 360.
- Period-lock awareness in suite workflows.
- E-invoice/export state.
- Accountant review queue.

Acceptance:

- A closed/won deal creates an invoice or draft invoice in the finance app.
- Backdated writes respect period-close lock state.
- Overdue invoices create CRM/service tasks through Flow.
- The finance app is treated as an Armenian localization differentiator, while generic finance/payroll suite expansion remains deferred unless already present in HayHashvapah.

### Phase 5: Flow, AI, And Governance

Build:

- Event bus.
- Workflow/rule builder.
- Dry-run mode.
- Approval gates.
- AI assistant tools for customer brief, legal/tax question, reply draft, deal risk, and workflow suggestion.

Acceptance:

- Every automation has owner, version, last run, dry-run proof, audit trail, and rollback/disable path.
- AI cannot send external messages or create financial/legal changes without explicit approval.

### Phase 6: Analytics And Vertical Templates

Build:

- Semantic metric definitions.
- Owner/operator/accountant dashboards.
- Clinic/wellness first vertical template.
- Campaign ROI and receivables dashboards.

Acceptance:

- Pilot owner can answer: who owes money, which leads are stuck, which tickets are late, which campaigns produced paying clients, and what tax/accounting actions need review.

## Product Priority Rules

Use these rules when Zoho and Salesforce benchmarks conflict:

1. If Zoho has breadth and Salesforce has depth, ship the narrower Salesforce-grade workflow first.
2. If a feature lacks Armenian SMB/localization value, defer it even if both global products have it.
3. If a feature touches tax, payroll, accounting, legal, signatures, or personal data, require source citation, effective date, and review status.
4. If AI can act externally or change money/legal state, require human approval.
5. If a feature cannot be tested end-to-end with local demo data, do not count it as shipped.

## Immediate Backlog Reorder

1. Build canonical Customer 360 schema and event bus.
2. Promote Desk/service console to near-term app.
3. Add lead scoring/routing, forecast categories, quote approval, deal health, and activity timeline.
4. Add HayHashvapah finance sync with period-lock and receivables awareness.
5. Add Workflow Studio dry-run, approval gates, retries, owner/version state, and audit trail.
6. Add Integration Hub stubs for Gmail, Calendar, Drive, WhatsApp, Telegram, e-signature, and migration import/export.
7. Add legal/personal-data consent fields, source citations, and review status.
8. Add semantic analytics definitions, drill-downs, and role dashboards.
9. Add security controls: MFA-ready admin model, field visibility, backup/restore proof, secret boundary, export/delete flow.
10. Package the first clinic/wellness pilot template.

## Sources Checked For This Rework

- Zoho One pricing, apps, and plan details: https://www.zoho.com/one/pricing/ , https://www.zoho.com/one/apps.html , https://www.zoho.com/one/plan-details.html
- Zoho CRM feature benchmark: https://www.zoho.com/crm/features.html
- Zoho Books flow benchmark: https://www.zoho.com/bh/books/help/getting-started/zoho-books.html
- Salesforce Sales Cloud / Agentforce Sales: https://www.salesforce.com/sales/cloud/
- Salesforce Service Cloud / Agentforce Service: https://www.salesforce.com/service/cloud/
- Salesforce Service product surface: https://www.salesforce.com/service/all-products/
- Salesforce Data 360 / customer data platform: https://www.salesforce.com/marketing/data/
- Salesforce engineering overview of Agentforce 360 platform architecture: https://engineering.salesforce.com/how-agentforce-data-and-apps-turned-the-salesforce-stack-into-agentforce-360/
- Salesforce Agentforce 360 announcement: https://investor.salesforce.com/news/news-details/2025/Welcome-to-the-Agentic-Enterprise-With-Agentforce-360-Salesforce-Elevates-Human-Potential-in-the-Age-of-AI/default.aspx
