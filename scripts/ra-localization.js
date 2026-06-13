#!/usr/bin/env node
// A1 / HayHashvapah — offline Armenian (RA) localization CLI.
//
// Exposes the RA fiscal-localization engines for offline, sovereign use by an
// accountant or developer — no server, no network. Each subcommand lazily loads
// only the engine it needs, so the CLI works as engines land on main.
//
//   ra-localization hvhh <id>            validate a taxpayer ՀՎՀՀ
//   ra-localization phone <number>       normalize/validate a phone
//   ra-localization region <code|name>   look up a marz (region)
//   ra-localization account <code>       look up a chart-of-accounts code
//   ra-localization payroll <grossAMD>   compute gross→net withholdings
//   ra-localization vat-return <file>    compute a VAT return from a JSON period
//   ra-localization einvoice <file>      build e-invoice XML from a JSON invoice
//
// Structured commands print JSON; einvoice prints XML. Exit 2 on bad input.

"use strict";
const fs = require("node:fs");
const path = require("node:path");

function engine(name) {
  return require(path.join(__dirname, "..", "server", name));
}

function out(value) {
  process.stdout.write(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  process.stdout.write("\n");
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(2);
}

function readJson(file) {
  if (!file) fail("expected a JSON file path");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fail(`cannot read JSON from ${file}: ${e.message}`);
  }
}

const USAGE = [
  "A1 RA localization CLI — usage:",
  "  ra-localization hvhh <id>",
  "  ra-localization phone <number>",
  "  ra-localization region <code|name>",
  "  ra-localization account <code>",
  "  ra-localization payroll <grossAMD>",
  "  ra-localization vat-return <file.json>   (file: { sales:[...], purchases:[...] })",
  "  ra-localization einvoice <file.json>     (file: the invoice object)",
].join("\n");

function run(argv) {
  const [cmd, arg] = argv;
  switch (cmd) {
    case "hvhh":
      return out(engine("localization").validateHvhh(arg));
    case "phone": {
      const p = engine("armeniaPhone");
      return out({ valid: p.isValidArmenianPhone(arg), e164: p.e164(arg), formatted: p.formatPhone(arg) });
    }
    case "region":
      return out(engine("armeniaRegions").findRegion(arg) || { error: "unknown region" });
    case "account": {
      const c = engine("armeniaChartOfAccounts");
      const acct = c.accountByCode(arg);
      return out(acct ? { ...acct, normalBalance: c.normalBalance(arg) } : { error: "unknown account code" });
    }
    case "payroll":
      return out(engine("armeniaPayroll").computePayroll(Number(arg)));
    case "vat-return": {
      const v = engine("vatReturn");
      const period = readJson(arg);
      const form = v.vatReturnForm(period);
      return out({
        summary: v.computeVatReturn(period),
        form: form.lines,
        formSource: form.source,
        formLineDefinitions: form.lineDefinitions,
      });
    }
    case "einvoice":
      return out(engine("einvoice").buildEInvoiceXml(readJson(arg)));
    case undefined:
    case "help":
    case "--help":
      return out(USAGE);
    default:
      return fail(`unknown command "${cmd}"\n${USAGE}`);
  }
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (e) {
    fail(e && e.message ? e.message : String(e));
  }
}

module.exports = { run };
