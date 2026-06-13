const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

(async () => {
  const app = buildApp({ dbPath: ":memory:" });
  await app.ready();
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD }
  });
  if (login.statusCode !== 200) throw new Error(`login failed: ${login.statusCode}`);
  const cookie = login.headers["set-cookie"];
  const suite = await app.inject({ method: "GET", url: "/api/suite", headers: { cookie } });
  if (suite.statusCode !== 200) throw new Error(`suite failed: ${suite.statusCode}`);
  const body = suite.json();
  console.log(`smoke ok: ${body.organization.name}, apps=${body.apps.length}, kpis=${body.kpis.length}`);
  await app.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});

