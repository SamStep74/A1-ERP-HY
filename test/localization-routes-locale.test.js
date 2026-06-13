"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { registerLocalizationRoutes } = require("../server/localizationRoutes");

// Exercises the locale-AWARE behavior of the localization routes (the AM-default
// behavior is covered by localization-routes.test.js). Uses a mock app so the real
// handlers run without booting the server; A1_LOCALE is toggled per case.
function makeApp() {
  const routes = {};
  return {
    routes,
    auth: async () => {},
    get(path, handler) { routes["GET " + path] = handler; },
    post(path, handler) { routes["POST " + path] = handler; },
    async call(method, path, { query = {}, body = {} } = {}) {
      const handler = routes[method + " " + path];
      if (!handler) throw new Error("no route: " + method + " " + path);
      const reply = { headers: {}, header(k, v) { this.headers[k] = v; return this; } };
      return handler({ query, body }, reply);
    },
  };
}

// Async-aware: awaits fn BEFORE restoring A1_LOCALE, so handlers that read the env
// after an `await` still see the locale under test. (node runs each test file in its
// own process, so the global env mutation is isolated from other files.)
async function withLocale(value, fn) {
  const prev = process.env.A1_LOCALE;
  if (value === undefined) delete process.env.A1_LOCALE;
  else process.env.A1_LOCALE = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.A1_LOCALE;
    else process.env.A1_LOCALE = prev;
  }
}

const app = makeApp();
registerLocalizationRoutes(app);

test("GET /config exposes the active locale profile (AM default)", async () => {
  await withLocale(undefined, async () => {
    const cfg = await app.call("GET", "/api/localization/config");
    assert.equal(cfg.locale, "am");
    assert.deepEqual(cfg.locales, ["am", "ru"]);
    assert.equal(cfg.currency.code, "AMD");
    assert.equal(cfg.taxId.label, "ՀՎՀՀ");
    assert.equal(cfg.phone.countryCode, "374");
    assert.equal(cfg.capabilities.vatReturnForm, true);
  });
});

test("GET /config + engines serve the RF profile when A1_LOCALE=ru", async () => {
  await withLocale("ru", async () => {
    const cfg = await app.call("GET", "/api/localization/config");
    assert.equal(cfg.locale, "ru");
    assert.equal(cfg.currency.code, "RUB");
    assert.equal(cfg.taxId.label, "ИНН");
    assert.equal(cfg.phone.countryCode, "7");
    assert.equal(cfg.capabilities.vatReturnForm, false);
    assert.equal(cfg.capabilities.chartOfAccounts, 73);
    assert.equal(cfg.capabilities.regions, 83);

    // tax id endpoint now validates ИНН
    const inn = await app.call("GET", "/api/localization/hvhh", { query: { value: "7707083893" } });
    assert.equal(inn.ok, true);

    // chart of accounts serves План счетов 94н
    const acc = await app.call("GET", "/api/localization/chart-of-accounts", { query: { code: "51" } });
    assert.equal(acc.ru, "Расчётные счета");
    assert.equal(acc.normalBalance, "debit");

    // phone normalizes to +7
    const phone = await app.call("GET", "/api/localization/phone", { query: { value: "8 (495) 123-45-67" } });
    assert.equal(phone.e164, "+74951234567");
    assert.equal(phone.valid, true);

    // regions are the RF federal subjects
    const reg = await app.call("GET", "/api/localization/regions");
    assert.equal(reg.regions.length, 83);

    // payroll runs the RF engine (gross 100k → НДФЛ 13k / net 87k)
    const payroll = await app.call("POST", "/api/finance/payroll/compute", { body: { gross: 100000 } });
    assert.equal(payroll.ndfl, 13000);
    assert.equal(payroll.net, 87000);
    const progressivePayroll = await app.call("POST", "/api/finance/payroll/compute", {
      body: { gross: 100000, ytdBaseBefore: 2400000 },
    });
    assert.equal(progressivePayroll.ndfl, 15000);

    // e-invoice builds RF XML
    const xml = await app.call("POST", "/api/finance/einvoice/build", { body: { number: "INV-1", lines: [] } });
    assert.match(xml, /^<\?xml/);
  });
});

test("vat-return/compute: RU returns the RF НДС settlement, AM returns the SRC form", async () => {
  await withLocale("ru", async () => {
    const res = await app.call("POST", "/api/finance/vat-return/compute", {
      body: { sales: [{ netAmount: 1000, vatRate: 22 }], purchases: [] },
    });
    assert.equal(res.kind, "ru-nds-return");
    assert.equal(res.currency, "RUB");
    assert.equal(res.outputVat, 220); // 1000 * 22% (2026 base rate)
  });
  await withLocale("am", async () => {
    const res = await app.call("POST", "/api/finance/vat-return/compute", {
      body: { sales: [{ netAmount: 1000000, vatRate: 20 }], purchases: [] },
    });
    assert.equal(res.summary.outputVat, 200000);
    assert.ok(Array.isArray(res.form) || typeof res.form === "object");
  });
});

test("unknown A1_LOCALE falls back to AM (safe default)", async () => {
  await withLocale("xx", async () => {
    const cfg = await app.call("GET", "/api/localization/config");
    assert.equal(cfg.locale, "am");
    assert.equal(cfg.currency.code, "AMD");
  });
});
