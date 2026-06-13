const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");
const { registerLocalizationRoutes } = require("../server/localizationRoutes");

// A tiny mock app that captures registered handlers and provides app.auth,
// so the route logic is unit-tested without booting the full server.
function mockApp() {
  const routes = {};
  let authCalls = 0;
  return {
    routes,
    authCalls: () => authCalls,
    auth: async () => { authCalls += 1; return { id: "u1", org_id: "o1" }; },
    get(path, handler) { routes[`GET ${path}`] = handler; },
    post(path, handler) { routes[`POST ${path}`] = handler; },
  };
}

async function login(app) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers["set-cookie"];
}

test("localizationRoutes: registers the expected route set", () => {
  const app = mockApp();
  registerLocalizationRoutes(app);
  for (const r of [
    "GET /api/localization/chart-of-accounts",
    "GET /api/localization/hvhh",
    "GET /api/localization/regions",
    "GET /api/localization/phone",
    "POST /api/finance/vat-return/compute",
    "POST /api/finance/payroll/compute",
    "POST /api/finance/einvoice/build",
  ]) {
    assert.equal(typeof app.routes[r], "function", `missing ${r}`);
  }
});

test("localizationRoutes: chart-of-accounts returns the full chart and code lookups", async () => {
  const app = mockApp();
  registerLocalizationRoutes(app);
  const all = await app.routes["GET /api/localization/chart-of-accounts"]({ query: {} });
  assert.ok(all.accounts.length > 600);
  assert.equal(all.classes.length, 9);
  const one = await app.routes["GET /api/localization/chart-of-accounts"]({ query: { code: "251" } });
  assert.equal(one.hy, "Դրամարկղ");
  assert.equal(one.normalBalance, "debit");
});

test("localizationRoutes: vat-return/compute returns the summary and official form lines", async () => {
  const app = mockApp();
  registerLocalizationRoutes(app);
  const r = await app.routes["POST /api/finance/vat-return/compute"]({
    body: { sales: [{ netAmount: 1000000, vatRate: 20 }], purchases: [] },
  });
  assert.equal(r.summary.outputVat, 200000);
  assert.equal(r.form["7"].vat, 200000);
  assert.equal(r.formSource.sourceUrl, "https://www.arlis.am/hy/acts/136996");
  assert.equal(r.formSource.orderNumber, "N 298-Ն");
  assert.deepEqual(r.formLineDefinitions["7"].fields, ["base", "vat"]);
  assert.match(r.formLineDefinitions["23"].labelHy, /Հաշվետու ժամանակաշրջանի/);
});

test("localizationRoutes: einvoice/build returns XML and sets the content type", async () => {
  const app = mockApp();
  registerLocalizationRoutes(app);
  let contentType = "";
  const reply = { header: (k, v) => { if (k === "content-type") contentType = v; } };
  const xml = await app.routes["POST /api/finance/einvoice/build"]({ body: { number: "INV-1", lines: [] } }, reply);
  assert.match(xml, /<EInvoice/);
  assert.match(contentType, /xml/);
});

test("localizationRoutes: hvhh validation and every handler requires auth", async () => {
  const app = mockApp();
  registerLocalizationRoutes(app);
  const r = await app.routes["GET /api/localization/hvhh"]({ query: { value: "00123456" } });
  assert.equal(r.ok, true);
  assert.ok(app.authCalls() >= 1); // auth invoked
});

test("localizationRoutes: rejects malformed query and body metadata before engine calls", async () => {
  const app = mockApp();
  registerLocalizationRoutes(app);
  const invalid = { code: "INVALID_LOCALIZATION_METADATA", statusCode: 400 };
  await assert.rejects(
    () => app.routes["GET /api/localization/chart-of-accounts"]({ query: { code: { nested: "251" } } }),
    invalid
  );
  await assert.rejects(
    () => app.routes["GET /api/localization/hvhh"]({ query: { value: "00123456\nsecret-hvhh-query-token" } }),
    invalid
  );
  await assert.rejects(
    () => app.routes["GET /api/localization/phone"]({ query: { value: ["+37477123456"] } }),
    invalid
  );
  await assert.rejects(
    () => app.routes["POST /api/finance/vat-return/compute"]({ body: [{ sales: [] }] }),
    invalid
  );
  await assert.rejects(
    () => app.routes["POST /api/finance/vat-return/compute"]({ body: false }),
    invalid
  );
  await assert.rejects(
    () => app.routes["POST /api/finance/vat-return/compute"]({ body: { sales: {}, purchases: [] } }),
    invalid
  );
  await assert.rejects(
    () => app.routes["POST /api/finance/vat-return/compute"]({ body: { sales: [null], purchases: [] } }),
    invalid
  );
  await assert.rejects(
    () => app.routes["POST /api/finance/payroll/compute"]({ body: { gross: { value: 600000 } } }),
    invalid
  );
  const payroll = await app.routes["POST /api/finance/payroll/compute"]({ body: { gross: 500001 } });
  assert.equal(payroll.healthInsurance, 10800);
  assert.equal(payroll.net, 363201);
  await assert.rejects(
    () => app.routes["POST /api/finance/einvoice/build"]({ body: { number: "INV-1\nsecret-einvoice-token" } }),
    invalid
  );
  await assert.rejects(
    () => app.routes["POST /api/finance/einvoice/build"]({ body: { number: "INV-1", lines: {} } }),
    invalid
  );
  await assert.rejects(
    () => app.routes["POST /api/finance/einvoice/build"]({ body: { number: "INV-1", supplier: null, lines: [] } }),
    invalid
  );
  await assert.rejects(
    () => app.routes["POST /api/finance/einvoice/build"]({ body: { number: "INV-1", buyer: null, lines: [] } }),
    invalid
  );
});

test("localizationRoutes: real API returns 400 for malformed fiscal metadata without engine 500s", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const badRequests = [
      {
        url: "/api/finance/payroll/compute",
        payload: { gross: { value: 600000, token: "secret-localization-gross-object-token" } },
      },
      {
        url: "/api/finance/vat-return/compute",
        payload: { sales: {}, purchases: [] },
      },
      {
        url: "/api/finance/vat-return/compute",
        payload: { sales: [null], purchases: [] },
      },
      {
        url: "/api/finance/einvoice/build",
        payload: { number: "INV-1", lines: {} },
      },
      {
        url: "/api/finance/einvoice/build",
        payload: { number: "INV-1", supplier: null, lines: [] },
      },
      {
        url: "/api/finance/einvoice/build",
        payload: { number: "INV-1", buyer: null, lines: [] },
      },
    ];
    for (const item of badRequests) {
      const res = await app.inject({
        method: "POST",
        url: item.url,
        headers: { cookie },
        payload: item.payload,
      });
      assert.equal(res.statusCode, 400, `${item.url}: ${res.body}`);
      assert.match(res.body, /Localization request requires safe metadata|Payroll gross must be a safe non-negative amount/);
      assert.doesNotMatch(res.body, /secret-localization-gross-object-token|not iterable|map is not a function|Cannot read/);
    }
  } finally {
    await app.close();
  }
});
