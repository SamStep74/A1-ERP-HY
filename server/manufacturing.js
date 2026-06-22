"use strict";

const crypto = require("node:crypto");
const { audit, emitSuiteEvent } = require("./db");
const { requirePerm } = require("./rbac/guards");

const ID_RE = /^[a-z0-9-]+$/;
const CODE_RE = /^[A-Z0-9/_-]{1,40}$/;
const BOM_STATUSES = Object.freeze(["draft", "active", "archived"]);
const WORK_CENTER_STATUSES = Object.freeze(["active", "inactive"]);
const WORK_ORDER_STATUSES = Object.freeze(["planned", "released", "cancelled"]);

function registerManufacturingRoutes(app) {
  const db = app.db;

  app.get("/api/manufacturing/boms", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.bom.read")
    ]
  }, async request => {
    return { boms: listBoms(db, request.user.org_id, normalizeListQuery(request.query || {}, ["status", "productItemId"], BOM_STATUSES)) };
  });

  app.get("/api/manufacturing/boms/:id", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.bom.read")
    ]
  }, async request => {
    return { bom: getBomOrThrow(db, request.user.org_id, normalizePathId(request.params.id)) };
  });

  app.post("/api/manufacturing/boms", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.bom.update")
    ]
  }, async request => {
    return createBom(db, request.user, request.body === undefined ? {} : request.body);
  });

  app.patch("/api/manufacturing/boms/:id", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.bom.update")
    ]
  }, async request => {
    return updateBom(db, request.user, normalizePathId(request.params.id), request.body === undefined ? {} : request.body);
  });

  app.post("/api/manufacturing/boms/:id/version", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.bom.version")
    ]
  }, async request => {
    return versionBom(db, request.user, normalizePathId(request.params.id), request.body === undefined ? {} : request.body);
  });

  app.get("/api/manufacturing/work-centers", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_center.read")
    ]
  }, async request => {
    return { workCenters: listWorkCenters(db, request.user.org_id, normalizeListQuery(request.query || {}, ["status"], WORK_CENTER_STATUSES)) };
  });

  app.post("/api/manufacturing/work-centers", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_center.update")
    ]
  }, async request => {
    return createWorkCenter(db, request.user, request.body === undefined ? {} : request.body);
  });

  app.patch("/api/manufacturing/work-centers/:id", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_center.update")
    ]
  }, async request => {
    return updateWorkCenter(db, request.user, normalizePathId(request.params.id), request.body === undefined ? {} : request.body);
  });

  app.get("/api/manufacturing/work-orders", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_order.read")
    ]
  }, async request => {
    return { workOrders: listWorkOrders(db, request.user.org_id, normalizeListQuery(request.query || {}, ["status", "workCenterId"], WORK_ORDER_STATUSES)) };
  });

  app.get("/api/manufacturing/work-orders/:id", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_order.read")
    ]
  }, async request => {
    return { workOrder: getWorkOrderOrThrow(db, request.user.org_id, normalizePathId(request.params.id)) };
  });

  app.post("/api/manufacturing/work-orders", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_order.create")
    ]
  }, async request => {
    return createWorkOrder(db, request.user, request.body === undefined ? {} : request.body);
  });

  app.patch("/api/manufacturing/work-orders/:id", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_order.update")
    ]
  }, async request => {
    return updateWorkOrder(db, request.user, normalizePathId(request.params.id), request.body === undefined ? {} : request.body);
  });

  app.post("/api/manufacturing/work-orders/:id/release", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_order.release")
    ]
  }, async request => {
    return releaseWorkOrder(db, request.user, normalizePathId(request.params.id));
  });

  app.post("/api/manufacturing/work-orders/:id/cancel", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_order.cancel")
    ]
  }, async request => {
    return cancelWorkOrder(db, request.user, normalizePathId(request.params.id), request.body === undefined ? {} : request.body);
  });

  app.get("/api/manufacturing/shop-floor", {
    preHandler: [
      async request => { request.user = await app.auth(request); },
      requirePerm("mfg.work_order.read")
    ]
  }, async request => {
    return { board: getShopFloorBoard(db, request.user.org_id) };
  });
}

function listBoms(db, orgId, filters = {}) {
  const where = ["mfg_boms.org_id = ?"];
  const params = [orgId];
  if (filters.status) {
    where.push("mfg_boms.status = ?");
    params.push(filters.status);
  }
  if (filters.productItemId) {
    where.push("mfg_boms.product_item_id = ?");
    params.push(filters.productItemId);
  }
  return db.prepare(`
    SELECT mfg_boms.*, catalog_items.sku AS product_sku, catalog_items.name AS product_name,
      users.name AS created_by_name
    FROM mfg_boms
    JOIN catalog_items ON catalog_items.id = mfg_boms.product_item_id
      AND catalog_items.org_id = mfg_boms.org_id
    LEFT JOIN users ON users.id = mfg_boms.created_by_user_id
    WHERE ${where.join(" AND ")}
    ORDER BY mfg_boms.status = 'archived', mfg_boms.bom_number, mfg_boms.revision DESC
  `).all(...params).map(row => formatBom(db, row));
}

function getBom(db, orgId, bomId) {
  const row = db.prepare(`
    SELECT mfg_boms.*, catalog_items.sku AS product_sku, catalog_items.name AS product_name,
      users.name AS created_by_name
    FROM mfg_boms
    JOIN catalog_items ON catalog_items.id = mfg_boms.product_item_id
      AND catalog_items.org_id = mfg_boms.org_id
    LEFT JOIN users ON users.id = mfg_boms.created_by_user_id
    WHERE mfg_boms.org_id = ? AND mfg_boms.id = ?
  `).get(orgId, bomId);
  return row ? formatBom(db, row) : null;
}

function getBomOrThrow(db, orgId, bomId) {
  const bom = getBom(db, orgId, bomId);
  if (!bom) throwNotFound("Manufacturing BoM not found");
  return bom;
}

function formatBom(db, row) {
  const lines = db.prepare(`
    SELECT mfg_bom_lines.*, catalog_items.sku AS component_sku, catalog_items.name AS component_name,
      catalog_items.unit_of_measure AS unit_of_measure, catalog_items.standard_cost AS standard_cost
    FROM mfg_bom_lines
    JOIN catalog_items ON catalog_items.id = mfg_bom_lines.component_item_id
      AND catalog_items.org_id = mfg_bom_lines.org_id
    WHERE mfg_bom_lines.org_id = ? AND mfg_bom_lines.bom_id = ?
    ORDER BY mfg_bom_lines.created_at, mfg_bom_lines.id
  `).all(row.org_id, row.id).map(formatBomLine);
  return {
    id: row.id,
    bomNumber: row.bom_number,
    productItemId: row.product_item_id,
    productSku: row.product_sku,
    productName: row.product_name,
    revision: row.revision,
    status: row.status,
    quantity: row.quantity,
    unitOfMeasure: row.unit_of_measure,
    note: row.note || "",
    estimatedUnitCost: estimateBomUnitCost(lines, row.quantity),
    lineCount: lines.length,
    createdByUserId: row.created_by_user_id || "",
    createdByName: row.created_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines
  };
}

function formatBomLine(row) {
  const quantity = Number(row.quantity || 0);
  const scrapPercent = Number(row.scrap_percent || 0);
  const standardCost = Number(row.standard_cost || 0);
  const plannedQuantity = applyScrap(quantity, scrapPercent);
  return {
    id: row.id,
    bomId: row.bom_id,
    componentItemId: row.component_item_id,
    componentSku: row.component_sku,
    componentName: row.component_name,
    unitOfMeasure: row.unit_of_measure,
    quantity,
    scrapPercent,
    plannedQuantity,
    standardCost,
    estimatedLineCost: plannedQuantity * standardCost,
    note: row.note || "",
    createdAt: row.created_at
  };
}

function createBom(db, user, body) {
  const input = normalizeBomBody(body, { partial: false });
  const product = assertProductItem(db, user.org_id, input.productItemId);
  const lines = input.lines.map(line => normalizeBomLineWithItem(db, user.org_id, line, product.id));
  assertUniqueBomComponents(lines);
  if (lines.length === 0) throwInvalidManufacturingMetadata("BoM requires at least one component line");
  const bomNumber = input.bomNumber || nextBomNumber();
  assertBomNumberAvailable(db, user.org_id, bomNumber, 1);
  const now = new Date().toISOString();
  const bomId = randomId("mfg-bom");
  db.exec("BEGIN");
  try {
    insertBom(db, user, {
      id: bomId,
      bomNumber,
      productItemId: product.id,
      revision: 1,
      status: input.status,
      quantity: input.quantity,
      unitOfMeasure: input.unitOfMeasure || product.unit_of_measure || "unit",
      note: input.note,
      now
    }, lines);
    emitSuiteEvent(db, {
      orgId: user.org_id,
      actorUserId: user.id,
      eventType: "manufacturing.bom.created",
      subjectType: "mfg_bom",
      subjectId: bomId,
      status: input.status,
      payload: { bomNumber, revision: 1, productItemId: product.id, lineCount: lines.length }
    });
    audit(db, user.org_id, user.id, "manufacturing.bom.created", { bomId, bomNumber, revision: 1, productItemId: product.id, lineCount: lines.length });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, bom: getBom(db, user.org_id, bomId) };
}

function updateBom(db, user, bomId, body) {
  const existing = getBomOrThrow(db, user.org_id, bomId);
  if (existing.status === "archived") throwConflict("Archived BoM cannot be updated");
  const input = normalizeBomBody(body, { partial: true, existing });
  const product = assertProductItem(db, user.org_id, input.productItemId);
  const lines = input.lines.map(line => normalizeBomLineWithItem(db, user.org_id, line, product.id));
  assertUniqueBomComponents(lines);
  if (lines.length === 0) throwInvalidManufacturingMetadata("BoM requires at least one component line");
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(`
      UPDATE mfg_boms
      SET product_item_id = ?, status = ?, quantity = ?, unit_of_measure = ?, note = ?, updated_at = ?
      WHERE org_id = ? AND id = ?
    `).run(product.id, input.status, input.quantity, input.unitOfMeasure || product.unit_of_measure || "unit", input.note, now, user.org_id, bomId);
    db.prepare("DELETE FROM mfg_bom_lines WHERE org_id = ? AND bom_id = ?").run(user.org_id, bomId);
    insertBomLines(db, user.org_id, bomId, lines, now);
    emitSuiteEvent(db, {
      orgId: user.org_id,
      actorUserId: user.id,
      eventType: "manufacturing.bom.updated",
      subjectType: "mfg_bom",
      subjectId: bomId,
      status: input.status,
      payload: { bomNumber: existing.bomNumber, revision: existing.revision, productItemId: product.id, lineCount: lines.length }
    });
    audit(db, user.org_id, user.id, "manufacturing.bom.updated", { bomId, bomNumber: existing.bomNumber, revision: existing.revision, lineCount: lines.length });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, bom: getBom(db, user.org_id, bomId) };
}

function versionBom(db, user, bomId, body) {
  const existing = getBomOrThrow(db, user.org_id, bomId);
  const input = normalizeBomBody(body, { partial: true, existing });
  const product = assertProductItem(db, user.org_id, input.productItemId);
  const lines = input.lines.map(line => normalizeBomLineWithItem(db, user.org_id, line, product.id));
  assertUniqueBomComponents(lines);
  if (lines.length === 0) throwInvalidManufacturingMetadata("BoM requires at least one component line");
  const revision = nextBomRevision(db, user.org_id, existing.bomNumber);
  const newId = randomId("mfg-bom");
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(`
      UPDATE mfg_boms
      SET status = 'archived', updated_at = ?
      WHERE org_id = ? AND bom_number = ? AND status = 'active'
    `).run(now, user.org_id, existing.bomNumber);
    insertBom(db, user, {
      id: newId,
      bomNumber: existing.bomNumber,
      productItemId: product.id,
      revision,
      status: input.status,
      quantity: input.quantity,
      unitOfMeasure: input.unitOfMeasure || product.unit_of_measure || "unit",
      note: input.note,
      now
    }, lines);
    emitSuiteEvent(db, {
      orgId: user.org_id,
      actorUserId: user.id,
      eventType: "manufacturing.bom.versioned",
      subjectType: "mfg_bom",
      subjectId: newId,
      status: input.status,
      payload: { previousBomId: bomId, bomNumber: existing.bomNumber, revision, lineCount: lines.length }
    });
    audit(db, user.org_id, user.id, "manufacturing.bom.versioned", { previousBomId: bomId, bomId: newId, bomNumber: existing.bomNumber, revision });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, bom: getBom(db, user.org_id, newId) };
}

function insertBom(db, user, bom, lines) {
  db.prepare(`
    INSERT INTO mfg_boms (
      id, org_id, bom_number, product_item_id, revision, status, quantity,
      unit_of_measure, note, created_by_user_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    bom.id,
    user.org_id,
    bom.bomNumber,
    bom.productItemId,
    bom.revision,
    bom.status,
    bom.quantity,
    bom.unitOfMeasure,
    bom.note,
    user.id,
    bom.now,
    bom.now
  );
  insertBomLines(db, user.org_id, bom.id, lines, bom.now);
}

function insertBomLines(db, orgId, bomId, lines, now) {
  const insert = db.prepare(`
    INSERT INTO mfg_bom_lines (
      id, org_id, bom_id, component_item_id, quantity, scrap_percent, note, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of lines) {
    insert.run(randomId("mfg-bom-line"), orgId, bomId, line.componentItemId, line.quantity, line.scrapPercent, line.note, now);
  }
}

function listWorkCenters(db, orgId, filters = {}) {
  const where = ["mfg_work_centers.org_id = ?"];
  const params = [orgId];
  if (filters.status) {
    where.push("mfg_work_centers.status = ?");
    params.push(filters.status);
  }
  return db.prepare(`
    SELECT mfg_work_centers.*, stock_locations.code AS location_code, stock_locations.name AS location_name,
      users.name AS created_by_name
    FROM mfg_work_centers
    LEFT JOIN stock_locations ON stock_locations.id = mfg_work_centers.location_id
      AND stock_locations.org_id = mfg_work_centers.org_id
    LEFT JOIN users ON users.id = mfg_work_centers.created_by_user_id
    WHERE ${where.join(" AND ")}
    ORDER BY mfg_work_centers.status = 'inactive', mfg_work_centers.code
  `).all(...params).map(formatWorkCenter);
}

function getWorkCenter(db, orgId, workCenterId) {
  const row = db.prepare(`
    SELECT mfg_work_centers.*, stock_locations.code AS location_code, stock_locations.name AS location_name,
      users.name AS created_by_name
    FROM mfg_work_centers
    LEFT JOIN stock_locations ON stock_locations.id = mfg_work_centers.location_id
      AND stock_locations.org_id = mfg_work_centers.org_id
    LEFT JOIN users ON users.id = mfg_work_centers.created_by_user_id
    WHERE mfg_work_centers.org_id = ? AND mfg_work_centers.id = ?
  `).get(orgId, workCenterId);
  return row ? formatWorkCenter(row) : null;
}

function formatWorkCenter(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    locationId: row.location_id || "",
    locationCode: row.location_code || "",
    locationName: row.location_name || "",
    capacityPerDay: row.capacity_per_day,
    note: row.note || "",
    createdByUserId: row.created_by_user_id || "",
    createdByName: row.created_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createWorkCenter(db, user, body) {
  const input = normalizeWorkCenterBody(body, { partial: false });
  const location = input.locationId ? assertStockLocation(db, user.org_id, input.locationId, { internalOnly: true }) : null;
  assertWorkCenterCodeAvailable(db, user.org_id, input.code);
  const id = randomId("mfgwc");
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO mfg_work_centers (
      id, org_id, code, name, status, location_id, capacity_per_day, note,
      created_by_user_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, user.org_id, input.code, input.name, input.status, location?.id || null, input.capacityPerDay, input.note, user.id, now, now);
  emitSuiteEvent(db, {
    orgId: user.org_id,
    actorUserId: user.id,
    eventType: "manufacturing.work_center.created",
    subjectType: "mfg_work_center",
    subjectId: id,
    status: input.status,
    payload: { code: input.code, locationId: location?.id || "" }
  });
  audit(db, user.org_id, user.id, "manufacturing.work_center.created", { workCenterId: id, code: input.code });
  return { ok: true, workCenter: getWorkCenter(db, user.org_id, id) };
}

function updateWorkCenter(db, user, workCenterId, body) {
  const existing = getWorkCenter(db, user.org_id, workCenterId);
  if (!existing) throwNotFound("Manufacturing work center not found");
  const input = normalizeWorkCenterBody(body, { partial: true, existing });
  const location = input.locationId ? assertStockLocation(db, user.org_id, input.locationId, { internalOnly: true }) : null;
  if (input.code !== existing.code) assertWorkCenterCodeAvailable(db, user.org_id, input.code, workCenterId);
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE mfg_work_centers
    SET code = ?, name = ?, status = ?, location_id = ?, capacity_per_day = ?, note = ?, updated_at = ?
    WHERE org_id = ? AND id = ?
  `).run(input.code, input.name, input.status, location?.id || null, input.capacityPerDay, input.note, now, user.org_id, workCenterId);
  emitSuiteEvent(db, {
    orgId: user.org_id,
    actorUserId: user.id,
    eventType: "manufacturing.work_center.updated",
    subjectType: "mfg_work_center",
    subjectId: workCenterId,
    status: input.status,
    payload: { code: input.code, locationId: location?.id || "" }
  });
  audit(db, user.org_id, user.id, "manufacturing.work_center.updated", { workCenterId, code: input.code, status: input.status });
  return { ok: true, workCenter: getWorkCenter(db, user.org_id, workCenterId) };
}

function listWorkOrders(db, orgId, filters = {}) {
  const where = ["mfg_work_orders.org_id = ?"];
  const params = [orgId];
  if (filters.status) {
    where.push("mfg_work_orders.status = ?");
    params.push(filters.status);
  }
  if (filters.workCenterId) {
    where.push("mfg_work_orders.work_center_id = ?");
    params.push(filters.workCenterId);
  }
  return db.prepare(`
    SELECT mfg_work_orders.*, mfg_boms.bom_number, mfg_boms.revision AS bom_revision,
      catalog_items.sku AS product_sku, catalog_items.name AS product_name,
      mfg_work_centers.code AS work_center_code, mfg_work_centers.name AS work_center_name,
      stock_locations.code AS production_location_code, stock_locations.name AS production_location_name,
      users.name AS created_by_name
    FROM mfg_work_orders
    JOIN mfg_boms ON mfg_boms.id = mfg_work_orders.bom_id
      AND mfg_boms.org_id = mfg_work_orders.org_id
    JOIN catalog_items ON catalog_items.id = mfg_work_orders.product_item_id
      AND catalog_items.org_id = mfg_work_orders.org_id
    LEFT JOIN mfg_work_centers ON mfg_work_centers.id = mfg_work_orders.work_center_id
      AND mfg_work_centers.org_id = mfg_work_orders.org_id
    LEFT JOIN stock_locations ON stock_locations.id = mfg_work_orders.production_location_id
      AND stock_locations.org_id = mfg_work_orders.org_id
    LEFT JOIN users ON users.id = mfg_work_orders.created_by_user_id
    WHERE ${where.join(" AND ")}
    ORDER BY mfg_work_orders.status = 'cancelled', mfg_work_orders.due_date = '', mfg_work_orders.due_date, mfg_work_orders.created_at DESC
  `).all(...params).map(row => formatWorkOrder(db, row));
}

function getWorkOrder(db, orgId, workOrderId) {
  const row = db.prepare(`
    SELECT mfg_work_orders.*, mfg_boms.bom_number, mfg_boms.revision AS bom_revision,
      catalog_items.sku AS product_sku, catalog_items.name AS product_name,
      mfg_work_centers.code AS work_center_code, mfg_work_centers.name AS work_center_name,
      stock_locations.code AS production_location_code, stock_locations.name AS production_location_name,
      users.name AS created_by_name
    FROM mfg_work_orders
    JOIN mfg_boms ON mfg_boms.id = mfg_work_orders.bom_id
      AND mfg_boms.org_id = mfg_work_orders.org_id
    JOIN catalog_items ON catalog_items.id = mfg_work_orders.product_item_id
      AND catalog_items.org_id = mfg_work_orders.org_id
    LEFT JOIN mfg_work_centers ON mfg_work_centers.id = mfg_work_orders.work_center_id
      AND mfg_work_centers.org_id = mfg_work_orders.org_id
    LEFT JOIN stock_locations ON stock_locations.id = mfg_work_orders.production_location_id
      AND stock_locations.org_id = mfg_work_orders.org_id
    LEFT JOIN users ON users.id = mfg_work_orders.created_by_user_id
    WHERE mfg_work_orders.org_id = ? AND mfg_work_orders.id = ?
  `).get(orgId, workOrderId);
  return row ? formatWorkOrder(db, row) : null;
}

function getWorkOrderOrThrow(db, orgId, workOrderId) {
  const workOrder = getWorkOrder(db, orgId, workOrderId);
  if (!workOrder) throwNotFound("Manufacturing work order not found");
  return workOrder;
}

function formatWorkOrder(db, row) {
  const materials = db.prepare(`
    SELECT mfg_work_order_materials.*, catalog_items.sku AS component_sku, catalog_items.name AS component_name,
      catalog_items.unit_of_measure AS unit_of_measure, stock_locations.code AS source_location_code,
      stock_locations.name AS source_location_name
    FROM mfg_work_order_materials
    JOIN catalog_items ON catalog_items.id = mfg_work_order_materials.component_item_id
      AND catalog_items.org_id = mfg_work_order_materials.org_id
    LEFT JOIN stock_locations ON stock_locations.id = mfg_work_order_materials.source_location_id
      AND stock_locations.org_id = mfg_work_order_materials.org_id
    WHERE mfg_work_order_materials.org_id = ? AND mfg_work_order_materials.work_order_id = ?
    ORDER BY mfg_work_order_materials.created_at, mfg_work_order_materials.id
  `).all(row.org_id, row.id).map(formatWorkOrderMaterial);
  return {
    id: row.id,
    workOrderNumber: row.work_order_number,
    bomId: row.bom_id,
    bomNumber: row.bom_number,
    bomRevision: row.bom_revision,
    productItemId: row.product_item_id,
    productSku: row.product_sku,
    productName: row.product_name,
    workCenterId: row.work_center_id || "",
    workCenterCode: row.work_center_code || "",
    workCenterName: row.work_center_name || "",
    productionLocationId: row.production_location_id || "",
    productionLocationCode: row.production_location_code || "",
    productionLocationName: row.production_location_name || "",
    status: row.status,
    plannedQuantity: row.planned_quantity,
    plannedStartDate: row.planned_start_date || "",
    dueDate: row.due_date || "",
    releasedAt: row.released_at || "",
    cancelledAt: row.cancelled_at || "",
    note: row.note || "",
    materialReady: materials.every(material => material.status === "ready"),
    shortageCount: materials.filter(material => material.shortageQuantity > 0).length,
    estimatedMaterialCost: materials.reduce((sum, material) => sum + material.estimatedTotalCost, 0),
    createdByUserId: row.created_by_user_id || "",
    createdByName: row.created_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    materials
  };
}

function formatWorkOrderMaterial(row) {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    bomLineId: row.bom_line_id || "",
    componentItemId: row.component_item_id,
    componentSku: row.component_sku,
    componentName: row.component_name,
    unitOfMeasure: row.unit_of_measure,
    sourceLocationId: row.source_location_id || "",
    sourceLocationCode: row.source_location_code || "",
    sourceLocationName: row.source_location_name || "",
    requiredQuantity: row.required_quantity,
    availableQuantity: row.available_quantity,
    shortageQuantity: row.shortage_quantity,
    estimatedUnitCost: row.estimated_unit_cost,
    estimatedTotalCost: row.estimated_total_cost,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createWorkOrder(db, user, body) {
  const input = normalizeWorkOrderBody(body, { partial: false });
  const bom = getBomOrThrow(db, user.org_id, input.bomId);
  if (bom.status !== "active") throwConflict("Only active BoMs can create work orders");
  const workCenter = input.workCenterId ? assertWorkCenter(db, user.org_id, input.workCenterId, { activeOnly: true }) : defaultWorkCenter(db, user.org_id);
  const productionLocation = input.productionLocationId
    ? assertStockLocation(db, user.org_id, input.productionLocationId, { internalOnly: true })
    : defaultStockLocation(db, user.org_id);
  const workOrderNumber = input.workOrderNumber || nextWorkOrderNumber();
  assertWorkOrderNumberAvailable(db, user.org_id, workOrderNumber);
  const materialPlan = buildMaterialPlan(db, user.org_id, bom, input.plannedQuantity, productionLocation.id);
  const now = new Date().toISOString();
  const workOrderId = randomId("mfg-wo");
  db.exec("BEGIN");
  try {
    db.prepare(`
      INSERT INTO mfg_work_orders (
        id, org_id, work_order_number, bom_id, product_item_id, work_center_id,
        production_location_id, status, planned_quantity, planned_start_date,
        due_date, note, created_by_user_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workOrderId,
      user.org_id,
      workOrderNumber,
      bom.id,
      bom.productItemId,
      workCenter?.id || null,
      productionLocation.id,
      input.plannedQuantity,
      input.plannedStartDate,
      input.dueDate,
      input.note,
      user.id,
      now,
      now
    );
    insertWorkOrderMaterials(db, user.org_id, workOrderId, materialPlan, now);
    emitSuiteEvent(db, {
      orgId: user.org_id,
      actorUserId: user.id,
      eventType: "manufacturing.work_order.created",
      subjectType: "mfg_work_order",
      subjectId: workOrderId,
      status: "planned",
      payload: { workOrderNumber, bomId: bom.id, plannedQuantity: input.plannedQuantity, shortageCount: materialPlan.filter(line => line.shortageQuantity > 0).length }
    });
    audit(db, user.org_id, user.id, "manufacturing.work_order.created", { workOrderId, workOrderNumber, bomId: bom.id, plannedQuantity: input.plannedQuantity });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, workOrder: getWorkOrder(db, user.org_id, workOrderId) };
}

function updateWorkOrder(db, user, workOrderId, body) {
  const existing = getWorkOrderOrThrow(db, user.org_id, workOrderId);
  if (existing.status !== "planned") throwConflict("Only planned work orders can be updated");
  const input = normalizeWorkOrderBody(body, { partial: true, existing });
  const bom = getBomOrThrow(db, user.org_id, input.bomId);
  if (bom.status !== "active") throwConflict("Only active BoMs can create work orders");
  const workCenter = input.workCenterId ? assertWorkCenter(db, user.org_id, input.workCenterId, { activeOnly: true }) : null;
  const productionLocation = input.productionLocationId
    ? assertStockLocation(db, user.org_id, input.productionLocationId, { internalOnly: true })
    : defaultStockLocation(db, user.org_id);
  if (input.workOrderNumber !== existing.workOrderNumber) {
    assertWorkOrderNumberAvailable(db, user.org_id, input.workOrderNumber, workOrderId);
  }
  const materialPlan = buildMaterialPlan(db, user.org_id, bom, input.plannedQuantity, productionLocation.id);
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(`
      UPDATE mfg_work_orders
      SET work_order_number = ?, bom_id = ?, product_item_id = ?, work_center_id = ?,
        production_location_id = ?, planned_quantity = ?, planned_start_date = ?,
        due_date = ?, note = ?, updated_at = ?
      WHERE org_id = ? AND id = ?
    `).run(
      input.workOrderNumber,
      bom.id,
      bom.productItemId,
      workCenter?.id || null,
      productionLocation.id,
      input.plannedQuantity,
      input.plannedStartDate,
      input.dueDate,
      input.note,
      now,
      user.org_id,
      workOrderId
    );
    db.prepare("DELETE FROM mfg_work_order_materials WHERE org_id = ? AND work_order_id = ?").run(user.org_id, workOrderId);
    insertWorkOrderMaterials(db, user.org_id, workOrderId, materialPlan, now);
    emitSuiteEvent(db, {
      orgId: user.org_id,
      actorUserId: user.id,
      eventType: "manufacturing.work_order.updated",
      subjectType: "mfg_work_order",
      subjectId: workOrderId,
      status: "planned",
      payload: { workOrderNumber: input.workOrderNumber, bomId: bom.id, plannedQuantity: input.plannedQuantity }
    });
    audit(db, user.org_id, user.id, "manufacturing.work_order.updated", { workOrderId, workOrderNumber: input.workOrderNumber, bomId: bom.id });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, workOrder: getWorkOrder(db, user.org_id, workOrderId) };
}

function releaseWorkOrder(db, user, workOrderId) {
  const existing = getWorkOrderOrThrow(db, user.org_id, workOrderId);
  if (existing.status === "released") return { ok: true, idempotent: true, workOrder: existing };
  if (existing.status !== "planned") throwConflict("Only planned work orders can be released");
  const now = new Date().toISOString();
  let finished = false;
  db.exec("BEGIN");
  try {
    const { shortageCount } = refreshWorkOrderMaterialAvailability(db, user.org_id, workOrderId);
    if (shortageCount > 0) {
      db.exec("COMMIT");
      finished = true;
      throwConflict("Work order has material shortages");
    }
    db.prepare(`
      UPDATE mfg_work_orders
      SET status = 'released', released_at = ?, updated_at = ?
      WHERE org_id = ? AND id = ?
    `).run(now, now, user.org_id, workOrderId);
    emitSuiteEvent(db, {
      orgId: user.org_id,
      actorUserId: user.id,
      eventType: "manufacturing.work_order.released",
      subjectType: "mfg_work_order",
      subjectId: workOrderId,
      status: "released",
      payload: { workOrderNumber: existing.workOrderNumber, plannedQuantity: existing.plannedQuantity }
    });
    audit(db, user.org_id, user.id, "manufacturing.work_order.released", { workOrderId, workOrderNumber: existing.workOrderNumber });
    db.exec("COMMIT");
    finished = true;
  } catch (error) {
    if (!finished) db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, workOrder: getWorkOrder(db, user.org_id, workOrderId) };
}

function cancelWorkOrder(db, user, workOrderId, body) {
  const existing = getWorkOrderOrThrow(db, user.org_id, workOrderId);
  if (existing.status === "cancelled") return { ok: true, idempotent: true, workOrder: existing };
  if (!["planned", "released"].includes(existing.status)) throwConflict("Work order cannot be cancelled");
  const input = normalizeCancelBody(body);
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(`
      UPDATE mfg_work_orders
      SET status = 'cancelled', cancelled_at = ?, note = ?, updated_at = ?
      WHERE org_id = ? AND id = ?
    `).run(now, input.reason || existing.note, now, user.org_id, workOrderId);
    emitSuiteEvent(db, {
      orgId: user.org_id,
      actorUserId: user.id,
      eventType: "manufacturing.work_order.cancelled",
      subjectType: "mfg_work_order",
      subjectId: workOrderId,
      status: "cancelled",
      payload: { workOrderNumber: existing.workOrderNumber, reason: input.reason }
    });
    audit(db, user.org_id, user.id, "manufacturing.work_order.cancelled", { workOrderId, workOrderNumber: existing.workOrderNumber, reason: input.reason });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, workOrder: getWorkOrder(db, user.org_id, workOrderId) };
}

function insertWorkOrderMaterials(db, orgId, workOrderId, lines, now) {
  const insert = db.prepare(`
    INSERT INTO mfg_work_order_materials (
      id, org_id, work_order_id, bom_line_id, component_item_id, source_location_id,
      required_quantity, available_quantity, shortage_quantity, estimated_unit_cost,
      estimated_total_cost, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of lines) {
    insert.run(
      randomId("mfg-wo-mat"),
      orgId,
      workOrderId,
      line.bomLineId,
      line.componentItemId,
      line.sourceLocationId,
      line.requiredQuantity,
      line.availableQuantity,
      line.shortageQuantity,
      line.estimatedUnitCost,
      line.estimatedTotalCost,
      line.status,
      now,
      now
    );
  }
}

function refreshWorkOrderMaterialAvailability(db, orgId, workOrderId) {
  const rows = db.prepare(`
    SELECT id, component_item_id, source_location_id, required_quantity
    FROM mfg_work_order_materials
    WHERE org_id = ? AND work_order_id = ?
    ORDER BY created_at, id
  `).all(orgId, workOrderId);
  const now = new Date().toISOString();
  const update = db.prepare(`
    UPDATE mfg_work_order_materials
    SET available_quantity = ?, shortage_quantity = ?, status = ?, updated_at = ?
    WHERE org_id = ? AND id = ?
  `);
  let shortageCount = 0;
  for (const row of rows) {
    const availableQuantity = readAvailableStock(db, orgId, row.component_item_id, row.source_location_id);
    const shortageQuantity = Math.max(0, Number(row.required_quantity || 0) - availableQuantity);
    if (shortageQuantity > 0) shortageCount += 1;
    update.run(
      availableQuantity,
      shortageQuantity,
      shortageQuantity > 0 ? "short" : "ready",
      now,
      orgId,
      row.id
    );
  }
  return { shortageCount };
}

function buildMaterialPlan(db, orgId, bom, plannedQuantity, sourceLocationId) {
  return bom.lines.map(line => {
    const requiredQuantity = Math.ceil((line.plannedQuantity * plannedQuantity) / bom.quantity);
    const availableQuantity = readAvailableStock(db, orgId, line.componentItemId, sourceLocationId);
    const shortageQuantity = Math.max(0, requiredQuantity - availableQuantity);
    return {
      bomLineId: line.id,
      componentItemId: line.componentItemId,
      sourceLocationId,
      requiredQuantity,
      availableQuantity,
      shortageQuantity,
      estimatedUnitCost: line.standardCost,
      estimatedTotalCost: requiredQuantity * line.standardCost,
      status: shortageQuantity > 0 ? "short" : "ready"
    };
  });
}

function getShopFloorBoard(db, orgId) {
  const centers = listWorkCenters(db, orgId, {});
  const openOrders = listWorkOrders(db, orgId, {}).filter(order => order.status !== "cancelled");
  const byCenter = new Map();
  for (const center of centers) byCenter.set(center.id, { workCenter: center, workOrders: [] });
  const unassigned = { workCenter: { id: "", code: "UNASSIGNED", name: "Unassigned", status: "active" }, workOrders: [] };
  for (const order of openOrders) {
    const lane = order.workCenterId && byCenter.has(order.workCenterId) ? byCenter.get(order.workCenterId) : unassigned;
    lane.workOrders.push(order);
  }
  return [...byCenter.values(), unassigned]
    .filter(lane => lane.workOrders.length > 0 || lane.workCenter.id)
    .map(lane => ({
      ...lane,
      counts: {
        planned: lane.workOrders.filter(order => order.status === "planned").length,
        released: lane.workOrders.filter(order => order.status === "released").length,
        materialShort: lane.workOrders.filter(order => !order.materialReady).length
      }
    }));
}

function normalizeBomBody(body, options = {}) {
  const { partial = false, existing = {} } = options;
  if (!isPlainObject(body)) throwInvalidManufacturingMetadata();
  const defaultLines = existing.lines || [];
  return {
    bomNumber: normalizeOptionalCode(body, "bomNumber", existing.bomNumber || ""),
    productItemId: normalizeText(body, "productItemId", { required: !partial, fallback: existing.productItemId || "", idLike: true }),
    status: normalizeChoice(body, "status", BOM_STATUSES, existing.status || "draft"),
    quantity: normalizeInteger(body, "quantity", { required: !partial, fallback: existing.quantity || 1, min: 1, max: 1000000 }),
    unitOfMeasure: normalizeText(body, "unitOfMeasure", { fallback: existing.unitOfMeasure || "unit", maxLength: 40 }),
    note: normalizeText(body, "note", { fallback: existing.note || "", maxLength: 500 }),
    lines: normalizeBomLines(body, defaultLines)
  };
}

function normalizeBomLines(body, fallbackLines) {
  const value = Object.prototype.hasOwnProperty.call(body, "lines") ? body.lines : fallbackLines;
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throwInvalidManufacturingMetadata();
  return value.map(line => {
    if (!isPlainObject(line)) throwInvalidManufacturingMetadata();
    return {
      componentItemId: normalizeText(line, "componentItemId", { required: true, idLike: true }),
      quantity: normalizeInteger(line, "quantity", { required: true, min: 1, max: 1000000 }),
      scrapPercent: normalizeNumber(line, "scrapPercent", { fallback: 0, min: 0, max: 100 }),
      note: normalizeText(line, "note", { fallback: "", maxLength: 300 })
    };
  });
}

function normalizeBomLineWithItem(db, orgId, line, productItemId) {
  if (line.componentItemId === productItemId) throwInvalidManufacturingMetadata("BoM component cannot be the same as the product");
  const component = assertStockItem(db, orgId, line.componentItemId, "Stock-tracked active component required");
  return { ...line, componentItemId: component.id };
}

function assertUniqueBomComponents(lines) {
  const seen = new Set();
  for (const line of lines) {
    if (seen.has(line.componentItemId)) {
      throwInvalidManufacturingMetadata("BoM component lines must be unique");
    }
    seen.add(line.componentItemId);
  }
}

function normalizeWorkCenterBody(body, options = {}) {
  const { partial = false, existing = {} } = options;
  if (!isPlainObject(body)) throwInvalidManufacturingMetadata();
  return {
    code: normalizeRequiredCode(body, "code", { required: !partial, fallback: existing.code || "" }),
    name: normalizeText(body, "name", { required: !partial, fallback: existing.name || "", minLength: 2, maxLength: 160 }),
    status: normalizeChoice(body, "status", WORK_CENTER_STATUSES, existing.status || "active"),
    locationId: normalizeText(body, "locationId", { fallback: existing.locationId || "", idLike: true }),
    capacityPerDay: normalizeInteger(body, "capacityPerDay", { fallback: existing.capacityPerDay || 0, min: 0, max: 1000000 }),
    note: normalizeText(body, "note", { fallback: existing.note || "", maxLength: 500 })
  };
}

function normalizeWorkOrderBody(body, options = {}) {
  const { partial = false, existing = {} } = options;
  if (!isPlainObject(body)) throwInvalidManufacturingMetadata();
  return {
    workOrderNumber: normalizeOptionalCode(body, "workOrderNumber", existing.workOrderNumber || ""),
    bomId: normalizeText(body, "bomId", { required: !partial, fallback: existing.bomId || "", idLike: true }),
    workCenterId: normalizeText(body, "workCenterId", { fallback: existing.workCenterId || "", idLike: true }),
    productionLocationId: normalizeText(body, "productionLocationId", { fallback: existing.productionLocationId || "", idLike: true }),
    plannedQuantity: normalizeInteger(body, "plannedQuantity", { required: !partial, fallback: existing.plannedQuantity || 1, min: 1, max: 1000000 }),
    plannedStartDate: normalizeDateText(body, "plannedStartDate", existing.plannedStartDate || ""),
    dueDate: normalizeDateText(body, "dueDate", existing.dueDate || ""),
    note: normalizeText(body, "note", { fallback: existing.note || "", maxLength: 500 })
  };
}

function normalizeCancelBody(body) {
  if (!isPlainObject(body)) throwInvalidManufacturingMetadata();
  return { reason: normalizeText(body, "reason", { fallback: "", maxLength: 500 }) };
}

function normalizeListQuery(query, fields, allowedStatuses) {
  const out = {};
  for (const field of fields) {
    out[field] = normalizeQueryText(query, field, { idLike: field.endsWith("Id") });
  }
  if (out.status) {
    const allowed = new Set(allowedStatuses || []);
    if (!allowed.has(out.status)) throwInvalidManufacturingMetadata();
  }
  return out;
}

function normalizeQueryText(query, field, options = {}) {
  const value = Object.prototype.hasOwnProperty.call(query, field) ? query[field] : undefined;
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || hasControlCharacters(value)) throwInvalidManufacturingMetadata();
  const text = value.trim();
  if (!text || text.length > 160) throwInvalidManufacturingMetadata();
  if (options.idLike && !ID_RE.test(text)) throwInvalidManufacturingMetadata();
  return text;
}

function normalizeText(body, field, options = {}) {
  const { required = false, fallback = "", minLength = 0, maxLength = 200, idLike = false } = options;
  const value = Object.prototype.hasOwnProperty.call(body, field) ? body[field] : undefined;
  if (value === undefined || value === "") {
    if (required) throwInvalidManufacturingMetadata();
    return String(fallback || "").trim();
  }
  if (value === null || typeof value !== "string" || hasControlCharacters(value)) throwInvalidManufacturingMetadata();
  const text = value.trim();
  if (text.length < minLength || text.length > maxLength) throwInvalidManufacturingMetadata();
  if (idLike && text && !ID_RE.test(text)) throwInvalidManufacturingMetadata();
  return text;
}

function normalizeChoice(body, field, allowed, fallback) {
  const value = Object.prototype.hasOwnProperty.call(body, field) ? body[field] : undefined;
  if (value === undefined || value === "") return fallback;
  if (value === null || typeof value !== "string" || hasControlCharacters(value)) throwInvalidManufacturingMetadata();
  const text = value.trim();
  if (!allowed.includes(text)) throwInvalidManufacturingMetadata();
  return text;
}

function normalizeInteger(body, field, options = {}) {
  const { required = false, fallback = 0, min = 0, max = 1000000 } = options;
  const value = Object.prototype.hasOwnProperty.call(body, field) ? body[field] : undefined;
  if (value === undefined || value === "") {
    if (required) throwInvalidManufacturingMetadata();
    return fallback;
  }
  if (value === null || typeof value === "boolean" || typeof value === "object") throwInvalidManufacturingMetadata();
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isSafeInteger(number) || number < min || number > max) throwInvalidManufacturingMetadata();
  return number;
}

function normalizeNumber(body, field, options = {}) {
  const { fallback = 0, min = 0, max = 100 } = options;
  const value = Object.prototype.hasOwnProperty.call(body, field) ? body[field] : undefined;
  if (value === undefined || value === "") return fallback;
  if (value === null || typeof value === "boolean" || typeof value === "object") throwInvalidManufacturingMetadata();
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(number) || number < min || number > max) throwInvalidManufacturingMetadata();
  return number;
}

function normalizeDateText(body, field, fallback) {
  const value = Object.prototype.hasOwnProperty.call(body, field) ? body[field] : undefined;
  if (value === undefined || value === "") return fallback;
  if (value === null || typeof value !== "string" || hasControlCharacters(value)) throwInvalidManufacturingMetadata();
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throwInvalidManufacturingMetadata();
  return text;
}

function normalizeOptionalCode(body, field, fallback = "") {
  const value = Object.prototype.hasOwnProperty.call(body, field) ? body[field] : undefined;
  if (value === undefined || value === "") return fallback;
  return normalizeRequiredCode(body, field, { required: true, fallback });
}

function normalizeRequiredCode(body, field, options = {}) {
  const text = normalizeText(body, field, { required: options.required, fallback: options.fallback || "", minLength: 1, maxLength: 40 }).toUpperCase();
  if (!CODE_RE.test(text)) throwInvalidManufacturingMetadata();
  return text;
}

function normalizePathId(value) {
  if (typeof value !== "string" || hasControlCharacters(value)) throwInvalidManufacturingMetadata();
  const text = value.trim();
  if (!text || text.length > 160 || !ID_RE.test(text)) throwInvalidManufacturingMetadata();
  return text;
}

function assertProductItem(db, orgId, itemId) {
  const item = assertStockItem(db, orgId, itemId, "Stock-tracked active product item required");
  if (item.item_type === "service") throwInvalidManufacturingMetadata("Manufacturing product must be stockable or consumable");
  return item;
}

function assertStockItem(db, orgId, itemId, message) {
  const item = db.prepare(`
    SELECT id, sku, name, item_type, status, unit_of_measure, standard_cost, track_stock
    FROM catalog_items
    WHERE org_id = ? AND id = ?
  `).get(orgId, itemId);
  if (!item || item.status !== "active" || !item.track_stock) {
    const error = new Error(message);
    error.statusCode = 422;
    throw error;
  }
  return item;
}

function assertStockLocation(db, orgId, locationId, options = {}) {
  const location = db.prepare(`
    SELECT id, code, name, location_type, status
    FROM stock_locations
    WHERE org_id = ? AND id = ?
  `).get(orgId, locationId);
  if (!location || location.status !== "active") throwNotFound("Stock location not found");
  if (options.internalOnly && location.location_type !== "internal") {
    throwInvalidManufacturingMetadata("Manufacturing location must be an active internal stock location");
  }
  return location;
}

function defaultStockLocation(db, orgId) {
  const location = db.prepare(`
    SELECT id, code, name, location_type, status
    FROM stock_locations
    WHERE org_id = ? AND code = 'WH/STOCK' AND status = 'active'
  `).get(orgId);
  if (!location) throwNotFound("Default manufacturing stock location not found");
  return location;
}

function assertWorkCenter(db, orgId, workCenterId, options = {}) {
  const workCenter = getWorkCenter(db, orgId, workCenterId);
  if (!workCenter) throwNotFound("Manufacturing work center not found");
  if (options.activeOnly && workCenter.status !== "active") throwConflict("Manufacturing work center is inactive");
  return workCenter;
}

function defaultWorkCenter(db, orgId) {
  return db.prepare(`
    SELECT id, code, name, status, location_id, capacity_per_day, note, created_by_user_id, created_at, updated_at
    FROM mfg_work_centers
    WHERE org_id = ? AND status = 'active'
    ORDER BY code LIMIT 1
  `).get(orgId);
}

function readAvailableStock(db, orgId, itemId, locationId) {
  const row = db.prepare(`
    SELECT quantity, reserved_quantity
    FROM stock_quants
    WHERE org_id = ? AND catalog_item_id = ? AND location_id = ?
  `).get(orgId, itemId, locationId);
  if (!row) return 0;
  const liveReserved = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) AS live
    FROM stock_reservations
    WHERE org_id = ? AND item_id = ? AND location_id = ? AND status = 'active'
  `).get(orgId, itemId, locationId).live;
  const reserved = Math.max(Number(row.reserved_quantity || 0), Number(liveReserved || 0));
  return Math.max(0, Number(row.quantity || 0) - reserved);
}

function assertBomNumberAvailable(db, orgId, bomNumber, revision, excludeId = "") {
  const existing = db.prepare(`
    SELECT id FROM mfg_boms
    WHERE org_id = ? AND bom_number = ? AND revision = ? AND id <> ?
  `).get(orgId, bomNumber, revision, excludeId);
  if (existing) throwConflict("Manufacturing BoM number and revision already exists");
}

function assertWorkCenterCodeAvailable(db, orgId, code, excludeId = "") {
  const existing = db.prepare(`
    SELECT id FROM mfg_work_centers
    WHERE org_id = ? AND code = ? AND id <> ?
  `).get(orgId, code, excludeId);
  if (existing) throwConflict("Manufacturing work center code already exists");
}

function assertWorkOrderNumberAvailable(db, orgId, workOrderNumber, excludeId = "") {
  const existing = db.prepare(`
    SELECT id FROM mfg_work_orders
    WHERE org_id = ? AND work_order_number = ? AND id <> ?
  `).get(orgId, workOrderNumber, excludeId);
  if (existing) throwConflict("Manufacturing work order number already exists");
}

function nextBomRevision(db, orgId, bomNumber) {
  const row = db.prepare(`
    SELECT MAX(revision) AS revision
    FROM mfg_boms
    WHERE org_id = ? AND bom_number = ?
  `).get(orgId, bomNumber);
  return Number(row?.revision || 0) + 1;
}

function nextBomNumber() {
  return `BOM-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function nextWorkOrderNumber() {
  return `MO-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function estimateBomUnitCost(lines, quantity) {
  if (!quantity) return 0;
  const total = lines.reduce((sum, line) => sum + line.estimatedLineCost, 0);
  return Math.round(total / quantity);
}

function applyScrap(quantity, scrapPercent) {
  return Math.ceil(quantity * (1 + (scrapPercent / 100)));
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function hasControlCharacters(value) {
  return /[\x00-\x1f\x7f]/.test(value);
}

function throwInvalidManufacturingMetadata(message = "Manufacturing request requires safe metadata") {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function throwConflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  throw error;
}

function throwNotFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  throw error;
}

module.exports = {
  registerManufacturingRoutes,
  __test: {
    applyScrap
  }
};
