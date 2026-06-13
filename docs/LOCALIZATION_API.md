# A1 — RA Localization & Finance API

The Armenian fiscal-localization moat, exposed over HTTP. These routes are mounted by
`registerLocalizationRoutes(app)` in `buildApp` (see `server/localizationRoutes.js`) and
back the pure engines in `server/`. **All routes require an authenticated session**
(`app.auth`) — send the session cookie. Amounts/labels follow the **active locale**
(see [Locale switch](#locale-switch-a1_locale) below); the default profile is whole **dram (AMD)**.

This doc is the contract for building the UI (chart browser, VAT/payroll calculators,
e-invoice button, inline ՀՎՀՀ/phone validators) against these routes.

## Locale switch (`A1_LOCALE`)

These routes are **locale-aware**. A deployment selects its fiscal profile with the
`A1_LOCALE` environment variable, resolved by `server/locale.js`:

| `A1_LOCALE` | Profile | Package | Currency | Tax id | Phone |
|---|---|---|---|---|---|
| _unset_ / `am` (default) | Republic of Armenia (RA) | `a1-localization-am` | AMD `֏` | ՀՎՀՀ | +374 |
| `ru` | Russian Federation (RF) | `a1-localization-ru` | RUB `₽` | ИНН | +7 |

`server/locale.js` normalizes the two differently-shaped packages to ONE stable facade
(`taxId`, `money`, `phone`, `regions`, `chartOfAccounts`, `payroll`, `vat`, `einvoice`,
plus `meta` and a `raw` escape hatch). `require("./locale").active()` returns the profile
for the current `A1_LOCALE`; selecting `am` reproduces the pre-switch behavior exactly.

**`GET /api/localization/config`** reports the active profile so the UI can render the
right labels/format:
```jsonc
{ "locale": "ru", "locales": ["am","ru"], "country": "RU", "language": "ru",
  "currency": { "code": "RUB", "symbol": "₽", "subunit": 2 },
  "taxId": { "label": "ИНН" }, "phone": { "countryCode": "7", "nsnLength": 10 },
  "capabilities": { "vatReturnForm": false, "payroll": true, "chartOfAccounts": 73, "regions": 83 } }
```

Locale-specific behavior of the existing routes:
- `chart-of-accounts` — RA: 623-account chart (9 classes); RF: 73-account План счетов 94н (8 sections + off-balance).
- `hvhh` — validates the active locale's business tax id (RA ՀՎՀՀ / RF ИНН).
- `regions` — RA marzes (×11) / RF federal subjects (×83, ISO 3166-2:RU).
- `phone` — RA +374 (8-digit NSN) / RF +7 (10-digit NSN).
- `payroll/compute` — RA `computePayroll(gross)` / RF `computeMonthlyPayroll`; response shapes differ per regime.
- `einvoice/build` — RA SRC e-invoice / RF УПД (формат 5.03).
- `vat-return/compute` — RA returns the SRC multi-line form (decree N 298-Ն); RF returns the
  **РФ НДС settlement** (`kind: "ru-nds-return"`, RUB, 2026 rates 22/10/0; output/input VAT +
  net payable with a per-rate breakdown — `server/ruVatReturn.js`). Input-driven
  (sales/purchases body), not the official ФНС declaration form.

> **Deep accounting (slice status).** ✅ Chart-of-accounts DB **seeding** is locale-aware —
> under `A1_LOCALE=ru` a fresh org seeds the 73-account 94н chart into `ledger_accounts`
> (`server/chartProjection.js` projects {code,ru,section,nature}→{code,name,type}; resolved
> via `server/locale.js`). The input-driven RF НДС settlement is live. The ledger-derived
> VAT report (`GET /api/finance/vat-return`, `ledger.vatReport`) degrades honestly under RU
> (RUB, no AM branding) and persistence (`POST /api/finance/vat-returns`) returns 501 for RU.
> ✅ **Posting map** (`server/postingCodes.js`) — the business-event → account-code map is
> locale-keyed, so RU invoices/payments/expenses/bills/payroll post to real RU accounts
> (AR=62, revenue=90, output VAT=68, cash=51, AP=60, input VAT=19, expense=26, payroll
> wages=70 / НДФЛ=68). A fresh RU org now produces a coherent ledger + trial balance.
> ✅ **Opening balances** (`server/openingBalanceRules.js`) — locale-aware openable accounts +
> sides, offsetting to the opening-balance equity account (RU **84** / AM 331). A fresh RU org
> can enter its opening trial balance.
> ✅ **Statement cash detection** — `accounting.financialStatements` takes an injected cash
> matcher (`postingCodes.cashMatcherFor`): RU cash = 50/51/52/55/57, AM = 25x.
> ⏳ **Remaining:** RUB **kopeck precision** (whole-ruble v1 today, would need a DB migration);
> ledger-derived RU VAT reporting needs 68 **subaccounts** (68.01/68.02) to separate НДС from
> НДФЛ — until then `ledger.vatReport` stays indicative for RU and the clean RF НДС settlement
> is `POST /api/finance/vat-return/compute`. AM is byte-identical throughout.
>
> ✅ **Employer payroll contributions** — `postPayrollRun` posts the RU страховые взносы leg
> (DR expense / CR **69**) when `employerContributions` is supplied; the RA model has no such
> account, so AM payroll is unchanged.

## Reference / lookups (GET)

| Route | Query | Returns |
|---|---|---|
| `GET /api/localization/chart-of-accounts` | — | `{ classes: [{digit,hy,en,type,normalBalance}] (×9), accounts: [{code,hy,en,class,type}] (×623) }` |
| `GET /api/localization/chart-of-accounts` | `?code=251` | `{ code, hy, en, class, type, normalBalance }` or `{ error }` |
| `GET /api/localization/hvhh` | `?value=00123456` | `{ ok, normalized, error }` |
| `GET /api/localization/regions` | — | `{ regions: [{code,hy,en,center,cities}] (×11, ISO 3166-2:AM) }` |
| `GET /api/localization/phone` | `?value=091234567` | `{ valid, e164, formatted }` |

## Compute (POST, JSON body)

### `POST /api/finance/vat-return/compute`
```jsonc
// body
{ "sales":     [{ "netAmount": 1000000, "vatRate": 20, "category": "exempt"? }],
  "purchases": [{ "netAmount": 400000, "vatRate": 20, "source": "import"|"domestic", "recoverable": true }] }
// →
{ "summary": { "outputVat", "inputVat", "taxableSales", "taxablePurchases", "net", "payable", "creditCarried" },
  "form": {            // official SRC form line values (decree N 298-Ն), { base, vat }
    "7": {…},  "9": {…},  "12": {base},  "13": {base},  "16": {…total credit},
    "17": {…imports}, "18": {…domestic}, "21": {vat: total debit},
    "23": { "payable", "recoverable" } },
  "formSource": {
    "titleHy": "Ավելացված արժեքի հարկի և ակցիզային հարկի միասնական հաշվարկ",
    "orderNumber": "N 298-Ն",
    "sourceUrl": "https://www.arlis.am/hy/acts/136996",
    "effectiveDate": "2018-01-01" },
  "formLineDefinitions": {
    "7": { "section": "output", "labelHy": "ԱԱՀ-ի 20% դրույքաչափով հարկվող գործարքներ", "fields": ["base", "vat"] },
    "23": { "section": "period-net", "labelHy": "Հաշվետու ժամանակաշրջանի համար հաշվարկված ԱԱՀ", "fields": ["payable", "recoverable"] } } }
```

### `POST /api/finance/payroll/compute`
```jsonc
{ "gross": 800000 }
// → { "gross", "incomeTax", "pension", "stampDuty", "healthInsurance", "totalWithholdings", "net" }
// income tax 20% · pension tiered (5%/10%−25k/87,500 cap) · stamp duty 1,000/15,000.
// health insurance: 0 below 200,001 AMD; 4,800 AMD through 500,000; 10,800 AMD from 500,001.
```

### `POST /api/finance/einvoice/build` → e-invoice XML (`application/xml`)
The response body is XML text, not JSON. SPA callers should read it with a text-response helper.

```jsonc
{ "number", "issueDate", "creationDate"?, "transactionType",  // Գործարքի տեսակ (mandatory 2025-03)
  "supplier": { "name", "hvhh", "vatId"?, "address"? },
  "buyer":    { "name", "hvhh"|"passport", "address"? },
  "lines": [{ "description", "quantity", "unitPrice"?, "netAmount", "vatRate",
              "exciseAmount"?, "envFee"? }] }
```

## Offline CLI (no server)
```
node scripts/ra-localization.js hvhh 00123456
node scripts/ra-localization.js account 226
node scripts/ra-localization.js payroll 800000
node scripts/ra-localization.js vat-return period.json   # { sales:[…], purchases:[…] }
node scripts/ra-localization.js einvoice invoice.json
```

## Engines — canonical source: `a1-localization-am`

The engines now live in the standalone repo **[a1-localization-am](https://github.com/SamStep74/A1-Localization-AM)** —
the single source of truth, shared with HayHashvapah and future A1 products
(sibling to `a1-ai`). Suite **vendors** a verbatim copy under
`server/vendor/a1-localization-am/` (pinned commit in its `VENDOR.md`); the
`server/<engine>.js` files are thin re-export shims, so existing
`require("./localization")` etc. keep working unchanged:

| `server/<engine>.js` shim | package namespace |
|---|---|
| `localization.js` (ՀՎՀՀ + AMD money) | `.localization` |
| `armeniaRegions.js` | `.regions` |
| `armeniaPhone.js` | `.phone` |
| `armeniaChartOfAccounts.js` (623-account official chart) | `.chartOfAccounts` |
| `vatReturn.js` | `.vatReturn` |
| `einvoice.js` | `.einvoice` |
| `armeniaPayroll.js` | `.payroll` |

Each engine is pure, offline, and unit-tested **in the package**. The chart's
`armeniaChartOfAccounts.data.js` is now an internal detail of the package's chart
engine (no longer a standalone `server/` file).

> ⚠️ Fixes go **upstream first** (in `a1-localization-am`), then re-vendor into Suite.
> Do not edit `server/vendor/**` or hand-patch the shims. See
> `server/vendor/a1-localization-am/VENDOR.md` for the re-vendor procedure.

## Sources
> Canonical, maintained citation list: **[a1-localization-am README → Official sources](https://github.com/SamStep74/A1-Localization-AM#official-sources)**. Reproduced here for convenience:

Chart of accounts: RA MoF order [arlis.am/acts/75961](https://www.arlis.am/hy/acts/75961) + accountant.am PDF.
VAT form: SRC decree N 298-Ն [arlis.am/acts/136996](https://www.arlis.am/hy/acts/136996).
E-invoice fields: [SRC e-Invoicing User Guide](https://e-invoice.taxservice.am/help/eInvoicingUserGuide.pdf).
Payroll: RA universal health-insurance law ՀՕ-459-Ն [arlis.am/acts/218650](https://www.arlis.am/hy/acts/218650) and military stamp-duty law as amended by ՀՕ-477-Ն [arlis.am/acts/218669](https://www.arlis.am/hy/acts/218669/print/act), cross-checked against SRC public guidance.
