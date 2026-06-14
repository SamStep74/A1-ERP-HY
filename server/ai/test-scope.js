"use strict";

/**
 * Test suite for the AI Copilot scope governance.
 *
 * Covers the five core scenarios from the Wave 2 spec:
 *   1. Owner gets unbounded scope.
 *   2. SalesRep gets CRM tool grants only, no finance tools, no MFA.
 *   3. ComplianceOfficer gets ai.copilot.use but NOT ai.copilot.mutate.
 *   4. A user without ai.copilot.use is denied with COPILOT_DENIED.
 *   5. A mutation request without ai.copilot.mutate is denied with APPROVAL_REQUIRED.
 *
 * Plus targeted coverage for tools / sources / tokens / Owner escape hatch /
 * CopilotScopeError shape.
 *
 * Uses node:test (built-in) and node:assert/strict so the test file has zero
 * runtime deps and runs in the same harness as the rest of the project.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveCopilotScope,
  enforceCopilotScope,
  summarizeScope,
  buildAuditDetails,
  CopilotScopeError,
  ERROR_CODES,
  TOOL_PREFIX,
  COPILOT_USE_KEY,
  COPILOT_MUTATE_KEY,
  ABSOLUTE_MAX_TOKENS,
  DEFAULT_MAX_TOKENS,
} = require("./governance");

// ─────────────── Fixture builders ───────────────
//
// `makeUser` is intentionally permissive: the rbac guards cache the resolved
// permission set on the user object, so for the test we pre-populate
// `_effectivePermissions` and let the resolver reuse it. This keeps the
// fixture tiny and avoids a database round-trip.

function makeUser({ id = 1, role, permissionSetIds = [], extra = {} } = {}) {
  return {
    id,
    role,
    permission_set_ids: permissionSetIds,
    mfa_required: false,
    mfa_verified: true,
    ...extra,
  };
}

function granted(permissionKeys) {
  return new Set(permissionKeys);
}

// ─────────────── Scenario 1: Owner gets unbounded scope ───────────────

describe("resolveCopilotScope — Owner escape hatch", () => {
  test("Owner scope is unbounded regardless of permission set list", () => {
    const owner = makeUser({ role: "Owner" });
    const scope = resolveCopilotScope(owner, {
      sourceIds: ["law-tax-code", "law-personal-data", "law-esign"],
      tools: ["ai.tool.read", "ai.tool.update", "ai.tool.execute"],
      maxTokens: 16384,
      mutate: true,
      agentDeploy: true,
    });
    assert.equal(scope.unbounded, true);
    assert.equal(scope.role, "Owner");
    assert.equal(scope.denial, null);
    assert.deepEqual(scope.allowedSources, ["law-tax-code", "law-personal-data", "law-esign"]);
    assert.deepEqual(scope.allowedTools, ["ai.tool.read", "ai.tool.update", "ai.tool.execute"]);
    assert.equal(scope.maxTokens, ABSOLUTE_MAX_TOKENS);
    // Owner is never MFA-required (they're the security policy author).
    assert.equal(scope.requiresMfa, false);
    assert.equal(scope.isMutation, true);
  });
});

// ─────────────── Scenario 2: SalesRep gets CRM tools, no finance, no MFA ───────────────

describe("resolveCopilotScope — SalesRep (CRM tools only, no MFA)", () => {
  // The CRMOperator permission set grants `crm.*` operational keys but not
  // `ai.tool.*` — and the AIEnabled PS grants `ai.copilot.use` only. To model
  // "has CRM tools" we synthesize a user with both grants.
  const salesRepKeys = [
    COPILOT_USE_KEY,
    "crm.deal.read",
    "crm.deal.create",
    "crm.account.read",
    "ai.tool.read",   // catalog-defined; CRM "read" surface
  ];
  const salesRep = makeUser({
    role: "SalesRep",
    extra: { _effectivePermissions: granted(salesRepKeys), aiSourceIds: ["crm-deals-2026"] },
  });

  test("allowed tools are restricted to the ai.tool.* keys the user holds", () => {
    const scope = resolveCopilotScope(salesRep, {
      sourceIds: ["crm-deals-2026"],
      tools: ["ai.tool.read", "ai.tool.update", "ai.tool.execute"],
    });
    assert.equal(scope.denial, null);
    // Only ai.tool.read is in the grant set; the rest are dropped.
    assert.deepEqual(scope.allowedTools, ["ai.tool.read"]);
    assert.deepEqual(scope.requestedTools, ["ai.tool.read", "ai.tool.update", "ai.tool.execute"]);
  });

  test("finance.* tools are not granted (denial when no overlap)", () => {
    const scope = resolveCopilotScope(salesRep, {
      sourceIds: ["crm-deals-2026"],
      // Friendly name without ai.tool. prefix; the resolver would only allow
      // it if the user held ai.tool.finance.*. SalesRep has none.
      tools: ["finance-invoice-create"],
    });
    assert.ok(scope.denial, "expected a denial");
    assert.equal(scope.denial.code, ERROR_CODES.TOOL_DENIED);
    assert.equal(scope.denial.missingKey, "finance-invoice-create");
    assert.equal(scope.denial.retryable, false);
  });

  test("requiresMfa is false for a normal Copilot read", () => {
    const scope = resolveCopilotScope(salesRep, {
      sourceIds: ["crm-deals-2026"],
      tools: ["ai.tool.read"],
    });
    assert.equal(scope.requiresMfa, false);
    assert.equal(scope.denial, null);
  });

  test("requiresMfa flips to true when the request asks for tool.execute", () => {
    // No MFA satisfied → denial with MFA_REQUIRED.
    const scope = resolveCopilotScope(salesRep, {
      sourceIds: ["crm-deals-2026"],
      tools: ["ai.tool.execute"],
    });
    // The user doesn't have ai.tool.execute, so the first matching denial
    // is TOOL_DENIED (denials are checked in priority order). To exercise
    // the MFA path, grant the user the key first.
    assert.equal(scope.denial.code, ERROR_CODES.TOOL_DENIED);

    const withExecute = makeUser({
      role: "SalesRep",
      extra: {
        _effectivePermissions: granted([...salesRepKeys, "ai.tool.execute"]),
        mfa_required: true,
        mfa_verified: false,
      },
    });
    const scopeMfa = resolveCopilotScope(withExecute, {
      sourceIds: ["crm-deals-2026"],
      tools: ["ai.tool.execute"],
    });
    assert.equal(scopeMfa.requiresMfa, true);
    assert.ok(scopeMfa.denial);
    assert.equal(scopeMfa.denial.code, ERROR_CODES.MFA_REQUIRED);
    assert.equal(scopeMfa.denial.httpStatus, 401);
  });

  test("token ceiling clamps to 4096 by default (no budget override)", () => {
    const scope = resolveCopilotScope(salesRep, {
      maxTokens: 99999,
    });
    // No tools / no sources requested → no denial from the source/tool
    // gates; the token check still clamps.
    assert.equal(scope.denial, null);
    assert.equal(scope.maxTokens, ABSOLUTE_MAX_TOKENS);
    assert.equal(scope.hasBudgetOverride, false);
  });
});

// ─────────────── Scenario 3: ComplianceOfficer gets read but NOT mutate ───────────────

describe("resolveCopilotScope — ComplianceOfficer (read-only AI)", () => {
  const complianceKeys = [
    COPILOT_USE_KEY,
    "compliance.policy.read",
    "compliance.policy.update",
    "compliance.audit.read",
    "ai.tool.read",
  ];
  const compliance = makeUser({
    role: "ComplianceOfficer",
    extra: { _effectivePermissions: granted(complianceKeys), aiSourceIds: ["law-personal-data"] },
  });

  test("read request goes through with no denial", () => {
    const scope = resolveCopilotScope(compliance, {
      sourceIds: ["law-personal-data"],
      tools: ["ai.tool.read"],
    });
    assert.equal(scope.denial, null);
    assert.equal(scope.requiresApproval, false);
    assert.equal(scope.isMutation, false);
  });

  test("mutation request is denied with APPROVAL_REQUIRED", () => {
    const scope = resolveCopilotScope(compliance, {
      sourceIds: ["law-personal-data"],
      tools: ["ai.tool.read"],
      mutate: true,
    });
    assert.ok(scope.denial);
    assert.equal(scope.denial.code, ERROR_CODES.APPROVAL_REQUIRED);
    assert.equal(scope.denial.missingKey, COPILOT_MUTATE_KEY);
    assert.equal(scope.denial.httpStatus, 403);
  });

  test("mutate=true on a user WITHOUT the mutate key is denied even if proposedActions is empty", () => {
    const scope = resolveCopilotScope(compliance, {
      mutate: true,
    });
    assert.ok(scope.denial);
    assert.equal(scope.denial.code, ERROR_CODES.APPROVAL_REQUIRED);
  });
});

// ─────────────── Scenario 4: User without ai.copilot.use is denied ───────────────

describe("resolveCopilotScope — user without ai.copilot.use", () => {
  test("denied with COPILOT_DENIED", () => {
    const stranger = makeUser({
      role: "Auditor",
      extra: { _effectivePermissions: granted(["security.audit.read"]) },
    });
    const scope = resolveCopilotScope(stranger, {
      sourceIds: ["law-tax-code"],
      tools: ["ai.tool.read"],
    });
    assert.ok(scope.denial);
    assert.equal(scope.denial.code, ERROR_CODES.COPILOT_DENIED);
    assert.equal(scope.denial.missingKey, COPILOT_USE_KEY);
    assert.equal(scope.denial.retryable, false);
    assert.equal(scope.denial.httpStatus, 403);
  });

  test("a null/undefined user is treated as anonymous and denied COPILOT_DENIED", () => {
    const scope = resolveCopilotScope(null, { tools: ["ai.tool.read"] });
    assert.ok(scope.denial);
    assert.equal(scope.denial.code, ERROR_CODES.COPILOT_DENIED);
  });
});

// ─────────────── Scenario 5: Mutation without ai.copilot.mutate ───────────────

describe("enforceCopilotScope — throws CopilotScopeError on denial", () => {
  test("mutation from a non-mutator throws APPROVAL_REQUIRED", () => {
    const user = makeUser({
      role: "SalesRep",
      extra: { _effectivePermissions: granted([COPILOT_USE_KEY, "ai.tool.read"]) },
    });
    assert.throws(
      () => enforceCopilotScope(user, { mutate: true }),
      (err) => {
        assert.ok(err instanceof CopilotScopeError);
        assert.equal(err.code, ERROR_CODES.APPROVAL_REQUIRED);
        assert.equal(err.missingKey, COPILOT_MUTATE_KEY);
        assert.equal(err.retryable, false);
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });

  test("successful enforcement returns the accepted scope envelope", () => {
    const user = makeUser({
      role: "Owner",
    });
    const scope = enforceCopilotScope(user, { sourceIds: ["law-tax-code"] });
    assert.equal(scope.unbounded, true);
    assert.equal(scope.denial, null);
  });
});

// ─────────────── Source gating ───────────────

describe("resolveCopilotScope — source gating", () => {
  const user = makeUser({
    role: "SalesRep",
    extra: {
      _effectivePermissions: granted([COPILOT_USE_KEY, "ai.tool.read"]),
      aiSourceIds: ["crm-deals-2026"],
    },
  });

  test("intersects request sources with user grants", () => {
    const scope = resolveCopilotScope(user, {
      sourceIds: ["crm-deals-2026", "law-tax-code"],
    });
    assert.deepEqual(scope.allowedSources, ["crm-deals-2026"]);
    assert.deepEqual(scope.requestedSources, ["crm-deals-2026", "law-tax-code"]);
    assert.equal(scope.denial, null);
  });

  test("SOURCE_DENIED when the user has no grants at all", () => {
    const noGrants = makeUser({
      role: "SalesRep",
      extra: { _effectivePermissions: granted([COPILOT_USE_KEY]) },
    });
    const scope = resolveCopilotScope(noGrants, { sourceIds: ["crm-deals-2026"] });
    assert.ok(scope.denial);
    assert.equal(scope.denial.code, ERROR_CODES.SOURCE_DENIED);
    assert.equal(scope.denial.missingKey, "crm-deals-2026");
  });
});

// ─────────────── Token budget ───────────────

describe("resolveCopilotScope — token budget", () => {
  test("clamps to ABSOLUTE_MAX_TOKENS without budget override", () => {
    const user = makeUser({
      role: "SalesRep",
      extra: { _effectivePermissions: granted([COPILOT_USE_KEY]) },
    });
    const scope = resolveCopilotScope(user, { maxTokens: 100000 });
    assert.equal(scope.maxTokens, ABSOLUTE_MAX_TOKENS);
    assert.equal(scope.requestedMaxTokens, 100000);
    assert.equal(scope.denial, null);
  });

  test("default maxTokens is the DEFAULT_MAX_TOKENS when none is provided", () => {
    const user = makeUser({
      role: "SalesRep",
      extra: { _effectivePermissions: granted([COPILOT_USE_KEY]) },
    });
    const scope = resolveCopilotScope(user, {});
    assert.equal(scope.requestedMaxTokens, DEFAULT_MAX_TOKENS);
  });
});

// ─────────────── summarizeScope (audit log line) ───────────────

describe("summarizeScope", () => {
  test("renders a one-line summary for a SalesRep-sized scope", () => {
    const scope = {
      role: "SalesRep",
      unbounded: false,
      allowedTools: ["ai.tool.read", "ai.tool.update"],
      allowedSources: ["crm-deals-2026"],
      maxTokens: 4096,
      requiresMfa: false,
      requiresApproval: false,
      isMutation: false,
    };
    const line = summarizeScope(scope);
    assert.match(line, /^SalesRep: 2 tools, 1 source, 4K tokens, no MFA$/);
  });

  test("renders an unbounded Owner line", () => {
    const line = summarizeScope({ role: "Owner", unbounded: true });
    assert.equal(line, "Owner: unbounded");
  });

  test("flags approval and mutation in the summary", () => {
    const line = summarizeScope({
      role: "Accountant",
      unbounded: false,
      allowedTools: ["ai.tool.read"],
      allowedSources: ["law-tax-code"],
      maxTokens: 8192,
      requiresMfa: false,
      requiresApproval: true,
      isMutation: true,
    });
    assert.match(line, /approval required/);
    assert.match(line, /mutation/);
  });

  test("handles a missing scope defensively", () => {
    assert.equal(summarizeScope(null), "no-scope");
    assert.equal(summarizeScope(undefined), "no-scope");
  });
});

// ─────────────── buildAuditDetails ───────────────

describe("buildAuditDetails", () => {
  test("produces a JSON-serializable audit payload that includes the summary", () => {
    const scope = {
      role: "SalesRep",
      unbounded: false,
      isMutation: false,
      hasBudgetOverride: false,
      allowedSources: ["crm-deals-2026"],
      requestedSources: ["crm-deals-2026"],
      allowedTools: ["ai.tool.read"],
      requestedTools: ["ai.tool.read"],
      maxTokens: 4096,
      requestedMaxTokens: 4096,
      requiresMfa: false,
      requiresApproval: false,
    };
    const details = buildAuditDetails(scope, { requestId: "req-123" });
    assert.equal(details.role, "SalesRep");
    assert.equal(details.requestId, "req-123");
    assert.equal(details.summary, "SalesRep: 1 tool, 1 source, 4K tokens, no MFA");
    // Must be JSON-stringifiable without losing structure.
    const roundTrip = JSON.parse(JSON.stringify(details));
    assert.equal(roundTrip.role, "SalesRep");
    assert.deepEqual(roundTrip.allowedTools, ["ai.tool.read"]);
  });
});

// ─────────────── Tool prefix constant (smoke) ───────────────

describe("governance constants", () => {
  test("TOOL_PREFIX matches the catalog key family", () => {
    assert.equal(TOOL_PREFIX, "ai.tool.");
  });
  test("COPILOT_USE_KEY is ai.copilot.use", () => {
    assert.equal(COPILOT_USE_KEY, "ai.copilot.use");
  });
  test("COPILOT_MUTATE_KEY is ai.copilot.mutate", () => {
    assert.equal(COPILOT_MUTATE_KEY, "ai.copilot.mutate");
  });
});
