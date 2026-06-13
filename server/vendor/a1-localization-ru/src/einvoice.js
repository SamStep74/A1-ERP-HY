"use strict";

// Электронный счёт-фактура / УПД — Russian e-invoice XML builder + structural validator.
//
// Reality / scope: the official электронный счёт-фактура (УПД) is the XML format 5.03
// per Приказ ФНС России № ЕД-7-26/970@ (XSD class ON_NSCHFDOPPR, published on
// nalog.gov.ru). REAL submission must transit a licensed оператор ЭДО (electronic
// document interchange operator) and be signed with a КЭП — квалифицированная
// электронная подпись (GOST qualified e-signature, 63-ФЗ).
//
// This module produces a STRUCTURAL representation that the caller maps to the official
// ON_NSCHFDOPPR XSD (format 5.03) before submission. Transport + signing are documented
// SEAMS (interfaces IEdoOperator + IKepSigner) that are intentionally NOT implemented
// here — no network, no filesystem, no signing. Element names below are our own
// representation of the official счёт-фактура fields, not the XSD tag set.
//
// Amounts are in RUB with kopeck precision (2 decimals) via the localization kernel.
// Pure functions, no I/O.

const { roundRub } = require("./money");
const { validateInn, isValidKpp } = require("./inn");
const { CURRENT_YEAR, ratesFor } = require("./vat");

// Допустимые ставки НДС для ВЫСТАВЛЯЕМОГО счёта-фактуры в 2026 г.:
//   0% (экспорт/освобождение), 10% (льготная: продукты/детские/медицина),
//   22% (основная ставка с 01.01.2026 — налоговая реформа 2026, было 20%).
// Расчётные ставки 10/110, 22/122 здесь не указываются — это не ставки выставления.
const VAT_RATES_2026 = Object.freeze([0, 10, 22]);

// Валюта по умолчанию — российский рубль (буквенный RUB, цифровой код 643 по ОКВ/ISO 4217).
const DEFAULT_CURRENCY = "RUB";
const RUB_CURRENCY_CODE = "643";

const MAX_LINE_DESCRIPTION = 1000; // наименование товара/работы/услуги

function str(value) {
  return String(value == null ? "" : value).trim();
}

function xmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function invoiceVatRates(invoice = {}) {
  const year = isValidIsoDate(str(invoice.date)) ? Number(str(invoice.date).slice(0, 4)) : CURRENT_YEAR;
  const rates = ratesFor(year);
  return [...new Set([rates.zero, rates.reduced, rates.standard].filter(Number.isFinite))]
    .sort((a, b) => a - b);
}

// Нормализация строки в копеечные суммы (2 знака). НДС считается от net*ставка, а итог
// строки = net + НДС, если не заданы явно. quantity по умолчанию 1, никогда не NaN.
function normalizeLine(line = {}) {
  const net = roundRub(line.netAmount);
  const rate = Number(line.vatRate) || 0;
  const vat = line.vatAmount != null ? roundRub(line.vatAmount) : roundRub((net * rate) / 100);
  const rawQuantity = line.quantity != null ? Number(line.quantity) : 1;
  const quantity = Number.isFinite(rawQuantity) ? rawQuantity : 0; // никогда не NaN
  const unitPrice = line.unitPrice != null
    ? roundRub(line.unitPrice)
    : (quantity ? roundRub(net / quantity) : 0);
  const total = line.lineTotal != null ? roundRub(line.lineTotal) : roundRub(net + vat);
  return { description: line.description || "", quantity, unitPrice, net, rate, vat, total };
}

// Свод по строкам — суммирование в копейках через roundRub (без дрейфа float).
function eInvoiceTotals(lines) {
  return (lines || []).map(normalizeLine).reduce(
    (a, l) => ({
      net: roundRub(a.net + l.net),
      vat: roundRub(a.vat + l.vat),
      total: roundRub(a.total + l.total),
    }),
    { net: 0, vat: 0, total: 0 },
  );
}

// Идентификация контрагента: <Name>, <INN>, <KPP> (КПП необязателен для ИП), <Address>.
function partyXml(tag, party = {}) {
  const p = party || {};
  const lines = [`  <${tag}>`, `    <Name>${xmlEscape(p.name)}</Name>`, `    <INN>${xmlEscape(p.inn || "")}</INN>`];
  if (str(p.kpp)) lines.push(`    <KPP>${xmlEscape(p.kpp)}</KPP>`); // КПП отсутствует у ИП
  lines.push(`    <Address>${xmlEscape(p.address || "")}</Address>`, `  </${tag}>`);
  return lines;
}

function buildEInvoiceXml(invoice = {}) {
  const inv = invoice || {};
  const currency = str(inv.currency) || DEFAULT_CURRENCY;
  const currencyCode = currency === DEFAULT_CURRENCY ? RUB_CURRENCY_CODE : str(inv.currencyCode);
  const norm = (Array.isArray(inv.lines) ? inv.lines : []).map(normalizeLine);
  const totals = eInvoiceTotals(inv.lines);

  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- A1 электронный счёт-фактура / УПД (структурный экспорт). Перед отправкой",
    "     сопоставьте поля с официальной XSD ON_NSCHFDOPPR (формат 5.03, Приказ ФНС",
    "     № ЕД-7-26/970@, nalog.gov.ru). Передача через оператора ЭДО (seam: IEdoOperator)",
    "     и подпись КЭП по 63-ФЗ (seam: IKepSigner) здесь намеренно не реализованы. -->",
    `<Schet-Faktura currency="${xmlEscape(currency)}" currencyCode="${xmlEscape(currencyCode)}">`,
    `  <Number>${xmlEscape(inv.number)}</Number>`,
    `  <Date>${xmlEscape(str(inv.date).slice(0, 10))}</Date>`,
    ...partyXml("Seller", inv.seller),
    ...partyXml("Buyer", inv.buyer),
    "  <Lines>",
  ];
  for (const l of norm) {
    out.push(
      "    <Line>",
      `      <Description>${xmlEscape(l.description)}</Description>`,
      `      <Quantity>${l.quantity}</Quantity>`,
      `      <UnitPrice>${l.unitPrice}</UnitPrice>`,
      `      <NetAmount>${l.net}</NetAmount>`,
      `      <VatRate>${l.rate}</VatRate>`,
      `      <VatAmount>${l.vat}</VatAmount>`,
      `      <LineTotal>${l.total}</LineTotal>`,
      "    </Line>",
    );
  }
  out.push(
    "  </Lines>",
    "  <Totals>",
    `    <TotalNet>${totals.net}</TotalNet>`,
    `    <TotalVat>${totals.vat}</TotalVat>`,
    `    <TotalAmount>${totals.total}</TotalAmount>`,
    "  </Totals>",
    "</Schet-Faktura>",
  );
  return out.join("\n");
}

// Структурный контроль счёта-фактуры ДО сопоставления с официальной XSD и отправки.
// Возвращает { ok, errors:[{field, code, message}] } и НИКОГДА не бросает исключение.
// Срабатывает «на закрытие» (fail-closed) по каждому обязательному полю.
function validateEInvoice(invoice = {}) {
  const inv = invoice && typeof invoice === "object" ? invoice : {};
  const errors = [];
  const add = (field, code, message) => errors.push({ field, code, message });

  if (!str(inv.number)) {
    add("number", "MISSING_NUMBER", "Номер счёта-фактуры обязателен.");
  }

  const date = str(inv.date);
  if (!date) {
    add("date", "MISSING_DATE", "Дата счёта-фактуры обязательна.");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    add("date", "INVALID_DATE", "Дата должна быть в формате ISO (ГГГГ-ММ-ДД).");
  } else if (!isValidIsoDate(date)) {
    add("date", "INVALID_DATE", "Дата должна быть существующей календарной датой.");
  }

  const currency = str(inv.currency) || DEFAULT_CURRENCY;
  const currencyCode = currency === DEFAULT_CURRENCY ? RUB_CURRENCY_CODE : str(inv.currencyCode);
  if (currency !== DEFAULT_CURRENCY && !/^\d{3}$/.test(currencyCode)) {
    add("currencyCode", "MISSING_CURRENCY_CODE", "Для валюты не RUB требуется числовой код валюты.");
  }

  // Продавец: наименование + действительный ИНН; КПП проверяется только если задан.
  const seller = inv.seller || {};
  if (!str(seller.name)) {
    add("seller.name", "MISSING_SELLER_NAME", "Наименование продавца обязательно.");
  }
  if (!validateInn(seller.inn).ok) {
    add("seller.inn", "INVALID_SELLER_INN", "ИНН продавца отсутствует или некорректен.");
  }
  if (str(seller.kpp) && !isValidKpp(seller.kpp)) {
    add("seller.kpp", "INVALID_SELLER_KPP", "КПП продавца имеет неверный формат (ожидается NNNNXXNNN).");
  }

  // Покупатель: действительный ИНН обязателен; КПП необязателен (ИП его не имеет).
  const buyer = inv.buyer || {};
  if (!str(buyer.name)) {
    add("buyer.name", "MISSING_BUYER_NAME", "Наименование покупателя обязательно.");
  }
  if (!validateInn(buyer.inn).ok) {
    add("buyer.inn", "INVALID_BUYER_INN", "ИНН покупателя отсутствует или некорректен.");
  }
  if (str(buyer.kpp) && !isValidKpp(buyer.kpp)) {
    add("buyer.kpp", "INVALID_BUYER_KPP", "КПП покупателя имеет неверный формат (ожидается NNNNXXNNN).");
  }

  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  if (lines.length === 0) {
    add("lines", "NO_LINES", "Требуется хотя бы одна строка счёта-фактуры.");
  } else {
    const allowedRates = invoiceVatRates(inv);
    lines.forEach((line, i) => {
      const pos = i + 1; // путь с 1, напр. lines[2].description
      const l = line || {};
      const description = str(l.description);
      if (!description || description.length > MAX_LINE_DESCRIPTION) {
        add(
          `lines[${pos}].description`,
          "INVALID_LINE_DESCRIPTION",
          `Наименование строки обязательно и не длиннее ${MAX_LINE_DESCRIPTION} символов.`,
        );
      }
      const quantity = l.quantity != null ? Number(l.quantity) : 1;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        add(`lines[${pos}].quantity`, "INVALID_LINE_QUANTITY", "Количество должно быть положительным числом.");
      }
      const net = l.netAmount != null ? Number(l.netAmount) : 0;
      if (!Number.isFinite(net) || net < 0) {
        add(`lines[${pos}].netAmount`, "INVALID_LINE_NET", "Сумма без НДС должна быть неотрицательным числом.");
      }
      const rate = str(l.vatRate) !== "" ? Number(l.vatRate) : 0;
      if (!allowedRates.includes(rate)) {
        add(
          `lines[${pos}].vatRate`,
          "INVALID_LINE_VAT_RATE",
          `Ставка НДС должна быть одной из: ${allowedRates.join("%, ")}%.`,
        );
      }
      const expectedVat = roundRub((net * rate) / 100);
      // Если НДС задан явно — он должен совпадать со ставкой (в пределах 1 рубля,
      // округлённого до копеек). Иначе строка могла бы заявить 22% и НДС 0 и пройти.
      if (l.vatAmount != null && str(l.vatAmount) !== "") {
        const declaredVat = Number(l.vatAmount);
        if (!Number.isFinite(declaredVat)) {
          add(`lines[${pos}].vatAmount`, "INVALID_LINE_VAT_AMOUNT", "Сумма НДС должна быть числом.");
        } else {
          if (Math.abs(roundRub(declaredVat) - expectedVat) > 1) {
            add(
              `lines[${pos}].vatAmount`,
              "LINE_VAT_MISMATCH",
              `Сумма НДС ${declaredVat} не соответствует ${rate}% от ${net} (ожидается ~${expectedVat}).`,
            );
          }
        }
      }
      if (l.lineTotal != null && str(l.lineTotal) !== "") {
        const declaredTotal = Number(l.lineTotal);
        if (!Number.isFinite(declaredTotal)) {
          add(`lines[${pos}].lineTotal`, "INVALID_LINE_TOTAL", "Итог строки должен быть числом.");
        } else {
          const vatAmount = l.vatAmount != null && str(l.vatAmount) !== "" && Number.isFinite(Number(l.vatAmount))
            ? roundRub(Number(l.vatAmount))
            : expectedVat;
          const expectedTotal = roundRub(net + vatAmount);
          if (Math.abs(roundRub(declaredTotal) - expectedTotal) > 1) {
            add(
              `lines[${pos}].lineTotal`,
              "LINE_TOTAL_MISMATCH",
              `Итог строки ${declaredTotal} не соответствует сумме ${net} + НДС ${vatAmount} (ожидается ~${expectedTotal}).`,
            );
          }
        }
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  VAT_RATES_2026,
  DEFAULT_CURRENCY,
  RUB_CURRENCY_CODE,
  xmlEscape,
  normalizeLine,
  eInvoiceTotals,
  buildEInvoiceXml,
  validateEInvoice,
};
