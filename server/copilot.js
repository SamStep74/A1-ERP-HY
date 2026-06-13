"use strict";

const INTENTS = ["vat", "payroll", "personal-data", "esign", "month-close"];

function normalizeIntent(value, question) {
  const raw = String(value || "").trim();
  if (INTENTS.includes(raw)) return raw;
  const text = String(question || "").toLowerCase();
  if (/(vat|src|tax|invoice|ԱԱՀ|հարկ)/i.test(text)) return "vat";
  if (/(payroll|salary|gross|net|աշխատավարձ|պահում)/i.test(text)) return "payroll";
  if (/(personal[-\s]?data|privacy|delete|export|consent|տվյալ|համաձայն)/i.test(text)) return "personal-data";
  if (/(esign|signature|signed|document|contract|ստորագր)/i.test(text)) return "esign";
  if (/(month|close|period|trial balance|փակում)/i.test(text)) return "month-close";
  return "vat";
}

function requiredAppForIntent(intent) {
  if (intent === "esign") return "docs";
  return intent === "personal-data" ? "crm" : "finance";
}

// --- Open Notebook supplemental sources (opt-in, advisory-only) --------------
// The ranking/dedupe/cap policy now lives in the shared @a1/ai core (vendored at
// ./vendor/a1-ai) so every A1 product handles supplemental sources identically.
// Advisory-only: they never enter the law-* citation set, status/sourceReady, or
// confidence — that gate is enforced below in buildCopilotPacket.
const { normalizeSupplementalSources, MAX_SUPPLEMENTAL_SOURCES } = require("./vendor/a1-ai");

// Append a clearly-labeled, non-authoritative note. The curated "Աղբյուրներ:"
// line built by buildAnswer() remains the source of record.
function withSupplementalNote(answer, supplementalSources) {
  if (!supplementalSources.length) return answer;
  const titles = supplementalSources.map(source => source.title).join("; ");
  return `${answer} Լրացուցիչ ոչ-պաշտոնական աղբյուրներ (Open Notebook, ընտրովի) դիտարկվել են միայն համատեքստի համար եւ պաշտոնական իրավական մեջբերում չեն. ${titles}:`;
}

function buildCopilotPacket(input) {
  const now = input.now || new Date().toISOString();
  const intent = normalizeIntent(input.intent, input.question);
  const citations = Array.isArray(input.citations) ? input.citations : [];
  const calculations = Array.isArray(input.calculations) ? input.calculations : [];
  const context = input.context || {};
  const legal = citations.filter(source => /^law-/.test(source.id || ""));
  const citationRequired = ["vat", "personal-data", "esign", "month-close"].includes(intent);
  const sourceReady = legal.length > 0 && legal.every(source => (
    source.status === "active"
    && (source.professionalReviewReady === undefined || source.professionalReviewReady === true)
  ));
  const status = citationRequired && legal.length === 0 ? "blocked-missing-citation" : "draft";
  const riskLevel = intent === "payroll" || intent === "month-close" ? "financial" : "legal";
  const reviewRequired = true;
  const supplementalSources = normalizeSupplementalSources(input.supplementalSources);
  const answer = withSupplementalNote(
    buildAnswer({ intent, question: input.question, citations, calculations, context, sourceReady }),
    supplementalSources
  );
  return {
    id: input.id,
    intent,
    status,
    modelPolicy: normalizeModelPolicy(input.modelPolicy),
    answer,
    confidence: confidenceForIntent(intent, citations, calculations),
    riskLevel,
    reviewRequired,
    advisoryOnly: true,
    citations,
    calculations,
    context,
    supplementalSources,
    proposedActions: buildProposedActions({ intent, context, sourceReady }),
    guardrails: buildGuardrails(intent),
    createdAt: now
  };
}

function normalizeModelPolicy(value = {}) {
  return {
    provider: String(value.provider || "openrouter"),
    model: String(value.model || "auto"),
    language: String(value.language || "hy-AM"),
    executionMode: String(value.executionMode || "offline-deterministic"),
    egress: String(value.egress || "blocked-by-default")
  };
}

function confidenceForIntent(intent, citations, calculations) {
  const base = intent === "payroll" ? 88 : intent === "month-close" ? 84 : 82;
  return Math.min(94, base + Math.min(citations.length, 2) * 3 + Math.min(calculations.length, 2) * 2);
}

function buildAnswer({ intent, citations, calculations, context, sourceReady }) {
  const citationNames = citations.map(source => source.title).filter(Boolean).join("; ") || "configured Armenian legal source registry";
  if (intent === "vat") {
    const vat = calculations.find(calc => calc.kind === "vat-report");
    const payable = vat && vat.outputs ? vat.outputs.netVatPayable : null;
    return [
      "Ներքին ԱԱՀ խորհրդատվության նախագիծ. օգտագործեք նշված հայկական հարկային աղբյուրը, ստուգեք հաճախորդը եւ հաշվետու ժամանակաշրջանը, եւ պատասխանը պահեք հաշվապահի վերանայման տակ:",
      payable !== null ? `Ընթացիկ ԱԱՀ նախադիտումը ցույց է տալիս ${payable} AMD զուտ վճարվելիք ԱԱՀ ${context.periodKey || "ընտրված ժամանակաշրջանի"} համար:` : "Այս պատասխանը ԱԱՀ գումար չի գրանցում:",
      sourceReady ? "ԱԱՀ աղբյուրը մասնագիտական վերանայված է, ու հաջորդ քայլը կարող է լինել SRC արտահանման փաթեթի պատրաստումը հաշվապահի վերանայման համար:" : "ԱԱՀ աղբյուրը դեռ մասնագիտական վերանայված չէ, ու SRC արտահանման պատրաստումը մնում է անջատված մինչեւ հաշվապահի վերանայում:",
      `Աղբյուրներ: ${citationNames}:`
    ].join(" ");
  }
  if (intent === "payroll") {
    const payroll = calculations.find(calc => calc.kind === "payroll-preview");
    const net = payroll && payroll.outputs ? payroll.outputs.net : null;
    return [
      "Ներքին աշխատավարձի նախադիտում. հաշվեք հայկական պահումները ընտրված օրվա համար գործող աշխատավարձային կարգավորումներով:",
      net !== null ? `Նախադիտված զուտ աշխատավարձը ${net} AMD է:` : "Այս պատասխանը աշխատավարձի գործարկում չի գրանցում:",
      "Աշխատավարձի գրանցումը դեռ պահանջում է ֆինանսական վերանայում եւ բաց հաշվետու ժամանակաշրջան:"
    ].join(" ");
  }
  if (intent === "personal-data") {
    const deleteMode = context.requestType === "delete";
    return [
      "Ներքին անձնական տվյալների ուղեցույց. օգտագործեք նշված հայկական անձնական տվյալների աղբյուրը եւ վերջնական քայլը անցկացրեք սեփականատիրոջ կամ իրավաբանի վերանայմամբ:",
      deleteMode ? "Ջնջման հարցումների համար նախ պատրաստեք պահպանման գնահատում. հաշվապահական, պայմանագրային կամ օրենքով պահվող գրառումները ինքնաբերաբար մի ջնջեք:" : "Արտահանման հարցումների համար իրավական աղբյուրի վերանայումից հետո պատրաստեք աուդիտավորվող արտահանման հարցում եւ փաթեթ:",
      sourceReady ? "Անձնական տվյալների աղբյուրը մասնագիտական վերանայված է աշխատանքային հոսք պատրաստելու համար:" : "Անձնական տվյալների աղբյուրը դեռ մասնագիտական վերանայված չէ, ու հարցման պատրաստումը մնում է անջատված մինչեւ իրավաբանի վերանայում:",
      `Աղբյուրներ: ${citationNames}:`
    ].join(" ");
  }
  if (intent === "esign") {
    const doc = context.document || {};
    return [
      "Ներքին էլեկտրոնային ստորագրության ուղեցույց. օգտագործեք նշված հայկական էլեկտրոնային փաստաթղթի կամ ստորագրության աղբյուրը եւ արտաքին օգտագործումից առաջ ստուգեք տեղական համաձայնության շղթան:",
      doc.id ? `Փաստաթուղթ ${doc.id}-ը այժմ ${doc.status || "անհայտ"} վիճակում է եւ ունի ${(doc.signers || []).length} ստորագրող:` : "Փաստաթուղթ ընտրված չէ:",
      "Այս պատասխանը չի ստորագրում, չի կնքում, չի չեղարկում եւ չի ուղարկում փաստաթուղթ:",
      `Աղբյուրներ: ${citationNames}:`
    ].join(" ");
  }
  return [
    "Ներքին ամսվա փակման ուղեցույց. փակելուց առաջ վերանայեք բաց ժամանակաշրջանը, փորձնական հաշվեկշիռը, ԱԱՀ նախադիտումը եւ ժամանակաշրջանի արգելափակումները:",
    "Այս պատասխանը չի փակում ժամանակաշրջանը եւ հաշվապահական գրառումներ չի տեղադրում:"
  ].join(" ");
}

function buildProposedActions({ intent, context, sourceReady }) {
  if (intent === "vat") {
    return [{
      key: "finance.src.prepare",
      label: "Պատրաստել SRC արտահանման փաթեթը ԱԱՀ աղբյուրի վերանայումից հետո",
      method: "POST",
      path: "/api/finance/src-exports",
      payload: { periodKey: context.periodKey || "", note: "Պատրաստված է Copilot-ի ԱԱՀ ուղեցույցից" },
      requiresApproval: true,
      mutates: true,
      disabledReason: sourceReady ? "" : "ԱԱՀ իրավական աղբյուրը դեռ մասնագիտական վերանայված չէ"
    }];
  }
  if (intent === "payroll") {
    return [{
      key: "payroll.run.prepare",
      label: "Գործարկել աշխատավարձը ֆինանսական վերանայումից հետո",
      method: "POST",
      path: "/api/payroll/run",
      payload: { employeeId: context.employee?.id || "", gross: context.gross || 0, runDate: context.asOf || "" },
      requiresApproval: true,
      mutates: true,
      disabledReason: ""
    }];
  }
  if (intent === "personal-data") {
    return [{
      key: "privacy.request.prepare",
      label: context.requestType === "delete" ? "Պատրաստել ջնջման պահպանման գնահատման հարցում" : "Պատրաստել տվյալների արտահանման հարցում",
      method: "POST",
      path: "/api/privacy/requests",
      payload: {
        customerId: context.customer?.id || "",
        requestType: context.requestType || "export",
        requesterEmail: context.customer?.email || "",
        channel: "Copilot",
        note: "Պատրաստված է Copilot-ի անձնական տվյալների ուղեցույցից"
      },
      requiresApproval: true,
      mutates: true,
      disabledReason: sourceReady ? "" : "Անձնական տվյալների իրավական աղբյուրը դեռ մասնագիտական վերանայված չէ"
    }];
  }
  if (intent === "esign") {
    const docId = context.document?.id || "";
    return [{
      key: "docs.export.open",
      label: "Բացել տպվող փաստաթղթի ապացույցի վկայագիրը",
      method: "GET",
      path: docId ? `/api/docs/documents/${encodeURIComponent(docId)}/export` : "",
      payload: {},
      requiresApproval: false,
      mutates: false,
      disabledReason: docId ? "" : "Նախ ընտրեք փաստաթուղթ"
    }];
  }
  return [{
    key: "finance.period.close.prepare",
    label: "Վերանայել ժամանակաշրջանի փակումը",
    method: "POST",
    path: context.periodKey ? `/api/finance/periods/${encodeURIComponent(context.periodKey)}/close` : "",
    payload: { reason: "Պատրաստված է Copilot-ի ամսվա փակման ուղեցույցից" },
    requiresApproval: true,
    mutates: true,
    disabledReason: "Փակել միայն հաշվապահի վերանայումից հետո"
  }];
}

function buildGuardrails(intent) {
  const common = [
    "Copilot-ի պատասխանները խորհրդատվական նախագծեր են եւ գործարար փոփոխություններ չեն կատարում:",
    "Արտաքին իրավական, հարկային, հաշվապահական կամ հաճախորդին ուղղված օգտագործումից առաջ մարդու վերանայումը պարտադիր է:"
  ];
  if (intent === "vat") return [...common, "Այս պատասխանը SRC ներկայացում չի կատարում:"];
  if (intent === "personal-data") return [...common, "Ջնջումը ինքնաբերաբար չի կատարվում:"];
  if (intent === "esign") return [...common, "Փաստաթուղթ չի ստորագրվում, չի կնքվում, չի ուղարկվում եւ չի չեղարկվում:"];
  if (intent === "payroll") return [...common, "Այս պատասխանը աշխատավարձի գործարկում չի գրանցում:"];
  return [...common, "Այս պատասխանը ֆինանսական ժամանակաշրջան չի փակում:"];
}

module.exports = {
  INTENTS,
  normalizeIntent,
  requiredAppForIntent,
  buildCopilotPacket,
  normalizeSupplementalSources,
  MAX_SUPPLEMENTAL_SOURCES
};
