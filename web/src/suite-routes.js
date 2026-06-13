export const SUITE_APP_IDS = ["crm", "finance", "copilot", "desk", "campaigns", "projects", "inventory", "purchase", "people", "docs", "analytics", "flow", "forms"];

export const SUITE_APP_ROUTE_ALIASES = {
  forms: "campaigns",
  hayhashvapah: "finance"
};

function canonicalSuiteAppId(appId) {
  const normalizedAppId = typeof appId === "string" ? appId.trim().toLowerCase() : "";
  return SUITE_APP_ROUTE_ALIASES[normalizedAppId] || normalizedAppId;
}

function firstCanonicalAssignedAppId(assignedApps) {
  if (!Array.isArray(assignedApps)) return "";
  for (const assignedAppId of assignedApps) {
    const canonical = canonicalSuiteAppId(assignedAppId);
    if (SUITE_APP_IDS.includes(canonical)) return canonical;
  }
  return "";
}

export function normalizeSuiteAppId(appId, assignedApps = null) {
  const canonical = canonicalSuiteAppId(appId);
  if (SUITE_APP_IDS.includes(canonical)) return canonical;
  if (assignedApps) {
    return firstCanonicalAssignedAppId(assignedApps) || "crm";
  }
  return "crm";
}

export function normalizeSuiteAppIds(appIds = []) {
  const normalized = [];
  const seen = new Set();
  for (const appId of appIds || []) {
    const normalizedAppId = normalizeSuiteAppId(appId, appIds);
    if (normalizedAppId && !seen.has(normalizedAppId)) {
      seen.add(normalizedAppId);
      normalized.push(normalizedAppId);
    }
  }
  return normalized;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function appIdFromLocation(pathname = window.location.pathname) {
  const match = String(pathname || "").match(/^\/app\/([^/?#]+)/);
  const appId = match ? safeDecodeURIComponent(match[1]) : "";
  return normalizeSuiteAppId(appId);
}

export function appRoute(appId) {
  return `/app/${encodeURIComponent(normalizeSuiteAppId(appId))}`;
}
