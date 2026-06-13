// A1 ERP-HY RBAC Migration Stubs
//
// Three Fastify routes that demonstrate the catalog-driven RBAC pattern.
// These are the "high-sensitivity" examples from the migration brief:
//
//   POST /api/_rbac/finance/journal/post       → finance.journal.post    (critical)
//   POST /api/_rbac/crm/deal/approve           → crm.deal.approve        (high)
//   POST /api/_rbac/system/tenant/create       → system.tenant.create    (critical)
//
// Every access decision goes through the catalog — there are no direct
// `req.user.role === '...'` checks anywhere in this file. Sensitive fields
// in responses are stripped via `redactFields` using FLS_RULES.
//
// The rbac lint (`scripts/lint-rbac.js`) reads this file as the canonical
// example of a clean migration: zero `user.role` references, every
// `requirePerm` argument is a key in PERMISSIONS, and every sensitive
// field path is handled by FLS_RULES.

'use strict';

const {
  requirePerm,
  redactFields,
  FLS_RULES,
} = require('./guards');

// Field paths to redact from responses on these stub routes. The stub for
// /api/_rbac/system/tenant/create returns a fake record that includes a
// tax_id; the stub for /api/_rbac/finance/journal/post returns a record
// with a bank account_number. The CRM stub does not return sensitive
// fields but lists the CRM account tax_id path as a documented guard
// example.
const STUB_REDACT_PATHS = Object.freeze([
  'finance.bank.account_number',
  'finance.bank.routing',
  'crm.account.tax_id',
  'hr.employee.ssn',
]);

// Register the three stub routes onto a Fastify app.
function registerRbacMigrationStubs(app) {
  // ───────── finance.journal.post (critical) ─────────
  // Post a journal entry to the ledger. The stub returns a fake ledger
  // record that contains a bank account_number which is auto-redacted
  // unless the user holds finance.bank.read.
  app.post('/api/_rbac/finance/journal/post', {
    preHandler: requirePerm('finance.journal.post'),
  }, async (request, reply) => {
    return redactFields(request.user, {
      ok: true,
      entryId: 'stub-fj-1',
      amount: 1000,
      account_number: 'AM12 3456 7890 1234 5678 9012', // sensitive — FLS rules apply
      routing: '123456789',
    }, STUB_REDACT_PATHS);
  });

  // ───────── crm.deal.approve (high) ─────────
  // Approve a deal that needs a discount exception. Returns a fake deal
  // summary. No sensitive fields exposed; the stub exists to confirm
  // that crm.deal.approve is the right catalog key.
  app.post('/api/_rbac/crm/deal/approve', {
    preHandler: requirePerm('crm.deal.approve'),
  }, async (request, reply) => {
    return redactFields(request.user, {
      ok: true,
      dealId: 'stub-cd-1',
      approved: true,
      approvedBy: request.user.id,
    }, STUB_REDACT_PATHS);
  });

  // ───────── system.tenant.create (critical) ─────────
  // Provision a new tenant. The stub returns a fake tenant record with
  // a tax_id field which is redacted unless the user holds
  // crm.account.read (per FLS_RULES).
  app.post('/api/_rbac/system/tenant/create', {
    preHandler: requirePerm('system.tenant.create'),
  }, async (request, reply) => {
    return redactFields(request.user, {
      ok: true,
      tenantId: 'stub-tnt-1',
      name: 'Acme LLC',
      tax_id: '01234567', // sensitive — FLS rules apply (crm.account.tax_id)
    }, STUB_REDACT_PATHS);
  });
}

module.exports = {
  registerRbacMigrationStubs,
  STUB_REDACT_PATHS,
};
