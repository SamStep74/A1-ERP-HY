# A1 ERP-HY Project Status

> Snapshot of the first wave of work on A1-ERP-HY. See
> [docs/ERP_COMPARISON_IMPLEMENTATION_PLAN.md](ERP_COMPARISON_IMPLEMENTATION_PLAN.md)
> for the long-term roadmap (Phase 0–9).

## What was built in this first wave

### 1. Catalog-driven RBAC system

A complete, production-grade RBAC stack — the foundation of the entire
ERP. Files at `server/rbac/`:

| File | Purpose | Lines |
|---|---|---|
| `permissions.js` | 300+ permission keys across 18 categories with sensitivity tags | 459 |
| `roles.js` | 24 system roles with hierarchy, MFA, session policy, impersonation | 525 |
| `matrix.js` | 38 system permission sets (named bundles) | 774 |
| `roleMatrix.js` | Role → permission set map (the bridge) | 205 |
| `guards.js` | Runtime enforcement (permission, FLS, RLS, session, impersonation) | 380 |
| `schema.sql` | SQLite tables (catalog mirrors, user assignments, FLS/RLS, audit) | 200 |
| `seed.js` | Idempotent installer (`seedRBAC(db)`) | 150 |
| `routes.js` | Fastify admin API (20+ endpoints) | 360 |
| `index.js` | Public module entry (`rbac.install(app, { db })`) | 90 |

Documentation at `docs/RBAC_SYSTEM.md` (~400 lines) covers the design,
API, migration story, comparison vs Salesforce/NetSuite/Odoo, and the
operational runbook.

### 2. Test suite — 45/45 passing

`test/rbac.test.js` exercises:

- Catalog integrity (no duplicate keys, valid categories, valid sensitivity)
- Role hierarchy (no cycles, single inheritance)
- Permission set integrity (no references to unknown permissions)
- Role × permission set matrix (no references to unknown roles or PSs)
- Permission resolution (Owner implicit-all, Admin restricted, SalesRep
  denied finance)
- Sensitivity-aware MFA gating (`critical` actions require MFA)
- Field-level security (`redactFields` strips sensitive fields)
- Record-level security (own/team/org scopes, portal tenant scope)
- Impersonation policy (Owner-only by default)
- Custom role validation
- Seed idempotency (in-memory SQLite)

```
$ node --test test/rbac.test.js
# tests 45
# pass 45
# fail 0
```

### 3. dmux-style orchestration scaffolding

| File | Purpose |
|---|---|
| `scripts/tmux-worktree-orchestrator.js` | Shared helper: `createWorktree`, `overlaySeedPaths`, `writeWorkerFiles`, `launchTmuxPane` |
| `scripts/orchestrate-worktrees.js` | CLI runner: reads `plan.json`, creates worktrees, launches tmux |
| `.orchestration/a1-erp-hy-initial.json` | First-wave plan (3 workers: rbac-catalog, dmux-workflows, docs-and-status) |
| `.orchestration/README.md` | Plan schema + usage |

The pattern is identical to the ECC `orchestrate-worktrees.js` helper
described in the `dmux-workflows` skill: one branch-backed worktree per
worker, optional seed-path overlay, per-worker task/handoff/status
files, all in a single tmux session.

### 4. Documentation

- `docs/RBAC_SYSTEM.md` — canonical reference (~400 lines, 15 sections)
- `docs/PROJECT_STATUS.md` — this file
- `docs/ERP_COMPARISON_IMPLEMENTATION_PLAN.md` — the 645-line ERP plan
  already in the repo (Phase 0–9)

## What is pending (Phase 0–9 of the ERP plan)

In execution order, roughly:

- **Phase 0.1** — Multi-tenant kernel (tenant table, `tenant_id` on
  every row, switching middleware).
- **Phase 0.2** — Localization (ՀՎՀՀ, AMD, ՀԴՄ, SRC, RA chart of
  accounts, Armenian tax codes).
- **Phase 0.3** — Profiles (Salesforce-style reusable bundles of role +
  permission sets for new users).
- **Phase 0.4** — Approvals (dual-control workflow, ties into
  `rbac_approvals` table).
- **Phase 1** — Migrate A1-Suite-Local's ad-hoc role checks to the
  catalog (recipe in `RBAC_SYSTEM.md` § 13).
- **Phase 2** — UI for the admin: roles, permission sets, profiles,
  FLS/RLS, sessions, audit. The RBAC routes are ready; only the SPA
  pages remain.
- **Phase 3** — AI Copilot: governed scope, source gating, agent
  framework, evaluation suite. The `ai.copilot.*` and `ai.agent.*`
  permissions are already in the catalog.
- **Phase 4** — Manufacturing, marketing automation, projects
  profitability. Permission keys are ready; the modules are not.
- **Phase 5** — Customer portal with tenant-scoped access (already
  scaffolded via `CustomerPortal` role and `portal.*` permissions).
- **Phase 6** — Reports, dashboards, spreadsheet analytics.
- **Phase 7** — Studio (custom fields, workflows, approvals, webhooks).
- **Phase 8** — Compliance, retention, GDPR/PDPA subject requests,
  audit packet delivery.
- **Phase 9** — AI agent platform (deploy agents, evaluation).

## Active branches and worktrees

After this first wave, the repo has the following branches:

| Branch | Worktree | Worker | Status |
|---|---|---|---|
| `main` | (this checkout) | orchestrator | first wave complete |
| `rbac-catalog` | `.claude/worktrees/rbac-catalog/` | rbac-catalog | done (45/45 tests) |
| `dmux-workflows` | `.claude/worktrees/dmux-workflows/` | dmux-workflows | done (orchestration scaffolding) |
| `docs-and-status` | `.claude/worktrees/docs-and-status/` | docs-and-status | done (RBAC_SYSTEM.md, PROJECT_STATUS.md) |

## Open questions

1. **Profile bundles.** Should `Profile` be a separate table or a
   derived view over `rbac_user_roles ∪ rbac_user_permission_sets`?
   Leaning toward a separate table for the "onboarding template" use
   case (Salesforce-style).
2. **Custom permission sets.** Should tenants be able to create their
   own permission sets? Today the API allows updates to members but
   not creation of new sets (only system sets are seeded). Add a
   `POST /api/rbac/permission-sets` route if needed.
3. **Tenant-scoped overrides for permission sets.** When a tenant
   adds a permission to their copy of `FinanceOperator`, do we store
   that as a separate row in `rbac_permission_set_members` (current
   plan via `tenant_id` partition) or in a separate override table?
4. **Multi-org / multi-company.** NetSuite has a Subsidiary hierarchy;
   Odoo has Companies. A1-ERP-HY currently has `tenant_id` but no
   sub-org concept. Defer until requested.
5. **AI mutator approval flow.** When Copilot proposes a mutation, the
   `ai.copilot.mutate` permission allows the proposal. A separate
   `rbac_approvals` row is created, then a human with the matching
   action permission (e.g. `finance.journal.post`) approves it. The
   approval engine itself is not built yet.

## How to run the test suite

```bash
cd /Users/samvelstepanyan/dev/A1-ERP-HY
node --test test/rbac.test.js
```

The seed tests require `better-sqlite3`:

```bash
npm install --save-dev better-sqlite3
```

## How to use the RBAC module

```js
// In server/index.js boot sequence:
const fastify = require('fastify')();
const rbac = require('./rbac');

// ... register auth middleware that populates request.user ...

rbac.install(fastify, { db: fastify.db });

// In a route handler:
fastify.post('/api/invoices', {
  preHandler: rbac.requirePerm('finance.invoice.create'),
}, async (request) => {
  // ... handler body ...
});

// Redact sensitive fields in responses:
const safeAccount = rbac.redactFields(request.user, account, [
  'crm.account.tax_id',
  'finance.bank.account_number',
]);
return safeAccount;
```
