"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email, password }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers["set-cookie"];
}

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

test("kopeck S5: RU finance money inputs store kopecks and ledger reports rubles", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const cookie = await login(app);
      const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
      const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;

      const expense = await app.inject({
        method: "POST",
        url: "/api/finance/expenses",
        headers: { cookie },
        payload: { description: "RU kopeck expense", subtotal: "100.50", vat: "20.10", incurredOn: `${openPeriod}-10` }
      });
      assert.equal(expense.statusCode, 200, expense.body);
      assert.equal(expense.json().expense.subtotal, 10050);
      assert.equal(expense.json().expense.vat, 2010);
      assert.equal(expense.json().expense.total, 12060);

      const bill = await app.inject({
        method: "POST",
        url: "/api/finance/bills",
        headers: { cookie },
        payload: { supplier: "RU Supplier", subtotal: "200.25", vat: "40.05", billDate: `${openPeriod}-11`, dueDate: `${openPeriod}-20` }
      });
      assert.equal(bill.statusCode, 200, bill.body);
      assert.equal(bill.json().bill.total, 24030);

      const paidBill = await app.inject({
        method: "POST",
        url: `/api/finance/bills/${bill.json().bill.id}/pay`,
        headers: { cookie },
        payload: { amount: "240.30", paidAt: `${openPeriod}-12`, reference: "RU-BILL-KOPECK" }
      });
      assert.equal(paidBill.statusCode, 200, paidBill.body);
      assert.equal(paidBill.json().payment.amount, 24030);
      assert.equal(paidBill.json().payment.status, "paid");

      const customerId = app.db.prepare("SELECT id FROM customers WHERE org_id = ? LIMIT 1").get(orgId).id;
      const now = new Date().toISOString();
      app.db.prepare(`
        INSERT INTO finance_draft_invoices
          (id, org_id, customer_id, number, status, subtotal, vat, total, currency, issue_date, due_date, period_key, source_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 'RUB', ?, ?, ?, ?, ?, ?)
      `).run("draft-ru-s5-pay", orgId, customerId, "DRAFT-RU-S5-PAY", 10050, 2010, 12060, `${openPeriod}-13`, `${openPeriod}-20`, openPeriod, "ru-s5-pay", now, now);

      const posted = await app.inject({
        method: "POST",
        url: "/api/finance/draft-invoices/draft-ru-s5-pay/post",
        headers: { cookie },
        payload: {}
      });
      assert.equal(posted.statusCode, 200, posted.body);

      const paidInvoice = await app.inject({
        method: "POST",
        url: `/api/finance/invoices/${posted.json().invoice.id}/payments`,
        headers: { cookie },
        payload: { amount: "120.60", paidAt: `${openPeriod}-14`, reference: "RU-INVOICE-KOPECK" }
      });
      assert.equal(paidInvoice.statusCode, 200, paidInvoice.body);
      assert.equal(paidInvoice.json().payment.amount, 12060);
      assert.equal(paidInvoice.json().invoice.status, "paid");

      const transaction = await app.inject({
        method: "POST",
        url: "/api/finance/bank-transactions",
        headers: { cookie },
        payload: {
          bankName: "RU Bank",
          accountNumber: "40702810000000000001",
          transactionDate: `${openPeriod}-15`,
          amount: "9600.55",
          direction: "credit",
          description: "Unmatched RU kopeck bank transaction",
          reference: "RU-BANK-KOPECK"
        }
      });
      assert.equal(transaction.statusCode, 200, transaction.body);
      assert.equal(transaction.json().transaction.amount, 960055);

      const tb = await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } });
      assert.equal(tb.statusCode, 200, tb.body);
      assert.equal(tb.json().balanced, true);
    } finally {
      await app.close();
    }
  });
});

test("kopeck S5: RU operational money validators store kopecks", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const owner = await login(app);
      const sales = await login(app, "sales@armosphera.local");
      const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
      const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;

      const service = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku: "RU-S5-SERVICE",
          categoryId: "catcat-service-packages",
          name: "RU S5 service",
          itemType: "service",
          listPrice: "123.45",
          standardCost: "12.34"
        }
      });
      assert.equal(service.statusCode, 200, service.body);
      assert.equal(service.json().item.listPrice, 12345);
      assert.equal(service.json().item.standardCost, 1234);

      const patched = await app.inject({
        method: "PATCH",
        url: `/api/catalog/items/${service.json().item.id}`,
        headers: { cookie: owner },
        payload: { name: "RU S5 service patched" }
      });
      assert.equal(patched.statusCode, 200, patched.body);
      assert.equal(patched.json().item.listPrice, 12345);

      const stockItem = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku: "RU-S5-STOCK",
          categoryId: "catcat-hardware",
          name: "RU S5 stock item",
          itemType: "stockable",
          trackStock: true,
          listPrice: "21.00",
          standardCost: "10.50"
        }
      });
      assert.equal(stockItem.statusCode, 200, stockItem.body);
      const stockItemId = stockItem.json().item.id;

      const move = await app.inject({
        method: "POST",
        url: "/api/inventory/moves",
        headers: { cookie: owner },
        payload: {
          catalogItemId: stockItemId,
          destinationLocationId: "stockloc-dispatch-staging",
          moveType: "adjustment",
          quantity: 2,
          unitCost: "9.99",
          reference: "RU-S5-STOCK-IN"
        }
      });
      assert.equal(move.statusCode, 200, move.body);
      assert.equal(move.json().move.unitCost, 999);

      const vendor = await app.inject({
        method: "POST",
        url: "/api/purchase/vendors",
        headers: { cookie: owner },
        payload: {
          name: "RU S5 Vendor",
          taxId: "12345678",
          prices: [{ catalogItemId: stockItemId, unitCost: "11.11", validFrom: `${openPeriod}-01` }]
        }
      });
      assert.equal(vendor.statusCode, 200, vendor.body);
      assert.equal(vendor.json().vendor.prices[0].unitCost, 1111);

      const order = await app.inject({
        method: "POST",
        url: "/api/purchase/orders",
        headers: { cookie: owner },
        payload: {
          supplier: "RU S5 Supplier",
          supplierTaxId: "12345678",
          orderDate: `${openPeriod}-16`,
          lines: [{ catalogItemId: stockItemId, quantity: 1, unitCost: "12.34" }]
        }
      });
      assert.equal(order.statusCode, 200, order.body);
      assert.equal(order.json().order.lines[0].unitCost, 1234);

      const lead = await app.inject({
        method: "POST",
        url: "/api/crm/leads",
        headers: { cookie: sales },
        payload: {
          companyName: "RU S5 Lead",
          contactName: "Ivan Lead",
          email: "ru-s5-lead@example.ru",
          phone: "+7 495 1112233",
          interest: "Kopeck precision deal estimate for CRM workflow",
          estimatedValue: "1234.56"
        }
      });
      assert.equal(lead.statusCode, 200, lead.body);
      assert.equal(lead.json().lead.estimatedValue, 123456);

      const converted = await app.inject({
        method: "POST",
        url: `/api/crm/leads/${lead.json().lead.id}/convert`,
        headers: { cookie: sales },
        payload: { forecastCategory: "commit" }
      });
      assert.equal(converted.statusCode, 200, converted.body);
      assert.equal(converted.json().deal.value, 123456);

      const employee = await app.inject({
        method: "POST",
        url: "/api/people/employees",
        headers: { cookie: owner },
        payload: {
          fullName: "Ivan Kopeck",
          taxId: "12345678",
          position: "Engineer",
          department: "Delivery",
          grossSalary: "100000.55",
          hireDate: "2026-01-10",
          email: "ivan-kopeck@example.ru"
        }
      });
      assert.equal(employee.statusCode, 200, employee.body);
      assert.equal(employee.json().employee.grossSalary, 10000055);

      const payrollRun = await app.inject({
        method: "POST",
        url: `/api/people/employees/${employee.json().employee.id}/run-payroll`,
        headers: { cookie: owner },
        payload: { runDate: `${openPeriod}-17` }
      });
      assert.equal(payrollRun.statusCode, 200, payrollRun.body);
      assert.equal(payrollRun.json().run.gross, 10000055);
      assert.equal(payrollRun.json().run.incomeTax, 1300000);
      assert.equal(payrollRun.json().run.net, 8700055);
    } finally {
      await app.close();
    }
  });
});

test("kopeck S5: AM integer-only validators keep rejecting fractional money", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    const fractionalCatalog = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "AM-S5-FRACTIONAL",
        categoryId: "catcat-service-packages",
        name: "AM fractional catalog",
        listPrice: "123.45"
      }
    });
    assert.equal(fractionalCatalog.statusCode, 400, fractionalCatalog.body);

    const project = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: owner },
      payload: { name: "AM S5 project", customerId: "cust-ani", status: "active" }
    });
    assert.equal(project.statusCode, 200, project.body);
    const fractionalPreview = await app.inject({
      method: "GET",
      url: `/api/projects/${project.json().project.id}/billing-preview?hourlyRate=1000.50`,
      headers: { cookie: owner }
    });
    assert.equal(fractionalPreview.statusCode, 400, fractionalPreview.body);

    const expense = await app.inject({
      method: "POST",
      url: "/api/finance/expenses",
      headers: { cookie: owner },
      payload: { description: "AM decimal expense", subtotal: "100.50", vat: "20.50", incurredOn: "2026-05-10" }
    });
    assert.equal(expense.statusCode, 200, expense.body);
    assert.equal(expense.json().expense.subtotal, 101);
    assert.equal(expense.json().expense.vat, 21);
  } finally {
    await app.close();
  }
});
