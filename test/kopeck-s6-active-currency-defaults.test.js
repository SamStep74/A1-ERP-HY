"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

const CURRENCY_TABLES = [
  "organizations",
  "deals",
  "catalog_items",
  "purchase_vendor_prices",
  "purchase_orders",
  "crm_leads",
  "marketing_campaigns",
  "quotes",
  "crm_collection_promises",
  "finance_draft_invoices",
  "finance_payments",
  "expenses",
  "bills",
  "bill_payments",
  "finance_bank_transactions"
];

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

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email, password }
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.headers["set-cookie"];
}

function openPeriod(app, orgId) {
  return app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1")
    .get(orgId).period_key;
}

function currencyDefault(app, table) {
  const column = app.db.prepare(`PRAGMA table_info(${table})`).all().find(row => row.name === "currency");
  assert.ok(column, `${table}.currency exists`);
  return column.dflt_value;
}

function distinctCurrencies(app, table) {
  return app.db.prepare(`SELECT DISTINCT currency FROM ${table} ORDER BY currency`)
    .all().map(row => row.currency);
}

test("kopeck S6: RU seed uses active locale currency and schema has no AMD defaults", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const cookie = await login(app);
      const orgId = "org-armosphera-demo";

      const org = app.db.prepare("SELECT locale, currency FROM organizations WHERE id = ?").get(orgId);
      assert.equal(org.locale, "ru-RU");
      assert.equal(org.currency, "RUB");

      const suite = await app.inject({ method: "GET", url: "/api/suite", headers: { cookie } });
      assert.equal(suite.statusCode, 200, suite.body);
      assert.equal(suite.json().organization.locale, "ru-RU");
      assert.equal(suite.json().organization.currency, "RUB");

      for (const table of CURRENCY_TABLES) {
        assert.equal(currencyDefault(app, table), null, `${table}.currency has no SQL default`);
      }

      for (const table of [
        "organizations",
        "deals",
        "catalog_items",
        "purchase_vendor_prices",
        "crm_leads",
        "marketing_campaigns",
        "quotes"
      ]) {
        assert.deepEqual(distinctCurrencies(app, table), ["RUB"], `${table} seeded as RUB`);
      }
    } finally {
      await app.close();
    }
  });
});

test("kopeck S6: AM seed still uses active AMD without SQL currency defaults", async () => {
  await withLocale(undefined, async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const cookie = await login(app);
      const orgId = "org-armosphera-demo";

      const org = app.db.prepare("SELECT locale, currency FROM organizations WHERE id = ?").get(orgId);
      assert.equal(org.locale, "hy-AM");
      assert.equal(org.currency, "AMD");

      const suite = await app.inject({ method: "GET", url: "/api/suite", headers: { cookie } });
      assert.equal(suite.statusCode, 200, suite.body);
      assert.equal(suite.json().organization.locale, "hy-AM");
      assert.equal(suite.json().organization.currency, "AMD");

      for (const table of CURRENCY_TABLES) {
        assert.equal(currencyDefault(app, table), null, `${table}.currency has no SQL default`);
      }

      for (const table of [
        "organizations",
        "deals",
        "catalog_items",
        "purchase_vendor_prices",
        "crm_leads",
        "marketing_campaigns",
        "quotes"
      ]) {
        assert.deepEqual(distinctCurrencies(app, table), ["AMD"], `${table} seeded as AMD`);
      }
    } finally {
      await app.close();
    }
  });
});

test("kopeck S6: RU runtime inserts inherit RUB when currency is omitted", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const owner = await login(app);
      const sales = await login(app, "sales@armosphera.local");
      const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
      const period = openPeriod(app, orgId);

      const catalog = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku: "S6-RUB-SERVICE",
          categoryId: "catcat-service-packages",
          name: "S6 RUB service",
          itemType: "service",
          listPrice: "1000.25",
          standardCost: "400.10"
        }
      });
      assert.equal(catalog.statusCode, 200, catalog.body);
      assert.equal(catalog.json().item.currency, "RUB");

      const stockItem = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku: "S6-RUB-STOCK",
          categoryId: "catcat-hardware",
          name: "S6 RUB stock",
          itemType: "stockable",
          trackStock: true,
          listPrice: "1500.00",
          standardCost: "900.00"
        }
      });
      assert.equal(stockItem.statusCode, 200, stockItem.body);

      const vendor = await app.inject({
        method: "POST",
        url: "/api/purchase/vendors",
        headers: { cookie: owner },
        payload: {
          name: "S6 RUB Vendor",
          taxId: "12345678",
          prices: [{ catalogItemId: stockItem.json().item.id, unitCost: "901.25", validFrom: `${period}-01` }]
        }
      });
      assert.equal(vendor.statusCode, 200, vendor.body);
      assert.equal(vendor.json().vendor.prices[0].currency, "RUB");

      const order = await app.inject({
        method: "POST",
        url: "/api/purchase/orders",
        headers: { cookie: owner },
        payload: {
          supplier: "S6 RUB Supplier",
          supplierTaxId: "12345678",
          orderDate: `${period}-10`,
          lines: [{ catalogItemId: stockItem.json().item.id, quantity: 1, unitCost: "901.25" }]
        }
      });
      assert.equal(order.statusCode, 200, order.body);
      assert.equal(order.json().order.currency, "RUB");

      const lead = await app.inject({
        method: "POST",
        url: "/api/crm/leads",
        headers: { cookie: sales },
        payload: {
          companyName: "S6 RUB Lead",
          contactName: "Ivan Currency",
          email: "s6-rub-lead@example.ru",
          phone: "+7 495 000-00-01",
          interest: "RUB active currency default",
          estimatedValue: "1234.56"
        }
      });
      assert.equal(lead.statusCode, 200, lead.body);
      assert.equal(lead.json().lead.currency, "RUB");

      const converted = await app.inject({
        method: "POST",
        url: `/api/crm/leads/${lead.json().lead.id}/convert`,
        headers: { cookie: sales },
        payload: { dealTitle: "S6 RUB deal", forecastCategory: "commit" }
      });
      assert.equal(converted.statusCode, 200, converted.body);
      assert.equal(converted.json().deal.currency, "RUB");

      const quote = await app.inject({
        method: "POST",
        url: "/api/crm/quotes",
        headers: { cookie: sales },
        payload: {
          customerId: converted.json().customer.id,
          dealId: converted.json().deal.id,
          title: "S6 RUB quote",
          validUntil: "2026-07-31",
          lines: [{ catalogItemId: catalog.json().item.id, quantity: 1 }]
        }
      });
      assert.equal(quote.statusCode, 200, quote.body);
      assert.equal(quote.json().quote.currency, "RUB");

      const expense = await app.inject({
        method: "POST",
        url: "/api/finance/expenses",
        headers: { cookie: owner },
        payload: { description: "S6 RUB expense", subtotal: "100.25", vat: "22.06", incurredOn: `${period}-11` }
      });
      assert.equal(expense.statusCode, 200, expense.body);
      assert.equal(app.db.prepare("SELECT currency FROM expenses WHERE id = ?").get(expense.json().expense.id).currency, "RUB");

      const bill = await app.inject({
        method: "POST",
        url: "/api/finance/bills",
        headers: { cookie: owner },
        payload: { supplier: "S6 RUB AP", subtotal: "200.25", vat: "44.06", billDate: `${period}-12`, dueDate: `${period}-20` }
      });
      assert.equal(bill.statusCode, 200, bill.body);
      assert.equal(app.db.prepare("SELECT currency FROM bills WHERE id = ?").get(bill.json().bill.id).currency, "RUB");

      const billPayment = await app.inject({
        method: "POST",
        url: `/api/finance/bills/${bill.json().bill.id}/pay`,
        headers: { cookie: owner },
        payload: { amount: "244.31", paidAt: `${period}-13`, reference: "S6-RUB-BILL" }
      });
      assert.equal(billPayment.statusCode, 200, billPayment.body);
      assert.equal(app.db.prepare("SELECT currency FROM bill_payments WHERE id = ?").get(billPayment.json().payment.id).currency, "RUB");

      const project = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { cookie: owner },
        payload: { name: "S6 RUB billing project", customerId: converted.json().customer.id, status: "active" }
      });
      assert.equal(project.statusCode, 200, project.body);
      const projectId = project.json().project.id;
      const timeEntry = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/time-entries`,
        headers: { cookie: owner },
        payload: { minutes: 60, entryDate: `${period}-14`, note: "S6 RUB hour" }
      });
      assert.equal(timeEntry.statusCode, 200, timeEntry.body);

      const preview = await app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/billing-preview?hourlyRate=1000`,
        headers: { cookie: owner }
      });
      assert.equal(preview.statusCode, 200, preview.body);
      assert.equal(preview.json().preview.currency, "RUB");

      const billed = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/bill-time`,
        headers: { cookie: owner },
        payload: { hourlyRate: "1000.00", issueDate: `${period}-15` }
      });
      assert.equal(billed.statusCode, 200, billed.body);
      assert.equal(app.db.prepare("SELECT currency FROM finance_draft_invoices WHERE id = ?")
        .get(billed.json().draftInvoice.id).currency, "RUB");

      const payment = await app.inject({
        method: "POST",
        url: `/api/finance/invoices/${billed.json().invoice.id}/payments`,
        headers: { cookie: owner },
        payload: { amount: "1000.00", paidAt: `${period}-16`, reference: "S6-RUB-INVOICE" }
      });
      assert.equal(payment.statusCode, 200, payment.body);
      assert.equal(payment.json().payment.currency, "RUB");

      const bank = await app.inject({
        method: "POST",
        url: "/api/finance/bank-transactions",
        headers: { cookie: owner },
        payload: {
          bankName: "S6 RUB Bank",
          accountNumber: "40702810000000000002",
          transactionDate: `${period}-17`,
          amount: "123.45",
          direction: "credit",
          description: "S6 unmatched RUB import",
          reference: "S6-RUB-BANK"
        }
      });
      assert.equal(bank.statusCode, 200, bank.body);
      assert.equal(bank.json().transaction.currency, "RUB");

      const promise = await app.inject({
        method: "POST",
        url: "/api/crm/tasks/task-nare-vat-review/payment-promise",
        headers: { cookie: owner },
        payload: { promisedAmount: "100.00", promisedOn: `${period}-18`, reminderChannel: "Email", note: "S6 RUB promise" }
      });
      assert.equal(promise.statusCode, 200, promise.body);
      assert.equal(promise.json().promise.currency, "RUB");
    } finally {
      await app.close();
    }
  });
});
