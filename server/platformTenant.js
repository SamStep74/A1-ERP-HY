const crypto = require("node:crypto");
const config = require("./config");

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const BLOCKING_TENANT_CODES = new Set(["TENANT_MAINTENANCE", "TENANT_DISABLED", "MODULE_DISABLED", "EGRESS_BLOCKED", "PLATFORM_AUTH_FAILED"]);
const TENANT_UNAVAILABLE_CODES = new Set(["TENANT_MAINTENANCE", "TENANT_DISABLED", "MODULE_DISABLED", "EGRESS_BLOCKED"]);
const AUTH_STATUS_PRESERVED_CODES = new Set(["TENANT_MAINTENANCE", "TENANT_DISABLED", "MODULE_DISABLED", "EGRESS_BLOCKED", "PLATFORM_AUTH_FAILED"]);
const UNMAPPED_PUBLIC_RESOURCE_ORG_ID = "__a1_platform_unmapped_public_resource__";

function platformResolutionEnabled(env = process.env) {
  return TRUTHY.has(String(env.A1_PLATFORM_TENANT_RESOLUTION || "").toLowerCase());
}

function strictModeEnabled(env = process.env) {
  return TRUTHY.has(String(env.A1_PLATFORM_TENANT_STRICT || "").toLowerCase());
}

function publicPlatformTenantSummary(tenant, env = process.env) {
  if (!platformResolutionEnabled(env)) return { enabled: false };
  if (!tenant) return { enabled: true, resolved: false, strict: strictModeEnabled(env) };
  return { enabled: true, resolved: true, strict: strictModeEnabled(env) };
}

function platformTenantSummary(tenant, env = process.env) {
  if (!platformResolutionEnabled(env)) return { enabled: false };
  if (!tenant) return { enabled: true, resolved: false, strict: strictModeEnabled(env) };
  return {
    enabled: true,
    resolved: true,
    strict: strictModeEnabled(env),
    id: tenant.id,
    slug: tenant.slug,
    status: tenant.status,
    modules: (tenant.modules || []).map(platformModuleCode).filter(Boolean),
    productCode: tenant.productCode,
    routeHost: tenant.routeHost,
    storagePrefix: tenant.storagePrefix,
    databaseUrlPresent: Boolean(tenant.databaseUrl)
  };
}

function platformModuleCode(module) {
  if (typeof module === "string") return module;
  if (!module || typeof module !== "object") return null;
  return module.code || module.module_code || module.productCode || module.product_code || null;
}

function platformModuleDisabled(module) {
  if (!module || typeof module !== "object") return false;
  const status = String(module.status || "").toLowerCase();
  return module.enabled === false || status === "disabled" || status === "inactive";
}

async function resolvePlatformTenant(request, env = process.env, fetchImpl = globalThis.fetch, cache = null) {
  if (!platformResolutionEnabled(env)) return null;
  if (typeof fetchImpl !== "function") throw platformError("A1 platform tenant resolution requires fetch", 503, "A1_PLATFORM_FETCH_UNAVAILABLE");

  const baseUrl = String(env.A1_PLATFORM_API_URL || "http://127.0.0.1:8088").replace(/\/+$/, "");
  const url = new URL("/api/tenants/current", baseUrl);
  url.searchParams.set("product", "studio");
  config.assertEgressAllowed(url, env);

  const tenantHost = request.headers.host || request.hostname || "";
  const headers = { "x-a1-request-host": tenantHost };
  if (env.A1_PLATFORM_TOKEN) headers["x-a1-platform-token"] = env.A1_PLATFORM_TOKEN;
  const cacheKey = `${String(url)}|${tenantHost}|${platformTenantCacheScope(env)}`;
  const cached = readPlatformTenantCache(cache, cacheKey);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.A1_PLATFORM_TENANT_TIMEOUT_MS || 1200));
  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const statusCode = response.status || 503;
      const code = platformTenantErrorCode(statusCode, payload);
      const message = platformTenantErrorMessage(statusCode, payload);
      throw platformError(message, statusCode, code);
    }
    if (!payload.tenant) {
      if (strictModeEnabled(env)) throw platformError("A1 platform tenant not found", 404, "A1_PLATFORM_TENANT_NOT_FOUND");
      writePlatformTenantCache(cache, cacheKey, null, env);
      return null;
    }
    validatePlatformTenant(payload.tenant);
    writePlatformTenantCache(cache, cacheKey, payload.tenant, env);
    return payload.tenant;
  } catch (error) {
    if (error.statusCode) throw error;
    throw platformError(error.name === "AbortError" ? "A1 platform tenant lookup timed out" : error.message, 503, "A1_PLATFORM_TENANT_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

function readPlatformTenantCache(cache, key) {
  if (!cache) return undefined;
  const cached = cache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return cached.tenant;
}

function writePlatformTenantCache(cache, key, tenant, env = process.env) {
  if (!cache) return;
  const ttlMs = Number(env.A1_PLATFORM_TENANT_CACHE_MS || 10000);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
  cache.set(key, { tenant, expiresAt: Date.now() + ttlMs });
}

function platformTenantErrorCode(statusCode, payload = {}) {
  const errorPayload = platformTenantErrorPayload(payload);
  const code = errorPayload?.code;
  if ((statusCode === 401 || statusCode === 403) && !AUTH_STATUS_PRESERVED_CODES.has(code)) return "PLATFORM_AUTH_FAILED";
  if (code) return code;
  return "A1_PLATFORM_TENANT_UNAVAILABLE";
}

function platformTenantErrorMessage(statusCode, payload = {}) {
  return platformTenantErrorPayload(payload)?.message || `A1 platform tenant lookup failed with ${statusCode}`;
}

function platformTenantErrorPayload(payload = {}) {
  if (!payload || typeof payload !== "object") return null;
  if (!payload.error || typeof payload.error !== "object") return null;
  return payload.error;
}

function platformTenantCacheScope(env = process.env) {
  const token = String(env.A1_PLATFORM_TOKEN || "");
  const tokenScope = token
    ? crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)
    : "none";
  const strictScope = strictModeEnabled(env) ? "strict" : "open";
  return `${strictScope}|token:${tokenScope}`;
}

async function attachPlatformTenant(request, env = process.env, fetchImpl = globalThis.fetch, cache = null) {
  try {
    request.a1PlatformTenantLookupFailed = false;
    request.a1Tenant = await resolvePlatformTenant(request, env, fetchImpl, cache);
  } catch (error) {
    if (strictModeEnabled(env) || BLOCKING_TENANT_CODES.has(error.code)) throw error;
    request.a1Tenant = null;
    request.a1PlatformTenantLookupFailed = true;
  }
  return request.a1Tenant;
}

function validatePlatformTenant(tenant) {
  const status = String(tenant.status || "active").toLowerCase();
  if (status && status !== "active") {
    throw platformError("A1 platform tenant is disabled", 403, "TENANT_DISABLED");
  }
  const modules = Array.isArray(tenant.modules) ? tenant.modules : [];
  if (!modules.length) return;
  const studio = modules.find(module => platformModuleCode(module) === "studio");
  if (!studio || platformModuleDisabled(studio)) {
    throw platformError("A1 Studio module is disabled for this tenant", 403, "MODULE_DISABLED");
  }
}

function platformTenantOrgId(tenant) {
  if (!tenant || typeof tenant !== "object") return "";
  return String(tenant.orgId || tenant.org_id || tenant.organizationId || tenant.organization_id || "").trim();
}

function platformTenantResourceOrgId(request, env = process.env) {
  if (!platformResolutionEnabled(env)) return "";
  if (request.a1PlatformTenantLookupFailed) return UNMAPPED_PUBLIC_RESOURCE_ORG_ID;
  if (!request.a1Tenant) return UNMAPPED_PUBLIC_RESOURCE_ORG_ID;
  const tenantOrgId = platformTenantOrgId(request.a1Tenant);
  return tenantOrgId || UNMAPPED_PUBLIC_RESOURCE_ORG_ID;
}

function assertPlatformTenantUser(request, user, env = process.env) {
  if (!platformResolutionEnabled(env) || !request.a1Tenant) return;
  const tenantOrgId = platformTenantOrgId(request.a1Tenant);
  if (!tenantOrgId) {
    throw platformError("A1 platform tenant is not mapped to this organization", 403, "A1_PLATFORM_TENANT_ORG_UNMAPPED");
  }
  if (tenantOrgId && tenantOrgId !== user.org_id) {
    throw platformError("A1 platform tenant does not match this session", 403, "A1_PLATFORM_TENANT_SESSION_MISMATCH");
  }
}

function sanitizePlatformError(error) {
  const code = error?.code || "A1_PLATFORM_TENANT_UNAVAILABLE";
  return {
    ok: false,
    error: code,
    message: TENANT_UNAVAILABLE_CODES.has(code) ? "A1 Platform tenant is not available" : "A1 Platform tenant lookup failed"
  };
}

function platformError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = {
  assertPlatformTenantUser,
  attachPlatformTenant,
  platformResolutionEnabled,
  platformTenantResourceOrgId,
  platformTenantSummary,
  publicPlatformTenantSummary,
  resolvePlatformTenant,
  sanitizePlatformError
};
