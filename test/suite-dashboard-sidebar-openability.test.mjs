import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { DEFAULT_PASSWORD } = require("../server/db");
const { buildApp } = require("../server/app");
const { normalizeSuiteAppId } = require("../web/src/suite-routes.js");

const USERS = [
  "owner@armosphera.local",
  "operator@armosphera.local",
  "support@armosphera.local",
  "accountant@armosphera.local",
  "lawyer@armosphera.local",
  "sales@armosphera.local",
  "service.manager@armosphera.local",
  "auditor@armosphera.local"
];

async function startServer() {
  const app = buildApp({ dbPath: ":memory:" });
  await app.ready();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  const port = typeof address === "string" ? Number(address.split(":").pop()) : address.port;
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}

function parseSetCookieHeader(setCookie) {
  const [name, value] = setCookie.split(";")[0].split("=");
  return { name, value };
}

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: DEFAULT_PASSWORD })
  });
  assert.equal(response.status, 200, `login failed for ${email}: ${response.status}`);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, `login response missing set-cookie for ${email}`);
  return parseSetCookieHeader(setCookie);
}

async function verifyRoleNavigation(baseUrl, browser, email) {
  const { name, value } = await login(baseUrl, email);
  const cookie = `${name}=${value}`;
  const suiteResponse = await fetch(`${baseUrl}/api/suite`, { headers: { cookie } });
  assert.equal(suiteResponse.status, 200, `suite API failed for ${email}`);
  const suite = await suiteResponse.json();
  assert.ok(Array.isArray(suite.apps), `suite.apps invalid for ${email}`);

  const context = await browser.newContext();
  try {
    await context.addCookies([{
      name,
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax"
    }]);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/app/crm`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("nav.app-nav button");

    const sidebarButtons = await page.$$eval("nav.app-nav button", buttons =>
      buttons.map(button => ({
        appId: button.dataset.appId || "",
        targetAppId: button.dataset.targetAppId || "",
        label: button.textContent.trim()
      }))
    );

    const assignedAppIds = suite.apps.map(app => app.id);
    assert.equal(sidebarButtons.length, suite.apps.length, `sidebar button count mismatch for ${email}`);

    for (let index = 0; index < suite.apps.length; index += 1) {
      const suiteApp = suite.apps[index];
      const button = sidebarButtons[index];
      const expectedTargetAppId = normalizeSuiteAppId(suiteApp.id, assignedAppIds);
      const selector = `nav.app-nav button:nth-child(${index + 1})`;

      if (button.appId) {
        assert.equal(button.appId, suiteApp.id, `sidebar button order mismatch for ${email}`);
        assert.equal(button.targetAppId, expectedTargetAppId, `sidebar target mismatch for ${suiteApp.id} (${email})`);
      }

      const expectedPath = `/app/${expectedTargetAppId}`;
      const currentPath = new URL(page.url()).pathname;
      if (currentPath === expectedPath) {
        await page.locator(selector).click();
        await page.waitForTimeout(120);
      } else {
        await Promise.all([
          page.locator(selector).first().click(),
          page.waitForURL(new RegExp(`${expectedPath.replace("/", "\\/")}(\\?|#|$)`), { timeout: 1500 })
        ]);
      }

      const path = new URL(page.url()).pathname;
      assert.equal(path, expectedPath, `${email} failed to open ${suiteApp.id}`);
      const anchorVisible = await page.locator(`#suite-app-${expectedTargetAppId}`).count();
      assert.equal(anchorVisible, 1, `${suiteApp.id} anchor missing for ${email}`);
    }
  } finally {
    await context.close();
  }
}

test("dashboard sidebar opens every assigned app for all seeded roles", async () => {
  const { app, baseUrl } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const email of USERS) {
      await verifyRoleNavigation(baseUrl, browser, email);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    await app.close();
  }
});
