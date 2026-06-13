// Localization API routes — exposes the localization/fiscal engines over HTTP.
//
// Locale-aware: every handler resolves the ACTIVE locale profile via require("./locale")
// (A1_LOCALE → "am" default | "ru") and calls the normalized facade, so the same routes
// serve the Republic-of-Armenia (RA) or Russian-Federation (RF) engines depending on
// deployment. With A1_LOCALE unset/"am" the responses are byte-identical to before.
//
// Every handler is STATELESS (it calls a pure engine and touches no tenant data), but
// still requires an authenticated session (app.auth) per the suite's access policy.
// Registered from buildApp via registerLocalizationRoutes(app), kept in its own module
// to minimize the footprint inside the large app.js.

const locale = require("./locale");
const { computeRuVatReturn } = require("./ruVatReturn");

const MAX_QUERY_TEXT_LENGTH = 160;
const MAX_JSON_STRING_LENGTH = 1000;
const MAX_JSON_ARRAY_LENGTH = 100;
const MAX_JSON_KEYS = 80;
const MAX_JSON_DEPTH = 8;
const MAX_PAYROLL_GROSS = 1000000000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function hasControlCharacters(value) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

function invalidLocalizationMetadata(message = "Localization request requires safe metadata") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "INVALID_LOCALIZATION_METADATA";
  return error;
}

function normalizeOptionalQueryText(query, key) {
  const value = query && query[key];
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw invalidLocalizationMetadata();
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_QUERY_TEXT_LENGTH || hasControlCharacters(trimmed)) {
    throw invalidLocalizationMetadata();
  }
  return trimmed;
}

function assertSafeJson(value, depth = 0) {
  if (depth > MAX_JSON_DEPTH) throw invalidLocalizationMetadata();
  if (value == null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw invalidLocalizationMetadata();
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_JSON_STRING_LENGTH || hasControlCharacters(value)) throw invalidLocalizationMetadata();
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_LENGTH) throw invalidLocalizationMetadata();
    for (const item of value) assertSafeJson(item, depth + 1);
    return;
  }
  if (!isPlainObject(value)) throw invalidLocalizationMetadata();
  const entries = Object.entries(value);
  if (entries.length > MAX_JSON_KEYS) throw invalidLocalizationMetadata();
  for (const [key, child] of entries) {
    if (typeof key !== "string" || key.length > MAX_QUERY_TEXT_LENGTH || hasControlCharacters(key)) {
      throw invalidLocalizationMetadata();
    }
    assertSafeJson(child, depth + 1);
  }
}

function normalizeBodyObject(body) {
  const value = body === undefined || body === null ? {} : body;
  if (!isPlainObject(value)) throw invalidLocalizationMetadata();
  assertSafeJson(value);
  return value;
}

function normalizePayrollBody(body) {
  const input = normalizeBodyObject(body);
  const value = input.gross != null ? input.gross : input.monthGross;
  const gross = typeof value === "number" ? value : (typeof value === "string" && value.trim() ? Number(value) : NaN);
  if (!Number.isFinite(gross) || gross < 0 || gross > MAX_PAYROLL_GROSS) {
    throw invalidLocalizationMetadata("Payroll gross must be a safe non-negative amount");
  }
  return {
    ...input,
    gross,
    monthGross: gross,
  };
}

function normalizePlainObjectArray(body, key) {
  const value = body[key];
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_JSON_ARRAY_LENGTH) {
    throw invalidLocalizationMetadata();
  }
  for (const item of value) {
    if (!isPlainObject(item)) throw invalidLocalizationMetadata();
  }
  return value;
}

function normalizeOptionalPlainObject(body, key) {
  const value = body[key];
  if (value === undefined) return {};
  if (!isPlainObject(value)) throw invalidLocalizationMetadata();
  return value;
}

function normalizeVatReturnPeriod(body) {
  const period = normalizeBodyObject(body);
  return {
    ...period,
    sales: normalizePlainObjectArray(period, "sales"),
    purchases: normalizePlainObjectArray(period, "purchases")
  };
}

function normalizeEInvoiceBody(body) {
  const invoice = normalizeBodyObject(body);
  return {
    ...invoice,
    supplier: normalizeOptionalPlainObject(invoice, "supplier"),
    buyer: normalizeOptionalPlainObject(invoice, "buyer"),
    lines: normalizePlainObjectArray(invoice, "lines")
  };
}

function registerLocalizationRoutes(app) {
  // Active-locale profile: currency, tax-id label, phone country code, capabilities.
  // Lets the frontend render the right labels/format for the deployment's locale.
  app.get("/api/localization/config", async (request) => {
    await app.auth(request);
    const L = locale.active();
    return {
      locale: L.locale,
      locales: locale.LOCALES,
      country: L.meta.country,
      language: L.meta.language,
      currency: L.meta.currency,
      taxId: L.meta.taxId,
      phone: L.meta.phone,
      capabilities: {
        vatReturnForm: L.meta.vat.supportsReturnForm,
        payroll: L.payroll.supports,
        chartOfAccounts: L.chartOfAccounts.accounts().length,
        regions: L.regions.all().length,
      },
    };
  });

  // Full chart of accounts for the active locale, or a single code via ?code=
  app.get("/api/localization/chart-of-accounts", async (request) => {
    await app.auth(request);
    const L = locale.active();
    const code = normalizeOptionalQueryText(request.query, "code");
    if (code) {
      const account = L.chartOfAccounts.byCode(code);
      return account
        ? { ...account, normalBalance: L.chartOfAccounts.normalBalance(code) }
        : { error: "unknown account code" };
    }
    return { classes: L.chartOfAccounts.classes(), accounts: L.chartOfAccounts.accounts() };
  });

  // Validate the active locale's business tax id (RA ՀՎՀՀ / RF ИНН).
  app.get("/api/localization/hvhh", async (request) => {
    await app.auth(request);
    return locale.active().taxId.validate(normalizeOptionalQueryText(request.query, "value"));
  });

  app.get("/api/localization/regions", async (request) => {
    await app.auth(request);
    return { regions: locale.active().regions.all() };
  });

  app.get("/api/localization/phone", async (request) => {
    await app.auth(request);
    const L = locale.active();
    const value = normalizeOptionalQueryText(request.query, "value");
    return {
      valid: L.phone.isValid(value),
      e164: L.phone.e164(value),
      formatted: L.phone.format(value),
    };
  });

  app.post("/api/finance/vat-return/compute", async (request) => {
    await app.auth(request);
    const L = locale.active();
    const period = normalizeVatReturnPeriod(request.body);
    if (!L.vat.supportsReturnForm) {
      // RU has no SRC-style return form; compute the RF НДС settlement from the period inputs.
      return computeRuVatReturn(period, L.vat);
    }
    const form = L.vat.returnForm(period);
    return {
      summary: L.vat.computeReturn(period),
      form: form.lines,
      formSource: form.source,
      formLineDefinitions: form.lineDefinitions,
    };
  });

  app.post("/api/finance/payroll/compute", async (request) => {
    await app.auth(request);
    return locale.active().payroll.computeMonthly(normalizePayrollBody(request.body));
  });

  app.post("/api/finance/einvoice/build", async (request, reply) => {
    await app.auth(request);
    if (reply && typeof reply.header === "function") {
      reply.header("content-type", "application/xml; charset=utf-8");
    }
    return locale.active().einvoice.build(normalizeEInvoiceBody(request.body));
  });
}

module.exports = { registerLocalizationRoutes };
