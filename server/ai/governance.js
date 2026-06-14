"use strict";

/**
 * AI Copilot governance — runtime scope resolution and enforcement.
 *
 * Wave 1 introduced the catalog keys (`ai.copilot.*`, `ai.agent.*`, `ai.tool.*`,
 * `ai.budget.*`, `ai.fallback.update`). This module makes them *enforceable*
 * end-to-end: every Copilot / agent request is resolved into a concrete scope
 * envelope, and any denial throws a structured `CopilotScopeError` that the
 * HTTP layer can surface as a 4xx.
 *
 * Three exports:
 *   - resolveCopilotScope(user, requestBody)  → { allowedSources, maxTokens,
 *                                                 allowedTools, requiresMfa,
 *                                                 requiresApproval, ... }
 *   - enforceCopilotScope(user, requestBody)  → scope, or throws
 *   - summarizeScope(scope)                   → "SalesRep: 3 tools, 2 sources,
 *                                                 4K tokens, no MFA"
 *
 * Owner escape hatch: when `user.role === 'Owner'`, the scope is unbounded
 * regardless of permission sets. The matrix in `server/rbac/guards.js`
 * already grants Owner every key implicitly — this branch exists to express
 * the contract in the resolver so future readers don't have to chase the
 * implicit-all shortcut through two files.
 */

const rbac = require("../rbac");

// Catalog constants — referenced by every other module that touches AI
// governance, so centralizing them here keeps the error codes and limits
// in lock-step.
const TOOL_PREFIX = "ai.tool.";
const COPILOT_USE_KEY = "ai.copilot.use";
const COPILOT_MUTATE_KEY = "ai.copilot.mutate";
const AGENT_DEPLOY_KEY = "ai.agent.deploy";
const BUDGET_OVERRIDE_KEY = "ai.budget.update";

// Hard caps. These mirror the *required* ceilings from the catalog — not the
// per-role overrides a user might negotiate via custom permission sets.
// A user with `ai.budget.update` (the budget admin override) is allowed to
// request a higher ceiling; everyone else is clamped to the default.
const DEFAULT_MAX_TOKENS = 4096;
const ABSOLUTE_MAX_TOKENS = 8192;
const GOVERNANCE_MAX_TOKENS = 16384; // ceiling for budget-admin override

// Mutations are requests that, if forwarded to the AI provider, would change
// downstream state. The Copilot advisory itself is always read-only, but the
// request body can declare a "mutate" intent for proposed actions or agent
// runs that need a human approver.
function isMutationRequest(requestBody) {
  if (!requestBody || typeof requestBody !== "object") return false;
  if (requestBody.mutate === true) return true;
  if (requestBody.intent === "mutate" || requestBody.intent === "mutation") return true;
  if (requestBody.proposed === true) return true;
  if (Array.isArray(requestBody.proposedActions) && requestBody.proposedActions.length > 0) return true;
  return false;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === "string" && item.length > 0)
    .map(item => item.trim());
}

function intersection(a, b) {
  const bSet = b instanceof Set ? b : new Set(b);
  const out = [];
  for (const item of a) if (bSet.has(item)) out.push(item);
  return out;
}

// Cap and sanitize a free-form identifier before it ever reaches an error
// message or a `missingKey` field. We don't want a malicious caller to
// smuggle control characters, CRLF, or 64KB of text into the JSON response.
// The character class is intentionally narrow: lowercase letters, digits,
// dot, underscore, dash. Anything outside it is stripped.
const SAFE_ID_RE = /[^a-z0-9._-]/g;
const SAFE_ID_MAX_LENGTH = 80;
function sanitizeIdentifier(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(SAFE_ID_RE, "").slice(0, SAFE_ID_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

// ─────────────── CopilotScopeError ───────────────
//
// The single error class the HTTP layer should catch. `code` is a stable,
// machine-readable token; `missingKey` is the permission key the user would
// have to be granted to succeed (when applicable); `retryable` says whether
// the client can fix this without admin help (e.g. retrying with a smaller
// token budget or a different source) or whether the user is structurally
// blocked.

class CopilotScopeError extends Error {
  constructor({ code, message, missingKey = null, retryable = false, scope = null, httpStatus = 403 }) {
    super(message);
    this.name = "CopilotScopeError";
    this.code = code;
    this.missingKey = missingKey;
    this.retryable = retryable;
    this.scope = scope;
    this.statusCode = httpStatus;
    // Fastify uses `statusCode`; the rbac guard pattern uses `code`. We expose
    // both so a caller can pick the one their transport expects.
  }
}

const ERROR_CODES = Object.freeze({
  COPILOT_DENIED: "COPILOT_DENIED",
  TOOL_DENIED: "TOOL_DENIED",
  SOURCE_DENIED: "SOURCE_DENIED",
  TOKEN_OVER_BUDGET: "TOKEN_OVER_BUDGET",
  MFA_REQUIRED: "MFA_REQUIRED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
});

// ─────────────── resolveCopilotScope ───────────────

/**
 * Resolve a Copilot request into a concrete scope envelope. Pure function:
 * no DB, no I/O. The caller passes the user's effective permission set
 * (already resolved by the rbac guards).
 *
 * @param {object} user — at minimum `{ id, role, permission_set_ids }`.
 *   Optional:
 *     - `mfa_required`, `mfa_verified` — sensitivity step-up check
 *     - `aiSourceIds` — string[] of source IDs the user is allowed to read
 *       (default: empty set, since `ai.source.*` is not yet in the catalog)
 *     - `_effectivePermissions` — pre-resolved Set, otherwise we re-resolve
 * @param {object} requestBody
 *   - `sourceIds` — string[] of source IDs the request wants to read
 *   - `tools` — string[] of tool keys the request wants to invoke
 *   - `maxTokens` — number, request's preferred output budget
 *   - `requiresApproval` — bool, request explicitly asks for approval gating
 *   - `mutate` / `proposed` / `proposedActions` — see isMutationRequest
 *   - `agentDeploy` / `agentExecute` — flags for agent run categories
 * @returns {{
 *   role: string,
 *   unbounded: boolean,
 *   isMutation: boolean,
 *   hasBudgetOverride: boolean,
 *   allowedSources: string[],
 *   requestedSources: string[],
 *   allowedTools: string[],
 *   requestedTools: string[],
 *   maxTokens: number,
 *   requestedMaxTokens: number,
 *   requiresMfa: boolean,
 *   requiresApproval: boolean,
 *   permissionKeys: Set<string>,
 *   denial: null | { code: string, message: string, missingKey: string|null, retryable: boolean, httpStatus: number }
 * }}
 */
function resolveCopilotScope(user, requestBody) {
  const body = isPlainObject(requestBody) ? requestBody : {};
  const safeUser = user && typeof user === "object" ? user : null;

  // ── Permission set ─────────────────────────────────────────────
  // Reuse the canonical resolver from the rbac guards so the same
  // implicit-all shortcut for Owner is applied here. We never call
  // hasPermission with a key that isn't in the catalog.
  const permissionKeys = rbac.resolveEffectivePermissions(safeUser);

  // ── Owner: unbounded scope ─────────────────────────────────────
  if (safeUser && safeUser.role === "Owner") {
    return {
      role: "Owner",
      unbounded: true,
      isMutation: isMutationRequest(body),
      hasBudgetOverride: true,
      allowedSources: asStringArray(body.sourceIds),
      requestedSources: asStringArray(body.sourceIds),
      allowedTools: asStringArray(body.tools),
      requestedTools: asStringArray(body.tools),
      maxTokens: ABSOLUTE_MAX_TOKENS,
      requestedMaxTokens: normalizeRequestedMaxTokens(body.maxTokens),
      requiresMfa: false,
      requiresApproval: false,
      permissionKeys,
      denial: null,
    };
  }

  // ── Base requirements ─────────────────────────────────────────
  const requestedSources = asStringArray(body.sourceIds);
  const requestedTools = asStringArray(body.tools);
  const userSourceSet = new Set(asStringArray(safeUser && safeUser.aiSourceIds));
  const isMutation = isMutationRequest(body);
  const hasBudgetOverride = permissionKeys.has(BUDGET_OVERRIDE_KEY);

  // ── COPILOT_DENIED: user has no `ai.copilot.use` ───────────────
  if (!permissionKeys.has(COPILOT_USE_KEY)) {
    const denial = makeDenial({
      code: ERROR_CODES.COPILOT_DENIED,
      message: "User is not permitted to use the AI Copilot.",
      missingKey: COPILOT_USE_KEY,
      retryable: false,
      httpStatus: 403,
    });
    return baseScope({
      safeUser, permissionKeys, isMutation, hasBudgetOverride,
      requestedSources, requestedTools, body, denial,
    });
  }

  // ── Sources: intersect request with user grants ────────────────
  const allowedSources = intersection(requestedSources, userSourceSet);

  // ── Tools: subset of `ai.tool.*` keys the user holds ───────────
  // The request body's `tools` array may contain canonical keys (e.g.
  // "ai.tool.read") or friendly names (e.g. "crm-deal-search"). For now
  // we only treat canonical keys as gateable; non-canonical entries
  // pass through if the user holds the matching `ai.tool.*` umbrella.
  const userToolKeys = [...permissionKeys].filter(k => k.startsWith(TOOL_PREFIX));
  const userToolSet = new Set(userToolKeys);
  const allowedTools = requestedTools.filter(tool =>
    userToolSet.has(tool) || userToolSet.has(TOOL_PREFIX + tool)
  );

  // ── Tokens: min(requested, ceiling). The ceiling is the
  //   GOVERNANCE_MAX_TOKENS for budget admins (holders of
  //   `ai.budget.update`), the default ABSOLUTE_MAX_TOKENS for everyone
  //   else. The audit log records `hasBudgetOverride` so reviewers can
  //   see which ceiling was applied.
  const requestedMaxTokens = normalizeRequestedMaxTokens(body.maxTokens);
  const ceiling = hasBudgetOverride ? GOVERNANCE_MAX_TOKENS : ABSOLUTE_MAX_TOKENS;
  const maxTokens = Math.min(requestedMaxTokens, ceiling);

  // ── MFA: required when the request asks for tool.execute or agent.deploy
  const asksForAgentDeploy = body.agentDeploy === true;
  const asksForToolExecute = body.toolExecute === true
    || (Array.isArray(body.tools) && body.tools.some(t => /(^|\.)execute$/.test(t)));
  const requiresMfa = asksForAgentDeploy || asksForToolExecute;
  const mfaSatisfied = safeUser && safeUser.mfa_required === true
    ? safeUser.mfa_verified === true
    : true; // not required → satisfied

  // ── Approval: required if (a) request is a mutation AND
  //                       (b) request body asks for it OR is a mutation
  // The resolver surfaces the requirement; the *enforce* step is where
  // we block. We treat "mutation without `ai.copilot.mutate`" as a
  // hard stop with APPROVAL_REQUIRED.
  const bodyAsksForApproval = body.requiresApproval === true;
  const requiresApproval = isMutation || bodyAsksForApproval;

  // Build the envelope and apply the first matching denial.
  let denial = null;
  if (isMutation && !permissionKeys.has(COPILOT_MUTATE_KEY)) {
    denial = makeDenial({
      code: ERROR_CODES.APPROVAL_REQUIRED,
      message: "Mutating Copilot request requires the ai.copilot.mutate permission.",
      missingKey: COPILOT_MUTATE_KEY,
      retryable: false,
      httpStatus: 403,
    });
  } else if (requiresMfa && !mfaSatisfied) {
    denial = makeDenial({
      code: ERROR_CODES.MFA_REQUIRED,
      message: "MFA required for this Copilot action (tool.execute or agent.deploy).",
      missingKey: requiresMfaForKey(asksForAgentDeploy, asksForToolExecute),
      retryable: true,
      httpStatus: 401,
    });
  } else if (requestedSources.length > 0 && allowedSources.length === 0) {
    // Caller asked for sources but none of them are in the user's grant set.
    // If the user has *no* sources at all, fall back to a generic "denied"
    // message. If they have some but asked for others, name the first one
    // they don't have. We sanitize the identifier before it reaches the
    // error message so a malicious caller can't inject CRLF or escape
    // characters into the JSON response.
    const firstMissing = sanitizeIdentifier(
      requestedSources.find(s => !userSourceSet.has(s)) || null
    );
    denial = makeDenial({
      code: ERROR_CODES.SOURCE_DENIED,
      message: firstMissing
        ? `User is not granted access to source: ${firstMissing}.`
        : "User has no source grants; cannot read any source.",
      missingKey: firstMissing,
      retryable: false,
      httpStatus: 403,
    });
  } else if (requestedTools.length > 0 && allowedTools.length === 0) {
    const firstMissing = sanitizeIdentifier(
      requestedTools.find(t => !userToolSet.has(t) && !userToolSet.has(TOOL_PREFIX + t)) || null
    );
    denial = makeDenial({
      code: ERROR_CODES.TOOL_DENIED,
      message: firstMissing
        ? `User is not granted the tool: ${firstMissing}.`
        : "User has no ai.tool.* grants; cannot invoke any tool.",
      missingKey: firstMissing,
      retryable: false,
      httpStatus: 403,
    });
  }

  return {
    role: safeUser ? safeUser.role : "anonymous",
    unbounded: false,
    isMutation,
    hasBudgetOverride,
    allowedSources,
    requestedSources,
    allowedTools,
    requestedTools,
    maxTokens,
    requestedMaxTokens,
    requiresMfa,
    requiresApproval: requiresApproval && !denial, // suppressed when blocked
    permissionKeys,
    denial,
  };
}

// ─────────────── enforceCopilotScope ───────────────

/**
 * Resolve the scope and throw CopilotScopeError on any denial. Returns the
 * accepted scope envelope on success. The handler should pass this envelope
 * down to the AI provider and the audit log.
 */
function enforceCopilotScope(user, requestBody) {
  const scope = resolveCopilotScope(user, requestBody);
  if (scope.denial) {
    throw new CopilotScopeError({
      code: scope.denial.code,
      message: scope.denial.message,
      missingKey: scope.denial.missingKey,
      retryable: scope.denial.retryable,
      scope,
      httpStatus: scope.denial.httpStatus,
    });
  }
  return scope;
}

// ─────────────── summarizeScope ───────────────

/**
 * One-line human-readable summary for audit logs and UI tooltips.
 * Example: "SalesRep: 3 tools, 2 sources, 4K tokens, no MFA, approval required"
 */
function summarizeScope(scope) {
  if (!scope || typeof scope !== "object") return "no-scope";
  const role = scope.role || "unknown";
  if (scope.unbounded) return `${role}: unbounded`;
  const tools = pluralize(scope.allowedTools.length, "tool", "tools");
  const sources = pluralize(scope.allowedSources.length, "source", "sources");
  const tokens = formatTokenCount(scope.maxTokens);
  const mfa = scope.requiresMfa ? "MFA required" : "no MFA";
  const approval = scope.requiresApproval ? ", approval required" : "";
  const mutation = scope.isMutation ? ", mutation" : "";
  return `${role}: ${scope.allowedTools.length} ${tools}, ${scope.allowedSources.length} ${sources}, ${tokens} tokens, ${mfa}${approval}${mutation}`;
}

// ─────────────── Audit row helper ───────────────

/**
 * Persist an accepted Copilot action to the audit log. The shape matches the
 * existing `audit(db, orgId, userId, type, details)` helper from db.js. We
 * keep this here so the governance module owns its log schema and the HTTP
 * layer just hands the scope to us.
 *
 * Returns the JSON-encoded details blob (useful for the test suite).
 */
function buildAuditDetails(scope, extras = {}) {
  return {
    requestId: extras.requestId || null,
    role: scope.role,
    unbounded: Boolean(scope.unbounded),
    isMutation: Boolean(scope.isMutation),
    hasBudgetOverride: Boolean(scope.hasBudgetOverride),
    allowedSources: scope.allowedSources,
    requestedSources: scope.requestedSources,
    allowedTools: scope.allowedTools,
    requestedTools: scope.requestedTools,
    maxTokens: scope.maxTokens,
    requestedMaxTokens: scope.requestedMaxTokens,
    requiresMfa: Boolean(scope.requiresMfa),
    requiresApproval: Boolean(scope.requiresApproval),
    summary: summarizeScope(scope),
    ...extras,
  };
}

// ─────────────── Internal helpers ───────────────

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequestedMaxTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_TOKENS;
  return Math.floor(n);
}

function makeDenial({ code, message, missingKey, retryable, httpStatus }) {
  return { code, message, missingKey: missingKey || null, retryable: Boolean(retryable), httpStatus: httpStatus || 403 };
}

function baseScope(args) {
  return {
    role: args.safeUser ? args.safeUser.role : "anonymous",
    unbounded: false,
    isMutation: args.isMutation,
    hasBudgetOverride: args.hasBudgetOverride,
    allowedSources: intersection(args.requestedSources, new Set(asStringArray(args.safeUser && args.safeUser.aiSourceIds))),
    requestedSources: args.requestedSources,
    allowedTools: args.requestedTools.filter(tool => {
      const userToolKeys = [...args.permissionKeys].filter(k => k.startsWith(TOOL_PREFIX));
      return userToolKeys.includes(tool) || userToolKeys.includes(TOOL_PREFIX + tool);
    }),
    requestedTools: args.requestedTools,
    maxTokens: Math.min(normalizeRequestedMaxTokens(args.body.maxTokens), ABSOLUTE_MAX_TOKENS),
    requestedMaxTokens: normalizeRequestedMaxTokens(args.body.maxTokens),
    requiresMfa: false,
    requiresApproval: false,
    permissionKeys: args.permissionKeys,
    denial: args.denial,
  };
}

function requiresMfaForKey(agentDeploy, toolExecute) {
  if (agentDeploy) return AGENT_DEPLOY_KEY;
  if (toolExecute) return "ai.tool.execute";
  return null;
}

function pluralize(n, singular, plural) {
  return n === 1 ? singular : plural;
}

function formatTokenCount(n) {
  if (n >= 1024 && n % 1024 === 0) return `${n / 1024}K`;
  return String(n);
}

module.exports = {
  // Public API
  resolveCopilotScope,
  enforceCopilotScope,
  summarizeScope,
  buildAuditDetails,
  // Error class + codes
  CopilotScopeError,
  ERROR_CODES,
  // Constants (exported for the test suite and any future consumer)
  TOOL_PREFIX,
  COPILOT_USE_KEY,
  COPILOT_MUTATE_KEY,
  BUDGET_OVERRIDE_KEY,
  ABSOLUTE_MAX_TOKENS,
  DEFAULT_MAX_TOKENS,
  GOVERNANCE_MAX_TOKENS,
  // Helpers (exported for tests)
  isMutationRequest,
  intersection,
  sanitizeIdentifier,
};
