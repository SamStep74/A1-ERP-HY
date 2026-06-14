"use strict";
// productAndOrderLabels — Wave 6 trilingual (hy/ru/en) UI label dictionary.
//
// Scope: catalog/orders/excise/fiscal-vocabulary surface. Lives OUTSIDE the vendored
// a1-localization-am kernel (do not edit there) so the project can iterate on UI
// labels without re-vendoring. The kernel owns pure fiscal primitives (HVHH, AMD,
// regions, phone, e-invoice, VAT return); this module owns the PRESENTATION layer
// (column headers, status pills, form labels, receipt categories).
//
// Each key is a { name_hy, name_ru, name_en } triple; getLocalizedLabel() resolves
// a key + locale ('hy' | 'ru' | 'en', default 'en') to the right string, with
// graceful fallback:
//   - unknown locale  → English
//   - unknown key     → returns the key itself (lets the UI surface a "TODO" style
//                       placeholder without crashing)
//
// Trilingual: Armenian (hy) is the primary operational language; Russian (ru) serves
// the post-Soviet business community; English (en) is the engineering baseline.

const _RAW_LABELS = {
  "product": [
    "Ապրանդ",
    "Товар",
    "Product"
  ],
  "products": [
    "Ապրանդներ",
    "Товары",
    "Products"
  ],
  "category": [
    "Կատեգորիա",
    "Категория",
    "Category"
  ],
  "categories": [
    "Կատեգորիաներ",
    "Категории",
    "Categories"
  ],
  "variant": [
    "Տարբերակ",
    "Вариант",
    "Variant"
  ],
  "variants": [
    "Տարբերակներ",
    "Варианты",
    "Variants"
  ],
  "unit_of_measure": [
    "Չաճման միավոր",
    "Единица измерения",
    "Unit of measure"
  ],
  "units_of_measure": [
    "Չաճման միավորներ",
    "Единицы измерения",
    "Units of measure"
  ],
  "barcode": [
    "Շտրիխ-կոդ",
    "Штрих-код",
    "Barcode"
  ],
  "sku": [
    "SKU",
    "SKU",
    "SKU"
  ],
  "vat_class": [
    "ԱԱՀ-ի դաս",
    "Класс НДС",
    "VAT class"
  ],
  "vat_standard": [
    "ԱԱՀ 20%",
    "НДС 20%",
    "VAT standard (20%)"
  ],
  "vat_reduced": [
    "ԱԱՀ 0%",
    "НДС 0%",
    "VAT reduced (0%)"
  ],
  "vat_exempt": [
    "ԱԱՀ-ից ազատված",
    "Освобождено от НДС",
    "VAT exempt"
  ],
  "vat_reverse_charge": [
    "Հակադարա հարկում",
    "Обратное начисление",
    "Reverse charge"
  ],
  "excise_marker": [
    "Ակցիզային նշիչ",
    "Акцизная марка",
    "Excise marker"
  ],
  "excise_alcohol": [
    "Ալկոհոլի ակցիզ",
    "Акциз на алкоголь",
    "Alcohol excise"
  ],
  "excise_tobacco": [
    "Ծխախոտի ակցիզ",
    "Акциз на табак",
    "Tobacco excise"
  ],
  "excise_fuel": [
    "Վարելիցի ակցիզ",
    "Акциз на топливо",
    "Fuel excise"
  ],
  "excise_jewelry": [
    "Զարդերի ակցիզ",
    "Акциз на ювелирные изделия",
    "Jewelry excise"
  ],
  "fiscal_receipt_category": [
    "Հարկային կտրոնի կատեգորիա",
    "Категория фискального чека",
    "Fiscal receipt category"
  ],
  "sales_order": [
    "Վապարման պատվեր",
    "Заказ на продажу",
    "Sales order"
  ],
  "sales_orders": [
    "Վապարման պատվերներ",
    "Заказы на продажу",
    "Sales orders"
  ],
  "order_number": [
    "Պատվերի համար",
    "Номер заказа",
    "Order number"
  ],
  "fulfillment_status": [
    "Կատարման կարգավիճակ",
    "Статус выполнения",
    "Fulfillment status"
  ],
  "fulfillment_draft": [
    "Սեվագիր",
    "Черновик",
    "Draft"
  ],
  "fulfillment_reserved": [
    "Պահեստավորված",
    "Зарезервировано",
    "Reserved"
  ],
  "fulfillment_picking": [
    "Հավաքում",
    "Подбор",
    "Picking"
  ],
  "fulfillment_packed": [
    "Փաչետավորված",
    "Упаковано",
    "Packed"
  ],
  "fulfillment_shipped": [
    "Ուղարկված",
    "Отгружено",
    "Shipped"
  ],
  "fulfillment_delivered": [
    "Առամձված",
    "Доставлено",
    "Delivered"
  ],
  "fulfillment_cancelled": [
    "Չեղարկված",
    "Отменено",
    "Cancelled"
  ],
  "billing_status": [
    "Հաշվարկման կարգավիճակ",
    "Статус выставления счётов",
    "Billing status"
  ],
  "billing_unbilled": [
    "Չհաշիվարկված",
    "Без счёта",
    "Unbilled"
  ],
  "billing_partial": [
    "Մասնակի հաշիվարկում",
    "Частичный счёт",
    "Partial billing"
  ],
  "billing_invoiced": [
    "Հաշիվ դուրս գրված",
    "Счёт выставлен",
    "Invoiced"
  ],
  "billing_paid": [
    "Վգուրված",
    "Оплачено",
    "Paid"
  ],
  "billing_written_off": [
    "Հաշիվից հանված",
    "Списано",
    "Written off"
  ],
  "region_of_origin": [
    "Ծագման մարզ",
    "Регион происхождения",
    "Region of origin"
  ]
};

const SUPPORTED_LOCALES = Object.freeze(["hy", "ru", "en"]);

const productAndOrderLabels = Object.freeze(Object.fromEntries(
  Object.entries(_RAW_LABELS).map(([k, v]) => [k, Object.freeze({
    name_hy: v[0],
    name_ru: v[1],
    name_en: v[2],
  })])
));

/**
 * Resolve a label key in the requested locale.
 * @param {string} key   The label key (e.g. "product", "fulfillment_reserved").
 * @param {string} locale BCP-47-ish short code: "hy" | "ru" | "en". Unknown →
 *                     falls back to "en".
 * @returns {string} The localized string, or the key itself if unknown.
 */
function getLocalizedLabel(key, locale) {
  const entry = productAndOrderLabels[key];
  if (!entry) return key;
  const lang = SUPPORTED_LOCALES.includes(locale) ? locale : "en";
  return entry["name_" + lang];
}

module.exports = {
  productAndOrderLabels,
  getLocalizedLabel,
  SUPPORTED_LOCALES,
};
