"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD, __test } = require("../server/db");

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

test("catalog: seeded product spine is auth-gated and role scoped", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();

    const unauthenticated = await app.inject({ method: "GET", url: "/api/catalog/items" });
    assert.equal(unauthenticated.statusCode, 401);
    const unauthenticatedPriceLists = await app.inject({ method: "GET", url: "/api/catalog/price-lists" });
    assert.equal(unauthenticatedPriceLists.statusCode, 401);
    const unauthenticatedPricing = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-pos-barcode-scanner" });
    assert.equal(unauthenticatedPricing.statusCode, 401);
    const unauthenticatedMarginRules = await app.inject({ method: "GET", url: "/api/catalog/margin-rules" });
    assert.equal(unauthenticatedMarginRules.statusCode, 401);

    const owner = await login(app);
    const listed = await app.inject({ method: "GET", url: "/api/catalog/items", headers: { cookie: owner } });
    assert.equal(listed.statusCode, 200, listed.body);
    const body = listed.json();
    assert.ok(body.categories.some(category => category.id === "catcat-tourism-packages"));
    assert.ok(body.unitsOfMeasure.some(unit => unit.code === "unit" && unit.kind === "unit"));
    assert.ok(body.unitsOfMeasure.some(unit => unit.code === "package" && unit.kind === "service"));
    const stockableMarginRule = body.marginRules.find(rule => rule.code === "STOCKABLE-MIN-20");
    assert.ok(stockableMarginRule, "stockable margin rule is seeded");
    assert.equal(stockableMarginRule.scopeType, "item_type");
    assert.equal(stockableMarginRule.scopeValue, "stockable");
    assert.equal(stockableMarginRule.minimumMarginPercent, 20);
    assert.ok(body.marginRules.some(rule => rule.code === "SERVICE-MIN-35" && rule.minimumMarginPercent === 35));
    const hardwareMarginRule = body.marginRules.find(rule => rule.code === "HARDWARE-MIN-25");
    assert.ok(hardwareMarginRule, "hardware category margin rule is seeded");
    assert.equal(hardwareMarginRule.scopeType, "category");
    assert.equal(hardwareMarginRule.scopeValue, "catcat-hardware");
    assert.equal(hardwareMarginRule.minimumMarginPercent, 25);
    const standardPriceList = body.priceLists.find(list => list.code === "STANDARD-SALES");
    assert.ok(standardPriceList, "standard sales price list is seeded");
    assert.equal(standardPriceList.customerSegment, "standard");
    const standardScannerPrice = standardPriceList.items.find(item => item.catalogItemId === "catitem-pos-barcode-scanner" && item.catalogItemVariantId === null);
    assert.ok(standardScannerPrice, "standard scanner parent price row is seeded");
    assert.equal(standardScannerPrice.listPrice, 85000);
    assert.equal(standardScannerPrice.discountPercent, 0);
    assert.equal(standardScannerPrice.discountAmount, 0);
    assert.equal(standardScannerPrice.netPrice, 85000);
    assert.equal(standardScannerPrice.standardCost, 62000);
    assert.equal(standardScannerPrice.categoryId, "catcat-hardware");
    assert.equal(standardScannerPrice.categoryName, "POS and device hardware");
    assert.equal(standardScannerPrice.marginRuleCode, "HARDWARE-MIN-25");
    assert.equal(standardScannerPrice.marginAmount, 23000);
    assert.equal(standardScannerPrice.marginPercent, 27.06);
    assert.equal(standardScannerPrice.minimumMarginPercent, 25);
    assert.equal(standardScannerPrice.targetMarginPercent, 35);
    assert.equal(standardScannerPrice.marginStatus, "ok");
    const standardScannerBreak = standardPriceList.items.find(item => item.catalogItemId === "catitem-pos-barcode-scanner" && item.catalogItemVariantId === null && item.minQuantity === 5);
    assert.ok(standardScannerBreak, "standard scanner quantity-break price row is seeded");
    assert.equal(standardScannerBreak.discountPercent, 5);
    assert.equal(standardScannerBreak.discountAmount, 4250);
    assert.equal(standardScannerBreak.netPrice, 80750);
    assert.equal(standardScannerBreak.marginRuleCode, "HARDWARE-MIN-25");
    assert.equal(standardScannerBreak.marginAmount, 18750);
    assert.equal(standardScannerBreak.marginPercent, 23.22);
    assert.equal(standardScannerBreak.minimumMarginPercent, 25);
    assert.equal(standardScannerBreak.marginStatus, "below_minimum");
    assert.ok(standardPriceList.items.some(item => (
      item.catalogItemId === "catitem-pos-barcode-scanner"
      && item.catalogItemVariantId === "catvar-pos-scanner-usb"
      && item.variantSku === "HW-BARCODE-SCANNER-USB"
      && item.listPrice === 85000
    )));
    assert.ok(standardPriceList.items.some(item => (
      item.catalogItemVariantId === "catvar-pos-scanner-usb"
      && item.minQuantity === 5
      && item.discountPercent === 5
      && item.netPrice === 80750
    )));
    const loyaltyPriceList = body.priceLists.find(list => list.code === "LOYALTY-10");
    assert.ok(loyaltyPriceList, "loyalty discount sales price list is seeded");
    assert.equal(loyaltyPriceList.customerSegment, "loyalty");
    const loyaltyScannerPrice = loyaltyPriceList.items.find(item => item.catalogItemId === "catitem-pos-barcode-scanner" && item.catalogItemVariantId === null);
    assert.ok(loyaltyScannerPrice, "loyalty scanner parent price row is seeded");
    assert.equal(loyaltyScannerPrice.discountPercent, 10);
    assert.equal(loyaltyScannerPrice.discountAmount, 8500);
    assert.equal(loyaltyScannerPrice.netPrice, 76500);
    assert.equal(loyaltyScannerPrice.standardCost, 62000);
    assert.equal(loyaltyScannerPrice.marginRuleCode, "HARDWARE-MIN-25");
    assert.equal(loyaltyScannerPrice.marginAmount, 14500);
    assert.equal(loyaltyScannerPrice.marginPercent, 18.95);
    assert.equal(loyaltyScannerPrice.minimumMarginPercent, 25);
    assert.equal(loyaltyScannerPrice.marginStatus, "below_minimum");
    assert.ok(loyaltyPriceList.items.some(item => (
      item.catalogItemVariantId === "catvar-pos-scanner-usb"
      && item.discountPercent === 10
      && item.discountAmount === 8500
      && item.netPrice === 76500
      && item.marginStatus === "below_minimum"
    )));
    assert.ok(body.items.length >= 4, "seeded catalog items present");

    const priceListResponse = await app.inject({ method: "GET", url: "/api/catalog/price-lists", headers: { cookie: owner } });
    assert.equal(priceListResponse.statusCode, 200, priceListResponse.body);
    const priceListBody = priceListResponse.json();
    assert.deepEqual(priceListBody.priceLists.find(list => list.code === "STANDARD-SALES"), standardPriceList);
    assert.deepEqual(priceListBody.priceLists.find(list => list.code === "LOYALTY-10"), loyaltyPriceList);
    const standardPricing = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-pos-barcode-scanner", headers: { cookie: owner } });
    assert.equal(standardPricing.statusCode, 200, standardPricing.body);
    assert.deepEqual(standardPricing.json().pricing, {
      catalogItemId: "catitem-pos-barcode-scanner",
      catalogItemVariantId: null,
      requestedCustomerSegment: "standard",
      quantity: 1,
      priceListId: "catpl-standard-sales",
      priceListCode: "STANDARD-SALES",
      priceListName: "Standard sales price list",
      customerSegment: "standard",
      variantFallback: false,
      itemType: "stockable",
      catalogSku: "HW-BARCODE-SCANNER",
      catalogName: "POS barcode scanner",
      variantSku: "",
      variantName: "",
      minQuantity: 1,
      listPrice: 85000,
      discountPercent: 0,
      discountAmount: 0,
      netPrice: 85000,
      standardCost: 62000,
      marginAmount: 23000,
      marginPercent: 27.06,
      marginRuleCode: "HARDWARE-MIN-25",
      minimumMarginPercent: 25,
      targetMarginPercent: 35,
      marginStatus: "ok",
      currency: "AMD"
    });
    const loyaltyPricing = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-pos-barcode-scanner&customerSegment=loyalty&quantity=2", headers: { cookie: owner } });
    assert.equal(loyaltyPricing.statusCode, 200, loyaltyPricing.body);
    assert.equal(loyaltyPricing.json().pricing.priceListCode, "LOYALTY-10");
    assert.equal(loyaltyPricing.json().pricing.quantity, 2);
    assert.equal(loyaltyPricing.json().pricing.netPrice, 76500);
    assert.equal(loyaltyPricing.json().pricing.marginStatus, "below_minimum");
    const quantityBreakPricing = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-pos-barcode-scanner&quantity=5", headers: { cookie: owner } });
    assert.equal(quantityBreakPricing.statusCode, 200, quantityBreakPricing.body);
    assert.equal(quantityBreakPricing.json().pricing.priceListCode, "STANDARD-SALES");
    assert.equal(quantityBreakPricing.json().pricing.minQuantity, 5);
    assert.equal(quantityBreakPricing.json().pricing.discountPercent, 5);
    assert.equal(quantityBreakPricing.json().pricing.discountAmount, 4250);
    assert.equal(quantityBreakPricing.json().pricing.netPrice, 80750);
    assert.equal(quantityBreakPricing.json().pricing.marginRuleCode, "HARDWARE-MIN-25");
    assert.equal(quantityBreakPricing.json().pricing.minimumMarginPercent, 25);
    assert.equal(quantityBreakPricing.json().pricing.marginStatus, "below_minimum");
    const variantPricing = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-pos-barcode-scanner&catalogItemVariantId=catvar-pos-scanner-usb&customerSegment=loyalty", headers: { cookie: owner } });
    assert.equal(variantPricing.statusCode, 200, variantPricing.body);
    assert.equal(variantPricing.json().pricing.catalogItemVariantId, "catvar-pos-scanner-usb");
    assert.equal(variantPricing.json().pricing.variantSku, "HW-BARCODE-SCANNER-USB");
    assert.equal(variantPricing.json().pricing.variantFallback, false);
    assert.equal(variantPricing.json().pricing.priceListCode, "LOYALTY-10");
    assert.equal(variantPricing.json().pricing.marginStatus, "below_minimum");
    const fallbackPricing = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-pos-barcode-scanner&customerSegment=vip", headers: { cookie: owner } });
    assert.equal(fallbackPricing.statusCode, 200, fallbackPricing.body);
    assert.equal(fallbackPricing.json().pricing.requestedCustomerSegment, "vip");
    assert.equal(fallbackPricing.json().pricing.customerSegment, "standard");
    assert.equal(fallbackPricing.json().pricing.priceListCode, "STANDARD-SALES");
    const malformedPricing = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-pos-barcode-scanner&quantity=bad", headers: { cookie: owner } });
    assert.equal(malformedPricing.statusCode, 400, malformedPricing.body);
    const unknownPricing = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-missing", headers: { cookie: owner } });
    assert.equal(unknownPricing.statusCode, 404, unknownPricing.body);
    const marginRuleResponse = await app.inject({ method: "GET", url: "/api/catalog/margin-rules", headers: { cookie: owner } });
    assert.equal(marginRuleResponse.statusCode, 200, marginRuleResponse.body);
    assert.deepEqual(marginRuleResponse.json().marginRules, body.marginRules);

    const tourismPackage = body.items.find(item => item.id === "catitem-tourism-booking-workflow");
    assert.ok(tourismPackage, "tourism catalog package is seeded");
    assert.equal(tourismPackage.categoryName, "Tourism packages");
    assert.equal(tourismPackage.currency, "AMD");
    assert.equal(tourismPackage.vatMode, "standard");
    assert.equal(tourismPackage.fiscalReceiptRequired, true);
    assert.equal(tourismPackage.trackStock, false);

    const scanner = body.items.find(item => item.id === "catitem-pos-barcode-scanner");
    assert.equal(scanner.itemType, "stockable");
    assert.equal(scanner.unitOfMeasure, "unit");
    assert.equal(scanner.variantCount, 2);
    assert.ok(scanner.variants.some(variant => (
      variant.sku === "HW-BARCODE-SCANNER-USB"
      && variant.attributes.connectivity === "USB"
      && variant.listPrice === scanner.listPrice
    )));
    assert.equal(scanner.trackStock, true);
    assert.equal(scanner.standardCost, 62000);
    assert.equal(scanner.marginAmount, 23000);
    assert.equal(scanner.marginPercent, 27.06);

    const scannerDetail = await app.inject({ method: "GET", url: "/api/catalog/items/catitem-pos-barcode-scanner", headers: { cookie: owner } });
    assert.equal(scannerDetail.statusCode, 200, scannerDetail.body);
    assert.equal(scannerDetail.json().item.variantCount, 2);
    assert.ok(scannerDetail.json().item.variants.some(variant => (
      variant.sku === "HW-BARCODE-SCANNER-BT"
      && variant.attributes.connectivity === "Bluetooth"
      && variant.marginAmount === 23000
      && variant.marginPercent === 27.06
    )));
    app.db.prepare("UPDATE catalog_item_variants SET attributes_json = ? WHERE org_id = ? AND id = ?").run("{", "org-armosphera-demo", "catvar-pos-scanner-bt");
    const malformedVariantDetail = await app.inject({ method: "GET", url: "/api/catalog/items/catitem-pos-barcode-scanner", headers: { cookie: owner } });
    assert.equal(malformedVariantDetail.statusCode, 200, malformedVariantDetail.body);
    const malformedVariant = malformedVariantDetail.json().item.variants.find(variant => variant.sku === "HW-BARCODE-SCANNER-BT");
    assert.deepEqual(malformedVariant.attributes, {});

    const support = await login(app, "support@armosphera.local");
    const supportDenied = await app.inject({ method: "GET", url: "/api/catalog/items", headers: { cookie: support } });
    assert.equal(supportDenied.statusCode, 403);
    const supportPriceListDenied = await app.inject({ method: "GET", url: "/api/catalog/price-lists", headers: { cookie: support } });
    assert.equal(supportPriceListDenied.statusCode, 403);
    const supportPricingDenied = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-pos-barcode-scanner", headers: { cookie: support } });
    assert.equal(supportPricingDenied.statusCode, 403);
    const supportMarginRuleDenied = await app.inject({ method: "GET", url: "/api/catalog/margin-rules", headers: { cookie: support } });
    assert.equal(supportMarginRuleDenied.statusCode, 403);

    const accountant = await login(app, "accountant@armosphera.local");
    const accountantList = await app.inject({ method: "GET", url: "/api/catalog/items?itemType=service", headers: { cookie: accountant } });
    assert.equal(accountantList.statusCode, 200, accountantList.body);
    assert.ok(accountantList.json().items.every(item => item.itemType === "service"));
    const accountantPriceLists = await app.inject({ method: "GET", url: "/api/catalog/price-lists", headers: { cookie: accountant } });
    assert.equal(accountantPriceLists.statusCode, 200, accountantPriceLists.body);
    assert.ok(accountantPriceLists.json().priceLists.some(list => list.code === "STANDARD-SALES" && list.items.length >= body.items.length));
    assert.ok(accountantPriceLists.json().priceLists.some(list => list.code === "LOYALTY-10" && list.items.length >= body.items.length));
    const accountantPricing = await app.inject({ method: "GET", url: "/api/catalog/pricing/resolve?catalogItemId=catitem-pos-barcode-scanner&customerSegment=loyalty", headers: { cookie: accountant } });
    assert.equal(accountantPricing.statusCode, 200, accountantPricing.body);
    assert.equal(accountantPricing.json().pricing.priceListCode, "LOYALTY-10");
    const accountantMarginRules = await app.inject({ method: "GET", url: "/api/catalog/margin-rules", headers: { cookie: accountant } });
    assert.equal(accountantMarginRules.statusCode, 200, accountantMarginRules.body);
    assert.ok(accountantMarginRules.json().marginRules.some(rule => rule.code === "STOCKABLE-MIN-20"));
    assert.ok(accountantMarginRules.json().marginRules.some(rule => rule.code === "HARDWARE-MIN-25" && rule.scopeType === "category"));

    const accountantCreate = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: accountant },
      payload: {
        sku: "A1-ACCOUNTANT-DENIED",
        categoryId: "catcat-service-packages",
        name: "Accountant denied catalog write",
        listPrice: 1000
      }
    });
    assert.equal(accountantCreate.statusCode, 403);

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: owner },
      payload: { note: "Catalog master data must be included in tenant backup scope." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    assert.ok(Array.isArray(backup.json().backup.payload.tables.catalog_items));
    assert.ok(backup.json().backup.payload.tables.catalog_items.some(item => item.id === "catitem-tourism-booking-workflow"));
    assert.ok(Array.isArray(backup.json().backup.payload.tables.catalog_categories));
    assert.ok(Array.isArray(backup.json().backup.payload.tables.catalog_units_of_measure));
    assert.ok(backup.json().backup.payload.tables.catalog_units_of_measure.some(unit => unit.code === "unit"));
    assert.ok(Array.isArray(backup.json().backup.payload.tables.catalog_item_variants));
    assert.ok(backup.json().backup.payload.tables.catalog_item_variants.some(variant => variant.sku === "HW-BARCODE-SCANNER-USB"));
    assert.ok(Array.isArray(backup.json().backup.payload.tables.catalog_price_lists));
    assert.ok(backup.json().backup.payload.tables.catalog_price_lists.some(list => list.code === "STANDARD-SALES"));
    assert.ok(backup.json().backup.payload.tables.catalog_price_lists.some(list => list.code === "LOYALTY-10"));
    assert.ok(Array.isArray(backup.json().backup.payload.tables.catalog_price_list_items));
    assert.ok(backup.json().backup.payload.tables.catalog_price_list_items.some(item => (
      item.catalog_item_id === "catitem-pos-barcode-scanner"
      && item.discount_percent === 10
    )));
    assert.ok(backup.json().backup.payload.tables.catalog_price_list_items.some(item => (
      item.catalog_item_id === "catitem-pos-barcode-scanner"
      && item.min_quantity === 5
      && item.discount_percent === 5
    )));
    assert.ok(Array.isArray(backup.json().backup.payload.tables.catalog_margin_rules));
    assert.ok(backup.json().backup.payload.tables.catalog_margin_rules.some(rule => rule.code === "STOCKABLE-MIN-20"));
    assert.ok(backup.json().backup.payload.tables.catalog_margin_rules.some(rule => (
      rule.code === "HARDWARE-MIN-25"
      && rule.scope_type === "category"
      && rule.scope_value === "catcat-hardware"
    )));
  } finally {
    await app.close();
  }
});

test("catalog: create and update guard product master metadata", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const orgId = "org-armosphera-demo";
    const counts = () => ({
      items: app.db.prepare("SELECT COUNT(*) AS count FROM catalog_items WHERE org_id = ?").get(orgId).count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE 'catalog.item.%'").get(orgId).count,
      events: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE 'catalog.item.%'").get(orgId).count
    });
    const expectRejected = async (method, url, payload, statusCode = 400) => {
      const response = await app.inject({ method, url, headers: { cookie: owner }, payload });
      assert.equal(response.statusCode, statusCode, response.body);
      assert.doesNotMatch(response.body, /secret-catalog-/);
    };

    const beforeRejects = counts();
    for (const payload of [
      ["secret-catalog-array-body-token"],
      { sku: { value: "A1-OBJECT-SKU", token: "secret-catalog-object-sku-token" }, categoryId: "catcat-service-packages", name: "Valid service item", listPrice: 1000 },
      { sku: "A1-CONTROL-NAME", categoryId: "catcat-service-packages", name: "Bad\nsecret-catalog-control-name-token", listPrice: 1000 },
      { sku: "A1-BAD-TYPE", categoryId: "catcat-service-packages", name: "Valid service item", itemType: "ghost-secret-catalog-type-token", listPrice: 1000 },
      { sku: "A1-BAD-PRICE", categoryId: "catcat-service-packages", name: "Valid service item", listPrice: { amount: 1000, token: "secret-catalog-price-object-token" } },
      { sku: "A1-BAD-PRICE-CONTROL", categoryId: "catcat-service-packages", name: "Valid service item", listPrice: "1000\n" },
      { sku: "A1-BAD-COST", categoryId: "catcat-service-packages", name: "Valid service item", listPrice: 1000, standardCost: 2000 },
      { sku: "A1-BAD-STOCK", categoryId: "catcat-service-packages", name: "Valid service item", itemType: "service", listPrice: 1000, trackStock: true },
      { sku: "A1-BAD-CURRENCY", categoryId: "catcat-service-packages", name: "Valid service item", listPrice: 1000, currency: "USD" }
    ]) {
      await expectRejected("POST", "/api/catalog/items", payload);
    }
    assert.deepEqual(counts(), beforeRejects);

    await expectRejected("POST", "/api/catalog/items", {
      sku: "A1-MISSING-CATEGORY",
      categoryId: "catcat-missing",
      name: "Missing category item",
      listPrice: 1000
    }, 404);
    assert.deepEqual(counts(), beforeRejects);

    await expectRejected("POST", "/api/catalog/items", {
      sku: "A1-MISSING-UOM",
      categoryId: "catcat-service-packages",
      name: "Missing unit catalog item",
      unitOfMeasure: "box",
      listPrice: 1000
    }, 404);
    assert.deepEqual(counts(), beforeRejects);

    const created = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "hw-label-printer-01",
        categoryId: "catcat-hardware",
        name: "Yerevan retail label printer",
        description: "Stock-tracked hardware for future POS and warehouse flows.",
        itemType: "stockable",
        unitOfMeasure: "unit",
        listPrice: 120000,
        standardCost: "90000",
        trackStock: true,
        trackLots: true,
        fiscalReceiptRequired: true
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const item = created.json().item;
    assert.match(item.id, /^catitem-/);
    assert.equal(item.sku, "HW-LABEL-PRINTER-01");
    assert.equal(item.categoryName, "POS and device hardware");
    assert.equal(item.unitOfMeasure, "unit");
    assert.equal(item.trackStock, true);
    assert.equal(item.trackLots, true);
    assert.equal(counts().items, beforeRejects.items + 1);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "HW-LABEL-PRINTER-01",
        categoryId: "catcat-hardware",
        name: "Duplicate SKU",
        itemType: "stockable",
        listPrice: 120000,
        standardCost: 90000,
        trackStock: true
      }
    });
    assert.equal(duplicate.statusCode, 409, duplicate.body);
    assert.equal(counts().items, beforeRejects.items + 1);

    const badPath = await app.inject({
      method: "PATCH",
      url: "/api/catalog/items/bad%2Fid",
      headers: { cookie: owner },
      payload: { status: "archived" }
    });
    assert.equal(badPath.statusCode, 400, badPath.body);
    assert.match(badPath.body, /Invalid catalog item id/);

    const beforePatchRejects = counts();
    for (const payload of [
      ["secret-catalog-patch-array-token"],
      { name: { value: "Renamed", token: "secret-catalog-patch-name-object-token" } },
      { standardCost: 130000 },
      { trackStock: false },
      { status: "ghost-secret-catalog-patch-status-token" }
    ]) {
      await expectRejected("PATCH", `/api/catalog/items/${item.id}`, payload);
    }
    assert.deepEqual(counts(), beforePatchRejects);

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/catalog/items/${item.id}`,
      headers: { cookie: owner },
      payload: {
        status: "archived",
        listPrice: 130000,
        standardCost: 95000,
        trackLots: false
      }
    });
    assert.equal(patched.statusCode, 200, patched.body);
    assert.equal(patched.json().item.status, "archived");
    assert.equal(patched.json().item.listPrice, 130000);
    assert.equal(patched.json().item.trackStock, true);
    assert.equal(patched.json().item.trackLots, false);

    const searched = await app.inject({
      method: "GET",
      url: "/api/catalog/items?q=LABEL-PRINTER&status=archived",
      headers: { cookie: owner }
    });
    assert.equal(searched.statusCode, 200, searched.body);
    assert.ok(searched.json().items.some(row => row.id === item.id));

    const auditRows = app.db.prepare("SELECT type, details FROM audit_events WHERE org_id = ? AND type LIKE 'catalog.item.%' ORDER BY id").all(orgId);
    assert.ok(auditRows.some(row => row.type === "catalog.item.created" && row.details.includes(item.id)));
    assert.ok(auditRows.some(row => row.type === "catalog.item.updated" && row.details.includes(item.id)));
  } finally {
    await app.close();
  }
});

test("catalog: legacy item UoM codes are backfilled before update validation", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const orgId = "org-armosphera-demo";
    const now = new Date().toISOString();
    app.db.prepare(`
      INSERT INTO catalog_items (
        id, org_id, category_id, sku, name, description, item_type, status,
        unit_of_measure, list_price, standard_cost, currency, vat_mode,
        track_stock, track_lots, fiscal_receipt_required, created_by_user_id,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "catitem-legacy-box-uom",
      orgId,
      "catcat-service-packages",
      "LEGACY-BOX-UOM",
      "Legacy boxed service",
      "",
      "service",
      "active",
      "box",
      1000,
      0,
      "AMD",
      "standard",
      0,
      0,
      1,
      null,
      now,
      now
    );

    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM catalog_units_of_measure WHERE org_id = ? AND code = ?").get(orgId, "box").count, 0);
    __test.backfillCatalogUnitsOfMeasureFromItems(app.db, orgId);
    const unit = app.db.prepare("SELECT code, name, kind, status FROM catalog_units_of_measure WHERE org_id = ? AND code = ?").get(orgId, "box");
    assert.deepEqual({ ...unit }, { code: "box", name: "box", kind: "custom", status: "active" });

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/catalog/items/catitem-legacy-box-uom",
      headers: { cookie: owner },
      payload: { name: "Legacy boxed service updated" }
    });
    assert.equal(patched.statusCode, 200, patched.body);
    assert.equal(patched.json().item.unitOfMeasure, "box");
    assert.equal(patched.json().item.name, "Legacy boxed service updated");
  } finally {
    await app.close();
  }
});

test("catalog: quote lines resolve active product metadata", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const orgId = "org-armosphera-demo";
    app.db.prepare(`
      UPDATE catalog_price_list_items
      SET discount_percent = ?, updated_at = ?
      WHERE org_id = ? AND price_list_id = ? AND catalog_item_id = ?
        AND catalog_item_variant_id IS NULL
    `).run(20, new Date().toISOString(), orgId, "catpl-standard-sales", "catitem-salon-inbox-package");

    const createdQuote = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: owner },
      payload: {
        customerId: "cust-ani",
        dealId: "deal-ani-inbox",
        title: "Catalog-backed salon package",
        validUntil: "2026-07-31",
        lines: [
          { catalogItemId: "catitem-salon-inbox-package", quantity: 2 }
        ]
      }
    });
    assert.equal(createdQuote.statusCode, 200, createdQuote.body);
    const line = createdQuote.json().quote.lines[0];
    assert.equal(line.catalogItemId, "catitem-salon-inbox-package");
    assert.equal(line.catalogSku, "A1-SALON-INBOX");
    assert.equal(line.catalogName, "Instagram and WhatsApp inbox setup");
    assert.equal(line.description, "Instagram and WhatsApp inbox setup");
    assert.equal(line.unitPrice, 760000);
    assert.equal(line.total, 1520000);
    assert.equal(line.pricingSource, "catalog_price_list");
    assert.equal(line.catalogPriceListId, "catpl-standard-sales");
    assert.equal(line.catalogPriceListCode, "STANDARD-SALES");
    assert.equal(line.pricingCustomerSegment, "standard");
    assert.equal(line.discountAmount, 190000);
    assert.equal(line.marginStatus, "ok");
    assert.equal(line.marginRuleCode, "SERVICE-MIN-35");
    assert.equal(line.marginRuleMinimumPercent, 35);
    assert.equal(line.marginRuleTargetPercent, 55);
    assert.equal(line.vatMode, "standard");
    assert.equal(line.fiscalReceiptRequired, true);

    const bulkScannerQuote = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: owner },
      payload: {
        customerId: "cust-ani",
        dealId: "deal-ani-inbox",
        title: "Bulk scanner quote",
        validUntil: "2026-07-31",
        lines: [
          { catalogItemId: "catitem-pos-barcode-scanner", quantity: 5 }
        ]
      }
    });
    assert.equal(bulkScannerQuote.statusCode, 200, bulkScannerQuote.body);
    const bulkScannerLine = bulkScannerQuote.json().quote.lines[0];
    assert.equal(bulkScannerLine.unitPrice, 80750);
    assert.equal(bulkScannerLine.total, 403750);
    assert.equal(bulkScannerLine.pricingSource, "catalog_price_list");
    assert.equal(bulkScannerLine.catalogPriceListId, "catpl-standard-sales");
    assert.equal(bulkScannerLine.catalogPriceListCode, "STANDARD-SALES");
    assert.equal(bulkScannerLine.pricingCustomerSegment, "standard");
    assert.equal(bulkScannerLine.discountAmount, 4250);
    assert.equal(bulkScannerLine.marginStatus, "below_minimum");
    assert.equal(bulkScannerLine.marginRuleCode, "HARDWARE-MIN-25");
    assert.equal(bulkScannerLine.marginRuleMinimumPercent, 25);
    assert.equal(bulkScannerLine.marginRuleTargetPercent, 35);

    app.db.prepare("UPDATE customers SET segment = ? WHERE org_id = ? AND id = ?")
      .run("loyalty", orgId, "cust-ani");
    const loyaltyQuote = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: owner },
      payload: {
        customerId: "cust-ani",
        dealId: "deal-ani-inbox",
        title: "Loyalty scanner package",
        validUntil: "2026-07-31",
        lines: [
          { catalogItemId: "catitem-pos-barcode-scanner", quantity: 1 }
        ]
      }
    });
    assert.equal(loyaltyQuote.statusCode, 200, loyaltyQuote.body);
    assert.equal(loyaltyQuote.json().quote.lines[0].unitPrice, 76500);
    assert.equal(loyaltyQuote.json().quote.lines[0].total, 76500);
    assert.equal(loyaltyQuote.json().quote.lines[0].pricingSource, "catalog_price_list");
    assert.equal(loyaltyQuote.json().quote.lines[0].catalogPriceListId, "catpl-loyalty-10");
    assert.equal(loyaltyQuote.json().quote.lines[0].catalogPriceListCode, "LOYALTY-10");
    assert.equal(loyaltyQuote.json().quote.lines[0].pricingCustomerSegment, "loyalty");
    assert.equal(loyaltyQuote.json().quote.lines[0].discountAmount, 8500);
    assert.equal(loyaltyQuote.json().quote.lines[0].marginStatus, "below_minimum");
    assert.equal(loyaltyQuote.json().quote.lines[0].marginRuleCode, "HARDWARE-MIN-25");
    assert.equal(loyaltyQuote.json().quote.lines[0].marginRuleMinimumPercent, 25);
    assert.equal(loyaltyQuote.json().quote.lines[0].marginRuleTargetPercent, 35);

    const variantQuote = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: owner },
      payload: {
        customerId: "cust-ani",
        dealId: "deal-ani-inbox",
        title: "Variant scanner package",
        validUntil: "2026-07-31",
        lines: [
          {
            catalogItemId: "catitem-pos-barcode-scanner",
            catalogItemVariantId: "catvar-pos-scanner-usb",
            quantity: 1
          }
        ]
      }
    });
    assert.equal(variantQuote.statusCode, 200, variantQuote.body);
    const variantLine = variantQuote.json().quote.lines[0];
    assert.equal(variantLine.catalogItemId, "catitem-pos-barcode-scanner");
    assert.equal(variantLine.catalogItemVariantId, "catvar-pos-scanner-usb");
    assert.equal(variantLine.catalogSku, "HW-BARCODE-SCANNER");
    assert.equal(variantLine.catalogName, "POS barcode scanner");
    assert.equal(variantLine.variantSku, "HW-BARCODE-SCANNER-USB");
    assert.equal(variantLine.variantName, "USB barcode scanner");
    assert.equal(variantLine.description, "USB barcode scanner");
    assert.equal(variantLine.unitPrice, 76500);
    assert.equal(variantLine.total, 76500);
    assert.equal(variantLine.pricingSource, "catalog_price_list");
    assert.equal(variantLine.catalogPriceListId, "catpl-loyalty-10");
    assert.equal(variantLine.catalogPriceListCode, "LOYALTY-10");
    assert.equal(variantLine.pricingCustomerSegment, "loyalty");
    assert.equal(variantLine.discountAmount, 8500);
    assert.equal(variantLine.marginStatus, "below_minimum");
    assert.equal(variantLine.marginRuleCode, "HARDWARE-MIN-25");
    assert.equal(variantLine.marginRuleMinimumPercent, 25);
    assert.equal(variantLine.marginRuleTargetPercent, 35);
    const storedVariantLine = app.db.prepare(`
      SELECT catalog_item_id AS catalogItemId,
        catalog_item_variant_id AS catalogItemVariantId,
        catalog_price_list_id AS catalogPriceListId,
        catalog_price_list_code AS catalogPriceListCode,
        pricing_source AS pricingSource,
        pricing_customer_segment AS pricingCustomerSegment,
        discount_amount AS discountAmount,
        margin_status AS marginStatus,
        margin_rule_code AS marginRuleCode,
        margin_rule_minimum_percent AS marginRuleMinimumPercent,
        margin_rule_target_percent AS marginRuleTargetPercent
      FROM quote_lines
      WHERE org_id = ? AND quote_id = ?
    `).get(orgId, variantQuote.json().quote.id);
    assert.equal(storedVariantLine.catalogItemId, "catitem-pos-barcode-scanner");
    assert.equal(storedVariantLine.catalogItemVariantId, "catvar-pos-scanner-usb");
    assert.equal(storedVariantLine.catalogPriceListId, "catpl-loyalty-10");
    assert.equal(storedVariantLine.catalogPriceListCode, "LOYALTY-10");
    assert.equal(storedVariantLine.pricingSource, "catalog_price_list");
    assert.equal(storedVariantLine.pricingCustomerSegment, "loyalty");
    assert.equal(storedVariantLine.discountAmount, 8500);
    assert.equal(storedVariantLine.marginStatus, "below_minimum");
    assert.equal(storedVariantLine.marginRuleCode, "HARDWARE-MIN-25");
    assert.equal(storedVariantLine.marginRuleMinimumPercent, 25);
    assert.equal(storedVariantLine.marginRuleTargetPercent, 35);

    const overrideQuote = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: owner },
      payload: {
        customerId: "cust-ani",
        dealId: "deal-ani-inbox",
        title: "Explicit scanner override",
        validUntil: "2026-07-31",
        lines: [
          { catalogItemId: "catitem-pos-barcode-scanner", quantity: 1, unitPrice: 83000 }
        ]
      }
    });
    assert.equal(overrideQuote.statusCode, 200, overrideQuote.body);
    assert.equal(overrideQuote.json().quote.lines[0].unitPrice, 83000);
    assert.equal(overrideQuote.json().quote.lines[0].total, 83000);
    assert.equal(overrideQuote.json().quote.lines[0].pricingSource, "manual");
    assert.equal(overrideQuote.json().quote.lines[0].catalogPriceListId, null);
    assert.equal(overrideQuote.json().quote.lines[0].catalogPriceListCode, "");
    assert.equal(overrideQuote.json().quote.lines[0].discountAmount, 0);
    assert.equal(overrideQuote.json().quote.lines[0].marginStatus, "");
    assert.equal(overrideQuote.json().quote.lines[0].marginRuleCode, "");
    assert.equal(overrideQuote.json().quote.lines[0].marginRuleMinimumPercent, null);
    assert.equal(overrideQuote.json().quote.lines[0].marginRuleTargetPercent, null);

    const malformedVariant = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: owner },
      payload: {
        customerId: "cust-ani",
        dealId: "deal-ani-inbox",
        title: "Malformed variant quote",
        validUntil: "2026-07-31",
        lines: [
          {
            catalogItemId: "catitem-pos-barcode-scanner",
            catalogItemVariantId: "catvar-pos-scanner-usb\nsecret-variant-token",
            quantity: 1
          }
        ]
      }
    });
    assert.equal(malformedVariant.statusCode, 400, malformedVariant.body);
    assert.doesNotMatch(malformedVariant.body, /secret-variant-token/);

    const mismatchedVariant = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: owner },
      payload: {
        customerId: "cust-ani",
        dealId: "deal-ani-inbox",
        title: "Mismatched variant quote",
        validUntil: "2026-07-31",
        lines: [
          {
            catalogItemId: "catitem-salon-inbox-package",
            catalogItemVariantId: "catvar-pos-scanner-usb",
            quantity: 1
          }
        ]
      }
    });
    assert.equal(mismatchedVariant.statusCode, 422, mismatchedVariant.body);
    assert.match(mismatchedVariant.body, /Catalog item variant is required for quote line/);

    const archived = await app.inject({
      method: "PATCH",
      url: "/api/catalog/items/catitem-salon-inbox-package",
      headers: { cookie: owner },
      payload: { status: "archived" }
    });
    assert.equal(archived.statusCode, 200, archived.body);

    const inactiveQuote = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: owner },
      payload: {
        customerId: "cust-ani",
        dealId: "deal-ani-inbox",
        title: "Inactive catalog item quote",
        validUntil: "2026-08-31",
        lines: [
          { catalogItemId: "catitem-salon-inbox-package", quantity: 1 }
        ]
      }
    });
    assert.equal(inactiveQuote.statusCode, 422, inactiveQuote.body);
    assert.match(inactiveQuote.body, /Catalog item is required for quote line/);
  } finally {
    await app.close();
  }
});

test("catalog: CRM quote lines can reference active catalog items", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const sales = await login(app, "sales@armosphera.local");
    const orgId = "org-armosphera-demo";
    const counts = () => ({
      quotes: app.db.prepare("SELECT COUNT(*) AS count FROM quotes WHERE org_id = ?").get(orgId).count,
      quoteLines: app.db.prepare("SELECT COUNT(*) AS count FROM quote_lines WHERE org_id = ?").get(orgId).count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "crm.quote.created").count
    });

    const before = counts();
    const created = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: sales },
      payload: {
        customerId: "cust-van",
        dealId: "deal-van-season",
        title: "Catalog-backed tourism quote",
        validUntil: "2026-06-30",
        lines: [
          { catalogItemId: "catitem-tourism-booking-workflow", quantity: 1 }
        ]
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const quote = created.json().quote;
    assert.equal(quote.total, 720000);
    assert.equal(quote.lines.length, 1);
    assert.equal(quote.lines[0].catalogItemId, "catitem-tourism-booking-workflow");
    assert.equal(quote.lines[0].catalogSku, "A1-TOUR-BOOKING");
    assert.equal(quote.lines[0].description, "Seasonal booking workflow package");
    assert.equal(quote.lines[0].unitPrice, 720000);
    assert.equal(quote.lines[0].vatMode, "standard");
    assert.equal(quote.lines[0].fiscalReceiptRequired, true);

    const storedLine = app.db.prepare(`
      SELECT catalog_item_id AS catalogItemId, vat_mode AS vatMode, fiscal_receipt_required AS fiscalReceiptRequired
      FROM quote_lines
      WHERE org_id = ? AND quote_id = ?
    `).get(orgId, quote.id);
    assert.equal(storedLine.catalogItemId, "catitem-tourism-booking-workflow");
    assert.equal(storedLine.vatMode, "standard");
    assert.equal(storedLine.fiscalReceiptRequired, 1);

    const beforeRejects = counts();
    const missing = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: sales },
      payload: {
        customerId: "cust-van",
        dealId: "deal-van-season",
        title: "Missing catalog item quote",
        validUntil: "2026-06-30",
        lines: [{ catalogItemId: "catitem-missing", quantity: 1 }]
      }
    });
    assert.equal(missing.statusCode, 422, missing.body);
    assert.deepEqual(counts(), beforeRejects);

    const malformed = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: sales },
      payload: {
        customerId: "cust-van",
        dealId: "deal-van-season",
        title: "Malformed catalog item quote",
        validUntil: "2026-06-30",
        lines: [{ catalogItemId: "catitem-tourism-booking-workflow\nsecret-catalog-quote-line-token", quantity: 1 }]
      }
    });
    assert.equal(malformed.statusCode, 400, malformed.body);
    assert.doesNotMatch(malformed.body, /secret-catalog-quote-line-token/);
    assert.deepEqual(counts(), beforeRejects);
    assert.equal(counts().quotes, before.quotes + 1);
  } finally {
    await app.close();
  }
});

test("catalog: quote totals respect catalog VAT modes", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    const exemptItem = await app.inject({
      method: "POST",
      url: "/api/catalog/items",
      headers: { cookie: owner },
      payload: {
        sku: "A1-EXEMPT-CONSULT",
        categoryId: "catcat-service-packages",
        name: "VAT exempt advisory package",
        itemType: "service",
        listPrice: 120000,
        vatMode: "exempt",
        fiscalReceiptRequired: false
      }
    });
    assert.equal(exemptItem.statusCode, 200, exemptItem.body);

    const quoteResponse = await app.inject({
      method: "POST",
      url: "/api/crm/quotes",
      headers: { cookie: owner },
      payload: {
        customerId: "cust-van",
        dealId: "deal-van-season",
        title: "Mixed VAT catalog quote",
        validUntil: "2026-07-31",
        lines: [
          { catalogItemId: "catitem-tourism-booking-workflow", quantity: 1 },
          { catalogItemId: exemptItem.json().item.id, quantity: 1 }
        ]
      }
    });
    assert.equal(quoteResponse.statusCode, 200, quoteResponse.body);
    const quote = quoteResponse.json().quote;
    assert.equal(quote.total, 840000);
    assert.equal(quote.subtotal, 720000);
    assert.equal(quote.vat, 120000);
    assert.equal(quote.lines[0].vatMode, "standard");
    assert.equal(quote.lines[1].vatMode, "exempt");
    assert.equal(quote.lines[1].fiscalReceiptRequired, false);
  } finally {
    await app.close();
  }
});

test("catalog: RU custom quote lines store kopecks and split VAT per line", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const owner = await login(app);
      const orgId = "org-armosphera-demo";
      app.db.prepare("INSERT OR IGNORE INTO tax_rates (id, org_id, kind, effective_date, config, note, created_at) VALUES (?, ?, 'vat', ?, ?, ?, ?)")
        .run(`taxrate-${orgId}-ru-vat-2026`, orgId, "2026-01-01", JSON.stringify({ rate: 0.22 }), "RF 2026 VAT 22%", new Date().toISOString());

      const response = await app.inject({
        method: "POST",
        url: "/api/crm/quotes",
        headers: { cookie: owner },
        payload: {
          customerId: "cust-van",
          dealId: "deal-van-season",
          title: "RUB custom quote",
          validUntil: "2026-07-31",
          lines: [{ description: "RUB setup", quantity: 1, unitPrice: 1221 }]
        }
      });
      assert.equal(response.statusCode, 200, response.body);
      const quote = response.json().quote;
      assert.equal(quote.total, 122100);
      assert.equal(quote.subtotal, 100082);
      assert.equal(quote.vat, 22018);
      assert.equal(quote.lines[0].unitPrice, 122100);
      assert.equal(quote.lines[0].total, 122100);
    } finally {
      await app.close();
    }
  });
});
