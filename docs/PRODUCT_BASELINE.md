# Armosphera One Product Baseline

This project starts from the research documents in `../HAy Hashvapah Web Claude/docs/`:

- `ARMOSPHERA_ONE_RESEARCH.md`
- `ZOHO_ONE_FEATURE_MAP.md`

The active execution plan is now revised by:

- `docs/ZOHO_SALESFORCE_REWORKED_PLAN.md`
- `docs/DEEP_RESEARCH_RECONCILIATION.md`

This revision processes the attached `deep-research-report.md`. Zoho One remains the suite breadth and ergonomics benchmark, Salesforce sets the platform-depth benchmark, and Armosphera One is now scoped as a focused Armenian operating layer rather than a full clone of either product.

Commodity capabilities such as email hosting, calendaring, office documents, generic chat, full HRIS, generic website builder, RPA, and broad marketplace features are integration targets or later modules. HayHashvapah remains first-class because Armenian accounting, tax, payroll, legal RAG, e-invoice/export, and period-lock behavior are a differentiated local product advantage.

Phase 1 acceptance boundary:

- Suite login/session.
- Organization profile.
- Users, roles, and app entitlements.
- App launcher with CRM, Finance, Desk, Campaigns, Projects, Catalog & Inventory, People, Docs, Analytics, Flow.
- Audit events.
- Customer 360 spanning CRM, finance, service, automation, and legal/accounting context.
- Armenian-first demo data and localization anchors.

## Implemented Slice 1: Customer 360 And Event Bus

Status: shipped in the local prototype on 2026-05-26.

- Added canonical customer profile records over seeded customers.
- Added customer profile source lineage for CRM, HayHashvapah Finance, Desk, and Campaign consent.
- Added append-only suite event log.
- Added `/api/events` list and create endpoints.
- Extended `/api/customer-360/:id` with `profile`, `profileSources`, and `timeline`.
- Extended analytics with event counts.
- Updated the workspace UI with canonical profile quality, source confidence, operating timeline, and platform event-bus panels.
- Added API tests for source lineage, event statistics, event creation, customer timeline updates, and audit capture.

## Implemented Slice 2: Service Hub And Governed Approvals

Status: shipped in the local prototype on 2026-05-26.

- Added service case records over seeded tickets.
- Added case messages with inbound and assistant-draft states.
- Added workflow approvals with financial/legal risk levels, pending/approved/rejected lifecycle, and owner-only decision endpoint.
- Added `/api/service/console`, `/api/service/cases`, `/api/service/cases/:id/replies`, `/api/workflow/approvals`, and `/api/workflow/approvals/:id/decision`.
- Connected service cases and workflow approvals back into Customer 360.
- Added suite events and audit records for service case creation, service replies, and approval decisions.
- Updated the workspace UI with Service Hub operator console, SLA queue metrics, knowledge suggestions, and Workflow Studio approval queue.
- Added API tests for service queue/SLA context, case creation/timeline propagation, owner approval decisions, and approval audit records.

## Implemented Slice 3: Executed Workflow To CRM Task

Status: shipped in the local prototype on 2026-05-26.

- Added CRM task records as the CRM-side operational output of approved workflow actions.
- Added workflow run records with approval idempotency, result type, result id, payload, and completion timestamps.
- Added `/api/workflow/approvals/:id/execute` and `/api/workflow/runs`.
- Enforced that pending approvals cannot execute, rejected approvals cannot execute, and already-executed approvals return the existing run/task instead of creating duplicates.
- Implemented the first executable workflow action: approved overdue HayHashvapah invoice -> CRM collection task.
- Connected created CRM tasks and workflow runs back into Customer 360.
- Added suite events and audit records for `crm.task.created` and `workflow.action.executed`.
- Updated the workspace UI with an approval execution control, CRM task rows, workflow run rows, and run history.
- Added API tests for pre-approval blocking, execution, idempotency, Customer 360 propagation, run listing, and audit capture.

## Implemented Slice 4: Deal Approval To HayHashvapah Draft Invoice

Status: shipped in the local prototype on 2026-05-26.

- Added Armenian finance period records with open/closed status, close/reopen owner controls, and audit/suite events.
- Added HayHashvapah draft invoice records with VAT-inclusive 20% AMD breakdown, period key, due date, deal lineage, and idempotent workflow source key.
- Added the governed `finance.invoice.propose` action for the existing `deal won -> draft HayHashvapah invoice` workflow rule.
- Enforced period lock blocking before any draft finance record is created.
- Added `/api/finance/periods`, `/api/finance/periods/:periodKey/close`, `/api/finance/periods/:periodKey/reopen`, and `/api/finance/draft-invoices`.
- Connected draft invoices and the current finance period back into Customer 360.
- Updated Workflow Studio so owner-approved finance workflow actions create draft HayHashvapah invoices.
- Added API tests for finance period visibility, draft invoice execution/idempotency, Customer 360 propagation, run listing, audit capture, and closed-period blocking.

## Implemented Slice 5: Draft Invoice Posting And Payment Receipt

Status: shipped in the local prototype on 2026-05-26.

- Added draft-to-official invoice posting with an immutable link between the HayHashvapah draft invoice and the posted receivable.
- Enforced the same Armenian finance period lock before posting a draft invoice.
- Added payment receipt records with method, reference, paid date, period key, source idempotency, and customer/invoice lineage.
- Updated invoice status to `partial` or `paid` based on recorded payments.
- Added `/api/finance/draft-invoices/:id/post`, `/api/finance/payments`, and `/api/finance/invoices/:id/payments`.
- Connected invoice links and payment receipts back into Customer 360.
- Updated the workspace UI with posted invoice, payment, and draft-link finance ledger visibility.
- Added API tests for posting idempotency, payment idempotency, Customer 360 propagation, audit capture, and closed-period blocking for both posting and payments.

## Implemented Slice 6: Public Quote Acceptance To Deal Won

Status: shipped in the local prototype on 2026-05-26.

- Added CRM quote records, quote line items, public quote tokens, and immutable quote acceptance records.
- Added unauthenticated public quote viewing and acceptance endpoints for Armenian customer quote links.
- Public quote acceptance now marks the linked CRM deal as `Won` with 100% probability.
- Accepted quotes automatically create a governed `finance.invoice.propose` approval so the HayHashvapah draft invoice path remains owner-controlled.
- Added suite events for `crm.quote.accepted`, `crm.deal.won`, and the generated workflow approval.
- Connected quotes and quote acceptances back into Customer 360.
- Updated the workspace UI with CRM quote and quote acceptance rows.
- Added API tests for public quote viewing, idempotent acceptance, deal-won transition, approval generation, Customer 360 propagation, and audit capture.

## Implemented Slice 7: Outbound Connector Webhooks

Status: shipped in the local prototype on 2026-05-26.

- Added owner-managed outbound webhook endpoints with enabled event list, target URL, and masked signing secret.
- Added webhook delivery records with event key, subject, customer, status, attempt count, response status/body, retry timestamp, and delivered timestamp.
- Added HMAC SHA-256 request signing with `x-armosphera-signature`.
- Added synchronous delivery for `quote_accepted`, `deal_won`, and first-time `invoice_paid` connector events.
- Added manual retry endpoint for failed webhook deliveries.
- Added `/api/integrations/webhooks`, `/api/integrations/webhook-deliveries`, and `/api/integrations/webhook-deliveries/:id/retry`.
- Updated the workspace UI with an Integration Webhooks delivery-log panel.
- Added API tests for signed quote/deal delivery, first-time-only invoice-paid delivery, failed delivery capture, and manual retry.

## Implemented Slice 8: Cited Armenian Legal Guidance

Status: shipped in the local prototype on 2026-05-26.

- Added legal question, legal answer, and legal answer source records for Armenian localization workflows.
- Added deterministic source selection for VAT/tax, personal-data consent/export/delete, and e-signature/document questions.
- Added `/api/legal/questions` for creating and listing cited guidance by customer.
- Cited legal/tax answers now create governed `legal.answer.approve` workflow approvals when review is required.
- Added suite events and audit records for `legal.question.asked`, `legal.answer.generated`, and generated approval requests.
- Connected legal questions, answers, sources, and review approvals back into Customer 360.
- Updated the workspace UI with a Customer 360 Legal Guidance control and cited-source display.
- Added API tests for VAT answer citation, personal-data source selection, approval queue propagation, Customer 360 propagation, and approval audit capture.

## Implemented Slice 9: Approved Legal Answer Publication

Status: shipped in the local prototype on 2026-05-26.

- Added legal publication records as the governed output of approved cited legal answers.
- Added executable workflow support for `legal.answer.approve`.
- Executing an approved legal answer now creates a `legal_publication` workflow run, marks the question published, clears the answer review flag, and keeps approval execution idempotent.
- Added suite events and audit records for `legal.answer.published` and `workflow.action.executed`.
- Connected published legal answers back into Customer 360 through the answer publication object and workflow-run history.
- Updated Workflow Studio so legal-answer approvals can be approved and published from the workspace.
- Added API tests for publication execution, idempotent re-execution, Customer 360 propagation, run listing, timeline propagation, and audit capture.

## Implemented Slice 10: Legal Source Registry Review

Status: shipped in the local prototype on 2026-05-26.

- Added legal source review records for maintained and professionally reviewed Armenian legal/accounting source versions.
- Added `/api/legal/sources/:id/reviews` with status, effective date, title, URL, review note validation, Owner/Admin maintenance access, and source-specific Accountant/Lawyer professional review access.
- Legal source reviews update the source registry while preserving review history, latest reviewer, and review count.
- Legal answers now cite source metadata that reflects the latest reviewed legal source version.
- Added suite events and audit records for `legal.source.reviewed`.
- Updated the workspace Legal and accounting readiness panel with legal source registry cards and VAT review action.
- Added API tests for owner source maintenance, professional source review, source listing with latest review metadata, answer citation freshness, audit capture, and non-reviewer rejection.

## Implemented Slice 11: SRC Offline Export Packet

Status: shipped in the local prototype on 2026-05-26.

- Added finance SRC export records for period-level HayHashvapah invoice export packets.
- Added owner-only `/api/finance/src-exports` create endpoint and authenticated listing endpoint.
- Export packet creation requires an open finance period, at least one posted HayHashvapah invoice for that period, and an active reviewed VAT legal source.
- Export payloads include organization tax identity, period metadata, reviewed legal source metadata, invoice/customer TIN rows, totals, and SHA-256 checksum.
- Export creation is idempotent by period and does not claim live SRC submission; packets are prepared for accountant review.
- Added suite events and audit records for `finance.src_export.created`.
- Updated the workspace Legal and accounting readiness panel with SRC export packet cards and a Prepare SRC action.
- Added API tests for missing reviewed VAT-source blocking, idempotent export creation, packet payload/checksum correctness, export listing, audit capture, and period-lock blocking.

## Implemented Slice 12: Armenian E-Signature Evidence Packet

Status: shipped in the local prototype on 2026-05-26.

- Added Docs & Sign signature evidence packet records for accepted public quote evidence.
- Added owner-only `/api/docs/signature-packets` creation and authenticated packet listing.
- Packet creation requires an accepted CRM quote and an active reviewed Armenian e-signature legal source.
- Evidence payloads include organization/customer tax identity, accepted quote details, signer name/email, accepted timestamp, IP/user-agent evidence, legal source metadata, and SHA-256 checksum.
- Packet creation is idempotent by quote and is explicitly a Docs & Sign handoff artifact, not a qualified signature service.
- Added suite events and audit records for `docs.signature_packet.created`.
- Connected signature packets into Customer 360 under the Docs context and the operating timeline.
- Updated the workspace Legal and accounting readiness panel with e-sign evidence cards, Prepare eSign action, and e-sign source review action.
- Added API tests for e-sign source prerequisite blocking, idempotent packet creation, payload/checksum correctness, listing, Customer 360 propagation, timeline propagation, and audit capture.

## Implemented Slice 13: Armenian Personal-Data Export Governance

Status: shipped in the local prototype on 2026-05-26.

- Added privacy request and privacy export packet records for customer personal-data fulfillment workflows.
- Added authenticated `/api/privacy/requests` create/list endpoints.
- Export request creation requires an active reviewed Armenian personal-data legal source.
- Export requests create governed `privacy.request.approve` workflow approvals with legal risk.
- Executing an approved request creates an idempotent `privacy_export_packet` workflow run, marks the request fulfilled, and preserves repeated execution safety.
- Export payloads include customer identity, canonical Customer 360 profile, source lineage, CRM quote context, request metadata, reviewed legal source metadata, disclaimer, and SHA-256 checksum.
- Added suite events and audit records for `privacy.request.created`, `privacy.export_packet.created`, and `workflow.action.executed`.
- Connected privacy requests and export packets into Customer 360, suite payloads, the operating timeline, Workflow Studio, and the Armenia localization readiness panel.
- Added workspace actions for personal-data source review and export packet preparation.
- Added API tests for missing reviewed personal-data-source blocking, governed approval execution, idempotent re-execution, payload/checksum correctness, listing, Customer 360 propagation, timeline propagation, and audit capture.

## Implemented Slice 14: Personal-Data Deletion Retention Assessment

Status: shipped in the local prototype on 2026-05-26.

- Extended privacy requests to support governed `delete` requests in addition to export requests.
- Added privacy retention assessment records for deletion requests that must be checked against Armenian business, accounting, contract, and service-retention context.
- Executing an approved delete request now creates an idempotent `privacy_retention_assessment` workflow run instead of deleting customer data automatically.
- Assessment payloads include customer identity, canonical profile state, authoritative retained profile sources, HayHashvapah invoice/payment context, CRM quote context, service cases, erasable marketing/support candidates, reviewed legal source metadata, recommendation, and SHA-256 checksum.
- Added `restrict-delete-retain-statutory-records` recommendation when finance, payment, or contract/quote records are present.
- Added suite events and audit records for `privacy.retention_assessment.created` and workflow execution.
- Connected retention assessments into Customer 360, privacy request listing, suite payloads, Workflow Studio, and the Armenia localization readiness panel.
- Added workspace action for deletion assessment preparation.
- Added API tests proving delete requests are approval-gated, customer data remains intact, statutory records are retained, repeated execution is idempotent, and Customer 360/timeline/audit propagation works.

## Implemented Slice 15: Customer 360 Field-Level Visibility

Status: shipped in the local prototype on 2026-05-26.

- Added role-aware Customer 360 access policy metadata to every customer profile response.
- Owner/Admin users retain full Customer 360 access.
- Non-owner roles receive a `support-customer360-redacted` response that preserves operational service context while redacting tax identifiers, direct contact fields, financial amounts, VAT context, profile match keys, privacy payloads, document evidence payloads, workflow payloads, and sensitive timeline payload fields.
- Added audit records for `customer360.sensitive_fields.redacted` whenever a restricted role opens Customer 360.
- Updated the workspace Customer 360 panel with access-policy status and restricted amount rendering.
- Added API tests proving Support can use Customer 360 without receiving sensitive tax, finance, privacy, legal-answer, or payload data.

## Implemented Slice 16: Tenant Backup and Restore Proof

Status: shipped in the local prototype on 2026-05-26.

- Added owner-only tenant backup packets with checksum, table counts, exclusion metadata, note, creator, and creation timestamp.
- Added `/api/admin/backups` listing and creation endpoints plus `/api/admin/backups/:id/restore-proof` verification endpoint.
- Backup payloads include tenant organization state, app assignments, Customer 360 data, CRM, service, finance, quote, document, legal, workflow, suite event, and audit records needed for restore readiness.
- Backup payloads explicitly exclude sessions, user credentials, webhook signing keys, and quote public-access tokens.
- Webhook endpoints are retained with `secretExcluded: true` so restore operators know secrets must be re-entered.
- Restore proof verifies checksum integrity, sanitized secret scan, table counts, and restore-only-into-empty-tenant plan.
- Added audit records for `admin.backup.created` and `admin.backup.restore_proof.verified`.
- Updated the workspace with an owner-only Backup and Restore tenant proof panel.
- Added API tests proving sanitized payload creation, checksum correctness, secret exclusion, restore-proof verification, listing without payload leakage, audit capture, and non-owner rejection.

## Implemented Slice 17: Role Model And Access Review Evidence

Status: shipped in the local prototype on 2026-05-26.

- Added expanded Armenia SaaS roles: Accountant, Lawyer, Salesperson, Service Manager, and Auditor.
- Added least-privilege app entitlements for the expanded roles while preserving Owner/Admin full-suite access and Support's restricted service-facing access.
- Added owner-created access review packets with role summaries, user lists, app matrix, privileged-user inventory, orphaned assignment-role findings, governance controls, and SHA-256 checksum.
- Added auditor-readable `/api/admin/access-reviews` listing while keeping packet creation owner-only.
- Added suite events and audit records for `admin.access_review.created`.
- Added access review packets to tenant backup scope so governance evidence is restorable with the tenant.
- Updated the workspace with an Admin Governance access-review panel for Owner and Auditor roles.
- Added API tests proving expanded role login/entitlements, owner-created review packet integrity, auditor read-only visibility, checksum correctness, password-hash exclusion, and audit capture.

## Implemented Slice 18: CRM Lead Scoring And Conversion

Status: shipped in the local prototype on 2026-05-26.

- Added CRM lead records for Armenian SMB intake across Instagram, WhatsApp, Telegram, manual, and other sources.
- Added deterministic lead scoring, hot/warm/cold rating, qualified/new status assignment, and Salesperson routing.
- Added `/api/crm/leads` listing and creation plus `/api/crm/leads/:id/convert` conversion endpoint.
- Lead conversion creates a Customer 360 customer, canonical customer profile, source lineage, first qualified deal, and CRM conversion activity with forecast category.
- Conversion is idempotent: repeating conversion for the same lead returns the existing customer, deal, and activity.
- Added suite events and audit records for `crm.lead.created` and `crm.lead.converted`.
- Connected CRM activities into Customer 360 and tenant backup scope.
- Updated the workspace with an Armosphera CRM Lead Tube panel for capture, scoring visibility, qualified Tube value, and hot-lead conversion.
- Added API tests proving lead capture/scoring/routing, qualified Tube summary, conversion propagation into Customer 360/timeline, idempotency, audit capture, and auditor write rejection.

## Implemented Slice 19: CRM Forecast And Deal Health

Status: shipped in the local prototype on 2026-05-26.

- Added CRM deal forecast records with forecast category, close date, weighted value, health score, health status, manager note, updater, and timestamps.
- Added `/api/crm/forecast` summary endpoint and `/api/crm/deals/:id/forecast` update endpoint.
- Deal health now calculates deterministic reasons such as quote sent, commit category, current close date, probability alignment, and HayHashvapah handoff readiness.
- Weighted forecast uses current deal value and probability, grouped by forecast category for owner/sales review.
- Customer 360 deals now include forecast category, weighted value, health score/status, health reasons, close date, and manager note.
- Added suite events and audit records for `crm.deal.forecast_updated` / `crm.deal.forecast.updated`.
- Added deal forecasts to tenant backup scope.
- Updated the workspace with a Sales Forecast / Deal Health panel and inline forecast/health context in Customer 360 deal rows.
- Added API tests proving salesperson forecast update, weighted forecast summary, Customer 360/timeline propagation, audit capture, and support-role write rejection.

## Implemented Slice 20: Governed Quote Release Approval

Status: shipped in the local prototype on 2026-05-26.

- Added authenticated CRM quote creation for draft Armenian quotes tied to an existing customer and deal.
- Added `/api/crm/quotes/:id/request-approval` to create an idempotent governed `crm.quote.release` workflow approval.
- Public quote links now remain hidden until the quote is released; draft quotes return 404 through the public quote endpoint.
- Executing an approved quote-release workflow marks the quote `sent`, sets `sentAt`, records a `crm_quote_release` workflow run, and exposes the public acceptance URL.
- Added suite events and audit records for `crm.quote.created`, `crm.quote.release_requested`, `crm.quote.released`, and workflow execution.
- Narrowed quote-to-invoice finance approval lookup so quote release approvals do not collide with accepted-quote invoice approvals.
- Updated Workflow Studio so quote-release approvals can be approved and executed from the workspace.
- Added a Quote Governance panel for creating a draft quote and requesting public release approval.
- Added API tests proving draft quote creation, hidden public quote links before release, idempotent approval request, release execution, public quote visibility after release, Customer 360/timeline propagation, and audit capture.

## Implemented Slice 21: Governed Service Reply Execution

Status: shipped in the local prototype on 2026-05-26.

- Added executable workflow support for governed `service.reply.send` approvals.
- Approved service-reply workflows now turn the knowledge-grounded assistant suggestion into a human-approved operator reply.
- Reply execution updates the service case to `waiting-customer`, records a `service_reply` workflow run, and remains idempotent on repeated execution.
- Added suite events and audit records for `service.reply.sent` and workflow execution.
- Connected the service reply run and updated case message count back into Customer 360 and the Service Hub console.
- Updated Workflow Studio so legal/service reply approvals can be approved and sent from the workspace.
- Added API tests proving pending execution blocking, approval-gated reply sending, idempotency, Customer 360/timeline propagation, Service Hub queue propagation, and audit capture.

## Implemented Slice 22: Service SLA Supervisor Escalation

Status: shipped in the local prototype on 2026-05-26.

- Added supervisor-only service case escalation records for SLA/customer/finance risk follow-up.
- Added `/api/service/cases/:id/escalate` with Service Manager, Owner, and Admin authorization.
- Escalation updates the case to `escalated`, assigns supervisor ownership, adds an internal supervisor message, and keeps repeated open escalation requests idempotent.
- Added escalation queue metrics and escalation rows to the Service Hub console.
- Connected open escalations back into Customer 360 and tenant backup scope.
- Added suite events and audit records for `service.case.escalated`.
- Updated the workspace Service Hub with an at-risk case escalation action and supervisor escalation cards.
- Added API tests proving front-line support rejection, Service Manager escalation, idempotency, queue propagation, Customer 360/timeline propagation, and audit capture.

## Implemented Slice 23: Service Resolution And Satisfaction Evidence

Status: shipped in the local prototype on 2026-05-26.

- Added service case resolution records with resolution code, supervisor summary, customer confirmation timestamp, and 1-5 satisfaction score.
- Added `/api/service/cases/:id/resolve`; escalated cases require Service Manager, Owner, or Admin authority.
- Resolution closes the service case, marks the SLA state `resolved`, closes any open escalation, and appends an internal supervisor closure message.
- Resolution creation is idempotent per case so repeated closure attempts return the original evidence packet.
- Added average satisfaction and recent resolution cards to the Service Hub console.
- Connected resolution evidence and average satisfaction back into Customer 360 and tenant backup scope.
- Added suite events and audit records for `service.case.resolved`.
- Updated the workspace Service Hub with an escalated-case Resolve action and CSAT display.
- Added API tests proving escalated-case role enforcement, closure, escalation closeout, idempotency, queue propagation, Customer 360/timeline propagation, and audit capture.

## Implemented Slice 24: Campaign ROI Attribution

Status: shipped in the local prototype on 2026-05-26.

- Added marketing campaign and campaign attribution records for Armenia SMB lead/customer influence tracking.
- Seeded a pilot Instagram/WhatsApp campaign with lead and customer/deal attribution.
- Added `/api/campaigns/performance` for campaign spend, lead count, customer count, influenced Tube, accepted revenue, paid revenue, and ROI percent.
- Campaign paid revenue uses payment receipts and paid HayHashvapah invoices from attributed customers.
- Added campaign semantic metrics into `/api/analytics`.
- Connected campaign attribution and customer-specific campaign performance back into Customer 360 and tenant backup scope.
- Added suite event evidence for `campaign.attribution.recorded`.
- Updated the workspace with a Growth Hub campaign ROI panel and Customer 360 campaign attribution rows.
- Added API tests proving campaign performance, analytics propagation, Customer 360 attribution, and timeline evidence.

## Implemented Slice 25: Receivables Aging Semantic Analytics

Status: shipped in the local prototype on 2026-05-26.

- Added `/api/analytics/receivables-aging` for deterministic Armenia-localized receivables reporting as of `2026-05-26`.
- Grouped open HayHashvapah invoices into current, 1-30, 31-60, 61-90, and 90+ day aging buckets.
- Added invoice-level drilldowns with customer, due date, days past due, bucket label, and CRM next-action guidance.
- Embedded receivables aging into `/api/analytics` beside Tube, service, automation, and campaign metrics.
- Connected customer-specific aging evidence back into Customer 360 while preserving redaction for non-owner views.
- Updated the workspace with a HayHashvapah Analytics receivables aging panel and Customer 360 receivable evidence rows.
- Added API tests proving accountant analytics access, bucket totals, invoice drilldowns, analytics propagation, and Customer 360 evidence.

## Implemented Slice 26: Payment Promise Reminder Evidence

Status: shipped in the local prototype on 2026-05-26.

- Added governed payment-promise records linked to CRM collection tasks and HayHashvapah invoices.
- Added `/api/crm/tasks/:id/payment-promise` for recording promised amount, promise date, reminder channel, Armenian reminder copy, and note.
- Added `/api/crm/collection-promises` for customer-specific CRM collection follow-up evidence.
- Payment promise creation is idempotent per task, date, and amount to avoid duplicate reminders from repeated operator clicks.
- Recording a promise moves the CRM task to `waiting-payment`, schedules the reminder, emits `crm.collection_promise.recorded`, and writes audit evidence.
- Connected collection promises back into Customer 360 with redaction for non-owner sensitive views and tenant backup scope.
- Updated the workspace with a Customer 360 collection promise action, promise metrics, and promise evidence rows.
- Added API tests proving workflow task execution, promise creation, idempotency, listing, Customer 360 propagation, timeline evidence, and audit capture.

## Implemented Slice 27: Collection Reminder Dispatch Evidence

Status: shipped in the local prototype on 2026-05-26.

- Added collection reminder delivery records linked to payment promises, CRM collection tasks, and HayHashvapah invoices.
- Added `/api/crm/collection-promises/:id/send-reminder` for idempotent Armenian reminder dispatch evidence.
- Added `/api/crm/collection-reminders` for customer-specific reminder delivery history.
- Reminder dispatch updates the payment promise to `reminder-sent`, moves the CRM task to `reminder-sent`, emits `crm.collection_reminder.sent`, and writes audit evidence.
- Delivery evidence stores channel, provider, recipient, Armenian message copy, sent timestamp, invoice, task, and promise linkage.
- Connected reminder deliveries back into Customer 360 with redaction for non-owner sensitive views and tenant backup scope.
- Updated the workspace with a Customer 360 reminder dispatch action, sent reminder metric, and delivery evidence rows.
- Added API tests proving promise dispatch, idempotency, delivery listing, Customer 360 propagation, timeline evidence, and audit capture.

## Implemented Slice 28: Collection Promise Payment Fulfillment

Status: shipped in the local prototype on 2026-05-26.

- Extended HayHashvapah payment receipt recording so paid invoices fulfill linked Armosphera CRM collection promises.
- Full payment on a promised invoice now moves the collection promise to `fulfilled` and closes the linked CRM task.
- Added `crm.collection_promise.fulfilled` suite events and audit records with invoice, payment, promise, and task linkage.
- Refreshed customer open receivables after payment so Customer 360 and receivables aging reflect the paid invoice immediately.
- Returned `collectionFulfillment` from `/api/finance/invoices/:id/payments` for payment-driven CRM close-loop evidence.
- Updated Customer 360 with fulfilled promise metrics, promise status display, and a demo `Record payment` action for reminder-sent promises.
- Added API tests proving payment receipt, promise fulfillment, task closure, Customer 360 propagation, receivables clearing, timeline evidence, and audit capture.

## Implemented Slice 29: Armenian Bank Transaction Reconciliation

Status: shipped in the local prototype on 2026-05-26.

- Added finance bank transaction records for Armenian bank import and reconciliation evidence.
- Added `/api/finance/bank-transactions` for importing bank credits and matching them to open HayHashvapah invoices and active collection promises.
- Added `/api/finance/bank-transactions/:id/reconcile` to convert matched bank credits into payment receipts through the existing finance payment endpoint.
- Matching uses invoice number, exact amount, active payment promise, and promise amount to produce a confidence score and accountant next action.
- Reconciliation links the bank transaction to the created payment, marks the transaction `reconciled`, fulfills linked collection promises, closes CRM tasks, and clears Customer 360 receivables.
- Connected bank transactions back into Customer 360 with redaction for non-owner sensitive views and tenant backup scope.
- Updated the workspace with bank import and reconciliation actions plus bank transaction evidence rows.
- Added API tests proving import match, reconciliation, payment creation, promise fulfillment, Customer 360 propagation, timeline evidence, and audit capture.

## Implemented Slice 30: Workflow Dry-Run Governance

Status: shipped in the local prototype on 2026-05-26.

- Added workflow dry-run evidence records for testing automation rules before they create tasks, finance records, legal publications, or external messages.
- Added `/api/workflow/rules`, `/api/workflow/dry-runs`, and `/api/workflow/rules/:id/dry-run`.
- Implemented the first governed dry-run for `invoice.overdue -> crm.task.create`, producing a proposed CRM collection task preview from a HayHashvapah overdue invoice.
- Dry-run payloads include matched subject, risk level, approval requirement, guardrails, checksum, trigger/action metadata, and operator note.
- Dry-runs are explicitly non-mutating: they emit audit/suite evidence but do not create CRM tasks or execute workflow actions.
- Connected dry-run evidence back into Customer 360, Service Console / Workflow Studio, tenant backup scope, and role-aware redaction.
- Updated the workspace with a Workflow Studio dry-run control, rule/version context, dry-run history, and Customer 360 dry-run rows.
- Added API tests proving dry-run preview creation, no CRM task side effects, listing, Customer 360 propagation, timeline evidence, and audit capture.

## Implemented Slice 31: Workflow Rule State And Version Control

Status: shipped in the local prototype on 2026-05-26.

- Added automation rule version records so every Flow rule has owner-visible version history, enabled state, reason, checksum, and changer evidence.
- Added owner-only `/api/workflow/rules/:id/state` for pausing and resuming workflow rules with required reason capture.
- Added `/api/workflow/rules/:id/versions` for viewing rule change history.
- Workflow dry-runs now respect disabled rules and return a conflict instead of previewing actions while the rule is paused.
- Rule state changes emit `workflow.rule.disabled` / `workflow.rule.enabled` suite events and matching audit records.
- Connected rule version evidence into Service Console / Workflow Studio and tenant backup scope.
- Updated the workspace with pause/resume controls, current version display, enabled/paused state, and latest change reason.
- Added API tests proving non-owner rejection, disable/enable version increments, dry-run blocking while paused, version listing, resumed dry-run behavior, and audit/event evidence.

## Implemented Slice 32: Workflow Failure Retry Governance

Status: shipped in the local prototype on 2026-05-26.

- Failed governed workflow executions are now persisted as workflow run evidence instead of disappearing behind a transient error response.
- Added `workflow_guardrail` failed-run payloads with error code, retryability, next retry action, and attempt history for Armenian finance-period lock failures.
- Added `/api/workflow/runs/:id/retry` for retrying eligible failed workflow runs after the guardrail condition is corrected.
- Implemented the first retry path for `finance.invoice.propose`, so reopening a locked HayHashvapah period can complete the original draft-invoice workflow run.
- Retry updates the same workflow run to `completed`, preserves the previous failure in payload evidence, records the successful second attempt, and keeps approval execution idempotent.
- Retry execution emits and audits `workflow.action.failed`, `workflow.action.retried`, `workflow.action.executed`, and `finance.draft_invoice.created` evidence.
- Connected failed and retried run evidence into Workflow Studio and Customer 360.
- Updated the workspace run history with failed-run status, guardrail code, next action guidance, attempt count, and a retry control.
- Added API tests proving closed-period failure capture, retry after period reopen, Customer 360 propagation, and audit/event evidence.

## Implemented Slice 33: Workflow Rule Rollback Governance

Status: shipped in the local prototype on 2026-05-26.

- Added owner-only workflow rule rollback so Flow rules can be restored to an earlier reviewed version instead of only paused or resumed forward.
- Added `/api/workflow/rules/:id/rollback` with target version validation, required rollback reason, and role enforcement.
- Rollback restores the enabled state from the selected prior version and writes a new immutable `rollback` version as the current rule state.
- Rollback emits `workflow.rule.rollback` suite events and audit records with restored-from version, previous version, new version, enabled state, and checksum evidence.
- Workflow dry-runs immediately respect the restored state, so rolling back to a disabled version blocks execution previews again.
- Updated Workflow Studio with a rollback control beside pause/resume rule governance.
- Added API tests proving non-owner rejection, rollback version creation, restored disabled state, dry-run blocking, version listing, and audit/event evidence.

## Implemented Slice 34: Workflow Test-Event Governance

Status: shipped in the local prototype on 2026-05-26.

- Added workflow test-event evidence records so operators can validate trigger payloads before live automation execution.
- Added `/api/workflow/test-events` and `/api/workflow/rules/:id/test-event` for non-mutating trigger tests with customer, subject, payload, note, guardrail, and checksum evidence.
- Implemented the first test-event path for `invoice_overdue -> crm.task.create`, producing the same proposed collection task evidence without creating CRM tasks.
- Test events respect disabled workflow rules and return a conflict when a paused or rolled-back rule is not eligible for testing.
- Test-event creation emits `workflow.test_event.created` suite events and audit records with rule, subject, customer, and checksum evidence.
- Connected test-event evidence into Workflow Studio, Customer 360, Service Console, tenant backup scope, and role-aware redaction.
- Updated the workspace with a Test event control and test-event history beside dry-run evidence.
- Added API tests proving test-event creation, no CRM side effects, listing, rule latest-event propagation, Customer 360 propagation, disabled-rule blocking, and audit evidence.

## Implemented Slice 35: Grounded AI Customer Brief

Status: shipped in the local prototype on 2026-05-26.

- Added owner-only AI customer brief evidence for advisory Customer 360 summaries grounded in CRM, HayHashvapah finance, service, legal, and automation context.
- Added `/api/ai/customer-briefs` list/create endpoints with deterministic grounded-summary policy, confidence score, advisory-only flag, review requirement flag, grounding sources, next actions, and checksum evidence.
- Customer briefs are explicitly non-mutating: they do not create workflow runs, CRM tasks, finance records, legal records, or external messages.
- Customer brief generation emits `ai.customer_brief.generated` suite events and audit records with customer, grounding-source count, confidence, advisory-only flag, and checksum evidence.
- Connected generated briefs into Customer 360, tenant backup scope, and role-aware redaction.
- Updated the workspace Customer 360 panel with an owner-only AI brief action and compact grounded advisory summary card.
- Added API tests proving owner-only access, grounded sources, advisory-only semantics, no workflow/task side effects, Customer 360 propagation, backup inclusion, and audit/event evidence.

## Implemented Slice 36: Grounded AI Deal Risk Brief

Status: shipped in the local prototype on 2026-05-26.

- Added sales/owner AI deal-risk brief evidence for advisory opportunity coaching grounded in CRM deal, CRM forecast, quote, HayHashvapah receivable, and service case context.
- Added `/api/ai/deal-risk-briefs` list/create endpoints with deterministic grounded-deal-risk policy, risk level, risk score, confidence score, advisory-only flag, grounding sources, risk factors, next actions, and checksum evidence.
- Deal-risk briefs are explicitly non-mutating: they do not update forecasts, create workflow runs, create CRM tasks, send messages, or change HayHashvapah finance records.
- Deal-risk generation emits `ai.deal_risk.generated` suite events and audit records with deal, customer, risk score, confidence, grounding-source count, advisory-only flag, and checksum evidence.
- Connected generated deal-risk briefs into Customer 360, CRM forecast summaries, tenant backup scope, and role-aware redaction.
- Updated the workspace Deal Health panel with a role-aware Risk brief action and compact grounded risk card.
- Added API tests proving support rejection, grounded CRM/forecast/finance/service sources, advisory-only semantics, no workflow/task side effects, forecast totals unchanged, Customer 360 propagation, backup inclusion, and audit/event evidence.

## Implemented Slice 37: Grounded AI Overdue Invoice Explanation

Status: shipped in the local prototype on 2026-05-26.

- Added accountant/sales/owner AI overdue-invoice explanation evidence for advisory collection guidance grounded in HayHashvapah invoice, receivables aging, CRM task, and customer profile context.
- Added `/api/ai/invoice-overdue-explanations` list/create endpoints with deterministic grounded-overdue-invoice policy, risk level, days-past-due, amount, VAT, confidence score, suggested follow-up, next actions, grounding sources, accountant review status, and checksum evidence.
- Overdue-invoice explanations are explicitly non-mutating: they do not mark invoices paid, create payment receipts, create CRM tasks, execute workflow runs, send messages, or change HayHashvapah finance records.
- Financial AI output requires accountant review status (`accountant-review-required`) and keeps `reviewRequired=true` before any customer-facing use.
- Explanation generation emits `ai.invoice_overdue.generated` suite events and audit records with invoice, customer, risk level, days overdue, confidence, advisory-only flag, accountant review status, grounding-source count, and checksum evidence.
- Connected generated explanations into Customer 360, receivables aging analytics, tenant backup scope, and role-aware redaction.
- Updated the workspace Receivables Aging panel with a role-aware Explain invoice action and compact grounded explanation card.
- Added API tests proving support rejection, grounded invoice/aging/task/profile sources, accountant review requirement, advisory-only semantics, no invoice/payment/task/workflow side effects, Customer 360 propagation, backup inclusion, and audit/event evidence.

## Implemented Slice 38: Grounded AI Ticket Summary And Knowledge Recommendation

Status: shipped in the local prototype on 2026-05-26.

- Added service-role AI ticket summary evidence for advisory support triage grounded in service case, case message, customer profile, and reviewed knowledge article context.
- Added `/api/ai/ticket-summaries` list/create endpoints with deterministic grounded-ticket-summary policy, recommended knowledge article, review status, confidence score, advisory-only flag, review requirement, next actions, grounding sources, and checksum evidence.
- Ticket summaries are explicitly non-mutating: they do not add case messages, execute workflow runs, create approvals, send replies, resolve cases, or change SLA state.
- Knowledge recommendations preserve review gates, including accountant review for VAT/procurement wording before any customer-facing service reply.
- Ticket summary generation emits `ai.ticket_summary.generated` suite events and audit records with case, customer, recommended knowledge, confidence, advisory-only flag, review requirement, grounding-source count, and checksum evidence.
- Connected generated summaries into Service Console, Customer 360, tenant backup scope, and role-aware redaction.
- Updated the workspace Service Console with a role-aware Summarize action and compact grounded knowledge recommendation card.
- Added API tests proving accountant rejection, grounded service/case-message/knowledge/profile sources, review requirement, advisory-only semantics, no message/workflow/approval side effects, Service Console propagation, Customer 360 propagation, backup inclusion, and audit/event evidence.

## Implemented Slice 39: Advisory AI Workflow Builder Helper

Status: shipped in the local prototype on 2026-05-26.

- Added owner/admin AI workflow-builder suggestion evidence for governed Workflow Studio drafting without creating or enabling automation rules.
- Added `/api/ai/workflow-builder-suggestions` list/create endpoints with deterministic grounded-workflow-builder policy, suggested rule name, trigger, action, risk level, approval requirement, required apps, guardrails, suggested payload, test-event input, grounding sources, confidence score, advisory-only flag, review requirement, and checksum evidence.
- Workflow-builder suggestions are explicitly non-mutating: they do not create automation rules, change rule versions, create dry-runs, create test events, execute workflow runs, send messages, or create CRM/finance records.
- Suggestions are grounded in existing automation-rule governance, HayHashvapah overdue invoice evidence, app boundaries, and Workflow Studio dry-run/test-event/approval guardrails.
- Suggestion generation emits `ai.workflow_builder.suggested` suite events and audit records with trigger, action, risk level, approval requirement, advisory-only flag, grounding-source count, and checksum evidence.
- Connected generated suggestions into Service Console / Workflow Studio and tenant backup scope.
- Updated the workspace Workflow Studio with a role-aware Suggest rule action and compact advisory suggestion card.
- Added API tests proving support rejection, grounded automation/finance/governance/app-boundary sources, advisory-only semantics, no workflow-rule/dry-run/test-event/run side effects, Service Console propagation, backup inclusion, and audit/event evidence.

## Implemented Slice 40: Semantic Analytics Metric Catalog And Drilldowns

Status: shipped in the local prototype on 2026-05-27.

- Added an analytics semantic layer for Zoho One parity so KPI cards now carry explicit definitions, formulas, source apps, owner roles, refresh cadence, record counts, and drilldown URLs.
- Added `/api/analytics/semantic-metrics` and `/api/analytics/semantic-metrics/:id/drilldown` with analytics app access control.
- Implemented metric definitions for Tube value, weighted forecast, campaign ROI, receivables aging, overdue exposure, ticket backlog, SLA risk, and Armenia VAT/SRC readiness.
- Added drilldown records that connect overdue exposure back to HayHashvapah invoice records and SLA risk back to Armosphera Desk cases.
- Connected the metric catalog into the existing `/api/analytics` payload for role-aware dashboards and reporting.
- Updated the workspace dashboard with a dense Metric Catalog panel using Armosphera CRM / HayHashvapah visual language.
- Added API tests proving support rejection, metric definitions, Armenian finance/localization source mapping, overdue invoice drilldown, SLA risk drilldown, unknown-metric handling, and analytics payload propagation.

## Implemented Slice 41: Semantic Analytics Time-Series Snapshots

Status: shipped in the local prototype on 2026-05-27.

- Added persisted analytics metric snapshots so semantic metrics can be captured as daily time-series evidence for owner and accountant reporting.
- Added `/api/analytics/semantic-snapshots` list/capture endpoints with analytics app access control and writer restrictions for Owner, Admin, and Accountant roles.
- Snapshot capture stores metric definition, formula, source apps, unit, value, record count, semantic layer version, report date, checksum, capture note, and capture user.
- Same-day snapshot capture is idempotent by metric/report date, refreshing values without duplicating rows.
- Snapshot listing returns both raw snapshot rows and grouped series points for dashboard charts and exportable reports.
- Snapshot capture emits `analytics.semantic_snapshot.captured` suite events and audit records.
- Added snapshots to tenant backup scope so analytics reporting evidence is restorable with the tenant.
- Updated the Metric Catalog dashboard with a role-aware Capture snapshot action and compact time-series strip.
- Added API tests proving support rejection, auditor write rejection, accountant capture, same-day idempotency, next-day series, analytics payload propagation, backup inclusion, and audit evidence.

## Implemented Slice 42: Exportable Owner And Accountant Analytics Reports

Status: shipped in the local prototype on 2026-05-27.

- Added persisted analytics report packets for owner operating reports and accountant export reports generated from semantic metric snapshots.
- Added `/api/analytics/reports` list/create/read endpoints with analytics app access control and role-aware visibility.
- Owner/Admin can generate owner and accountant packets; Accountant can generate accountant packets only; Auditor can read owner/accountant packets; non-report roles are blocked.
- Accountant reports export receivables aging, overdue exposure, and VAT/SRC readiness as CSV-ready packet content.
- Owner reports export the full semantic metric catalog as JSON-ready packet content.
- Report packets include period key, format, metric count, snapshot count, content type, file name, payload, export content, checksum, note, creator, and created timestamp.
- Report generation emits `analytics.report_packet.created` suite events and audit records.
- Added report packets to tenant backup scope so exported analytics evidence is restorable.
- Updated the Metric Catalog dashboard with role-aware owner/accountant report actions and recent report packet cards.
- Added API tests proving role rejection, accountant CSV export, owner JSON export, list visibility, analytics payload propagation, backup inclusion, and audit evidence.

## Implemented Slice 43: Role-Aware Analytics Dashboards

Status: shipped in the local prototype on 2026-05-27.

- Added `/api/analytics/role-dashboard` as a filtered operating lens for each Armenia SaaS role.
- Added role-specific dashboards for Owner, Admin, Accountant, Salesperson, Operator, Support, Service Manager, and Auditor.
- Owner/Admin dashboards prioritize operating metrics, report generation, overdue exposure, and SLA risk.
- Accountant dashboards prioritize receivables aging, overdue exposure, VAT/SRC readiness, snapshot capture, and accountant report export.
- Sales dashboards prioritize Tube value, weighted forecast, campaign ROI, and CRM forecast actions.
- Support and Service Manager dashboards prioritize ticket backlog and SLA risk without exposing HayHashvapah finance context to Support.
- Auditor dashboards expose read-only report and checksum evidence without write permissions.
- Added role permission flags for analytics app access, snapshot capture, owner report creation, accountant report creation, report reading, finance app access, and sensitive finance visibility.
- Connected the role dashboard into the main analytics payload and workspace UI above the operating grid.
- Added API tests proving owner/accountant/sales/support/service-manager/auditor dashboard tailoring, support no-finance leakage, report visibility, action tailoring, and analytics payload propagation.

## Implemented Slice 44: Privileged MFA Login Guardrail

Status: shipped in the local prototype on 2026-05-27.

- Added TOTP MFA enrollment for privileged Owner and Admin users while rejecting non-privileged support enrollment attempts.
- MFA enrollment now rejects non-object request bodies and non-string labels before pending factor creation, so null/object coercion cannot enter factor labels or enrollment evidence.
- MFA enrollment verification now rejects non-object request bodies and non-string factor/code values before factor lookup or failed-verification audit, preventing coerced object evidence from entering verification trails.
- Added a password login MFA challenge flow that blocks privileged session creation until the one-time code challenge is satisfied.
- Added `/api/security/mfa`, `/api/security/mfa/enroll`, `/api/security/mfa/verify-enrollment`, and `/api/login/mfa` endpoints.
- Stored MFA factors and login challenges with five-minute challenge expiry, active/pending factor states, and audit evidence for enrollment, challenge creation, failures, and verification.
- Preserved the secret boundary in tenant backup: MFA factor metadata is included for restore/audit visibility, while `secret_base32` is excluded and replaced with `secretExcluded=true`.
- Added the privileged workspace security panel for enrollment, manual authenticator setup key entry, verification, and active factor visibility.
- Added an MFA-aware login prompt so privileged users complete the code challenge before the suite workspace loads.
- Added API tests proving support rejection, enrollment setup, bad-code rejection, activation, password-only no-cookie challenge, challenge completion, support login bypass, backup sanitization, and audit evidence.

## Implemented Slice 45: Admin Session Inventory And Revocation

Status: shipped in the local prototype on 2026-05-27.

- Added governed session metadata for user agent, IP address, created/last-seen timestamps, MFA verification state, and administrative revocation state.
- Added `/api/admin/sessions` for Owner/Admin/Auditor token-safe session inventory with active, privileged, MFA-verified, stale, revoked, and expired summary counts.
- Added `/api/admin/sessions/:id/revoke` for Owner/Admin session revocation using public hashed session identifiers instead of raw session tokens.
- Blocked revoked sessions in the authentication path so revoked cookies can no longer load the suite workspace.
- Added risk signals for privileged active sessions without MFA and sessions missing device context.
- Added audit evidence for administrative revocation with target user, public session identifier, reason, and current-session flag.
- Updated the workspace identity panel with active session cards, risk signals, MFA state, and revoke actions for non-current active sessions.
- Added API tests proving support rejection, auditor read-only access, token non-disclosure, owner revocation, revoked-cookie rejection, owner continuity, summary updates, and audit evidence.

## Implemented Slice 46: Tamper-Evident Audit Export Packets

Status: shipped in the local prototype on 2026-05-27.

- Added persisted audit export packets for owner/admin-created and auditor-readable compliance evidence.
- Added `/api/admin/audit-exports` list/create endpoints and `/api/admin/audit-exports/:id` detail access.
- Export packets include organization context, period boundaries, event count, first/last audit event ids, export checksum, chain head, controls, sanitized audit events, and a SHA-256 forward hash chain.
- Audit event details are recursively sanitized for password, secret, token, cookie, and authorization keys before export.
- Added audit export packets to tenant backup scope so compliance evidence is included in restore-ready tenant packets.
- Added `admin.audit_export.created` audit evidence with export id, event count, first/last ids, checksum, and chain head.
- Updated the workspace admin area with an Audit integrity panel showing event count, checksum prefix, chain head, and role-aware Create export action.
- Added API tests proving support rejection, auditor read-only access, owner creation, chain verification, checksum verification, token non-disclosure, auditor detail read, backup inclusion, and audit evidence.

## Implemented Slice 47: Integration Hub Connector Contracts

Status: shipped in the local prototype on 2026-05-27.

- Added Integration Hub connector contracts for Gmail, Google Calendar, Google Drive, WhatsApp Business, Telegram Bot, e-signature providers, HayHashvapah finance sync, and migration import.
- Added `/api/integrations/connectors`, `/api/integrations/connectors/:key/configure`, and `/api/integrations/connectors/:key/health-check`.
- Connector contracts define provider, category, auth type, required scopes, capabilities, owner role, data boundary, and rebuild policy so commodity products remain external integrations.
- Owner/Admin can configure and health-check connectors; Auditor can read connector evidence; non-admin operational roles are rejected.
- Connector owner roles must be real tenant roles or the explicit system Admin role, so readiness/remediation evidence cannot be assigned to unreachable roles.
- Connector secrets are never returned by API or backups; only SHA-256 fingerprints and `secretExcluded=true` are exposed.
- Health checks produce ready/blocked evidence from endpoint URL, secret boundary, connected status, provider boundary, and missing required scopes.
- Added connector configuration and readiness checks to tenant backup scope.
- Updated the workspace with an Integration Hub panel showing connector counts, connected/ready state, provider contracts, and role-aware WhatsApp sandbox configuration.
- Added API tests proving support rejection, default connector catalog, WhatsApp configuration, token non-disclosure, ready health checks, blocked missing-scope checks, auditor read-only access, backup inclusion, and audit evidence.

## Implemented Slice 48: Clinic/Wellness Pilot Template

Status: shipped in the local prototype on 2026-05-27.

- Added the first vertical pilot template for Armenian clinic, dental, beauty, and wellness operators.
- Added `/api/pilots/templates/clinic-wellness` and `/api/pilots/templates/clinic-wellness/install`.
- The template packages Armosphera CRM, Desk, Flow, Analytics, Docs, HayHashvapah Finance, WhatsApp/Telegram intake, calendar/document connectors, e-signature, and migration import boundaries.
- Added Armenia-localized package pricing in AMD for patient retention automation, booking/inbox setup, and receivables/HayHashvapah handoff.
- Added template controls for ՀՎՀՀ/TIN capture, 20% VAT review, Armenian personal-data handling, SRC/File Online readiness, and HayHashvapah period-lock/accountant review.
- Pilot installs are idempotent per customer/package selection and include rollout shape for five paid pilots, setup fee, monthly ops/SaaS fee, optional performance fee, readiness gaps, checksum, and customer context.
- Added pilot install evidence to tenant backup scope and `pilot.template.installed` suite/audit events.
- Updated the workspace with a Pilot template panel showing package fees, connector count, install action, readiness gaps, and checksum evidence.
- Added API tests proving support rejection, template content, package totals, HayHashvapah handoff, idempotent install, auditor visibility, backup inclusion, and audit evidence.

## Implemented Slice 49: Clinic Pilot Owner Operating Brief

Status: shipped in the local prototype on 2026-05-27.

- Added owner operating brief packets for the clinic/wellness pilot, generated from installed template evidence.
- Added `/api/pilots/clinic-wellness/owner-briefs` list/create endpoints with pilot-template role gates: Owner/Admin/Salesperson can create; Auditor and operational readers can view metadata; Support is rejected.
- Each brief answers the five pilot owner acceptance questions: who owes money, which leads are stuck, which tickets are late, which campaigns produced paying clients, and what tax/accounting actions need review.
- Brief payloads merge HayHashvapah receivables, CRM lead backlog, service SLA state, campaign-to-paid-revenue attribution, Armenian VAT/SRC legal-source readiness, and accounting period-lock review evidence.
- Brief generation is idempotent per installed pilot and report date, producing a checksum-bound JSON payload and metadata-only list view.
- Added owner brief packets to tenant backup scope and `pilot.owner_brief.created` suite/audit events.
- Updated the workspace with a Pilot owner brief panel showing answer counts, next actions, readiness gaps, status, report date, and checksum evidence.
- Added API tests proving support rejection, owner creation, all five answer categories, idempotency, auditor metadata visibility, backup inclusion, checksum verification, and audit evidence.

## Implemented Slice 50: Clinic Pilot Operator Workbench

Status: shipped in the local prototype on 2026-05-27.

- Added operator workbench packets generated from clinic/wellness owner operating briefs.
- Added `/api/pilots/clinic-wellness/operator-workbenches` list/create endpoints with support rejection and role-aware operator, salesperson, service manager, accountant, owner/admin, and auditor access.
- Workbenches convert the owner brief into five frontline lanes: receivables follow-up, stuck lead conversion, SLA rescue, campaign revenue loop, and tax/accounting review.
- Each action carries owner role, priority, source record, next step, review requirement, suggested channel, and HayHashvapah invoice context where money is involved.
- Workbench generation is idempotent per owner brief and produces checksum-bound payloads with metadata-only list visibility.
- Added operator workbench packets to tenant backup scope and `pilot.operator_workbench.created` suite/audit events.
- Updated the workspace with a Pilot operator workbench panel showing action count, high-priority count, review-required count, action lanes, checklist, and checksum evidence.
- Added API tests proving support rejection, operator creation, all five lane mappings, idempotency, auditor metadata visibility, backup inclusion, checksum verification, and audit evidence.

## Implemented Slice 51: Clinic Pilot Accountant Review Queue

Status: shipped in the local prototype on 2026-05-27.

- Added accountant review queue packets generated from clinic/wellness operator workbenches.
- Added `/api/pilots/clinic-wellness/accountant-reviews` list/create endpoints with Owner/Admin/Accountant create access, Auditor metadata visibility, and support/operator rejection for accountant-only evidence.
- Review queues convert workbench compliance and receivable actions into VAT/SRC, period-lock, overdue receivable wording, and HayHashvapah invoice review items.
- Each item carries category, status, owner role, review requirement, due date, legal source, period key, invoice number, AMD amount, VAT amount, and source evidence where applicable.
- Review queues compute item count, open review count, VAT item count, period item count, and overdue money at risk in AMD.
- Queue creation is idempotent per operator workbench and produces checksum-bound payloads with metadata-only list visibility.
- Added accountant review packets to tenant backup scope and `pilot.accountant_review.created` suite/audit events.
- Updated the workspace with a Pilot accountant review panel showing open review count, item count, money at risk, review cards, checklist, and checksum evidence.
- Added API tests proving support rejection, accountant creation, VAT source mapping, period-lock mapping, receivable VAT check mapping, idempotency, auditor metadata visibility, backup inclusion, checksum verification, and audit evidence.

## Implemented Slice 52: Clinic Pilot Launch Readiness Gate

Status: shipped in the local prototype on 2026-05-27.

- Added launch readiness packets generated from the completed clinic/wellness pilot evidence chain.
- Added `/api/pilots/clinic-wellness/launch-readiness` list/create endpoints with Owner/Admin create access, role-aware operational read access, Auditor metadata visibility, and Support rejection.
- Readiness packets consolidate template install, owner brief, operator workbench, accountant review queue, connector gaps, commercial pricing, and overdue money-at-risk into one go-live decision.
- Launch gates cover pilot evidence chain, commercial package, operator workbench, accountant review, integration readiness, and overdue money at risk.
- Packets compute gate count, blocked gate count, blocker count, money at risk, commercial setup fee, monthly ops fee, and target launch date.
- The current seeded pilot correctly blocks go-live until accountant VAT/SRC and period-lock items, connector gaps, and overdue receivable risk are resolved.
- Packet creation is idempotent per accountant review and target launch date and produces checksum-bound payloads with metadata-only list visibility.
- Added launch readiness packets to tenant backup scope and `pilot.launch_readiness.created` suite/audit events.
- Updated the workspace with a Pilot launch gate panel showing blocked/ready status, blocker count, money at risk, gate cards, next actions, and checksum evidence.
- Added API tests proving support rejection, owner creation, commercial pricing propagation, blocked gate calculation, connector blockers, accountant blockers, money-at-risk blockers, idempotency, auditor metadata visibility, backup inclusion, checksum verification, and audit evidence.

## Implemented Slice 53: Clinic Pilot Launch Remediation Plan

Status: shipped in the local prototype on 2026-05-27.

- Added launch remediation plans generated from blocked clinic/wellness launch readiness packets.
- Added `/api/pilots/clinic-wellness/launch-remediation-plans` list/create endpoints with Owner/Admin create access, operational read access, Auditor metadata visibility, and Support rejection.
- Remediation plans convert launch blockers into assigned actions for accountant review, connector setup, overdue receivable risk, and commercial package completion where needed.
- Each action carries owner role, source gate, priority, status, due date, next step, connector key, open review count, or money-at-risk evidence as applicable.
- Plans compute action count, high-priority count, blocker count, owner-role coverage, and AMD money at risk.
- Plan creation is idempotent per launch readiness packet and produces checksum-bound payloads with metadata-only list visibility.
- Added remediation plans to tenant backup scope and `pilot.launch_remediation.created` suite/audit events.
- Updated the workspace with a Pilot remediation panel showing open action count, high-priority count, money at risk, assigned actions, checklist, and checksum evidence.
- Added API tests proving support rejection, owner creation, accountant/Admin/operator action mapping, connector remediation mapping, money-at-risk remediation, idempotency, auditor metadata visibility, backup inclusion, checksum verification, and audit evidence.

## Implemented Slice 54: Clinic Pilot Remediation Action Resolution

Status: shipped in the local prototype on 2026-05-27.

- Added remediation action resolution packets so assigned roles can close launch remediation actions with evidence.
- Added `/api/pilots/clinic-wellness/remediation-resolutions` list and `/api/pilots/clinic-wellness/remediation-actions/:actionKey/resolve` create endpoints with operational read access, Support rejection, and action-owner write enforcement.
- Owner/Admin can resolve any remediation action, while Accountant and Operator can resolve only the actions assigned to their roles.
- Resolution packets capture the action snapshot, evidence type, evidence text, resolver identity, target launch date, current progress, and checksum-bound payload.
- Resolution creation is idempotent per remediation plan and action key.
- Added remediation action resolutions to tenant backup scope and `pilot.remediation_action.resolved` suite/audit events.
- Updated the workspace remediation panel with resolved/remaining progress, latest resolution checksum evidence, and role-aware Resolve buttons for open actions.
- Added API tests proving support rejection, cross-role denial, accountant/operator resolution, idempotency, auditor metadata visibility, backup inclusion, checksum verification, and audit evidence.

## Implemented Slice 55: Clinic Pilot Launch Clearance Packet

Status: shipped in the local prototype on 2026-05-27.

- Added launch clearance packets generated from remediation plans and their action-resolution evidence.
- Added `/api/pilots/clinic-wellness/launch-clearance` list/create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support rejection.
- Clearance packets remain blocked until every remediation action has a checksum-bound resolution packet.
- Once all remediation actions are resolved, clearance packets mark go-live allowed and return a `ready-for-paid-pilot` decision.
- Clearance packets capture resolved actions, unresolved actions, resolution checksums, action counts, completion percent, money at risk, controls, checklist, and owner note.
- Clearance creation is idempotent for the same remediation plan and resolution chain while allowing a later cleared packet after a previously blocked check.
- Added clearance packets to tenant backup scope and `pilot.launch_clearance.created` suite/audit events.
- Updated the workspace with a Pilot clearance panel showing go-live decision, completion, open/resolved actions, controls, and checksum evidence.
- Added API tests proving support rejection, blocked pre-resolution clearance, all-action resolution, cleared go-live decision, idempotency, auditor metadata visibility, backup inclusion, checksum verification, and audit evidence.

## Implemented Slice 56: Clinic Pilot Paid Offer Packet

Status: shipped in the local prototype on 2026-05-27.

- Added paid pilot offer packets generated only from cleared clinic/wellness launch clearance packets.
- Added `/api/pilots/clinic-wellness/paid-offers` list/create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Paid offers are blocked when the source clearance packet is not cleared, so sales cannot issue customer-facing terms before go-live evidence is complete.
- Offer payloads include customer context, clearance checksum evidence, AMD pricing, 20% VAT, first-month subtotal/VAT/total, pilot count, valid-until date, commercial handoffs, and governance controls.
- Paid offer creation is idempotent per clearance packet and produces checksum-bound payloads with metadata-only list visibility.
- Added paid offer packets to tenant backup scope and `pilot.paid_offer.created` suite/audit events.
- Updated the workspace with a Paid pilot offer panel showing first-month total, setup/monthly fees, VAT metrics, handoff chips, and checksum evidence.
- Added API tests proving blocked-clearance rejection, support rejection, sales creation, Armenia VAT pricing, idempotency, auditor metadata visibility, backup inclusion, checksum verification, and audit evidence.

## Implemented Slice 57: Clinic Pilot Offer To CRM Quote Handoff

Status: shipped in the local prototype on 2026-05-27.

- Added quote handoff packets that convert a ready paid pilot offer into a draft CRM quote and governed quote-release approval.
- Added `/api/pilots/clinic-wellness/quote-handoffs` list and `/api/pilots/clinic-wellness/paid-offers/:offerId/quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- The handoff creates VAT-inclusive CRM quote lines from the offer’s setup fee and monthly operations fee, preserving the AMD subtotal, 20% VAT, and first-month total.
- Generated quotes remain hidden from public quote links until the existing `crm.quote.release` approval is approved and executed.
- Handoff creation is idempotent per paid offer and records the paid offer checksum, quote id, approval id, deal id, commercial totals, and governance controls.
- Added handoff packets to tenant backup scope and `pilot.offer_quote_handoff.created` suite/audit events.
- Updated the workspace with a Quote handoff panel showing quote, approval, deal, status, total, controls, and checksum evidence.
- Added API tests proving support rejection, draft quote generation, release approval creation, hidden public quote before approval, idempotency, auditor metadata visibility, backup inclusion, checksum verification, and audit evidence.

## Implemented Slice 58: Clinic Pilot Quote Release Evidence Packet

Status: shipped in the local prototype on 2026-05-27.

- Added quote release evidence packets that can be recorded only after the owner-approved `crm.quote.release` workflow executes and the quote is publicly available.
- Added `/api/pilots/clinic-wellness/quote-releases` list and `/api/pilots/clinic-wellness/quote-handoffs/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Release packets link the quote handoff checksum, offer id, quote id, approval id, customer, deal, public quote URL metadata, sent timestamp, AMD total, and release controls.
- Creation is idempotent per handoff/quote/sent timestamp and is blocked before quote release workflow execution.
- Added release packets to tenant backup scope and `pilot.quote_release.created` suite/audit events.
- Updated the workspace with a Quote release panel showing public quote status, quote, approval, handoff, controls, and checksum evidence.
- Added API tests proving support rejection, pre-release blocking, owner approval/execution, public quote visibility, packet checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 59: Clinic Pilot Accepted Quote To HayHashvapah Handoff

Status: shipped in the local prototype on 2026-05-27.

- Added quote acceptance handoff packets that connect a customer-accepted public quote to the governed HayHashvapah draft-invoice approval.
- Added `/api/pilots/clinic-wellness/quote-acceptance-handoffs` list and `/api/pilots/clinic-wellness/quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Handoff creation is blocked until the released public quote is accepted and the existing `finance.invoice.propose` approval exists.
- Packets link the quote release checksum, quote handoff, paid offer, acceptance evidence, deal-won state, Armenia VAT mode, finance approval id, period key, due days, signer, AMD total, and HayHashvapah controls.
- Creation is idempotent per release packet, quote acceptance, and finance approval.
- Added acceptance handoff packets to tenant backup scope and `pilot.quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with an Acceptance handoff panel showing signer, period, VAT mode, approval id, controls, and checksum evidence.
- Added API tests proving support rejection, pre-acceptance blocking, public quote acceptance, deal-won transition, finance approval generation, packet checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 60: Clinic Pilot HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-27.

- Added HayHashvapah draft invoice packets that can be recorded only after the owner executes the accepted-quote `finance.invoice.propose` approval.
- Added `/api/pilots/clinic-wellness/hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/quote-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Corrected accepted-quote draft invoice creation so HayHashvapah drafts use the accepted quote total instead of stale deal value when the workflow approval carries a quote id.
- Packets link the acceptance handoff checksum, quote release, quote handoff, paid offer, acceptance, finance approval, workflow run, HayHashvapah draft invoice, Armenia VAT breakdown, period key, and posting-readiness controls.
- Creation is idempotent per acceptance handoff, workflow run, and draft invoice.
- Added draft invoice packets to tenant backup scope and `pilot.hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a HayHashvapah draft panel showing draft number, period, VAT/subtotal/total, workflow run, controls, and checksum evidence.
- Added API tests proving support rejection, pre-execution blocking, owner approval/execution, quote-total invoice math, packet checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 61: Clinic Pilot Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-27.

- Added official HayHashvapah invoice posting packets that can be recorded only after the existing draft invoice is posted into an open receivable.
- Added `/api/pilots/clinic-wellness/official-invoices` list and `/api/pilots/clinic-wellness/hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Posting packets link the draft packet checksum, accepted quote chain, draft invoice, official invoice, finance invoice link, Armenian VAT/period metadata, and collection-readiness controls.
- Creation is idempotent per draft packet, finance invoice link, and official invoice.
- Added posting packets to tenant backup scope and `pilot.hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with an Official invoice panel showing receivable number, VAT, period, link id, controls, and checksum evidence.
- Added API tests proving support rejection, pre-posting blocking, official invoice posting, accepted quote total preservation, packet checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 62: Clinic Pilot HayHashvapah Payment Collection Packet

Status: shipped in the local prototype on 2026-05-27.

- Added payment collection packets that can be recorded only after the official HayHashvapah invoice is fully paid through the existing payment receipt flow.
- Added `/api/pilots/clinic-wellness/payment-collections` list and `/api/pilots/clinic-wellness/official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Collection packets link the official invoice posting checksum, accepted quote chain, official invoice, finance invoice link, payment receipt, Armenian VAT/period metadata, and pilot closeout-readiness controls.
- Creation is idempotent per posting packet, payment receipt, and official invoice.
- Added payment collection packets to tenant backup scope and `pilot.hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Payment collection panel showing receipt reference, collected amount, VAT, paid date, invoice number, controls, and checksum evidence.
- Added API tests proving support rejection, pre-payment blocking, official payment receipt recording, paid invoice status, packet checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 63: Clinic Pilot Closeout And Renewal Handoff Packet

Status: shipped in the local prototype on 2026-05-27.

- Added pilot closeout packets that can be created only after HayHashvapah payment collection evidence exists for the paid pilot.
- Added `/api/pilots/clinic-wellness/closeouts` list and `/api/pilots/clinic-wellness/payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support rejection.
- Closeout creation creates an idempotent CRM renewal task for the salesperson, linking the paid pilot, customer, deal, payment receipt, invoice, and next renewal due date.
- Closeout packets link the payment collection checksum, accepted quote chain, paid invoice, HayHashvapah payment receipt, CRM renewal task, closeout date, AMD amount, and owner renewal controls.
- Added closeout packets to tenant backup scope and `pilot.closeout.created` suite/audit events.
- Updated the workspace with a Pilot closeout panel showing closeout status, collected amount, renewal due date, CRM task id, controls, and checksum evidence.
- Added API tests proving support rejection, owner creation, CRM renewal task creation, checksum verification, idempotency, auditor metadata visibility, Customer 360 task visibility, backup inclusion, and audit evidence.

## Implemented Slice 64: Clinic Pilot Renewal Quote Handoff

Status: shipped in the local prototype on 2026-05-27.

- Added pilot renewal quote handoff packets that convert a closed paid pilot into a monthly CRM renewal quote with a governed quote-release approval.
- Added `/api/pilots/clinic-wellness/renewal-quotes` list and `/api/pilots/clinic-wellness/closeouts/:closeoutPacketId/renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Renewal quote handoffs link the closeout checksum, HayHashvapah payment collection, CRM renewal task, customer, deal, draft quote, approval id, AMD subtotal, 20% VAT, total, valid-until date, and release controls.
- Draft public renewal quotes remain hidden until the existing `crm.quote.release` approval is executed.
- Added renewal quote handoff packets to tenant backup scope and `pilot.renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with a Renewal quote panel showing quote total, approval id, release status, VAT, subtotal, controls, and checksum evidence.
- Added API tests proving support rejection, Salesperson creation, checksum verification, public quote hiding before approval, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 65: Clinic Pilot Renewal Quote Release Packet

Status: shipped in the local prototype on 2026-05-27.

- Added pilot renewal quote release packets that can be recorded only after the owner-approved `crm.quote.release` workflow execution makes the renewal quote public.
- Added `/api/pilots/clinic-wellness/renewal-quote-releases` list and `/api/pilots/clinic-wellness/renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Renewal release packets link the renewal handoff checksum, closeout checksum, CRM renewal task, public quote token, approval id, AMD subtotal, 20% VAT, total, and public-link controls.
- Added renewal release packets to tenant backup scope and `pilot.renewal_quote_release.created` suite/audit events.
- Updated the workspace with a Renewal release panel showing public visibility, quote id, approval id, handoff id, controls, and checksum evidence.
- Added API tests proving support rejection, pre-approval blocking, public quote visibility after approval execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 66: Clinic Renewal Acceptance To HayHashvapah Handoff

Status: shipped in the local prototype on 2026-05-27.

- Added renewal acceptance handoff packets that can be recorded only after the customer accepts the released monthly renewal quote.
- Added `/api/pilots/clinic-wellness/renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Renewal acceptance handoffs link the renewal release checksum, renewal quote handoff checksum, paid pilot closeout checksum, CRM renewal task, accepted quote, signer, finance invoice approval, Armenian VAT mode, accounting period, AMD subtotal, VAT, and total.
- Added renewal acceptance handoff packets to tenant backup scope and `pilot.renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with a Renewal acceptance panel showing accepted renewal total, finance approval id, accounting period, VAT mode, renewal task id, controls, and checksum/status evidence.
- Added API tests proving support rejection, pre-acceptance blocking, public renewal acceptance, finance approval linkage, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 67: Clinic Renewal HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-27.

- Added renewal HayHashvapah draft invoice packets that can be recorded only after the owner executes the accepted renewal quote's `finance.invoice.propose` approval.
- Added `/api/pilots/clinic-wellness/renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Renewal draft packets link the renewal acceptance checksum, renewal quote release, renewal quote handoff, paid pilot closeout, CRM renewal task, finance workflow run, HayHashvapah draft invoice, Armenian VAT mode, accounting period, AMD subtotal, VAT, and total.
- Added renewal HayHashvapah draft invoice packets to tenant backup scope and `pilot.renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a Renewal draft panel showing draft number, workflow run, period, VAT, subtotal, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-execution blocking, owner approval execution, HayHashvapah draft invoice linkage, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 68: Clinic Renewal Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-27.

- Added renewal official HayHashvapah invoice posting packets that can be recorded only after the renewal draft invoice is posted to an official receivable.
- Added `/api/pilots/clinic-wellness/renewal-official-invoices` list and `/api/pilots/clinic-wellness/renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Renewal posting packets link the renewal draft checksum, renewal acceptance handoff, renewal quote release, renewal quote handoff, paid pilot closeout, previous pilot posting packet, CRM renewal task, official invoice, finance invoice link, Armenian VAT mode, accounting period, AMD subtotal, VAT, and total.
- Added renewal official HayHashvapah invoice posting packets to tenant backup scope and `pilot.renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with a Renewal receivable panel showing invoice number, finance link, period, VAT, invoice id, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-posting blocking, official invoice posting, accepted renewal quote total preservation, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 69: Clinic Renewal Payment Collection Packet

Status: shipped in the local prototype on 2026-05-27.

- Added renewal payment collection packets that can be recorded only after the renewal official HayHashvapah invoice is fully paid through the finance payment receipt flow.
- Added `/api/pilots/clinic-wellness/renewal-payment-collections` list and `/api/pilots/clinic-wellness/renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Renewal payment packets link the renewal official posting checksum, renewal draft packet, renewal acceptance handoff, renewal quote release, renewal quote handoff, paid pilot closeout, prior pilot payment collection, prior official posting, CRM renewal task, paid invoice, payment receipt, Armenian VAT mode, accounting period, AMD subtotal, VAT, and paid amount.
- Added renewal payment collection packets to tenant backup scope and `pilot.renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Renewal payment panel showing payment reference, invoice number, payment date, VAT, payment id, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-payment blocking, finance receipt linkage, full-payment preservation, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 70: Clinic Renewal Cycle Closeout Packet

Status: shipped in the local prototype on 2026-05-27.

- Added renewal cycle closeout packets that can be created only after renewal payment collection evidence exists for the paid monthly renewal invoice.
- Added `/api/pilots/clinic-wellness/renewal-closeouts` list and `/api/pilots/clinic-wellness/renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support rejection.
- Renewal closeout creation creates an idempotent next-cycle CRM renewal task for the salesperson, linking the renewal payment collection, paid renewal invoice, customer, deal, prior closeout, and next renewal due date.
- Renewal closeout packets link the renewal payment collection checksum, renewal official posting, renewal draft packet, renewal acceptance handoff, renewal quote release, renewal quote handoff, prior pilot closeout, prior payment collection, paid invoice, payment receipt, current CRM renewal task, next CRM renewal task, closeout date, AMD amount, and next-cycle controls.
- Added renewal closeout packets to tenant backup scope and `pilot.renewal_closeout.created` suite/audit events.
- Updated the workspace with a Renewal closeout panel showing closeout status, collected amount, closeout date, next renewal due date, next CRM task id, controls, and checksum evidence.
- Added API tests proving support rejection, next CRM renewal task creation, checksum verification, idempotency, auditor metadata visibility, Customer 360 task propagation, backup inclusion, and audit evidence.

## Implemented Slice 71: Clinic Next Renewal Quote Handoff Packet

Status: shipped in the local prototype on 2026-05-27.

- Added next renewal quote handoff packets that can be created only after a paid renewal cycle is closed and the next-cycle CRM task exists.
- Added `/api/pilots/clinic-wellness/next-renewal-quotes` list and `/api/pilots/clinic-wellness/renewal-closeouts/:renewalCloseoutPacketId/next-renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Next renewal quote handoffs create a draft AMD quote for the next monthly renewal, require a governed `crm.quote.release` approval, and keep the public quote hidden until approval execution.
- Next renewal quote packets link the renewal closeout checksum, renewal payment collection, renewal posting, renewal draft, renewal acceptance, previous renewal quote release, previous renewal quote handoff, prior paid pilot closeout, prior payment collection, current renewal task, next renewal task, quote, approval, AMD subtotal, 20% VAT, total, and release controls.
- Added next renewal quote handoff packets to tenant backup scope and `pilot.next_renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with a Next renewal quote panel showing next-cycle amount, valid-until date, VAT, approval id, next renewal task id, controls, and status evidence.
- Added API tests proving support rejection, quote and approval creation, public quote hiding, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 72: Clinic Next Renewal Quote Release Packet

Status: shipped in the local prototype on 2026-05-27.

- Added next renewal quote release packets that can be created only after the owner executes the next renewal quote's governed `crm.quote.release` approval.
- Added `/api/pilots/clinic-wellness/next-renewal-quote-releases` list and `/api/pilots/clinic-wellness/next-renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Next renewal release packets prove that the public customer quote link is visible only after approval execution and preserve the next-renewal quote's AMD subtotal, 20% VAT, total, public token, and acceptance URL.
- Next renewal release packets link the next renewal quote handoff checksum, renewal closeout checksum, renewal payment collection, renewal posting, renewal draft, renewal acceptance, previous renewal quote release, previous renewal quote handoff, prior paid pilot closeout, prior payment collection, current renewal task, next renewal task, quote, and approval.
- Added next renewal quote release packets to tenant backup scope and `pilot.next_renewal_quote_release.created` suite/audit events.
- Updated the workspace with a Next renewal release panel showing public visibility, quote id, approval id, next renewal task id, controls, and checksum evidence.
- Added API tests proving support rejection, pre-approval blocking, public quote visibility after approval execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 73: Clinic Next Renewal Acceptance To HayHashvapah Handoff

Status: shipped in the local prototype on 2026-05-27.

- Added next renewal acceptance handoff packets that can be created only after the customer accepts the released next monthly renewal quote.
- Added `/api/pilots/clinic-wellness/next-renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/next-renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next renewal acceptance handoffs link the next renewal release checksum, next renewal quote handoff checksum, renewal closeout checksum, previous renewal release/handoff, prior paid pilot closeout, current renewal task, next renewal task, accepted quote, signer, finance invoice approval, Armenian VAT mode, accounting period, AMD subtotal, VAT, and total.
- Added next renewal acceptance handoff packets to tenant backup scope and `pilot.next_renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with a Next renewal acceptance panel showing accepted quote total, finance approval id, period, VAT mode, next renewal task id, controls, and status evidence.
- Added API tests proving support rejection, pre-acceptance blocking, public next-renewal acceptance, finance approval linkage, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 74: Clinic Next Renewal HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-27.

- Added next renewal HayHashvapah draft invoice packets that can be created only after the owner opens the target accounting period and executes the accepted next-renewal quote's governed finance approval.
- Added `/api/pilots/clinic-wellness/next-renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/next-renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Seeded the upcoming 2026-06 accounting period as locked until owner reopening, preserving Armenian period-lock governance before the next monthly renewal draft can be created.
- Next renewal draft packets link the next renewal acceptance checksum, release checksum, quote handoff checksum, renewal closeout checksum, previous renewal artifacts, current renewal task, next renewal task, accepted quote, finance approval, workflow run, HayHashvapah draft invoice, Armenian VAT mode, accounting period, AMD subtotal, VAT, and total.
- Added next renewal HayHashvapah draft invoice packets to tenant backup scope and `pilot.next_renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a Next renewal draft panel showing draft total, draft number, workflow run id, period, VAT, subtotal, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-execution blocking, period reopening, finance workflow execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 75: Clinic Next Renewal Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-27.

- Added next renewal official HayHashvapah invoice posting packets that can be recorded only after the next-renewal draft invoice is posted to an official receivable in an open accounting period.
- Added `/api/pilots/clinic-wellness/next-renewal-official-invoices` list and `/api/pilots/clinic-wellness/next-renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next renewal posting packets link the next renewal draft checksum, next renewal acceptance handoff, next renewal quote release, next renewal quote handoff, renewal closeout, previous renewal posting/draft/release/handoff, prior paid pilot posting/payment, current renewal task, next renewal task, official invoice, finance invoice link, Armenian VAT mode, accounting period, AMD subtotal, VAT, and total.
- Added next renewal official HayHashvapah invoice posting packets to tenant backup scope and `pilot.next_renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with a Next renewal receivable panel showing invoice number, finance link id, period, VAT, invoice id, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-posting blocking, official receivable posting, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 76: Clinic Next Renewal HayHashvapah Payment Collection Packet

Status: shipped in the local prototype on 2026-05-27.

- Added next renewal payment collection packets that can be recorded only after the next-renewal official HayHashvapah invoice is fully paid through the finance receipt flow.
- Added `/api/pilots/clinic-wellness/next-renewal-payment-collections` list and `/api/pilots/clinic-wellness/next-renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next renewal payment packets link the next renewal official posting checksum, draft, acceptance handoff, quote release, quote handoff, renewal closeout, previous renewal artifacts, prior paid pilot posting/payment, current renewal task, next renewal task, paid invoice, payment receipt, Armenian VAT mode, accounting period, AMD subtotal, VAT, and amount.
- Added next renewal payment collection packets to tenant backup scope and `pilot.next_renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Next renewal payment panel showing payment reference, invoice number, payment date, VAT, payment id, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-payment blocking, finance receipt linkage, full-payment preservation, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 77: Clinic Next Renewal Cycle Closeout Packet

Status: shipped in the local prototype on 2026-05-27.

- Added next renewal cycle closeout packets that can be created only after next-renewal payment collection evidence exists for the paid monthly invoice.
- Added `/api/pilots/clinic-wellness/next-renewal-closeouts` list and `/api/pilots/clinic-wellness/next-renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support rejection.
- Next renewal closeout creates an idempotent following-cycle CRM renewal task for sales while preserving the current next-renewal task as lineage.
- Next renewal closeout packets link the next renewal payment collection checksum, official posting, draft packet, acceptance handoff, quote release, quote handoff, prior renewal closeout, previous renewal artifacts, prior paid pilot artifacts, paid invoice, payment receipt, current renewal task, next renewal task, following renewal task, closeout date, AMD amount, and controls.
- Added next renewal closeout packets to tenant backup scope and `pilot.next_renewal_closeout.created` suite/audit events.
- Updated the workspace with a Next renewal closeout panel showing closeout status, collected amount, closeout date, following due date, following CRM task id, controls, and checksum evidence.
- Added API tests proving support rejection, following CRM renewal task creation, checksum verification, idempotency, auditor metadata visibility, Customer 360 task propagation, backup inclusion, and audit evidence.

## Implemented Slice 78: Clinic Following Renewal Quote Handoff Packet

Status: shipped in the local prototype on 2026-05-27.

- Added following renewal quote handoff packets that can be created only after the paid next-renewal cycle is closed and the following-cycle CRM task exists.
- Added `/api/pilots/clinic-wellness/following-renewal-quotes` list and `/api/pilots/clinic-wellness/next-renewal-closeouts/:nextRenewalCloseoutPacketId/following-renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Following renewal quote handoffs create a draft AMD quote for the next monthly cycle after the next-renewal closeout, require governed `crm.quote.release` approval, and keep the public quote hidden until approval execution.
- Following renewal quote packets link the next renewal closeout checksum, next renewal payment collection, official posting, draft, acceptance handoff, quote release, quote handoff, prior renewal artifacts, prior paid pilot artifacts, current renewal task, next renewal task, following renewal task, quote, approval, AMD subtotal, 20% VAT, total, and release controls.
- Added following renewal quote handoff packets to tenant backup scope and `pilot.following_renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with a Following renewal quote panel showing following-cycle amount, valid-until date, VAT, approval id, following renewal task id, controls, and status evidence.
- Added API tests proving support rejection, quote and approval creation, public quote hiding, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 79: Clinic Following Renewal Quote Release Packet

Status: shipped in the local prototype on 2026-05-27.

- Added following renewal quote release packets that can be created only after the owner executes the following renewal quote's governed `crm.quote.release` approval.
- Added `/api/pilots/clinic-wellness/following-renewal-quote-releases` list and `/api/pilots/clinic-wellness/following-renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Following renewal release packets prove that the public customer quote link is visible only after approval execution and preserve the following-renewal quote's AMD subtotal, 20% VAT, total, public token, and acceptance URL.
- Following renewal release packets link the following quote handoff checksum, next renewal closeout checksum, next renewal payment/posting/draft/acceptance/release lineage, previous renewal lineage, prior paid pilot lineage, current renewal task, next renewal task, following renewal task, quote, and approval.
- Added following renewal quote release packets to tenant backup scope and `pilot.following_renewal_quote_release.created` suite/audit events.
- Updated the workspace with a Following release panel showing public quote status, quote, approval, following renewal task, controls, and checksum evidence.
- Added API tests proving support rejection, pre-approval blocking, public quote visibility after approval execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 80: Clinic Following Renewal Acceptance Handoff Packet

Status: shipped in the local prototype on 2026-05-27.

- Added following renewal acceptance handoff packets that can be created only after the customer accepts the released following monthly renewal quote.
- Added `/api/pilots/clinic-wellness/following-renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/following-renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Following renewal acceptance handoffs link the following release checksum, following quote handoff checksum, next renewal closeout checksum, next renewal payment/posting/draft/acceptance/release lineage, previous renewal lineage, prior paid pilot lineage, current renewal task, next renewal task, following renewal task, accepted quote, signer, finance invoice approval, Armenian VAT mode, accounting period, AMD subtotal, VAT, and total.
- Added following renewal acceptance handoff packets to tenant backup scope and `pilot.following_renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with a Following acceptance panel showing accepted quote amount, period, VAT mode, finance approval id, following renewal task id, controls, and status evidence.
- Added API tests proving support rejection, pre-acceptance blocking, public quote acceptance, finance approval generation, packet checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 81: Clinic Following Renewal HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-27.

- Added following renewal HayHashvapah draft invoice packets that can be created only after the owner executes the accepted following-renewal quote's finance invoice approval.
- Added `/api/pilots/clinic-wellness/following-renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/following-renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Following renewal draft packets link the accepted handoff checksum, following release and quote handoff checksums, next renewal closeout lineage, prior renewal and paid pilot artifacts, current renewal task, next renewal task, following renewal task, accepted quote, finance approval, workflow run, draft invoice, Armenian VAT mode, accounting period, AMD subtotal, VAT, and total.
- Added following renewal HayHashvapah draft packets to tenant backup scope and `pilot.following_renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a Following draft panel showing draft invoice number, workflow run, accounting period, VAT, subtotal, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-approval blocking, period reopening, finance workflow execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 82: Clinic Following Renewal Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-27.

- Added following renewal official HayHashvapah invoice posting packets that can be created only after the following-renewal draft invoice is posted into the official receivables ledger.
- Added `/api/pilots/clinic-wellness/following-renewal-official-invoices` list and `/api/pilots/clinic-wellness/following-renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Following renewal official invoice packets link the following draft checksum, accepted following quote handoff, following release and quote handoff, next-renewal closeout lineage, prior next-renewal and renewal artifacts, prior paid pilot artifacts, CRM renewal tasks, posted draft invoice, official invoice, finance invoice link, Armenian VAT mode, accounting period, AMD subtotal, VAT, and total.
- Added following renewal official invoice posting packets to tenant backup scope and `pilot.following_renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with a Following receivable panel showing invoice number, finance link, accounting period, VAT, invoice id, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-posting blocking, official invoice posting, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 83: Clinic Following Renewal Payment Collection Packet

Status: shipped in the local prototype on 2026-05-27.

- Added following renewal HayHashvapah payment collection packets that can be created only after the following-renewal official invoice is fully paid.
- Added `/api/pilots/clinic-wellness/following-renewal-payment-collections` list and `/api/pilots/clinic-wellness/following-renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Following renewal payment packets link the following official posting checksum, draft packet, accepted following quote handoff, following release and quote handoff, next-renewal closeout lineage, prior next-renewal and renewal artifacts, prior paid pilot artifacts, CRM renewal tasks, official invoice, finance payment, Armenian VAT mode, accounting period, AMD VAT, and collected amount.
- Added following renewal payment collection packets to tenant backup scope and `pilot.following_renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Following payment panel showing receipt reference, invoice number, payment date, VAT, payment id, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-payment blocking, finance receipt linkage, full-payment preservation, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 84: Clinic Following Renewal Cycle Closeout Packet

Status: shipped in the local prototype on 2026-05-27.

- Added following renewal cycle closeout packets that can be created only after following-renewal HayHashvapah payment collection evidence exists for the paid monthly invoice.
- Added `/api/pilots/clinic-wellness/following-renewal-closeouts` list and `/api/pilots/clinic-wellness/following-renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support/Accountant rejection.
- Following renewal closeout creates an idempotent subsequent-renewal CRM task for sales while preserving renewal, next-renewal, and following-renewal task lineage.
- Following renewal closeout packets link the following payment collection checksum, official posting, draft packet, acceptance handoff, quote release, quote handoff, next-renewal closeout lineage, prior renewal and paid pilot artifacts, paid invoice, payment receipt, Armenian VAT mode, accounting period, AMD amount, closeout date, subsequent due date, and controls.
- Added following renewal closeout packets to tenant backup scope and `pilot.following_renewal_closeout.created` suite/audit events.
- Updated the workspace with a Following closeout panel showing status, collected amount, closeout date, subsequent due date, subsequent CRM task id, controls, and checksum evidence.
- Added API tests proving support/accountant rejection, subsequent CRM renewal task creation, checksum verification, idempotency, auditor metadata visibility, Customer 360 task propagation, backup inclusion, and audit evidence.

## Implemented Slice 85: Clinic Subsequent Renewal Quote Handoff Packet

Status: shipped in the local prototype on 2026-05-27.

- Added subsequent renewal quote handoff packets that can be created only after the paid following-renewal cycle is closed and the subsequent-renewal CRM task exists.
- Added `/api/pilots/clinic-wellness/subsequent-renewal-quotes` list and `/api/pilots/clinic-wellness/following-renewal-closeouts/:followingRenewalCloseoutPacketId/subsequent-renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Subsequent renewal quote handoffs create a draft AMD quote for the next monthly cycle after following-renewal closeout, require governed `crm.quote.release` approval, and keep the public quote hidden until approval execution.
- Subsequent renewal quote packets link the following renewal closeout checksum, following payment collection checksum, following posting/draft/acceptance/release/handoff lineage, next-renewal and renewal lineage, prior paid pilot artifacts, current CRM renewal tasks, quote, approval, AMD subtotal, 20% VAT, total, and release controls.
- Added subsequent renewal quote handoff packets to tenant backup scope and `pilot.subsequent_renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with a Subsequent renewal quote panel showing amount, valid-until date, VAT, approval id, subsequent renewal task id, controls, and status evidence.
- Added API tests proving support rejection, quote and approval creation, public quote hiding, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 86: Clinic Subsequent Renewal Quote Release Packet

Status: shipped in the local prototype on 2026-05-27.

- Added subsequent renewal quote release packets that can be created only after the owner executes the subsequent renewal quote's governed `crm.quote.release` approval.
- Added `/api/pilots/clinic-wellness/subsequent-renewal-quote-releases` list and `/api/pilots/clinic-wellness/subsequent-renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Subsequent renewal release packets prove that the public customer quote link is visible only after approval execution and preserve the subsequent-renewal quote's AMD subtotal, 20% VAT, total, public token, and acceptance URL.
- Subsequent renewal release packets link the subsequent quote handoff checksum, following renewal closeout checksum, following payment collection checksum, following renewal lineage, next-renewal and renewal lineage, prior paid pilot lineage, CRM renewal tasks, quote, and approval.
- Added subsequent renewal quote release packets to tenant backup scope and `pilot.subsequent_renewal_quote_release.created` suite/audit events.
- Updated the workspace with a Subsequent release panel showing public quote status, quote amount, VAT, approval id, subsequent renewal task id, controls, and checksum evidence.
- Added API tests proving support rejection, pre-approval blocking, public quote visibility after approval execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 87: Clinic Subsequent Renewal Acceptance Handoff Packet

Status: shipped in the local prototype on 2026-05-27.

- Added subsequent renewal acceptance handoff packets that can be created only after the customer accepts the public subsequent renewal quote and HayHashvapah invoice approval exists.
- Added `/api/pilots/clinic-wellness/subsequent-renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/subsequent-renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Subsequent renewal acceptance handoffs link the release checksum, quote handoff checksum, following renewal closeout/payment lineage, following/next/renewal/prior cycle lineage, CRM renewal tasks, accepted quote, quote acceptance, HayHashvapah finance approval, Armenian AMD totals, 20% VAT mode, and accounting period.
- Added subsequent renewal acceptance handoff packets to tenant backup scope and `pilot.subsequent_renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with a Subsequent acceptance panel showing signer, period, VAT mode, approval id, handoff controls, and status evidence.
- Added API tests proving support rejection, pre-acceptance blocking, public quote acceptance, finance approval linkage, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 88: Clinic Subsequent Renewal HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-27.

- Added subsequent renewal HayHashvapah draft invoice packets that can be created only after the owner executes the accepted subsequent renewal quote's governed `finance.invoice.propose` approval.
- Added `/api/pilots/clinic-wellness/subsequent-renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/subsequent-renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Seeded the August 2026 finance period as locked-by-default so the subsequent renewal draft path proves the Armenian period guard, reopen, and workflow retry behavior before packet creation.
- Subsequent renewal draft packets link the acceptance handoff checksum, quote release checksum, quote handoff checksum, following renewal closeout/payment lineage, following/next/renewal/prior cycle lineage, CRM renewal tasks, executed workflow run, HayHashvapah draft invoice, AMD totals, 20% VAT, and accounting period.
- Added subsequent renewal draft invoice packets to tenant backup scope and `pilot.subsequent_renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a Subsequent draft panel showing draft total, draft number, workflow run id, period, VAT, subtotal, status, and controls.
- Added API tests proving support rejection, pre-execution blocking, period-lock retry, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 89: Clinic Subsequent Renewal Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-27.

- Added subsequent renewal official HayHashvapah invoice posting packets that can be created only after the subsequent renewal draft invoice is posted into an official receivable.
- Added `/api/pilots/clinic-wellness/subsequent-renewal-official-invoices` list and `/api/pilots/clinic-wellness/subsequent-renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Subsequent renewal posting packets link the draft packet checksum, acceptance handoff checksum, quote release/handoff, following renewal closeout/payment lineage, following/next/renewal/prior cycle lineage, CRM renewal tasks, HayHashvapah draft invoice, official invoice, finance link, AMD subtotal, 20% VAT, and accounting period.
- Added subsequent renewal official invoice posting packets to tenant backup scope and `pilot.subsequent_renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with a Subsequent receivable panel showing official invoice number, finance link, period, VAT, status, checksum, and posting controls.
- Added API tests proving support rejection, pre-posting blocking, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 90: Clinic Subsequent Renewal Payment Collection Packet

Status: shipped in the local prototype on 2026-05-27.

- Added subsequent renewal payment collection packets that can be created only after the official subsequent renewal HayHashvapah invoice is fully paid.
- Added `/api/pilots/clinic-wellness/subsequent-renewal-payment-collections` list and `/api/pilots/clinic-wellness/subsequent-renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Subsequent renewal payment packets link the official posting checksum, draft packet, acceptance/release/handoff lineage, following renewal closeout/payment lineage, following/next/renewal/prior cycle lineage, CRM renewal tasks, paid invoice, payment receipt, AMD amount, 20% VAT, and accounting period.
- Added subsequent renewal payment collection packets to tenant backup scope and `pilot.subsequent_renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Subsequent payment panel showing receipt reference, invoice number, payment id, paid date, VAT, status, checksum, and collection controls.
- Added API tests proving support rejection, unpaid-invoice blocking, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 91: Clinic Subsequent Renewal Closeout Packet

Status: shipped in the local prototype on 2026-05-27.

- Added subsequent renewal closeout packets that can be created only after the paid subsequent-renewal HayHashvapah payment collection evidence exists.
- Added `/api/pilots/clinic-wellness/subsequent-renewal-closeouts` list and `/api/pilots/clinic-wellness/subsequent-renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support/Accountant rejection.
- Subsequent renewal closeout packets link the payment collection checksum, official posting checksum, draft/acceptance/release/handoff lineage, following renewal closeout/payment lineage, following/next/renewal/prior cycle lineage, paid invoice, payment receipt, AMD totals, 20% VAT, accounting period, and CRM continuation renewal task.
- Added subsequent renewal closeout packets to tenant backup scope and `pilot.subsequent_renewal_closeout.created` suite/audit events.
- Updated the workspace with a Subsequent closeout panel showing closeout date, continuation due date, continuation CRM task, payment reference, checksum, and closeout controls.
- Added API tests proving support/accountant rejection, checksum verification, idempotency, auditor metadata visibility, Customer 360 task linkage, backup inclusion, and audit evidence.

## Implemented Slice 92: Clinic Continuation Renewal Quote Handoff

Status: shipped in the local prototype on 2026-05-27.

- Added continuation renewal quote handoff packets that can be created only after the subsequent renewal cycle is closed and its CRM continuation task exists.
- Added `/api/pilots/clinic-wellness/continuation-renewal-quotes` list and `/api/pilots/clinic-wellness/subsequent-renewal-closeouts/:subsequentRenewalCloseoutPacketId/continuation-renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Continuation quote handoffs create a governed CRM quote release approval while keeping the public quote hidden until approval execution.
- Continuation handoff packets link the subsequent closeout checksum, subsequent payment collection checksum, subsequent quote/invoice lineage, following/next/renewal/prior cycle lineage, CRM renewal tasks, AMD monthly amount, 20% VAT, quote metadata, and approval metadata.
- Added continuation renewal quote handoff packets to tenant backup scope and `pilot.continuation_renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with a Continuation renewal quote panel showing quote total, valid-until date, VAT, approval id, continuation task, status, and handoff controls.
- Added API tests proving support rejection, checksum verification, hidden public quote behavior before approval, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 93: Clinic Continuation Renewal Quote Release Packet

Status: shipped in the local prototype on 2026-05-27.

- Added continuation renewal quote release packets that can be created only after the owner executes the continuation quote's governed `crm.quote.release` approval and the public quote is available.
- Added `/api/pilots/clinic-wellness/continuation-renewal-quote-releases` list and `/api/pilots/clinic-wellness/continuation-renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Continuation release packets link the continuation quote handoff checksum, subsequent renewal closeout checksum, subsequent payment collection checksum, subsequent/following/next/renewal/prior lineage, CRM renewal tasks, public quote token/URL, AMD total, and 20% VAT.
- Added continuation renewal quote release packets to tenant backup scope and `pilot.continuation_renewal_quote_release.created` suite/audit events.
- Updated the workspace with a Continuation release panel showing release status, public quote path, total, VAT, approval id, continuation task, checksum, and release controls.
- Added API tests proving support rejection, pre-approval blocking, public quote visibility after workflow execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 94: Clinic Continuation Renewal Acceptance Handoff Packet

Status: shipped in the local prototype on 2026-05-27.

- Added continuation renewal acceptance handoff packets that can be created only after the customer accepts the public continuation renewal quote and HayHashvapah invoice approval exists.
- Added `/api/pilots/clinic-wellness/continuation-renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/continuation-renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Continuation acceptance handoffs link the release checksum, quote handoff checksum, subsequent renewal closeout/payment lineage, subsequent/following/next/renewal/prior lineage, CRM renewal tasks, accepted quote, quote acceptance, HayHashvapah finance approval, Armenian AMD totals, 20% VAT mode, and accounting period.
- Added continuation renewal acceptance handoff packets to tenant backup scope and `pilot.continuation_renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with a Continuation acceptance panel showing signer, period, VAT mode, continuation task, finance approval id, checksum, and handoff controls.
- Added API tests proving support rejection, pre-acceptance blocking, public quote acceptance, finance approval linkage, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 95: Clinic Continuation Renewal HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-27.

- Added continuation renewal HayHashvapah draft invoice packets that can be created only after the owner executes the accepted continuation renewal quote's governed `finance.invoice.propose` approval.
- Added `/api/pilots/clinic-wellness/continuation-renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/continuation-renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Seeded the September 2026 finance period as locked-by-default so the continuation renewal draft path proves the Armenian period guard, reopen, and workflow retry behavior before packet creation.
- Continuation renewal draft packets link the acceptance handoff checksum, quote release checksum, quote handoff checksum, subsequent renewal closeout/payment lineage, subsequent/following/next/renewal/prior cycle lineage, CRM renewal tasks, executed workflow run, HayHashvapah draft invoice, AMD totals, 20% VAT, and accounting period.
- Added continuation renewal draft invoice packets to tenant backup scope and `pilot.continuation_renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a Continuation draft panel showing draft total, draft number, workflow run id, period, VAT, subtotal, status, and controls.
- Added API tests proving support rejection, pre-execution blocking, period-lock retry, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 96: Clinic Continuation Renewal Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-27.

- Added continuation renewal official HayHashvapah invoice posting packets that can be created only after the continuation renewal draft invoice is posted into an official receivable.
- Added `/api/pilots/clinic-wellness/continuation-renewal-official-invoices` list and `/api/pilots/clinic-wellness/continuation-renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Continuation renewal posting packets link the draft packet checksum, acceptance handoff checksum, quote release/handoff, subsequent renewal closeout/payment lineage, subsequent/following/next/renewal/prior cycle lineage, CRM renewal tasks, HayHashvapah draft invoice, official invoice, finance link, AMD subtotal, 20% VAT, and accounting period.
- Added continuation renewal official invoice posting packets to tenant backup scope and `pilot.continuation_renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with a Continuation receivable panel showing official invoice number, finance link, period, VAT, status, checksum, and posting controls.
- Added API tests proving support rejection, pre-posting blocking, official invoice posting, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 97: Clinic Continuation Renewal Payment Collection Packet

Status: shipped in the local prototype on 2026-05-27.

- Added continuation renewal payment collection packets that can be created only after the official continuation renewal HayHashvapah invoice is fully paid.
- Added `/api/pilots/clinic-wellness/continuation-renewal-payment-collections` list and `/api/pilots/clinic-wellness/continuation-renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Continuation renewal payment packets link the official posting checksum, draft packet, acceptance/release/handoff lineage, subsequent renewal closeout/payment lineage, subsequent/following/next/renewal/prior cycle lineage, CRM renewal tasks, paid invoice, payment receipt, AMD amount, 20% VAT, and accounting period.
- Added continuation renewal payment collection packets to tenant backup scope and `pilot.continuation_renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Continuation payment panel showing receipt reference, invoice number, payment id, paid date, VAT, status, checksum, and collection controls.
- Added API tests proving support rejection, unpaid-invoice blocking, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 98: Clinic Continuation Renewal Closeout Packet

Status: shipped in the local prototype on 2026-05-27.

- Added continuation renewal closeout packets that can be created only after the paid continuation-renewal HayHashvapah payment collection evidence exists.
- Added `/api/pilots/clinic-wellness/continuation-renewal-closeouts` list and `/api/pilots/clinic-wellness/continuation-renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support/Accountant rejection.
- Continuation renewal closeout packets link the payment collection checksum, official posting checksum, draft/acceptance/release/handoff lineage, subsequent renewal closeout/payment lineage, following/next/renewal/prior cycle lineage, paid invoice, payment receipt, AMD totals, 20% VAT, accounting period, and CRM ongoing renewal task.
- Added continuation renewal closeout packets to tenant backup scope and `pilot.continuation_renewal_closeout.created` suite/audit events.
- Updated the workspace with a Continuation closeout panel showing closeout date, ongoing due date, ongoing CRM task, payment reference, checksum, and closeout controls.
- Added API tests proving support/accountant rejection, checksum verification, idempotency, auditor metadata visibility, Customer 360 task linkage, backup inclusion, and audit evidence.

## Implemented Slice 99: Clinic Ongoing Renewal Quote Handoff

Status: shipped in the local prototype on 2026-05-27.

- Added ongoing renewal quote handoff packets that can be created only after the paid continuation renewal cycle is closed and its ongoing CRM renewal task exists.
- Added `/api/pilots/clinic-wellness/ongoing-renewal-quotes` list and `/api/pilots/clinic-wellness/continuation-renewal-closeouts/:continuationRenewalCloseoutPacketId/ongoing-renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Ongoing renewal quote handoffs create a draft AMD monthly renewal quote, request governed `crm.quote.release` approval, and keep the public quote hidden until approval execution.
- Ongoing renewal quote packets link the continuation renewal closeout checksum, continuation renewal payment/posting/draft/acceptance/release/handoff lineage, subsequent/following/next/renewal/prior cycle lineage, ongoing CRM renewal task, quote, approval, AMD subtotal, 20% VAT, total, and release controls.
- Added ongoing renewal quote handoff packets to tenant backup scope and `pilot.ongoing_renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with an Ongoing renewal quote panel showing amount, valid-until date, VAT, approval id, ongoing renewal task id, controls, and status evidence.
- Added API tests proving support rejection, quote and approval creation, hidden public quote behavior before approval, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 100: Clinic Ongoing Renewal Quote Release Packet

Status: shipped in the local prototype on 2026-05-27.

- Added ongoing renewal quote release packets that can be created only after the owner executes the ongoing quote's governed `crm.quote.release` approval and the public quote is available.
- Added `/api/pilots/clinic-wellness/ongoing-renewal-quote-releases` list and `/api/pilots/clinic-wellness/ongoing-renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Ongoing renewal quote release packets prove that the public customer quote link is visible only after approval execution and preserve the ongoing-renewal quote's AMD subtotal, 20% VAT, total, public token, and acceptance URL.
- Ongoing renewal quote release packets link the ongoing quote handoff checksum, continuation renewal closeout/payment/posting/draft/acceptance/release/handoff lineage, subsequent/following/next/renewal/prior cycle lineage, CRM renewal tasks, quote, and approval.
- Added ongoing renewal quote release packets to tenant backup scope and `pilot.ongoing_renewal_quote_release.created` suite/audit events.
- Updated the workspace with an Ongoing release panel showing public quote status, quote, approval, ongoing renewal task, controls, and checksum evidence.
- Added API tests proving support rejection, pre-approval blocking, public quote visibility after approval execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 101: Clinic Ongoing Renewal Acceptance Handoff Packet

Status: shipped in the local prototype on 2026-05-27.

- Added ongoing renewal acceptance handoff packets that can be created only after the customer accepts the public ongoing renewal quote and HayHashvapah invoice approval exists.
- Added `/api/pilots/clinic-wellness/ongoing-renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/ongoing-renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Ongoing acceptance handoffs link the ongoing release checksum, ongoing quote handoff checksum, continuation renewal closeout/payment/posting/draft/acceptance/release lineage, earlier renewal lineage, CRM renewal tasks, accepted quote, quote acceptance, HayHashvapah finance approval, AMD totals, 20% VAT mode, and accounting period.
- Added ongoing renewal acceptance handoff packets to tenant backup scope and `pilot.ongoing_renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with an Ongoing acceptance panel showing signer, period, VAT mode, ongoing renewal task, finance approval id, checksum-backed controls, and handoff action.
- Added API tests proving support rejection, pre-acceptance blocking, public quote acceptance, finance approval linkage, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 102: Clinic Ongoing Renewal HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-27.

- Added ongoing renewal HayHashvapah draft invoice packets that can be created only after the owner executes the accepted ongoing renewal quote's governed `finance.invoice.propose` approval.
- Added `/api/pilots/clinic-wellness/ongoing-renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/ongoing-renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Seeded the October 2026 finance period as locked by default so the ongoing renewal draft path proves Armenian period guard, reopen, and workflow retry before packet creation.
- Ongoing draft packets link the acceptance handoff checksum, quote release checksum, quote handoff checksum, continuation renewal closeout/payment lineage, earlier renewal lineage, CRM renewal tasks, executed workflow run, HayHashvapah draft invoice, AMD totals, 20% VAT, and accounting period.
- Added ongoing draft invoice packets to tenant backup scope and `pilot.ongoing_renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with an Ongoing draft panel showing draft total, draft number, workflow run id, period, VAT, subtotal, status, and controls.
- Added API tests proving support rejection, pre-execution blocking, period-lock retry, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 103: Clinic Ongoing Renewal Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-27.

- Added ongoing renewal official HayHashvapah invoice posting packets that can be created only after the ongoing draft invoice is posted into an official receivable.
- Added `/api/pilots/clinic-wellness/ongoing-renewal-official-invoices` list and `/api/pilots/clinic-wellness/ongoing-renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Ongoing official invoice packets link the ongoing draft checksum, acceptance handoff checksum, quote release checksum, quote handoff checksum, continuation renewal closeout/payment lineage, earlier renewal lineage, CRM renewal tasks, official invoice, invoice link, AMD totals, 20% VAT, and October 2026 accounting period.
- Added ongoing official invoice posting packets to tenant backup scope and `pilot.ongoing_renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with an Ongoing receivable panel showing official invoice number, invoice link, period, VAT, invoice id, status, and controls.
- Added API tests proving support rejection, pre-posting blocking, official invoice posting, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 104: Clinic Ongoing Renewal HayHashvapah Payment Collection Packet

Status: shipped in the local prototype on 2026-05-27.

- Added ongoing renewal payment collection packets that can be created only after the official ongoing renewal invoice is fully paid by a HayHashvapah receipt.
- Added `/api/pilots/clinic-wellness/ongoing-renewal-payment-collections` list and `/api/pilots/clinic-wellness/ongoing-renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Ongoing payment packets link the official posting checksum, draft packet, acceptance handoff, quote release, quote handoff, continuation renewal closeout/payment lineage, earlier renewal lineage, CRM renewal tasks, paid invoice, payment receipt, AMD amount, 20% VAT, and October 2026 period.
- Added ongoing payment collection packets to tenant backup scope and `pilot.ongoing_renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with an Ongoing payment panel showing receipt reference, paid date, VAT, payment id, status, and controls.
- Added API tests proving support rejection, pre-payment blocking, payment receipt creation, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 105: Clinic Ongoing Renewal Closeout and Next Recurring Task

Status: shipped in the local prototype on 2026-05-27.

- Added ongoing renewal closeout packets that can be created only after the paid ongoing renewal HayHashvapah payment collection packet exists.
- Added `/api/pilots/clinic-wellness/ongoing-renewal-closeouts` list and `/api/pilots/clinic-wellness/ongoing-renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support/Accountant rejection.
- Ongoing closeout packets link the payment collection checksum, official posting checksum, draft packet, acceptance handoff, quote release, quote handoff, continuation renewal closeout/payment lineage, earlier renewal lineage, CRM renewal tasks, paid invoice, payment receipt, AMD amount, 20% VAT, October 2026 period, and next recurring ongoing renewal due date.
- The closeout creates an idempotent CRM task with source key `pilot-ongoing-renewal-closeout-next:{paymentCollectionPacketId}` so sales can prepare the next ongoing renewal quote cycle.
- Added ongoing closeout packets to tenant backup scope and `pilot.ongoing_renewal_closeout.created` suite/audit events.
- Updated the workspace with an Ongoing closeout panel showing closed date, amount, next due date, next task id, checksum, and controls.
- Added API tests proving support/accountant rejection, checksum verification, idempotency, auditor metadata visibility, customer 360 task linkage, backup inclusion, and audit evidence.

## Implemented Slice 106: Clinic Next Ongoing Renewal Quote Handoff

Status: shipped in the local prototype on 2026-05-27.

- Added next ongoing renewal quote handoff packets that can be created only after the ongoing renewal cycle is closed and the next recurring CRM task exists.
- Added `/api/pilots/clinic-wellness/next-ongoing-renewal-quotes` list and `/api/pilots/clinic-wellness/ongoing-renewal-closeouts/:ongoingRenewalCloseoutPacketId/next-ongoing-renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Next ongoing handoffs create a draft CRM quote and governed `crm.quote.release` approval while keeping the public quote hidden until the approval executes.
- Next ongoing handoff packets link the ongoing closeout checksum, ongoing payment collection checksum, official posting checksum, previous continuation and renewal lineage, paid invoice/payment context, next ongoing CRM task, AMD monthly amount, and 20% Armenian VAT.
- Added next ongoing quote handoff packets to tenant backup scope and `pilot.next_ongoing_renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with a Next ongoing renewal panel showing monthly quote amount, quote id, next task id, valid-until date, VAT, approval id, status, and controls.
- Added API tests proving support rejection, quote and approval creation, hidden public quote behavior, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 107: Clinic Next Ongoing Renewal Quote Release Packet

Status: shipped in the local prototype on 2026-05-27.

- Added next ongoing renewal quote release packets that can be created only after the owner executes the governed next ongoing quote release workflow and the public quote is available.
- Added `/api/pilots/clinic-wellness/next-ongoing-renewal-quote-releases` list and `/api/pilots/clinic-wellness/next-ongoing-renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Next ongoing release packets prove public quote availability after approval execution and preserve the next ongoing quote's AMD subtotal, 20% VAT, total, public token, and acceptance URL.
- Next ongoing release packets link the next ongoing quote handoff checksum, ongoing closeout/payment/posting/draft/acceptance/release/handoff lineage, previous continuation and renewal lineage, CRM renewal tasks, next ongoing CRM task, quote, and approval.
- Added next ongoing quote release packets to tenant backup scope and `pilot.next_ongoing_renewal_quote_release.created` suite/audit events.
- Updated the workspace with a Next ongoing release panel showing public quote status, quote, approval, next ongoing task, controls, and checksum evidence.
- Added API tests proving support rejection, pre-approval blocking, public quote visibility after approval execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 108: Clinic Next Ongoing Renewal Acceptance Handoff Packet

Status: shipped in the local prototype on 2026-05-28.

- Added next ongoing renewal acceptance handoff packets that can be created only after the customer accepts the released next ongoing renewal quote and the HayHashvapah finance approval exists.
- Added `/api/pilots/clinic-wellness/next-ongoing-renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/next-ongoing-renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next ongoing acceptance handoffs link the next ongoing release checksum, next ongoing quote handoff checksum, ongoing closeout/payment/posting/draft/acceptance/release lineage, previous continuation and renewal lineage, CRM renewal tasks, next ongoing CRM task, accepted quote, quote acceptance, and HayHashvapah finance approval.
- The handoff preserves Armenian accounting context from the accepted public quote, including AMD totals, 20% VAT mode, signer evidence, and the November 2026 accounting period.
- Added next ongoing acceptance handoff packets to tenant backup scope and `pilot.next_ongoing_renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with a Next ongoing acceptance panel showing signer, period, VAT mode, finance approval, next ongoing task, controls, and checksum evidence.
- Added API tests proving support rejection, pre-acceptance blocking, public quote acceptance, finance approval linkage, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 109: Clinic Next Ongoing Renewal HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-28.

- Added next ongoing renewal HayHashvapah draft invoice packets that can be created only after the owner executes the accepted next ongoing renewal quote's governed `finance.invoice.propose` approval.
- Added `/api/pilots/clinic-wellness/next-ongoing-renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/next-ongoing-renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Seeded the November 2026 finance period as locked by default so the next ongoing renewal draft path proves the Armenian period guard, reopen, and workflow retry before packet creation.
- Next ongoing draft packets link the acceptance handoff checksum, quote release checksum, quote handoff checksum, ongoing closeout/payment/posting/draft/acceptance/release lineage, prior continuation and renewal lineage, CRM renewal tasks, executed workflow run, HayHashvapah draft invoice, AMD totals, 20% VAT, and accounting period.
- Added next ongoing renewal draft invoice packets to tenant backup scope and `pilot.next_ongoing_renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a Next ongoing draft panel showing draft total, draft number, workflow run id, period, VAT, subtotal, status, and controls.
- Added API tests proving support rejection, pre-execution blocking, period-lock retry, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 110: Clinic Next Ongoing Renewal Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-28.

- Added next ongoing renewal official HayHashvapah invoice posting packets that can be created only after the next ongoing draft invoice is posted into an official receivable.
- Added `/api/pilots/clinic-wellness/next-ongoing-renewal-official-invoices` list and `/api/pilots/clinic-wellness/next-ongoing-renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next ongoing official invoice packets link the next ongoing draft checksum, acceptance handoff checksum, quote release checksum, quote handoff checksum, ongoing closeout/payment/posting/draft/acceptance/release lineage, previous renewal lineage, CRM renewal tasks, official invoice, invoice link, AMD totals, 20% VAT, and the November 2026 accounting period.
- Added next ongoing official invoice posting packets to tenant backup scope and `pilot.next_ongoing_renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with a Next ongoing receivable panel showing official invoice number, invoice link, period, VAT, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-posting blocking, official invoice posting, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 111: Clinic Next Ongoing Renewal HayHashvapah Payment Collection Packet

Status: shipped in the local prototype on 2026-05-28.

- Added next ongoing renewal payment collection packets that can be created only after the next ongoing official HayHashvapah invoice is fully paid by a receipt.
- Added `/api/pilots/clinic-wellness/next-ongoing-renewal-payment-collections` list and `/api/pilots/clinic-wellness/next-ongoing-renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next ongoing payment packets link the official posting checksum, draft packet, acceptance handoff, quote release, quote handoff, ongoing closeout/payment/posting lineage, previous renewal lineage, CRM renewal tasks, paid invoice, payment receipt, AMD amount, 20% VAT, and November 2026 period.
- Added next ongoing payment collection packets to tenant backup scope and `pilot.next_ongoing_renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Next ongoing payment panel showing receipt reference, paid date, period, payment id, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-payment blocking, payment receipt creation, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 112: Clinic Next Ongoing Renewal Closeout Packet

Status: shipped in the local prototype on 2026-05-28.

- Added next ongoing renewal closeout packets that can be created only after paid next ongoing HayHashvapah payment collection evidence exists.
- Added `/api/pilots/clinic-wellness/next-ongoing-renewal-closeouts` list and `/api/pilots/clinic-wellness/next-ongoing-renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support/Accountant rejection.
- Next ongoing closeout packets link the payment collection checksum, official posting checksum, draft/acceptance/release/handoff lineage, ongoing closeout/payment/posting lineage, prior renewal lineage, paid invoice, payment receipt, AMD totals, 20% VAT, November 2026 period, and the following recurring ongoing CRM task.
- Added next ongoing closeout packets to tenant backup scope and `pilot.next_ongoing_renewal_closeout.created` suite/audit events.
- Updated the workspace with a Next ongoing closeout panel showing closed date, amount, following due date, following CRM task, checksum, and closeout controls.
- Added API tests proving role rejection, checksum verification, idempotency, auditor metadata visibility, Customer 360 task linkage, backup inclusion, and audit evidence.

## Implemented Slice 113: Clinic Following Ongoing Renewal Quote Handoff

Status: shipped in the local prototype on 2026-05-28.

- Added following ongoing renewal quote handoff packets that can be created only after the next ongoing renewal cycle is closed and the following recurring CRM task exists.
- Added `/api/pilots/clinic-wellness/following-ongoing-renewal-quotes` list and `/api/pilots/clinic-wellness/next-ongoing-renewal-closeouts/:nextOngoingRenewalCloseoutPacketId/following-ongoing-renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Following ongoing handoffs create a draft CRM quote and governed `crm.quote.release` approval while keeping the public quote hidden until the approval executes.
- Following ongoing handoff packets link the next ongoing closeout checksum, next ongoing payment/posting/draft/acceptance/release/handoff lineage, prior ongoing and renewal lineage, following ongoing CRM task, AMD monthly amount, and 20% Armenian VAT.
- Added following ongoing quote handoff packets to tenant backup scope and `pilot.following_ongoing_renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with a Following ongoing renewal quote panel showing monthly amount, quote id, following task id, valid-until date, VAT, approval id, status, and controls.
- Added API tests proving support rejection, quote and approval creation, hidden public quote behavior, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 114: Clinic Following Ongoing Renewal Quote Release Packet

Status: shipped in the local prototype on 2026-05-28.

- Added following ongoing renewal quote release packets that can be created only after the owner executes the governed following ongoing quote release workflow and the public quote is available.
- Added `/api/pilots/clinic-wellness/following-ongoing-renewal-quote-releases` list and `/api/pilots/clinic-wellness/following-ongoing-renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Following ongoing release packets prove public quote visibility after approval execution and preserve the following ongoing quote's AMD subtotal, 20% VAT, total, public token, and acceptance URL.
- Following ongoing release packets link the following ongoing quote handoff checksum, next ongoing closeout/payment/posting/draft/acceptance/release/handoff lineage, prior ongoing and renewal lineage, CRM renewal tasks, following ongoing CRM task, quote, and approval.
- Added following ongoing quote release packets to tenant backup scope and `pilot.following_ongoing_renewal_quote_release.created` suite/audit events.
- Updated the workspace with a Following ongoing release panel showing public quote status, total, VAT, approval, following task, controls, and checksum evidence.
- Added API tests proving support rejection, pre-approval blocking, public quote visibility after approval execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 115: Clinic Following Ongoing Renewal Acceptance Handoff Packet

Status: shipped in the local prototype on 2026-05-28.

- Added following ongoing renewal acceptance handoff packets that can be created only after the customer accepts the released following ongoing renewal quote and the HayHashvapah finance approval exists.
- Added `/api/pilots/clinic-wellness/following-ongoing-renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/following-ongoing-renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Following ongoing acceptance handoffs link the following ongoing release checksum, following ongoing quote handoff checksum, next ongoing closeout/payment/posting/draft/acceptance/release/handoff lineage, prior ongoing and renewal lineage, CRM renewal tasks, following ongoing CRM task, accepted quote, quote acceptance, and HayHashvapah finance approval.
- The handoff preserves Armenian accounting context from the accepted public quote, including AMD totals, 20% VAT mode, signer evidence, and the December 2026 accounting period.
- Added following ongoing acceptance handoff packets to tenant backup scope and `pilot.following_ongoing_renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with a Following ongoing acceptance panel showing signer, period, VAT mode, finance approval, status, and handoff controls.
- Added API tests proving support rejection, pre-acceptance blocking, public quote acceptance, finance approval linkage, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 116: Clinic Following Ongoing Renewal HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-28.

- Added following ongoing renewal HayHashvapah draft invoice packets that can be created only after the owner executes the accepted following ongoing quote's governed `finance.invoice.propose` approval.
- Added `/api/pilots/clinic-wellness/following-ongoing-renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/following-ongoing-renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Following ongoing draft packets link the acceptance handoff checksum, quote release checksum, quote handoff checksum, next ongoing closeout/payment/posting/draft/acceptance/release lineage, prior ongoing and renewal lineage, following ongoing CRM task, executed workflow run, HayHashvapah draft invoice, AMD totals, 20% VAT, and December 2026 period.
- Added following ongoing draft packets to tenant backup scope and `pilot.following_ongoing_renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a Following ongoing draft panel showing draft number, period, VAT, subtotal, following task, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-execution blocking, owner approval execution with locked-period reopen, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 117: Clinic Following Ongoing Renewal Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-28.

- Added following ongoing renewal official invoice posting packets that can be created only after the HayHashvapah draft invoice is posted into an official receivable.
- Added `/api/pilots/clinic-wellness/following-ongoing-renewal-official-invoices` list and `/api/pilots/clinic-wellness/following-ongoing-renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Following ongoing official posting packets link the draft packet checksum, acceptance handoff checksum, quote release/handoff checksums, next ongoing closeout/payment/posting lineage, prior ongoing and renewal lineage, following ongoing CRM task, HayHashvapah draft invoice, official invoice, finance invoice link, AMD totals, 20% VAT, and December 2026 period.
- Added following ongoing official posting packets to tenant backup scope and `pilot.following_ongoing_renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with a Following ongoing receivable panel showing official invoice number, invoice link, period, VAT mode, VAT, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-posting blocking, official invoice posting, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 118: Clinic Following Ongoing Renewal Payment Collection Packet

Status: shipped in the local prototype on 2026-05-28.

- Added following ongoing renewal payment collection packets that can be created only after the following ongoing official HayHashvapah invoice is fully paid by a receipt.
- Added `/api/pilots/clinic-wellness/following-ongoing-renewal-payment-collections` list and `/api/pilots/clinic-wellness/following-ongoing-renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Following ongoing payment packets link the official posting checksum, draft/acceptance/release/handoff lineage, next ongoing closeout/payment/posting lineage, prior ongoing and renewal lineage, following ongoing CRM task, official invoice, payment receipt, AMD totals, 20% VAT, and December 2026 period.
- Added following ongoing payment collection packets to tenant backup scope and `pilot.following_ongoing_renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Following ongoing payment panel showing receipt reference, paid date, period, payment id, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-payment blocking, receipt capture, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 119: Clinic Following Ongoing Renewal Closeout Packet

Status: shipped in the local prototype on 2026-05-28.

- Added following ongoing renewal closeout packets that can be created only after the following ongoing official HayHashvapah invoice is fully paid and collected.
- Added `/api/pilots/clinic-wellness/following-ongoing-renewal-closeouts` list and `/api/pilots/clinic-wellness/following-ongoing-renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support/Accountant rejection.
- Following ongoing closeout packets link payment collection checksum, official posting checksum, draft/acceptance/release/handoff lineage, next ongoing closeout/payment/posting lineage, prior ongoing and renewal lineage, official invoice, payment receipt, AMD totals, 20% VAT, and December 2026 period.
- Closeout creates an idempotent CRM task for the subsequent recurring ongoing renewal quote cycle with January 2027 due date and Customer 360 visibility.
- Added following ongoing closeouts to tenant backup scope and `pilot.following_ongoing_renewal_closeout.created` suite/audit events.
- Updated the workspace with a Following ongoing closeout panel showing closeout date, amount, subsequent due date, task id, status, controls, and checksum evidence.
- Added API tests proving support/accountant rejection, closeout packet creation, task creation, checksum verification, idempotency, auditor metadata visibility, Customer 360 task visibility, backup inclusion, and audit evidence.

## Implemented Slice 120: Clinic Subsequent Ongoing Renewal Quote Handoff Packet

Status: shipped in the local prototype on 2026-05-28.

- Added subsequent ongoing renewal quote handoff packets that can be created only after the following ongoing renewal cycle is closed and the subsequent recurring CRM task exists.
- Added `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-quotes` list and `/api/pilots/clinic-wellness/following-ongoing-renewal-closeouts/:followingOngoingRenewalCloseoutPacketId/subsequent-ongoing-renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Subsequent ongoing handoffs create a draft CRM quote and governed `crm.quote.release` approval while keeping the public quote hidden until owner approval executes.
- Subsequent ongoing handoff packets link the following ongoing closeout checksum, following ongoing payment/posting/draft/acceptance/release/handoff lineage, next ongoing closeout/payment/posting lineage, prior ongoing and renewal lineage, subsequent recurring CRM task, AMD monthly total, and 20% Armenian VAT.
- Added subsequent ongoing quote handoff packets to tenant backup scope and `pilot.subsequent_ongoing_renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with a Subsequent ongoing renewal quote panel showing monthly amount, quote id, subsequent task id, valid-until date, VAT, approval id, status, and controls.
- Added API tests proving support rejection, quote and approval creation, hidden public quote behavior, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 121: Clinic Subsequent Ongoing Renewal Quote Release Packet

Status: shipped in the local prototype on 2026-05-28.

- Added subsequent ongoing renewal quote release packets that can be created only after the owner executes the governed subsequent ongoing quote release workflow and the public quote is available.
- Added `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-quote-releases` list and `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Subsequent ongoing release packets prove public quote visibility after approval execution and preserve the subsequent ongoing quote's AMD subtotal, 20% VAT, total, public token, and acceptance URL.
- Subsequent ongoing release packets link the subsequent ongoing quote handoff checksum, following ongoing closeout/payment/posting/draft/acceptance/release/handoff lineage, next ongoing closeout/payment/posting lineage, prior ongoing and renewal lineage, CRM renewal tasks, subsequent recurring CRM task, quote, and approval.
- Added subsequent ongoing quote release packets to tenant backup scope and `pilot.subsequent_ongoing_renewal_quote_release.created` suite/audit events.
- Updated the workspace with a Subsequent ongoing release panel showing public quote status, total, VAT, approval, subsequent task, controls, and checksum evidence.
- Added API tests proving support rejection, pre-approval blocking, public quote visibility after approval execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 122: Clinic Subsequent Ongoing Renewal Acceptance Handoff Packet

Status: shipped in the local prototype on 2026-05-28.

- Added subsequent ongoing renewal acceptance handoff packets that can be created only after the customer accepts the released subsequent ongoing quote and the HayHashvapah finance approval exists.
- Added `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Subsequent ongoing acceptance handoffs link the subsequent ongoing release checksum, subsequent ongoing quote handoff checksum, following ongoing closeout/payment/posting/draft/acceptance/release/handoff lineage, next ongoing and prior ongoing lineage, CRM renewal tasks, subsequent ongoing CRM task, accepted quote, quote acceptance, and HayHashvapah finance approval.
- The handoff preserves Armenian accounting context from the accepted public quote, including AMD totals, 20% VAT mode, signer evidence, and the January 2027 accounting period.
- Added subsequent ongoing acceptance handoff packets to tenant backup scope and `pilot.subsequent_ongoing_renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with a Subsequent ongoing acceptance panel showing signer, period, VAT mode, finance approval, status, and handoff controls.
- Added API tests proving support rejection, pre-acceptance blocking, public quote acceptance, finance approval linkage, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 123: Clinic Subsequent Ongoing Renewal HayHashvapah Draft Invoice Packet

Status: shipped in the local prototype on 2026-05-28.

- Added subsequent ongoing renewal HayHashvapah draft invoice packets that can be created only after the owner executes the accepted subsequent ongoing quote's governed `finance.invoice.propose` approval.
- Added `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Subsequent ongoing draft packets link the acceptance handoff checksum, quote release checksum, quote handoff checksum, following ongoing closeout/payment/posting/draft/acceptance/release lineage, next ongoing and prior ongoing lineage, subsequent ongoing CRM task, executed workflow run, HayHashvapah draft invoice, AMD totals, 20% VAT, and January 2027 period.
- Added subsequent ongoing draft packets to tenant backup scope and `pilot.subsequent_ongoing_renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a Subsequent ongoing draft panel showing draft number, period, VAT, subtotal, subsequent task, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-execution blocking, owner approval execution with locked-period reopen, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 124: Clinic Subsequent Ongoing Renewal Official HayHashvapah Invoice Posting Packet

Status: shipped in the local prototype on 2026-05-28.

- Added subsequent ongoing renewal official invoice posting packets that can be created only after the HayHashvapah draft invoice is posted into an official receivable.
- Added `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-official-invoices` list and `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Subsequent ongoing official posting packets link the draft packet checksum, acceptance handoff checksum, quote release/handoff checksums, following ongoing closeout/payment/posting/draft/acceptance/release lineage, next ongoing and prior ongoing lineage, subsequent ongoing CRM task, HayHashvapah draft invoice, official invoice, finance invoice link, AMD totals, 20% VAT, and January 2027 period.
- Added subsequent ongoing official posting packets to tenant backup scope and `pilot.subsequent_ongoing_renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with a Subsequent ongoing receivable panel showing official invoice number, invoice link, period, VAT mode, VAT, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-posting blocking, official invoice posting, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

## Implemented Slice 125: Clinic Subsequent Ongoing Renewal Payment Collection Packet

Status: shipped in the local prototype on 2026-05-28.

- Added subsequent ongoing renewal payment collection packets that can be created only after the subsequent ongoing official HayHashvapah invoice is fully paid by a receipt.
- Added `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-payment-collections` list and `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Subsequent ongoing payment packets link the official posting checksum, draft/acceptance/release/handoff lineage, following ongoing closeout/payment/posting/draft/acceptance/release lineage, next ongoing and prior ongoing lineage, subsequent ongoing CRM task, official invoice, payment receipt, AMD totals, 20% VAT, and January 2027 period.
- Added subsequent ongoing payment collection packets to tenant backup scope and `pilot.subsequent_ongoing_renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Subsequent ongoing payment panel showing receipt reference, paid date, period, payment id, status, controls, and checksum evidence.
- Added API tests proving support rejection, pre-payment blocking, receipt capture, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

### Slice 126 - Clinic subsequent ongoing renewal closeout packet

- Added `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-closeouts` list and `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support/Accountant rejection.
- Subsequent ongoing closeout packets link the paid subsequent payment collection checksum, official posting checksum, draft/acceptance/release/handoff lineage, following ongoing closeout/payment/posting lineage, next ongoing and prior ongoing lineage, Armenian VAT period totals, and the newly scheduled next recurring ongoing CRM task.
- Added subsequent ongoing closeout packets to tenant backup scope and `pilot.subsequent_ongoing_renewal_closeout.created` suite/audit events.
- Updated the workspace with a Subsequent ongoing closeout panel showing close date, amount, next due date, next recurring task id, status, controls, and checksum evidence.
- Added API tests proving Support/Accountant rejection, closeout creation, next recurring task scheduling, checksum verification, idempotency, auditor metadata visibility, Customer 360 linkage, backup inclusion, and audit evidence.

### Slice 127 - Clinic next recurring ongoing renewal quote handoff

- Added `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-quotes` list and `/api/pilots/clinic-wellness/subsequent-ongoing-renewal-closeouts/:subsequentOngoingRenewalCloseoutPacketId/next-recurring-ongoing-renewal-quote-handoff` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Next recurring ongoing quote handoffs link the subsequent ongoing closeout checksum, paid subsequent payment collection checksum, official posting/draft/acceptance/release/handoff lineage, prior ongoing lineage, next recurring CRM task, draft quote, workflow approval, AMD totals, and Armenian 20% VAT pricing evidence.
- Added next recurring ongoing quote handoff packets to tenant backup scope and `pilot.next_recurring_ongoing_renewal_quote_handoff.created` suite/audit events.
- Updated the workspace with a Next recurring ongoing quote handoff panel showing quote total, VAT, approval id, task id, status, controls, and hidden-public-quote evidence.
- Added API tests proving Support rejection, quote handoff creation, public quote hiding before approval, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

### Slice 128 - Clinic next recurring ongoing renewal quote release

- Added `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-quote-releases` list and `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-quotes/:handoffId/release-packet` create endpoints with operational read access, Owner/Admin/Salesperson create access, Auditor metadata visibility, and Support rejection.
- Next recurring ongoing release packets can be created only after the owner-approved `crm.quote.release` workflow execution sends the quote and makes the public quote available.
- Release packets link the next recurring quote handoff checksum, subsequent ongoing closeout checksum, paid subsequent payment collection checksum, official posting/draft/acceptance/release/handoff lineage, prior ongoing lineage, next recurring CRM task, quote, approval, public token, acceptance URL, AMD totals, and Armenian 20% VAT.
- Added next recurring ongoing quote release packets to tenant backup scope and `pilot.next_recurring_ongoing_renewal_quote_release.created` suite/audit events.
- Updated the workspace with a Next recurring release panel showing public quote status, total, VAT, approval id, task id, controls, and checksum evidence.
- Added API tests proving Support rejection, pre-approval blocking, public quote visibility after workflow execution, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

### Slice 129 - Clinic next recurring ongoing renewal acceptance handoff

- Added `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-acceptance-handoffs` list and `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-quote-releases/:releaseId/acceptance-handoff` create endpoints with operational read access, Owner/Admin/Salesperson/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next recurring ongoing acceptance handoffs can be created only after the public quote is accepted and the HayHashvapah `finance.invoice.propose` workflow approval exists for the accepted quote.
- Acceptance packets link the public release checksum, next recurring quote handoff checksum, subsequent ongoing closeout/payment/posting/draft/acceptance/release lineage, prior ongoing lineage, next recurring CRM task, quote acceptance evidence, finance approval id, AMD totals, period key, and Armenian 20% VAT mode.
- Added next recurring ongoing acceptance handoff packets to tenant backup scope and `pilot.next_recurring_ongoing_renewal_quote_acceptance_handoff.created` suite/audit events.
- Updated the workspace with a Next recurring acceptance panel showing signer, billing period, VAT mode, finance approval id, status, controls, and checksum-backed invoice handoff evidence.
- Added API tests proving Support rejection, pre-acceptance blocking, accepted public quote handoff creation, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

### Slice 130 - Clinic next recurring ongoing renewal HayHashvapah draft invoice

- Added `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-hayhashvapah-drafts` list and `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-acceptance-handoffs/:handoffId/draft-invoice-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next recurring ongoing draft packets can be created only after the owner executes the accepted quote's `finance.invoice.propose` approval and the resulting HayHashvapah draft invoice exists.
- Draft packets link the acceptance handoff checksum, public release checksum, next recurring quote handoff checksum, subsequent ongoing closeout/payment/posting/draft/acceptance/release lineage, next recurring CRM task, workflow run, finance draft invoice, AMD totals, period key, and Armenian 20% VAT mode.
- Added next recurring ongoing HayHashvapah draft packets to tenant backup scope, seeded the `2027-02` locked finance period for reopenable execution proof, and emitted `pilot.next_recurring_ongoing_renewal_hayhashvapah_draft_invoice.created` suite/audit events.
- Updated the workspace with a Next recurring draft panel showing draft number, workflow run, period, VAT mode, VAT/subtotal, task id, status, controls, and checksum-backed posting readiness.
- Added API tests proving Support rejection, pre-execution blocking, period reopen/retry handling, draft packet creation, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

### Slice 131 - Clinic next recurring ongoing renewal official HayHashvapah invoice posting

- Added `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-official-invoices` list and `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-hayhashvapah-drafts/:draftPacketId/posting-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next recurring ongoing official posting packets can be created only after the HayHashvapah draft invoice is posted into an official receivable through the existing Armenian finance period-locked posting flow.
- Posting packets link the draft packet checksum, acceptance handoff checksum, public release checksum, quote handoff checksum, subsequent ongoing closeout/payment/posting/draft/acceptance/release lineage, prior ongoing lineage, next recurring CRM task, draft invoice, official invoice, finance invoice link, AMD totals, period key, and Armenian 20% VAT mode.
- Added next recurring ongoing official posting packets to tenant backup scope and emitted `pilot.next_recurring_ongoing_renewal_hayhashvapah_invoice_posting.created` suite/audit events.
- Updated the workspace with a Next recurring receivable panel showing official invoice number, invoice link, period, VAT mode, VAT, status, controls, and checksum-backed payment-collection readiness.
- Added API tests proving Support rejection, pre-posting blocking, official invoice posting, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

### Slice 132 - Clinic next recurring ongoing renewal payment collection

- Added `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-payment-collections` list and `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-official-invoices/:postingPacketId/payment-packet` create endpoints with operational read access, Owner/Admin/Accountant create access, Auditor metadata visibility, and Support rejection.
- Next recurring ongoing payment packets can be created only after the official HayHashvapah invoice is fully paid by a finance receipt.
- Payment packets link the official posting checksum, draft/acceptance/release/handoff checksums, subsequent ongoing closeout/payment/posting/draft lineage, prior ongoing lineage, next recurring CRM task, official invoice, payment receipt, AMD totals, period key, and Armenian 20% VAT mode.
- Added next recurring ongoing payment collection packets to tenant backup scope and emitted `pilot.next_recurring_ongoing_renewal_hayhashvapah_payment_collection.created` suite/audit events.
- Updated the workspace with a Next recurring payment panel showing receipt reference, paid date, period, payment id, invoice number, status, controls, and checksum-backed closeout readiness.
- Added API tests proving Support rejection, pre-payment blocking, receipt capture, checksum verification, idempotency, auditor metadata visibility, backup inclusion, and audit evidence.

### Slice 133 - Clinic next recurring ongoing renewal closeout

- Added `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-closeouts` list and `/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-payment-collections/:paymentCollectionPacketId/closeout-packet` create endpoints with operational read access, Owner/Admin create access, Auditor metadata visibility, and Support/Accountant rejection.
- Next recurring ongoing closeout packets can be created only after the next recurring HayHashvapah invoice is paid and its payment collection packet exists.
- Closeout packets link the paid next recurring payment checksum, official posting checksum, draft/acceptance/release/handoff lineage, subsequent ongoing closeout/payment/posting lineage, prior ongoing lineage, Armenian VAT period totals, and the newly scheduled following recurring ongoing CRM task.
- Added next recurring ongoing closeout packets to tenant backup scope and emitted `pilot.next_recurring_ongoing_renewal_closeout.created` suite/audit events.
- Updated the workspace with a Next recurring closeout panel showing close date, amount, following due date, following recurring task id, status, controls, and checksum evidence.
- Added API tests proving Support/Accountant rejection, closeout creation, following recurring task scheduling, checksum verification, idempotency, auditor metadata visibility, Customer 360 linkage, backup inclusion, and audit evidence.

### Slice 134 - Professional Legal Source Production Review

- Added the Lawyer demo role with docs/analytics entitlement so legal reviewers can log in separately from owner/admin users.
- Source reviews now preserve reviewer role metadata and allow Owner/Admin maintenance while requiring Accountant review for the tax-code source and Lawyer review for personal-data/e-sign sources.
- The production readiness gate now treats owner/admin source maintenance as insufficient for production sign-off; it passes legal-source gates only when the latest active review comes from the matching professional role.
- The workspace review actions are shown to the relevant professional role: Accountant for VAT/tax source review and Lawyer for e-sign/personal-data source review.
- Added API tests proving professional source-review authorization, Lawyer readiness access, owner-only review not clearing the production gate, auditor write rejection, and least-privilege Lawyer entitlements.

### Slice 135 - Downstream Professional Source Enforcement

- Downstream legal/accounting actions now share the production-readiness source rule instead of checking only `legal_sources.status = active`.
- SRC export packets require Accountant-reviewed VAT/tax source signoff before packet creation, and their payload records the latest reviewer role/name.
- Docs e-sign evidence packets, personal-data requests, export packets, and retention assessments require Lawyer-reviewed source signoff before creation/execution, and their payloads preserve the professional reviewer evidence.
- Copilot citations expose `professionalReviewReady`; proposed SRC/privacy actions remain disabled after owner-only source maintenance and unlock only after matching professional review.
- Added tests proving owner-only active source maintenance still blocks SRC, e-sign, and privacy workflows while Accountant/Lawyer review unlocks them.

### Slice 136 - Copilot Advisory Audit Trail

- Each legal/accounting Copilot answer now emits a `copilot.advisory.generated` suite timeline event and audit event.
- Audit/timeline payloads intentionally store metadata only: Copilot id, intent, customer id, risk/review flags, model policy, source ids, calculation/action keys, source-review readiness, question length, and a SHA-256 question hash.
- Raw user question text and generated answer text are not stored in the audit metadata, keeping sensitive advisory prompts out of durable logs while preserving traceability.
- The Copilot API returns the fresh event list, and the React workspace refreshes the Event bus and Audit panels after a Copilot ask without discarding the visible answer.
- Added tests proving Copilot remains non-mutating while advisory use is traceable through customer timeline and audit records.

### Slice 137 - Copilot Citation Review Evidence

- Copilot source citations now render professional-review evidence in the Armenian UI instead of showing only source title/status/date.
- Ready citations show the matching professional reviewer role/name and latest review timestamp; blocked citations show that professional review is still open and identify the latest non-professional reviewer when present.
- Added tests proving owner-only VAT source maintenance is exposed as not professionally ready, while Accountant review marks the citation ready with reviewer metadata.

### Slice 138 - Copilot Citation Source Links

- Copilot source citations now render a safe external link to the maintained Armenian legal/accounting source URL with a visible host label.
- The UI only renders HTTP(S) source links and keeps them behind an explicit user click, preserving the local/offline default while making cited authority inspectable.
- Added tests proving VAT Copilot citations carry the seeded ARLIS source URL/effective date, preserve the reviewed source URL through owner-maintained and Accountant-reviewed source updates, and reject non-HTTP(S) links in the UI helper.

### Slice 139 - Legal Source Host Stability

- Legal source reviews now keep each maintained Armenian legal/accounting source on its existing source host while still allowing path, query, and version updates.
- Host comparison normalizes case and a leading `www.`, so ARLIS review updates can use either `www.arlis.am` or `arlis.am`, while arbitrary host changes are rejected before updating `legal_sources` or adding review history.
- Added API tests proving reviewed source URLs flow into legal answer citations, same-host updates are accepted, cross-host updates are rejected, and rejected reviews do not advance the stored URL or review count.

### Slice 140 - Legal Source Host Block Audit

- Blocked legal-source host changes now leave a metadata-only governance trail instead of failing silently.
- When a reviewer attempts to move a maintained Armenian legal/accounting source to a different host, the API emits matching `legal.source.review.blocked` suite and audit events before returning `400`.
- The event payload records only the source id, normalized existing host, normalized attempted host, reason, requested status/date, and reviewer role. It deliberately avoids storing the raw rejected URL in durable audit metadata.
- Added API tests proving the blocked attempt is visible in timeline/audit evidence while `legal_sources` and `legal_source_reviews` remain unchanged.

### Slice 141 - Legal Source HTTPS Downgrade Guard

- Maintained Armenian legal/accounting sources that already use HTTPS can no longer be reviewed into HTTP URLs, even when the normalized host stays the same.
- HTTPS downgrade attempts reuse the `legal.source.review.blocked` suite/audit event with `reason: "scheme-downgrade"` and store only source id, normalized hosts, and protocols.
- Downgrade audit payloads deliberately omit the raw rejected URL, title, review note, requested status/date, and reviewer role, keeping rejected review content out of durable evidence.
- Added API tests proving HTTPS-to-HTTP downgrade attempts return `400`, leave `legal_sources` and `legal_source_reviews` unchanged, and keep normal same-host HTTPS review updates working.

### Slice 142 - Legal Source Credentialed URL Guard

- Legal source review URLs that contain username/password userinfo are rejected before mutating `legal_sources` or adding review history, even when the host and HTTPS scheme are otherwise valid.
- Credentialed URL blocks reuse the `legal.source.review.blocked` suite/audit event with `reason: "url-credentials"` and store only source id, normalized hosts, and protocols.
- Credentialed URL audit payloads deliberately omit the raw rejected URL, username/password, title, review note, requested status/date, and reviewer role, keeping secrets and rejected review content out of durable evidence.
- Copilot source links refuse credentialed legacy source URLs, so citations with embedded credentials are never rendered as clickable external links.
- Added API and source-link helper tests proving credentialed review attempts return `400`, leave source state unchanged, avoid secret leakage in suite/audit payloads, and hide credentialed citation links.

### Slice 143 - Audit Reader Gate and Legal Review Note Metadata

- The global `/api/audit` feed is now an explicit audit-reader surface limited to Owner/Admin/Auditor roles; unauthenticated users still receive `401`, while Support, Accountant, and Service Manager users receive `403`.
- The React workspace skips the global audit fetch for non-audit-reader roles, preserving their app workflow access without leaking organization-wide audit details.
- Accepted legal source reviews still preserve the full reviewer note in the canonical `legal_source_reviews` record, but `legal.source.reviewed` suite/audit metadata now stores only `reviewNoteHash` and `reviewNoteLength`.
- Added API and frontend helper tests proving audit feed role gating, accepted legal-source review note non-leakage, Salesperson and Service Manager workflow compatibility, Owner/Admin/Auditor audit-reader access, and non-audit-reader UI audit-fetch suppression.

### Slice 144 - A1 Platform Tenant Resolution Bridge

- Added optional A1 Platform tenant resolution for Studio requests, controlled by `A1_PLATFORM_TENANT_RESOLUTION` and resolved from `product=studio` plus the original request host forwarded as `x-a1-request-host`.
- `/api/health` now exposes only public enabled/resolved/strict tenant flags, while `/api/platform/tenant` is limited to audit-reader roles and returns a redacted tenant summary without database URLs or raw module objects.
- Tenant resolution fails open by default for temporary platform lookup failures, fails closed when `A1_PLATFORM_TENANT_STRICT=1`, respects the existing outbound egress allowlist, caches successful per-host lookups, and always blocks tenant maintenance, tenant disabled, or module disabled platform responses.
- Platform-provided error messages are sanitized before returning to clients, and resolved tenant org ids are checked against authenticated sessions when Platform supplies an org mapping.
- Added tests proving opt-in behavior, real-fetch `x-a1-request-host` propagation to A1 Platform, token propagation, database URL and module-secret redaction, public health redaction, non-strict fail-open behavior, strict fail-closed behavior, egress blocking, disabled tenant/module blocking, sanitized strict errors, per-host cache behavior, and cross-host session replay rejection.

### Slice 145 - Tenant-Bound Public Forms and Quotes

- Public form pages and submissions now honor the resolved A1 Platform tenant org when tenant resolution is enabled.
- Public quote read and acceptance endpoints now scope token lookup by the resolved tenant org instead of relying on token-only lookup under a routed host.
- Tenant/resource mismatches return `404` so public callers cannot distinguish missing resources from resources that belong to another tenant.
- Single-tenant/local behavior is unchanged when Platform tenant resolution is disabled or a non-blocking lookup fails open.
- Added Platform-enabled tests proving wrong-host and unmapped-host form pages/submissions and quote reads/accepts are hidden with generic missing-resource responses, and that blocked form submissions and quote acceptances do not mutate the owning tenant.

### Slice 146 - Authenticated Unmapped Tenant Fail-Closed

- Authenticated Studio routes now reject a resolved A1 Platform tenant that lacks a local org mapping, even outside strict mode, using `403 A1_PLATFORM_TENANT_ORG_UNMAPPED`.
- Non-strict `tenant:null` lookup behavior still fails open for local/single-tenant continuity, matching the existing Platform bridge policy.
- Public form and quote tenant scoping remains separate and continues to hide wrong-host or unmapped-host anonymous resources with generic missing-resource responses.
- Added Platform-enabled tests covering `tenant:null` fail-open and resolved-unmapped tenant rejection on `/api/me`, `/api/suite`, and `/api/platform/tenant`.

### Slice 147 - Unmapped Tenant Login Fail-Closed

- Password login now applies the resolved-tenant org mapping guard after credential verification and before MFA challenge or session creation.
- MFA login verification now runs the same tenant guard after a valid challenge/user is known but before marking the challenge verified, updating the factor, creating a session, or setting a cookie.
- Non-strict `tenant:null` lookup behavior, invalid-credential handling, auth rate limits, disabled/module tenant blocking, and generic public-resource 404 behavior remain unchanged.
- Added Platform-enabled tests proving resolved-unmapped tenants block password login without cookies/sessions, block MFA session issuance without mutating the challenge, and still reject mapped-host session replay on authenticated routes.

### Slice 148 - Platform Auth Failure Fail-Closed

- A1 Platform auth/config failures now remain blocking even when `A1_PLATFORM_TENANT_STRICT` is off, so a bad Platform token cannot silently disable tenant enforcement.
- Temporary lookup failures, generic Platform unavailability, and non-strict `tenant:null` responses still preserve the local-first fail-open path.
- Sanitized client messages now distinguish tenant availability blocks from Platform lookup/auth failures without leaking raw Platform messages, tokens, database URLs, or secrets.
- Added Platform-enabled tests proving non-strict `PLATFORM_AUTH_FAILED` returns sanitized `401`, blocks password login, emits no cookie, and creates no local session.

### Slice 149 - Platform Tenant Auth-Cache Hardening

- A1 Platform `401`/`403` responses now default to `PLATFORM_AUTH_FAILED` even when the response body is missing, malformed, not an object, or carries an unrecognized gateway auth code, preserving fail-closed tenant enforcement outside strict mode.
- Tenant cache keys now include strict-mode state and a short SHA-256 fingerprint of the Platform token, so token rotation or strict-mode changes cannot reuse stale cached tenant/null decisions.
- Raw Platform messages remain sanitized before reaching clients, and token/database/secrets are not exposed in auth failure responses.
- Temporary Platform outages and non-strict `tenant:null` responses still preserve the local-first fail-open path.
- Added Platform-enabled tests proving auth statuses block health/login without cookies or sessions, unrecognized coded auth responses stay sanitized, token changes bypass stale cached tenant decisions, and strict-mode changes bypass stale cached null decisions.

### Slice 150 - Platform Public Resource Lookup-Failure Guard

- Non-strict temporary A1 Platform tenant lookup failures now keep `/api/health` and authenticated local continuity fail-open, but tenant-bound anonymous public resources no longer fall back to unscoped lookup.
- Public form pages/submissions and public quote read/accept endpoints treat lookup failure as an unmapped public-resource tenant and return the same generic `404` shape used for missing or wrong-tenant resources.
- Blocked public form submissions do not create CRM leads, and blocked public quote acceptance leaves the quote in `sent` state.
- Existing opt-in behavior, strict fail-closed behavior, non-strict `tenant:null` authenticated continuity, and wrong-host/unmapped-host generic 404 behavior remain unchanged.
- Added Platform-enabled tests proving health continuity plus generic public-resource 404s and no mutation under temporary Platform lookup failure.

### Slice 151 - Public Evidence Attribution Guard

- Anonymous public form submissions no longer synthesize the human Owner as the creator/actor for generated CRM leads.
- Public form-created CRM leads keep `created_by_user_id` null, `crm.lead.created` suite events keep `actor_user_id` null, and `crm.lead.created` / `forms.submission.received` audit rows keep `user_id` null while preserving org-scoped evidence and CRM routing.
- Public quote acceptance evidence now stores the direct request socket IP; forwarded proxy headers are only a fallback when no direct IP is available, so attacker-controlled `x-forwarded-for` cannot override local evidence.
- Added focused tests proving anonymous public form attribution across lead, audit, and timeline evidence, plus direct-IP storage for unauthenticated quote acceptance.

### Slice 152 - Public Form and Session Edge Guard

- Anonymous public form-page lookups (`GET /f/:id`) are now per-IP rate limited before DB lookup/rendering, so form-id enumeration receives `429` while a fresh IP can still load a published form.
- The public form-page lookup throttle is enforced even when tunnel/reverse-proxy traffic reaches Fastify as loopback, while existing local-operator loopback exemptions remain in place for auth/setup and public quote acceptance flows.
- Bearer-authenticated `/api/logout` now revokes the bearer token, matching cookie-session logout semantics.
- `getUserBySession` carries `mfa_verified`, and privileged Owner/Admin sessions created before MFA activation are rejected once an active MFA factor exists unless the session was completed through MFA.
- Added focused tests for public form-page enumeration throttling, loopback/tunnel form-page throttling, stale pre-MFA privileged session rejection, bearer logout revocation, plus public quote regression coverage to keep unrelated quote acceptances from sharing one loopback bucket.

### Slice 153 - Trusted Proxy Public Client Guard

- Added explicit opt-in public client IP resolution for tunnel/reverse-proxy deployments through `ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS` plus `ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER`.
- Forwarded headers are ignored by default and only honored when the direct peer is configured as trusted; supported headers are `cf-connecting-ip`, `x-real-ip`, and sanitized single-value `x-forwarded-for`.
- Multi-value or malformed `x-forwarded-for` falls back to the direct trusted proxy IP but uses a non-exempt proxy rate-limit bucket, so spoofed left-most values cannot bypass login/public throttles.
- Auth login/MFA, public form page/submit, and public quote read/accept limits use the trusted public client identity; public form submissions and quote acceptance evidence store the resolved evidence IP only when trust is explicitly configured.
- Added parser, auth, public form, and public quote regression tests covering untrusted spoofed headers, trusted loopback proxy clients, malformed XFF, and evidence behavior.

### Slice 154 - Public Loopback API Throttle Guard

- Public form submissions and public quote read/accept endpoints now use the non-loopback-exempt public limiter, matching the already-hardened `/f/:id` rendered form page.
- Loopback traffic remains exempt for local operator login/setup flows, but anonymous public API traffic that arrives through a tunnel or reverse proxy as `127.0.0.1` now receives bounded bursts followed by `429`.
- Document signing consent evidence now uses the same explicit trusted-proxy public client identity resolver as public quote and form evidence, while untrusted forwarded headers remain ignored.
- Long clinic workflow tests now simulate separate public quote buyers with distinct public IPs instead of relying on one shared loopback client, keeping production throttling strict without making fixtures brittle.
- Added regression tests for loopback public form-submit spam, loopback public quote token enumeration, loopback public quote accept attempts, and trusted/untrusted document signature evidence.

### Slice 155 - Platform Tenant-Null Public Resource Guard

- Successful A1 Platform `tenant:null` responses now keep authenticated Studio continuity fail-open outside strict mode, but no longer let anonymous tenant-bound public resources fall back to unscoped local lookup.
- Public form pages/submissions and public quote read/accept endpoints treat `tenant:null` as an unmapped public-resource tenant and return the same generic `404` shape used for missing, wrong-host, unmapped-host, and lookup-failure resources.
- Blocked public form submissions do not create CRM leads, and blocked public quote acceptance leaves the quote in `sent` state.
- Existing local/single-tenant behavior remains unchanged when Platform tenant resolution is disabled, and authenticated `/api/me` still works for non-strict `tenant:null` continuity.
- Added Platform-enabled tests proving health continuity plus generic public-resource `404`s and no mutation under successful `tenant:null` lookup.

### Slice 156 - Webhook Credentialed URL Guard

- Outbound webhook endpoint URLs containing username/password userinfo are now rejected before mutation, preventing credentialed targets from being persisted, listed, delivered to, or included in backup/restore context.
- Rejection uses the existing invalid-URL path and keeps the full credentialed URL and password out of the response body.
- Added a regression test proving the rejected URL is absent from the webhook endpoint list and database table after the failed create attempt.

### Slice 157 - Evidence Packet Reader Guard

- Signature evidence packets, privacy export packets, privacy retention assessments, and finance SRC exports now support formatter-level `includePayload` controls for broad list/suite reads.
- Full signature/privacy evidence payloads, checksums, and source keys are visible only to Owner/Admin/Lawyer/Auditor roles; full finance SRC evidence is visible only to Owner/Admin/Accountant/Auditor roles.
- Unsupported authenticated roles still receive stable packet summaries, but `payload`, `checksum`, and `sourceKey` are nulled so broad `/api/suite`, `/api/docs/signature-packets`, `/api/privacy/requests`, and `/api/finance/src-exports` reads do not leak customer tax IDs, signer evidence, source keys, or packet internals.
- Added route-level regression coverage with seeded sentinel evidence proving Support receives redacted summaries while Lawyer/Accountant users retain their permitted packet payload access.

### Slice 158 - Event Feed Payload Reader Guard

- Suite timeline reads now support role-aware payload inclusion through `eventFeedOptions(user)`.
- `/api/events`, event-returning mutation responses, and `/api/suite` redact sensitive event payload keys for non-audit roles while preserving stable operational identifiers such as quote numbers.
- Owner/Admin/Auditor still receive full timeline payload evidence for review and audit workflows.
- Unoptioned internal event-feed reads now default to redacted payloads, so forgotten call-site options fail closed instead of exposing raw timeline payloads.
- Added regression coverage proving Support cannot read quote acceptance signer email/name/total from customer event feeds, `/api/suite`, or a service-case mutation response, while Owner retains the full payload on explicitly full-access event reads.
- Customer 360 intentionally fetches full timeline payloads before applying its own role policy, preserving Owner/Admin full-customer360 evidence while Support still receives redacted timeline payloads.

### Slice 159 - Forms Submission Detail Reader Guard

- Authenticated Forms list/detail routes now use a dedicated `requireFormsReader` gate instead of plain authentication.
- Campaign-enabled roles and existing forms-writer roles, including Service Manager, can read form definitions and submissions; the read-only Auditor keeps explicit review access; Support is blocked from private intake submissions because Support lacks Campaigns access.
- Public published-form submission remains unauthenticated, rate-limited, key-whitelisted, and unchanged.
- Added regression coverage proving Support receives `403` and no submitted email/message content, while Salesperson, Service Manager, and Auditor can still read the submitted form detail.

### Slice 160 - Integration Connector Credential Guard

- Integration connector configuration now rejects endpoint URLs containing username/password userinfo before the connector row is inserted or updated.
- Endpoint URLs are validated on the raw trimmed value before the persisted 260-character limit is applied, so long credentialed URLs cannot hide userinfo past truncation.
- The rejection path uses a sanitized `400` response that does not echo the full credentialed URL or password material.
- Failed connector configuration leaves list responses, secret fingerprints, and persisted connector rows unchanged, so credentialed endpoints cannot leak through connector inventory or backup-scoped connector data.
- Legacy unsafe endpoint values already present in storage are hidden from connector list and health-check responses; the health check reports a missing endpoint instead of echoing stored credentials or truncated credential fragments.
- Added regression coverage for WhatsApp Business configuration proving raw and long credentialed URLs plus submitted secret fingerprints are absent after rejection, and legacy stored unsafe endpoint URLs are not surfaced by list or health-check APIs.

### Slice 161 - Copilot Launcher Route

- The Legal & Accounting Copilot is now a first-class launcher app, seeded with priority 3 between CRM/Finance and the remaining Suite modules.
- Existing local databases receive the Copilot app and least-privilege role assignments on reopen without requiring a fresh seed.
- Workspace app selection now follows `/app/<id>` routes, pushes history when a user opens another app, and respects browser back/forward navigation.
- App panels expose stable in-page anchors for launcher navigation; `/app/copilot` renders the Copilot panel as the active workspace.
- Added regression coverage for fresh and existing database app entitlements, plus rendered Playwright proof for Copilot to Finance route switching and back navigation.

### Slice 162 - Copilot App Access Gate

- `POST /api/copilot/questions` now requires the caller's role to have the `copilot` app assignment before intent-specific gates run.
- Finance-enabled roles without Copilot access can no longer call VAT/month-close advisory flows just because they still have Finance access.
- The React Copilot panel is no longer rendered for roles without the Copilot app assignment.
- Copilot intent tabs are filtered by the user's assigned intent apps, so UI choices match the same app-access model enforced by the API.
- Added regression coverage proving an Accountant with Finance enabled but Copilot disabled receives `403`, plus rendered proof that Support cannot see the Copilot panel at `/app/copilot`.

### Slice 163 - Dashboard Launcher Role Contract

- Seeded role app assignments now have a source-wiring regression that derives seeded login users from the fixture database, fetches each role's `/api/suite` launcher list, and checks every exposed app has the expected `/app/<id>` route.
- The same regression compares assigned app ids against `SUITE_APP_IDS` and the `suite-app-<id>` workspace anchor contract in `web/src/main.jsx`, preventing future app-assignment drift from creating a left-sidebar product with no landing target.
- Rendered Playwright proof on a fresh local preview confirmed every exposed sidebar product opens and scrolls into view for Owner, Operator, Support, Accountant, Lawyer, Salesperson, Service Manager, and Auditor.
- Suite route helpers normalize legacy product aliases before route fallback, so `/app/hayhashvapah` opens canonical HayHashvapah Finance and `/app/forms` opens the Campaigns & Forms surface.
- Malformed percent-encoded `/app/<id>` path segments now fall back to CRM instead of throwing during route selection, keeping bad local links from blanking the workspace.
- Stale invalid assigned app ids cannot become selected dashboard routes; the route helper falls back to the first canonical assigned product or CRM instead of echoing unknown assignment rows back into navigation state.
- Route app ids are trimmed and lowercased before alias and allow-list matching, so copied links like `/app/Finance` and encoded `/app/%20copilot%20` open the intended product.
- Route generation now emits canonical `/app/<id>` paths for aliases, whitespace/case drift, and unknown ids, preventing future callers from writing malformed route segments into browser history.
- Sidebar launcher buttons expose stable `data-app-id` and `data-target-app-id` metadata, and a Playwright-backed seeded-role matrix verifies every assigned product button opens its canonical route and matching workspace panel.
- Latest verification for the checkpoint: focused dashboard sidebar openability test = 1 pass; focused route helper test = 9 pass; focused dashboard source-wiring test = 1 pass; `npm test` = 424 pass.

### Slice 164 - App Assignment Role Guard

- Owner app-assignment writes now accept only roles represented by current org users plus the explicit system `Admin` role, so arbitrary submitted roles cannot create new entitlement authorities.
- Existing invalid `app_assignments` rows no longer authorize themselves through the assignment endpoint and no longer appear in live app-assignment inventory as valid role assignments.
- Access-review packets still expose enabled stale assignment rows through `invalidAssignmentRoles` and the `invalid-app-assignment-roles-detected` finding, preserving auditor visibility without granting runtime access.
- Added regression coverage with an enabled legacy `Ghost Role` assignment proving the write is rejected, no assignment audit event is created, valid role/app-matrix/orphaned-role evidence stays clean, and stale evidence is explicitly reported.
- Verification for the checkpoint: focused assignment/access-review tests = 3 pass; `test/api.test.js` = 171 pass; `npm test` = 359 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`; final read-only security review reported no findings.

### Slice 165 - App Assignment Enabled-Value Guard

- Owner app-assignment writes now accept only omitted or boolean `enabled` values; omitted still means enabled, but strings such as `"false"` are rejected instead of becoming truthy access grants.
- Rejected enabled-value writes return `400`, leave `app_assignments` unchanged, and create no `app.assignment.updated` audit event.
- The assignment update regression now proves Support can be explicitly disabled from an assigned app and loses the app from `/api/suite` after the boolean `false` update.
- Added regression coverage proving a string `"false"` toggle is rejected before mutation, omitted `enabled` still writes an explicit enabled assignment, Support visibility changes in `/api/suite` match each boolean update, and rejected writes emit no assignment audit entry.
- Verification for the checkpoint: focused app-assignment tests = 4 pass; `test/api.test.js` = 173 pass; `npm test` = 361 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 166 - Webhook Enabled-Value Guard

- Owner webhook endpoint creation now accepts only omitted or boolean `enabled` values; omitted still means enabled, while strings such as `"false"` are rejected instead of becoming active outbound endpoints.
- Explicit boolean `false` remains supported and persists disabled endpoints as `enabled = 0`, with list responses preserving `enabled: false`.
- Rejected enabled-value writes return `400`, keep the rejected endpoint out of `webhook_endpoints` and endpoint lists, do not leak the submitted secret in the error body, and create no `webhook.endpoint.created` audit event.
- Added regression coverage for disabled endpoint persistence/listing and non-boolean enabled rejection before persistence.
- Verification for the checkpoint: focused webhook endpoint tests = 3 pass; `test/api.test.js` = 175 pass; `npm test` = 363 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 167 - Integration Connector Owner-Role Guard

- Integration connector configuration now validates `ownerRole` through the same tenant role contract used by app assignments.
- Unknown connector owner roles return `400` before mutation, leaving the existing endpoint URL, environment, secret fingerprint, owner role, and audit event count unchanged.
- This keeps Integration Hub readiness and clinic-pilot remediation evidence assigned only to reachable tenant roles or the explicit system Admin role.
- Added regression coverage proving a `Ghost Role` connector write is rejected, does not rotate the connector secret fingerprint, does not change environment or endpoint URL, does not appear in connector inventory, and emits no extra `integration.connector.configured` audit event.
- Verification for the checkpoint: focused integration connector tests = 3 pass; `test/api.test.js` = 176 pass; `npm test` = 364 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 168 - Integration Connector Enum Guard

- Integration connector configuration now rejects invalid submitted `status` and `environment` enum values instead of silently falling back while still mutating the connector row.
- Rejected enum writes return `400` before mutation, leaving the existing endpoint URL, environment, status, secret fingerprint, and audit event count unchanged.
- Existing stored legacy enum drift is sanitized through the default planned/sandbox values when those fields are omitted.
- Added regression coverage proving invalid `status: "ready"` and `environment: "prod"` writes do not rotate connector secret fingerprints, endpoint URLs, status, environment, list output, or audit evidence.
- Verification for the checkpoint: focused integration connector tests = 4 pass; `test/api.test.js` = 177 pass; `npm test` = 365 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 169 - Integration Connector Scope Guard

- Integration connector configuration now rejects malformed submitted `scopes` values instead of silently reusing previous scopes while still mutating the connector row.
- Submitted scopes must be an array of non-empty safe strings; omitted scopes continue to preserve the existing connector scopes.
- Rejected scope writes return `400` before mutation, leaving the existing endpoint URL, environment, status, scope list, secret fingerprint, and audit event count unchanged.
- Added regression coverage proving string scopes and unsafe control-character scope items do not rotate connector secret fingerprints, endpoint URLs, environments, scope evidence, list output, or audit records.
- Verification for the checkpoint: focused integration connector tests = 5 pass; `test/api.test.js` = 178 pass; `npm test` = 366 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 170 - Integration Connector Evidence Text Guard

- Integration connector configuration and health checks now reject submitted non-string notes, non-string sample events, and control-character evidence text before writing connector or readiness rows.
- Omitted connector notes continue to preserve existing notes; accepted evidence strings are trimmed, length-limited, and sanitized on output for legacy unsafe rows.
- Rejected evidence-text writes return `400` before mutation, leaving connector endpoint URL, environment, note, secret fingerprint, last health status, health-check count, and audit event count unchanged.
- Added regression coverage proving object notes and multiline sample events do not become `[object Object]`, raw control-character readiness evidence, rotated secrets, or extra audit records.
- Verification for the checkpoint: focused integration connector tests = 6 pass; `test/api.test.js` = 179 pass; `npm test` = 367 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 171 - Integration Connector Secret Guard

- Integration connector configuration now validates submitted `secret` values before hashing them into connector credential fingerprints.
- Omitted and blank submitted secrets continue to preserve the existing fingerprint; non-empty submitted secrets must be strings up to 4096 characters without control characters.
- Rejected secret writes return `400` before mutation, leaving endpoint URL, environment, owner role, note, scopes, secret hash/fingerprint, and audit event count unchanged.
- Added regression coverage proving object secrets and multiline secrets do not become `[object Object]`-derived fingerprints, malformed credential hashes, list output, or extra configuration audit records.
- Verification for the checkpoint: focused integration connector tests = 7 pass; `test/api.test.js` = 180 pass; `npm test` = 368 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 172 - Integration Connector Endpoint URL Guard

- Integration connector configuration now rejects non-string submitted `endpointUrl` values before URL safety validation.
- Omitted endpoint URLs continue to preserve and sanitize existing connector URLs; submitted endpoint URLs must be strings before they can be accepted as routing evidence.
- Rejected endpoint URL writes return `400` before mutation, leaving endpoint URL, environment, owner role, note, scopes, secret hash/fingerprint, and audit event count unchanged.
- Added regression coverage proving array and object endpoint URLs do not coerce into connector targets, rotate secrets, appear in connector inventory, or emit extra configuration audit records.
- Verification for the checkpoint: focused integration connector tests = 8 pass; `test/api.test.js` = 181 pass; `npm test` = 369 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 173 - Integration Connector Enum Type Guard

- Integration connector configuration now rejects non-string submitted `status` and `environment` values before enum validation.
- Omitted enum fields continue to preserve and sanitize existing values; submitted enum fields must be strings before they can be accepted as readiness/environment evidence.
- Rejected enum-type writes return `400` before mutation, leaving endpoint URL, environment, status, owner role, note, scopes, secret hash/fingerprint, and audit event count unchanged.
- Added regression coverage proving array `status` and array `environment` values do not coerce into valid enum values, rotate secrets, change connector targets, appear in inventory, or emit extra configuration audit records.
- Verification for the checkpoint: focused integration connector tests = 9 pass; `test/api.test.js` = 182 pass; `npm test` = 370 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 174 - Integration Connector Legacy Array Guard

- Integration connector list and health-check flows now sanitize legacy malformed stored scope arrays before using them as granted-scope evidence.
- Stored object-shaped, malformed, or mixed unsafe `scopes` values no longer leak object keys through connector inventory, while immutable `capabilities` and `required_scopes` are always rendered from connector definitions instead of tenant DB rows.
- Health checks and connector list output treat malformed or stale stored scopes as missing and compare granted scopes against definition-pinned required scopes, so legacy drift blocks readiness instead of trusting invalid or stale evidence.
- Added regression coverage proving object-shaped and malformed legacy arrays are hidden from list output, stale stored `ready` health is downgraded, clinic-template readiness surfaces current missing scopes, required scopes fall back to connector contract defaults, valid-but-stale contract arrays cannot override definitions, missing-scope checks block readiness, and object keys do not appear in health-check evidence.
- Verification for the checkpoint: focused integration connector tests = 10 pass; `test/api.test.js` = 183 pass; `npm test` = 371 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 175 - Webhook And Event Payload Guard

- Webhook endpoint creation now validates `name`, `url`, and `secret` as safe strings before persistence instead of coercing object or array payloads with `String(...)`.
- Webhook event payloads must be non-empty arrays containing only supported event strings; mixed legacy/unknown event arrays are rejected instead of silently filtering to a partial supported set.
- Suite event creation now requires payloads to be plain objects, legacy array payloads are redacted to `{}` for non-audit event feeds, and malformed or oversized event-feed limits are normalized instead of producing odd pagination.
- Rejected malformed webhook and suite-event writes return `400`, keep submitted secrets out of error bodies, leave durable tables unchanged, and create no false creation audit evidence.
- Added regression coverage proving object-shaped webhook names/secrets, mixed unsupported webhook event arrays, array suite-event payloads, legacy array payload redaction, and invalid/oversized event-feed limits do not leak sensitive evidence.
- Verification for the checkpoint: focused webhook/event tests = 6 pass; `test/api.test.js` = 184 pass; `npm test` = 372 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 176 - Integration Connector Scalar Contract Guard

- Integration connector list and health-check formatting now pins connector identity, provider, auth type, data-boundary, and rebuild-policy fields to source-code connector definitions instead of trusting mutable tenant rows.
- Stored legacy `status`, `environment`, and `last_health_status` drift is normalized before output; stale stored `ready` health is downgraded when the current connector state is not actually connected.
- Clinic pilot connector readiness now receives sanitized connector status and health evidence, so legacy scalar drift cannot make a stale connector look launch-ready.
- Added regression coverage proving legacy scalar drift does not appear in connector inventory, health-check evidence, or clinic-template readiness output.
- Verification for the checkpoint: focused integration connector tests = 11 pass; `test/api.test.js` = 186 pass; `npm test` = 374 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 177 - Suite Event Metadata Guard

- Suite event creation now validates `eventType`, `subjectType`, `subjectId`, optional `customerId`, and optional `status` as safe strings before persistence.
- Array-shaped or object-shaped request bodies are rejected before metadata normalization, preventing `[object Object]` subject or status evidence from entering event feeds.
- Rejected malformed suite-event metadata returns `400`, keeps submitted payload secrets out of error bodies, leaves `suite_events` unchanged, and creates no `suite.event.created` audit record.
- Added regression coverage proving object-shaped subject/status metadata and array request bodies do not persist, do not audit, and do not leak sensitive payload strings into event lists.
- Verification for the checkpoint: focused suite event/webhook tests = 7 pass; `test/api.test.js` = 186 pass; `npm test` = 374 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 178 - Workflow Test Event Metadata Guard

- Workflow test-event creation now rejects non-plain-object request bodies before evaluating automation rules.
- Submitted `eventType`, `subjectType`, `subjectId`, `customerId`, and `note` values must be safe strings before they can become workflow evidence.
- Submitted test-event payloads must be plain objects; array-shaped payloads are rejected instead of becoming checksum and audit inputs.
- Rejected malformed workflow test events return `400`, keep submitted payload secrets out of error bodies, leave `workflow_test_events`, `suite_events`, and `audit_events` unchanged, and do not leak `[object Object]` evidence into test-event lists.
- Verification for the checkpoint: focused workflow test-event tests = 2 pass; `test/api.test.js` = 187 pass; `npm test` = 375 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 179 - Workflow Dry-Run Metadata Guard

- Workflow dry-run creation now rejects non-plain-object request bodies before evaluating automation previews.
- Submitted `customerId`, `invoiceId`, and `note` values must be safe strings before they can become matched-subject, preview, checksum, or note evidence.
- Control-character notes and array-shaped request bodies are rejected instead of becoming dry-run evidence.
- Rejected malformed workflow dry-runs return `400`, keep submitted payload secrets out of error bodies, leave `workflow_dry_runs`, `suite_events`, and `audit_events` unchanged, and do not leak `[object Object]` evidence into dry-run lists.
- Verification for the checkpoint: focused workflow dry-run tests = 2 pass; `test/api.test.js` = 188 pass; `npm test` = 376 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 180 - Workflow Rule Change Metadata Guard

- Workflow rule state and rollback writes now reject non-plain-object request bodies before mutating automation rules.
- State and rollback reasons must be safe strings with enough review context before they can become rule-version, suite-event, or audit evidence.
- Rollback `versionNumber` / `targetVersionNumber` values must be actual positive integers; strings and arrays are rejected instead of being numerically coerced.
- Rejected malformed state and rollback requests return `400`, keep submitted payload secrets out of error bodies, leave `automation_rule_versions`, `suite_events`, and `audit_events` unchanged, and do not leak `[object Object]` evidence into rule-version lists.
- Verification for the checkpoint: focused workflow rule/rollback tests = 3 pass; `test/api.test.js` = 189 pass; `npm test` = 377 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 181 - Workflow Approval Decision Metadata Guard

- Workflow approval decision writes now reject non-plain-object request bodies before mutating approval state.
- Submitted `decision` values must be real `approved` / `rejected` strings, so arrays like `["approved"]` can no longer be coerced into approvals.
- Submitted decision notes must be safe strings up to 500 characters without control characters before they can become suite-event payload evidence.
- Rejected malformed approval decisions return `400`, keep submitted payload secrets out of error bodies, leave `workflow_approvals`, `suite_events`, and `audit_events` unchanged, and do not leak malformed note evidence into approval event payloads.
- Verification for the checkpoint: focused workflow approval tests = 3 pass; `test/api.test.js` = 190 pass; `npm test` = 378 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 182 - Finance Period Close Metadata Guard

- Finance period close now rejects non-plain-object request bodies before mutating period-lock state.
- Submitted close reasons must be safe strings up to 500 characters without control characters before they can become `finance_periods.reason` or `finance.period.closed` payload evidence.
- Omitted and blank close reasons still use the explicit `Closed by owner` fallback, preserving the existing no-body close behavior.
- Rejected malformed close requests return `400`, keep submitted payload secrets out of error bodies, leave `finance_periods`, `suite_events`, and `audit_events` unchanged, and do not leak malformed close reasons into finance period lists.
- Verification for the checkpoint: focused finance period tests = 6 pass; `test/api.test.js` = 191 pass; `npm test` = 379 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 183 - Draft Invoice Posting Metadata Guard

- Draft invoice posting now rejects non-plain-object request bodies before mutating HayHashvapah draft or receivable state.
- Submitted official invoice numbers must be safe strings up to 80 characters without control characters before they can become invoice, link, ledger, event, or audit evidence.
- Omitted and blank official invoice numbers still use the existing `DRAFT-` to `HHV-` fallback, preserving the current no-body post behavior.
- Rejected malformed post requests return `400`, keep submitted payload secrets out of error bodies, leave `finance_draft_invoices`, `invoices`, `finance_invoice_links`, `ledger_journal`, `suite_events`, and `audit_events` unchanged, and do not leak malformed invoice evidence into receivables.
- Verification for the checkpoint: focused draft invoice/payment receipt tests = 18 pass; `test/api.test.js` = 192 pass; `npm test` = 380 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 184 - Payment Receipt Metadata Guard

- Payment receipt posting now rejects non-plain-object request bodies before mutating payment, invoice, ledger, collection, event, audit, or webhook state.
- Submitted payment amounts must be positive finite numbers or numeric strings, while `paidAt`, `method`, and `reference` must be safe strings without control characters before they can become payment source keys or durable evidence.
- Omitted and blank optional receipt fields still use the current fallback behavior: today's date, `bank-transfer`, and `<invoice-number>-<paid-date>`.
- Rejected malformed receipt requests return `400`, keep submitted payload secrets out of error bodies, leave `finance_payments`, invoice status, `ledger_journal`, `suite_events`, `audit_events`, and `webhook_deliveries` unchanged, and do not leak malformed payment evidence into receivables.
- Verification for the checkpoint: focused draft invoice/payment receipt/webhook tests = 19 pass; `test/api.test.js` = 193 pass; `npm test` = 381 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 185 - Bank Transaction Import Metadata Guard

- Bank transaction import now rejects non-plain-object request bodies before mutating imported bank transaction, match, event, audit, or downstream reconciliation state.
- Submitted bank import amounts must be positive finite numbers or numeric strings; `transactionDate`, `direction`, bank name, account number, currency, description, and reference must be safe strings without control characters before they can become source-key or match evidence.
- Omitted and blank optional bank import text fields still use the current fallback behavior: `Unknown bank`, `AMD`, blank account/description, and `<bank-name>-<date>-<amount>` references.
- Rejected malformed bank import requests return `400`, keep submitted payload secrets out of error bodies, leave `finance_bank_transactions`, `suite_events`, and `audit_events` unchanged, and do not leak malformed bank evidence into Customer 360 or reconciliation.
- Verification for the checkpoint: focused bank transaction/payment receipt tests = 6 pass; `test/api.test.js` = 194 pass; `npm test` = 382 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 186 - SRC Export Metadata Guard

- SRC export creation now rejects non-plain-object request bodies before building Armenian SRC accountant-review packets.
- Submitted `periodKey` values must be real `YYYY-MM` strings, and submitted notes must be safe strings without control characters before they can become packet, checksum, source-key, suite-event, or audit evidence.
- Omitted and blank optional notes still use the current blank-note fallback, preserving existing export behavior for valid requests.
- Rejected malformed SRC export requests return `400`, keep submitted payload secrets out of error bodies, leave `finance_src_exports`, `suite_events`, and `audit_events` unchanged, and do not leak malformed export evidence into stored packets.
- Verification for the checkpoint: focused SRC export/finance tests = 14 pass; `test/api.test.js` = 195 pass; `npm test` = 383 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 187 - Signature Packet Metadata Guard

- Accepted-quote signature packet creation now rejects non-plain-object request bodies before building Docs & Sign evidence packets.
- Submitted `quoteId` values must be safe strings, and submitted notes must be safe strings without control characters before they can become packet, checksum, source-key, suite-event, or audit evidence.
- Omitted and blank optional notes still use the current blank-note fallback, preserving existing valid signature-packet behavior.
- Rejected malformed signature packet requests return `400`, keep submitted payload secrets out of error bodies, leave `docs_signature_packets`, `suite_events`, and `audit_events` unchanged, and do not leak malformed signature evidence into packet lists.
- Verification for the checkpoint: focused signature packet/evidence tests = 4 pass; `test/api.test.js` = 196 pass; `npm test` = 385 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 188 - Finance Expense Metadata Guard

- Expense posting now rejects non-plain-object request bodies before mutating expense or ledger state.
- Submitted expense subtotals must be positive finite numbers or numeric strings; submitted VAT amounts must be non-negative finite numbers or numeric strings.
- Submitted incurred dates, descriptions, and vendors must be safe strings without control characters before they can become expense, ledger, or audit evidence.
- Omitted and blank optional VAT/date/text fields still use the current fallback behavior: zero VAT, today's date, and blank description/vendor.
- Rejected malformed expense requests return `400`, keep submitted payload secrets out of error bodies, leave `expenses`, `ledger_journal`, and `audit_events` unchanged, and do not leak malformed expense evidence into finance reports.
- Verification for the checkpoint: focused finance report/expense tests = 2 pass; focused signature packet/evidence tests = 4 pass; `test/api.test.js` = 196 pass; `npm test` = 385 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 189 - Finance Bill Metadata Guard

- Supplier bill creation now rejects non-plain-object request bodies before mutating bill or ledger state.
- Submitted bill subtotals must be positive finite numbers or numeric strings; submitted VAT amounts must be non-negative finite numbers or numeric strings.
- Submitted bill dates, due dates, suppliers, and descriptions must be safe strings without control characters before they can become bill, ledger, payables, or audit evidence.
- Omitted and blank optional VAT/date/text fields still use the current fallback behavior: zero VAT, today's date, due date equal to bill date, and blank supplier/description.
- Rejected malformed bill requests return `400`, keep submitted payload secrets out of error bodies, leave `bills`, `ledger_journal`, and `audit_events` unchanged, and do not leak malformed bill evidence into payables reports.
- Verification for the checkpoint: focused payables tests = 3 pass; `test/api.test.js` = 196 pass; `npm test` = 386 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 190 - Finance Bill Payment Metadata Guard

- Supplier bill payments now reject non-plain-object request bodies before mutating bill payment, payable status, ledger, or audit state.
- Submitted payment amounts must be positive finite numbers or numeric strings, while submitted payment dates, methods, and references must be safe strings without control characters before they can become payment or ledger evidence.
- Omitted and blank optional payment fields still use the current fallback behavior: today's date, `bank-transfer`, and blank reference.
- Rejected malformed bill payment requests return `400`, keep submitted payload secrets out of error bodies, leave `bill_payments`, `bills.status`, `ledger_journal`, and `audit_events` unchanged, and do not leak malformed payment evidence into payables records.
- Verification for the checkpoint: focused payables tests = 4 pass; `test/api.test.js` = 196 pass; `npm test` = 387 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 191 - Finance Opening Balance Metadata Guard

- Opening balance posting now rejects non-plain-object request bodies before mutating opening-balance ledger state.
- Submitted opening balance dates must be exact ISO calendar dates, submitted entries must be bounded arrays of plain objects, account codes must be supported opening-balance chart codes other than the opening-balance equity contra account, and amounts must be non-negative finite numbers or numeric strings.
- Amount `0` still clears an account's opening balance, preserving the current correction workflow, while negative or fractional-to-zero amounts are rejected before they can silently clear balances.
- Rejected malformed opening balance requests return `400`, keep submitted payload secrets out of error bodies, leave existing opening balance rows and `audit_events` unchanged, and do not leak malformed evidence into ledger rows.
- Verification for the checkpoint: focused opening balance tests = 10 pass; `test/api.test.js` = 196 pass; `npm test` = 388 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 192 - Payroll Run Metadata Guard

- Finance payroll runs and People-HR employee payroll runs now reject non-plain-object request bodies before mutating payroll, ledger, or audit state.
- Submitted generic payroll gross amounts must be positive finite numbers or numeric strings, submitted payroll dates must be exact ISO calendar dates, and employee ids/names must be safe strings before they can become payroll or ledger evidence.
- Employee-scoped payroll runs now reject submitted gross, employee id, or employee name overrides, preserving the employee registry as the source of truth for that workflow.
- Optional payroll config overrides must be structured, bounded numeric objects instead of arrays, strings, control-character text, unsafe money values, invalid stamp brackets, or rates above 1 before they can affect payroll calculations.
- Post-calculation invariants reject negative-net or deductions-over-gross results before persistence, even if a future config path expands payroll override fields.
- Rejected malformed payroll requests return `400`, keep submitted payload secrets out of error bodies, leave `payroll_runs`, `ledger_journal`, and `audit_events` unchanged, and do not leak malformed payroll evidence into payroll lists or ledger memos.
- Verification for the checkpoint: focused payroll/tax-rate tests = 9 pass; `test/api.test.js` = 196 pass; `npm test` = 389 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 193 - People-HR Employee Metadata Guard

- People-HR employee creation and update now reject non-plain-object request bodies before mutating employee registry or audit state.
- Submitted employee names, tax IDs, positions, departments, hire dates, email/contact text, salary values, and employment statuses must be structurally valid before they can become employee or audit evidence.
- Salary values must be non-negative finite numbers or numeric strings, hire dates must be exact ISO calendar dates, and employment status must remain one of `active`, `on-leave`, or `terminated`.
- Rejected malformed employee requests return `400`, keep submitted payload secrets out of error bodies, leave `people_employees` and `audit_events` unchanged, and do not leak malformed evidence into employee registry rows.
- Verification for the checkpoint: focused People-HR/payroll/tax-rate tests = 13 pass; `test/api.test.js` = 196 pass; `npm test` = 390 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 194 - Payroll Preview Metadata Guard

- Payroll calculation previews now reject non-plain-object request bodies before calculating payroll output.
- Submitted preview gross amounts must be positive finite numbers or numeric strings, `asOf` dates must be exact ISO calendar dates, and optional config overrides must pass the same bounded numeric validation used by persisted payroll runs.
- Invalid override configurations that would produce missing stamp coverage, out-of-range rates, unsafe money thresholds, negative net pay, or deductions above gross are rejected before a preview response is returned.
- Rejected malformed preview requests return `400`, keep submitted payload secrets out of error bodies, leave `payroll_runs`, `ledger_journal`, and `audit_events` unchanged, and valid previews still do not persist rows.
- Verification for the checkpoint: focused payroll/tax-rate tests = 10 pass; `test/api.test.js` = 196 pass; `npm test` = 391 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 195 - Legal Source Review Metadata Guard

- Professional legal-source reviews now reject non-plain-object request bodies before mutating maintained legal sources, review rows, suite events, or audit records.
- Submitted review titles, source URLs, effective dates, statuses, and review notes must be safe strings without control characters before they can become legal-source evidence.
- Effective dates must be exact ISO calendar dates, source URLs must be bounded HTTP(S) URLs without non-default ports, statuses must remain in the legal-source lifecycle enum, and canonical review notes are bounded before storage.
- Rejected malformed review requests return `400`, keep submitted payload secrets out of error bodies, leave `legal_sources`, `legal_source_reviews`, `suite_events`, and `audit_events` unchanged, while blocked host mismatch, HTTPS downgrade, and credentialed URL evidence now stores only the trusted existing host plus attempted-host hash/match metadata.
- Verification for the checkpoint: focused admin/legal/production-readiness tests = 9 pass; `test/api.test.js` = 198 pass; `npm test` = 393 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 196 - Admin Evidence Metadata Guard

- Audit export, access review, and tenant backup packet creation now reject non-plain-object request bodies before mutating admin evidence state.
- Submitted notes, audit export period bounds, and access review periods must be structurally safe before they can become packet or audit evidence.
- Audit export period bounds must be exact ISO dates or canonical UTC timestamps, access review periods must be `YYYY-Qn` or a real `YYYY-MM`, and malformed values are rejected before packet creation.
- Rejected malformed admin evidence requests return `400`, keep submitted payload secrets out of error bodies, leave `audit_export_packets`, `access_review_packets`, `tenant_backup_packets`, `suite_events`, and `audit_events` unchanged, and valid packet creation remains unchanged.
- Verification for the checkpoint: focused admin/legal/production-readiness tests = 9 pass; `test/api.test.js` = 198 pass; `npm test` = 393 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 197 - Docs & Sign Metadata Guard

- Docs & Sign document, signer, signing, and void writes now reject non-plain-object request bodies before mutating document or signature state.
- Submitted document titles, bodies, document types, customer IDs, signer names/emails/user IDs, signing signer IDs, and void reasons must be structurally safe before they can become document, signature, suite-event, or audit evidence.
- Document types must remain in the Docs lifecycle enum, document bodies may keep ordinary multiline text, and IDs/reasons/contact metadata reject object, array, overlong, or control-character input before persistence.
- Omitted optional fields still preserve the existing fallback behavior, including blank document bodies, blank signer emails/user IDs, default `agreement` document type, and blank void reasons.
- Rejected malformed Docs & Sign requests return `400`, keep submitted payload secrets out of error bodies, leave `documents`, `document_signers`, `suite_events`, and `audit_events` unchanged, and valid document patching, signing, and voiding remain unchanged.
- Verification for the checkpoint: focused Docs/Sign/templates/export tests = 17 pass; `test/api.test.js` = 198 pass; `npm test` = 395 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 198 - Project Metadata Guard

- Project, task, milestone, and time-entry writes now reject non-plain-object request bodies before mutating delivery tracking state.
- Submitted project names/descriptions, task and milestone titles, optional IDs, notes, statuses, due dates, start dates, entry dates, milestone reached flags, and time-entry minutes must be structurally safe before they can become project or audit evidence.
- Project and task statuses must stay in their lifecycle enums, dates must be exact ISO calendar dates, milestone `reached` must be a real boolean, and time-entry minutes must be finite positive whole-minute values.
- Omitted optional fields still preserve the existing fallback behavior, including blank optional dates/IDs/text and today's fallback date for time entries.
- Rejected malformed project requests return `400`, keep submitted payload secrets out of error bodies, leave `projects`, `project_tasks`, `project_milestones`, `project_time_entries`, and `audit_events` unchanged, and valid project hierarchy writes remain unchanged.
- Verification for the checkpoint: focused Projects/billing tests = 7 pass; `test/api.test.js` = 198 pass; `npm test` = 395 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 199 - Forms Metadata Guard And Docs Send Body Follow-Up

- Forms definition create/update and public submit now reject non-plain-object request bodies before mutating form, submission, lead, or audit state.
- Submitted form titles, descriptions, statuses, field arrays, field keys, labels, field types, required flags, and declared public values must be structurally safe before they can become form or submission evidence.
- Field keys must be simple stable identifiers for public HTML controls, field types must remain in the supported renderer set, required flags must be real booleans, and public submit values must be strings without unsafe control characters.
- Undeclared public submit keys remain ignored, preserving the existing public key-whitelist contract while rejecting malformed declared values before persistence.
- Docs & Sign send now rejects null, array, or non-empty object request bodies before a draft can move to out-for-signature.
- Rejected malformed Forms and Docs send requests return `400`, keep submitted payload secrets out of error bodies, leave `forms`, `form_submissions`, `crm_leads`, `documents.status`, and `audit_events` unchanged, and valid form authoring, public submission, and document sending remain unchanged.
- Verification for the checkpoint: focused Forms/page/isolation tests = 17 pass; focused Docs/Sign/templates/export tests = 17 pass; `test/api.test.js` = 198 pass; `npm test` = 396 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 200 - CRM Lead Metadata Guard

- CRM lead creation now rejects missing or non-plain-object request bodies before mutating lead, suite-event, or audit state.
- Submitted company/contact/email/phone/tax/segment/source/channel/interest/consent fields must be structurally safe before they can become lead routing or customer-conversion evidence.
- Lead email must keep its email shape, required company/contact/phone/interest fields must meet minimum lengths, and estimated value must be a safe non-negative amount without exponent/object/array coercion.
- Omitted optional tax, segment, source, channel, estimated value, and consent fields still preserve the existing defaults used by manual lead capture and public form lead handoff.
- Rejected malformed CRM lead requests return `400`, keep submitted payload secrets out of error bodies, leave `crm_leads`, `suite_events`, and `audit_events` unchanged, and valid lead capture plus Forms-created leads remain unchanged.
- Verification for the checkpoint: focused CRM/Form tests = 5 pass; focused Forms/page/isolation tests = 17 pass; `test/api.test.js` = 199 pass; `npm test` = 397 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 201 - CRM Lead Conversion Metadata Guard

- CRM lead conversion now rejects non-plain-object request bodies before mutating customer, deal, profile, activity, suite-event, or audit state.
- Submitted forecast categories, deal titles, and next-step text must be structurally safe before they can become conversion, Tube, or Customer 360 evidence.
- Forecast categories must remain in the CRM forecast enum, deal titles and next steps reject object/array/control-character/overlong input, and omitted fields still preserve the existing hot-lead/default-title/default-next-step behavior.
- Rejected malformed conversion requests return `400`, keep submitted payload secrets out of error bodies, leave `customers`, `customer_profiles`, `customer_profile_sources`, `deals`, conversion activities, suite events, audit events, and lead conversion pointers unchanged.
- Verification for the checkpoint: focused CRM conversion tests = 4 pass; `test/api.test.js` = 200 pass; `npm test` = 398 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 202 - CRM Deal Forecast Metadata Guard

- CRM deal forecast updates now reject missing or non-plain-object request bodies before upserting forecast rows or writing suite/audit evidence.
- Submitted forecast categories, close dates, and manager notes must be structurally safe before they can become Tube, Customer 360, or audit evidence.
- Forecast category remains limited to `pipeline`, `best_case`, `commit`, or `omitted`; close dates must be exact ISO calendar dates; manager notes reject object/array/control-character/overlong input.
- Rejected malformed forecast updates return `400`, keep submitted payload secrets out of error bodies, leave forecast/suite/audit counts unchanged, and leave an existing forecast row byte-for-byte unchanged.
- Lead conversion default deal-title generation now keeps no-body conversions valid for CRM or Forms leads with a maximum-length company name by bounding the generated default title to the deal title limit.
- Verification for the checkpoint: focused CRM conversion/forecast tests = 6 pass; `test/api.test.js` = 201 pass; `npm test` = 399 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 203 - CRM Quote Metadata Guard

- CRM quote creation now rejects missing or non-plain-object request bodies before mutating quote, quote-line, suite-event, or audit state.
- Submitted customer/deal IDs, titles, valid-until dates, line descriptions, quantities, and unit prices must be structurally safe before they can become commercial quote evidence.
- Quote valid-until dates must be exact ISO calendar dates, line quantities/prices must be safe positive whole AMD amounts, line arrays are bounded, and legacy `unit_price` inputs remain accepted for compatibility.
- Quote-release approval requests now reject malformed request bodies and approval notes before creating workflow approvals or release-request evidence, while still allowing omitted notes for normal release requests.
- Rejected malformed quote requests return `400`, keep submitted payload secrets out of error bodies, leave quotes, quote lines, workflow approvals, suite events, and audit events unchanged, and valid draft quote creation, release approval, public acceptance, and webhooks remain unchanged.
- Verification for the checkpoint: focused CRM quote tests = 4 pass; `test/api.test.js` = 202 pass; `npm test` = 400 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 204 - Public Quote Acceptance Metadata Guard

- Public quote acceptance now rejects missing or non-plain-object request bodies before mutating quote acceptance, deal, finance approval, suite-event, audit, or webhook state.
- Submitted signer names, signer emails, and optional acceptance dates must be structurally safe before they can become public acceptance, Customer 360, Docs & Sign, finance handoff, or webhook evidence.
- Signer emails must keep their email shape, signer names must meet bounded text limits, and accepted-at dates remain optional but must be exact ISO calendar dates when supplied.
- Malformed repeat acceptances are rejected before idempotent acceptance responses, preserving the existing acceptance row and event counts instead of treating unsafe follow-up evidence as valid.
- Internal pilot quote handoffs now prevalidate quote-release approval notes before creating CRM quote drafts, preventing malformed approval notes from orphaning quote/quote-line rows without workflow approval or handoff evidence.
- Rejected malformed public acceptance and pilot quote-handoff requests return `400`, keep submitted payload secrets out of error bodies, leave quote/deal state, quote acceptances, quote drafts, quote lines, finance approvals, workflow approvals, suite events, audit events, and webhook deliveries unchanged, and valid acceptance, omitted accepted-at fallback, public quote rate limiting, trusted-proxy acceptance evidence, signed quote packets, quote/deal webhooks, and pilot quote handoff remain unchanged.
- Verification for the checkpoint: focused public quote acceptance/Docs tests = 5 pass; public quote rate-limit/evidence tests = 11 pass; `test/api.test.js` = 203 pass; `npm test` = 401 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 205 - Collection Promise And Reminder Metadata Guard

- CRM collection promise creation now rejects malformed request bodies before computing source keys, creating payment promises, moving collection tasks, or writing suite/audit records.
- Submitted promised amounts, promised-on dates, reminder channels, and notes must be structurally safe before they can become Customer 360 collection evidence.
- Collection reminder sends now reject malformed request bodies, channels, and provider evidence before creating delivery rows, moving promise/task status, or writing suite/audit records, while preserving the existing omitted-body fallback to the stored reminder channel and manual provider label.
- Rejected malformed collection promise and reminder requests return `400`, keep submitted payload secrets out of error bodies, leave promise/delivery counts, task state, promise state, suite events, and audit events unchanged, and valid promise creation, idempotent reminders, payment fulfillment, and Armenian bank reconciliation remain unchanged.
- Verification for the checkpoint: focused collection tests = 5 pass; `test/api.test.js` = 204 pass; `npm test` = 402 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 206 - Legal Question Metadata Guard

- Legal question creation now rejects malformed request bodies before selecting sources, creating legal questions, generating answers, attaching citations, requesting workflow approval, or writing suite/audit records.
- Submitted customer IDs, legal topics, and question text must be structurally safe before they can become Customer 360 legal evidence or cited-answer workflow evidence.
- Question text remains required and bounded, topics remain optional but bounded, and object/array/control-character inputs are rejected instead of being coerced into question, topic, source-selection, approval, or audit evidence.
- Rejected malformed legal-question requests return `400`, keep submitted payload secrets out of error bodies, leave legal question, answer, answer-source, workflow approval, suite-event, and audit counts unchanged, and valid VAT, personal-data source selection, legal approval, publication workflow, and legal source review remain unchanged.
- Verification for the checkpoint: focused legal question/source tests = 9 pass; `test/api.test.js` = 205 pass; `npm test` = 403 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 207 - AI Advisory Metadata Guard

- AI advisory creation now rejects malformed request bodies before generating customer briefs, deal risk briefs, overdue invoice explanations, ticket summaries, or workflow builder suggestions.
- Submitted customer, deal, invoice, case, and workflow prompt metadata must be structurally safe before it can become advisory, Customer 360, workflow-builder, suite-event, or audit evidence.
- Advisory prompts preserve the existing defaults for customer, deal, invoice, and ticket summaries, while workflow-builder prompts remain required and all prompts are bounded and reject object/array/control-character input.
- Rejected malformed AI advisory requests return `400`, keep submitted payload secrets out of error bodies, leave advisory table, suite-event, and audit counts unchanged, and valid customer, deal, invoice, ticket, and workflow-builder advisory generation remains unchanged.
- Verification for the checkpoint: focused AI advisory tests = 6 pass; `test/api.test.js` = 206 pass; `npm test` = 404 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 208 - Copilot Question Metadata Guard

- Copilot advisory generation now rejects malformed request bodies before resolving intent context, calculations, citations, proposed actions, timeline events, or audit records.
- Submitted questions, intents, customer IDs, document IDs, employee IDs, period keys, as-of dates, and payroll gross preview inputs must be structurally safe before they can become Copilot context or advisory evidence.
- Period keys must be exact valid `YYYY-MM` values, as-of dates must be exact valid ISO calendar dates, payroll gross must be a bounded non-negative safe whole AMD value, and object/array/control-character inputs are rejected instead of being coerced into Copilot decisions.
- Rejected malformed Copilot requests return `400`, keep submitted payload secrets out of error bodies, leave Copilot suite-event and audit counts unchanged, and valid VAT, payroll, month-close, personal-data, e-sign, entitlement, and unknown-resource behavior remains unchanged.
- Verification for the checkpoint: focused Copilot metadata/regression tests = 8 pass; full `test/copilot.test.js` = 13 pass; `test/api.test.js` = 206 pass; `npm test` = 405 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 209 - Service Case Metadata Guard

- Desk service mutations now reject malformed request bodies before creating cases, recording replies, updating case routing, opening escalations, closing resolutions, or writing timeline/audit evidence.
- Submitted customer IDs, subjects, priorities, channels, reply bodies, status updates, owner IDs, escalation severities/reasons, resolution codes/summaries, satisfaction scores, and customer-confirmation timestamps must be structurally safe before they can become service evidence.
- Choice fields remain limited to their existing enums, single-line metadata rejects object/array/control-character/overlong input, multiline reply/escalation/resolution narrative text remains valid, satisfaction scores must be bounded 1-5 values, and duplicate escalation/resolution calls keep their existing idempotent behavior.
- Rejected malformed service requests return `400`, keep submitted payload secrets out of error bodies, leave service case/message/escalation/resolution rows plus service suite-event and audit counts unchanged, and valid case creation, replies, supervisor escalation, resolution, and PATCH reassignment remain unchanged.
- Verification for the checkpoint: focused service metadata tests = 5 pass; dedicated `test/service-cases.test.js` = 2 pass; `test/api.test.js` = 207 pass; `npm test` = 406 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 210 - Project Billing Metadata Guard

- Project bill-time requests now reject non-plain-object request bodies before computing the project-period idempotency key or mutating finance state.
- Project billing-preview queries now reject malformed hourly-rate and as-of query values before quote/VAT calculations, so preview totals use the same safe billing metadata rules as persisted billing.
- Submitted hourly rates, issue dates, period keys, and due-day values must be structurally safe before they can become invoice, ledger, billed-time, or audit evidence.
- Hourly rates must be positive safe whole AMD amounts, issue dates must be exact ISO calendar dates, period keys must be valid `YYYY-MM` months, and due-day values must be bounded positive whole days instead of arrays, objects, control-character strings, or coercible malformed values.
- Omitted optional issue dates, period keys, and due-day values still preserve the existing defaults, while `hourlyRate` remains required for billing.
- Rejected malformed bill-time requests return `400`, keep submitted payload secrets out of error bodies, leave `finance_draft_invoices`, `invoices`, `ledger_journal`, `project_time_entries.billed_invoice_id`, and `audit_events` unchanged, and valid project time billing plus idempotent rebilling remain unchanged.
- Verification for the checkpoint: focused `test/project-billing.test.js` = 5 pass; `test/api.test.js` = 207 pass; `npm test` = 425 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 211 - Docs Template Metadata Guard

- Docs template generation now rejects non-plain-object request bodies before generating a draft document or writing document-created audit evidence.
- Submitted customer IDs, template variable keys, and template variable values must be structurally safe before they can become generated document title/body/customer evidence.
- Customer IDs must be safe strings, variable containers must be plain objects, variable keys must be stable identifier-like names, and variable values must be bounded single-line strings instead of arrays, objects, control-character text, or overlong values.
- Omitted optional customer IDs and variables still preserve the existing defaults, including auto-filled organization/date/customer context and visible FILL markers for unsupplied declared variables.
- Rejected malformed template generation requests return `400`, keep submitted payload secrets out of error bodies, leave `documents` and `audit_events` unchanged, and valid template generation plus literal mustache-value insertion remain unchanged.
- Verification for the checkpoint: focused `test/docs-templates.test.js` = 5 pass; `test/api.test.js` = 207 pass; `npm test` = 408 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 212 - Analytics Metadata Guard

- Analytics semantic snapshot capture and analytics report packet creation now reject non-plain-object request bodies before mutating analytics evidence or writing suite/audit events.
- Submitted snapshot report dates, report packet types, formats, period keys, and notes must be structurally safe before they can become analytics snapshot/report evidence.
- Snapshot report dates must be exact ISO calendar dates, report period keys must be valid `YYYY-MM` months, report type/format selectors must be strings in their existing enums, and notes must be bounded single-line strings instead of arrays, objects, control-character text, or overlong values.
- Omitted optional snapshot report dates, report period keys, formats, and notes still preserve the existing defaults.
- Rejected malformed analytics requests return `400`, keep submitted payload secrets out of error bodies, leave `analytics_metric_snapshots`, `analytics_report_packets`, analytics suite events, and analytics audit events unchanged, and valid snapshot/report creation remains unchanged.
- Verification for the checkpoint: focused analytics tests = 4 pass; `test/api.test.js` = 208 pass; `npm test` = 409 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 213 - Privacy Request Metadata Guard

- Privacy personal-data requests now reject non-plain-object request bodies before resolving reviewed legal sources or mutating privacy/workflow evidence.
- Submitted customer IDs, request types, requester emails, request channels, and notes must be structurally safe before they can become privacy request, approval, suite-event, or audit evidence.
- Customer IDs and notes must be bounded safe strings, request types and channels must stay inside their existing enums, requester emails must be bounded valid email-shaped strings, and arrays, objects, control-character text, invalid selectors, or overlong values are rejected instead of coerced.
- Omitted optional channels still preserve the existing `Manual` default, while customer IDs, request types, requester emails, and notes remain required.
- Rejected malformed privacy requests return `400`, keep submitted payload secrets out of error bodies, leave `privacy_requests`, privacy workflow approvals, privacy suite events, and privacy audit events unchanged, and valid reviewed-source export/delete requests remain unchanged.
- Verification for the checkpoint: focused privacy tests = 5 pass; `test/api.test.js` = 209 pass; `npm test` = 410 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 214 - App Assignment Metadata Guard

- Owner app-assignment writes now reject non-plain-object request bodies before changing role app access or writing assignment audit evidence.
- Submitted role values and enabled toggles must be structurally safe before they can become app-assignment state.
- Roles must be bounded safe strings drawn from the assignable role set, enabled must be a boolean when present, and arrays, objects, explicit JSON null bodies, control-character roles, or overlong roles are rejected instead of coerced.
- Omitted `enabled` still preserves the existing explicit-enable behavior for valid plain-object assignment bodies.
- Rejected malformed app-assignment requests return `400`, keep submitted payload secrets out of error bodies, leave `app_assignments` and assignment audit events unchanged, and valid enable/disable plus unknown-role rejection behavior remains unchanged.
- Verification for the checkpoint: focused app-assignment tests = 5 pass; `test/api.test.js` = 210 pass; `npm test` = 411 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 215 - Session Revoke Metadata Guard

- Admin session revocation now rejects non-plain-object request bodies before revoking a target session or writing revocation audit evidence.
- Submitted revocation reasons must be structurally safe before they can become session inventory or audit evidence.
- Reasons must be bounded single-line strings when present, and arrays, objects, explicit JSON null bodies, control-character text, or overlong values are rejected instead of coerced.
- Omitted reasons still preserve the existing `Administrative revocation` default for valid plain-object revoke bodies.
- Rejected malformed session-revoke requests return `400`, keep submitted payload secrets out of error bodies, leave the target session active, leave `revoked_reason` empty, and write no `admin.session.revoked` audit event; valid revocation and Auditor read-only behavior remain unchanged.
- Verification for the checkpoint: focused session-admin tests = 3 pass; `test/api.test.js` = 211 pass; `npm test` = 412 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 216 - Legal Law-Search Query Guard

- Armenian legal law-search now rejects malformed query metadata before running the RAG lookup.
- Submitted search text and result-limit values must be structurally safe before they can become legal search input.
- Query text must be a bounded single-line string, result limits must be whole-number strings between 1 and 20, and control-character text, overlong prompts, non-numeric limits, fractional limits, and out-of-range limits are rejected instead of coerced.
- Omitted query text still returns the existing empty result response, and omitted result limits still preserve the default of 8.
- Rejected malformed law-search queries return `400`, keep submitted payload secrets out of error bodies, avoid RAG lookup, and valid authenticated Armenian law search plus bounded `k` behavior remain unchanged.
- Verification for the checkpoint: focused `test/legal-search.test.js` = 2 pass; `npm test` = 426 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 217 - Pilot Template Install Body Guard

- Clinic/wellness pilot template installation now rejects malformed JSON bodies before creating install, suite-event, audit, or backup evidence.
- Submitted install metadata must be a plain object before any customer/template defaults are resolved.
- Explicit array, null, or scalar bodies are rejected instead of being coerced into omitted-body demo defaults, while truly omitted bodies still preserve the default `cust-nare` pilot installation path.
- Rejected malformed pilot install requests return `400`, keep submitted payload secrets out of error bodies, leave template installations unchanged, and write no audit event; valid owner install and support-role denial behavior remain unchanged.
- Verification for the checkpoint: focused pilot install test = 1 pass; `npm test` = 426 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 218 - Analytics As-Of Query Guard

- Analytics receivables aging, semantic metrics, and semantic metric drilldowns now reject malformed `asOf` query dates before calculating report values.
- Submitted report dates must be exact ISO calendar dates before they can become analytics report-date context.
- Invalid date text, impossible calendar dates, and control-character strings are rejected instead of silently falling back to the default report date.
- Omitted `asOf` values still preserve the existing default report date, and valid dated semantic metrics continue to return the requested `reportDate`.
- Rejected malformed analytics query requests return `400`, keep submitted payload secrets out of error bodies, and valid analytics semantic metrics, drilldowns, and role-access behavior remain unchanged.
- Verification for the checkpoint: focused analytics semantic metrics test = 1 pass; `npm test` = 426 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 219 - Analytics Snapshot Filter Query Guard

- Analytics semantic snapshot reads now reject malformed filter query metadata before reading snapshot rows.
- Submitted `metricId`, `reportDate`, `from`, and `to` filters must be structurally safe before they can become snapshot SQL filters.
- Metric IDs must be bounded single-line strings, date filters must be exact ISO calendar dates, and control-character strings, overlong metric IDs, invalid dates, and impossible calendar dates are rejected instead of coerced.
- Omitted filters still preserve the existing all-snapshots behavior, and valid metric/date filters continue returning the matching snapshot series.
- Rejected malformed snapshot filter queries return `400`, keep submitted payload secrets out of error bodies, and valid analytics snapshot listing, series grouping, backup scope, and audit behavior remain unchanged.
- Verification for the checkpoint: focused analytics semantic snapshots test = 1 pass; `npm test` = 426 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 220 - CRM List Query Filter Guard

- CRM lead and quote list reads now reject malformed filter query metadata before reading CRM rows.
- Submitted lead `status` and quote `customerId` filters must be structurally safe before they can become list SQL filters or customer assertions.
- Lead statuses must stay inside the existing CRM lead status set, quote customer IDs must be bounded single-line strings, and control-character strings, overlong values, and unknown status selectors are rejected instead of coerced.
- Omitted filters still preserve the existing all-leads/all-quotes behavior, and valid lead-status and quote-customer filters continue returning the matching CRM lists.
- Rejected malformed CRM list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid CRM list, quote, and lead behavior remains unchanged.
- Verification for the checkpoint: focused CRM list filter test = 1 pass; `npm test` = 427 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 221 - Collection List Query Filter Guard

- CRM collection promise and reminder list reads now reject malformed filter query metadata before reading collection rows.
- Submitted `customerId` filters must be structurally safe before they can become collection list SQL filters or customer assertions.
- Collection customer IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-promises/all-reminders behavior, and valid customer filters continue returning the matching collection evidence lists.
- Rejected malformed collection list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid collection promise, reminder, and Customer 360 behavior remains unchanged.
- Verification for the checkpoint: focused collection list filter test = 1 pass; `npm test` = 428 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 222 - Signature Packet List Query Filter Guard

- Docs signature packet list reads now reject malformed filter query metadata before reading signature evidence rows.
- Submitted `customerId` filters must be structurally safe before they can become signature packet list SQL filters or customer assertions.
- Signature packet customer IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-signature-packets behavior, and valid customer filters continue returning the matching Docs evidence list.
- Rejected malformed signature packet list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid signature packet creation, redaction, and evidence list behavior remains unchanged.
- Verification for the checkpoint: focused signature packet list filter test = 1 pass; `npm test` = 429 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 223 - Finance List Query Filter Guard

- Finance draft-invoice, payment, and bank-transaction list reads now reject malformed filter query metadata before reading finance rows.
- Submitted `customerId` filters must be structurally safe before they can become finance list SQL filters or customer assertions.
- Finance customer IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-drafts/all-payments/all-bank-transactions behavior, and valid customer filters continue returning the matching finance evidence lists.
- Rejected malformed finance list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid draft invoice, payment, bank transaction, and Customer 360 behavior remains unchanged.
- Verification for the checkpoint: focused finance list filter test = 1 pass; `npm test` = 431 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 224 - Legal/Privacy List Query Filter Guard

- Legal-question and privacy-request list reads now reject malformed filter query metadata before reading legal/privacy rows.
- Submitted `customerId` filters must be structurally safe before they can become legal/privacy list SQL filters or customer assertions.
- Legal/privacy customer IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-legal-questions/all-privacy-requests behavior, and valid customer filters continue returning the matching legal/privacy evidence lists.
- Rejected malformed legal/privacy list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid legal question, privacy request, privacy export packet, retention assessment, and evidence redaction behavior remains unchanged.
- Verification for the checkpoint: focused legal/privacy list filter test = 1 pass; `npm test` = 432 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 225 - Workflow List Query Filter Guard

- Workflow approval, dry-run, test-event, and run list reads now reject malformed filter query metadata before reading workflow rows.
- Submitted approval `status` and workflow `customerId` filters must be structurally safe before they can become list SQL filters or customer assertions.
- Approval statuses must stay inside the existing workflow approval status set, workflow customer IDs must be bounded single-line strings, and control-character strings, overlong values, or unknown status selectors are rejected instead of coerced.
- Omitted filters still preserve the existing all-approvals/all-dry-runs/all-test-events/all-runs behavior, and valid status/customer filters continue returning the matching workflow evidence lists.
- Rejected malformed workflow list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid workflow approval, dry-run, test-event, run, and Customer 360 behavior remains unchanged.
- Verification for the checkpoint: focused workflow list filter test = 1 pass; `npm test` = 433 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 226 - Clinic Launch-Clearance List Query Filter Guard

- Clinic/wellness launch-clearance list reads now reject malformed remediation-plan filter query metadata before reading pilot clearance rows.
- Submitted `remediationPlanId` filters must be structurally safe before they can become launch-clearance list SQL filters.
- Remediation plan IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-launch-clearance behavior, and valid remediation-plan filters continue returning matching launch-clearance packets.
- Rejected malformed launch-clearance list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid clinic/wellness launch-clearance behavior remains unchanged.
- Verification for the checkpoint: focused clinic launch-clearance filter test = 1 pass; dashboard sidebar openability regression = 1 pass; route regression = 9 pass; `npm test` = 435 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 227 - Clinic Paid-Offer List Query Filter Guard

- Clinic/wellness paid-offer list reads now reject malformed paid-offer filter query metadata before reading pilot offer rows.
- Submitted `clearancePacketId` filters must be structurally safe before they can become paid-offer list SQL filters.
- Clearance packet IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-paid-offers behavior, and valid clearance-packet filters continue returning matching paid-offer packets.
- Rejected malformed paid-offer list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid clinic/wellness paid-offer behavior remains unchanged.
- Verification for the checkpoint: focused paid-offer list filter and paid-offer creation tests = 2 pass, including valid `clearancePacketId` filtering and no-match behavior; `npm test` = 436 pass; `npm run build:ui` = pass; smoke = pass with `apps=10`.

### Slice 228 - Clinic Quote-Handoff List Query Filter Guard

- Clinic/wellness quote-handoff list reads now reject malformed quote-handoff filter query metadata before reading pilot quote-handoff rows.
- Submitted `offerId` filters must be structurally safe before they can become quote-handoff list SQL filters.
- Offer IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-quote-handoffs behavior, and valid offer filters continue returning matching quote-handoff packets.
- Rejected malformed quote-handoff list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid clinic/wellness quote-handoff behavior remains unchanged.
- Verification for the checkpoint: focused quote-handoff list filter and quote-handoff creation tests = 2 pass, including valid `offerId` filtering and no-match behavior; `npm test` = 444 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 229 - Clinic Quote-Release List Query Filter Guard

- Clinic/wellness quote-release list reads now reject malformed quote-release filter query metadata before reading pilot quote-release rows.
- Submitted `quoteHandoffId` filters must be structurally safe before they can become quote-release list SQL filters.
- Quote-handoff IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-quote-releases behavior, and valid quote-handoff filters continue returning matching quote-release packets.
- Rejected malformed quote-release list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid clinic/wellness quote-release behavior remains unchanged.
- Verification for the checkpoint: focused quote-release list filter and quote-release creation tests = 2 pass, including valid `quoteHandoffId` filtering and no-match behavior; `npm test` = 445 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 230 - Clinic Quote-Acceptance-Handoff List Query Filter Guard

- Clinic/wellness quote-acceptance-handoff list reads now reject malformed quote-acceptance-handoff filter query metadata before reading pilot quote-acceptance-handoff rows.
- Submitted `quoteReleasePacketId` filters must be structurally safe before they can become quote-acceptance-handoff list SQL filters.
- Quote-release packet IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-quote-acceptance-handoffs behavior, and valid quote-release packet filters continue returning matching quote-acceptance-handoff packets.
- Rejected malformed quote-acceptance-handoff list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid clinic/wellness quote-acceptance-handoff behavior remains unchanged.
- Verification for the checkpoint: focused quote-acceptance-handoff list filter and quote-acceptance-handoff creation tests = 2 pass, including valid `quoteReleasePacketId` filtering and no-match behavior; `npm test` = 457 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 231 - Clinic HayHashvapah Draft List Query Filter Guard

- Clinic/wellness HayHashvapah draft-invoice packet list reads now reject malformed draft filter query metadata before reading pilot draft rows.
- Submitted `acceptanceHandoffId` filters must be structurally safe before they can become HayHashvapah draft packet list SQL filters.
- Acceptance-handoff IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-HayHashvapah-drafts behavior, and valid acceptance-handoff filters continue returning matching draft packets.
- Rejected malformed HayHashvapah draft list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid clinic/wellness draft packet behavior remains unchanged.
- Verification for the checkpoint: focused HayHashvapah draft list filter and draft packet creation tests = 2 pass, including valid `acceptanceHandoffId` filtering and no-match behavior; `npm test` = 458 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 232 - Clinic Official-Invoice List Query Filter Guard

- Clinic/wellness official-invoice posting packet list reads now reject malformed posting filter query metadata before reading pilot invoice rows.
- Submitted `draftPacketId` filters must be structurally safe before they can become official-invoice posting packet list SQL filters.
- Draft packet IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-official-invoices behavior, and valid draft-packet filters continue returning matching posting packets.
- Rejected malformed official-invoice list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid clinic/wellness posting packet behavior remains unchanged.
- Verification for the checkpoint: focused official-invoice list filter, renewal official-invoice filter, and posting packet creation tests = 3 pass, including valid `draftPacketId` filtering and no-match behavior; `npm test` = 459 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 233 - Clinic Payment/Closeout List Query Filter Guard

- Clinic/wellness payment-collection, closeout, and renewal-chain packet list reads now reject malformed packet filter query metadata before reading pilot rows.
- Submitted posting, payment-collection, closeout, handoff, quote-release, and acceptance-handoff packet filters must be structurally safe before they can become clinic pilot list SQL filters.
- Packet and handoff IDs must be bounded single-line strings, and control-character strings or overlong values are rejected instead of coerced.
- Omitted filters still preserve the existing all-payment-collections, all-closeouts, and renewal-chain list behavior, and valid packet filters continue returning matching pilot packets.
- Rejected malformed clinic pilot list filter queries return `400`, keep submitted payload secrets out of error bodies, and valid clinic/wellness payment, closeout, and renewal-chain behavior remains unchanged.
- Verification for the checkpoint: focused payment-collection and closeout list filter tests plus existing packet workflow tests = 4 pass, including valid payment/closeout filtered-list behavior; `npm test` = 462 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`; read-only code review subagent = pass with no findings.

### Slice 234 - Production-Readiness Query Filter Guard

- Production-readiness gate reads now reject malformed `asOf` query metadata before evaluating legal/accounting readiness gates.
- Submitted readiness dates must be structurally safe before they can become VAT and payroll readiness gate inputs.
- Readiness dates must be exact `YYYY-MM-DD` strings, and control-character strings, non-string values, or invalid date values are rejected instead of silently falling back to the current date.
- Omitted `asOf` still preserves the existing current-date readiness behavior, and valid `asOf` filters continue returning the requested readiness date.
- Rejected malformed production-readiness filter queries return `400`, keep submitted payload secrets out of error bodies, and valid legal/accounting readiness behavior remains unchanged.
- Verification for the checkpoint: focused production-readiness query and valid readiness tests = 2 pass; full `npm test` = 464 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 235 - Finance Report Query Filter Guard

- Finance report reads now reject malformed VAT report `period` and payables report `asOf` query metadata before reading ledger/accounting reports.
- Submitted VAT report periods must be exact `YYYY-MM` finance period keys; submitted payables dates must be exact `YYYY-MM-DD` dates.
- Control-character strings, invalid period/month values, and impossible dates are rejected instead of being coerced into report filters.
- Omitted report filters still preserve existing all-period VAT and current-date payables behavior, and valid filters continue returning the requested period/date.
- Rejected malformed finance report filter queries return `400`, keep submitted payload secrets out of error bodies, and valid finance report behavior remains unchanged.
- Verification for the checkpoint: focused finance report query test = 1 pass, including valid VAT/payables report behavior; full `npm test` = 464 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 236 - Event Feed Limit Query Filter Guard

- Suite event feed reads now reject malformed `limit` query metadata before reading timeline rows.
- Submitted event feed limits must be structurally safe before they can become event-list bounds.
- Event feed limits must be positive integer strings; control-character strings, negative values, and partial numeric strings are rejected instead of silently falling back to the default limit.
- Omitted limits still preserve the existing default page size, and valid oversized limits continue being capped to the existing maximum of 100.
- Rejected malformed event feed limit queries return `400`, keep submitted payload secrets out of error bodies, and valid event feed and audit behavior remains unchanged.
- Verification for the checkpoint: focused event-feed query test = 1 pass, including malformed, secret-bearing, and capped valid `limit` behavior; `npm test` = 464 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 237 - Integration Connector Key Guard

- Integration connector configure and health-check mutations now reject malformed connector path keys before resolving connector definitions.
- Submitted connector keys must be structurally safe before they can become connector lookup or audit evidence inputs.
- Connector keys must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing connectors.
- Safe unknown connector keys still preserve the existing `404` behavior, and valid connector keys continue configuring and health-checking supported integration connectors.
- Rejected malformed connector-key mutations return `400`, keep submitted key/secret payloads out of error bodies, and valid connector configuration, health-check, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: focused connector configure/key tests = 2 pass, including malformed configure and health-check path keys plus valid connector behavior; `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 238 - Webhook Delivery ID Guard

- Webhook delivery retry mutations now reject malformed delivery path IDs before delivery lookup and retry work.
- Submitted webhook delivery IDs must be structurally safe before they can become delivery lookup or retry audit inputs.
- Delivery IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing deliveries.
- Safe unknown delivery IDs still preserve the existing `404` behavior, and valid failed delivery IDs continue retrying normally.
- Rejected malformed webhook delivery retry requests return `400`, keep submitted path secrets out of error bodies, and valid webhook retry, delivery, and audit behavior remains unchanged.
- Verification for the checkpoint: focused webhook retry test = 1 pass, including malformed secret-bearing retry IDs, safe unknown `404`, and valid retry behavior; `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` = pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 239 - Analytics Path ID Guard

- Analytics semantic metric drilldown and report detail reads now reject malformed path IDs before analytics lookups.
- Submitted metric/report IDs must be structurally safe before they can become analytics drilldown or report-packet lookup inputs.
- Analytics path IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing analytics records.
- Safe unknown analytics IDs still preserve the existing `404` behavior, and valid metric/report IDs continue returning drilldowns and report packets.
- Rejected malformed analytics path requests return `400`, keep submitted path secrets out of error bodies, and valid semantic metrics, report packets, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused analytics path tests (`analytics semantic metrics expose definitions and drilldowns with role access|analytics reports export owner and accountant packets from semantic snapshots`) = 2 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-analytics-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 240 - Public Form ID Guard

- Public form pages, public form submissions, and authenticated form detail/update reads now reject malformed form path IDs before form lookup.
- Submitted form IDs must be structurally safe before they can become public page, public submit, detail-read, or update lookup inputs.
- Form IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing forms.
- Safe unknown form IDs still preserve the existing `404` behavior, and valid published forms continue rendering, accepting public submissions, and exposing authenticated detail/update flows.
- Rejected malformed form path requests return `400`, keep submitted path/body secrets out of error bodies, and valid form submission, CRM lead creation, audit, and timeline behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/forms.test.js` pass; `node --check test/forms-public-page.test.js` pass; `git diff --check` pass; focused form path tests = 3 pass, including malformed secret-bearing public page and submit IDs plus safe unknown form `404`; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 241 - Public Quote Token Guard

- Public quote read and acceptance endpoints now reject malformed public quote tokens before quote lookup or acceptance work.
- Submitted public quote tokens must be structurally safe before they can become public quote lookup, acceptance, deal-update, or workflow-approval inputs.
- Public quote tokens must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing quotes.
- Safe unknown public quote tokens still preserve the existing `404` behavior, and valid sent/viewed/accepted quote tokens continue returning public packets and accepting quotes.
- Rejected malformed public quote token requests return `400`, keep submitted path/body secrets out of error bodies, and valid quote acceptance, CRM deal updates, finance approval creation, webhooks, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused public quote token tests = 2 pass, including malformed secret-bearing read/accept tokens plus safe unknown public quote token `404`; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; smoke = pass with `apps=10`.

### Slice 242 - Document Template ID Guard

- Docs template generation now rejects malformed template path IDs before template lookup or generated document creation.
- Submitted document template IDs must be structurally safe before they can become template lookup, document draft creation, or audit inputs.
- Document template IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing templates.
- Safe unknown document template IDs still preserve the existing `404` behavior, and valid template IDs continue generating draft documents from declared variables.
- Rejected malformed document template ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid template generation, document draft creation, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/docs-templates.test.js` pass; `git diff --check` pass; focused Docs template tests (`node --test test/docs-templates.test.js`) = 5 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-document-template-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 243 - Clinic Remediation Action Key Guard

- Clinic/wellness remediation action resolution mutations now reject malformed action path keys before remediation action lookup.
- Submitted action keys must be structurally safe before they can become remediation resolution lookup or audit inputs.
- Clinic remediation action keys must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing remediation actions.
- Safe unknown action keys still preserve the existing `404` behavior, and valid assigned-role action resolutions continue returning remediation evidence packets.
- Rejected malformed remediation action key requests return `400`, keep submitted path/body secrets out of error bodies, and valid remediation resolution, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic remediation action test (`assigned roles can resolve clinic launch remediation actions with evidence`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-action-key-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 244 - Clinic Quote Handoff Offer ID Guard

- Clinic/wellness paid-offer quote-handoff mutations now reject malformed offer path IDs before paid-offer lookup or quote handoff creation.
- Submitted offer IDs must be structurally safe before they can become quote handoff lookup, quote creation, workflow approval, suite-event, or audit inputs.
- Clinic paid-offer IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing paid offers.
- Safe unknown offer IDs still preserve the existing `404` behavior, and valid paid-offer IDs continue creating governed CRM quote handoff packets.
- Rejected malformed offer ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid quote handoff, quote creation, workflow approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic quote handoff test (`sales can hand off paid pilot offer into governed CRM quote release`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-quote-handoff-offer-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 245 - Clinic Quote Release Handoff ID Guard

- Clinic/wellness quote-release packet mutations now reject malformed quote-handoff path IDs before quote-handoff lookup or release-packet creation.
- Submitted quote-handoff IDs must be structurally safe before they can become release-packet lookup, public-release evidence, backup, suite-event, or audit inputs.
- Clinic quote-handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing quote handoffs.
- Safe unknown quote-handoff IDs still preserve the existing `404` behavior, and valid executed quote handoff IDs continue creating governed public quote release packets.
- Rejected malformed quote-handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid quote release, public quote visibility, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic quote release test (`owner can create pilot quote release packet after quote release workflow executes`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-quote-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 246 - Clinic Quote Acceptance Release ID Guard

- Clinic/wellness quote-acceptance handoff mutations now reject malformed quote-release path IDs before quote-release lookup or acceptance-handoff creation.
- Submitted quote-release IDs must be structurally safe before they can become acceptance handoff lookup, finance approval evidence, backup, suite-event, or audit inputs.
- Clinic quote-release IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing quote releases.
- Safe unknown quote-release IDs still preserve the existing `404` behavior, and valid accepted quote-release IDs continue creating governed HayHashvapah invoice approval handoff packets.
- Rejected malformed quote-release ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid quote acceptance handoff, finance approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic quote acceptance handoff test (`accountant can hand accepted pilot quote into HayHashvapah invoice approval`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-quote-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 247 - Clinic Draft Invoice Acceptance Handoff ID Guard

- Clinic/wellness HayHashvapah draft-invoice packet mutations now reject malformed quote-acceptance handoff path IDs before handoff lookup or draft-packet creation.
- Submitted quote-acceptance handoff IDs must be structurally safe before they can become draft-packet lookup, finance approval execution evidence, backup, suite-event, or audit inputs.
- Clinic quote-acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing acceptance handoffs.
- Safe unknown quote-acceptance handoff IDs still preserve the existing `404` behavior, and valid executed finance approval handoff IDs continue creating governed HayHashvapah draft invoice packets.
- Rejected malformed quote-acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid draft invoice packet, finance approval execution, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic HayHashvapah draft-invoice packet test (`accountant can record HayHashvapah draft invoice packet after owner executes pilot finance approval`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-draft-invoice-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 248 - Clinic Official Invoice Draft Packet ID Guard

- Clinic/wellness official invoice posting packet mutations now reject malformed HayHashvapah draft-invoice packet path IDs before draft-packet lookup or posting-packet creation.
- Submitted draft packet IDs must be structurally safe before they can become official-invoice posting lookup, finance invoice/link evidence, backup, suite-event, or audit inputs.
- Clinic draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing draft packets.
- Safe unknown draft packet IDs still preserve the existing `404` behavior, and valid posted draft packet IDs continue creating governed official HayHashvapah invoice posting packets.
- Rejected malformed draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic official HayHashvapah invoice posting packet test (`accountant can record official HayHashvapah invoice posting packet from pilot draft`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 249 - Clinic Payment Collection Posting Packet ID Guard

- Clinic/wellness payment-collection packet mutations now reject malformed official-invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted posting packet IDs must be structurally safe before they can become payment-collection lookup, receipt evidence, backup, suite-event, or audit inputs.
- Clinic posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing posting packets.
- Safe unknown posting packet IDs still preserve the existing `404` behavior, and valid paid invoice posting packet IDs continue creating governed HayHashvapah payment collection packets.
- Rejected malformed posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic payment-collection packet test (`accountant can record clinic pilot payment collection packet after HayHashvapah receipt`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 250 - Clinic Closeout Payment Collection ID Guard

- Clinic/wellness closeout packet mutations now reject malformed payment-collection packet path IDs before payment-collection lookup or closeout packet creation.
- Submitted payment-collection packet IDs must be structurally safe before they can become closeout lookup, renewal-task evidence, backup, suite-event, or audit inputs.
- Clinic payment-collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing payment-collection packets.
- Safe unknown payment-collection packet IDs still preserve the existing `404` behavior, and valid paid collection packet IDs continue creating governed closeout and renewal-handoff packets.
- Rejected malformed payment-collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid closeout, CRM renewal-task creation, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic closeout/renewal handoff test (`owner can create clinic pilot closeout and renewal handoff after payment collection`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 251 - Clinic Renewal Quote Closeout ID Guard

- Clinic/wellness renewal quote handoff mutations now reject malformed closeout packet path IDs before closeout lookup or renewal quote handoff creation.
- Submitted closeout packet IDs must be structurally safe before they can become renewal quote lookup, quote creation, workflow approval, backup, suite-event, or audit inputs.
- Clinic closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing closeout packets.
- Safe unknown closeout packet IDs still preserve the existing `404` behavior, and valid paid pilot closeout IDs continue creating governed renewal quote handoff packets.
- Rejected malformed closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid renewal quote handoff, quote creation, workflow approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic renewal quote handoff test (`sales can create clinic pilot renewal quote handoff from closeout`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-renewal-quote-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 252 - Clinic Renewal Release Handoff ID Guard

- Clinic/wellness renewal quote release packet mutations now reject malformed renewal quote handoff path IDs before handoff lookup or release packet creation.
- Submitted renewal quote handoff IDs must be structurally safe before they can become release-packet lookup, public-release evidence, backup, suite-event, or audit inputs.
- Clinic renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing renewal handoffs.
- Safe unknown renewal quote handoff IDs still preserve the existing `404` behavior, and valid executed renewal quote handoff IDs continue creating governed public renewal quote release packets.
- Rejected malformed renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid renewal quote release, public quote visibility, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic renewal quote release packet test (`sales can create clinic pilot renewal quote release packet after workflow executes`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-renewal-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 253 - Clinic Renewal Acceptance Release ID Guard

- Clinic/wellness renewal quote acceptance handoff mutations now reject malformed renewal quote release packet path IDs before release-packet lookup or acceptance-handoff creation.
- Submitted renewal quote release packet IDs must be structurally safe before they can become acceptance handoff lookup, finance approval evidence, backup, suite-event, or audit inputs.
- Clinic renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing renewal release packets.
- Safe unknown renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted renewal quote release IDs continue creating governed HayHashvapah invoice approval handoff packets.
- Rejected malformed renewal quote release packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid renewal quote acceptance handoff, finance approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic renewal acceptance handoff test (`accountant can hand accepted renewal quote into HayHashvapah invoice approval`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-renewal-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 254 - Clinic Renewal Draft Acceptance Handoff ID Guard

- Clinic/wellness renewal HayHashvapah draft-invoice packet mutations now reject malformed renewal quote acceptance handoff path IDs before handoff lookup or draft-packet creation.
- Submitted renewal quote acceptance handoff IDs must be structurally safe before they can become draft-packet lookup, finance approval execution evidence, backup, suite-event, or audit inputs.
- Clinic renewal quote acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing renewal acceptance handoffs.
- Safe unknown renewal quote acceptance handoff IDs still preserve the existing `404` behavior, and valid executed finance approval handoff IDs continue creating governed renewal HayHashvapah draft invoice packets.
- Rejected malformed renewal quote acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid renewal draft invoice packet, finance approval execution, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic renewal draft-invoice packet test (`accountant can record renewal HayHashvapah draft invoice packet after owner executes finance approval`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-renewal-draft-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 255 - Clinic Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness renewal official invoice posting packet mutations now reject malformed renewal HayHashvapah draft-invoice packet path IDs before draft-packet lookup or posting-packet creation.
- Submitted renewal draft packet IDs must be structurally safe before they can become official-invoice posting lookup, finance invoice/link evidence, backup, suite-event, or audit inputs.
- Clinic renewal draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing renewal draft packets.
- Safe unknown renewal draft packet IDs still preserve the existing `404` behavior, and valid posted renewal draft packet IDs continue creating governed renewal official HayHashvapah invoice posting packets.
- Rejected malformed renewal draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid renewal official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic renewal official HayHashvapah invoice posting packet test (`accountant can record renewal official HayHashvapah invoice posting packet from renewal draft`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 256 - Clinic Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness renewal payment-collection packet mutations now reject malformed renewal official-invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted renewal posting packet IDs must be structurally safe before they can become payment-collection lookup, receipt evidence, backup, suite-event, or audit inputs.
- Clinic renewal posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing renewal posting packets.
- Safe unknown renewal posting packet IDs still preserve the existing `404` behavior, and valid paid renewal invoice posting IDs continue creating governed renewal HayHashvapah payment collection packets.
- Rejected malformed renewal posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid renewal payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic renewal payment-collection packet test (`accountant can record renewal payment collection packet after HayHashvapah receipt`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 257 - Clinic Renewal Closeout Payment Collection ID Guard

- Clinic/wellness renewal closeout packet mutations now reject malformed renewal payment-collection packet path IDs before payment-collection lookup or closeout packet creation.
- Submitted renewal payment-collection packet IDs must be structurally safe before they can become closeout lookup, next-renewal-task evidence, backup, suite-event, or audit inputs.
- Clinic renewal payment-collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing renewal payment-collection packets.
- Safe unknown renewal payment-collection packet IDs still preserve the existing `404` behavior, and valid paid renewal collection IDs continue creating governed renewal closeout and next-renewal task packets.
- Rejected malformed renewal payment-collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid renewal closeout, CRM next-renewal task creation, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic renewal closeout/next-renewal task test (`owner can close renewal cycle and schedule next renewal task after payment collection`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-renewal-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 258 - Clinic Next Renewal Quote Closeout ID Guard

- Clinic/wellness next-renewal quote handoff mutations now reject malformed renewal closeout packet path IDs before renewal closeout lookup or next-renewal quote handoff creation.
- Submitted renewal closeout packet IDs must be structurally safe before they can become next-renewal quote lookup, quote creation, workflow approval, backup, suite-event, or audit inputs.
- Clinic renewal closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing renewal closeout packets.
- Safe unknown renewal closeout packet IDs still preserve the existing `404` behavior, and valid closed renewal cycle IDs continue creating governed next-renewal quote handoff packets.
- Rejected malformed renewal closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-renewal quote handoff, quote creation, workflow approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-renewal quote handoff test (`sales can create clinic next renewal quote handoff from renewal closeout`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-renewal-quote-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 259 - Clinic Next Renewal Release Handoff ID Guard

- Clinic/wellness next-renewal quote release packet mutations now reject malformed next-renewal quote handoff path IDs before handoff lookup or release packet creation.
- Submitted next-renewal quote handoff IDs must be structurally safe before they can become release-packet lookup, public-release evidence, backup, suite-event, or audit inputs.
- Clinic next-renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-renewal handoffs.
- Safe unknown next-renewal quote handoff IDs still preserve the existing `404` behavior, and valid executed next-renewal quote handoff IDs continue creating governed public next-renewal quote release packets.
- Rejected malformed next-renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-renewal quote release, public quote visibility, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-renewal quote release packet test (`sales can create clinic next renewal quote release packet after workflow executes`) = 1 pass; full `npm test` = 465 pass, 0 fail, 0 cancelled; `npm run build:ui` pass with existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-renewal-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 260 - Clinic Next Renewal Acceptance Release ID Guard

- Clinic/wellness next-renewal quote acceptance handoff mutations now reject malformed next-renewal quote release packet path IDs before release-packet lookup or acceptance-handoff creation.
- Submitted next-renewal quote release packet IDs must be structurally safe before they can become acceptance handoff lookup, finance approval evidence, backup, suite-event, or audit inputs.
- Clinic next-renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-renewal release packets.
- Safe unknown next-renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted next-renewal quote release IDs continue creating governed HayHashvapah invoice approval handoff packets.
- Rejected malformed next-renewal quote release packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-renewal quote acceptance handoff, finance approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-renewal acceptance handoff regression (`accountant can hand accepted next renewal quote into HayHashvapah invoice approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-renewal-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 261 - Clinic Next Renewal Draft Acceptance Handoff ID Guard

- Clinic/wellness next-renewal HayHashvapah draft-invoice packet mutations now reject malformed next-renewal quote acceptance handoff path IDs before handoff lookup or draft-packet creation.
- Submitted next-renewal quote acceptance handoff IDs must be structurally safe before they can become draft-packet lookup, finance approval execution evidence, backup, suite-event, or audit inputs.
- Clinic next-renewal quote acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-renewal acceptance handoffs.
- Safe unknown next-renewal quote acceptance handoff IDs still preserve the existing `404` behavior, and valid executed finance approval handoff IDs continue creating governed next-renewal HayHashvapah draft invoice packets.
- Rejected malformed next-renewal quote acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-renewal draft invoice packet, finance approval execution, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-renewal draft-invoice packet regression (`accountant can record next renewal HayHashvapah draft invoice packet after owner executes finance approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-renewal-draft-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 262 - Clinic Next Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness next-renewal official invoice posting packet mutations now reject malformed next-renewal HayHashvapah draft-invoice packet path IDs before draft-packet lookup or posting-packet creation.
- Submitted next-renewal draft packet IDs must be structurally safe before they can become official-invoice posting lookup, finance invoice/link evidence, backup, suite-event, or audit inputs.
- Clinic next-renewal draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-renewal draft packets.
- Safe unknown next-renewal draft packet IDs still preserve the existing `404` behavior, and valid posted next-renewal draft packet IDs continue creating governed next-renewal official HayHashvapah invoice posting packets.
- Rejected malformed next-renewal draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-renewal official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-renewal official invoice posting packet regression (`accountant can record next renewal official HayHashvapah invoice posting packet from next renewal draft`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 263 - Clinic Next Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness next-renewal payment-collection packet mutations now reject malformed next-renewal official invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted next-renewal posting packet IDs must be structurally safe before they can become payment-collection lookup, receipt evidence, backup, suite-event, or audit inputs.
- Clinic next-renewal posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-renewal posting packets.
- Safe unknown next-renewal posting packet IDs still preserve the existing `404` behavior, and valid paid next-renewal invoice posting IDs continue creating governed next-renewal HayHashvapah payment collection packets.
- Rejected malformed next-renewal posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-renewal payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-renewal payment collection packet regression (`accountant can record next renewal payment collection packet after HayHashvapah receipt`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 264 - Clinic Next Renewal Closeout Payment Collection ID Guard

- Clinic/wellness next-renewal closeout packet mutations now reject malformed next-renewal payment collection packet path IDs before payment-collection lookup or closeout packet creation.
- Submitted next-renewal payment collection packet IDs must be structurally safe before they can become closeout lookup, following-renewal-task evidence, backup, suite-event, or audit inputs.
- Clinic next-renewal payment collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-renewal payment collection packets.
- Safe unknown next-renewal payment collection packet IDs still preserve the existing `404` behavior, and valid paid next-renewal collection IDs continue creating governed next-renewal closeout and following-renewal task packets.
- Rejected malformed next-renewal payment collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-renewal closeout, CRM following-renewal task creation, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-renewal closeout regression (`owner can close next renewal cycle and schedule following renewal task after payment collection`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-renewal-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 265 - Clinic Following Renewal Quote Closeout ID Guard

- Clinic/wellness following-renewal quote handoff mutations now reject malformed next-renewal closeout packet path IDs before closeout lookup or following-renewal quote handoff creation.
- Submitted next-renewal closeout packet IDs must be structurally safe before they can become following-renewal quote lookup, quote creation, workflow approval, backup, suite-event, or audit inputs.
- Clinic next-renewal closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-renewal closeout packets.
- Safe unknown next-renewal closeout packet IDs still preserve the existing `404` behavior, and valid closed next-renewal cycle IDs continue creating governed following-renewal quote handoff packets.
- Rejected malformed next-renewal closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-renewal quote handoff, quote creation, workflow approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-renewal quote handoff regression (`sales can create clinic following renewal quote handoff from next renewal closeout`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-renewal-quote-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 266 - Clinic Following Renewal Release Handoff ID Guard

- Clinic/wellness following-renewal quote release packet mutations now reject malformed following-renewal quote handoff path IDs before handoff lookup or release-packet creation.
- Submitted following-renewal quote handoff IDs must be structurally safe before they can become release-packet lookup, public-release evidence, backup, suite-event, or audit inputs.
- Clinic following-renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-renewal handoffs.
- Safe unknown following-renewal quote handoff IDs still preserve the existing `404` behavior, and valid executed following-renewal quote handoff IDs continue creating governed public following-renewal quote release packets.
- Rejected malformed following-renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-renewal quote release, public quote visibility, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-renewal quote release packet regression (`sales can create clinic following renewal quote release packet after workflow executes`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-renewal-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 267 - Clinic Following Renewal Acceptance Release ID Guard

- Clinic/wellness following-renewal quote acceptance handoff mutations now reject malformed following-renewal quote release packet path IDs before release-packet lookup or acceptance-handoff creation.
- Submitted following-renewal quote release packet IDs must be structurally safe before they can become acceptance handoff lookup, finance approval evidence, backup, suite-event, or audit inputs.
- Clinic following-renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-renewal release packets.
- Safe unknown following-renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted following-renewal quote release IDs continue creating governed HayHashvapah invoice approval handoff packets.
- Rejected malformed following-renewal quote release packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-renewal quote acceptance handoff, finance approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-renewal acceptance handoff regression (`accountant can hand accepted following renewal quote into HayHashvapah invoice approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-renewal-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 268 - Clinic Following Renewal Draft Acceptance Handoff ID Guard

- Clinic/wellness following-renewal HayHashvapah draft-invoice packet mutations now reject malformed following-renewal quote acceptance handoff path IDs before handoff lookup or draft-packet creation.
- Submitted following-renewal quote acceptance handoff IDs must be structurally safe before they can become draft-packet lookup, finance approval execution evidence, backup, suite-event, or audit inputs.
- Clinic following-renewal quote acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-renewal acceptance handoffs.
- Safe unknown following-renewal quote acceptance handoff IDs still preserve the existing `404` behavior, and valid executed finance approval handoff IDs continue creating governed following-renewal HayHashvapah draft invoice packets.
- Rejected malformed following-renewal quote acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-renewal draft invoice packet, finance approval execution, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-renewal draft-invoice packet regression (`accountant can record following renewal HayHashvapah draft invoice packet after owner executes finance approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-renewal-draft-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 269 - Clinic Following Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness following-renewal official invoice posting packet mutations now reject malformed following-renewal HayHashvapah draft-invoice packet path IDs before draft-packet lookup or posting-packet creation.
- Submitted following-renewal draft packet IDs must be structurally safe before they can become official-invoice posting lookup, finance invoice/link evidence, backup, suite-event, or audit inputs.
- Clinic following-renewal draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-renewal draft packets.
- Safe unknown following-renewal draft packet IDs still preserve the existing `404` behavior, and valid posted following-renewal draft packet IDs continue creating governed following-renewal official HayHashvapah invoice posting packets.
- Rejected malformed following-renewal draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-renewal official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-renewal official invoice posting packet regression (`accountant can record following renewal official HayHashvapah invoice posting packet from following renewal draft`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 270 - Clinic Following Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness following-renewal payment collection mutations now reject malformed following-renewal official-invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted following-renewal posting packet IDs must be structurally safe before they can become payment receipt, collection evidence, backup, suite-event, or audit inputs.
- Clinic following-renewal posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-renewal posting packets.
- Safe unknown following-renewal posting packet IDs still preserve the existing `404` behavior, and valid paid following-renewal official invoice posting packet IDs continue creating governed following-renewal HayHashvapah payment collection packets.
- Rejected malformed following-renewal posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-renewal payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-renewal payment-collection packet regression (`accountant can record following renewal payment collection packet after HayHashvapah receipt`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 271 - Clinic Following Renewal Closeout Payment Collection ID Guard

- Clinic/wellness following-renewal closeout mutations now reject malformed following-renewal HayHashvapah payment-collection packet path IDs before payment-collection lookup or closeout packet creation.
- Submitted following-renewal payment collection packet IDs must be structurally safe before they can become closeout, subsequent-renewal task, backup, suite-event, or audit inputs.
- Clinic following-renewal payment collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-renewal payment collection packets.
- Safe unknown following-renewal payment collection packet IDs still preserve the existing `404` behavior, and valid paid following-renewal payment collection packet IDs continue creating governed following-renewal closeout packets.
- Rejected malformed following-renewal payment collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-renewal closeout, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-renewal closeout packet regression (`owner can close following renewal cycle and schedule subsequent renewal task after payment collection`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-renewal-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 272 - Clinic Subsequent Renewal Quote Closeout ID Guard

- Clinic/wellness subsequent-renewal quote handoff mutations now reject malformed following-renewal closeout packet path IDs before closeout lookup or subsequent-renewal quote handoff creation.
- Submitted following-renewal closeout packet IDs must be structurally safe before they can become quote handoff, subsequent-renewal CRM task, backup, suite-event, or audit inputs.
- Clinic following-renewal closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-renewal closeout packets.
- Safe unknown following-renewal closeout packet IDs still preserve the existing `404` behavior, and valid closed following-renewal cycle packet IDs continue creating governed subsequent-renewal quote handoff packets.
- Rejected malformed following-renewal closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-renewal quote handoff, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass after correcting the new assertion to use the existing `salespersonCookie`; focused clinic subsequent-renewal quote handoff regression (`sales can create clinic subsequent renewal quote handoff from following renewal closeout`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-renewal-quote-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 273 - Clinic Subsequent Renewal Release Handoff ID Guard

- Clinic/wellness subsequent-renewal quote release mutations now reject malformed subsequent-renewal quote handoff path IDs before handoff lookup or release packet creation.
- Submitted subsequent-renewal quote handoff IDs must be structurally safe before they can become quote-release, public-link, approval-execution, backup, suite-event, or audit inputs.
- Clinic subsequent-renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-renewal handoffs.
- Safe unknown subsequent-renewal quote handoff IDs still preserve the existing `404` behavior, and valid owner-executed subsequent-renewal quote handoff IDs continue creating governed subsequent-renewal quote release packets.
- Rejected malformed subsequent-renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-renewal quote release, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-renewal quote release packet regression (`sales can create clinic subsequent renewal quote release packet after workflow executes`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-renewal-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 274 - Clinic Subsequent Renewal Acceptance Release ID Guard

- Clinic/wellness subsequent-renewal quote acceptance handoff mutations now reject malformed subsequent-renewal quote release packet path IDs before release-packet lookup or acceptance handoff creation.
- Submitted subsequent-renewal quote release packet IDs must be structurally safe before they can become acceptance handoff, HayHashvapah finance approval, backup, suite-event, or audit inputs.
- Clinic subsequent-renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-renewal release packets.
- Safe unknown subsequent-renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted subsequent-renewal quote release packet IDs continue creating governed subsequent-renewal quote acceptance handoff packets.
- Rejected malformed subsequent-renewal quote release packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-renewal acceptance handoff, finance approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-renewal acceptance handoff regression (`accountant can hand accepted subsequent renewal quote into HayHashvapah invoice approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-renewal-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 275 - Clinic Subsequent Renewal Draft Acceptance Handoff ID Guard

- Clinic/wellness subsequent-renewal HayHashvapah draft-invoice mutations now reject malformed subsequent-renewal quote acceptance handoff path IDs before acceptance-handoff lookup or draft-packet creation.
- Submitted subsequent-renewal quote acceptance handoff IDs must be structurally safe before they can become HayHashvapah draft invoice, finance approval execution, backup, suite-event, or audit inputs.
- Clinic subsequent-renewal quote acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-renewal acceptance handoffs.
- Safe unknown subsequent-renewal quote acceptance handoff IDs still preserve the existing `404` behavior, and valid executed finance approval handoff IDs continue creating governed subsequent-renewal HayHashvapah draft invoice packets.
- Rejected malformed subsequent-renewal quote acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-renewal draft invoice packet, finance approval execution, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-renewal draft-invoice packet regression (`accountant can record subsequent renewal HayHashvapah draft invoice packet after owner executes finance approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-renewal-draft-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 276 - Clinic Subsequent Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness subsequent-renewal official invoice posting packet mutations now reject malformed subsequent-renewal HayHashvapah draft-invoice packet path IDs before draft-packet lookup or posting-packet creation.
- Submitted subsequent-renewal draft packet IDs must be structurally safe before they can become official-invoice posting lookup, finance invoice/link evidence, backup, suite-event, or audit inputs.
- Clinic subsequent-renewal draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-renewal draft packets.
- Safe unknown subsequent-renewal draft packet IDs still preserve the existing `404` behavior, and valid posted subsequent-renewal draft packet IDs continue creating governed subsequent-renewal official HayHashvapah invoice posting packets.
- Rejected malformed subsequent-renewal draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-renewal official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-renewal official invoice posting packet regression (`accountant can record subsequent renewal official HayHashvapah invoice posting packet from subsequent renewal draft`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 277 - Clinic Subsequent Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness subsequent-renewal payment collection mutations now reject malformed subsequent-renewal official-invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted subsequent-renewal posting packet IDs must be structurally safe before they can become payment receipt, collection evidence, backup, suite-event, or audit inputs.
- Clinic subsequent-renewal posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-renewal posting packets.
- Safe unknown subsequent-renewal posting packet IDs still preserve the existing `404` behavior, and valid paid subsequent-renewal official invoice posting packet IDs continue creating governed subsequent-renewal HayHashvapah payment collection packets.
- Rejected malformed subsequent-renewal posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-renewal payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-renewal payment-collection packet regression (`accountant can record subsequent renewal payment collection packet after HayHashvapah receipt`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 278 - Clinic Subsequent Renewal Closeout Payment Collection ID Guard

- Clinic/wellness subsequent-renewal closeout mutations now reject malformed subsequent-renewal payment-collection packet path IDs before payment-collection lookup or closeout packet creation.
- Submitted subsequent-renewal payment-collection packet IDs must be structurally safe before they can become closeout evidence, continuation-renewal task scheduling, backup, suite-event, or audit inputs.
- Clinic subsequent-renewal payment-collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-renewal payment-collection packets.
- Safe unknown subsequent-renewal payment-collection packet IDs still preserve the existing `404` behavior, and valid paid subsequent-renewal payment-collection packet IDs continue creating governed subsequent-renewal closeout packets.
- Rejected malformed subsequent-renewal payment-collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-renewal closeout, continuation task, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-renewal closeout packet regression (`owner can close subsequent renewal cycle and schedule continuation renewal task after payment collection`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-renewal-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 279 - Clinic Continuation Renewal Quote Subsequent Closeout ID Guard

- Clinic/wellness continuation-renewal quote handoff mutations now reject malformed subsequent-renewal closeout packet path IDs before closeout lookup or continuation-renewal quote handoff creation.
- Submitted subsequent-renewal closeout packet IDs must be structurally safe before they can become continuation quote, workflow approval, backup, suite-event, or audit inputs.
- Clinic subsequent-renewal closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-renewal closeout packets.
- Safe unknown subsequent-renewal closeout packet IDs still preserve the existing `404` behavior, and valid closed subsequent-renewal packet IDs continue creating governed continuation-renewal quote handoffs.
- Rejected malformed subsequent-renewal closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid continuation quote, workflow approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic continuation-renewal quote handoff regression (`sales can create clinic continuation renewal quote handoff from subsequent renewal closeout`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-continuation-renewal-quote-subsequent-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 280 - Clinic Continuation Renewal Release Handoff ID Guard

- Clinic/wellness continuation-renewal quote release mutations now reject malformed continuation-renewal quote handoff path IDs before handoff lookup or release packet creation.
- Submitted continuation-renewal quote handoff IDs must be structurally safe before they can become public release evidence, backup, suite-event, or audit inputs.
- Clinic continuation-renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing continuation-renewal quote handoffs.
- Safe unknown continuation-renewal quote handoff IDs still preserve the existing `404` behavior, and valid executed continuation-renewal quote handoff IDs continue creating governed continuation-renewal quote release packets.
- Rejected malformed continuation-renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid continuation quote release, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic continuation-renewal quote release packet regression (`sales can create clinic continuation renewal quote release packet after workflow executes`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-continuation-renewal-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 281 - Clinic Continuation Renewal Acceptance Release ID Guard

- Clinic/wellness continuation-renewal quote acceptance handoff mutations now reject malformed continuation-renewal quote release packet path IDs before release-packet lookup or acceptance handoff creation.
- Submitted continuation-renewal quote release packet IDs must be structurally safe before they can become acceptance evidence, HayHashvapah finance approval, backup, suite-event, or audit inputs.
- Clinic continuation-renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing continuation-renewal quote release packets.
- Safe unknown continuation-renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted continuation-renewal quote release packet IDs continue creating governed continuation-renewal quote acceptance handoffs.
- Rejected malformed continuation-renewal quote release packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid continuation acceptance handoff, finance approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic continuation-renewal acceptance handoff regression (`accountant can hand accepted continuation renewal quote into HayHashvapah invoice approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-continuation-renewal-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 282 - Clinic Continuation Renewal Draft Acceptance Handoff ID Guard

- Clinic/wellness continuation-renewal HayHashvapah draft-invoice packet mutations now reject malformed continuation-renewal quote acceptance handoff path IDs before acceptance-handoff lookup or draft-invoice packet creation.
- Submitted continuation-renewal acceptance handoff IDs must be structurally safe before they can become HayHashvapah draft evidence, finance invoice approval, backup, suite-event, or audit inputs.
- Clinic continuation-renewal acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing continuation-renewal acceptance handoffs.
- Safe unknown continuation-renewal acceptance handoff IDs still preserve the existing `404` behavior, and valid executed continuation-renewal acceptance handoff IDs continue creating governed continuation-renewal HayHashvapah draft-invoice packets.
- Rejected malformed continuation-renewal acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid continuation draft-invoice, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic continuation-renewal draft-invoice packet regression (`accountant can record continuation renewal HayHashvapah draft invoice packet after owner executes finance approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-continuation-renewal-draft-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 283 - Clinic Continuation Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness continuation-renewal official invoice posting packet mutations now reject malformed continuation-renewal HayHashvapah draft-invoice packet path IDs before draft-packet lookup or posting-packet creation.
- Submitted continuation-renewal draft packet IDs must be structurally safe before they can become official-invoice posting lookup, finance invoice/link evidence, backup, suite-event, or audit inputs.
- Clinic continuation-renewal draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing continuation-renewal draft packets.
- Safe unknown continuation-renewal draft packet IDs still preserve the existing `404` behavior, and valid posted continuation-renewal draft packet IDs continue creating governed continuation-renewal official HayHashvapah invoice posting packets.
- Rejected malformed continuation-renewal draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid continuation official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic continuation-renewal official invoice posting packet regression (`accountant can record continuation renewal official HayHashvapah invoice posting packet from continuation renewal draft`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-continuation-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 284 - Clinic Continuation Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness continuation-renewal payment collection mutations now reject malformed continuation-renewal official-invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted continuation-renewal posting packet IDs must be structurally safe before they can become payment receipt, collection evidence, backup, suite-event, or audit inputs.
- Clinic continuation-renewal posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing continuation-renewal posting packets.
- Safe unknown continuation-renewal posting packet IDs still preserve the existing `404` behavior, and valid paid continuation-renewal official invoice posting packet IDs continue creating governed continuation-renewal HayHashvapah payment collection packets.
- Rejected malformed continuation-renewal posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid continuation payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic continuation-renewal payment-collection packet regression (`accountant can record continuation renewal payment collection packet after HayHashvapah receipt`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-continuation-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 285 - Clinic Continuation Renewal Closeout Payment Collection ID Guard

- Clinic/wellness continuation-renewal closeout mutations now reject malformed continuation-renewal payment-collection packet path IDs before payment-collection lookup or closeout packet creation.
- Submitted continuation-renewal payment-collection packet IDs must be structurally safe before they can become closeout evidence, ongoing-renewal task scheduling, backup, suite-event, or audit inputs.
- Clinic continuation-renewal payment-collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing continuation-renewal payment-collection packets.
- Safe unknown continuation-renewal payment-collection packet IDs still preserve the existing `404` behavior, and valid paid continuation-renewal payment-collection packet IDs continue creating governed continuation-renewal closeout packets.
- Rejected malformed continuation-renewal payment-collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid continuation closeout, ongoing task, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic continuation-renewal closeout packet regression (`owner can close continuation renewal cycle and schedule ongoing renewal task after payment collection`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-continuation-renewal-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 286 - Clinic Ongoing Renewal Quote Continuation Closeout ID Guard

- Clinic/wellness ongoing-renewal quote handoff mutations now reject malformed continuation-renewal closeout packet path IDs before closeout lookup or ongoing-renewal quote handoff creation.
- Submitted continuation-renewal closeout packet IDs must be structurally safe before they can become ongoing quote, workflow approval, backup, suite-event, or audit inputs.
- Clinic continuation-renewal closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing continuation-renewal closeout packets.
- Safe unknown continuation-renewal closeout packet IDs still preserve the existing `404` behavior, and valid closed continuation-renewal closeout packet IDs continue creating governed ongoing-renewal quote handoffs.
- Rejected malformed continuation-renewal closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid ongoing quote handoff, workflow approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic ongoing-renewal quote handoff regression (`sales can create clinic ongoing renewal quote handoff from continuation closeout`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-ongoing-renewal-quote-continuation-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 287 - Clinic Ongoing Renewal Release Handoff ID Guard

- Clinic/wellness ongoing-renewal quote release mutations now reject malformed ongoing-renewal quote handoff path IDs before handoff lookup or ongoing-renewal quote release packet creation.
- Submitted ongoing-renewal quote handoff IDs must be structurally safe before they can become public release evidence, backup, suite-event, or audit inputs.
- Clinic ongoing-renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing ongoing-renewal quote handoffs.
- Safe unknown ongoing-renewal quote handoff IDs still preserve the existing `404` behavior, and valid executed ongoing-renewal quote handoff IDs continue creating governed ongoing-renewal quote release packets.
- Rejected malformed ongoing-renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid ongoing quote release, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic ongoing-renewal quote release packet regression (`sales can create clinic ongoing renewal quote release packet after workflow executes`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-ongoing-renewal-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 288 - Clinic Ongoing Renewal Acceptance Release ID Guard

- Clinic/wellness ongoing-renewal quote acceptance handoff mutations now reject malformed ongoing-renewal quote release packet path IDs before release-packet lookup or acceptance handoff creation.
- Submitted ongoing-renewal quote release packet IDs must be structurally safe before they can become acceptance evidence, HayHashvapah finance approval, backup, suite-event, or audit inputs.
- Clinic ongoing-renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing ongoing-renewal quote release packets.
- Safe unknown ongoing-renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted ongoing-renewal quote release packet IDs continue creating governed ongoing-renewal quote acceptance handoffs.
- Rejected malformed ongoing-renewal quote release packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid ongoing acceptance handoff, finance approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic ongoing-renewal acceptance handoff regression (`accountant can hand accepted ongoing renewal quote into HayHashvapah invoice approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-ongoing-renewal-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 289 - Clinic Ongoing Renewal Draft Acceptance Handoff ID Guard

- Clinic/wellness ongoing-renewal HayHashvapah draft-invoice packet mutations now reject malformed ongoing-renewal quote acceptance handoff path IDs before acceptance-handoff lookup or draft-invoice packet creation.
- Submitted ongoing-renewal acceptance handoff IDs must be structurally safe before they can become HayHashvapah draft evidence, finance invoice approval, backup, suite-event, or audit inputs.
- Clinic ongoing-renewal acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing ongoing-renewal acceptance handoffs.
- Safe unknown ongoing-renewal acceptance handoff IDs still preserve the existing `404` behavior, and valid executed ongoing-renewal acceptance handoff IDs continue creating governed ongoing-renewal HayHashvapah draft-invoice packets.
- Rejected malformed ongoing-renewal acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid ongoing draft-invoice, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic ongoing-renewal draft-invoice packet regression (`accountant can record ongoing renewal HayHashvapah draft invoice packet after owner executes finance approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-ongoing-renewal-draft-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 290 - Clinic Ongoing Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness ongoing-renewal official invoice posting packet mutations now reject malformed ongoing-renewal HayHashvapah draft-invoice packet path IDs before draft-packet lookup or posting-packet creation.
- Submitted ongoing-renewal draft packet IDs must be structurally safe before they can become official-invoice posting lookup, finance invoice/link evidence, backup, suite-event, or audit inputs.
- Clinic ongoing-renewal draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing ongoing-renewal draft packets.
- Safe unknown ongoing-renewal draft packet IDs still preserve the existing `404` behavior, and valid posted ongoing-renewal draft packet IDs continue creating governed ongoing-renewal official HayHashvapah invoice posting packets.
- Rejected malformed ongoing-renewal draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid ongoing official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic ongoing-renewal official invoice posting packet regression (`accountant can record ongoing renewal official HayHashvapah invoice posting packet from ongoing draft`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-ongoing-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 291 - Clinic Ongoing Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness ongoing-renewal payment collection mutations now reject malformed ongoing-renewal official-invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted ongoing-renewal posting packet IDs must be structurally safe before they can become payment receipt, collection evidence, backup, suite-event, or audit inputs.
- Clinic ongoing-renewal posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing ongoing-renewal posting packets.
- Safe unknown ongoing-renewal posting packet IDs still preserve the existing `404` behavior, and valid paid ongoing-renewal official invoice posting packet IDs continue creating governed ongoing-renewal HayHashvapah payment collection packets.
- Rejected malformed ongoing-renewal posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid ongoing payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic ongoing-renewal payment-collection packet regression (`accountant can record ongoing renewal payment collection packet after HayHashvapah receipt`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-ongoing-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 292 - Clinic Ongoing Renewal Closeout Payment Collection ID Guard

- Clinic/wellness ongoing-renewal closeout mutations now reject malformed ongoing-renewal payment-collection packet path IDs before payment-collection lookup or closeout packet creation.
- Submitted ongoing-renewal payment-collection packet IDs must be structurally safe before they can become closeout evidence, next-ongoing renewal task scheduling, backup, suite-event, or audit inputs.
- Clinic ongoing-renewal payment-collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing ongoing-renewal payment-collection packets.
- Safe unknown ongoing-renewal payment-collection packet IDs still preserve the existing `404` behavior, and valid paid ongoing-renewal payment-collection packet IDs continue creating governed ongoing-renewal closeout packets.
- Rejected malformed ongoing-renewal payment-collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid ongoing closeout, next-ongoing task, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic ongoing-renewal closeout packet regression (`owner can close ongoing renewal cycle and schedule next ongoing renewal task after payment collection`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-ongoing-renewal-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 293 - Clinic Next Ongoing Renewal Quote Ongoing Closeout ID Guard

- Clinic/wellness next-ongoing-renewal quote handoff mutations now reject malformed ongoing-renewal closeout packet path IDs before closeout lookup or next-ongoing-renewal quote handoff creation.
- Submitted ongoing-renewal closeout packet IDs must be structurally safe before they can become next-ongoing quote, workflow approval, backup, suite-event, or audit inputs.
- Clinic ongoing-renewal closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing ongoing-renewal closeout packets.
- Safe unknown ongoing-renewal closeout packet IDs still preserve the existing `404` behavior, and valid closed ongoing-renewal closeout packet IDs continue creating governed next-ongoing-renewal quote handoffs.
- Rejected malformed ongoing-renewal closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-ongoing quote handoff, workflow approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `node --check test/platform-tenant.test.js` pass; `git diff --check` pass; focused clinic next-ongoing-renewal quote handoff regression (`sales can create clinic next ongoing renewal quote handoff from ongoing closeout`) pass (1 target test across 48 files); focused Platform real-fetch regression (`platform tenant request host is sent through explicit header with real fetch`) pass (1 target test across 48 files); full `npm test` pass (465 pass, 0 fail, 0 cancelled) after making the real-fetch test use an explicit 5000 ms tenant lookup timeout; `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-ongoing-renewal-quote-ongoing-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 294 - Clinic Next Ongoing Renewal Release Handoff ID Guard

- Clinic/wellness next-ongoing-renewal quote release mutations now reject malformed next-ongoing-renewal quote handoff path IDs before handoff lookup or next-ongoing-renewal quote release packet creation.
- Submitted next-ongoing-renewal quote handoff IDs must be structurally safe before they can become public release evidence, backup, suite-event, or audit inputs.
- Clinic next-ongoing-renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-ongoing-renewal quote handoffs.
- Safe unknown next-ongoing-renewal quote handoff IDs still preserve the existing `404` behavior, and valid executed next-ongoing-renewal quote handoff IDs continue creating governed next-ongoing-renewal quote release packets.
- Rejected malformed next-ongoing-renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-ongoing quote release, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-ongoing-renewal quote release packet regression (`sales can create clinic next ongoing renewal quote release packet after workflow executes`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-ongoing-renewal-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 295 - Clinic Next Ongoing Renewal Acceptance Release ID Guard

- Clinic/wellness next-ongoing-renewal quote acceptance handoff mutations now reject malformed next-ongoing-renewal quote release packet path IDs before release lookup or acceptance handoff creation.
- Submitted next-ongoing-renewal quote release packet IDs must be structurally safe before they can become HayHashvapah handoff, backup, suite-event, or audit inputs.
- Clinic next-ongoing-renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-ongoing-renewal quote release packets.
- Safe unknown next-ongoing-renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted next-ongoing-renewal quote release packet IDs continue creating governed HayHashvapah acceptance handoffs.
- Rejected malformed next-ongoing-renewal quote release packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-ongoing acceptance handoff, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-ongoing-renewal acceptance handoff regression (`accountant can hand accepted next ongoing renewal quote into HayHashvapah invoice approval`) pass (1 target test across 48 files); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-ongoing-renewal-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 296 - Clinic Next Ongoing Renewal Draft Acceptance Handoff ID Guard

- Clinic/wellness next-ongoing-renewal HayHashvapah draft-invoice mutations now reject malformed next-ongoing-renewal quote acceptance handoff path IDs before handoff lookup or draft-invoice packet creation.
- Submitted next-ongoing-renewal acceptance handoff IDs must be structurally safe before they can become HayHashvapah draft evidence, backup, suite-event, or audit inputs.
- Clinic next-ongoing-renewal acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-ongoing-renewal acceptance handoffs.
- Safe unknown next-ongoing-renewal acceptance handoff IDs still preserve the existing `404` behavior, and valid approved next-ongoing-renewal acceptance handoffs continue creating governed HayHashvapah draft-invoice packets.
- Rejected malformed next-ongoing-renewal acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-ongoing draft invoice packet, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-ongoing-renewal draft-invoice packet regression (`accountant can record next ongoing renewal HayHashvapah draft invoice packet after owner executes finance approval`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-ongoing-renewal-draft-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 297 - Clinic Next Ongoing Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness next-ongoing-renewal official-invoice posting mutations now reject malformed next-ongoing-renewal HayHashvapah draft-invoice packet path IDs before draft lookup or posting packet creation.
- Submitted next-ongoing-renewal draft packet IDs must be structurally safe before they can become official invoice evidence, backup, suite-event, or audit inputs.
- Clinic next-ongoing-renewal draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-ongoing-renewal draft packets.
- Safe unknown next-ongoing-renewal draft packet IDs still preserve the existing `404` behavior, and valid posted next-ongoing-renewal draft packets continue creating governed official HayHashvapah invoice posting packets.
- Rejected malformed next-ongoing-renewal draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-ongoing official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-ongoing-renewal official invoice posting packet regression (`accountant can record next ongoing renewal official HayHashvapah invoice posting packet from next ongoing draft`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-ongoing-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 298 - Clinic Next Ongoing Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness next-ongoing-renewal payment collection mutations now reject malformed next-ongoing-renewal official-invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted next-ongoing-renewal posting packet IDs must be structurally safe before they can become payment receipt, collection evidence, backup, suite-event, or audit inputs.
- Clinic next-ongoing-renewal posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-ongoing-renewal posting packets.
- Safe unknown next-ongoing-renewal posting packet IDs still preserve the existing `404` behavior, and valid paid next-ongoing-renewal official invoice posting packet IDs continue creating governed next-ongoing-renewal HayHashvapah payment collection packets.
- Rejected malformed next-ongoing-renewal posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-ongoing payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-ongoing-renewal payment collection packet regression (`accountant can record next ongoing renewal payment collection packet after HayHashvapah receipt`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-ongoing-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 299 - Clinic Next Ongoing Renewal Closeout Payment Collection ID Guard

- Clinic/wellness next-ongoing-renewal closeout mutations now reject malformed next-ongoing-renewal payment-collection packet path IDs before payment-collection lookup or closeout packet creation.
- Submitted next-ongoing-renewal payment-collection packet IDs must be structurally safe before they can become closeout evidence, following ongoing renewal task linkage, backup, suite-event, or audit inputs.
- Clinic next-ongoing-renewal payment-collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-ongoing-renewal payment-collection packets.
- Safe unknown next-ongoing-renewal payment-collection packet IDs still preserve the existing `404` behavior, and valid collected next-ongoing-renewal payment packets continue creating governed next-ongoing-renewal closeout packets.
- Rejected malformed next-ongoing-renewal payment-collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-ongoing closeout, backup, Customer 360, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-ongoing-renewal closeout packet regression (`owner can close next ongoing renewal cycle and schedule following ongoing renewal task after payment collection`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-ongoing-renewal-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 300 - Clinic Following Ongoing Renewal Quote Next Ongoing Closeout ID Guard

- Clinic/wellness following-ongoing-renewal quote handoff mutations now reject malformed next-ongoing-renewal closeout packet path IDs before closeout lookup or following-ongoing quote handoff creation.
- Submitted next-ongoing-renewal closeout packet IDs must be structurally safe before they can become following-ongoing quote, workflow approval, backup, suite-event, or audit inputs.
- Clinic next-ongoing-renewal closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-ongoing-renewal closeout packets.
- Safe unknown next-ongoing-renewal closeout packet IDs still preserve the existing `404` behavior, and valid closed next-ongoing-renewal closeout packet IDs continue creating governed following-ongoing-renewal quote handoffs.
- Rejected malformed next-ongoing-renewal closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-ongoing quote handoff, workflow approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-ongoing-renewal quote handoff regression (`sales can create clinic following ongoing renewal quote handoff from next ongoing closeout`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-ongoing-renewal-quote-next-ongoing-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 301 - Clinic Following Ongoing Renewal Release Handoff ID Guard

- Clinic/wellness following-ongoing-renewal quote release mutations now reject malformed following-ongoing-renewal quote handoff path IDs before handoff lookup or release packet creation.
- Submitted following-ongoing-renewal quote handoff IDs must be structurally safe before they can become quote release evidence, workflow approval linkage, backup, suite-event, or audit inputs.
- Clinic following-ongoing-renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-ongoing-renewal quote handoffs.
- Safe unknown following-ongoing-renewal quote handoff IDs still preserve the existing `404` behavior, and valid approved following-ongoing-renewal quote handoffs continue creating governed quote release packets.
- Rejected malformed following-ongoing-renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-ongoing quote release, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-ongoing-renewal quote release packet regression (`sales can create clinic following ongoing renewal quote release packet after workflow executes`) pass (1 test); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-ongoing-renewal-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 302 - Clinic Following Ongoing Renewal Acceptance And Draft ID Guards

- Clinic/wellness following-ongoing-renewal acceptance handoff mutations now reject malformed following-ongoing-renewal quote release packet path IDs before release lookup or acceptance handoff creation.
- Submitted following-ongoing-renewal quote release packet IDs must be structurally safe before they can become acceptance evidence, HayHashvapah invoice approval linkage, backup, suite-event, or audit inputs.
- Clinic following-ongoing-renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-ongoing-renewal quote release packets.
- Safe unknown following-ongoing-renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted following-ongoing-renewal quote releases continue creating governed acceptance handoffs.
- Clinic/wellness following-ongoing-renewal HayHashvapah draft-invoice mutations now reject malformed following-ongoing-renewal quote acceptance handoff path IDs before handoff lookup or draft-invoice packet creation.
- Submitted following-ongoing-renewal acceptance handoff IDs must be structurally safe before they can become HayHashvapah draft evidence, backup, suite-event, or audit inputs.
- Safe unknown following-ongoing-renewal acceptance handoff IDs still preserve the existing `404` behavior, and valid approved following-ongoing-renewal acceptance handoffs continue creating governed HayHashvapah draft-invoice packets.
- Rejected malformed following-ongoing-renewal quote release packet and acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-ongoing acceptance handoff, draft invoice packet, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-ongoing-renewal acceptance and draft regressions (`accountant can hand accepted following ongoing renewal quote into HayHashvapah invoice approval`; `accountant can record following ongoing renewal HayHashvapah draft invoice packet after owner executes finance approval`) pass (2 tests); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-ongoing-renewal-acceptance-and-draft-id-guards-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 303 - Clinic Following Ongoing Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness following-ongoing-renewal official-invoice posting mutations now reject malformed following-ongoing-renewal HayHashvapah draft-invoice packet path IDs before draft lookup or posting packet creation.
- Submitted following-ongoing-renewal draft packet IDs must be structurally safe before they can become official invoice evidence, backup, suite-event, or audit inputs.
- Clinic following-ongoing-renewal draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-ongoing-renewal draft packets.
- Safe unknown following-ongoing-renewal draft packet IDs still preserve the existing `404` behavior, and valid posted following-ongoing-renewal draft packets continue creating governed official HayHashvapah invoice posting packets.
- Rejected malformed following-ongoing-renewal draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-ongoing official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-ongoing-renewal acceptance, draft, and posting regressions (`accountant can hand accepted following ongoing renewal quote into HayHashvapah invoice approval`; `accountant can record following ongoing renewal HayHashvapah draft invoice packet after owner executes finance approval`; `accountant can record following ongoing renewal official HayHashvapah invoice posting packet from following ongoing draft`) pass (3 target tests across 50 files); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-ongoing-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 304 - Clinic Following Ongoing Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness following-ongoing-renewal payment collection mutations now reject malformed following-ongoing-renewal official-invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted following-ongoing-renewal posting packet IDs must be structurally safe before they can become payment collection evidence, backup, suite-event, or audit inputs.
- Clinic following-ongoing-renewal posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-ongoing-renewal posting packets.
- Safe unknown following-ongoing-renewal posting packet IDs still preserve the existing `404` behavior, and valid paid following-ongoing-renewal official invoice posting packet IDs continue creating governed following-ongoing-renewal HayHashvapah payment collection packets.
- Rejected malformed following-ongoing-renewal posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-ongoing payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-ongoing-renewal payment collection packet regression (`accountant can record following ongoing renewal payment collection packet after HayHashvapah receipt`) pass (1 target test across 48 files); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-ongoing-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 305 - Clinic Following Ongoing Renewal Closeout Payment Collection ID Guard

- Clinic/wellness following-ongoing-renewal closeout mutations now reject malformed following-ongoing-renewal payment-collection packet path IDs before payment lookup or closeout packet creation.
- Submitted following-ongoing-renewal payment-collection packet IDs must be structurally safe before they can become closeout evidence, subsequent ongoing renewal task linkage, backup, suite-event, or audit inputs.
- Clinic following-ongoing-renewal payment-collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-ongoing-renewal payment-collection packets.
- Safe unknown following-ongoing-renewal payment-collection packet IDs still preserve the existing `404` behavior, and valid paid following-ongoing-renewal payment-collection packet IDs continue creating governed following-ongoing-renewal closeout packets.
- Rejected malformed following-ongoing-renewal payment-collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid following-ongoing closeout, backup, CRM task, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic following-ongoing-renewal closeout packet regression (`owner can close following ongoing renewal cycle and schedule subsequent ongoing renewal task after payment collection`) pass (1 target test across 48 files); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-following-ongoing-renewal-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 306 - Clinic Subsequent Ongoing Renewal Quote Following Ongoing Closeout ID Guard

- Clinic/wellness subsequent-ongoing-renewal quote handoff mutations now reject malformed following-ongoing-renewal closeout packet path IDs before closeout lookup or quote handoff creation.
- Submitted following-ongoing-renewal closeout packet IDs must be structurally safe before they can become subsequent-ongoing-renewal quote evidence, backup, suite-event, or audit inputs.
- Clinic following-ongoing-renewal closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing following-ongoing-renewal closeout packets.
- Safe unknown following-ongoing-renewal closeout packet IDs still preserve the existing `404` behavior, and valid closed following-ongoing-renewal closeout packet IDs continue creating governed subsequent-ongoing-renewal quote handoff packets.
- Rejected malformed following-ongoing-renewal closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-ongoing-renewal quote handoff, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-ongoing-renewal quote handoff regression (`sales can create clinic subsequent ongoing renewal quote handoff from following ongoing closeout`) pass (1 target test across 48 files); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-ongoing-renewal-quote-following-ongoing-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 307 - Clinic Subsequent Ongoing Renewal Release Handoff ID Guard

- Clinic/wellness subsequent-ongoing-renewal quote release packet mutations now reject malformed subsequent-ongoing-renewal quote handoff path IDs before handoff lookup or release packet creation.
- Submitted subsequent-ongoing-renewal quote handoff IDs must be structurally safe before they can become release packet evidence, public quote visibility proof, backup, suite-event, or audit inputs.
- Clinic subsequent-ongoing-renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-ongoing-renewal quote handoffs.
- Safe unknown subsequent-ongoing-renewal quote handoff IDs still preserve the existing `404` behavior, and valid owner-executed subsequent-ongoing-renewal quote handoff IDs continue creating governed public quote release packets.
- Rejected malformed subsequent-ongoing-renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-ongoing-renewal quote release, public quote visibility, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-ongoing-renewal quote release packet regression (`sales can create clinic subsequent ongoing renewal quote release packet after workflow executes`) pass (1 target test across 48 files); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-ongoing-renewal-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 308 - Clinic Subsequent Ongoing Renewal Acceptance Release ID Guard

- Clinic/wellness subsequent-ongoing-renewal quote acceptance handoff mutations now reject malformed subsequent-ongoing-renewal quote release packet path IDs before release lookup or acceptance handoff creation.
- Submitted subsequent-ongoing-renewal quote release packet IDs must be structurally safe before they can become acceptance handoff evidence, HayHashvapah invoice approval linkage, backup, suite-event, or audit inputs.
- Clinic subsequent-ongoing-renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-ongoing-renewal quote release packets.
- Safe unknown subsequent-ongoing-renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted subsequent-ongoing-renewal quote releases continue creating governed acceptance handoffs.
- Rejected malformed subsequent-ongoing-renewal quote release packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-ongoing-renewal acceptance handoff, finance approval, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-ongoing-renewal acceptance handoff regression (`accountant can hand accepted subsequent ongoing renewal quote into HayHashvapah invoice approval`) pass (1 target test across 48 files); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-ongoing-renewal-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 309 - Clinic Subsequent Ongoing Renewal Draft Acceptance Handoff ID Guard

- Clinic/wellness subsequent-ongoing-renewal HayHashvapah draft-invoice packet mutations now reject malformed subsequent-ongoing-renewal acceptance handoff path IDs before handoff lookup or draft-invoice packet creation.
- Submitted subsequent-ongoing-renewal acceptance handoff IDs must be structurally safe before they can become HayHashvapah draft evidence, finance workflow proof, backup, suite-event, or audit inputs.
- Clinic subsequent-ongoing-renewal acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-ongoing-renewal acceptance handoffs.
- Safe unknown subsequent-ongoing-renewal acceptance handoff IDs still preserve the existing `404` behavior, and valid owner-executed subsequent-ongoing-renewal acceptance handoffs continue creating governed HayHashvapah draft-invoice packets.
- Rejected malformed subsequent-ongoing-renewal acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-ongoing-renewal HayHashvapah draft invoice, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-ongoing-renewal draft invoice packet regression (`accountant can record subsequent ongoing renewal HayHashvapah draft invoice packet after owner executes finance approval`) pass (1 target test across 48 files); dashboard sidebar openability regression pass after installing the missing Playwright Chromium headless shell (`dashboard sidebar opens every assigned app for all seeded roles`, 1 pass); interrupted route/tax/VAT tail rerun pass (14 pass, 0 fail); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-ongoing-renewal-draft-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 310 - Clinic Subsequent Ongoing Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness subsequent-ongoing-renewal official-invoice posting mutations now reject malformed subsequent-ongoing-renewal HayHashvapah draft-invoice packet path IDs before draft lookup or posting packet creation.
- Submitted subsequent-ongoing-renewal draft packet IDs must be structurally safe before they can become official invoice evidence, finance receivable linkage, backup, suite-event, or audit inputs.
- Clinic subsequent-ongoing-renewal draft packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-ongoing-renewal draft packets.
- Safe unknown subsequent-ongoing-renewal draft packet IDs still preserve the existing `404` behavior, and valid posted subsequent-ongoing-renewal draft packets continue creating governed official HayHashvapah invoice posting packets.
- Rejected malformed subsequent-ongoing-renewal draft packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-ongoing-renewal official invoice posting, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-ongoing-renewal official invoice posting packet regression (`accountant can record subsequent ongoing renewal official HayHashvapah invoice posting packet from subsequent ongoing draft`) pass (1 target test across 48 files); read-only subagent review pass (no findings); full `npm test` pass via heartbeat wrapper (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-ongoing-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 311 - Clinic Subsequent Ongoing Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness subsequent-ongoing-renewal payment collection mutations now reject malformed subsequent-ongoing-renewal official-invoice posting packet path IDs before posting-packet lookup or payment-collection packet creation.
- Submitted subsequent-ongoing-renewal posting packet IDs must be structurally safe before they can become payment collection evidence, payment receipt linkage, backup, suite-event, or audit inputs.
- Clinic subsequent-ongoing-renewal posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-ongoing-renewal posting packets.
- Safe unknown subsequent-ongoing-renewal posting packet IDs still preserve the existing `404` behavior, and valid paid subsequent-ongoing-renewal official invoice posting packets continue creating governed HayHashvapah payment collection packets.
- Rejected malformed subsequent-ongoing-renewal posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-ongoing-renewal payment collection, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-ongoing-renewal payment collection packet regression (`accountant can record subsequent ongoing renewal payment collection packet after HayHashvapah receipt`) pass (1 target test across 48 files); read-only subagent review pass (no findings); full `node --test test/api.test.js` pass (231 pass, 0 fail, 0 cancelled); dashboard/sidebar route proof plus route/tax/VAT verification pass (`node --test test/suite-dashboard-sidebar-openability.test.mjs test/suite-routes.test.mjs test/tax-rate-versioning.test.js test/vat-rate-versioning.test.js`, 15 pass, 0 fail, 0 cancelled) after restoring the missing Playwright Chromium headless shell cache; full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-ongoing-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 312 - Clinic Subsequent Ongoing Renewal Closeout Payment Collection ID Guard

- Clinic/wellness subsequent-ongoing-renewal closeout mutations now reject malformed subsequent-ongoing-renewal payment-collection packet path IDs before payment lookup or closeout packet creation.
- Submitted subsequent-ongoing-renewal payment-collection packet IDs must be structurally safe before they can become closeout evidence, next recurring ongoing renewal task linkage, backup, suite-event, or audit inputs.
- Clinic subsequent-ongoing-renewal payment-collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-ongoing-renewal payment-collection packets.
- Safe unknown subsequent-ongoing-renewal payment-collection packet IDs still preserve the existing `404` behavior, and valid paid subsequent-ongoing-renewal payment-collection packets continue creating governed subsequent-ongoing-renewal closeout packets.
- Rejected malformed subsequent-ongoing-renewal payment-collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid subsequent-ongoing-renewal closeout, backup, CRM task, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic subsequent-ongoing-renewal closeout packet regression (`owner can close subsequent ongoing renewal cycle and schedule next recurring ongoing task after payment collection`) pass (1 target test across 48 files); read-only subagent review pass (no findings); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-subsequent-ongoing-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 313 - Clinic Next Recurring Ongoing Renewal Quote Subsequent Ongoing Closeout ID Guard

- Clinic/wellness next-recurring-ongoing-renewal quote handoff mutations now reject malformed subsequent-ongoing-renewal closeout packet path IDs before closeout lookup or quote handoff creation.
- Submitted subsequent-ongoing-renewal closeout packet IDs must be structurally safe before they can become next-recurring-ongoing-renewal quote evidence, workflow approval linkage, backup, suite-event, or audit inputs.
- Clinic subsequent-ongoing-renewal closeout packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing subsequent-ongoing-renewal closeout packets.
- Safe unknown subsequent-ongoing-renewal closeout packet IDs still preserve the existing `404` behavior, and valid closed subsequent-ongoing-renewal closeout packets continue creating governed next-recurring-ongoing-renewal quote handoffs.
- Rejected malformed subsequent-ongoing-renewal closeout packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-recurring-ongoing-renewal quote handoff, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-recurring-ongoing-renewal quote handoff regression (`sales can create clinic next recurring ongoing renewal quote handoff from subsequent ongoing closeout`) pass (1 target test across 48 files); read-only subagent review pass (no findings); full `node --test test/api.test.js` pass (231 pass, 0 fail, 0 cancelled); dashboard/sidebar route proof plus route/tax/VAT verification pass (`node --test test/suite-dashboard-sidebar-openability.test.mjs test/suite-routes.test.mjs test/tax-rate-versioning.test.js test/vat-rate-versioning.test.js`, 15 pass, 0 fail, 0 cancelled); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-recurring-ongoing-renewal-quote-closeout-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 314 - Clinic Next Recurring Ongoing Renewal Quote Release Handoff ID Guard

- Clinic/wellness next-recurring-ongoing-renewal quote release mutations now reject malformed next-recurring-ongoing-renewal quote handoff path IDs before handoff lookup or release packet creation.
- Submitted next-recurring-ongoing-renewal quote handoff IDs must be structurally safe before they can become quote release evidence, public quote linkage, backup, suite-event, or audit inputs.
- Clinic next-recurring-ongoing-renewal quote handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-recurring-ongoing-renewal quote handoffs.
- Safe unknown next-recurring-ongoing-renewal quote handoff IDs still preserve the existing `404` behavior, and valid owner-executed next-recurring-ongoing-renewal quote handoffs continue creating governed quote release packets.
- Rejected malformed next-recurring-ongoing-renewal quote handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-recurring-ongoing-renewal quote release, backup, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-recurring-ongoing-renewal quote release packet regression (`sales can create clinic next recurring ongoing renewal quote release packet after workflow executes`) pass (1 target test across 48 files); read-only subagent review pass (no findings); full `node --test test/api.test.js` pass (231 pass, 0 fail, 0 cancelled); dashboard/sidebar route proof plus route/tax/VAT verification pass (`node --test test/suite-dashboard-sidebar-openability.test.mjs test/suite-routes.test.mjs test/tax-rate-versioning.test.js test/vat-rate-versioning.test.js`, 15 pass, 0 fail, 0 cancelled); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-recurring-ongoing-renewal-quote-release-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 315 - Clinic Next Recurring Ongoing Renewal Acceptance Release ID Guard

- Clinic/wellness next-recurring-ongoing-renewal quote acceptance handoff mutations now reject malformed next-recurring-ongoing-renewal quote release packet path IDs before release lookup or acceptance handoff creation.
- Submitted next-recurring-ongoing-renewal quote release packet IDs must be structurally safe before they can become acceptance handoff evidence, HayHashvapah invoice approval linkage, backup, suite-event, or audit inputs.
- Clinic next-recurring-ongoing-renewal quote release packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-recurring-ongoing-renewal quote release packets.
- Safe unknown next-recurring-ongoing-renewal quote release packet IDs still preserve the existing `404` behavior, and valid accepted next-recurring-ongoing-renewal quote release packets continue creating governed acceptance handoffs.
- Rejected malformed next-recurring-ongoing-renewal quote release packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-recurring-ongoing-renewal acceptance handoff, backup, finance approval, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-recurring-ongoing-renewal acceptance handoff regression (`accountant can hand accepted next recurring ongoing renewal quote into HayHashvapah invoice approval`) pass (1 target test across 48 files); read-only subagent review pass (code/security, no findings); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-recurring-ongoing-renewal-acceptance-release-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 316 - Clinic Next Recurring Ongoing Renewal Draft Acceptance Handoff ID Guard

- Clinic/wellness next-recurring-ongoing-renewal HayHashvapah draft invoice mutations now reject malformed next-recurring-ongoing-renewal acceptance handoff path IDs before handoff lookup or draft invoice packet creation.
- Submitted next-recurring-ongoing-renewal acceptance handoff IDs must be structurally safe before they can become HayHashvapah draft invoice evidence, workflow-run linkage, backup, suite-event, or audit inputs.
- Clinic next-recurring-ongoing-renewal acceptance handoff IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-recurring-ongoing-renewal acceptance handoffs.
- Safe unknown next-recurring-ongoing-renewal acceptance handoff IDs still preserve the existing `404` behavior, and valid owner-executed next-recurring-ongoing-renewal acceptance handoffs continue creating governed HayHashvapah draft invoice packets.
- Rejected malformed next-recurring-ongoing-renewal acceptance handoff ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-recurring-ongoing-renewal HayHashvapah draft invoice, backup, finance draft invoice, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-recurring-ongoing-renewal HayHashvapah draft invoice packet regression (`accountant can record next recurring ongoing renewal HayHashvapah draft invoice packet after owner executes finance approval`) pass (1 target test across 48 files); read-only subagent review pass (code/security, no findings); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-recurring-ongoing-renewal-draft-acceptance-handoff-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 317 - Clinic Next Recurring Ongoing Renewal Official Invoice Draft Packet ID Guard

- Clinic/wellness next-recurring-ongoing-renewal official invoice posting mutations now reject malformed next-recurring-ongoing-renewal HayHashvapah draft invoice packet path IDs before draft lookup or official invoice posting packet creation.
- Submitted next-recurring-ongoing-renewal HayHashvapah draft invoice packet IDs must be structurally safe before they can become official invoice evidence, finance invoice linkage, backup, suite-event, or audit inputs.
- Clinic next-recurring-ongoing-renewal HayHashvapah draft invoice packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-recurring-ongoing-renewal HayHashvapah draft invoice packets.
- Safe unknown next-recurring-ongoing-renewal HayHashvapah draft invoice packet IDs still preserve the existing `404` behavior, and valid posted next-recurring-ongoing-renewal HayHashvapah draft invoice packets continue creating governed official invoice posting packets.
- Rejected malformed next-recurring-ongoing-renewal HayHashvapah draft invoice packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-recurring-ongoing-renewal official invoice posting, backup, finance invoice link, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-recurring-ongoing-renewal official invoice posting packet regression (`accountant can record next recurring ongoing renewal official HayHashvapah invoice posting packet from next recurring draft`) pass (1 target test across 48 files); read-only subagent review pass (code/security, no findings); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-recurring-ongoing-renewal-official-invoice-draft-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 318 - Clinic Next Recurring Ongoing Renewal Payment Collection Posting Packet ID Guard

- Clinic/wellness next-recurring-ongoing-renewal payment collection mutations now reject malformed next-recurring-ongoing-renewal HayHashvapah official-invoice posting packet path IDs before posting lookup or payment collection packet creation.
- Submitted next-recurring-ongoing-renewal HayHashvapah official-invoice posting packet IDs must be structurally safe before they can become payment collection evidence, receipt linkage, backup, suite-event, or audit inputs.
- Clinic next-recurring-ongoing-renewal HayHashvapah official-invoice posting packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-recurring-ongoing-renewal HayHashvapah posting packets.
- Safe unknown next-recurring-ongoing-renewal HayHashvapah official-invoice posting packet IDs still preserve the existing `404` behavior, and valid paid next-recurring-ongoing-renewal HayHashvapah official invoice posting packets continue creating governed payment collection packets.
- Rejected malformed next-recurring-ongoing-renewal HayHashvapah official-invoice posting packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-recurring-ongoing-renewal payment collection, backup, receipt, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-recurring-ongoing-renewal payment collection packet regression (`accountant can record next recurring ongoing renewal payment collection packet after HayHashvapah receipt`) pass (1 target test across 48 files); read-only subagent review pass (code/security, no findings); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-recurring-ongoing-renewal-payment-collection-posting-packet-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 319 - Clinic Next Recurring Ongoing Renewal Closeout Payment Collection ID Guard

- Clinic/wellness next-recurring-ongoing-renewal closeout mutations now reject malformed next-recurring-ongoing-renewal HayHashvapah payment-collection packet path IDs before payment lookup or closeout packet creation.
- Submitted next-recurring-ongoing-renewal HayHashvapah payment-collection packet IDs must be structurally safe before they can become closeout evidence, following recurring ongoing renewal task linkage, backup, suite-event, or audit inputs.
- Clinic next-recurring-ongoing-renewal HayHashvapah payment-collection packet IDs must be lowercase alphanumeric/hyphen strings; control-character strings, empty values, overlong values, or unsafe characters are rejected instead of being treated as missing next-recurring-ongoing-renewal HayHashvapah payment-collection packets.
- Safe unknown next-recurring-ongoing-renewal HayHashvapah payment-collection packet IDs still preserve the existing `404` behavior, and valid paid next-recurring-ongoing-renewal payment collection packets continue creating governed closeout packets.
- Rejected malformed next-recurring-ongoing-renewal HayHashvapah payment-collection packet ID requests return `400`, keep submitted path/body secrets out of error bodies, and valid next-recurring-ongoing-renewal closeout, backup, CRM task, and audit behavior remains unchanged.
- Verification for the checkpoint: `node --check server/app.js` pass; `node --check test/api.test.js` pass; `git diff --check` pass; focused clinic next-recurring-ongoing-renewal closeout packet regression (`owner can close next recurring ongoing renewal cycle and schedule following recurring ongoing task after payment collection`) pass (1 target test across 48 files); read-only subagent review pass (code/security, no findings); full `npm test` pass (465 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-clinic-next-recurring-ongoing-renewal-closeout-payment-collection-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 320 - OpenRouter/Open Notebook AI Merge With Route-Normalization Base

- The OpenRouter/Open Notebook AI core refactor is merged onto `codex/suite-dashboard-route-normalization`, preserving the newer clinic next-recurring ongoing renewal hardening slices while keeping the vendored `server/vendor/a1-ai` core and thin Suite adapters.
- The A1 Suite consumes the vendored AI core for model catalog, model policy, settings storage, supplemental-source policy, and Open Notebook search without changing the sovereign default: outbound network remains off unless explicitly enabled and allowlisted.
- OpenRouter remains the single opt-in cloud provider with a live model menu and deterministic offline fallback; local AI/RAG behavior remains available without external calls.
- Open Notebook remains an opt-in supplemental-source connector beside the sovereign in-process RAG layer; its hits are advisory-only, cannot satisfy legal citation requirements, and cannot bypass professional source review gates.
- AI settings persist locally with raw OpenRouter and Open Notebook secrets redacted from API responses, while per-aspect model selections can override empty environment defaults.
- Verification for the merged checkpoint: AI syntax checks pass (`node --check server/app.js server/config.js server/aiProvider.js server/openNotebook.js server/copilot.js server/settingsStore.js test/api.test.js test/ai-config.test.js test/ai-provider.test.js test/settings-store.test.js test/open-notebook.test.js test/copilot.test.js test/ai-endpoints.test.js test/copilot-supplemental.test.js`); targeted AI/OpenRouter/Open Notebook suite pass (`node --test test/ai-config.test.js test/ai-provider.test.js test/settings-store.test.js test/open-notebook.test.js test/copilot.test.js test/ai-endpoints.test.js test/copilot-supplemental.test.js`, 52 pass, 0 fail, 0 cancelled); focused clinic next-recurring-ongoing-renewal HayHashvapah draft invoice packet regression pass (`accountant can record next recurring ongoing renewal HayHashvapah draft invoice packet after owner executes finance approval`, 1 pass); dashboard/sidebar route proof plus route/tax/VAT verification pass (`node --test test/suite-dashboard-sidebar-openability.test.mjs test/suite-routes.test.mjs test/tax-rate-versioning.test.js test/vat-rate-versioning.test.js`, 15 pass, 0 fail, 0 cancelled); read-only subagent merge review pass (no findings); full `node --test test/api.test.js` pass (231 pass, 0 fail, 0 cancelled); full `npm test` pass (504 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-ai-merge-current-base-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 321 - CRM Lead Conversion Path ID Guard

- CRM lead conversion mutations now block malformed lead path IDs before lead lookup or conversion work.
- CRM lead conversion mutations require both CRM app entitlement and CRM editor role before conversion work can run.
- Submitted CRM lead IDs must be structurally safe before they can become customer, profile, source, deal, conversion activity, suite-event, or audit evidence.
- CRM lead path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before conversion side effects.
- Safe unknown CRM lead IDs still preserve the existing `404` behavior, and valid leads continue converting through the governed customer/deal/profile workflow.
- Rejected malformed CRM lead conversion ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid conversion metadata, default-title bounds, customer profile creation, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused CRM conversion path/malformed metadata regression pass (`CRM lead conversion rejects malformed metadata before persistence`, 1 pass, including encoded malformed path IDs); broader CRM lead/forecast guard suite pass (`node --test --test-name-pattern "salesperson can capture|CRM lead API rejects|CRM lead conversion rejects|auditor cannot create CRM leads|forecast category|CRM deal forecast rejects|support cannot update CRM deal forecasts" test/api.test.js`, 7 pass, 0 fail, 0 cancelled); read-only subagent review warning addressed (encoded malformed path coverage restored; docs conflicts resolved); full `npm test` pass (504 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-crm-lead-conversion-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 322 - CRM Deal Forecast Path ID Guard

- CRM deal forecast mutations now block malformed deal path IDs before deal lookup or forecast update work.
- CRM deal forecast mutations require both CRM app entitlement and CRM editor role before forecast mutation work can run.
- Submitted CRM deal IDs must be structurally safe before they can become forecast rows, health evidence, suite-event, or audit evidence.
- CRM deal path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded malformed route segments fail before forecast side effects.
- Safe unknown CRM deal IDs still preserve the existing `404` behavior, and valid deals continue updating governed forecast evidence.
- Rejected malformed CRM deal forecast ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid forecast metadata, app-entitlement gating, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; `git diff --check` pass; focused CRM deal forecast path/malformed metadata regression pass (`CRM deal forecast rejects malformed metadata before persistence`, 1 pass); read-only subagent review pass (code/security, no blocking findings; residual transactionality/status-code-contract notes are non-blocking); full `npm test` pass (504 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-crm-deal-forecast-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 323 - CRM Quote Approval Path ID Guard

- CRM quote release approval mutations now require CRM app entitlement and block malformed quote path IDs before quote lookup or workflow approval work.
- Submitted CRM quote IDs must be structurally safe before they can become workflow approvals, release-request suite events, or audit evidence.
- CRM quote path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before approval side effects through either the route guard or router rejection.
- Safe unknown CRM quote IDs still preserve the existing `404` behavior, and valid draft quotes continue requesting governed release approvals.
- Rejected malformed CRM quote release approval ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard, entitlement, and router rejections, and leave valid quote release note metadata, idempotent approval reuse, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused CRM quote approval path/malformed metadata regression pass (`CRM quote creation and release approval reject malformed metadata before persistence`, 1 pass, including unsafe/overlong/encoded quote path IDs and disabled CRM app entitlement); broader CRM quote/lead/forecast guard suite pass (`node --test --test-name-pattern "draft CRM quote|CRM quote creation|public quote acceptance marks deal won|public quote endpoint exposes|CRM list query filters reject|CRM lead conversion rejects|CRM deal forecast rejects" test/api.test.js`, 7 pass, 0 fail, 0 cancelled); read-only subagent review pass after docs status-contract warning was addressed; full `npm test` pass (504 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-crm-quote-approval-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 324 - CRM Collection Path ID Guard

- CRM collection payment-promise and reminder mutations now block malformed task and promise path IDs before collection lookup or mutation work.
- Submitted CRM collection task and promise IDs must be structurally safe before they can become payment-promise records, reminder deliveries, task-state updates, suite events, or audit evidence.
- CRM collection path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before collection side effects through either the route guard or router rejection.
- Safe unknown CRM task and collection promise IDs still preserve the existing `404` behavior, and valid collection tasks/promises continue creating idempotent payment promises and Armenian reminder evidence.
- Rejected malformed CRM collection path ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid promise metadata, idempotent reminder delivery, task-state updates, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused CRM collection path/malformed metadata regression pass (`collection promise and reminder reject malformed metadata before persistence`, 1 pass, including unsafe/overlong/encoded task and promise path IDs); broader collection/CRM guard suite pass (`node --test --test-name-pattern "collection promise and reminder reject|collection task records|scheduled collection promise|HayHashvapah payment fulfills|bank transaction import reconciles|collection list query filters reject|CRM quote creation and release approval reject" test/api.test.js`, 7 pass, 0 fail, 0 cancelled); read-only subagent review pass (no blocking findings; residual pending-docs note addressed, broad malformed-path status contract unchanged by design); full `npm test` pass (504 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-crm-collection-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 325 - Docs Document Path ID Guard

- Docs document read, edit, signer, send, sign, void, and export routes now block malformed document path IDs before document lookup or mutation work.
- Submitted Docs document IDs must be structurally safe before they can become document edits, signer rows, send/sign/void evidence, export rendering inputs, suite events, or audit evidence.
- Docs document path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before document side effects through either the route guard or router rejection.
- Safe unknown Docs document IDs still preserve the existing `404` behavior, and valid documents continue through governed draft, signing, void, and export workflows.
- Rejected malformed Docs document path ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid document metadata, signer, send, sign, void, export, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/docs-sign.test.js && node --check test/docs-export.test.js` pass; `git diff --check` pass; focused Docs document path/malformed metadata regression pass (`docs-sign: malformed document metadata` and `docs-export: unknown id`, 2 pass); broader Docs sign/export/template suite pass (`node --test test/docs-sign.test.js test/docs-export.test.js test/docs-templates.test.js`, 19 pass, 0 fail, 0 cancelled); read-only subagent review pass (code/security, no findings); full `npm test` pass (505 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-docs-document-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 326 - Projects Path ID Guard

- Projects read, edit, child task/milestone, time-entry, billing-preview, and bill-time routes now block malformed project path IDs before project lookup or mutation work.
- Submitted Projects project, task, and milestone IDs must be structurally safe before they can become project updates, child rows, time entries, billing previews, finance invoices, suite events, or audit evidence.
- Projects route IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before project side effects through either the route guard or router rejection.
- Safe unknown project, task, and milestone IDs still preserve the existing `404` behavior, and valid projects continue through governed delivery and billing workflows.
- Rejected malformed Projects path ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid project metadata, child mutation, time logging, billing-preview, bill-time, finance, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/projects.test.js && node --check test/project-billing.test.js` pass; `git diff --check` pass; focused Projects path/billing path regression pass (`node --test --test-name-pattern "projects: malformed path ids|project-billing: malformed project path ids" test/projects.test.js test/project-billing.test.js`, 2 pass, 0 fail, 0 cancelled); broader Projects/billing suite pass (`node --test test/projects.test.js test/project-billing.test.js`, 11 pass, 0 fail, 0 cancelled); read-only subagent review pass (code/security, no findings; residual overlong route status delegated to router rejection but no side-effect risk); full `npm test` pass (507 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-projects-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 327 - Service Desk Case Path ID Guard
- Service Desk case reply, escalation, resolution, and update routes now block malformed service case path IDs before case lookup or mutation work.
- Submitted Service Desk case IDs must be structurally safe before they can become reply messages, escalation records, resolution records, case updates, suite events, or audit evidence.
- Service Desk case path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with 400, and encoded or overlong route segments fail before service side effects through either the route guard or router rejection.
- Safe unknown Service Desk case IDs still preserve existing 404 behavior, and valid cases continue through governed reply, escalation, resolution, and update workflows.
- Rejected malformed Service Desk case path ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid service metadata, messages, escalations, resolutions, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js && node --check test/people-hr.test.js` pass; focused Service Desk/People-HR path regression pass (`node --test --test-name-pattern "service case mutations reject malformed metadata|people-hr: malformed employee path ids" test/api.test.js test/people-hr.test.js`, 2 pass, 0 fail, 0 cancelled); broader Service Desk/API/People-HR/payroll suite pass (`node --test test/api.test.js test/people-hr.test.js test/payroll-endpoints.test.js test/payroll-employee-fk.test.js test/payroll.test.js test/tax-rate-versioning.test.js`, 246 pass, 0 fail, 0 cancelled); read-only subagent review pass (code/security/docs, no findings); `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-service-people-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 328 - People-HR Employee Path ID Guard
- People-HR employee update, payroll-run, and payroll-history routes now block malformed employee path IDs before employee lookup, mutation, or history work.
- Submitted People-HR employee IDs must be structurally safe before they can become employee updates, payroll runs, ledger rows, payroll-history reads, or audit evidence.
- People-HR employee path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with 400, and encoded or overlong route segments fail before payroll side effects through either the route guard or router rejection.
- Safe unknown employee IDs still preserve existing 404 behavior, and valid employees continue through governed employee update, payroll posting, and payroll-history workflows.
- Rejected malformed People-HR employee path ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid employee metadata, payroll runs, ledger rows, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js && node --check test/people-hr.test.js` pass; focused Service Desk/People-HR path regression pass (`node --test --test-name-pattern "service case mutations reject malformed metadata|people-hr: malformed employee path ids" test/api.test.js test/people-hr.test.js`, 2 pass, 0 fail, 0 cancelled); broader Service Desk/API/People-HR/payroll suite pass (`node --test test/api.test.js test/people-hr.test.js test/payroll-endpoints.test.js test/payroll-employee-fk.test.js test/payroll.test.js test/tax-rate-versioning.test.js`, 246 pass, 0 fail, 0 cancelled); read-only subagent review pass (code/security/docs, no findings); `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-service-people-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 329 - Workflow Approval Run Path ID Guard
- Workflow approval decision, approval execution, and failed-run retry routes now block malformed workflow approval and run path IDs before workflow lookup or mutation work.
- Submitted workflow approval and run IDs must be structurally safe before they can become approval decisions, workflow action execution, retry evidence, suite events, audit evidence, or workflow-run state transitions.
- Workflow approval and run path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with 400, and encoded or overlong route segments fail before workflow side effects through either the route guard or router rejection.
- Safe unknown workflow approval and run IDs still preserve existing 404 behavior, and valid workflow approvals/runs continue through governed decision, execution, and retry workflows.
- Rejected malformed workflow path ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid approval metadata, workflow actions, retry state, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused Workflow/Finance path regression pass (`node --test --test-name-pattern "workflow approval decision rejects malformed metadata|draft invoice posting rejects malformed metadata|payment receipt rejects malformed metadata|bank transaction import rejects malformed metadata" test/api.test.js`, 4 pass, 0 fail, 0 cancelled); broader API/finance/accounting suite pass (`node --test test/api.test.js test/finance-posting.test.js test/ledger-core.test.js test/opening-balances.test.js test/payroll.test.js test/payroll-endpoints.test.js test/tax-rate-versioning.test.js`, 246 pass, 0 fail, 0 cancelled); `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-workflow-finance-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 330 - Finance Mutation Path ID Guard
- Finance draft invoice posting, invoice payment, and bank transaction reconciliation routes now block malformed finance path IDs before finance lookup or mutation work.
- Submitted finance draft invoice, invoice, and bank transaction IDs must be structurally safe before they can become posted invoices, payment receipts, ledger rows, webhook deliveries, collection fulfillment, suite events, or audit evidence.
- Finance mutation path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with 400, and encoded or overlong route segments fail before finance side effects through either the route guard or router rejection.
- Safe unknown finance mutation IDs still preserve existing 404 behavior, and valid draft invoices, invoices, and bank transactions continue through governed posting, payment, and reconciliation workflows.
- Rejected malformed finance path ID requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid draft invoice, invoice payment, bank transaction, ledger, webhook, collection, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused Workflow/Finance path regression pass (`node --test --test-name-pattern "workflow approval decision rejects malformed metadata|draft invoice posting rejects malformed metadata|payment receipt rejects malformed metadata|bank transaction import rejects malformed metadata" test/api.test.js`, 4 pass, 0 fail, 0 cancelled); broader API/finance/accounting suite pass (`node --test test/api.test.js test/finance-posting.test.js test/ledger-core.test.js test/opening-balances.test.js test/payroll.test.js test/payroll-endpoints.test.js test/tax-rate-versioning.test.js`, 246 pass, 0 fail, 0 cancelled); `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-workflow-finance-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 331 - Legal Source Review Path ID Guard
- Legal-source review routes now block malformed legal source path IDs before reviewer-role checks, source lookup, or source review work.
- Submitted Armenian legal source IDs must be structurally safe before they can become reviewed source versions, source review rows, block events, suite events, or audit evidence.
- Legal source path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with 400 before the role branch, and safe unknown IDs still preserve the existing 404 behavior.
- Rejected malformed legal source review path requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across encoded and decoded malformed IDs, and leave valid legal source review metadata, URL host/scheme guards, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused legal source regression pass (`node --test --test-name-pattern "legal source review rejects malformed metadata|owner can review and version Armenian legal source registry entries|legal source review keeps reviewed URLs|legal source review does not downgrade|legal source review rejects credentialed|non-owner cannot review legal source" test/api.test.js`, 6 pass, 0 fail, 0 cancelled); broader legal/API regression pass (`node --test --test-name-pattern "legal source|production-readiness|SRC export requires reviewed VAT legal source|customer 360 joins CRM, finance, service, automation, and legal sources|legal answer|personal-data consent" test/api.test.js`, 11 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local line-numbered diff review found no issues; `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-legal-source-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 332 - Finance Period Path Key Guard
- Finance period close and reopen routes now block malformed period path keys before finance period lookup or period-state mutation work.
- Submitted finance period keys must be structurally safe before they can become period lock/reopen state, suite events, audit evidence, or downstream accounting control flow.
- Finance period path keys must be exact `YYYY-MM` values with a valid month; unsafe route-reachable characters are rejected with 400, and encoded or overlong route segments fail before finance-period side effects through either the route guard or router rejection.
- Safe unknown finance period keys still preserve existing 404 behavior, and valid open/closed periods continue through governed close and reopen workflows.
- Rejected malformed finance period path-key requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across route-guard and router rejections, and leave valid period close metadata, period lock state, reopen state, suite-event, audit, and downstream accounting behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; `git diff --check` pass; focused finance period path-key regression pass (`node --test --test-name-pattern "finance period close rejects malformed metadata" test/api.test.js`, 1 pass, 0 fail, 0 cancelled); broader finance/accounting action suite pass (`node --test --test-name-pattern "finance period guardrails|finance period close rejects|closed finance period blocks SRC export|closed finance period records failed workflow run and retries|posted HayHashvapah draft invoice creates|draft invoice posting rejects|closed finance period blocks posting|payment receipt marks|payment receipt rejects|closed finance period blocks payment|finance report query filters reject|SRC export rejects|bank transaction import rejects|Armenian bank transaction import reconciles" test/api.test.js`, 14 pass, 0 fail, 0 cancelled); read-only subagent review pass (code/security/docs, no findings); full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-finance-period-path-key-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 333 - App Assignment Path ID Guard
- App-assignment routes now block malformed suite app path IDs before app lookup, role validation, assignment writes, or audit work.
- Submitted suite app IDs must be structurally safe before they can become app entitlement rows, access-review evidence inputs, dashboard visibility, or audit evidence.
- App assignment path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with 400 before app lookup, and safe unknown app IDs still preserve the existing 404 behavior.
- Rejected malformed app-assignment path requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across encoded and decoded malformed IDs, and leave valid assignment metadata, dashboard entitlements, access-review evidence, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused app-assignment/dashboard route regression pass (`node --test --test-name-pattern "owner can update app assignment|app assignment rejects non-boolean|app assignment treats omitted enabled|app assignment rejects malformed metadata|app assignment rejects unknown roles|dashboard launcher source wiring covers every seeded login role app" test/api.test.js test/suite-routes.test.mjs test/suite-dashboard-sidebar-openability.test.mjs`, 8 pass, 0 fail, 0 cancelled); broader app-assignment/access/sidebar/finance-period suite pass (`node --test --test-name-pattern "app assignment|dashboard launcher|access review|suite route|sidebar opens|auditor-readonly|canonical app ids|role-based app entitlements|finance period guardrails|finance period close rejects|closed finance period blocks SRC export|closed finance period records failed workflow run and retries|posted HayHashvapah draft invoice creates|draft invoice posting rejects|closed finance period blocks posting|payment receipt marks|payment receipt rejects|closed finance period blocks payment|finance report query filters reject|SRC export rejects|bank transaction import rejects|Armenian bank transaction import reconciles" test/api.test.js test/auditor-readonly-coverage.test.js test/suite-routes.test.mjs test/suite-dashboard-sidebar-openability.test.mjs`, 31 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local line-numbered diff review found no issues; `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-app-assignment-finance-period-path-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 334 - Finance Bill Payment Path ID Guard
- Finance bill payment routes now block malformed supplier bill path IDs before bill lookup or payment work.
- Submitted finance bill IDs must be structurally safe before they can become AP payment rows, ledger entries, bill status changes, suite events, or audit evidence.
- Finance bill path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with 400 before bill lookup, and safe unknown bill IDs still preserve the existing 404 behavior.
- Rejected malformed finance bill payment path requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across encoded and decoded malformed IDs, and leave valid payment metadata, AP payment, ledger, status, suite-event, and audit behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/payables-endpoints.test.js` pass; focused bill-payment path regression pass (`node --test --test-name-pattern "bill payment rejects malformed metadata" test/payables-endpoints.test.js`, 1 pass, 0 fail, 0 cancelled); broader payables/finance suite pass (`node --test test/payables-endpoints.test.js test/payables-idempotency.test.js test/finance-rbac.test.js test/ledger-core.test.js test/accounting-payables.test.js`, 10 pass, 0 fail, 0 cancelled); sidebar openability proof pass after restoring Playwright Chromium (`node --test test/suite-dashboard-sidebar-openability.test.mjs`, 1 pass, 0 fail, 0 cancelled); `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-finance-bill-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 335 - Admin Evidence Path ID Guard
- Admin session revoke, audit-export detail, and tenant-backup restore-proof routes now block malformed admin evidence path IDs before session lookup, audit-export payload read, or restore-proof work.
- Submitted admin session, audit-export, and tenant-backup IDs must be structurally safe before they can become session revocations, audit-export payload reads, restore-proof packets, restore-proof audit events, or backup evidence.
- Admin session path IDs must be 24-character lowercase hex public session IDs; audit-export and tenant-backup path IDs must be lowercase alphanumeric/hyphen strings with their expected prefixes.
- Safe unknown admin evidence IDs still preserve existing 404 behavior, and valid admin sessions, audit exports, and tenant backups continue through governed review and restore-proof workflows.
- Rejected malformed admin evidence path requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across encoded and decoded malformed IDs, and leave valid session revoke metadata, audit-export payloads, restore-proof audit events, and backup evidence unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused admin path regression pass (`node --test --test-name-pattern "admin session revoke rejects malformed metadata|owner can create tamper-evident audit export packet|owner can create sanitized tenant backup and restore proof" test/api.test.js`, 3 pass, 0 fail, 0 cancelled); broader admin evidence suite pass (`node --test --test-name-pattern "admin session|audit export|admin evidence|tenant backup|access review|production readiness|global audit feed|owner can create an access review|owner can inspect and revoke" test/api.test.js`, 8 pass, 0 fail, 0 cancelled); Playwright Chromium restored after cache loss and sidebar openability proof pass (`node --test test/suite-dashboard-sidebar-openability.test.mjs`, 1 pass, 0 fail, 0 cancelled); `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-admin-evidence-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 336 - Customer 360 Path ID Guard
- Customer 360 reads now block malformed customer path IDs before customer lookup or cross-module graph aggregation.
- Submitted Customer 360 customer IDs must be structurally safe before they can drive CRM, finance, service, workflow, legal, privacy, advisory, timeline, or receivables graph reads.
- Customer 360 path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before graph reads through either the route guard or router rejection.
- Safe unknown Customer 360 IDs still preserve existing `404` behavior, and valid customers continue returning the integrated CRM, finance, service, automation, and legal source graph with existing role redaction.
- Rejected malformed Customer 360 path requests keep submitted path secrets out of error bodies and leave valid Customer 360 graph reads, support redaction, timeline evidence, and downstream advisory behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused Customer 360 path/redaction regression pass (`node --test --test-name-pattern "customer 360 joins CRM, finance, service, automation, and legal sources|support customer 360 redacts" test/api.test.js`, 2 pass, 0 fail, 0 cancelled); broader Customer 360 graph suite pass (`node --test --test-name-pattern "customer 360|advisory|legal answer|legal VAT question|personal-data consent|privacy request|receivables aging|collection promise|workflow dry-run|ticket summaries|customer brief|deal risk" test/api.test.js`, 24 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local line-numbered diff review found no issues; `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-customer-360-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 337 - Workflow Rule Path ID Guard
- Workflow rule versions, state, rollback, dry-run, and test-event routes now block malformed rule path IDs before rule lookup or workflow evidence work.
- Submitted workflow rule IDs must be structurally safe before they can become rule-version reads, enabled-state changes, rollback versions, dry-run rows, test-event rows, suite events, or audit evidence.
- Workflow rule path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before workflow-rule side effects through either the route guard or router rejection.
- Safe unknown workflow rule IDs still preserve existing `404` behavior, and valid workflow rules continue through governed versions, state, rollback, dry-run, and test-event workflows.
- Rejected malformed workflow rule path requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across encoded and decoded malformed IDs, and leave valid workflow rule versioning, dry-run, test-event, suite-event, audit, and Customer 360 timeline behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused workflow-rule path/state regression pass (`node --test --test-name-pattern "workflow rule state and rollback reject malformed metadata|owner can pause and re-enable workflow rule|owner can rollback workflow rule|workflow dry-run previews|workflow dry-run rejects|workflow test-event validates|workflow test-event rejects|workflow list query filters" test/api.test.js`, 8 pass, 0 fail, 0 cancelled); broader workflow/API graph suite pass (`node --test --test-name-pattern "workflow|approval decision|dry-run|test-event|collection task records|approved overdue-invoice workflow|closed finance period records failed workflow run|customer 360|suite event API" test/api.test.js`, 35 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local line-numbered diff review found no issues; `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-workflow-rule-path-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 338 - Integration Connector Route Key Guard
- Integration connector configure and health-check routes now normalize connector path keys once at the route boundary before connector lookup, mutation, health evidence, or response reload work.
- Submitted connector keys must be structurally safe before they can become connector config writes, health-check rows, suite events, audit evidence, or connector response reloads.
- Integration connector keys must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before connector side effects through either the route guard or router rejection.
- Safe unknown connector keys still preserve existing `404` behavior, and valid connectors continue through governed configure, health-check, readiness, evidence, backup, app-assignment, and dashboard workflows.
- Rejected malformed connector route requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across encoded and decoded malformed keys, and leave valid connector config, health-check, backup, app assignment, and dashboard behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused connector route-key regression pass (`node --test --test-name-pattern "owner can configure integration connector contracts|integration connector rejects malformed path keys|integration connector rejects unknown owner roles|integration connector rejects invalid status and environment|integration connector rejects malformed status and environment|integration connector rejects malformed scopes|integration connector rejects unsafe evidence text|integration connector rejects malformed secrets|integration connector rejects malformed endpoint URL values|integration connector sanitizes legacy malformed array fields|integration connector pins legacy scalar fields|integration connector rejects credentialed endpoint URLs" test/api.test.js`, 12 pass, 0 fail, 0 cancelled); broader connector/evidence suite pass (`node --test --test-name-pattern "integration connector|webhook endpoint|webhook delivery|tenant backup|audit export|access review|app assignment|dashboard launcher|suite route" test/api.test.js test/suite-routes.test.mjs test/suite-dashboard-sidebar-openability.test.mjs`, 33 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local line-numbered diff review found no issues; `git diff --check` pass; full `npm test` pass (508 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-integration-connector-route-key-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 339 - Webhook Delivery Route ID Guard
- Webhook delivery retry routes now normalize delivery path IDs once at the route boundary before delivery lookup or retry dispatch.
- Submitted webhook delivery IDs must be structurally safe before they can become retry attempts, delivery status changes, response evidence, outbound HTTP calls, or retry audit evidence.
- Webhook delivery path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before retry side effects through either the route guard or router rejection.
- Safe unknown webhook delivery IDs still preserve existing `404` behavior, and valid failed deliveries continue through the governed manual retry flow.
- Rejected malformed webhook retry requests keep submitted path/body secrets out of error bodies, preserve the failed delivery's original status and attempt count, and leave valid endpoint creation, webhook delivery, quote acceptance, invoice-paid, connector, backup, app-assignment, and dashboard behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused webhook retry regression pass (`node --test --test-name-pattern "failed webhook delivery can be retried manually|invoice paid webhook is delivered only for first payment receipt|quote acceptance delivers signed quote and deal webhooks|webhook endpoint rejects credentialed URLs|webhook endpoint preserves explicit disabled toggle|webhook endpoint rejects non-boolean enabled values|webhook endpoint rejects malformed text and event values" test/api.test.js`, 7 pass, 0 fail, 0 cancelled); broader connector/webhook/admin route suite pass (`node --test --test-name-pattern "integration connector|webhook endpoint|webhook delivery|tenant backup|audit export|access review|app assignment|dashboard launcher|suite route|quote acceptance delivers" test/api.test.js test/suite-routes.test.mjs test/suite-dashboard-sidebar-openability.test.mjs`, 34 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local line-numbered diff review found no issues; `git diff --check` pass; full `npm test` pass (514 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-webhook-delivery-route-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 340 - Forms Definition Route ID Guard
- Forms definition detail and patch routes now normalize form path IDs once at the route boundary before form lookup, submission reads, or definition update work.
- Submitted form IDs must be structurally safe before they can become submission-detail reads, definition updates, public form submissions, CRM lead evidence, suite events, or audit evidence.
- Forms definition path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before form side effects through either the route guard or router rejection.
- Safe unknown form IDs still preserve existing `404` behavior, and valid Forms definition, submission, public-page, and public-submit workflows continue unchanged.
- Rejected malformed Forms route requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across encoded and decoded malformed IDs, and leave valid form definition updates, public form pages, public submissions, CRM lead creation, service open endpoints, and public-route behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/forms.test.js && node --check test/forms-public-page.test.js` pass; focused Forms route regression pass (`node --test --test-name-pattern "forms: rejects malformed metadata|forms: definition CRUD|forms isolation|forms-public-page: draft|forms-public-page: a published form renders|forms-public-page: writer-authored" test/forms.test.js test/forms-public-page.test.js`, 5 pass, 0 fail, 0 cancelled); broader Forms/public-route suite pass (`node --test test/forms.test.js test/forms-public-page.test.js test/service-cases.test.js test/open-endpoints.test.js`, 18 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local line-numbered diff review found no issues; `git diff --check` pass; full `npm test` pass (520 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-forms-route-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 341 - Service Case Route ID Guard
- Service Desk reply, escalation, resolution, and patch routes now normalize case path IDs once at the route boundary before case lookup or mutation work.
- Submitted service case IDs must be structurally safe before they can become support replies, escalation rows, resolution rows, case updates, suite events, audit evidence, or Customer 360 timeline evidence.
- Service case path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and encoded or overlong route segments fail before service side effects through either the route guard or router rejection.
- Safe unknown service case IDs still preserve existing `404` behavior, and valid Service Desk console, create, reply, escalation, resolution, patch, People-HR, payroll, and tax workflows continue unchanged.
- Rejected malformed Service Desk route requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior across encoded and decoded malformed IDs, and leave valid service case metadata, support messages, escalation/resolution evidence, suite events, audit events, People-HR payroll, and tax behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js && node --check test/service-cases.test.js` pass; focused service route regression pass (`node --test --test-name-pattern "service case mutations reject malformed metadata|service console exposes customers|PATCH cannot de-escalate|service-cases isolation" test/api.test.js test/service-cases.test.js`, 3 pass, 0 fail, 0 cancelled); broader service/API/People/payroll suite pass (`node --test test/api.test.js test/service-cases.test.js test/people-hr.test.js test/payroll-endpoints.test.js test/payroll-employee-fk.test.js test/payroll.test.js test/tax-rate-versioning.test.js`, 248 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local line-numbered diff review found no issues; `git diff --check` pass; full `npm test` pass (526 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-service-route-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 342 - Sovereign Legal KB Build and Embedding Pipeline
- The Armenian legal RAG now has a local `buildLawsDb` pipeline that converts raw `.txt` and `.md` law sources into installable `law_chunks` SQLite rows.
- Legal text is chunked by Armenian or Latin article markers, keeping preambles and article bodies separate so Copilot grounding can cite specific articles such as VAT Article 63.
- Chunk IDs are content-addressed and idempotent, allowing repeated ingestion of the same law source without duplicate rows while preserving the `server/rag.js` schema contract.
- `scripts/ingest-laws.js` reads a law-source directory offline, derives law titles from filenames, writes the destination `laws.sqlite`, and leaves embeddings empty for sovereign BM25 retrieval by default.
- `scripts/ingest-laws.js --embed` runs the optional local embedding pass through the loopback-safe embedder, fills only NULL embedding rows, and keeps the KB usable if some or all embedding attempts fail.
- `server/lawEmbedIngest.js` serializes Float32 vectors into the BLOB shape already consumed by `server/rag.js`, skips already-embedded rows on rerun, and leaves failed rows NULL so hybrid search can fall back to BM25.
- The source separator used for content hashing is stored as escaped `\\0` text in `server/lawIngest.js`, avoiding literal NUL bytes in the JavaScript source while preserving the hash input semantics.
- Verification for the checkpoint: `node --check server/lawIngest.js && node --check server/lawEmbedIngest.js && node --check server/rag.js && node --check scripts/ingest-laws.js && node --check test/law-ingest.test.js && node --check test/law-ingest-build.test.js && node --check test/law-embed.test.js && node --check test/rag.test.js` pass; focused legal/RAG ingest + embedding suite pass (`node --test test/law-ingest.test.js test/law-ingest-build.test.js test/law-embed.test.js test/rag.test.js test/legal-search.test.js test/legal-grounding.test.js`, 24 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local diff review found the imported source file had literal NUL separators, now normalized to escaped `\\0` separators; full `npm test` pass (536 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-law-ingest-build-regression-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 343 - Workflow Finance Route ID Guard
- Workflow-run retry, draft-invoice posting, bank-transaction reconciliation, and invoice payment routes now normalize path IDs once at the route boundary before lookup or mutation work.
- Submitted workflow and finance path IDs must be structurally safe before they can become retry attempts, invoice postings, bank reconciliations, payment receipts, ledger entries, suite events, audit evidence, or Customer 360 timeline evidence.
- Workflow run, draft invoice, invoice, and bank transaction path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and safe unknown IDs still preserve existing `404` behavior.
- Rejected malformed workflow/finance route requests keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior, and leave valid workflow retry, draft invoice posting, bank transaction reconciliation, payment receipt, ledger, event, audit, and period-lock behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused workflow/finance path regression pass (`node --test --test-name-pattern "workflow approval decision rejects malformed metadata|closed finance period records failed workflow run and retries|draft invoice posting rejects malformed metadata|payment receipt rejects malformed metadata|bank transaction import rejects malformed metadata" test/api.test.js`, 5 pass, 0 fail, 0 cancelled); broader workflow/finance regression pass (`node --test --test-name-pattern "workflow|draft invoice posting rejects|payment receipt rejects|bank transaction import rejects|finance period guardrails|closed finance period|SRC export|Armenian bank transaction import reconciles|posted HayHashvapah draft invoice creates|payment receipt marks" test/api.test.js`, 40 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local diff review found no issues; `git diff --check` pass; full `npm test` pass (536 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-workflow-finance-route-id-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 344 - Workflow Approval Route ID Guard
- Workflow approval decision and execution routes now normalize approval path IDs at the route boundary before decision-body parsing, approval lookup, execution, suite-event, or audit work.
- Submitted workflow approval IDs must be structurally safe before they can approve or execute governed workflow actions.
- Workflow approval path IDs must be lowercase alphanumeric/hyphen strings; unsafe route-reachable characters are rejected with `400`, and safe unknown IDs still preserve existing `404` behavior.
- Rejected malformed approval routes keep submitted path/body secrets out of error bodies, preserve no-side-effect behavior, and leave valid approval decisions, workflow execution, audit, and Customer 360 timeline behavior unchanged.
- Verification for the checkpoint: `node --check server/app.js && node --check test/api.test.js` pass; focused workflow approval route regression pass (`node --test --test-name-pattern "workflow approval decision rejects malformed metadata" test/api.test.js`, 1 pass, 0 fail, 0 cancelled); broader workflow/API regression pass (`node --test --test-name-pattern "workflow approval decision rejects malformed metadata|owner approval decision updates workflow queue|approved service reply workflow sends|approved overdue-invoice workflow executes|closed finance period records failed workflow run and retries|workflow dry-run|workflow test-event|workflow list query filters|workflow rule state and rollback" test/api.test.js`, 11 pass, 0 fail, 0 cancelled); full verification is covered by Slice 346.

### Slice 345 - Legal Ingest Article Marker Guard
- Legal KB ingestion now detects OCR-corrupted Armenian article headings through an offset-preserving homoglyph shadow while preserving the original stored legal text bytes.
- Genuine Latin `Article N` source splitting remains on the original text path, keeping English/Latin-marked legal sources article-aware without mutating content.
- The homoglyph pass preserves string length so article offsets map back to the original source text and chunk bodies remain byte-for-byte faithful to the ingested law source.
- Verification for the checkpoint: `node --check server/lawIngest.js && node --check test/law-ingest.test.js && node --check test/law-ingest-homoglyph.test.js` pass; focused legal/RAG ingest suite pass (`node --test test/law-ingest.test.js test/law-ingest-homoglyph.test.js test/law-ingest-build.test.js test/law-embed.test.js test/rag.test.js test/legal-search.test.js test/legal-grounding.test.js`, 28 pass, 0 fail, 0 cancelled); full verification is covered by Slice 346.

### Slice 346 - Native Legal PDF Ingest
- Legal KB ingestion now accepts `.pdf` law sources alongside `.txt` and `.md` sources.
- PDF text extraction shells out to the local `pdftotext` binary with UTF-8, no page-break markers, stdout capture, and a bounded buffer instead of adding a heavy in-process PDF dependency.
- Missing `pdftotext` is treated as a typed unavailable state: PDFs are skipped with a warning while plain-text and Markdown law sources continue ingesting normally.
- The PDF reader is dependency-injected so the extraction, missing-binary, non-zero-exit, title derivation, and CLI skip behavior are covered without requiring a real PDF binary in tests.
- Verification for the checkpoint: `node --check server/pdfText.js && node --check scripts/ingest-laws.js && node --check test/pdf-text.test.js && node --check server/lawIngest.js && node --check test/law-ingest.test.js && node --check test/law-ingest-homoglyph.test.js` pass; focused PDF/legal/RAG ingest suite pass (`node --test test/pdf-text.test.js test/law-ingest.test.js test/law-ingest-homoglyph.test.js test/law-ingest-build.test.js test/law-embed.test.js test/rag.test.js test/legal-search.test.js test/legal-grounding.test.js`, 35 pass, 0 fail, 0 cancelled); `git diff --check` pass; capped full `npm test` pass (547 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-native-pdf-ingest-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 347 - PDF Availability Probe Hardening
- `isPdftotextAvailable` now fails closed when the `pdftotext -v` probe returns any spawn error, not only `ENOENT`.
- Non-zero `pdftotext -v` probe exits are treated as unavailable, so blocked or unrunnable binaries stay on the legal PDF skip path instead of failing later during extraction.
- The PDF text regression test covers present, missing, blocked, and failed-probe availability states while preserving the existing distinction between unavailable binaries and real extraction failures.
- Verification for the checkpoint: `node --check server/pdfText.js && node --check test/pdf-text.test.js && node --check scripts/ingest-laws.js` pass; focused PDF text suite pass (`node --test test/pdf-text.test.js`, 7 pass, 0 fail, 0 cancelled); `git diff --check` pass; capped full `npm test` pass (547 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-pdf-availability-probe-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 348 - PDF Extractor Unavailable Skip Hardening
- Legal KB source reading now recognizes `PdftotextUnavailableError` thrown during extraction and reports the canonical `pdftotext-unavailable` skip reason.
- The CLI keeps the same install-guidance path whether `pdftotext` is unavailable during the preflight probe or becomes unavailable before a specific PDF extraction.
- The PDF text regression test covers extractor-level unavailable failures so legal PDF ingestion continues skipping affected PDFs without losing the typed unavailable signal.
- Verification for the checkpoint: `node --check scripts/ingest-laws.js && node --check test/pdf-text.test.js && node --check server/pdfText.js` pass; focused PDF text suite pass (`node --test test/pdf-text.test.js`, 8 pass, 0 fail, 0 cancelled); broader legal/RAG ingest suite pass (`node --test test/pdf-text.test.js test/law-ingest.test.js test/law-ingest-homoglyph.test.js test/law-ingest-build.test.js test/law-embed.test.js test/rag.test.js test/legal-search.test.js test/legal-grounding.test.js`, 36 pass, 0 fail, 0 cancelled); `git diff --check` pass; capped full `npm test` pass (548 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-pdf-extractor-unavailable-skip-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 349 - PDF Extraction Spawn Unavailable Hardening
- `extractPdfText` now maps missing or blocked `pdftotext` extraction spawn errors (`ENOENT`, `EACCES`, `EPERM`) to `PdftotextUnavailableError`.
- Late binary availability or permission changes after the preflight probe stay on the same typed legal-PDF skip path and preserve CLI install guidance.
- Non-zero `pdftotext` exits remain real extraction failures, so malformed PDFs still surface parse errors instead of being misclassified as unavailable tooling.
- Verification for the checkpoint: `node --check server/pdfText.js && node --check test/pdf-text.test.js && node --check scripts/ingest-laws.js` pass; focused PDF text suite pass (`node --test test/pdf-text.test.js`, 9 pass, 0 fail, 0 cancelled); broader legal/RAG ingest suite pass (`node --test test/pdf-text.test.js test/law-ingest.test.js test/law-ingest-homoglyph.test.js test/law-ingest-build.test.js test/law-embed.test.js test/rag.test.js test/legal-search.test.js test/legal-grounding.test.js`, 37 pass, 0 fail, 0 cancelled); `git diff --check` pass; capped full `npm test` pass (549 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-pdf-extraction-spawn-unavailable-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 350 - Legal Source Regular-File Guard
- Legal KB source reading now checks extension-matched entries are regular files before `.txt`/`.md` reads or `.pdf` extraction.
- Extension-named directories, such as `Archive.pdf` or `Notes.md`, are skipped with a `not-a-file` reason instead of crashing ingestion or invoking `pdftotext` on a directory.
- The source-reader regression covers mixed regular files and extension-named directories so valid law files still ingest while non-file entries are reported and ignored.
- Verification for the checkpoint: `node --check scripts/ingest-laws.js && node --check test/pdf-text.test.js && node --check server/pdfText.js` pass; focused PDF/source-reader suite pass (`node --test test/pdf-text.test.js`, 10 pass, 0 fail, 0 cancelled); broader legal/RAG ingest suite pass (`node --test test/pdf-text.test.js test/law-ingest.test.js test/law-ingest-homoglyph.test.js test/law-ingest-build.test.js test/law-embed.test.js test/rag.test.js test/legal-search.test.js test/legal-grounding.test.js`, 38 pass, 0 fail, 0 cancelled); `git diff --check` pass; capped full `npm test` pass (550 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-law-source-regular-file-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 351 - Legal Source Symlink Guard
- Legal KB source reading now checks extension-matched entries are not symlinks before `.txt`/`.md` reads or `.pdf` extraction.
- Extension-named symlinks, such as `Linked.pdf`, are skipped with a `symlink` reason instead of following linked source paths or invoking `pdftotext` on symlink targets.
- The source-reader regression covers symlinked law-source entries so valid regular law files still ingest while linked entries are reported and ignored.
- Verification for the checkpoint: `node --check scripts/ingest-laws.js && node --check test/pdf-text.test.js && node --check server/pdfText.js` pass; focused PDF/source-reader suite pass (`node --test test/pdf-text.test.js`, 11 pass, 0 fail, 0 cancelled); broader legal/RAG ingest suite pass (`node --test test/pdf-text.test.js test/law-ingest.test.js test/law-ingest-homoglyph.test.js test/law-ingest-build.test.js test/law-embed.test.js test/rag.test.js test/legal-search.test.js test/legal-grounding.test.js`, 39 pass, 0 fail, 0 cancelled); read-only subagent review unavailable because the agent thread limit was reached; local diff review found no issues; `git diff --check` pass; capped full `npm test` pass (551 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-law-source-symlink-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 352 - Legal Source Hidden-File Guard
- Legal KB source reading now skips dot-prefixed extension-matched entries before `.txt`/`.md` reads or `.pdf` extraction.
- AppleDouble sidecars such as `._Tax.pdf` and hidden draft files such as `.Draft.md` are reported with a `hidden-file` skip reason instead of becoming legal KB sources.
- The source-reader regression covers hidden law-source sidecars so valid visible regular law files still ingest while hidden entries are reported and ignored.
- Verification for the checkpoint: `node --check scripts/ingest-laws.js && node --check test/pdf-text.test.js && node --check server/pdfText.js` pass; focused PDF/source-reader suite pass (`node --test test/pdf-text.test.js`, 12 pass, 0 fail, 0 cancelled); broader legal/RAG ingest suite pass (`node --test test/pdf-text.test.js test/law-ingest.test.js test/law-ingest-homoglyph.test.js test/law-ingest-build.test.js test/law-embed.test.js test/rag.test.js test/legal-search.test.js test/legal-grounding.test.js`, 40 pass, 0 fail, 0 cancelled); local diff review found no issues; `git diff --check` pass; capped full `npm test` pass (552 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-law-source-hidden-file-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 353 - Legal Source Text-Read Guard
- Legal KB source reading now skips unreadable `.txt` and `.md` law-source files with a `read-failed` reason instead of aborting the whole source read.
- The ingest CLI reports skipped source files generically, so text-read failures, hidden files, symlinks, non-files, and unavailable PDFs share the same source-skip reporting path.
- The source-reader regression covers a failed text read beside a valid Armenian text source so readable source files still ingest while the bad text source is reported and ignored.
- Verification for the checkpoint: `node --check scripts/ingest-laws.js && node --check test/pdf-text.test.js && node --check server/pdfText.js` pass; focused PDF/source-reader suite pass (`node --test test/pdf-text.test.js`, 13 pass, 0 fail, 0 cancelled); broader legal/RAG ingest suite pass (`node --test test/pdf-text.test.js test/law-ingest.test.js test/law-ingest-homoglyph.test.js test/law-ingest-build.test.js test/law-embed.test.js test/rag.test.js test/legal-search.test.js test/legal-grounding.test.js`, 41 pass, 0 fail, 0 cancelled); local diff review found no issues; `git diff --check` pass; capped full `npm test` pass (553 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-law-source-text-read-guard-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 354 - Catalog Product Master Spine
- The suite now has tenant-scoped `catalog_categories` and `catalog_items` tables as the first ERP catalog master-data spine after the ERP comparison plan.
- Seed data creates Armenian service-package and hardware catalog anchors for clinic retention, salon inbox setup, tourism booking workflows, and POS barcode scanners.
- Authenticated `/api/catalog/categories` and `/api/catalog/items` endpoints expose read access to operating roles while limiting catalog writes to Owner/Admin/Operator/Salesperson.
- Catalog item writes validate SKU, category, item type, status, currency, price/cost, stock tracking, lot tracking, VAT mode, fiscal receipt metadata, and route IDs before mutation or audit evidence.
- CRM quote lines can now reference active catalog items, resolving catalog description, price, SKU/name, VAT mode, and fiscal receipt requirements into stored quote-line evidence.
- Catalog-backed CRM quote totals aggregate VAT per line, preserving standard inclusive VAT behavior while keeping exempt and zero-rated catalog lines out of the VAT bucket.
- Catalog seed rows keep the existing demo IDs while deriving tenant-specific seed IDs for non-demo organizations, preventing fixed product-master IDs from colliding across tenants.
- Tenant backups now include `catalog_categories` and `catalog_items`, keeping product master data in the existing backup/restore evidence scope.
- Verification for the checkpoint: `node --check server/db.js`, `node --check server/app.js`, and `node --check test/catalog.test.js` pass; focused catalog suite pass (`node --test test/catalog.test.js`, 5 pass, 0 fail, 0 cancelled); broader API/catalog/public quote suite pass (`node --test test/api.test.js test/catalog.test.js test/public-quote-ratelimit.test.js`, 247 pass, 0 fail, 0 cancelled); full `npm test` pass (579 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-kernel-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 355 - Inventory Stock Ledger Spine
- The suite now has tenant-scoped `stock_locations`, `stock_quants`, and `stock_moves` tables as the first ERP-parity inventory ledger spine after the catalog master.
- Seed data creates internal warehouse and dispatch-staging locations plus supplier, customer, inventory-adjustment, and scrap virtual endpoints for Armenian operating flows.
- Opening inventory seeds 12 POS barcode scanners into the demo main warehouse from the catalog item master, while non-demo organizations receive only the location scaffold and no fake stock moves or quants.
- Authenticated `/api/inventory/locations`, `/api/inventory/stock`, and `/api/inventory/moves` endpoints expose stock ledger reads to Owner/Admin/Operator/Accountant/Auditor while rejecting Support/Salesperson reads.
- `/api/inventory/moves` posts governed inbound, outbound, receipt, delivery, adjustment, transfer, and scrap moves for stock-tracked active catalog items, with writes limited to Owner/Admin/Operator/Accountant.
- Stock move posting validates item IDs, location IDs, move type, integer quantity/cost, safe evidence text, active locations, internal transfer rules, and source availability before transaction side effects.
- Internal-source moves derive their unit cost from source stock average cost, so transfer, delivery, and scrap valuation cannot be overwritten by caller-supplied `unitCost`; supplied cost remains available for receipt/positive adjustment valuation.
- Internal stock locations update on-hand quants; supplier, customer, inventory-adjustment, and scrap locations remain virtual ledger endpoints visible on posted move evidence without inflating internal availability.
- Posted stock moves emit `inventory.stock_move.posted` suite and audit events with metadata-only evidence, and tenant backups now include stock locations, quants, and moves with parent stock locations serialized before child locations.
- Verification for the checkpoint: `node --check server/db.js`, `node --check server/app.js`, `node --check test/inventory.test.js`, and `node --check test/auditor-readonly-coverage.test.js` pass; focused inventory/auditor suite pass (`node --test --test-concurrency=1 test/inventory.test.js test/auditor-readonly-coverage.test.js`, 6 pass, 0 fail, 0 cancelled); impacted catalog/inventory/auditor suite pass (`node --test --test-concurrency=1 test/catalog.test.js test/inventory.test.js test/auditor-readonly-coverage.test.js`, 11 pass, 0 fail, 0 cancelled); read-only re-review approved valuation, backup-order, and non-demo seed fixes; full `npm test` pass (583 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-inventory-stock-ledger-spine-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 356 - HayHashvapah E-Invoice XML Builder Engine
- The suite now has a pure local `server/einvoice.js` export helper for HayHashvapah e-invoice XML preparation.
- The builder supports multi-line invoices, buyer/supplier ՀՎՀՀ tax IDs, whole-dram AMD rounding, per-line VAT calculation, explicit VAT overrides for exempt or zero-rated lines, and XML escaping for free-text descriptions.
- The export namespace stays `urn:hayhashvapah:einvoice:1` and the output is deliberately framed as an offline mapper toward the official SRC e-invoice XSD path, not live SRC submission or certificate handling.
- `eInvoiceTotals` provides reusable integer-dram totals for net, VAT, and total amounts across invoice lines.
- Verification for the checkpoint: `node --check server/einvoice.js && node --check test/einvoice.test.js` pass; focused e-invoice suite pass (`node --test --test-concurrency=1 test/einvoice.test.js`, 7 pass, 0 fail, 0 cancelled); full `npm test` pass (583 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-inventory-stock-ledger-spine-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 357 - Armenian VAT Return Computation Engine
- The suite now has a pure local `server/vatReturn.js` computation helper for Armenian VAT-return period figures.
- `computeVatReturn` calculates output VAT, recoverable input VAT, taxable sales base, taxable purchases base, net VAT position, payable amount, and carried-forward credit.
- VAT line normalization uses whole-dram AMD rounding and supports explicit `vatAmount` overrides for exempt, zero-rated, or corrected source lines.
- Non-recoverable purchases remain in the taxable purchase base while being excluded from recoverable input VAT.
- The engine deliberately computes RA VAT figures only; mapping those figures onto official SRC VAT-return form line numbers remains a separate form-spec task.
- Verification for the checkpoint: `node --check server/vatReturn.js && node --check test/vat-return.test.js` pass; focused VAT-return suite pass (`node --test --test-concurrency=1 test/vat-return.test.js`, 6 pass, 0 fail, 0 cancelled); full `npm test` pass (583 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-inventory-stock-ledger-spine-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 358 - VAT Return API Spine
- The suite now exposes the pure Armenian VAT return engine through a posted-ledger read endpoint at `GET /api/finance/vat-return`.
- The read endpoint supports both all-period and period-filtered VAT summaries, preserving `/api/finance/vat-report` all-period semantics while returning taxable sales, taxable purchases, output VAT, input VAT, net position, payable amount, and carried credit.
- Tenant-scoped `finance_vat_returns` records now persist immutable accountant-review VAT return packets with payload checksum, period key, legal source, totals, note, source key, creator, and timestamp.
- `POST /api/finance/vat-returns` is gated to Owner/Admin/Accountant finance operators, requires an open finance period and Accountant-reviewed VAT legal source, and is idempotent by period.
- `GET /api/finance/vat-returns` uses the existing finance evidence policy: Owner/Admin/Accountant/Auditor can review full payload/checksum/source-key evidence, while unsupported authenticated roles receive redacted packet summaries.
- Prepared VAT return packets emit `finance.vat_return.created` suite/audit evidence and are included in tenant backup scope.
- The auditor read-only regression now covers VAT return packet creation, while focused VAT packet tests cover malformed metadata no-side-effect behavior, unauthorized writers, reviewed-source prerequisite, closed-period blocking, role redaction, backup inclusion, and payroll exclusion from VAT bases.
- Verification for the checkpoint: syntax checks passed for touched server/test files; focused VAT/API/auditor verification passed (`node --test --test-concurrency=1 test/finance-reports.test.js test/vat-return-api.test.js test/auditor-readonly-coverage.test.js`, 8 pass, 0 fail, 0 cancelled); read-only subagent review found and the current tree covers the omitted-period VAT-return regression; final full `TMPDIR=/tmp/a1-suite-test-tmp npm test` pass (606 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-vat-return-api-spine-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 358 - VAT Return API Spine
- The VAT return engine is now exposed through authenticated posted-ledger APIs: `GET /api/finance/vat-return` returns all-period or period-filtered Armenian VAT figures from posted ledger rows.
- Governed VAT return evidence packets now live in the tenant-scoped `finance_vat_returns` table and are included in tenant backup/restore payloads.
- `POST /api/finance/vat-returns` creates an idempotent period packet only for finance operators, only while the finance period is open, and only after the VAT legal source has Accountant professional review.
- VAT packets capture organization, period, reviewed legal source, source ledger inputs, output/input VAT, taxable sales/purchases, net, payable, carried credit, checksum, note, and accountant-review disclaimer evidence.
- `GET /api/finance/vat-returns` lists packets with the same evidence redaction contract as SRC exports: Owner/Admin/Accountant/Auditor can inspect payload/checksum/source-key, while unsupported roles receive stable redacted summaries.
- `/api/suite` now carries `vatReturns` beside `srcExports`, preserving suite-level redaction for finance evidence packets.
- Auditor read-only coverage now explicitly proves Auditors can read VAT return packets but cannot prepare them.
- Verification for the checkpoint: syntax checks pass for `server/app.js`, `server/db.js`, `test/api.test.js`, `test/vat-return-api.test.js`, `test/auditor-readonly-coverage.test.js`, and `test/finance-reports.test.js`; focused VAT/API/auditor suite pass (`node --test test/finance-reports.test.js test/vat-return.test.js test/vat-return-api.test.js test/auditor-readonly-coverage.test.js`, 14 pass, 0 fail, 0 cancelled); focused SRC/report/redaction suite pass (`node --test --test-name-pattern "VAT return|SRC export|finance report query filters|evidence packet list endpoints hide payloads" test/api.test.js`, 6 pass, 0 fail, 0 cancelled); broader impacted suite pass (`node --test test/api.test.js test/finance-reports.test.js test/vat-return-api.test.js test/vat-return.test.js test/auditor-readonly-coverage.test.js test/accounting.test.js test/ledger.test.js test/einvoice.test.js test/vat-rate-versioning.test.js`, 271 pass, 0 fail, 0 cancelled); after restoring the missing local Playwright Chromium cache with `npx playwright install chromium`, full `npm test` pass (606 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-vat-return-api-spine-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 359 - E-Invoice Official Field Alignment
- The HayHashvapah e-invoice XML builder now emits official SRC-facing fields for transaction type and creation date while preserving the existing local export namespace.
- Supplier evidence now includes the VAT-payer registration number (`VatId`) and address fields.
- Buyer evidence now supports passport identification when an individual buyer has no ՀՎՀՀ tax ID.
- Line evidence now carries unit price, excise amount, and environmental fee; line and document totals include excise and environmental fee alongside net and VAT.
- The export remains an offline structured mapper toward the customer's SRC desktop/XSD workflow, not live SRC submission or certificate handling.
- Verification for the checkpoint: `node --check server/einvoice.js && node --check test/einvoice.test.js && node --test test/einvoice.test.js` pass (12 pass, 0 fail, 0 cancelled); final all-merged verification is covered by Slice 361.

### Slice 360 - Official SRC VAT Return Form Lines
- `server/vatReturn.js` now exports `vatReturnForm()` beside `computeVatReturn`, preserving the existing engine contract while adding official form-line mapping.
- VAT output is mapped to lines 7, 9, 12, 13, and 16 for standard 20%, 16.67% imputed, zero-rated, exempt, and total credit evidence.
- Recoverable input VAT is split between import and domestic acquisition buckets on lines 17 and 18, then rolled into line 21.
- Net period position is mapped to line 23 as payable versus recoverable credit.
- `IMPUTED_VAT_RATE` is exposed for the 16.67% VAT-inclusive form bucket.
- Verification for the checkpoint: `node --check server/vatReturn.js && node --check test/vat-return.test.js && node --check test/vat-return-api.test.js && node --test test/vat-return.test.js test/vat-return-api.test.js test/finance-reports.test.js` pass (17 pass, 0 fail, 0 cancelled); final all-merged verification is covered by Slice 361.

### Slice 361 - Full RA Chart of Accounts
- The Armenian localization kernel now ships a generated `server/armeniaChartOfAccounts.data.js` full official chart with 623 accounts across classes 1-9.
- Account classes now cover management-accounting and off-balance-sheet classes in addition to assets, liabilities, equity, income, and expenses.
- Chart helpers load the generated data module and keep type/class/normal-balance invariants testable across the full chart.
- The local double-entry ledger posting model remains unchanged; existing operational ledger accounts and finance flows continue to pass against the expanded localization chart.
- Verification for the checkpoint: `node --check server/armeniaChartOfAccounts.js && node --check server/armeniaChartOfAccounts.data.js && node --check test/armenia-chart-of-accounts.test.js && node --test test/armenia-chart-of-accounts.test.js test/localization.test.js test/accounting.test.js test/ledger.test.js` pass (32 pass, 0 fail, 0 cancelled); broader all-merged impacted suite pass (`node --test test/api.test.js test/finance-reports.test.js test/vat-return-api.test.js test/vat-return.test.js test/einvoice.test.js test/armenia-chart-of-accounts.test.js test/localization.test.js test/accounting.test.js test/ledger.test.js test/auditor-readonly-coverage.test.js test/tax-rate-versioning.test.js test/vat-rate-versioning.test.js`, 299 pass, 0 fail, 0 cancelled); full `npm test` pass (617 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-track-b-merged-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`).

### Slice 362 - Offline RA Localization CLI
- The suite now has an offline `scripts/ra-localization.js` CLI over the Armenian fiscal-localization engines, with no server and no network requirement.
- The CLI exposes taxpayer ՀՎՀՀ validation, Armenian phone normalization, marz lookup, chart-of-accounts lookup, payroll calculation, VAT-return JSON calculation, and e-invoice XML generation.
- Structured commands emit JSON, e-invoice emits XML, and invalid CLI inputs exit non-zero with usage guidance.
- The CLI lazily loads each engine so newly landed RA localization modules can be used independently.
- Verification for the checkpoint: `node --check scripts/ra-localization.js && node --check test/ra-localization-cli.test.js && node --test test/ra-localization-cli.test.js` pass (6 pass, 0 fail, 0 cancelled); final all-merged verification is covered by Slice 365.

### Slice 363 - Official RA Chart Ledger And UI Integration
- The active HayHashvapah ledger now seeds and refreshes tenant `ledger_accounts` from the generated 623-account official RA chart instead of the old 11-account subset.
- New expense and supplier-bill input VAT postings now debit official account `226` (`Հաշվանցման (փոխհատուցման) ենթակա անուղղակի հարկեր`) while VAT reports and VAT-return source extraction still read legacy local `526` rows for older databases.
- Authenticated `GET /api/finance/chart-of-accounts` exposes the official chart source metadata, account classes, and account rows to the Finance workspace.
- The Finance UI now renders an RA chart-of-accounts panel with class counts, official source metadata, and operating account anchors, and the opening-balance form derives its choices from the supported official operating accounts (`221/226/251/252/521/524/525`) instead of offering every official asset/liability account.
- Regression coverage proves full official chart seeding, `226` VAT posting, legacy `526` read compatibility, chart endpoint auth/shape, VAT-return packet extraction, and opening-balance compatibility, including rejection/skipping for unsupported contra-asset accounts such as `112`.
- Verification for the checkpoint: syntax checks pass for `server/ledger.js`, `server/app.js`, `test/ledger.test.js`, `test/ledger-endpoints.test.js`, and `test/vat-return-api.test.js`; focused official-chart ledger/API suite pass (`node --test --test-concurrency=1 test/ledger.test.js test/ledger-endpoints.test.js test/finance-reports.test.js test/vat-return-api.test.js test/armenia-chart-of-accounts.test.js test/opening-balances.test.js test/opening-balances-endpoints.test.js`, 39 pass, 0 fail, 0 cancelled); later focused all-merged RA finance/localization/payroll suite pass (`node --test test/ra-localization-cli.test.js test/armenia-payroll.test.js test/armenia-chart-of-accounts.test.js test/localization.test.js test/ledger.test.js test/ledger-endpoints.test.js test/vat-return-api.test.js test/finance-reports.test.js`, 52 pass, 0 fail, 0 cancelled); final opening-balance whitelist verification is covered by Slice 365.

### Slice 364 - Armenian Payroll Rules Engine
- The suite now ships `server/armeniaPayroll.js`, a pure local Armenian payroll calculation engine for 2026 gross-to-net previews.
- The engine applies flat 20% personal income tax, funded-pension tiers (`5%` below the threshold, `10% - 25,000` above it, capped at `87,500`), and the post-December-2025 stamp-duty brackets.
- Payroll deductions are calculated from gross and rounded to whole dram through the existing accounting kernel.
- The new Dec-2025 health-insurance contribution remains intentionally excluded until the offset against stamp duty is pinned to primary law.
- Regression coverage proves tax, pension, stamp-duty, tier-boundary continuity, pension cap, zero-gross behavior, and explicit health-insurance omission.
- Verification for the checkpoint: `node --check server/armeniaPayroll.js && node --check test/armenia-payroll.test.js && node --test test/armenia-payroll.test.js` pass (8 pass, 0 fail, 0 cancelled); focused all-merged RA finance/localization/payroll suite pass (`node --test test/ra-localization-cli.test.js test/armenia-payroll.test.js test/armenia-chart-of-accounts.test.js test/localization.test.js test/ledger.test.js test/ledger-endpoints.test.js test/vat-return-api.test.js test/finance-reports.test.js`, 52 pass, 0 fail, 0 cancelled); final all-merged verification is covered by Slice 365.

### Slice 365 - Authenticated RA Localization Routes And Opening-Balance Account Whitelist
- `server/localizationRoutes.js` now registers authenticated, stateless RA localization endpoints for the full chart of accounts, single account code lookups, ՀՎՀՀ validation, Armenian regions, phone normalization, VAT-return computation, payroll computation, and e-invoice XML building.
- The localization route module keeps the `server/app.js` footprint small and lazy-loads optional fiscal engines so route registration stays robust as engines land independently.
- The official chart endpoint now also returns `openingBalanceAccountCodes`, making the Finance UI use the backend-supported account whitelist instead of inferring from every official asset/liability account.
- Opening-balance posting is limited to supported operating accounts (`221/226/251/252/521/524/525`) until account-level contra/normal-balance semantics are added for the broader official chart.
- Backend guards reject unsupported official contra-asset codes such as `112`, and the ledger silently skips them when called at the posting layer.
- The Finance opening-balance form now renders exactly the supported official account anchors and no longer offers `112`, `331`, or arbitrary asset/liability chart rows.
- Verification for the checkpoint: localization route suite pass (`node --check server/localizationRoutes.js && node --check test/localization-routes.test.js && node --check server/app.js && node --test test/localization-routes.test.js`, 5 pass, 0 fail, 0 cancelled); focused opening-balance/chart suite pass (`node --check server/app.js && node --check server/ledger.js && node --check test/opening-balances.test.js && node --check test/opening-balances-endpoints.test.js && node --check test/ledger-endpoints.test.js && node --test test/opening-balances.test.js test/opening-balances-endpoints.test.js test/ledger-endpoints.test.js test/ledger.test.js`, 27 pass, 0 fail, 0 cancelled); `git diff --check` pass; full `npm test` pass (640 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-opening-balance-whitelist-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`); browser smoke on `http://127.0.0.1:4193/app/finance` renders `RA chart of accounts`, `623 accounts`, exactly the seven supported opening-balance accounts, no `112`/`331` options, and no unexpected console errors after the expected pre-login `401`.

### Slice 366 - RA Localization Route Metadata Guard
- Authenticated RA localization routes now reject malformed query values before fiscal engines run, keeping chart-of-accounts, ՀՎՀՀ, and Armenian phone helpers limited to bounded safe text.
- VAT-return and e-invoice helper routes now require plain bounded JSON bodies without control characters, oversized strings, deep nesting, unsupported objects, or secret-bearing multiline evidence.
- Payroll preview now validates `gross` as a finite non-negative AMD amount before calling the Armenian payroll engine, returning a sanitized 400 instead of allowing object coercion or engine-level surprises.
- Route guard errors use the stable `INVALID_LOCALIZATION_METADATA` code and do not echo submitted secret tokens in HTTP error responses.
- The Finance workspace now includes an `RA localization tools` panel over the same authenticated helper routes for ՀՎՀՀ validation, Armenian phone normalization, payroll preview, and VAT form-line preview.
- Scoped responsive CSS keeps the new localization controls stable inside the existing dense finance workspace without changing unrelated inline-form layouts.
- Verification for the checkpoint: focused route guard verification pass (`node --check server/localizationRoutes.js && node --check test/localization-routes.test.js && node --test test/localization-routes.test.js`, 7 pass, 0 fail, 0 cancelled); broader fiscal/localization suite pass (`node --test test/localization-routes.test.js test/localization.test.js test/armenia-chart-of-accounts.test.js test/armenia-payroll.test.js test/armenia-phone.test.js test/armenia-regions.test.js test/vat-return.test.js test/einvoice.test.js test/ra-localization-cli.test.js`, 72 pass, 0 fail, 0 cancelled); `git diff --check` pass; full `npm test` pass (642 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-localization-route-guards-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`); browser smoke on `http://127.0.0.1:4194/app/finance` renders `RA localization tools`, exercises ՀՎՀՀ/phone/payroll/VAT buttons, captures `/tmp/a1-suite-localization-route-guards-finance.png`, and reports no unexpected console errors after the expected pre-login `401`.

### Slice 367 - Finance E-Invoice XML Preview
- The SPA request layer now has an `apiText()` helper for authenticated XML/text responses, preserving the existing JSON `api()` behavior for normal endpoints.
- The Finance `RA localization tools` panel now includes an e-invoice XML preview workflow against `/api/finance/einvoice/build`, closing the UI handoff gap documented by `docs/LOCALIZATION_API.md`.
- The preview captures invoice number, buyer ՀՎՀՀ, and line net amount, then builds a local preview invoice with transaction type, issue/creation dates, supplier evidence, buyer evidence, and a 20% VAT line.
- The panel renders the generated XML excerpt and total amount in a bounded wrapped preview area so long XML cannot overflow the dense finance workspace.
- `docs/LOCALIZATION_API.md` now states that the e-invoice build route returns XML text rather than JSON.
- Verification for the checkpoint: focused route guard verification pass (`node --check server/localizationRoutes.js && node --check test/localization-routes.test.js && node --test test/localization-routes.test.js`, 7 pass, 0 fail, 0 cancelled); broader fiscal/localization suite pass (`node --test test/localization-routes.test.js test/localization.test.js test/armenia-chart-of-accounts.test.js test/armenia-payroll.test.js test/armenia-phone.test.js test/armenia-regions.test.js test/vat-return.test.js test/einvoice.test.js test/ra-localization-cli.test.js`, 72 pass, 0 fail, 0 cancelled); `git diff --check` pass; full `npm test` pass (642 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-finance-einvoice-preview-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`); browser smoke on `http://127.0.0.1:4195/app/finance` renders `RA localization tools`, exercises ՀՎՀՀ/phone/payroll/VAT/e-invoice buttons, captures `/tmp/a1-suite-finance-einvoice-preview.png`, and reports no unexpected console errors after the expected pre-login `401`.

### Slice 368 - Finance Opening-Balance Side Rules
- Opening balances now use configured account-side rules for the supported official RA balance-sheet anchors instead of treating every whitelisted account by broad account type alone.
- The supported opening-balance set now includes depreciable fixed assets (`111`, debit) and accumulated depreciation (`112`, credit), while still excluding unsupported chart rows and direct opening-equity account `331`.
- `GET /api/finance/chart-of-accounts` now returns `openingBalanceAccounts` with `{ code, name, type, side }` metadata beside `openingBalanceAccountCodes`, so UI callers can submit the reviewed side contract explicitly.
- Opening-balance POST validation accepts omitted side defaults or matching explicit `debit`/`credit` values, rejects malformed or mismatched side evidence before persistence, and keeps rejected side payloads out of ledger rows and audit evidence.
- The ledger posts credit-side contra balances against opening equity, so `111` less `112` accumulated depreciation keeps trial balance, balance sheet, and opening equity balanced.
- The Finance opening-balance form and posted-balance list now render Armenian side labels and submit the configured side for pending lines.
- Verification for the checkpoint: focused opening-balance/ledger verification pass (`node --check server/ledger.js && node --check server/app.js && node --check test/opening-balances.test.js && node --check test/opening-balances-endpoints.test.js && node --check test/ledger-endpoints.test.js && node --test test/opening-balances.test.js test/opening-balances-endpoints.test.js test/ledger-endpoints.test.js test/ledger.test.js`, 29 pass, 0 fail, 0 cancelled); broader finance/localization suite pass (`node --test --test-concurrency=1 test/ledger.test.js test/ledger-endpoints.test.js test/finance-reports.test.js test/vat-return-api.test.js test/armenia-chart-of-accounts.test.js test/opening-balances.test.js test/opening-balances-endpoints.test.js`, 42 pass, 0 fail, 0 cancelled); read-only code-review subagent found no issues; `git diff --check` pass; full `npm test` pass (644 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning after clearing npm cache space; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-opening-balance-side-rules-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`); browser smoke on `http://127.0.0.1:4196/app/finance` verifies `111 · Մաշվող հիմնական միջոցներ · Դեբետ`, `112 · Հիմնական միջոցների մաշվածություն · Կրեդիտ`, posts `1,000,000 AMD` in `111` less `(200,000 AMD)` accumulated depreciation, shows `800,000 AMD equity`, captures `/tmp/a1-suite-opening-balance-side-rules.png`, and reports no browser console errors.

### Slice 369 - Official Localization Source Metadata And Payroll Health Insurance
- The VAT-return engine now carries official SRC VAT/excise return source metadata (`N 298-Ն`, arlis.am, active incorporated source) alongside the computed line values.
- `vatReturnForm()` exposes reusable line definitions for lines `7`, `9`, `12`, `13`, `16`, `17`, `18`, `21`, and `23`, including Armenian labels, form sections, and expected fields.
- The authenticated VAT compute route and offline `ra-localization vat-return` CLI now return `formSource` and `formLineDefinitions` beside the existing `summary` and `form` payloads.
- The Finance `RA localization tools` panel renders official VAT form-line labels and a bounded source row linking the `N 298-Ն` source host, while preserving the existing dense Finance layout.
- The Armenian payroll localization kernel now includes the Dec-2025 universal health-insurance employee withholding: `0` below `200,001 AMD`, `4,800 AMD` through `500,000 AMD`, and `10,800 AMD` from `500,001 AMD`.
- `computePayroll()` now returns `healthInsurance` and includes it in `totalWithholdings`/`net`, so an `800,000 AMD` preview returns `10,800 AMD` health insurance, `226,800 AMD` total withholdings, and `573,200 AMD` net salary.
- `docs/LOCALIZATION_API.md` now documents the expanded payroll response contract, the official VAT form metadata payload, and the official Arlis/SRC source anchors used by the localization slice.
- Regression coverage proves payroll health-insurance boundaries, API/CLI propagation, VAT form source metadata, VAT line definitions, and rendered Finance preview output.
- Verification for the checkpoint: syntax checks pass for `server/armeniaPayroll.js`, `test/armenia-payroll.test.js`, and `test/localization-routes.test.js`; focused payroll/routes/CLI tests pass (`node --test test/armenia-payroll.test.js`, 8 pass; `node --test test/localization-routes.test.js`, 7 pass; `node --test test/ra-localization-cli.test.js`, 7 pass); broader fiscal/localization suite pass (`node --test test/localization-routes.test.js test/localization.test.js test/armenia-chart-of-accounts.test.js test/armenia-payroll.test.js test/armenia-phone.test.js test/armenia-regions.test.js test/vat-return.test.js test/einvoice.test.js test/ra-localization-cli.test.js`, 74 pass, 0 fail, 0 cancelled); `git diff --check` pass; `npm run build:ui` pass with the existing Vite large-chunk warning; first full `npm test` run reaches 646 pass / 1 environment failure because the local Playwright Chromium cache was missing, then `npx playwright install chromium` and `node --test test/suite-dashboard-sidebar-openability.test.mjs` pass; final full `npm test` pass (647 pass, 0 fail, 0 cancelled); `ARMOSPHERA_ONE_DB=/tmp/a1-suite-localization-source-payroll-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=10, kpis=4`); browser smoke on `http://127.0.0.1:4197/app/finance` verifies `health insurance 10,800 AMD`, `stamp duty 1,000 AMD`, `net salary 573,200 AMD`, source row `N 298-Ն · arlis.am`, captures `/tmp/a1-suite-localization-source-payroll.png`, and reports only the known optional-section `loadOr` fallback warning.

### Slice 370 - Catalog & Inventory Sidebar Workspace
- Catalog & Inventory is now a canonical Suite app id and route (`inventory`, `/app/inventory`) between Projects and People in the sidebar.
- Fresh seeds and existing database repair insert the Inventory launcher app, preserve priority ordering, and assign it to `Owner`, `Admin`, `Operator`, and `Accountant`.
- The Inventory workspace renders catalog/stock metrics, product master rows, internal stock balances, recent stock moves, and a role-gated stock move form.
- The stock move form now computes valid default source/destination locations for transfer, receipt, delivery, adjustment, and scrap using the same warehouse-location model as the backend.
- The app-assignment route rejects attempts to enable Inventory for roles that cannot load both catalog and inventory APIs, and stale hand-edited Inventory assignments cannot authorize sidebar access.
- Regression coverage proves seeded/repaired Inventory app ordering, role entitlements, stale assignment filtering, dashboard sidebar openability, catalog item reads, stock ledger reads, stock move posting, and unsafe inventory metadata rejection.
- Verification for the checkpoint: focused assignment regression pass (`node --test --test-name-pattern "app assignment rejects inventory|owner can update app assignment|app assignment rejects malformed metadata" test/api.test.js`, 3 pass, 0 fail, 0 cancelled); focused route/catalog/inventory/sidebar suite pass (`node --test test/suite-routes.test.mjs test/suite-dashboard-sidebar-openability.test.mjs test/catalog.test.js test/inventory.test.js`, 19 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `git diff --check` pass; full `npm test` pass (648 pass, 0 fail, 0 cancelled); `ARMOSPHERA_ONE_DB=/tmp/a1-suite-inventory-ui-smoke-final-2.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=11, kpis=4`); browser smoke on `http://127.0.0.1:4198/app/inventory` verifies the active Inventory sidebar route, default transfer path `WH/STOCK -> WH/OUT`, submitted Scrap path `WH/STOCK -> SCRAP`, stock row `11 available`, and no browser console warnings/errors.

### Slice 371 - Purchase RFQ/PO To Stock Receipt And Vendor Bill
- Tenant-scoped `purchase_orders` and `purchase_order_lines` now provide the first procurement spine over the shipped Catalog, Inventory, and Finance modules.
- Purchase is now a first-class Suite sidebar product at `/app/purchase`, seeded/repaired after Catalog & Inventory and assigned only to Owner/Admin/Operator/Accountant roles while preserving Auditor read-only API access.
- The Purchase workspace loads purchase orders plus stock-tracked catalog items, renders RFQ/confirmed/received/billed counts, open procurement value, order rows, and role-gated Create RFQ / Confirm / Receive / Bill controls.
- Purchase RFQs capture supplier name, optional Armenian ՀՎՀՀ, PO number, order/expected dates, notes, product-linked lines, whole-AMD subtotal/VAT/total values, creator evidence, and status progression.
- Purchase role gates allow Owner/Admin/Operator/Accountant to create/confirm/receive POs, allow Auditor read-only listing, and require finance-operator access for PO-to-bill conversion.
- PO confirmation is explicit, PO receipt creates canonical stock receipt moves into `WH/STOCK`, and received lines store the resulting stock-move evidence.
- PO billing reuses the existing HayHashvapah vendor-bill engine, so AP totals, due dates, payables reporting, finance audit, and finance-period locks stay consistent with manual supplier bills.
- Confirm/receive/bill retries are idempotent after progression, duplicate PO numbers return a sanitized `409`, malformed body/path metadata is rejected before mutation, and unsupported roles cannot write purchase evidence.
- Trigger-backed regressions prove confirm/receipt/bill failures roll back status, stock moves, ledger rows, AP bills, suite events, and audit rows instead of creating idempotency gaps.
- Tenant backups now include purchase orders, purchase lines, bills, and bill payments so procurement evidence restores with stock-move and AP-bill links.
- The ERP comparison plan now marks the core purchase spine and first Purchase sidebar workspace as shipped while keeping vendor master/pricelists, partial receipts, landed costs, tenders, and procurement analytics in the roadmap.
- Verification for the checkpoint: focused API/sidebar role pass (`node --test --test-name-pattern "owner login loads organization|existing suite databases receive repaired|expanded Armenia SaaS roles|dashboard launcher source wiring|app assignment rejects operations apps" test/api.test.js`, 5 pass, 0 fail); focused purchase/auditor pass (`node --test test/purchase.test.js test/auditor-readonly-coverage.test.js`, 4 pass, 0 fail); sidebar openability pass (`node --test test/suite-dashboard-sidebar-openability.test.mjs`); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-purchase-ui-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); browser proof against the local app created/confirmed/received/billed `UI-RFQ-230529`; full `npm test` pass (697 pass, 0 fail).

### Slice 372 - Purchase Vendor Master And Pricelist Defaults
- Tenant-scoped `purchase_vendors` and `purchase_vendor_prices` now provide the first vendor master and vendor-cost layer for Purchase.
- Fresh and repaired databases create vendor/pricelist tables, add `purchase_orders.vendor_id`, add `purchase_order_lines.vendor_price_id`, index vendor lookups, seed a demo Armenian vendor, and include vendor/pricelist tables in tenant backups.
- Purchase APIs expose role-gated vendor listing and vendor creation; invalid price windows, unknown catalog items, malformed metadata, and duplicate vendor names fail before durable mutation.
- RFQ creation can link to an active vendor, inherit supplier name/ՀՎՀՀ, choose the best active vendor price by item, quantity, and order date, and persist the selected vendor-price evidence on the purchase line.
- The Purchase workspace loads vendors alongside orders/catalog items, shows vendor count, lets operators select a vendor or enter a manual supplier, and leaves blank unit-cost fields to backend vendor-pricelist resolution instead of bypassing validity rules.
- Verification for the checkpoint: focused purchase/API/sidebar run pass (`node --test --test-concurrency=4 --test-timeout=60000 test/purchase.test.js test/api.test.js test/auditor-readonly-coverage.test.js test/suite-routes.test.mjs test/suite-dashboard-sidebar-openability.test.mjs`, 249 pass, 0 fail); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-purchase-vendor-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); browser proof on `/app/purchase` selected `Yerevan Hardware Supply`, inherited ՀՎՀՀ `01234568`, used the `60000` vendor-price default, and created/confirmed/received/billed `UI-VENDOR-290329` at `72,000 AMD`; `git diff --check` pass; full `npm test` pass (700 pass, 0 fail).

### Slice 373 - Purchase Partial Receipts And Receipt Evidence
- Tenant-scoped `purchase_receipts` now preserves each purchase receipt's PO, PO line, stock move, quantity, received date, reference, creator, and backup evidence.
- Purchase receipt processing supports partial line receipts, marks orders `partial` until all ordered quantities are received, and computes order/line received, remaining, and receipt-count totals for API/UI consumers.
- Explicit receipt references are idempotent, duplicate line receipt requests are rejected before mutation, over-receipts return a sanitized conflict, and billing remains blocked until the PO is fully received.
- Each partial receipt still creates a canonical stock receipt move into `WH/STOCK`; final receipt completion keeps the same AP bill path through the HayHashvapah vendor-bill engine and period-lock checks.
- The Purchase workspace now shows partial order counts, received `X/Y` progress, a quantity input for the next receivable line, and per-receipt references so operators can receive a PO in multiple warehouse arrivals.
- Tenant backups now include `purchase_receipts`, so restored procurement evidence can reconcile order lines, stock moves, and AP billing history.
- Verification for the checkpoint: syntax checks pass for `server/app.js`, `server/db.js`, and `test/purchase.test.js`; `git diff --check` pass; focused purchase regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/purchase.test.js`, 6 pass, 0 fail); broader purchase/API/auditor/sidebar regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/purchase.test.js test/api.test.js test/auditor-readonly-coverage.test.js test/suite-routes.test.mjs test/suite-dashboard-sidebar-openability.test.mjs`, 251 pass, 0 fail); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-purchase-partial-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); browser proof on `http://127.0.0.1:4218/app/purchase` created `UI-PARTIAL-877328`, showed partial `received 2/5`, completed to `received 5/5` through the quantity Receive control, billed the PO, captured `/tmp/a1-suite-purchase-partial-final.png`, and reported no console warnings/errors; full `npm test` pass (702 pass, 0 fail).

### Slice 374 - Purchase Analytics And Vendor 360
- Purchase now exposes tenant-scoped procurement analytics through `GET /api/purchase/analytics`, using the existing purchase reader role contract so Owner/Admin/Operator/Accountant/Auditor can inspect analytics while unsupported roles remain blocked.
- Analytics summarize order count, vendor count, active vendor count, open and billed procurement value, receipt progress, remaining quantity, vendor-priced line coverage, usable active vendor-price count, and active stock-tracked catalog item count.
- Price coverage now counts only currently usable active prices: active vendor, active price row, effective-date window, active stock-tracked catalog item, and tenant match are all required before an item contributes to active price or covered-item metrics.
- Receipt backlog now lists only confirmed or partial purchase orders with remaining quantity, so unconfirmed RFQs do not appear as warehouse receiving work.
- Vendor performance groups orders by linked vendor or manual supplier and reports order count, total/open/billed value, ordered/received/remaining quantities, vendor-priced line count, last order date, and receipt progress.
- The Purchase workspace now renders a `Procurement analytics` / `Vendor 360` panel with receipt progress, price coverage, remaining quantity, active price count, covered item count, top vendor rows, and receipt backlog rows.
- Regression coverage proves analytics RBAC, RFQ exclusion from receipt backlog and receipt progress, suspended/future/expired vendor prices excluded from usable coverage, partial receipt progress, backlog totals, Vendor 360 totals, and covered-item metrics.
- Verification for the checkpoint: syntax checks pass for `server/app.js` and `test/purchase.test.js`; focused purchase regression pass (`node --test test/purchase.test.js`, 7 pass, 0 fail); broader API/auditor/sidebar regression pass; `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-purchase-analytics-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); browser proof on `http://localhost:4220/app/purchase` created `UI-ANALYTICS-872696`, rendered the visible `Vendor 360` panel with `33% received`, `100%` price coverage, remaining quantity `2`, vendor performance for `Yerevan Hardware Supply`, partial backlog row `UI-ANALYTICS-872696`, and reported no console warnings/errors; full `npm test` pass (703 pass, 0 fail).

### Slice 375 - Purchase Returns To Supplier
- Purchase now persists tenant-scoped `purchase_returns` evidence for unbilled received stock returned to a supplier, including PO, PO line, stock move, quantity, returned date, reference, reason, creator, and backup scope.
- `POST /api/purchase/orders/:id/return` uses the existing purchase-writer role contract and safe metadata/path guards, while keeping finance-operator AP billing separate.
- Supplier returns post canonical inventory moves from `WH/STOCK` to `SUPPLIERS`, reduce net `received_quantity`, update order status back to `partial` or `confirmed`, and keep receipt/return evidence visible on order lines.
- Explicit return references are idempotent even after a full return reopens the order to `confirmed`; conflicting duplicate references, over-returns, unsupported states, and billed-order returns fail before mutation.
- Purchase analytics and Vendor 360 now expose `returnedQuantity`, so returned stock appears in the operating summary and vendor rows instead of only in hidden ledger evidence.
- The Purchase workspace now renders returned quantity in the analytics panel, shows `returned X` on order rows, and exposes a quantity-specific `Return` control beside Receive/Bill for returnable unbilled stock.
- Regression coverage proves partial and full supplier-return flows, stock reversal, idempotent full-return retry after status rollback, over-return guards, billed-return blocking, analytics returned quantity, backup inclusion, RBAC, malformed return metadata, and rollback on failed return insertion.
- Verification for the checkpoint: syntax checks pass for `server/app.js`, `server/db.js`, and `test/purchase.test.js`; `git diff --check` pass; focused purchase regression pass (`node --test test/purchase.test.js`, 8 pass, 0 fail); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-purchase-returns-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); browser proof on `http://127.0.0.1:4221/app/purchase` created `UI-RETURN-649393`, rendered the return stock move, `Vendor 360`, `75% received`, `RETURNED QTY 1`, remaining quantity `1`, vendor performance for `Yerevan Hardware Supply`, partial backlog row `UI-RETURN-649393`, and reported no console errors; read-only subagent review approved after the full-return idempotency fix; full `npm test` pass (716 pass, 0 fail).

### Slice 376 - RUB Kopeck S4 App VAT And Money Splitters
- The RUB kopeck migration now covers the app-level VAT and money splitter paths identified as S4 in `docs/RU_KOPECK_MIGRATION_RFC.md`.
- Project billing preview and bill-time convert gross major-unit hourly totals through the active locale money facade before splitting VAT, so RUB invoices store integer kopecks while AMD remains whole-dram identity.
- Workflow-created draft invoices now use the effective VAT rate instead of the stale `/1.2` split, store subtotal/VAT/total as locale minor units, and descale those values before posting to the locale-aware ledger.
- CRM custom quote lines convert submitted major-unit prices to stored minor units, and quote totals split each stored-minor line so `subtotal + vat === total` holds at the kopeck level.
- Purchase explicit unit costs, explicit stock move unit costs, and purchase VAT-on-net calculations now use shared minor-unit helpers, preserving vendor-price/default-cost integer semantics while allowing RUB user-entered kopecks.
- Regression coverage proves RU project billing stores kopecks while trial balance reports rubles, workflow draft invoices store RUB minor units at an effective 22% VAT rate, RU custom quotes keep kopecks per line, and existing catalog/purchase/AMD behavior remains intact.
- Verification for the checkpoint: syntax checks pass for `server/app.js`, `test/project-billing.test.js`, and `test/vat-rate-versioning.test.js`; focused project/VAT S4 suite pass (`node --test test/project-billing.test.js test/vat-rate-versioning.test.js`, 11 pass, 0 fail); adjacent catalog/purchase regression pass (`node --test test/catalog.test.js test/purchase.test.js`, 14 pass, 0 fail); `git diff --check` pass; full `npm test` pass (786 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-kopeck-s4-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`).

### Slice 377 - RUB Kopeck S5 App Money Input Validators
- The RUB kopeck migration now covers the app-level input validators identified as S5 in `docs/RU_KOPECK_MIGRATION_RFC.md`.
- A shared locale-aware money parser validates submitted money text/number shapes against the active currency subunit and converts stored app-table money values to integer minor units.
- Finance expense, bill, bill payment, payment receipt, bank import, opening-balance, payroll run/preview, People salary, CRM lead/deal value, collection promise, project hourly billing, catalog price, inventory unit-cost, purchase line, and vendor-price inputs no longer truncate RUB kopecks.
- Payroll and ledger boundaries descale stored minor-unit values back to major units before invoking existing payroll engines or ledger posting helpers, preventing 100x double-scaling while reports continue to display rubles.
- AM behavior remains guarded: zero-subunit integer-only validators still reject fractional money, while legacy AM validators that already rounded fractional major-unit inputs continue to round through the AMD money facade.
- Regression coverage proves RUB finance, operational, CRM/catalog/quote, payroll/People, bank, inventory, purchase, and invalid-overprecision paths store kopecks correctly, and opening-balance malformed AM fractional inputs remain rejected.
- Verification for the checkpoint: syntax checks pass for `server/app.js`, `test/kopeck-input-validators.test.js`, and `test/kopeck-s5-app-validators.test.js`; focused S5/opening-balance regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/opening-balances-endpoints.test.js test/kopeck-input-validators.test.js test/kopeck-s5-app-validators.test.js`, 12 pass, 0 fail); broader focused regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/kopeck-s5-app-validators.test.js test/payroll-endpoints.test.js test/catalog.test.js test/payables-endpoints.test.js test/ledger-ru-posting.test.js test/ledger-ru-payroll-contributions.test.js`, 30 pass, 0 fail); `git diff --check` pass; full `npm test` pass (793 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-kopeck-s5-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`).

### Slice 378 - RUB Kopeck S6 Active Currency Defaults
- The RUB kopeck migration now covers active currency defaults identified as S6 in `docs/RU_KOPECK_MIGRATION_RFC.md`.
- Fresh database seeding derives the demo organization's locale and currency from the active locale, so `A1_LOCALE=ru` creates `ru-RU`/`RUB` instead of stale `hy-AM`/`AMD`.
- The 15 reviewed `currency TEXT NOT NULL DEFAULT 'AMD'` schema defaults are now plain required `currency TEXT NOT NULL` columns, forcing seed/runtime callers to provide the tenant currency explicitly.
- Seeded deals, quotes, CRM leads, catalog items, vendor prices, workflow/suite event payloads, and marketing campaigns now use the organization currency instead of hardcoded AMD.
- Runtime inserts and response fallbacks in project billing, CRM lead conversion, quote creation, catalog item creation/update, purchase vendor prices/orders, finance expenses/bills/payments/bank transactions, collection promises, analytics money units, and pilot packets now use the active currency or source-row currency.
- Regression coverage proves fresh RU seed rows are RUB, fresh AM seed rows remain AMD, all reviewed schema currency columns have no SQL default, and omitted-currency runtime inserts inherit RUB across the touched API surfaces.
- Verification for the checkpoint: syntax checks pass for `server/app.js`, `server/db.js`, `test/kopeck-s6-active-currency-defaults.test.js`, and patched direct-insert tests; exact hardcoded-AMD scans in `server/app.js` and `server/db.js` return no matches; focused S6/kopeck/catalog/purchase/finance/project/docs regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/kopeck-s6-active-currency-defaults.test.js test/kopeck-input-validators.test.js test/kopeck-s5-app-validators.test.js test/project-billing.test.js test/catalog.test.js test/purchase.test.js test/finance-rbac.test.js test/ledger.test.js test/docs-export.test.js test/docs-sign.test.js test/service-cases-isolation.test.js test/forms-isolation.test.js test/projects.test.js test/people-hr.test.js`, 73 pass, 0 fail); `git diff --check` pass; full `npm test` pass (796 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-kopeck-s6-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`).

### Slice 379 - RUB Kopeck S7 RU Tax Rounding
- The RUB kopeck migration now covers RU tax whole-ruble rounding identified as S7 in `docs/RU_KOPECK_MIGRATION_RFC.md`.
- The vendored RU payroll engine now rounds НДФЛ and employer страховые взносы to whole rubles, including unified and SME contribution paths, instead of letting employer insurance retain kopecks through the storage rounder.
- Payroll gross, net, and employer cost still keep kopecks where the employee salary has kopecks; only the RU tax/contribution amounts use the tax-only whole-ruble rounding contract.
- Suite payroll preview/run APIs continue storing all returned money as integer minor units, so whole-ruble RU tax amounts are represented as kopecks without changing ledger or trial-balance display semantics.
- Regression coverage proves `100000.50 RUB` keeps salary kopecks while employer insurance stores as `3000000` kopecks, verifies the 50-kopeck round-up threshold for НДФЛ and страховые взносы, and checks payroll preview/run ledger rows plus trial-balance reporting for a rounded-up case.
- Verification for the checkpoint: syntax checks pass for the RU payroll engine and S7/S5/vendor tests; focused RU payroll/locale/kopeck regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/localization-ru-vendor-wiring.test.js test/locale-money-scale.test.js test/kopeck-s7-ru-tax-rounding.test.js test/kopeck-s5-app-validators.test.js test/payroll-endpoints.test.js test/ledger-ru-payroll-contributions.test.js`, 30 pass, 0 fail); `git diff --check` pass; full `npm test` pass (799 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-kopeck-s7-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`).

### Slice 380 - RUB Kopeck S8 Data Migration And Enablement
- The RUB kopeck migration now covers the final S8 defensive data migration and enablement checkpoint in `docs/RU_KOPECK_MIGRATION_RFC.md`.
- `server/db.js` now creates a `money_precision_migrations` marker table and applies the `rub-kopeck-minor-units-s8` migration exactly once after all seed and repair layers.
- The migration discovers tenant money columns by SQLite schema metadata, records per-table SHA-256 before/after checksums, and reports target columns, currencies, rows checked, and rows scaled.
- AMD remains a checksum-proven no-op: zero-subunit databases keep existing whole-dram integer rows unchanged and record equal before/after checksums.
- Legacy RUB whole-ruble rows scale by `100` into stored kopecks once, and repeated migration calls or database reopens preserve the same values and marker.
- Currency-bearing target rows must match `organizations.currency` before migration, so mixed per-row currency evidence fails before any marker is written.
- Fresh `A1_LOCALE=ru` seeds now finish with RUB demo money stored as kopecks behind the migration marker while AM seeds keep the existing AMD values.
- Regression coverage proves AMD no-op/idempotency, RUB one-time scaling, mixed-currency invariant rejection, and fresh RU seed enablement.
- Verification for the checkpoint: syntax checks pass for `server/db.js` and `test/kopeck-s8-data-migration.test.js`; focused S8 migration regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/kopeck-s8-data-migration.test.js`, 4 pass, 0 fail); wider kopeck/accounting regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/kopeck-s8-data-migration.test.js test/kopeck-s6-active-currency-defaults.test.js test/kopeck-s7-ru-tax-rounding.test.js test/kopeck-s5-app-validators.test.js test/kopeck-input-validators.test.js test/project-billing.test.js test/catalog.test.js test/purchase.test.js test/payroll-endpoints.test.js test/ledger-ru-posting.test.js test/ledger-ru-payroll-contributions.test.js test/vat-rate-versioning.test.js`, 57 pass, 0 fail); `git diff --check` pass; full `npm test` pass (803 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-kopeck-s8-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`).

### Slice 381 - Catalog Unit Of Measure Catalog
- Catalog now persists tenant-scoped `catalog_units_of_measure` rows with code, name, kind, precision, status, timestamps, and a tenant/code uniqueness contract.
- Fresh and repaired demo databases seed active `unit`, `package`, `hour`, `kg`, and `liter` units before catalog items are seeded or repaired.
- Existing distinct `catalog_items.unit_of_measure` values are backfilled as active custom UoMs during repair, so tenant-specific legacy unit codes can still be edited after the validator lands.
- Existing `catalog_items.unit_of_measure` remains the stable stored code, so the UoM catalog adds governance without forcing a product-master data migration.
- Catalog category/item APIs now return the UoM catalog alongside categories and items, giving UI consumers a governed source for product-unit choices.
- Catalog item create/update writes reject unknown or inactive unit codes before mutation, preserving the existing category and product metadata guards.
- Tenant backups now include `catalog_units_of_measure`, so restored tenants keep product-unit governance evidence with the product master.
- The Inventory product master now displays the item's unit code beside SKU, name, and category/type, making unit evidence visible to operators.
- Verification for the checkpoint: syntax checks pass for `server/db.js`, `server/app.js`, and `test/catalog.test.js`; focused catalog/purchase regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js test/purchase.test.js`, 15 pass, 0 fail); full `npm test` pass (804 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-uom-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`).

### Slice 382 - Catalog Variant Spine
- Catalog now persists tenant-scoped `catalog_item_variants` rows linked to parent catalog items, with SKU, name, parsed attributes, unit, price, cost, currency, status, and timestamps.
- Fresh and repaired databases seed scanner and clinic-package variants only when their parent seed item exists, preserving custom tenants that do not carry those demo parent products.
- Variant rows inherit the parent item's unit, list price, standard cost, and currency, so this slice adds SKU-level variant evidence without changing quote, inventory, or purchase parent-item contracts.
- Catalog item list/detail APIs now attach `variants` and `variantCount` to each item, with malformed stored attribute JSON downgraded to an empty object instead of leaking the wrong shape.
- Tenant backups now include `catalog_item_variants`, keeping variant SKU/attribute evidence portable with the product master.
- The Inventory product master now shows total variant count in the overview and per-item variant counts on catalog rows.
- Regression coverage proves seeded variant attachment, parsed attribute JSON, inherited variant pricing, detail endpoint variant visibility, and backup inclusion while existing catalog/purchase flows remain green.
- Verification for the checkpoint: syntax checks pass for `server/db.js`, `server/app.js`, and `test/catalog.test.js`; focused catalog/purchase regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js test/purchase.test.js`, 15 pass, 0 fail); full `npm test` pass (804 pass, 0 fail, 0 cancelled); `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-variant-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`).

### Slice 383 - Catalog Margin Evidence
- Catalog item API responses now compute `marginAmount` and `marginPercent` from stored list price and standard cost, keeping margin evidence derived instead of persisting stale duplicate columns.
- Catalog variant API responses carry the same margin evidence, so SKU-level variants inherit the parent item's commercial margin context alongside inherited unit, price, cost, and currency.
- Margin percent is reported as a two-decimal percentage and returns `null` when list price is zero, avoiding divide-by-zero or misleading percentage output.
- The Inventory product master now displays each catalog row's margin percentage beside price while preserving the existing dense product/stock workspace layout.
- Regression coverage proves seeded scanner parent and variant margin evidence while existing catalog/purchase flows remain green.
- Verification for the checkpoint: syntax checks pass for `server/app.js` and `test/catalog.test.js`; focused catalog/purchase regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js test/purchase.test.js`, 15 pass, 0 fail); broad affected API/service recovery run pass (`node --test --test-concurrency=1 --test-timeout=120000 test/api.test.js test/service-cases.test.js`, 235 pass, 0 fail, 0 cancelled) after an overloaded full-suite rerun cancelled unrelated long tests; `git diff --check` pass; `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-margin-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`).

### Slice 384 - Catalog Sales Pricelist Spine
- Catalog now persists tenant-scoped `catalog_price_lists` rows with code, name, customer segment, currency, status, optional validity windows, and timestamps.
- Catalog price-list item rows link sales prices to parent catalog items and optional catalog variants, carrying minimum quantity, list price, discount-percent placeholder, currency, status, and timestamps.
- Fresh and repaired databases seed an active `STANDARD-SALES` list in the tenant currency, with rows for active catalog items plus variant-level rows for active seeded variants.
- Catalog read payloads now expose `priceLists` beside categories, units, and items, and `/api/catalog/price-lists` provides a dedicated role-gated read endpoint under the existing catalog-reader contract.
- Tenant backups now include `catalog_price_lists` and `catalog_price_list_items`, keeping sales-pricing evidence portable with product master data.
- The Inventory product master overview consumes the catalog payload and shows price-list count beside category, variant, and location evidence.
- Regression coverage proves auth gating, reader-role access, standard pricelist seeding, variant-level price rows, dedicated endpoint parity with bundled catalog payloads, and tenant-backup inclusion while existing catalog/purchase flows remain green.
- Verification for the checkpoint: syntax checks pass for `server/db.js`, `server/app.js`, and `test/catalog.test.js`; focused catalog regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js`, 7 pass, 0 fail); `git diff --check` pass; `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-sales-pricelist-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `npm test` pass (804 pass, 0 fail, 0 cancelled).

### Slice 385 - Catalog Sales Discount Evidence
- Catalog price-list item API rows now derive `discountAmount` and `netPrice` from stored `list_price` and `discount_percent`, making discount evidence explicit without persisting duplicate calculated columns.
- Fresh and repaired databases seed a `LOYALTY-10` sales price list beside `STANDARD-SALES`, using the tenant currency and `customer_segment = loyalty`.
- The loyalty list carries 10% discount rows for active parent catalog items and active catalog variants, preserving the same parent/variant pricing evidence shape as the standard list.
- `/api/catalog/items` and `/api/catalog/price-lists` both expose the discounted price-list rows with parent product and variant evidence, while CRM quote pricing, inventory valuation, and purchase flows remain unchanged.
- Tenant backups include the discounted price-list rows through the existing `catalog_price_lists` and `catalog_price_list_items` backup scope.
- The Inventory product master overview now shows both total price-list count and discount-list count beside category, variant, and location evidence.
- Regression coverage proves standard zero-discount evidence, loyalty 10% discount amount/net price derivation, variant-level discount rows, reader-role access, dedicated endpoint parity, and backup inclusion while existing catalog/purchase flows remain green.
- Verification for the checkpoint: syntax checks pass for `server/db.js`, `server/app.js`, and `test/catalog.test.js`; focused catalog/purchase regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js test/purchase.test.js`, 15 pass, 0 fail); `git diff --check` pass; `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-sales-discount-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`).

### Slice 386 - Catalog Margin Rule Evidence
- Catalog now persists tenant-scoped `catalog_margin_rules` rows with code, name, scope, minimum margin percent, target margin percent, status, and timestamps.
- Fresh and repaired databases seed active `STOCKABLE-MIN-20` and `SERVICE-MIN-35` item-type margin rules before sales price lists are read.
- Catalog payloads expose `marginRules`, and `/api/catalog/margin-rules` provides a dedicated role-gated read endpoint under the existing catalog-reader contract.
- Sales price-list item API rows now derive net-price margin evidence after discount, including standard cost, margin amount, margin percent, matched rule code, minimum/target margin, and `marginStatus`.
- The seeded `LOYALTY-10` scanner row is flagged `below_minimum` against the stockable 20% rule, while the standard scanner row remains `ok`; CRM quote pricing, inventory valuation, and purchase costing remain unchanged.
- Tenant backups now include `catalog_margin_rules`, keeping margin-governance evidence portable with product master and price-list data.
- The Inventory product master overview now shows margin-rule count and below-minimum margin alert count beside category, variant, price-list, discount-list, and location evidence.
- Regression coverage proves seeded rules, dedicated endpoint parity, reader-role access, standard `ok` margin evidence, loyalty `below_minimum` evidence for parent and variant rows, and backup inclusion while existing catalog/purchase flows remain green.
- Verification for the checkpoint: syntax checks pass for `server/db.js`, `server/app.js`, and `test/catalog.test.js`; focused catalog/purchase/S8 regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js test/purchase.test.js test/kopeck-s8-data-migration.test.js`, 19 pass, 0 fail); `git diff --check` pass; `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-margin-rule-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `node --test --test-concurrency=4 --test-timeout=120000` pass (804 pass, 0 fail, 0 cancelled).

### Slice 387 - Catalog Price Resolution
- Catalog now exposes `GET /api/catalog/pricing/resolve` as a read-only effective-pricing endpoint under the existing catalog-reader role contract.
- The resolver accepts catalog item, optional variant, customer segment, and quantity query inputs, rejecting malformed IDs, control text, and invalid quantities before lookup.
- Active customer-segment price lists are preferred, while missing segments fall back to the standard sales price list so later quote/POS/portal callers have a deterministic price source.
- Resolved pricing returns the selected price list, item/variant evidence, minimum quantity, list price, discount amount, net price, standard cost, margin-rule evidence, and `marginStatus` in one payload.
- Variant-specific price rows are selected when available, with explicit `variantFallback` evidence reserved for future parent-row fallback cases.
- The resolver keeps CRM quote pricing, inventory valuation, purchase costing, POS, and portal flows unchanged until those modules deliberately consume it.
- Regression coverage proves unauthenticated/support rejection, owner/accountant access, standard and loyalty segment resolution, variant resolution, unknown-segment fallback to `STANDARD-SALES`, malformed query rejection, and unknown-item 404 behavior.
- Verification for the checkpoint: syntax checks pass for `server/app.js` and `test/catalog.test.js`; focused catalog/purchase/S8 regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js test/purchase.test.js test/kopeck-s8-data-migration.test.js`, 19 pass, 0 fail); `git diff --check` pass; `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-price-resolution-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `node --test --test-concurrency=4 --test-timeout=120000` pass (804 pass, 0 fail, 0 cancelled).

### Slice 388 - Catalog Quote Price Resolution
- CRM quote creation now consumes the catalog price resolver for catalog-backed lines that omit `unitPrice`, turning the read-only resolver into the default quote price source.
- Quote creation derives resolver customer-segment input from the customer profile, so segment price lists such as `LOYALTY-10` can price catalog lines while unmatched segments fall back to `STANDARD-SALES`.
- Explicit quote-line `unitPrice` values remain manual overrides, preserving custom sales quoting behavior for exceptions and negotiated prices.
- Tenant-created active catalog items without price-list rows still fall back to the item list price, preserving existing quote behavior for products added before price-list governance catches up.
- Free-text quote lines, VAT mode handling, inventory valuation, purchase costing, POS, and portal flows remain unchanged.
- Regression coverage proves standard price-list discount resolution, loyalty customer-segment resolution, explicit override preservation, active-item fallback without a price-list row, inactive-item rejection, and existing catalog quote VAT behavior.
- Verification for the checkpoint: syntax checks pass for `server/app.js` and `test/catalog.test.js`; focused catalog/purchase regression pass (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js test/purchase.test.js`, 15 pass, 0 fail); `git diff --check` pass; `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-quote-price-resolution-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `node --test --test-concurrency=4 --test-timeout=120000` pass (804 pass, 0 fail, 0 cancelled).

### Slice 389 - Catalog Quote Variant Lines
- CRM quote lines now persist nullable `catalog_item_variant_id` beside `catalog_item_id`, with startup migration and an index for existing tenant databases.
- Quote line reads expose `catalogItemVariantId`, `variantSku`, and `variantName` through the existing quote formatter, so public quote, workflow, and Customer 360 reads can carry SKU-level evidence without a separate API.
- Quote creation validates that submitted variants are active and belong to the submitted parent catalog item before any quote row is written.
- Variant-backed quote lines pass the variant ID into catalog price resolution, so customer-segment price lists such as `LOYALTY-10` can resolve variant-specific net pricing and default descriptions.
- Malformed variant IDs and parent/variant mismatches are rejected before persistence, while free-text quote lines and explicit quote-line price overrides remain unchanged.
- Inventory valuation, purchase costing, POS, and portal flows remain unchanged until they deliberately consume quote variant evidence.
- Regression coverage proves migration repair for legacy quote-line tables, variant-specific quote pricing, response and stored variant evidence, malformed variant metadata rejection, parent/variant mismatch rejection, and existing catalog quote behavior.
- Verification for the checkpoint: syntax checks pass for `server/db.js`, `server/app.js`, `test/api.test.js`, and `test/catalog.test.js`; affected API/catalog/S8 regression pass (`node --test --test-concurrency=4 --test-timeout=120000 test/api.test.js test/catalog.test.js test/kopeck-s8-data-migration.test.js`, 244 pass, 0 fail); `git diff --check` pass; `npm run build:ui` pass with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-quote-variants-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` pass (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `node --test --test-concurrency=4 --test-timeout=120000` pass (804 pass, 0 fail, 0 cancelled).

### Slice 390 - Catalog Quote Pricing Evidence
- CRM quote lines now persist catalog pricing evidence beside the resolved `unit_price`, including nullable `catalog_price_list_id`, price-list code, pricing source, customer segment, discount amount, and margin status.
- Startup repair adds those quote-line evidence columns plus an `idx_quote_lines_catalog_price_list` index for existing tenant databases, preserving legacy manual quote-line behavior.
- Quote line reads expose `pricingSource`, `catalogPriceListId`, `catalogPriceListCode`, `pricingCustomerSegment`, `discountAmount`, and `marginStatus` through the existing quote formatter, so public quote, workflow, and Customer 360 reads carry pricing provenance without a separate API.
- Catalog-resolved lines now store price-list evidence for `STANDARD-SALES` and `LOYALTY-10`, while tenant-created active catalog items without price-list rows are marked as catalog-item fallback evidence.
- Explicit quote-line unit-price overrides remain manual pricing with blank price-list evidence and zero discount, preserving negotiated quote behavior.
- Free-text quote lines, VAT mode handling, inventory valuation, purchase costing, POS, and portal flows remain unchanged until they deliberately consume pricing provenance.
- Regression coverage proves migration repair for legacy quote-line tables, standard and loyalty price-list evidence, discount and margin-status evidence, variant-line stored evidence, explicit manual override evidence, and existing catalog quote behavior.
- Verification for the checkpoint: syntax checks pass for `server/db.js`, `server/app.js`, `test/api.test.js`, and `test/catalog.test.js`; focused catalog regression passes (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js`, 7 pass, 0 fail); focused migration regression passes (`node --test --test-concurrency=4 --test-timeout=60000 --test-name-pattern="existing quote line tables receive catalog columns" test/api.test.js`, 1 pass, 0 fail); affected API/catalog/S8 regression passes (`node --test --test-concurrency=4 --test-timeout=120000 test/api.test.js test/catalog.test.js test/kopeck-s8-data-migration.test.js`, 244 pass, 0 fail); `git diff --check` passes; `npm run build:ui` passes with the existing Vite large-chunk warning; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-quote-pricing-evidence-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` passes (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `node --test --test-concurrency=4 --test-timeout=120000` passes (804 pass, 0 fail, 0 cancelled).

### Slice 391 - Catalog Quote Pricing Evidence UI
- CRM quote rows now render a compact summary plus catalog pricing evidence chips for quote lines that carry pricing provenance.
- Evidence chips identify the selected SKU/name and show price-list code or pricing source, customer segment, quantity x unit price, discount amount, and margin status from the existing quote-line fields.
- Below-minimum margin lines use warning styling, visible evidence is capped to the first three lines, and additional evidence is summarized with a `+N lines` marker.
- Responsive chip wrapping prevents long SKU, price-list, discount, and margin evidence from overflowing the CRM Quotes panel on mobile.
- This is a UI-only slice: quote APIs, resolver behavior, explicit manual overrides, free-text quote lines, finance draft-invoice creation, inventory valuation, purchase costing, POS, and portal flows remain unchanged.
- Verification for the checkpoint: `git diff --check` passes; `npm run build:ui` passes with the existing Vite large-chunk warning; browser proof on a catalog-backed quote shows `STANDARD-SALES`, `HW-BARCODE-SCANNER-USB`, `standard`, and `margin ok` in CRM on desktop `1280x720` and mobile `390x844` with no mobile overflow; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-quote-pricing-evidence-ui-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` passes (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `node --test --test-concurrency=4 --test-timeout=120000` passes (804 pass, 0 fail, 0 cancelled).

### Slice 392 - Catalog Quantity-Break Pricing Evidence
- Catalog sales price-list seeding now adds active `STANDARD-SALES` quantity-break rows for the POS barcode scanner parent and variants at `min_quantity = 5`.
- The break rows reuse the existing price-list item contract with 5% `discount_percent`, derived `discountAmount`, `netPrice`, margin rule evidence, and backup portability.
- The existing catalog pricing resolver now has seeded data that proves highest-eligible `minQuantity` selection: quantity-5 scanner pricing resolves to `80,750 AMD` net with `4,250 AMD` per-unit discount and `marginStatus = ok`.
- CRM quote creation consumes the same resolver result for catalog-backed quantity-5 quote lines, preserving the `STANDARD-SALES` price-list evidence and storing the per-unit break discount on the quote line.
- The Inventory overview now shows the count of quantity-break rows beside price-list, discount-list, margin-rule, and margin-alert evidence.
- Quote APIs, explicit manual overrides, loyalty pricing, free-text quote lines, finance draft-invoice creation, inventory valuation, purchase costing, POS, and portal flows remain otherwise unchanged.
- Verification for the checkpoint: focused catalog regression passes (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js`, 7 pass, 0 fail); `git diff --check` passes; `npm run build:ui` passes with the existing Vite large-chunk warning; browser proof at `http://127.0.0.1:4196/app/inventory` shows `3 quantity breaks` on desktop and mobile with no overflow; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-quantity-break-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` passes (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `node --test --test-concurrency=4 --test-timeout=120000` passes (804 pass, 0 fail, 0 cancelled).

### Slice 393 - Catalog Category Margin-Rule Evidence
- Catalog margin governance now matches category-scoped rules before item-type fallback rules, using the existing `catalog_margin_rules.scope_type` and `scope_value` contract.
- Fresh and repaired tenant databases seed active `HARDWARE-MIN-25` for the POS and device hardware category while preserving `STOCKABLE-MIN-20` and `SERVICE-MIN-35` as item-type defaults.
- Price-list item API rows now carry `categoryId` and `categoryName` evidence alongside SKU, variant, discount, and margin fields.
- Scanner price-list rows now use the category-specific `HARDWARE-MIN-25` rule; the quantity-5 scanner break remains `80,750 AMD` net with `4,250 AMD` per-unit discount but is flagged `below_minimum` against the 25% category minimum.
- CRM quote creation consumes the same stricter margin status for catalog-backed quantity-5 quote lines, preserving price-list and discount evidence.
- The Inventory overview now shows category-rule count beside price-list, discount-list, quantity-break, margin-rule, and margin-alert evidence.
- Quote APIs, explicit manual overrides, loyalty pricing, free-text quote lines, finance draft-invoice creation, inventory valuation, purchase costing, POS, and portal flows remain otherwise unchanged.
- Verification for the checkpoint: focused catalog regression passes (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js`, 7 pass, 0 fail); `git diff --check` passes; `npm run build:ui` passes with the existing Vite large-chunk warning; browser proof at `http://127.0.0.1:4197/app/inventory` shows `3 margin rules`, `1 category rule`, and `6 margin alerts` on desktop and mobile with no overflow; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-category-margin-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` passes (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `node --test --test-concurrency=4 --test-timeout=120000` passes (804 pass, 0 fail, 0 cancelled).

### Slice 394 - Catalog Quote Margin-Rule Evidence
- CRM quote lines now persist the matched catalog margin-rule provenance beside the existing price-list, discount, and margin-status evidence.
- Startup repair adds `margin_rule_code`, `margin_rule_minimum_percent`, and `margin_rule_target_percent` to existing `quote_lines` tables before quote-line indexes are used.
- Catalog-resolved quote lines expose `marginRuleCode`, `marginRuleMinimumPercent`, and `marginRuleTargetPercent` through the existing quote formatter for CRM, public quote, workflow, and Customer 360 reads.
- Service quote lines carry `SERVICE-MIN-35`, scanner quote lines carry `HARDWARE-MIN-25`, and catalog-backed quantity-5 scanner quotes keep the `below_minimum` status with its 25% minimum evidence.
- Explicit manual unit-price overrides and free-text quote lines keep blank/null margin-rule evidence, preserving negotiated quote behavior.
- CRM quote evidence chips now show the matched rule code and minimum percent, so operators see which rule produced a below-minimum warning.
- Quote pricing, finance draft-invoice creation, inventory valuation, purchase costing, POS, and portal flows remain otherwise unchanged.
- Verification for the checkpoint: focused catalog regression passes (`node --test --test-concurrency=4 --test-timeout=60000 test/catalog.test.js`, 7 pass, 0 fail); focused migration regression passes (`node --test --test-concurrency=4 --test-timeout=60000 --test-name-pattern="existing quote line tables receive catalog columns" test/api.test.js`, 1 pass, 0 fail); `git diff --check` passes; `npm run build:ui` passes with the existing Vite large-chunk warning; browser proof at `http://127.0.0.1:4198/app/crm` shows `HARDWARE-MIN-25 min 25%` and `below minimum` on desktop and mobile with no overflow; `ARMOSPHERA_ONE_DB=/tmp/a1-suite-catalog-quote-margin-rule-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke` passes (`smoke ok: Armosphera Demo Clinic, apps=12, kpis=4`); full `node --test --test-concurrency=4 --test-timeout=120000` passes (804 pass, 0 fail, 0 cancelled).
