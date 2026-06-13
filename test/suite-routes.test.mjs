import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DEFAULT_PASSWORD } = require("../server/db");
const { buildApp } = require("../server/app");
import {
  appIdFromLocation,
  appRoute,
  normalizeSuiteAppId,
  normalizeSuiteAppIds,
  SUITE_APP_IDS
} from "../web/src/suite-routes.js";

const ROLES = [
  { email: "owner@armosphera.local" },
  { email: "operator@armosphera.local" },
  { email: "support@armosphera.local" },
  { email: "accountant@armosphera.local" },
  { email: "lawyer@armosphera.local" },
  { email: "sales@armosphera.local" },
  { email: "service.manager@armosphera.local" },
  { email: "auditor@armosphera.local" }
];

test("suite route helpers normalize form alias to campaigns", () => {
  assert.equal(normalizeSuiteAppId("forms"), "campaigns");
  assert.equal(appIdFromLocation("/app/forms"), "campaigns");
  assert.equal(appRoute("campaigns"), "/app/campaigns");
});

test("suite route helpers map legacy hayhashvapah alias", () => {
  assert.equal(normalizeSuiteAppId("hayhashvapah"), "finance");
  assert.equal(appIdFromLocation("/app/hayhashvapah"), "finance");
});

test("suite route helpers tolerate malformed encoded app ids", () => {
  assert.equal(appIdFromLocation("/app/%E0%A4%A"), "crm");
  assert.equal(appIdFromLocation("/app/%ZZ"), "crm");
});

test("suite route helpers normalize app id casing and surrounding whitespace", () => {
  assert.equal(normalizeSuiteAppId(" Finance ", ["crm", "finance"]), "finance");
  assert.equal(appIdFromLocation("/app/Finance"), "finance");
  assert.equal(appIdFromLocation("/app/%20copilot%20"), "copilot");
});

test("appRoute emits canonical suite app paths", () => {
  assert.equal(appRoute(" Finance "), "/app/finance");
  assert.equal(appRoute("hayhashvapah"), "/app/finance");
  assert.equal(appRoute("legacy"), "/app/crm");
});

test("suite route helpers normalize explicit aliases before assignment", () => {
  assert.equal(normalizeSuiteAppId("forms", ["forms"]), "campaigns");
  assert.deepEqual(normalizeSuiteAppIds(["forms"]), ["campaigns"]);
});

test("normalizeSuiteAppIds de-duplicates alias collapse", () => {
  const normalized = normalizeSuiteAppIds(["forms", "campaigns", "crm", "forms"]);
  assert.deepEqual(normalized, ["campaigns", "crm"]);
});

test("normalizeSuiteAppIds rejects stale invalid assignment ids", () => {
  assert.equal(normalizeSuiteAppId("legacy", ["legacy", "forms", "finance"]), "campaigns");
  assert.deepEqual(normalizeSuiteAppIds(["legacy", "forms", "finance"]), ["campaigns", "finance"]);
  assert.deepEqual(normalizeSuiteAppIds(["legacy"]), ["crm"]);
});

test("canonical app ids remain from all known suite apps", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  await app.ready();
  try {
    for (const { email } of ROLES) {
      const login = await app.inject({
        method: "POST",
        url: "/api/login",
        payload: { email, password: DEFAULT_PASSWORD }
      });
      assert.equal(login.statusCode, 200, `login failed for ${email}`);
      const cookie = login.headers["set-cookie"];
      const suite = await app.inject({ method: "GET", url: "/api/suite", headers: { cookie } });
      assert.equal(suite.statusCode, 200, `suite request failed for ${email}`);

      const data = suite.json();
      const normalized = normalizeSuiteAppIds((data.apps || []).map(app => app.id));
      for (const appId of data.apps?.map(app => app.id) || []) {
        const route = appRoute(normalizeSuiteAppId(appId));
        assert.ok(route.startsWith("/app/"), `bad route for ${appId} in ${email}`);
      }

      for (const appId of normalized) {
        assert.ok(SUITE_APP_IDS.includes(appId), `normalized app not in allow-list for ${email}: ${appId}`);
      }
    }
  } finally {
    await app.close();
  }
});
