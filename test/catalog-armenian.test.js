"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

// Tests for the Armenian product master extension to catalog_items + catalog_item_variants.
// These are first-class columns (not JSON blobs) so they can be indexed, searched, and reported.

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email, password }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers["set-cookie"];
}

test("catalog items: Armenian name_hy accepts valid Armenian script", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "ARM-WINE-001",
        categoryId: "catcat-hardware",
        name: "Alico Wine",
        nameHy: "Ալիքոտ գինի",
        nameRu: "Аликот вино",
        nameEn: "Alico Wine",
        itemType: "stockable",
        listPrice: 4500,
        standardCost: 2800,
        currency: "AMD"
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const item = created.json().item;
    assert.equal(item.nameHy, "Ալիքոտ գինի");
    assert.equal(item.nameRu, "Аликот вино");
    assert.equal(item.nameEn, "Alico Wine");
    // Stored in the DB column, not derived.
    const row = app.db.prepare("SELECT name_hy AS nameHy, name_ru AS nameRu, name_en AS nameEn FROM catalog_items WHERE id = ?").get(item.id);
    assert.equal(row.nameHy, "Ալիքոտ գինի");
    assert.equal(row.nameRu, "Аликот вино");
    assert.equal(row.nameEn, "Alico Wine");
  } finally {
    await app.close();
  }
});

test("catalog items: Armenian name_hy rejects Latin script", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "ARM-WINE-002",
        categoryId: "catcat-hardware",
        name: "Latin fallback",
        // Pure Latin — outside the Armenian Unicode block [Ա-֏] + space/comma/period/dash.
        nameHy: "Pure Latin Name",
        itemType: "stockable",
        listPrice: 4500
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.body, /Catalog request requires safe metadata/);
  } finally {
    await app.close();
  }
});

test("catalog items: SKU pattern enforced on POST", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const validCases = ["A1", "X", "ARM-WINE-1", "HW_LABELED_01", "ABC123"];
    for (const sku of validCases) {
      const response = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku,
          categoryId: "catcat-service-packages",
          name: `Item ${sku}`,
          itemType: "service",
          listPrice: 1000
        }
      });
      assert.equal(response.statusCode, 200, `${sku}: ${response.body}`);
    }
    const invalidCases = [
      "with spaces",       // space
      "with.dot",          // dot not allowed
      "with/slash",        // slash not allowed
      "with$dollar",       // dollar not allowed
      "x".repeat(41),      // 41 chars, exceeds 40
      ""                   // empty
    ];
    for (const sku of invalidCases) {
      const response = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku,
          categoryId: "catcat-service-packages",
          name: `Item ${sku}`,
          itemType: "service",
          listPrice: 1000
        }
      });
      assert.equal(response.statusCode, 400, `expected 400 for sku=${JSON.stringify(sku)}, got ${response.statusCode}: ${response.body}`);
    }
  } finally {
    await app.close();
  }
});

test("catalog items: duplicate SKU within org_id returns 409", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const first = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "DUPE-SKU-1",
        categoryId: "catcat-service-packages",
        name: "First duplicate",
        itemType: "service",
        listPrice: 1000
      }
    });
    assert.equal(first.statusCode, 200, first.body);
    const second = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "DUPE-SKU-1",
        categoryId: "catcat-service-packages",
        name: "Second duplicate",
        itemType: "service",
        listPrice: 1000
      }
    });
    assert.equal(second.statusCode, 409, second.body);
    assert.match(second.body, /SKU already exists/);
  } finally {
    await app.close();
  }
});

test("catalog items: barcode pattern enforced (8-14 digits)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const validBarcodes = ["12345678", "012345678905", "5901234123457", "12345678901234"];
    let counter = 0;
    for (const barcode of validBarcodes) {
      counter += 1;
      const response = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku: `BC-VALID-${counter}`,
          categoryId: "catcat-service-packages",
          name: `Item ${barcode}`,
          itemType: "service",
          listPrice: 1000,
          barcode
        }
      });
      assert.equal(response.statusCode, 200, `${barcode}: ${response.body}`);
      assert.equal(response.json().item.barcode, barcode);
    }
    const invalidBarcodes = [
      "1234567",         // 7 digits, too short
      "123456789012345", // 15 digits, too long
      "12345abc",        // contains letters
      "1234 5678",       // contains space
      "1234-5678"        // contains dash
    ];
    counter = 0;
    for (const barcode of invalidBarcodes) {
      counter += 1;
      const response = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku: `BC-INVALID-${counter}`,
          categoryId: "catcat-service-packages",
          name: `Item invalid ${counter}`,
          itemType: "service",
          listPrice: 1000,
          barcode
        }
      });
      assert.equal(response.statusCode, 400, `expected 400 for barcode=${JSON.stringify(barcode)}, got ${response.statusCode}: ${response.body}`);
    }
    // Barcode is optional — omit it and it should still succeed.
    const omitted = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "BC-OMITTED",
        categoryId: "catcat-service-packages",
        name: "Item no barcode",
        itemType: "service",
        listPrice: 1000
      }
    });
    assert.equal(omitted.statusCode, 200, omitted.body);
    assert.equal(omitted.json().item.barcode, "");
  } finally {
    await app.close();
  }
});

test("catalog items: vat_class must be standard/reduced/exempt/reverse_charge", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const allowed = ["standard", "reduced", "exempt", "reverse_charge"];
    let counter = 0;
    for (const vatClass of allowed) {
      counter += 1;
      const response = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku: `VAT-${vatClass.toUpperCase()}-${counter}`,
          categoryId: "catcat-service-packages",
          name: `Item ${vatClass}`,
          itemType: "service",
          listPrice: 1000,
          vatClass
        }
      });
      assert.equal(response.statusCode, 200, `${vatClass}: ${response.body}`);
      assert.equal(response.json().item.vatClass, vatClass);
    }
    // 'zero' was the legacy name for reduced in some flows, but the new enum is strict.
    const bad = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "VAT-BAD",
        categoryId: "catcat-service-packages",
        name: "Bad vat_class",
        itemType: "service",
        listPrice: 1000,
        vatClass: "nope"
      }
    });
    assert.equal(bad.statusCode, 400, bad.body);
    // Default value: when vatClass is omitted, the API should return 'standard' on read.
    const defaulted = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "VAT-DEFAULT",
        categoryId: "catcat-service-packages",
        name: "Default vat_class",
        itemType: "service",
        listPrice: 1000
      }
    });
    assert.equal(defaulted.statusCode, 200, defaulted.body);
    assert.equal(defaulted.json().item.vatClass, "standard");
  } finally {
    await app.close();
  }
});

test("catalog items: excise_marker must be alcohol/tobacco/fuel/jewelry or NULL", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const allowed = ["alcohol", "tobacco", "fuel", "jewelry"];
    let counter = 0;
    for (const marker of allowed) {
      counter += 1;
      const response = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku: `EXCISE-${marker.toUpperCase()}-${counter}`,
          categoryId: "catcat-service-packages",
          name: `Item ${marker}`,
          itemType: "service",
          listPrice: 1000,
          exciseMarker: marker
        }
      });
      assert.equal(response.statusCode, 200, `${marker}: ${response.body}`);
      assert.equal(response.json().item.exciseMarker, marker);
    }
    // NULL is valid (the default for non-excisable products).
    const omitted = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "EXCISE-NONE",
        categoryId: "catcat-service-packages",
        name: "No excise",
        itemType: "service",
        listPrice: 1000
      }
    });
    assert.equal(omitted.statusCode, 200, omitted.body);
    assert.equal(omitted.json().item.exciseMarker, "");
    const bad = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "EXCISE-BAD",
        categoryId: "catcat-service-packages",
        name: "Bad excise_marker",
        itemType: "service",
        listPrice: 1000,
        exciseMarker: "pumpkin"
      }
    });
    assert.equal(bad.statusCode, 400, bad.body);
  } finally {
    await app.close();
  }
});

test("catalog items: fiscal_receipt_category must be food/electronics/clothing/service/other", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const allowed = ["food", "electronics", "clothing", "service", "other"];
    let counter = 0;
    for (const category of allowed) {
      counter += 1;
      const response = await app.inject({
        method: "POST",
        url: "/api/catalog/items",
        headers: { cookie: owner },
        payload: {
          sku: `FRC-${category.toUpperCase()}-${counter}`,
          categoryId: "catcat-service-packages",
          name: `Item ${category}`,
          itemType: "service",
          listPrice: 1000,
          fiscalReceiptCategory: category
        }
      });
      assert.equal(response.statusCode, 200, `${category}: ${response.body}`);
      assert.equal(response.json().item.fiscalReceiptCategory, category);
    }
    const bad = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "FRC-BAD",
        categoryId: "catcat-service-packages",
        name: "Bad fiscal_receipt_category",
        itemType: "service",
        listPrice: 1000,
        fiscalReceiptCategory: "vehicle"
      }
    });
    assert.equal(bad.statusCode, 400, bad.body);
  } finally {
    await app.close();
  }
});

test("catalog variants: weight_grams and excise_amount stored as integers", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    // Create a parent item first.
    const parent = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "VAR-PARENT-1",
        categoryId: "catcat-service-packages",
        name: "Variant parent",
        itemType: "stockable",
        listPrice: 0,
        standardCost: 0
      }
    });
    assert.equal(parent.statusCode, 200, parent.body);
    const parentId = parent.json().item.id;

    // Variants don't have a public API endpoint; we insert via the test to verify
    // the schema accepts the new integer columns and CHECK constraints.
    const now = new Date().toISOString();
    const orgId = "org-armosphera-demo";
    app.db.prepare(`
      INSERT INTO catalog_item_variants (
        id, org_id, catalog_item_id, sku, name, name_hy, name_ru, name_en,
        barcode, weight_grams, excise_amount, attributes_json,
        unit_of_measure, list_price, standard_cost, currency, status,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "catvar-test-0-5l",
      orgId,
      parentId,
      "VAR-CHILD-0-5L",
      "0.5L bottle",
      "0.5L ապակե շիշ",
      null,
      null,
      "4820000123456",
      850,
      1200,
      "{}",
      "unit",
      2500,
      1500,
      "AMD",
      "active",
      now,
      now
    );

    const row = app.db.prepare(`
      SELECT name_hy AS nameHy, name_ru AS nameRu, name_en AS nameEn,
        barcode, weight_grams AS weightGrams, excise_amount AS exciseAmount
      FROM catalog_item_variants
      WHERE org_id = ? AND id = ?
    `).get(orgId, "catvar-test-0-5l");
    assert.equal(row.nameHy, "0.5L ապակե շիշ");
    assert.equal(row.nameRu, null);
    assert.equal(row.nameEn, null);
    assert.equal(row.barcode, "4820000123456");
    assert.equal(row.weightGrams, 850);
    assert.equal(typeof row.weightGrams, "number");
    assert.equal(row.exciseAmount, 1200);
    assert.equal(typeof row.exciseAmount, "number");
  } finally {
    await app.close();
  }
});

test("catalog variants: barcode unique per org_id", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    // Create a parent item.
    const parent = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "VAR-BC-PARENT-1",
        categoryId: "catcat-service-packages",
        name: "Variant barcode parent",
        itemType: "stockable",
        listPrice: 0,
        standardCost: 0
      }
    });
    assert.equal(parent.statusCode, 200, parent.body);
    const parentId = parent.json().item.id;
    const orgId = "org-armosphera-demo";
    const now = new Date().toISOString();

    const insert = app.db.prepare(`
      INSERT INTO catalog_item_variants (
        id, org_id, catalog_item_id, sku, name, name_hy,
        barcode, attributes_json, unit_of_measure, list_price, standard_cost,
        currency, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      "catvar-bc-1", orgId, parentId, "VAR-BC-CHILD-1", "Variant 1", "Տարբերակ 1",
      "1111111111111", "{}", "unit", 0, 0, "AMD", "active", now, now
    );
    // Same barcode in same org: must violate the partial UNIQUE INDEX.
    assert.throws(() => {
      insert.run(
        "catvar-bc-2", orgId, parentId, "VAR-BC-CHILD-2", "Variant 2", "Տարբերակ 2",
        "1111111111111", "{}", "unit", 0, 0, "AMD", "active", now, now
      );
    }, /UNIQUE constraint failed/);
    // Different barcode, same org: ok.
    insert.run(
      "catvar-bc-3", orgId, parentId, "VAR-BC-CHILD-3", "Variant 3", "Տարբերակ 3",
      "2222222222222", "{}", "unit", 0, 0, "AMD", "active", now, now
    );
    // NULL barcode in same org: ok (partial index excludes NULL).
    insert.run(
      "catvar-bc-4", orgId, parentId, "VAR-BC-CHILD-4", "Variant 4", "Տարբերակ 4",
      null, "{}", "unit", 0, 0, "AMD", "active", now, now
    );
  } finally {
    await app.close();
  }
});
