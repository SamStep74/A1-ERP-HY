"use strict";

// Российский План счетов бухгалтерского учёта финансово-хозяйственной деятельности
// организаций — Приказ Минфина РФ № 94н от 31.10.2000.
//
// Unlike the RA chart (leading digit encodes the class), in 94н the РАЗДЕЛ (section)
// is determined by the account NUMBER RANGE. The нормальное сальдо (normal balance)
// follows each account's ХАРАКТЕР (character):
//   активный (active)          → debit
//   пассивный (passive)        → credit
//   активно-пассивный (a/p)    → null (both sides)
//
// Pure data + lookups, no I/O, no deps.

// Разделы Плана счетов — диапазоны синтетических счетов + забалансовые счета.
const SECTIONS = Object.freeze([
  Object.freeze({ id: "I", ru: "Внеоборотные активы", en: "Non-current assets", range: [1, 9] }),
  Object.freeze({ id: "II", ru: "Производственные запасы", en: "Inventories", range: [10, 19] }),
  Object.freeze({ id: "III", ru: "Затраты на производство", en: "Production costs", range: [20, 39] }),
  Object.freeze({ id: "IV", ru: "Готовая продукция и товары", en: "Finished goods and merchandise", range: [40, 49] }),
  Object.freeze({ id: "V", ru: "Денежные средства", en: "Cash", range: [50, 59] }),
  Object.freeze({ id: "VI", ru: "Расчёты", en: "Settlements", range: [60, 79] }),
  Object.freeze({ id: "VII", ru: "Капитал", en: "Capital", range: [80, 89] }),
  Object.freeze({ id: "VIII", ru: "Финансовые результаты", en: "Financial results", range: [90, 99] }),
  // Забалансовые счета — мемориальные (односторонняя запись), коды 001–011.
  Object.freeze({ id: "offBalance", ru: "Забалансовые счета", en: "Off-balance-sheet", range: [1, 11] }),
]);

// Счёт: { code, ru (официальное наименование), section, nature }.
function account(code, ru, section, nature) {
  return Object.freeze({ code, ru, section, nature });
}

const STANDARD_ACCOUNTS = Object.freeze([
  // Раздел I — Внеоборотные активы (01–09)
  account("01", "Основные средства", "I", "active"),
  account("02", "Амортизация основных средств", "I", "passive"),
  account("03", "Доходные вложения в материальные ценности", "I", "active"),
  account("04", "Нематериальные активы", "I", "active"),
  account("05", "Амортизация нематериальных активов", "I", "passive"),
  account("07", "Оборудование к установке", "I", "active"),
  account("08", "Вложения во внеоборотные активы", "I", "active"),
  account("09", "Отложенные налоговые активы", "I", "active"),

  // Раздел II — Производственные запасы (10–19)
  account("10", "Материалы", "II", "active"),
  account("11", "Животные на выращивании и откорме", "II", "active"),
  account("14", "Резервы под снижение стоимости материальных ценностей", "II", "passive"),
  account("15", "Заготовление и приобретение материальных ценностей", "II", "active"),
  account("16", "Отклонение в стоимости материальных ценностей", "II", "active-passive"),
  account("19", "Налог на добавленную стоимость по приобретённым ценностям", "II", "active"),

  // Раздел III — Затраты на производство (20–39)
  account("20", "Основное производство", "III", "active"),
  account("21", "Полуфабрикаты собственного производства", "III", "active"),
  account("23", "Вспомогательные производства", "III", "active"),
  account("25", "Общепроизводственные расходы", "III", "active"),
  account("26", "Общехозяйственные расходы", "III", "active"),
  account("28", "Брак в производстве", "III", "active"),
  account("29", "Обслуживающие производства и хозяйства", "III", "active"),

  // Раздел IV — Готовая продукция и товары (40–49)
  account("40", "Выпуск продукции (работ, услуг)", "IV", "active-passive"),
  account("41", "Товары", "IV", "active"),
  account("42", "Торговая наценка", "IV", "passive"),
  account("43", "Готовая продукция", "IV", "active"),
  account("44", "Расходы на продажу", "IV", "active"),
  account("45", "Товары отгруженные", "IV", "active"),
  account("46", "Выполненные этапы по незавершённым работам", "IV", "active"),

  // Раздел V — Денежные средства (50–59)
  account("50", "Касса", "V", "active"),
  account("51", "Расчётные счета", "V", "active"),
  account("52", "Валютные счета", "V", "active"),
  account("55", "Специальные счета в банках", "V", "active"),
  account("57", "Переводы в пути", "V", "active"),
  account("58", "Финансовые вложения", "V", "active"),
  account("59", "Резервы под обесценение финансовых вложений", "V", "passive"),

  // Раздел VI — Расчёты (60–79)
  account("60", "Расчёты с поставщиками и подрядчиками", "VI", "active-passive"),
  account("62", "Расчёты с покупателями и заказчиками", "VI", "active-passive"),
  account("63", "Резервы по сомнительным долгам", "VI", "passive"),
  account("66", "Расчёты по краткосрочным кредитам и займам", "VI", "passive"),
  account("67", "Расчёты по долгосрочным кредитам и займам", "VI", "passive"),
  account("68", "Расчёты по налогам и сборам", "VI", "active-passive"),
  account("69", "Расчёты по социальному страхованию и обеспечению", "VI", "active-passive"),
  account("70", "Расчёты с персоналом по оплате труда", "VI", "passive"),
  account("71", "Расчёты с подотчётными лицами", "VI", "active-passive"),
  account("73", "Расчёты с персоналом по прочим операциям", "VI", "active"),
  account("75", "Расчёты с учредителями", "VI", "active-passive"),
  account("76", "Расчёты с разными дебиторами и кредиторами", "VI", "active-passive"),
  account("77", "Отложенные налоговые обязательства", "VI", "passive"),
  account("79", "Внутрихозяйственные расчёты", "VI", "active-passive"),

  // Раздел VII — Капитал (80–89)
  account("80", "Уставный капитал", "VII", "passive"),
  account("81", "Собственные акции (доли)", "VII", "active"),
  account("82", "Резервный капитал", "VII", "passive"),
  account("83", "Добавочный капитал", "VII", "passive"),
  account("84", "Нераспределённая прибыль (непокрытый убыток)", "VII", "active-passive"),
  account("86", "Целевое финансирование", "VII", "passive"),

  // Раздел VIII — Финансовые результаты (90–99)
  account("90", "Продажи", "VIII", "active-passive"),
  account("91", "Прочие доходы и расходы", "VIII", "active-passive"),
  account("94", "Недостачи и потери от порчи ценностей", "VIII", "active"),
  account("96", "Резервы предстоящих расходов", "VIII", "passive"),
  account("97", "Расходы будущих периодов", "VIII", "active"),
  account("98", "Доходы будущих периодов", "VIII", "passive"),
  account("99", "Прибыли и убытки", "VIII", "active-passive"),

  // Забалансовые счета (001–011) — мемориальные, односторонняя запись, характер active.
  account("001", "Арендованные основные средства", "offBalance", "active"),
  account("002", "Товарно-материальные ценности, принятые на ответственное хранение", "offBalance", "active"),
  account("003", "Материалы, принятые в переработку", "offBalance", "active"),
  account("004", "Товары, принятые на комиссию", "offBalance", "active"),
  account("005", "Оборудование, принятое для монтажа", "offBalance", "active"),
  account("006", "Бланки строгой отчётности", "offBalance", "active"),
  account("007", "Списанная в убыток задолженность неплатёжеспособных дебиторов", "offBalance", "active"),
  account("008", "Обеспечения обязательств и платежей полученные", "offBalance", "active"),
  account("009", "Обеспечения обязательств и платежей выданные", "offBalance", "active"),
  account("010", "Износ основных средств", "offBalance", "active"),
  account("011", "Основные средства, сданные в аренду", "offBalance", "active"),
]);

const NATURE_TO_BALANCE = Object.freeze({
  active: "debit",
  passive: "credit",
  "active-passive": null,
});

const _byCode = new Map(STANDARD_ACCOUNTS.map((a) => [a.code, a]));

// Normalize any input to a trimmed string ("" for null/undefined/objects).
function asCode(code) {
  if (code == null) return "";
  if (typeof code === "object") return "";
  return String(code).trim();
}

// Забалансовые счета пишутся трёхзначными ("001"); балансовые — без ведущего нуля ("01").
// Numeric value used for range matching (NaN for non-numeric input).
function numericCode(s) {
  if (!/^\d+$/.test(s)) return NaN;
  return Number(s);
}

function accountByCode(code) {
  const s = asCode(code);
  if (s === "") return null;
  return _byCode.get(s) || null;
}

function accountsBySection(sectionId) {
  const id = asCode(sectionId);
  if (id === "") return [];
  return STANDARD_ACCOUNTS.filter((a) => a.section === id);
}

function accountsByNature(nature) {
  const n = asCode(nature);
  if (n === "") return [];
  return STANDARD_ACCOUNTS.filter((a) => a.nature === n);
}

// Section by NUMBER RANGE. Three-digit codes (001–011) are забалансовые счета;
// two-digit codes (01–99) fall into one of the eight balance-sheet sections.
function sectionOf(code) {
  const s = asCode(code);
  const n = numericCode(s);
  if (!Number.isFinite(n)) return null;
  // Off-balance accounts are written with a leading zero and three digits.
  if (s.length === 3) {
    const off = SECTIONS.find((sec) => sec.id === "offBalance");
    return n >= off.range[0] && n <= off.range[1] ? off : null;
  }
  for (const sec of SECTIONS) {
    if (sec.id === "offBalance") continue;
    if (n >= sec.range[0] && n <= sec.range[1]) return sec;
  }
  return null;
}

// Нормальное сальдо счёта, derived from its характер.
function normalBalance(code) {
  const a = accountByCode(code);
  if (!a) return null;
  return NATURE_TO_BALANCE[a.nature];
}

function isValidAccountCode(code) {
  return accountByCode(code) !== null;
}

module.exports = {
  SECTIONS,
  STANDARD_ACCOUNTS,
  accountByCode,
  accountsBySection,
  accountsByNature,
  sectionOf,
  normalBalance,
  isValidAccountCode,
};
