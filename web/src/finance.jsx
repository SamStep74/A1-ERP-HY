import React, { useState } from "react";

const amd = value => `${Number(value || 0).toLocaleString("hy-AM")} AMD`;
const numericInput = value => Math.round(Number(value) || 0);
const isoDate = () => new Date().toISOString().slice(0, 10);
const hostLabel = url => {
  try {
    return new URL(String(url || "")).host.replace(/^www\./, "");
  } catch {
    return String(url || "official source");
  }
};

export function FinanceTrialBalancePanel({ data }) {
  if (!data) return null;
  const rows = data.rows || [];
  return (
    <article className="panel finance-trial-balance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">HayHashvapah Finance</span>
          <h2>Trial balance</h2>
        </div>
        <strong className="aging-badge">{data.balanced ? "Balanced" : "Out of balance"}</strong>
      </div>
      <div className="rows">
        {rows.map(row => (
          <div className="row" key={row.code}>
            <span>{row.code} · {row.name}</span>
            <strong>{amd(row.balance)}</strong>
          </div>
        ))}
        {rows.length === 0 && <div className="row"><span>No ledger entries yet</span></div>}
      </div>
      <div className="meta-row">
        <span>Debits {amd(data.totalDebit)}</span>
        <span>Credits {amd(data.totalCredit)}</span>
      </div>
    </article>
  );
}

export function FinanceStatementsPanel({ data }) {
  if (!data) return null;
  const income = data.incomeStatement || {};
  const sheet = data.balanceSheet || {};
  return (
    <article className="panel finance-statements-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">HayHashvapah Finance</span>
          <h2>Financial statements</h2>
        </div>
        <strong className="aging-badge">{sheet.balanced ? "Balanced" : "Check"}</strong>
      </div>
      <div className="aging-summary">
        <div className="metric"><span>income</span><strong>{amd(income.totalIncome)}</strong></div>
        <div className="metric"><span>expense</span><strong>{amd(income.totalExpense)}</strong></div>
        <div className="metric"><span>net profit</span><strong>{amd(income.netProfit)}</strong></div>
      </div>
      <div className="aging-summary">
        <div className="metric"><span>assets</span><strong>{amd(sheet.totalAssets)}</strong></div>
        <div className="metric"><span>liabilities</span><strong>{amd(sheet.totalLiabilities)}</strong></div>
        <div className="metric"><span>equity</span><strong>{amd(sheet.totalEquity)}</strong></div>
      </div>
    </article>
  );
}

export function FinanceVatPanel({ data }) {
  if (!data) return null;
  return (
    <article className="panel finance-vat-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">HayHashvapah Finance</span>
          <h2>VAT report · ԱԱՀ</h2>
        </div>
        <strong className="aging-badge">{data.periodKey}</strong>
      </div>
      <div className="aging-summary">
        <div className="metric"><span>output VAT</span><strong>{amd(data.outputVat)}</strong></div>
        <div className="metric"><span>input VAT</span><strong>{amd(data.inputVat)}</strong></div>
        <div className="metric"><span>net payable</span><strong>{amd(data.netVatPayable)}</strong></div>
      </div>
      {data.note && <p className="action-status">{data.note}</p>}
    </article>
  );
}

export function FinanceTaxRatesPanel({ data }) {
  const rows = (data && data.taxRates) || [];
  if (rows.length === 0) return null;
  const pct = rate => (typeof rate === "number" ? `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 2)}%` : "—");
  // The current VAT rate = the most-recent VAT row effective on/before today.
  const today = new Date().toISOString().slice(0, 10);
  const currentVat = rows.filter(r => r.kind === "vat" && r.effectiveDate <= today).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  return (
    <article className="panel finance-tax-rates-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">HayHashvapah Finance</span>
          <h2>Tax rates · Հարկային դրույքներ</h2>
        </div>
        {currentVat && <strong className="aging-badge">VAT {pct(currentVat.rate)}</strong>}
      </div>
      <div className="rows">
        {rows.map((r, i) => {
          const isCurrent = currentVat && r.kind === currentVat.kind && r.effectiveDate === currentVat.effectiveDate;
          const scheduled = r.effectiveDate > today;
          return (
            <div className="row" key={`${r.kind}:${r.effectiveDate}:${i}`}>
              <span>
                <strong>{r.kind === "vat" ? "ԱԱՀ · VAT" : r.kind}</strong> · {pct(r.rate)} · from {r.effectiveDate}
                {isCurrent ? " · current" : scheduled ? " · scheduled" : ""}
                {r.note ? ` — ${r.note}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function FinanceChartOfAccountsPanel({ data }) {
  if (!data) return null;
  const accounts = data.accounts || [];
  const classes = data.classes || [];
  const source = data.source || {};
  const byClass = accounts.reduce((counts, account) => {
    const key = String(account.code || "").slice(0, 1);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const operatingCodes = ["221", "226", "251", "252", "521", "524", "525", "611", "711", "714"];
  const byCode = new Map(accounts.map(account => [account.code, account]));
  return (
    <article className="panel finance-chart-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">HayHashvapah Finance</span>
          <h2>RA chart of accounts</h2>
        </div>
        <strong className="aging-badge">{source.accountCount || accounts.length} accounts</strong>
      </div>
      <div className="rows">
        {classes.map(item => (
          <div className="row" key={item.digit}>
            <span>{item.digit} · {item.hy}</span>
            <strong>{byClass[String(item.digit)] || 0}</strong>
          </div>
        ))}
      </div>
      <div className="meta-row">
        <span>{source.publisher || "ՀՀ ֆինանսների նախարարություն"}</span>
        <span>{source.sourceUrl || "official source"}</span>
      </div>
      <div className="rows">
        {operatingCodes.map(code => byCode.get(code)).filter(Boolean).map(account => (
          <div className="row" key={account.code}>
            <span>{account.code} · {account.name}</span>
            <strong>{account.type}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

export function FinanceLocalizationToolsPanel({ request, requestText }) {
  const [hvhh, setHvhh] = useState("00123456");
  const [phone, setPhone] = useState("+374 91 123456");
  const [gross, setGross] = useState("600000");
  const [salesNet, setSalesNet] = useState("1000000");
  const [purchaseNet, setPurchaseNet] = useState("300000");
  const [invoiceNumber, setInvoiceNumber] = useState("A1-LOC-001");
  const [invoiceBuyerHvhh, setInvoiceBuyerHvhh] = useState("00987654");
  const [invoiceNet, setInvoiceNet] = useState("250000");
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const isBusy = Boolean(busy);

  async function run(key, task) {
    if (!request || busy) return;
    setBusy(key);
    setError("");
    try {
      const value = await task();
      setResults(prev => ({ ...prev, [key]: value }));
    } catch (err) {
      setError((err && err.message) || "Localization request failed");
    } finally {
      setBusy("");
    }
  }

  const hvhhResult = results.hvhh;
  const phoneResult = results.phone;
  const payroll = results.payroll || {};
  const vat = results.vat || {};
  const vatSummary = vat.summary || {};
  const vatForm = vat.form || {};
  const vatFormSource = vat.formSource || {};
  const vatFormLineDefinitions = vat.formLineDefinitions || {};
  const vatFormSourceUrl = vatFormSource.sourceUrl || "";
  const vatFormSourceLabel = vatFormSourceUrl ? `${vatFormSource.orderNumber || "N 298-Ն"} · ${hostLabel(vatFormSourceUrl)}` : "";
  const eInvoiceXml = results.einvoice || "";
  const eInvoiceTotal = eInvoiceXml.match(/<TotalAmount>([^<]+)<\/TotalAmount>/)?.[1] || "";
  const eInvoicePreview = eInvoiceXml.split("\n").slice(0, 10).join("\n");
  const vatLineValue = line => {
    const item = vatForm[line] || {};
    if (line === "23") return `${amd(item.payable)} / ${amd(item.recoverable)}`;
    if (line === "21") return amd(item.vat);
    return `${amd(item.base)} / ${amd(item.vat)}`;
  };
  const eInvoiceBody = () => ({
    number: invoiceNumber.trim() || "A1-LOC-001",
    issueDate: isoDate(),
    creationDate: isoDate(),
    transactionType: "1",
    supplier: {
      name: "Armosphera Demo Clinic",
      hvhh: "00123456",
      vatId: "00123456",
      address: "Yerevan"
    },
    buyer: {
      name: "Preview buyer",
      hvhh: invoiceBuyerHvhh.trim() || "00987654",
      address: "Yerevan"
    },
    lines: [{
      description: "RA localization services",
      quantity: 1,
      netAmount: numericInput(invoiceNet),
      vatRate: 20
    }]
  });

  return (
    <article className="panel finance-localization-tools-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">HayHashvapah Finance</span>
          <h2>RA localization tools</h2>
        </div>
        <strong className="aging-badge">local</strong>
      </div>

      <div className="inline-form">
        <input value={hvhh} onChange={event => setHvhh(event.target.value)} placeholder="ՀՎՀՀ" />
        <button className="mini-action" type="button" disabled={isBusy} onClick={() => run("hvhh", () => request(`/api/localization/hvhh?value=${encodeURIComponent(hvhh)}`))}>
          {busy === "hvhh" ? "Checking" : "Check ՀՎՀՀ"}
        </button>
        <input value={phone} onChange={event => setPhone(event.target.value)} placeholder="Հեռախոս" />
        <button className="mini-action" type="button" disabled={isBusy} onClick={() => run("phone", () => request(`/api/localization/phone?value=${encodeURIComponent(phone)}`))}>
          {busy === "phone" ? "Checking" : "Normalize phone"}
        </button>
      </div>

      {(hvhhResult || phoneResult) && (
        <div className="rows">
          {hvhhResult && (
            <div className="row">
              <span>ՀՎՀՀ · {hvhhResult.normalized || "—"}</span>
              <strong>{hvhhResult.ok ? "valid" : hvhhResult.error || "invalid"}</strong>
            </div>
          )}
          {phoneResult && (
            <div className="row">
              <span>Phone · {phoneResult.formatted || "—"}</span>
              <strong>{phoneResult.valid ? phoneResult.e164 : "invalid"}</strong>
            </div>
          )}
        </div>
      )}

      <div className="inline-form">
        <input value={gross} onChange={event => setGross(event.target.value)} inputMode="numeric" placeholder="Համախառն աշխատավարձ" />
        <button className="mini-action" type="button" disabled={isBusy} onClick={() => run("payroll", () => request("/api/finance/payroll/compute", { method: "POST", body: { gross: numericInput(gross) } }))}>
          {busy === "payroll" ? "Computing" : "Payroll preview"}
        </button>
        <input value={salesNet} onChange={event => setSalesNet(event.target.value)} inputMode="numeric" placeholder="Վաճառք առանց ԱԱՀ" />
        <input value={purchaseNet} onChange={event => setPurchaseNet(event.target.value)} inputMode="numeric" placeholder="Գնում առանց ԱԱՀ" />
        <button className="mini-action" type="button" disabled={isBusy} onClick={() => run("vat", () => request("/api/finance/vat-return/compute", {
          method: "POST",
          body: {
            sales: numericInput(salesNet) > 0 ? [{ netAmount: numericInput(salesNet), vatRate: 20 }] : [],
            purchases: numericInput(purchaseNet) > 0 ? [{ netAmount: numericInput(purchaseNet), vatRate: 20, source: "domestic" }] : []
          }
        }))}>
          {busy === "vat" ? "Computing" : "VAT form preview"}
        </button>
      </div>

      {(results.payroll || results.vat) && (
        <div className="aging-summary">
          {results.payroll && <div className="metric"><span>income tax</span><strong>{amd(payroll.incomeTax)}</strong></div>}
          {results.payroll && <div className="metric"><span>pension</span><strong>{amd(payroll.pension)}</strong></div>}
          {results.payroll && <div className="metric"><span>stamp duty</span><strong>{amd(payroll.stampDuty)}</strong></div>}
          {results.payroll && <div className="metric"><span>health insurance</span><strong>{amd(payroll.healthInsurance)}</strong></div>}
          {results.payroll && <div className="metric"><span>net salary</span><strong>{amd(payroll.net)}</strong></div>}
          {results.vat && <div className="metric"><span>VAT payable</span><strong>{amd(vatSummary.payable)}</strong></div>}
        </div>
      )}

      {results.vat && (
        <div className="rows">
          {["7", "16", "18", "21", "23"].map(line => (
            <div className="row" key={line}>
              <span>{line} · {vatFormLineDefinitions[line]?.labelHy || "VAT form line"}</span>
              <strong>{vatLineValue(line)}</strong>
            </div>
          ))}
          {vatFormSourceUrl && (
            <div className="row">
              <span>{vatFormSource.titleHy || "ԱԱՀ հաշվարկի պաշտոնական ձև"}</span>
              <strong><a href={vatFormSourceUrl} target="_blank" rel="noreferrer">{vatFormSourceLabel}</a></strong>
            </div>
          )}
        </div>
      )}

      <div className="inline-form">
        <input value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} placeholder="Invoice number" />
        <input value={invoiceBuyerHvhh} onChange={event => setInvoiceBuyerHvhh(event.target.value)} placeholder="Buyer ՀՎՀՀ" />
        <input value={invoiceNet} onChange={event => setInvoiceNet(event.target.value)} inputMode="numeric" placeholder="Line net AMD" />
        <button className="mini-action" type="button" disabled={isBusy || !requestText} onClick={() => run("einvoice", () => requestText("/api/finance/einvoice/build", { method: "POST", body: eInvoiceBody() }))}>
          {busy === "einvoice" ? "Building" : "E-invoice XML"}
        </button>
      </div>

      {eInvoiceXml && (
        <div className="rows">
          <div className="row">
            <span>E-invoice XML · {invoiceNumber || "A1-LOC-001"}</span>
            <strong>{amd(eInvoiceTotal)}</strong>
          </div>
          <pre className="finance-xml-preview">{eInvoicePreview}</pre>
        </div>
      )}

      {error && <p className="action-status">{error}</p>}
    </article>
  );
}

export function FinanceExpenseForm({ onCreate, actionState }) {
  const [description, setDescription] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [vat, setVat] = useState("");
  const busy = actionState === "expense:create";
  function submit() {
    const net = Math.round(Number(subtotal) || 0);
    if (net <= 0) return;
    onCreate({ description, subtotal: net, vat: Math.round(Number(vat) || 0) });
    setDescription("");
    setSubtotal("");
    setVat("");
  }
  return (
    <article className="panel finance-expense-form-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">HayHashvapah Finance</span>
          <h2>Quick expense</h2>
        </div>
      </div>
      <div className="inline-form">
        <input value={description} onChange={event => setDescription(event.target.value)} placeholder="Նկարագրություն" />
        <input value={subtotal} onChange={event => setSubtotal(event.target.value)} inputMode="numeric" placeholder="Զուտ (AMD)" />
        <input value={vat} onChange={event => setVat(event.target.value)} inputMode="numeric" placeholder="ԱԱՀ (AMD)" />
        <button className="mini-action" type="button" disabled={busy} onClick={submit}>{busy ? "Posting" : "Post expense"}</button>
      </div>
    </article>
  );
}

export function LegalSearchPanel({ onSearch }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      setResults(await onSearch(query.trim()));
    } catch {
      setResults({ ready: true, results: [] });
    } finally {
      setBusy(false);
    }
  }
  const rows = (results && results.results) || [];
  return (
    <article className="panel legal-search-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Armenian law · RAG</span>
          <h2>Law search</h2>
        </div>
      </div>
      <div className="inline-form">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") run(); }}
          placeholder="Հարցում (օր. ԱԱՀ դրույքաչափ)"
        />
        <button className="mini-action" type="button" disabled={busy} onClick={run}>{busy ? "Searching" : "Search"}</button>
      </div>
      {results && (
        <div className="rows">
          {rows.map((row, index) => (
            <div className="row" key={index}>
              <span>{row.lawTitle} · {row.article}</span>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="row"><span>{results.ready === false ? "Legal KB not installed" : "No matches"}</span></div>
          )}
        </div>
      )}
    </article>
  );
}

export function FinanceBillForm({ onCreate, actionState }) {
  const [supplier, setSupplier] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [vat, setVat] = useState("");
  const [dueDate, setDueDate] = useState("");
  const busy = actionState === "bill:create";
  function submit() {
    const net = Math.round(Number(subtotal) || 0);
    if (net <= 0) return;
    onCreate({ supplier, subtotal: net, vat: Math.round(Number(vat) || 0), dueDate: dueDate || undefined });
    setSupplier(""); setSubtotal(""); setVat(""); setDueDate("");
  }
  return (
    <article className="panel finance-bill-form-panel">
      <div className="panel-head"><div><span className="section-label">HayHashvapah Finance</span><h2>New supplier bill</h2></div></div>
      <div className="inline-form">
        <input value={supplier} onChange={event => setSupplier(event.target.value)} placeholder="Մատակարար" />
        <input value={subtotal} onChange={event => setSubtotal(event.target.value)} inputMode="numeric" placeholder="Զուտ (AMD)" />
        <input value={vat} onChange={event => setVat(event.target.value)} inputMode="numeric" placeholder="ԱԱՀ (AMD)" />
        <input value={dueDate} onChange={event => setDueDate(event.target.value)} placeholder="Վճարման ժ. (YYYY-MM-DD)" />
        <button className="mini-action" type="button" disabled={busy} onClick={submit}>{busy ? "Posting" : "Post bill"}</button>
      </div>
    </article>
  );
}

export function FinancePayrollForm({ onRun, actionState }) {
  const [employeeName, setEmployeeName] = useState("");
  const [gross, setGross] = useState("");
  const busy = actionState === "payroll:run";
  function submit() {
    const value = Math.round(Number(gross) || 0);
    if (value <= 0) return;
    onRun({ employeeName, gross: value });
    setEmployeeName(""); setGross("");
  }
  return (
    <article className="panel finance-payroll-form-panel">
      <div className="panel-head"><div><span className="section-label">HayHashvapah Finance</span><h2>Run payroll</h2></div></div>
      <div className="inline-form">
        <input value={employeeName} onChange={event => setEmployeeName(event.target.value)} placeholder="Աշխատող" />
        <input value={gross} onChange={event => setGross(event.target.value)} inputMode="numeric" placeholder="Համախառն (AMD)" />
        <button className="mini-action" type="button" disabled={busy} onClick={submit}>{busy ? "Running" : "Run payroll"}</button>
      </div>
    </article>
  );
}

export function FinancePayablesPanel({ data }) {
  if (!data) return null;
  const aging = data.aging || {};
  const buckets = [["current", "Current"], ["days1To30", "1-30"], ["days31To60", "31-60"], ["days61To90", "61-90"], ["over90", "90+"]];
  return (
    <article className="panel finance-payables-panel">
      <div className="panel-head">
        <div><span className="section-label">HayHashvapah Finance</span><h2>Payables · AP aging</h2></div>
        <strong className="aging-badge">{(data.openBills && data.openBills.length) || 0} open</strong>
      </div>
      <div className="aging-summary">
        <div className="metric"><span>billed</span><strong>{amd(data.totalBilled)}</strong></div>
        <div className="metric"><span>outstanding</span><strong>{amd(data.totalOutstanding)}</strong></div>
        <div className="metric"><span>overdue</span><strong>{amd(data.overdueOutstanding)}</strong></div>
      </div>
      <div className="rows">
        {buckets.map(([key, label]) => (
          <div className="row" key={key}><span>{label}</span><strong>{amd(aging[key] || 0)}</strong></div>
        ))}
      </div>
    </article>
  );
}

// Supported opening-balance anchors with their configured opening side.
const OPENING_BALANCE_ACCOUNTS = [
  { code: "111", name: "Մաշվող հիմնական միջոցներ", side: "debit" },
  { code: "112", name: "Հիմնական միջոցների մաշվածություն", side: "credit" },
  { code: "221", name: "Դեբիտորական պարտքեր վաճառքների գծով", side: "debit" },
  { code: "226", name: "Հաշվանցման (փոխհատուցման) ենթակա անուղղակի հարկեր", side: "debit" },
  { code: "251", name: "Դրամարկղ", side: "debit" },
  { code: "252", name: "Հաշվարկային հաշիվ", side: "debit" },
  { code: "521", name: "Կրեդիտորական պարտքեր գնումների գծով", side: "credit" },
  { code: "524", name: "Պարտքեր հարկերի և այլ պարտադիր վճարների գծով", side: "credit" },
  { code: "525", name: "Պարտքեր պարտադիր սոցիալական ապահովության գծով", side: "credit" }
];

function openingBalanceAccountsFromChart(chart) {
  const accounts = chart?.accounts || [];
  const sideRules = Array.isArray(chart?.openingBalanceAccounts) ? chart.openingBalanceAccounts : [];
  if (sideRules.length > 0) {
    return sideRules.map(rule => {
      const account = accounts.find(item => item.code === rule.code) || {};
      return { code: rule.code, name: rule.name || account.name || rule.code, side: rule.side || "debit" };
    });
  }
  const allowedCodes = chart?.openingBalanceAccountCodes || OPENING_BALANCE_ACCOUNTS.map(account => account.code);
  const rows = accounts
    .filter(account => allowedCodes.includes(account.code))
    .map(account => {
      const fallback = OPENING_BALANCE_ACCOUNTS.find(item => item.code === account.code) || {};
      return { code: account.code, name: account.name, side: fallback.side || "debit" };
    });
  return rows.length > 0 ? rows : OPENING_BALANCE_ACCOUNTS;
}

function openingBalanceSideLabel(side) {
  return side === "credit" ? "Կրեդիտ" : "Դեբետ";
}

export function FinanceOpeningBalancesPanel({ data }) {
  if (!data) return null;
  const entries = data.entries || [];
  return (
    <article className="panel finance-opening-balances-panel">
      <div className="panel-head">
        <div><span className="section-label">HayHashvapah Finance</span><h2>Opening balances · Բացման մնացորդներ</h2></div>
        <strong className="aging-badge">{amd(data.openingEquity)} equity</strong>
      </div>
      <div className="rows">
        {entries.map(entry => (
          <div className="row" key={`${entry.code}-${entry.date}`}>
            <span>{entry.code} · {entry.name} · {openingBalanceSideLabel(entry.side)}</span>
            <strong>{entry.side === "credit" ? `(${amd(entry.amount)})` : amd(entry.amount)}</strong>
          </div>
        ))}
        {entries.length === 0 && <div className="row"><span>No opening balances set</span></div>}
      </div>
    </article>
  );
}

export function FinanceOpeningBalancesForm({ onSubmit, actionState, chartOfAccounts }) {
  const accountOptions = openingBalanceAccountsFromChart(chartOfAccounts);
  const [asOf, setAsOf] = useState("");
  const [code, setCode] = useState(accountOptions[0].code);
  const [amount, setAmount] = useState("");
  const [lines, setLines] = useState([]);
  const busy = actionState === "opening-balances:set";
  const nameByCode = Object.fromEntries(accountOptions.map(a => [a.code, a.name]));
  const sideByCode = Object.fromEntries(accountOptions.map(a => [a.code, a.side || "debit"]));
  function addLine() {
    const value = Math.round(Number(amount) || 0);
    if (value <= 0) return;
    setLines([...lines.filter(line => line.code !== code), { code, amount: value, side: sideByCode[code] || "debit" }]);
    setAmount("");
  }
  function submit() {
    if (lines.length === 0) return;
    onSubmit({ asOf: asOf || undefined, entries: lines });
    setLines([]);
  }
  return (
    <article className="panel finance-opening-balances-form-panel">
      <div className="panel-head"><div><span className="section-label">HayHashvapah Finance</span><h2>Set opening balances</h2></div></div>
      <div className="inline-form">
        <input type="date" value={asOf} onChange={event => setAsOf(event.target.value)} placeholder="Ամսաթիվ (YYYY-MM-DD)" />
        <select value={code} onChange={event => setCode(event.target.value)}>
          {accountOptions.map(account => (
            <option key={account.code} value={account.code}>{account.code} · {account.name} · {openingBalanceSideLabel(account.side)}</option>
          ))}
        </select>
        <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="numeric" placeholder="Գումար (AMD)" />
        <button className="mini-action" type="button" onClick={addLine}>Add line</button>
      </div>
      {lines.length > 0 && (
        <div className="rows">
          {lines.map(line => (
            <div className="row" key={line.code}>
              <span>{line.code} · {nameByCode[line.code]} · {openingBalanceSideLabel(line.side)}</span>
              <strong>{line.side === "credit" ? `(${amd(line.amount)})` : amd(line.amount)}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="inline-form">
        <button className="mini-action" type="button" disabled={busy || lines.length === 0} onClick={submit}>{busy ? "Posting" : "Post opening balances"}</button>
      </div>
    </article>
  );
}

// Read-only history lists over the existing GET endpoints — give each posted record a visible
// row (previously only rollups/forms existed; a posted expense/bill/payroll run had no listing).
export function FinanceExpenseListPanel({ data }) {
  const expenses = (data && data.expenses) || [];
  const total = expenses.reduce((sum, e) => sum + (Number(e.total) || 0), 0);
  return (
    <article className="panel finance-expense-list-panel">
      <div className="panel-head">
        <div><span className="section-label">HayHashvapah Finance</span><h2>Expenses · Ծախսեր</h2></div>
        <strong className="aging-badge">{expenses.length}</strong>
      </div>
      <div className="rows">
        {expenses.map(item => (
          <div className="row" key={item.id}>
            <span>{(item.incurredOn || "").slice(0, 10)} · {item.description || "—"}{item.vendor ? ` · ${item.vendor}` : ""}</span>
            <strong>{amd(item.total)}</strong>
          </div>
        ))}
        {expenses.length === 0 && <div className="row"><span>No expenses recorded</span></div>}
      </div>
      {expenses.length > 0 && <div className="meta-row"><span>Total</span><span>{amd(total)}</span></div>}
    </article>
  );
}

export function FinanceBillListPanel({ data }) {
  const bills = (data && data.bills) || [];
  const total = bills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  return (
    <article className="panel finance-bill-list-panel">
      <div className="panel-head">
        <div><span className="section-label">HayHashvapah Finance</span><h2>Supplier bills · Մատակարարների հաշիվներ</h2></div>
        <strong className="aging-badge">{bills.length}</strong>
      </div>
      <div className="rows">
        {bills.map(item => (
          <div className="row" key={item.id}>
            <span>{(item.billDate || "").slice(0, 10)} · {item.supplier || "—"} · <strong>{item.status || "open"}</strong>{item.dueDate ? ` · due ${item.dueDate.slice(0, 10)}` : ""}</span>
            <strong>{amd(item.total)}</strong>
          </div>
        ))}
        {bills.length === 0 && <div className="row"><span>No supplier bills</span></div>}
      </div>
      {bills.length > 0 && <div className="meta-row"><span>Total</span><span>{amd(total)}</span></div>}
    </article>
  );
}

export function FinancePayrollRunsPanel({ data }) {
  const runs = (data && data.payrollRuns) || [];
  const totalNet = runs.reduce((sum, r) => sum + (Number(r.net) || 0), 0);
  return (
    <article className="panel finance-payroll-runs-panel">
      <div className="panel-head">
        <div><span className="section-label">HayHashvapah Finance</span><h2>Payroll runs · Աշխատավարձի հաշվարկներ</h2></div>
        <strong className="aging-badge">{runs.length}</strong>
      </div>
      <div className="rows">
        {runs.map(item => (
          <div className="row" key={item.id}>
            <span>{(item.runDate || "").slice(0, 10)} · {item.employeeName || "—"} · gross {amd(item.gross)} − tax/pension/stamp {amd(item.totalDeductions)}</span>
            <strong>{amd(item.net)}</strong>
          </div>
        ))}
        {runs.length === 0 && <div className="row"><span>No payroll runs</span></div>}
      </div>
      {runs.length > 0 && <div className="meta-row"><span>Total net paid</span><span>{amd(totalNet)}</span></div>}
    </article>
  );
}
