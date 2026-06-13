const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const PRODUCT = Object.freeze({
  name: "A1 Suite",
  slug: "armosphera-one-claude",
  appSupportDir: "ArmospheraOneClaude"
});

function computeDataDir(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.A1_STUDIO_DATA_DIR) return env.A1_STUDIO_DATA_DIR;
  if (env.ARMOSPHERA_ONE_DATA_DIR) return env.ARMOSPHERA_ONE_DATA_DIR;
  if (platform === "darwin") return path.join(home, "Library", "Application Support", PRODUCT.appSupportDir);
  if (platform === "win32") {
    const appData = env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, PRODUCT.appSupportDir);
  }
  const xdg = env.XDG_DATA_HOME || path.join(home, ".local", "share");
  return path.join(xdg, PRODUCT.slug);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveDataDir() {
  return ensureDir(computeDataDir());
}

function resolveDbPath() {
  if (process.env.A1_STUDIO_SQLITE) return process.env.A1_STUDIO_SQLITE;
  if (process.env.ARMOSPHERA_ONE_DB) return process.env.ARMOSPHERA_ONE_DB;
  return path.join(resolveDataDir(), "armosphera-one.db");
}

function resolveLawsDbPath() {
  return process.env.ARMOSPHERA_ONE_LAWS_DB || path.join(computeDataDir(), "laws.sqlite");
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const PUBLIC_CLIENT_IP_HEADERS = new Set(["cf-connecting-ip", "x-real-ip", "x-forwarded-for"]);

function allowEgress(env = process.env) {
  return env.ARMOSPHERA_ONE_ALLOW_EGRESS === "1";
}

function egressAllowlist(env = process.env) {
  return String(env.ARMOSPHERA_ONE_EGRESS_ALLOWLIST || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

class EgressBlockedError extends Error {
  constructor(host) {
    super(`egress blocked: ${host} — outbound network is off. Set ARMOSPHERA_ONE_ALLOW_EGRESS=1 and add the host to ARMOSPHERA_ONE_EGRESS_ALLOWLIST.`);
    this.name = "EgressBlockedError";
    this.code = "EGRESS_BLOCKED";
    this.statusCode = 403;
  }
}

function hostOf(url) {
  try {
    let h = new URL(url).hostname.toLowerCase();
    if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1); // IPv6 literal [::1] -> ::1
    if (h.endsWith(".")) h = h.slice(0, -1);                       // strip FQDN trailing dot
    return h;
  } catch { return ""; }
}

function assertEgressAllowed(url, env = process.env) {
  const host = hostOf(url);
  if (LOOPBACK.has(host)) return; // loopback is always permitted — local-first IPC is never gated
  if (!allowEgress(env)) throw new EgressBlockedError(host || String(url));
  const list = egressAllowlist(env);
  if (!list.includes(host)) throw new EgressBlockedError(host || String(url)); // deny unless explicitly allowlisted
}

function normalizeIpLiteral(value) {
  let ip = String(value || "").trim();
  if (!ip || ip.length > 64) return "";
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped && net.isIP(mapped[1]) === 4) return mapped[1];
  return net.isIP(ip) ? ip.toLowerCase() : "";
}

function publicTrustedProxyIps(env = process.env) {
  return new Set(String(env.ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS || "")
    .split(",")
    .map(normalizeIpLiteral)
    .filter(Boolean));
}

function publicClientIpHeader(env = process.env) {
  const header = String(env.ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER || "").trim().toLowerCase();
  return PUBLIC_CLIENT_IP_HEADERS.has(header) ? header : "";
}

function headerValue(headers = {}, name = "") {
  const lowerName = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === lowerName) {
      if (Array.isArray(value)) return value[0];
      return value;
    }
  }
  return "";
}

function resolvePublicClientIpDetails(input = {}, env = process.env) {
  const directIp = normalizeIpLiteral(input.directIp) || String(input.directIp || "").trim().slice(0, 64);
  const trustedProxies = publicTrustedProxyIps(env);
  if (!directIp || !trustedProxies.has(directIp)) return { ip: directIp, source: "direct" };
  const header = publicClientIpHeader(env);
  if (!header) return { ip: directIp, source: "direct" };
  const raw = headerValue(input.headers, header);
  if (header === "x-forwarded-for" && String(raw || "").includes(",")) {
    return { ip: directIp, source: "trusted-proxy-fallback", reason: "multi-value-x-forwarded-for" };
  }
  const candidate = String(raw || "").split(",")[0].trim();
  const forwardedIp = normalizeIpLiteral(candidate);
  if (forwardedIp) return { ip: forwardedIp, source: "trusted-header", header };
  return { ip: directIp, source: "trusted-proxy-fallback", reason: "invalid-client-ip-header" };
}

function resolvePublicClientIp(input = {}, env = process.env) {
  return resolvePublicClientIpDetails(input, env).ip;
}

let fetchImpl = (...args) => globalThis.fetch(...args);
function setFetchImpl(fn) { fetchImpl = fn; }

async function safeFetch(url, options, env = process.env) {
  assertEgressAllowed(url, env);
  return fetchImpl(url, options);
}

const ai = Object.freeze({
  provider: process.env.AI_PROVIDER || "local",
  localBaseUrl: process.env.LOCAL_AI_BASE_URL || "http://127.0.0.1:11434/v1",
  localModel: process.env.LOCAL_AI_MODEL || "gemma3:4b",
  // OpenRouter is the single cloud provider; the concrete model comes from the
  // live model menu selected during onboarding (empty default = "auto / pick one").
  copilotProvider: process.env.COPILOT_PROVIDER || "openrouter",
  copilotModel: process.env.COPILOT_MODEL || "",
  copilotLanguage: process.env.COPILOT_LANGUAGE || "hy-AM"
});

// OpenRouter — the one cloud aggregator. Its model catalog is fetched live so the
// onboarding dropdown always reflects up-to-date selections (see server/aiProvider.js).
const OPENROUTER_HOST = "openrouter.ai";
const openrouter = Object.freeze({
  host: OPENROUTER_HOST,
  baseUrl: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
  modelsUrl: process.env.OPENROUTER_MODELS_URL || "https://openrouter.ai/api/v1/models",
  // Optional attribution headers OpenRouter recommends for ranking/analytics.
  referer: process.env.OPENROUTER_REFERER || "https://a1.am",
  title: process.env.OPENROUTER_TITLE || "A1 Suite"
});

// Per-aspect model policy. Empty string = inherit `default`; empty `default` =
// "auto" until the user picks a model from the live menu. Module overrides
// (finance/crm/docs) win over the per-aspect ones (copilot/transform).
const aiModels = Object.freeze({
  default: process.env.A1_MODEL_DEFAULT || "",
  copilot: process.env.A1_MODEL_COPILOT || "",
  transform: process.env.A1_MODEL_TRANSFORM || "",
  finance: process.env.A1_MODEL_FINANCE || "",
  crm: process.env.A1_MODEL_CRM || "",
  docs: process.env.A1_MODEL_DOCS || ""
});

// Open Notebook (lfnovo/open-notebook) — opt-in AI source that sits *beside* the
// local RAG. We connect to a self-hosted instance over its REST API; we never
// bundle its Python/SurrealDB runtime. The API key lives in the local settings store.
const openNotebook = Object.freeze({
  enabled: process.env.OPEN_NOTEBOOK_ENABLED === "1",
  baseUrl: (process.env.OPEN_NOTEBOOK_BASE_URL || "").replace(/\/+$/, "")
});

const lawEmbed = Object.freeze({
  model: process.env.LAW_EMBED_MODEL || "bge-m3",
  baseUrl: (process.env.LAW_EMBED_BASE || "http://127.0.0.1:11434").replace(/\/+$/, "")
});

// OpenRouter outbound is allowed only when egress is globally enabled AND
// openrouter.ai is explicitly allowlisted (deny-until-listed — same gate as safeFetch).
function isOpenRouterEgressAllowed(env = process.env) {
  return allowEgress(env) && egressAllowlist(env).includes(OPENROUTER_HOST);
}

module.exports = {
  PRODUCT,
  computeDataDir, ensureDir, resolveDataDir, resolveDbPath, resolveLawsDbPath,
  allowEgress, egressAllowlist, assertEgressAllowed, EgressBlockedError,
  publicTrustedProxyIps, publicClientIpHeader, resolvePublicClientIp, resolvePublicClientIpDetails,
  safeFetch, setFetchImpl,
  isOpenRouterEgressAllowed,
  ai, openrouter, aiModels, openNotebook, lawEmbed
};
