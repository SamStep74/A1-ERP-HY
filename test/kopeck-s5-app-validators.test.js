"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

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

async function login(app) {
  const res = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD }
  });
  return res.headers["set-cookie"];
}

function openPeriod(app, orgId) {
  return app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1")
    .get(orgId).period_key;
}

test("kopeck S5: finance validators store RUB kopecks without double-scaling ledger postings", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const cookie = await login(app);
      const orgId = "org-armosphera-demo";
      const period = openPeriod(app, orgId);

      const expense = await app.inject({
        method: "POST",
        url: "/api/finance/expenses",
        headers: { cookie },
        payload: {
          description: "RUB expense with kopecks",
          vendor: "OOO Decimal",
          subtotal: "1000.45",
          vat: "220.10",
          incurredOn: `${period}-05`
        }
      });
      assert.equal(expense.statusCode, 200, expense.body);
      assert.equal(expense.json().expense.subtotal, 100045);
      assert.equal(expense.json().expense.vat, 22010);
      assert.equal(expense.json().expense.total, 122055);
      assert.deepEqual(
        app.db.prepare("SELECT amount FROM ledger_journal WHERE org_id = ? AND source_type = 'expense' AND source_id = ? ORDER BY amount")
          .all(orgId, expense.json().expense.id).map(row => row.amount),
        [22010, 100045]
      );

      const bill = await app.inject({
        method: "POST",
        url: "/api/finance/bills",
        headers: { cookie },
        payload: {
          supplier: "OOO Decimal AP",
          subtotal: "500.12",
          vat: "100.34",
          billDate: `${period}-06`,
          dueDate: `${period}-20`
        }
      });
      assert.equal(bill.statusCode, 200, bill.body);
      assert.equal(bill.json().bill.total, 60046);

      const paid = await app.inject({
        method: "POST",
        url: `/api/finance/bills/${bill.json().bill.id}/pay`,
        headers: { cookie },
        payload: { amount: "600.46", paidAt: `${period}-21`, reference: "S5-BILL-PAID" }
      });
      assert.equal(paid.statusCode, 200, paid.body);
      assert.equal(paid.json().payment.amount, 60046);
      assert.equal(
        app.db.prepare("SELECT amount FROM ledger_journal WHERE org_id = ? AND source_type = 'bill_payment' AND source_id = ?")
          .get(orgId, paid.json().payment.id).amount,
        60046
      );

      app.db.prepare(`
        INSERT INTO invoices (id, org_id, customer_id, number, status, total, vat, due_date)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?)
      `).run("inv-s5-payment", orgId, "cust-nare", "S5-PAY-001", 122055, 22010, `${period}-28`);
      const payment = await app.inject({
        method: "POST",
        url: "/api/finance/invoices/inv-s5-payment/payments",
        headers: { cookie },
        payload: { amount: "1220.55", paidAt: `${period}-22`, reference: "S5-INVOICE-PAID" }
      });
      assert.equal(payment.statusCode, 200, payment.body);
      assert.equal(payment.json().payment.amount, 122055);
      assert.equal(payment.json().invoice.status, "paid");
      assert.equal(
        app.db.prepare("SELECT amount FROM ledger_journal WHERE org_id = ? AND source_type = 'payment' AND source_id = ?")
          .get(orgId, payment.json().payment.id).amount,
        122055
      );

      app.db.prepare(`
        INSERT INTO invoices (id, org_id, customer_id, number, status, total, vat, due_date)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?)
      `).run("inv-s5-bank", orgId, "cust-nare", "S5-BANK-001", 32145, 0, `${period}-28`);
      const imported = await app.inject({
        method: "POST",
        url: "/api/finance/bank-transactions",
        headers: { cookie },
        payload: {
          bankName: "Tinkoff",
          transactionDate: `${period}-23`,
          amount: "321.45",
          direction: "credit",
          description: "Payment for S5-BANK-001",
          reference: "S5-BANK-001"
        }
      });
      assert.equal(imported.statusCode, 200, imported.body);
      assert.equal(imported.json().transaction.amount, 32145);
      assert.equal(imported.json().transaction.status, "matched");

      const reconciled = await app.inject({
        method: "POST",
        url: `/api/finance/bank-transactions/${imported.json().transaction.id}/reconcile`,
        headers: { cookie }
      });
      assert.equal(reconciled.statusCode, 200, reconciled.body);
      assert.equal(reconciled.json().payment.amount, 32145);
      assert.equal(reconciled.json().transaction.status, "reconciled");
    } finally {
      await app.close();
    }
  });
});

test("kopeck S5: CRM, catalog, and quote validators accept active subunit precision", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const cookie = await login(app);
      const orgId = "org-armosphera-demo";

      const item = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie },
        payload: {
          sku: "S5-RUB-SERVICE",
          categoryId: "catcat-service-packages",
          name: "RUB service with kopecks",
          listPrice: "1220.55",
          standardCost: "800.05"
        }
      });
      assert.equal(item.statusCode, 200, item.body);
      assert.equal(item.json().item.listPrice, 122055);
      assert.equal(item.json().item.standardCost, 80005);

      const patched = await app.inject({
        method: "PATCH",
        url: `/api/catalog/items/${item.json().item.id}`,
        headers: { cookie },
        payload: { name: "RUB service renamed" }
      });
      assert.equal(patched.statusCode, 200, patched.body);
      assert.equal(patched.json().item.listPrice, 122055);

      const catalogQuote = await app.inject({
        method: "POST",
        url: "/api/crm/quotes",
        headers: { cookie },
        payload: {
          customerId: "cust-van",
          dealId: "deal-van-season",
          title: "Catalog RUB quote",
          validUntil: "2026-07-31",
          lines: [{ catalogItemId: item.json().item.id, quantity: 2 }]
        }
      });
      assert.equal(catalogQuote.statusCode, 200, catalogQuote.body);
      assert.equal(catalogQuote.json().quote.lines[0].unitPrice, 122055);
      assert.equal(catalogQuote.json().quote.total, 244110);

      const customQuote = await app.inject({
        method: "POST",
        url: "/api/crm/quotes",
        headers: { cookie },
        payload: {
          customerId: "cust-van",
          dealId: "deal-van-season",
          title: "Custom RUB quote",
          validUntil: "2026-07-31",
          lines: [{ description: "Custom decimal line", quantity: 3, unitPrice: "9.99" }]
        }
      });
      assert.equal(customQuote.statusCode, 200, customQuote.body);
      assert.equal(customQuote.json().quote.lines[0].unitPrice, 999);
      assert.equal(customQuote.json().quote.total, 2997);

      const lead = await app.inject({
        method: "POST",
        url: "/api/crm/leads",
        headers: { cookie },
        payload: {
          companyName: "Decimal Lead LLC",
          contactName: "Ivan Decimal",
          email: "ivan.decimal@example.com",
          phone: "+7 495 123-45-67",
          interest: "Invoice automation with decimal RUB values",
          estimatedValue: "1234.56"
        }
      });
      assert.equal(lead.statusCode, 200, lead.body);
      assert.equal(lead.json().lead.estimatedValue, 123456);

      const converted = await app.inject({
        method: "POST",
        url: `/api/crm/leads/${lead.json().lead.id}/convert`,
        headers: { cookie },
        payload: { dealTitle: "Decimal RUB deal", nextStep: "Prepare quote" }
      });
      assert.equal(converted.statusCode, 200, converted.body);
      assert.equal(converted.json().deal.value, 123456);
      assert.equal(app.db.prepare("SELECT value FROM deals WHERE org_id = ? AND id = ?")
        .get(orgId, converted.json().deal.id).value, 123456);

      const invalid = await app.inject({
        method: "POST",
        url: "/api/crm/quotes",
        headers: { cookie },
        payload: {
          customerId: "cust-van",
          dealId: "deal-van-season",
          title: "Invalid precision quote",
          validUntil: "2026-07-31",
          lines: [{ description: "Too many kopecks", quantity: 1, unitPrice: "9.999" }]
        }
      });
      assert.equal(invalid.statusCode, 400, invalid.body);
    } finally {
      await app.close();
    }
  });
});

test("kopeck S5: payroll and people validators store RUB kopecks while calculators use rubles", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const cookie = await login(app);
      const orgId = "org-armosphera-demo";
      const period = openPeriod(app, orgId);

      const employee = await app.inject({
        method: "POST",
        url: "/api/people/employees",
        headers: { cookie },
        payload: {
          fullName: "Ivan Kopeck",
          grossSalary: "100000.50"
        }
      });
      assert.equal(employee.statusCode, 200, employee.body);
      assert.equal(employee.json().employee.grossSalary, 10000050);

      const preview = await app.inject({
        method: "POST",
        url: "/api/payroll/calculate",
        headers: { cookie },
        payload: { gross: "100000.50", asOf: `${period}-15` }
      });
      assert.equal(preview.statusCode, 200, preview.body);
      assert.equal(preview.json().payroll.gross, 10000050);
      assert.equal(preview.json().payroll.incomeTax, 1300000);
      assert.equal(preview.json().payroll.net, 8700050);
      assert.equal(preview.json().payroll.employerInsurance, 3000000);

      const run = await app.inject({
        method: "POST",
        url: "/api/payroll/run",
        headers: { cookie },
        payload: { employeeName: "Ivan Kopeck", gross: "100000.50", runDate: `${period}-28` }
      });
      assert.equal(run.statusCode, 200, run.body);
      assert.equal(run.json().run.gross, 10000050);
      assert.equal(run.json().run.net, 8700050);
      assert.deepEqual(
        app.db.prepare("SELECT amount FROM ledger_journal WHERE org_id = ? AND source_type = 'payroll' AND source_id = ? ORDER BY amount")
          .all(orgId, run.json().run.id).map(row => row.amount),
        [1300000, 3000000, 8700050]
      );
      const tb = Object.fromEntries((await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } })).json().rows.map(row => [row.code, row]));
      assert.equal(tb["26"].balance, 130000.5);
      assert.equal(tb["70"].balance, -87000.5);
      assert.equal(tb["68"].balance, -13000);
      assert.equal(tb["69"].balance, -30000);
    } finally {
      await app.close();
    }
  });
});

test("kopeck S5: RUB validators reject more fractional digits than the active subunit", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const cookie = await login(app);
      const orgId = "org-armosphera-demo";
      const period = openPeriod(app, orgId);

      for (const request of [
        {
          method: "POST",
          url: "/api/finance/expenses",
          payload: { description: "bad", subtotal: "1.234", vat: 0, incurredOn: `${period}-05` }
        },
        {
          method: "POST",
          url: "/api/catalog/items",
          payload: { sku: "S5-BAD-PRICE", categoryId: "catcat-service-packages", name: "Bad price item", listPrice: "1.234" }
        },
        {
          method: "POST",
          url: "/api/payroll/calculate",
          payload: { gross: "100000.555", asOf: `${period}-15` }
        },
        {
          method: "POST",
          url: "/api/finance/bank-transactions",
          payload: { bankName: "BadBank", transactionDate: `${period}-10`, amount: "1.234", direction: "credit", reference: "BAD-DECIMALS" }
        }
      ]) {
        const response = await app.inject({ ...request, headers: { cookie } });
        assert.equal(response.statusCode, 400, response.body);
      }
    } finally {
      await app.close();
    }
  });
});
