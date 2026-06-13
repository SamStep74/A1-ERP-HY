import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./polish.css";
import { FinanceTrialBalancePanel, FinanceStatementsPanel, FinanceVatPanel, FinanceExpenseForm, LegalSearchPanel, FinanceBillForm, FinancePayrollForm, FinancePayablesPanel, FinanceOpeningBalancesPanel, FinanceOpeningBalancesForm, FinanceExpenseListPanel, FinanceBillListPanel, FinancePayrollRunsPanel, FinanceTaxRatesPanel, FinanceChartOfAccountsPanel, FinanceLocalizationToolsPanel } from "./finance.jsx";
import { CrmQuotesPanel, CrmDealsBoard, CrmQuoteForm, CrmActivityPanel } from "./crm.jsx";
import { CreateTicketForm, DeskTicketList } from "./desk.jsx";
import { PeopleEmployeeForm, PeopleRegistryPanel } from "./people.jsx";
import { DocsCreateForm, DocsRegistryPanel } from "./docs.jsx";
import { CopilotPanel } from "./copilot.jsx";
import { AiOnboardingPanel } from "./ai-onboarding.jsx";
import { ProductionReadinessPanel } from "./compliance.jsx";
import { ProjectCreateForm, ProjectsBoardPanel } from "./projects.jsx";
import { FormCreateForm, FormsRegistryPanel } from "./forms.jsx";
import { InventoryWorkspacePanel } from "./inventory.jsx";
import { PurchaseWorkspacePanel } from "./purchase.jsx";
import { loadOr } from "./load-section.js";
import { loadAuditForRole } from "./audit-access.js";
import {
  appIdFromLocation,
  appRoute,
  normalizeSuiteAppId,
  normalizeSuiteAppIds
} from "./suite-routes.js";

const money = value => `${Number(value || 0).toLocaleString("hy-AM")} AMD`;
const sensitiveMoney = value => value === null || value === "restricted" ? "restricted" : money(value);
const forecastCategoryLabel = value => value === "pipeline" ? "Tube" : (value || "Tube");
const semanticMetricValue = metric => {
  if (!metric) return "";
  if (metric.unit === "AMD") return money(metric.value);
  if (metric.unit === "percent") return `${Number(metric.value || 0)}%`;
  return Number(metric.value || 0).toLocaleString("hy-AM");
};
const currentQuarterLabel = () => {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
};
const armeniaDateString = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Yerevan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((memo, part) => {
    memo[part.type] = part.value;
    return memo;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const armeniaMonthString = () => armeniaDateString().slice(0, 7);
const remediationResolutionDefaults = actionKey => {
  if (actionKey === "resolve-accountant-review") {
    return {
      evidenceType: "accountant-review-note",
      evidence: "VAT source and period lock reviewed for pilot launch.",
      note: "Accountant cleared legal/accounting launch blocker."
    };
  }
  if (actionKey === "close-overdue-receivable-risk") {
    return {
      evidenceType: "payment-promise",
      evidence: "Customer promised payment before pilot launch.",
      note: "Operator documented collection risk closure evidence."
    };
  }
  if (actionKey === "complete-commercial-package") {
    return {
      evidenceType: "commercial-package-note",
      evidence: "Paid pilot terms and Armenian AMD package pricing confirmed.",
      note: "Owner confirmed commercial package before pilot offer."
    };
  }
  return {
    evidenceType: "connector-health-check",
    evidence: `${actionKey.replace(/^configure-/, "").replace(/-/g, " ")} connector configured and health check reviewed.`,
    note: "Admin recorded connector remediation evidence."
  };
};

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    credentials: "include",
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || response.statusText);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function apiText(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    credentials: "include",
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  if (!response.ok) {
    let message = response.statusText;
    try {
      message = JSON.parse(text).error || message;
    } catch {
      // Non-JSON error bodies keep the transport status text.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return text;
}

function App() {
  const [session, setSession] = useState(null);
  const [suite, setSuite] = useState(null);
  const [audit, setAudit] = useState([]);
  const [customer360, setCustomer360] = useState(null);
  const [serviceConsole, setServiceConsole] = useState(null);
  const [securityMfa, setSecurityMfa] = useState(null);
  const [roleDashboard, setRoleDashboard] = useState(null);
  const [crmLeadData, setCrmLeadData] = useState(null);
  const [crmForecastData, setCrmForecastData] = useState(null);
  const [crmQuotes, setCrmQuotes] = useState(null);
  const [crmActivities, setCrmActivities] = useState(null);
  const [campaignPerformance, setCampaignPerformance] = useState(null);
  const [receivablesAging, setReceivablesAging] = useState(null);
  const [finance, setFinance] = useState(null);
  const [people, setPeople] = useState(null);
  const [docs, setDocs] = useState(null);
  const [projects, setProjects] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [purchase, setPurchase] = useState(null);
  const [forms, setForms] = useState(null);
  const [semanticMetrics, setSemanticMetrics] = useState(null);
  const [semanticSnapshots, setSemanticSnapshots] = useState(null);
  const [analyticsReports, setAnalyticsReports] = useState([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState([]);
  const [integrationConnectors, setIntegrationConnectors] = useState([]);
  const [pilotTemplateData, setPilotTemplateData] = useState(null);
  const [pilotOwnerBriefs, setPilotOwnerBriefs] = useState([]);
  const [pilotOperatorWorkbenches, setPilotOperatorWorkbenches] = useState([]);
  const [pilotAccountantReviews, setPilotAccountantReviews] = useState([]);
  const [pilotLaunchReadinessPackets, setPilotLaunchReadinessPackets] = useState([]);
  const [pilotLaunchRemediationPlans, setPilotLaunchRemediationPlans] = useState([]);
  const [pilotRemediationResolutions, setPilotRemediationResolutions] = useState([]);
  const [pilotLaunchClearancePackets, setPilotLaunchClearancePackets] = useState([]);
  const [pilotPaidOffers, setPilotPaidOffers] = useState([]);
  const [pilotQuoteHandoffs, setPilotQuoteHandoffs] = useState([]);
  const [pilotQuoteReleases, setPilotQuoteReleases] = useState([]);
  const [pilotQuoteAcceptanceHandoffs, setPilotQuoteAcceptanceHandoffs] = useState([]);
  const [pilotHayhashvapahDrafts, setPilotHayhashvapahDrafts] = useState([]);
  const [pilotOfficialInvoices, setPilotOfficialInvoices] = useState([]);
  const [pilotPaymentCollections, setPilotPaymentCollections] = useState([]);
  const [pilotCloseouts, setPilotCloseouts] = useState([]);
  const [pilotRenewalQuoteHandoffs, setPilotRenewalQuoteHandoffs] = useState([]);
  const [pilotRenewalQuoteReleases, setPilotRenewalQuoteReleases] = useState([]);
  const [pilotRenewalAcceptanceHandoffs, setPilotRenewalAcceptanceHandoffs] = useState([]);
  const [pilotRenewalHayhashvapahDrafts, setPilotRenewalHayhashvapahDrafts] = useState([]);
  const [pilotRenewalOfficialInvoices, setPilotRenewalOfficialInvoices] = useState([]);
  const [pilotRenewalPaymentCollections, setPilotRenewalPaymentCollections] = useState([]);
  const [pilotRenewalCloseouts, setPilotRenewalCloseouts] = useState([]);
  const [pilotNextRenewalQuoteHandoffs, setPilotNextRenewalQuoteHandoffs] = useState([]);
  const [pilotNextRenewalQuoteReleases, setPilotNextRenewalQuoteReleases] = useState([]);
  const [pilotNextRenewalAcceptanceHandoffs, setPilotNextRenewalAcceptanceHandoffs] = useState([]);
  const [pilotNextRenewalHayhashvapahDrafts, setPilotNextRenewalHayhashvapahDrafts] = useState([]);
  const [pilotNextRenewalOfficialInvoices, setPilotNextRenewalOfficialInvoices] = useState([]);
  const [pilotNextRenewalPaymentCollections, setPilotNextRenewalPaymentCollections] = useState([]);
  const [pilotNextRenewalCloseouts, setPilotNextRenewalCloseouts] = useState([]);
  const [pilotFollowingRenewalQuoteHandoffs, setPilotFollowingRenewalQuoteHandoffs] = useState([]);
  const [pilotFollowingRenewalQuoteReleases, setPilotFollowingRenewalQuoteReleases] = useState([]);
  const [pilotFollowingRenewalAcceptanceHandoffs, setPilotFollowingRenewalAcceptanceHandoffs] = useState([]);
  const [pilotFollowingRenewalHayhashvapahDrafts, setPilotFollowingRenewalHayhashvapahDrafts] = useState([]);
  const [pilotFollowingRenewalOfficialInvoices, setPilotFollowingRenewalOfficialInvoices] = useState([]);
  const [pilotFollowingRenewalPaymentCollections, setPilotFollowingRenewalPaymentCollections] = useState([]);
  const [pilotFollowingRenewalCloseouts, setPilotFollowingRenewalCloseouts] = useState([]);
  const [pilotSubsequentRenewalQuoteHandoffs, setPilotSubsequentRenewalQuoteHandoffs] = useState([]);
  const [pilotSubsequentRenewalQuoteReleases, setPilotSubsequentRenewalQuoteReleases] = useState([]);
  const [pilotSubsequentRenewalAcceptanceHandoffs, setPilotSubsequentRenewalAcceptanceHandoffs] = useState([]);
  const [pilotSubsequentRenewalHayhashvapahDrafts, setPilotSubsequentRenewalHayhashvapahDrafts] = useState([]);
  const [pilotSubsequentRenewalOfficialInvoices, setPilotSubsequentRenewalOfficialInvoices] = useState([]);
  const [pilotSubsequentRenewalPaymentCollections, setPilotSubsequentRenewalPaymentCollections] = useState([]);
  const [pilotSubsequentRenewalCloseouts, setPilotSubsequentRenewalCloseouts] = useState([]);
  const [pilotContinuationRenewalQuoteHandoffs, setPilotContinuationRenewalQuoteHandoffs] = useState([]);
  const [pilotContinuationRenewalQuoteReleases, setPilotContinuationRenewalQuoteReleases] = useState([]);
  const [pilotContinuationRenewalAcceptanceHandoffs, setPilotContinuationRenewalAcceptanceHandoffs] = useState([]);
  const [pilotContinuationRenewalHayhashvapahDrafts, setPilotContinuationRenewalHayhashvapahDrafts] = useState([]);
  const [pilotContinuationRenewalOfficialInvoices, setPilotContinuationRenewalOfficialInvoices] = useState([]);
  const [pilotContinuationRenewalPaymentCollections, setPilotContinuationRenewalPaymentCollections] = useState([]);
  const [pilotContinuationRenewalCloseouts, setPilotContinuationRenewalCloseouts] = useState([]);
  const [pilotOngoingRenewalQuoteHandoffs, setPilotOngoingRenewalQuoteHandoffs] = useState([]);
  const [pilotOngoingRenewalQuoteReleases, setPilotOngoingRenewalQuoteReleases] = useState([]);
  const [pilotOngoingRenewalAcceptanceHandoffs, setPilotOngoingRenewalAcceptanceHandoffs] = useState([]);
  const [pilotOngoingRenewalHayhashvapahDrafts, setPilotOngoingRenewalHayhashvapahDrafts] = useState([]);
  const [pilotOngoingRenewalOfficialInvoices, setPilotOngoingRenewalOfficialInvoices] = useState([]);
  const [pilotOngoingRenewalPaymentCollections, setPilotOngoingRenewalPaymentCollections] = useState([]);
  const [pilotOngoingRenewalCloseouts, setPilotOngoingRenewalCloseouts] = useState([]);
  const [pilotNextOngoingRenewalQuoteHandoffs, setPilotNextOngoingRenewalQuoteHandoffs] = useState([]);
  const [pilotNextOngoingRenewalQuoteReleases, setPilotNextOngoingRenewalQuoteReleases] = useState([]);
  const [pilotNextOngoingRenewalAcceptanceHandoffs, setPilotNextOngoingRenewalAcceptanceHandoffs] = useState([]);
  const [pilotNextOngoingRenewalHayhashvapahDrafts, setPilotNextOngoingRenewalHayhashvapahDrafts] = useState([]);
  const [pilotNextOngoingRenewalOfficialInvoices, setPilotNextOngoingRenewalOfficialInvoices] = useState([]);
  const [pilotNextOngoingRenewalPaymentCollections, setPilotNextOngoingRenewalPaymentCollections] = useState([]);
  const [pilotNextOngoingRenewalCloseouts, setPilotNextOngoingRenewalCloseouts] = useState([]);
  const [pilotFollowingOngoingRenewalQuoteHandoffs, setPilotFollowingOngoingRenewalQuoteHandoffs] = useState([]);
  const [pilotFollowingOngoingRenewalQuoteReleases, setPilotFollowingOngoingRenewalQuoteReleases] = useState([]);
  const [pilotFollowingOngoingRenewalAcceptanceHandoffs, setPilotFollowingOngoingRenewalAcceptanceHandoffs] = useState([]);
  const [pilotFollowingOngoingRenewalHayhashvapahDrafts, setPilotFollowingOngoingRenewalHayhashvapahDrafts] = useState([]);
  const [pilotFollowingOngoingRenewalOfficialInvoices, setPilotFollowingOngoingRenewalOfficialInvoices] = useState([]);
  const [pilotFollowingOngoingRenewalPaymentCollections, setPilotFollowingOngoingRenewalPaymentCollections] = useState([]);
  const [pilotFollowingOngoingRenewalCloseouts, setPilotFollowingOngoingRenewalCloseouts] = useState([]);
  const [pilotSubsequentOngoingRenewalQuoteHandoffs, setPilotSubsequentOngoingRenewalQuoteHandoffs] = useState([]);
  const [pilotSubsequentOngoingRenewalQuoteReleases, setPilotSubsequentOngoingRenewalQuoteReleases] = useState([]);
  const [pilotSubsequentOngoingRenewalAcceptanceHandoffs, setPilotSubsequentOngoingRenewalAcceptanceHandoffs] = useState([]);
  const [pilotSubsequentOngoingRenewalHayhashvapahDrafts, setPilotSubsequentOngoingRenewalHayhashvapahDrafts] = useState([]);
  const [pilotSubsequentOngoingRenewalOfficialInvoices, setPilotSubsequentOngoingRenewalOfficialInvoices] = useState([]);
  const [pilotSubsequentOngoingRenewalPaymentCollections, setPilotSubsequentOngoingRenewalPaymentCollections] = useState([]);
  const [pilotSubsequentOngoingRenewalCloseouts, setPilotSubsequentOngoingRenewalCloseouts] = useState([]);
  const [pilotNextRecurringOngoingRenewalQuoteHandoffs, setPilotNextRecurringOngoingRenewalQuoteHandoffs] = useState([]);
  const [pilotNextRecurringOngoingRenewalQuoteReleases, setPilotNextRecurringOngoingRenewalQuoteReleases] = useState([]);
  const [pilotNextRecurringOngoingRenewalAcceptanceHandoffs, setPilotNextRecurringOngoingRenewalAcceptanceHandoffs] = useState([]);
  const [pilotNextRecurringOngoingRenewalHayhashvapahDrafts, setPilotNextRecurringOngoingRenewalHayhashvapahDrafts] = useState([]);
  const [pilotNextRecurringOngoingRenewalOfficialInvoices, setPilotNextRecurringOngoingRenewalOfficialInvoices] = useState([]);
  const [pilotNextRecurringOngoingRenewalPaymentCollections, setPilotNextRecurringOngoingRenewalPaymentCollections] = useState([]);
  const [pilotNextRecurringOngoingRenewalCloseouts, setPilotNextRecurringOngoingRenewalCloseouts] = useState([]);
  const [adminBackups, setAdminBackups] = useState([]);
  const [adminAccessReviews, setAdminAccessReviews] = useState([]);
  const [adminSessions, setAdminSessions] = useState(null);
  const [adminAuditExports, setAdminAuditExports] = useState([]);
  const [productionReadiness, setProductionReadiness] = useState(null);
  const [assignedAppIds, setAssignedAppIds] = useState([]);
  const [selectedApp, setSelectedApp] = useState(() => appIdFromLocation());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handlePopState = () => setSelectedApp(appIdFromLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function selectApp(appId) {
    const nextAppId = normalizeSuiteAppId(appId, assignedAppIds);
    setSelectedApp(nextAppId);
    const nextRoute = appRoute(nextAppId);
    if (window.location.pathname !== nextRoute) {
      window.history.pushState({ selectedApp: nextAppId }, "", nextRoute);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const data = await api("/api/suite");
      setSession(data.user);
      setSuite(data);
      const normalizedAssignedAppIds = normalizeSuiteAppIds((data.apps || []).map(app => app.id));
      setAssignedAppIds(normalizedAssignedAppIds);
      const assignedApps = new Set(normalizedAssignedAppIds);
      const requestedAppId = normalizeSuiteAppId(appIdFromLocation(), normalizedAssignedAppIds);
      const nextSelectedApp = normalizedAssignedAppIds.includes(requestedAppId) ? requestedAppId : (normalizedAssignedAppIds[0] || "crm");
      setSelectedApp(nextSelectedApp);
      if (window.location.pathname !== appRoute(nextSelectedApp)) {
        window.history.replaceState({ selectedApp: nextSelectedApp }, "", appRoute(nextSelectedApp));
      }
      const firstCustomer = await loadOr(null, () => api("/api/customer-360/cust-nare"));
      setCustomer360(firstCustomer);
      const roleDashboardData = await loadOr(null, () => api("/api/analytics/role-dashboard"));
      setRoleDashboard(roleDashboardData);
      if (["Owner", "Admin"].includes(data.user.role)) {
        const mfaData = await loadOr(null, () => api("/api/security/mfa"));
        setSecurityMfa(mfaData);
      } else {
        setSecurityMfa(null);
      }
      const serviceData = await loadOr(null, () => api("/api/service/console"));
      setServiceConsole(serviceData);
      if (assignedApps.has("crm")) {
        const leadData = await loadOr(null, () => api("/api/crm/leads"));
        setCrmLeadData(leadData);
        const forecastData = await loadOr(null, () => api("/api/crm/forecast"));
        setCrmForecastData(forecastData);
        const quotesData = await loadOr(null, () => api("/api/crm/quotes"));
        setCrmQuotes(quotesData);
        const activitiesData = await loadOr(null, () => api("/api/crm/activities"));
        setCrmActivities(activitiesData);
      } else {
        setCrmLeadData(null);
        setCrmForecastData(null);
        setCrmQuotes(null);
        setCrmActivities(null);
      }
      const hasCampaigns = assignedApps.has("campaigns");
      const hasForms = hasCampaigns || assignedApps.has("forms");
      if (hasCampaigns) {
        const campaignData = await loadOr(null, () => api("/api/campaigns/performance"));
        setCampaignPerformance(campaignData);
      } else {
        setCampaignPerformance(null);
      }
      if (hasCampaigns || hasForms) {
        const formsData = await loadOr(null, () => api("/api/forms"));
        setForms(formsData);
      } else {
        setForms(null);
      }
      if (assignedApps.has("analytics")) {
        const receivablesData = await loadOr(null, () => api("/api/analytics/receivables-aging"));
        setReceivablesAging(receivablesData);
        const semanticData = await loadOr(null, () => api("/api/analytics/semantic-metrics"));
        setSemanticMetrics(semanticData);
        const snapshotData = await loadOr(null, () => api("/api/analytics/semantic-snapshots"));
        setSemanticSnapshots(snapshotData);
        if (["Owner", "Admin", "Accountant", "Auditor"].includes(data.user.role)) {
          const reportData = await loadOr({}, () => api("/api/analytics/reports"));
          setAnalyticsReports(reportData.reports || []);
        } else {
          setAnalyticsReports([]);
        }
      } else {
        setReceivablesAging(null);
        setSemanticMetrics(null);
        setSemanticSnapshots(null);
        setAnalyticsReports([]);
      }
      if (assignedApps.has("finance")) {
        const trialBalance = await api("/api/finance/trial-balance");
        const statements = await api("/api/finance/statements");
        const vat = await api("/api/finance/vat-report");
        const payables = await api("/api/finance/payables");
        const openingBalances = await api("/api/finance/opening-balances").catch(() => ({ entries: [], count: 0, openingEquity: 0 }));
        const expenses = await api("/api/finance/expenses").catch(() => ({ expenses: [] }));
        const bills = await api("/api/finance/bills").catch(() => ({ bills: [] }));
        const payrollRuns = await api("/api/payroll/runs").catch(() => ({ runs: [] }));
        const taxRates = await api("/api/finance/tax-rates").catch(() => ({ taxRates: [] }));
        const periods = await api("/api/finance/periods").catch(() => ({ periods: [] }));
        const chartOfAccounts = await api("/api/finance/chart-of-accounts").catch(() => null);
        setFinance({ trialBalance, statements, vat, payables, openingBalances, expenses, bills, payrollRuns: { payrollRuns: payrollRuns.runs || [] }, taxRates: { taxRates: taxRates.taxRates || [] }, periods: { periods: periods.periods || [] }, chartOfAccounts });
      } else {
        setFinance(null);
      }
      if (assignedApps.has("people")) {
        const peopleData = await loadOr(null, () => api("/api/people/employees"));
        setPeople(peopleData);
      } else {
        setPeople(null);
      }
      if (assignedApps.has("docs")) {
        const docsData = await loadOr(null, () => api("/api/docs/documents"));
        const templatesData = await loadOr(null, () => api("/api/docs/templates"));
        setDocs(docsData ? { ...docsData, templates: (templatesData && templatesData.templates) || [] } : docsData);
      } else {
        setDocs(null);
      }
      if (assignedApps.has("projects")) {
        const projectsData = await loadOr(null, () => api("/api/projects"));
        setProjects(projectsData);
      } else {
        setProjects(null);
      }
      if (assignedApps.has("inventory")) {
        const [catalogData, stockData, movesData] = await Promise.all([
          loadOr({ items: [], categories: [] }, () => api("/api/catalog/items")),
          loadOr({ stock: [], locations: [] }, () => api("/api/inventory/stock")),
          loadOr({ moves: [] }, () => api("/api/inventory/moves"))
        ]);
        setInventory({ catalog: catalogData, stock: stockData, moves: movesData });
      } else {
        setInventory(null);
      }
      if (assignedApps.has("purchase")) {
        const [ordersData, catalogData, vendorsData, analyticsData] = await Promise.all([
          loadOr({ orders: [] }, () => api("/api/purchase/orders")),
          loadOr({ items: [], categories: [] }, () => api("/api/catalog/items")),
          loadOr({ vendors: [] }, () => api("/api/purchase/vendors")),
          loadOr({ summary: {}, receiptBacklog: [], vendorPerformance: [], priceCoverage: {} }, () => api("/api/purchase/analytics"))
        ]);
        setPurchase({ orders: ordersData, catalog: catalogData, vendors: vendorsData, analytics: analyticsData });
      } else {
        setPurchase(null);
      }
      if (["Owner", "Auditor"].includes(data.user.role)) {
        const accessReviewData = await loadOr({}, () => api("/api/admin/access-reviews"));
        setAdminAccessReviews(accessReviewData.reviews || []);
      } else {
        setAdminAccessReviews([]);
      }
      if (["Owner", "Admin", "Auditor"].includes(data.user.role)) {
        const sessionData = await loadOr(null, () => api("/api/admin/sessions"));
        setAdminSessions(sessionData);
        const auditExportData = await loadOr({}, () => api("/api/admin/audit-exports"));
        setAdminAuditExports(auditExportData.exports || []);
        const connectorData = await loadOr({}, () => api("/api/integrations/connectors"));
        setIntegrationConnectors(connectorData.connectors || []);
      } else {
        setAdminSessions(null);
        setAdminAuditExports([]);
        setIntegrationConnectors([]);
      }
      if (["Owner", "Admin", "Accountant", "Lawyer", "Auditor"].includes(data.user.role)) {
        const readinessData = await loadOr(null, () => api("/api/compliance/production-readiness"));
        setProductionReadiness(readinessData);
      } else {
        setProductionReadiness(null);
      }
      if (["Owner", "Admin", "Salesperson", "Operator", "Accountant", "Auditor"].includes(data.user.role)) {
        const pilotData = await loadOr(null, () => api("/api/pilots/templates/clinic-wellness"));
        setPilotTemplateData(pilotData);
        const pilotBriefData = await loadOr({}, () => api("/api/pilots/clinic-wellness/owner-briefs"));
        setPilotOwnerBriefs(pilotBriefData.briefs || []);
        const workbenchData = await loadOr({}, () => api("/api/pilots/clinic-wellness/operator-workbenches"));
        setPilotOperatorWorkbenches(workbenchData.workbenches || []);
        const launchReadinessData = await loadOr({}, () => api("/api/pilots/clinic-wellness/launch-readiness"));
        setPilotLaunchReadinessPackets(launchReadinessData.packets || []);
        const remediationData = await loadOr({}, () => api("/api/pilots/clinic-wellness/launch-remediation-plans"));
        setPilotLaunchRemediationPlans(remediationData.plans || []);
        const remediationResolutionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/remediation-resolutions"));
        setPilotRemediationResolutions(remediationResolutionData.resolutions || []);
        const launchClearanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/launch-clearance"));
        setPilotLaunchClearancePackets(launchClearanceData.packets || []);
        const paidOfferData = await loadOr({}, () => api("/api/pilots/clinic-wellness/paid-offers"));
        setPilotPaidOffers(paidOfferData.offers || []);
        const quoteHandoffData = await loadOr({}, () => api("/api/pilots/clinic-wellness/quote-handoffs"));
        setPilotQuoteHandoffs(quoteHandoffData.handoffs || []);
        const quoteReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/quote-releases"));
        setPilotQuoteReleases(quoteReleaseData.packets || []);
        const acceptanceHandoffData = await loadOr({}, () => api("/api/pilots/clinic-wellness/quote-acceptance-handoffs"));
        setPilotQuoteAcceptanceHandoffs(acceptanceHandoffData.packets || []);
        const hayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/hayhashvapah-drafts"));
        setPilotHayhashvapahDrafts(hayhashvapahDraftData.packets || []);
        const officialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/official-invoices"));
        setPilotOfficialInvoices(officialInvoiceData.packets || []);
        const paymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/payment-collections"));
        setPilotPaymentCollections(paymentCollectionData.packets || []);
        const closeoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/closeouts"));
        setPilotCloseouts(closeoutData.packets || []);
        const renewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/renewal-quotes"));
        setPilotRenewalQuoteHandoffs(renewalQuoteData.handoffs || []);
        const renewalQuoteReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/renewal-quote-releases"));
        setPilotRenewalQuoteReleases(renewalQuoteReleaseData.packets || []);
        const renewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/renewal-acceptance-handoffs"));
        setPilotRenewalAcceptanceHandoffs(renewalAcceptanceData.packets || []);
        const renewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/renewal-hayhashvapah-drafts"));
        setPilotRenewalHayhashvapahDrafts(renewalHayhashvapahDraftData.packets || []);
        const renewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/renewal-official-invoices"));
        setPilotRenewalOfficialInvoices(renewalOfficialInvoiceData.packets || []);
        const renewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/renewal-payment-collections"));
        setPilotRenewalPaymentCollections(renewalPaymentCollectionData.packets || []);
        const renewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/renewal-closeouts"));
        setPilotRenewalCloseouts(renewalCloseoutData.packets || []);
        const nextRenewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-renewal-quotes"));
        setPilotNextRenewalQuoteHandoffs(nextRenewalQuoteData.handoffs || []);
        const nextRenewalReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-renewal-quote-releases"));
        setPilotNextRenewalQuoteReleases(nextRenewalReleaseData.packets || []);
        const nextRenewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-renewal-acceptance-handoffs"));
        setPilotNextRenewalAcceptanceHandoffs(nextRenewalAcceptanceData.packets || []);
        const nextRenewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-renewal-hayhashvapah-drafts"));
        setPilotNextRenewalHayhashvapahDrafts(nextRenewalHayhashvapahDraftData.packets || []);
        const nextRenewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-renewal-official-invoices"));
        setPilotNextRenewalOfficialInvoices(nextRenewalOfficialInvoiceData.packets || []);
        const nextRenewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-renewal-payment-collections"));
        setPilotNextRenewalPaymentCollections(nextRenewalPaymentCollectionData.packets || []);
        const nextRenewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-renewal-closeouts"));
        setPilotNextRenewalCloseouts(nextRenewalCloseoutData.packets || []);
        const followingRenewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-renewal-quotes"));
        setPilotFollowingRenewalQuoteHandoffs(followingRenewalQuoteData.handoffs || []);
        const followingRenewalReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-renewal-quote-releases"));
        setPilotFollowingRenewalQuoteReleases(followingRenewalReleaseData.packets || []);
        const followingRenewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-renewal-acceptance-handoffs"));
        setPilotFollowingRenewalAcceptanceHandoffs(followingRenewalAcceptanceData.packets || []);
        const followingRenewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-renewal-hayhashvapah-drafts"));
        setPilotFollowingRenewalHayhashvapahDrafts(followingRenewalHayhashvapahDraftData.packets || []);
        const followingRenewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-renewal-official-invoices"));
        setPilotFollowingRenewalOfficialInvoices(followingRenewalOfficialInvoiceData.packets || []);
        const followingRenewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-renewal-payment-collections"));
        setPilotFollowingRenewalPaymentCollections(followingRenewalPaymentCollectionData.packets || []);
        const followingRenewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-renewal-closeouts"));
        setPilotFollowingRenewalCloseouts(followingRenewalCloseoutData.packets || []);
        const subsequentRenewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-renewal-quotes"));
        setPilotSubsequentRenewalQuoteHandoffs(subsequentRenewalQuoteData.handoffs || []);
        const subsequentRenewalReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-renewal-quote-releases"));
        setPilotSubsequentRenewalQuoteReleases(subsequentRenewalReleaseData.packets || []);
        const subsequentRenewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-renewal-acceptance-handoffs"));
        setPilotSubsequentRenewalAcceptanceHandoffs(subsequentRenewalAcceptanceData.packets || []);
        const subsequentRenewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-renewal-hayhashvapah-drafts"));
        setPilotSubsequentRenewalHayhashvapahDrafts(subsequentRenewalHayhashvapahDraftData.packets || []);
        const subsequentRenewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-renewal-official-invoices"));
        setPilotSubsequentRenewalOfficialInvoices(subsequentRenewalOfficialInvoiceData.packets || []);
        const subsequentRenewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-renewal-payment-collections"));
        setPilotSubsequentRenewalPaymentCollections(subsequentRenewalPaymentCollectionData.packets || []);
        const subsequentRenewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-renewal-closeouts"));
        setPilotSubsequentRenewalCloseouts(subsequentRenewalCloseoutData.packets || []);
        const continuationRenewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/continuation-renewal-quotes"));
        setPilotContinuationRenewalQuoteHandoffs(continuationRenewalQuoteData.handoffs || []);
        const continuationRenewalReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/continuation-renewal-quote-releases"));
        setPilotContinuationRenewalQuoteReleases(continuationRenewalReleaseData.packets || []);
        const continuationRenewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/continuation-renewal-acceptance-handoffs"));
        setPilotContinuationRenewalAcceptanceHandoffs(continuationRenewalAcceptanceData.packets || []);
        const continuationRenewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/continuation-renewal-hayhashvapah-drafts"));
        setPilotContinuationRenewalHayhashvapahDrafts(continuationRenewalHayhashvapahDraftData.packets || []);
        const continuationRenewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/continuation-renewal-official-invoices"));
        setPilotContinuationRenewalOfficialInvoices(continuationRenewalOfficialInvoiceData.packets || []);
        const continuationRenewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/continuation-renewal-payment-collections"));
        setPilotContinuationRenewalPaymentCollections(continuationRenewalPaymentCollectionData.packets || []);
        const continuationRenewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/continuation-renewal-closeouts"));
        setPilotContinuationRenewalCloseouts(continuationRenewalCloseoutData.packets || []);
        const ongoingRenewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/ongoing-renewal-quotes"));
        setPilotOngoingRenewalQuoteHandoffs(ongoingRenewalQuoteData.handoffs || []);
        const ongoingRenewalReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/ongoing-renewal-quote-releases"));
        setPilotOngoingRenewalQuoteReleases(ongoingRenewalReleaseData.packets || []);
        const ongoingRenewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/ongoing-renewal-acceptance-handoffs"));
        setPilotOngoingRenewalAcceptanceHandoffs(ongoingRenewalAcceptanceData.packets || []);
        const ongoingRenewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/ongoing-renewal-hayhashvapah-drafts"));
        setPilotOngoingRenewalHayhashvapahDrafts(ongoingRenewalHayhashvapahDraftData.packets || []);
        const ongoingRenewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/ongoing-renewal-official-invoices"));
        setPilotOngoingRenewalOfficialInvoices(ongoingRenewalOfficialInvoiceData.packets || []);
        const ongoingRenewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/ongoing-renewal-payment-collections"));
        setPilotOngoingRenewalPaymentCollections(ongoingRenewalPaymentCollectionData.packets || []);
        const ongoingRenewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/ongoing-renewal-closeouts"));
        setPilotOngoingRenewalCloseouts(ongoingRenewalCloseoutData.packets || []);
        const nextOngoingRenewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-ongoing-renewal-quotes"));
        setPilotNextOngoingRenewalQuoteHandoffs(nextOngoingRenewalQuoteData.handoffs || []);
        const nextOngoingRenewalReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-ongoing-renewal-quote-releases"));
        setPilotNextOngoingRenewalQuoteReleases(nextOngoingRenewalReleaseData.packets || []);
        const nextOngoingRenewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-ongoing-renewal-acceptance-handoffs"));
        setPilotNextOngoingRenewalAcceptanceHandoffs(nextOngoingRenewalAcceptanceData.packets || []);
        const nextOngoingRenewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-ongoing-renewal-hayhashvapah-drafts"));
        setPilotNextOngoingRenewalHayhashvapahDrafts(nextOngoingRenewalHayhashvapahDraftData.packets || []);
        const nextOngoingRenewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-ongoing-renewal-official-invoices"));
        setPilotNextOngoingRenewalOfficialInvoices(nextOngoingRenewalOfficialInvoiceData.packets || []);
        const nextOngoingRenewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-ongoing-renewal-payment-collections"));
        setPilotNextOngoingRenewalPaymentCollections(nextOngoingRenewalPaymentCollectionData.packets || []);
        const nextOngoingRenewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-ongoing-renewal-closeouts"));
        setPilotNextOngoingRenewalCloseouts(nextOngoingRenewalCloseoutData.packets || []);
        const followingOngoingRenewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-ongoing-renewal-quotes"));
        setPilotFollowingOngoingRenewalQuoteHandoffs(followingOngoingRenewalQuoteData.handoffs || []);
        const followingOngoingRenewalReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-ongoing-renewal-quote-releases"));
        setPilotFollowingOngoingRenewalQuoteReleases(followingOngoingRenewalReleaseData.packets || []);
        const followingOngoingRenewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-ongoing-renewal-acceptance-handoffs"));
        setPilotFollowingOngoingRenewalAcceptanceHandoffs(followingOngoingRenewalAcceptanceData.packets || []);
        const followingOngoingRenewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-ongoing-renewal-hayhashvapah-drafts"));
        setPilotFollowingOngoingRenewalHayhashvapahDrafts(followingOngoingRenewalHayhashvapahDraftData.packets || []);
        const followingOngoingRenewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-ongoing-renewal-official-invoices"));
        setPilotFollowingOngoingRenewalOfficialInvoices(followingOngoingRenewalOfficialInvoiceData.packets || []);
        const followingOngoingRenewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-ongoing-renewal-payment-collections"));
        setPilotFollowingOngoingRenewalPaymentCollections(followingOngoingRenewalPaymentCollectionData.packets || []);
        const followingOngoingRenewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/following-ongoing-renewal-closeouts"));
        setPilotFollowingOngoingRenewalCloseouts(followingOngoingRenewalCloseoutData.packets || []);
        const subsequentOngoingRenewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-ongoing-renewal-quotes"));
        setPilotSubsequentOngoingRenewalQuoteHandoffs(subsequentOngoingRenewalQuoteData.handoffs || []);
        const subsequentOngoingRenewalReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-ongoing-renewal-quote-releases"));
        setPilotSubsequentOngoingRenewalQuoteReleases(subsequentOngoingRenewalReleaseData.packets || []);
        const subsequentOngoingRenewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-ongoing-renewal-acceptance-handoffs"));
        setPilotSubsequentOngoingRenewalAcceptanceHandoffs(subsequentOngoingRenewalAcceptanceData.packets || []);
        const subsequentOngoingRenewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-ongoing-renewal-hayhashvapah-drafts"));
        setPilotSubsequentOngoingRenewalHayhashvapahDrafts(subsequentOngoingRenewalHayhashvapahDraftData.packets || []);
        const subsequentOngoingRenewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-ongoing-renewal-official-invoices"));
        setPilotSubsequentOngoingRenewalOfficialInvoices(subsequentOngoingRenewalOfficialInvoiceData.packets || []);
        const subsequentOngoingRenewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-ongoing-renewal-payment-collections"));
        setPilotSubsequentOngoingRenewalPaymentCollections(subsequentOngoingRenewalPaymentCollectionData.packets || []);
        const subsequentOngoingRenewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/subsequent-ongoing-renewal-closeouts"));
        setPilotSubsequentOngoingRenewalCloseouts(subsequentOngoingRenewalCloseoutData.packets || []);
        const nextRecurringOngoingRenewalQuoteData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-quotes"));
        setPilotNextRecurringOngoingRenewalQuoteHandoffs(nextRecurringOngoingRenewalQuoteData.handoffs || []);
        const nextRecurringOngoingRenewalReleaseData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-quote-releases"));
        setPilotNextRecurringOngoingRenewalQuoteReleases(nextRecurringOngoingRenewalReleaseData.packets || []);
        const nextRecurringOngoingRenewalAcceptanceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-acceptance-handoffs"));
        setPilotNextRecurringOngoingRenewalAcceptanceHandoffs(nextRecurringOngoingRenewalAcceptanceData.packets || []);
        const nextRecurringOngoingRenewalHayhashvapahDraftData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-hayhashvapah-drafts"));
        setPilotNextRecurringOngoingRenewalHayhashvapahDrafts(nextRecurringOngoingRenewalHayhashvapahDraftData.packets || []);
        const nextRecurringOngoingRenewalOfficialInvoiceData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-official-invoices"));
        setPilotNextRecurringOngoingRenewalOfficialInvoices(nextRecurringOngoingRenewalOfficialInvoiceData.packets || []);
        const nextRecurringOngoingRenewalPaymentCollectionData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-payment-collections"));
        setPilotNextRecurringOngoingRenewalPaymentCollections(nextRecurringOngoingRenewalPaymentCollectionData.packets || []);
        const nextRecurringOngoingRenewalCloseoutData = await loadOr({}, () => api("/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-closeouts"));
        setPilotNextRecurringOngoingRenewalCloseouts(nextRecurringOngoingRenewalCloseoutData.packets || []);
        if (["Owner", "Admin", "Accountant", "Auditor"].includes(data.user.role)) {
          const accountantReviewData = await loadOr({}, () => api("/api/pilots/clinic-wellness/accountant-reviews"));
          setPilotAccountantReviews(accountantReviewData.reviews || []);
        } else {
          setPilotAccountantReviews([]);
        }
      } else {
        setPilotTemplateData(null);
        setPilotOwnerBriefs([]);
        setPilotOperatorWorkbenches([]);
        setPilotAccountantReviews([]);
        setPilotLaunchReadinessPackets([]);
        setPilotLaunchRemediationPlans([]);
        setPilotRemediationResolutions([]);
        setPilotLaunchClearancePackets([]);
        setPilotPaidOffers([]);
        setPilotQuoteHandoffs([]);
        setPilotQuoteReleases([]);
        setPilotQuoteAcceptanceHandoffs([]);
        setPilotHayhashvapahDrafts([]);
        setPilotOfficialInvoices([]);
        setPilotPaymentCollections([]);
        setPilotCloseouts([]);
        setPilotRenewalQuoteHandoffs([]);
        setPilotRenewalQuoteReleases([]);
        setPilotRenewalAcceptanceHandoffs([]);
        setPilotRenewalHayhashvapahDrafts([]);
        setPilotRenewalOfficialInvoices([]);
        setPilotRenewalPaymentCollections([]);
        setPilotRenewalCloseouts([]);
        setPilotNextRenewalQuoteHandoffs([]);
        setPilotNextRenewalQuoteReleases([]);
        setPilotNextRenewalAcceptanceHandoffs([]);
        setPilotNextRenewalHayhashvapahDrafts([]);
        setPilotNextRenewalOfficialInvoices([]);
        setPilotNextRenewalPaymentCollections([]);
        setPilotNextRenewalCloseouts([]);
        setPilotFollowingRenewalQuoteHandoffs([]);
        setPilotFollowingRenewalQuoteReleases([]);
        setPilotFollowingRenewalAcceptanceHandoffs([]);
        setPilotFollowingRenewalHayhashvapahDrafts([]);
        setPilotFollowingRenewalOfficialInvoices([]);
        setPilotFollowingRenewalPaymentCollections([]);
        setPilotFollowingRenewalCloseouts([]);
        setPilotSubsequentRenewalQuoteHandoffs([]);
        setPilotSubsequentRenewalQuoteReleases([]);
        setPilotSubsequentRenewalAcceptanceHandoffs([]);
        setPilotSubsequentRenewalHayhashvapahDrafts([]);
        setPilotSubsequentRenewalOfficialInvoices([]);
        setPilotSubsequentRenewalPaymentCollections([]);
        setPilotSubsequentRenewalCloseouts([]);
        setPilotContinuationRenewalQuoteHandoffs([]);
        setPilotContinuationRenewalQuoteReleases([]);
        setPilotContinuationRenewalAcceptanceHandoffs([]);
        setPilotContinuationRenewalHayhashvapahDrafts([]);
        setPilotContinuationRenewalOfficialInvoices([]);
        setPilotContinuationRenewalPaymentCollections([]);
        setPilotContinuationRenewalCloseouts([]);
        setPilotOngoingRenewalQuoteHandoffs([]);
        setPilotOngoingRenewalQuoteReleases([]);
        setPilotOngoingRenewalAcceptanceHandoffs([]);
        setPilotOngoingRenewalHayhashvapahDrafts([]);
        setPilotOngoingRenewalOfficialInvoices([]);
        setPilotOngoingRenewalPaymentCollections([]);
        setPilotOngoingRenewalCloseouts([]);
        setPilotNextOngoingRenewalQuoteHandoffs([]);
        setPilotNextOngoingRenewalQuoteReleases([]);
        setPilotNextOngoingRenewalAcceptanceHandoffs([]);
        setPilotNextOngoingRenewalHayhashvapahDrafts([]);
        setPilotNextOngoingRenewalOfficialInvoices([]);
        setPilotNextOngoingRenewalPaymentCollections([]);
        setPilotNextOngoingRenewalCloseouts([]);
        setPilotFollowingOngoingRenewalQuoteHandoffs([]);
        setPilotFollowingOngoingRenewalQuoteReleases([]);
        setPilotFollowingOngoingRenewalAcceptanceHandoffs([]);
        setPilotFollowingOngoingRenewalHayhashvapahDrafts([]);
        setPilotFollowingOngoingRenewalOfficialInvoices([]);
        setPilotFollowingOngoingRenewalPaymentCollections([]);
        setPilotFollowingOngoingRenewalCloseouts([]);
        setPilotSubsequentOngoingRenewalQuoteHandoffs([]);
        setPilotSubsequentOngoingRenewalQuoteReleases([]);
        setPilotSubsequentOngoingRenewalAcceptanceHandoffs([]);
        setPilotSubsequentOngoingRenewalHayhashvapahDrafts([]);
        setPilotSubsequentOngoingRenewalOfficialInvoices([]);
        setPilotSubsequentOngoingRenewalPaymentCollections([]);
        setPilotSubsequentOngoingRenewalCloseouts([]);
        setPilotNextRecurringOngoingRenewalQuoteHandoffs([]);
        setPilotNextRecurringOngoingRenewalQuoteReleases([]);
        setPilotNextRecurringOngoingRenewalAcceptanceHandoffs([]);
        setPilotNextRecurringOngoingRenewalHayhashvapahDrafts([]);
        setPilotNextRecurringOngoingRenewalOfficialInvoices([]);
        setPilotNextRecurringOngoingRenewalPaymentCollections([]);
        setPilotNextRecurringOngoingRenewalCloseouts([]);
      }
      if (data.user.role === "Owner") {
        const webhookData = await loadOr({}, () => api("/api/integrations/webhook-deliveries"));
        setWebhookDeliveries(webhookData.deliveries || []);
        const backupData = await loadOr({}, () => api("/api/admin/backups"));
        setAdminBackups(backupData.backups || []);
      } else {
        setWebhookDeliveries([]);
        setAdminBackups([]);
      }
      const auditData = await loadOr({}, () => loadAuditForRole(data.user.role, () => api("/api/audit")));
      setAudit(auditData.events || []);
    } catch (error) {
      if (error.status === 401) {
        setSession(null);
        setSuite(null);
        setSecurityMfa(null);
        setRoleDashboard(null);
        setServiceConsole(null);
        setCrmLeadData(null);
        setCrmForecastData(null);
        setCrmQuotes(null);
        setCrmActivities(null);
        setInventory(null);
        setPurchase(null);
        setCampaignPerformance(null);
        setReceivablesAging(null);
        setSemanticMetrics(null);
        setSemanticSnapshots(null);
        setAnalyticsReports([]);
        setAdminSessions(null);
        setAdminAuditExports([]);
        setIntegrationConnectors([]);
        setPilotTemplateData(null);
        setPilotOwnerBriefs([]);
        setPilotOperatorWorkbenches([]);
        setPilotAccountantReviews([]);
        setPilotLaunchReadinessPackets([]);
        setPilotLaunchRemediationPlans([]);
        setPilotRemediationResolutions([]);
        setPilotLaunchClearancePackets([]);
        setPilotPaidOffers([]);
        setPilotQuoteHandoffs([]);
        setPilotQuoteReleases([]);
        setPilotQuoteAcceptanceHandoffs([]);
        setPilotHayhashvapahDrafts([]);
        setPilotOfficialInvoices([]);
        setPilotPaymentCollections([]);
        setPilotCloseouts([]);
        setPilotRenewalQuoteHandoffs([]);
        setPilotRenewalQuoteReleases([]);
        setPilotRenewalAcceptanceHandoffs([]);
        setPilotRenewalHayhashvapahDrafts([]);
        setPilotRenewalOfficialInvoices([]);
        setPilotRenewalPaymentCollections([]);
        setPilotRenewalCloseouts([]);
        setPilotNextRenewalQuoteHandoffs([]);
        setPilotNextRenewalQuoteReleases([]);
        setPilotNextRenewalAcceptanceHandoffs([]);
        setPilotNextRenewalHayhashvapahDrafts([]);
        setPilotNextRenewalOfficialInvoices([]);
        setPilotNextRenewalPaymentCollections([]);
        setPilotNextRenewalCloseouts([]);
        setPilotFollowingRenewalQuoteHandoffs([]);
        setPilotFollowingRenewalQuoteReleases([]);
        setPilotFollowingRenewalAcceptanceHandoffs([]);
        setPilotFollowingRenewalHayhashvapahDrafts([]);
        setPilotFollowingRenewalOfficialInvoices([]);
        setPilotFollowingRenewalPaymentCollections([]);
        setPilotFollowingRenewalCloseouts([]);
        setPilotSubsequentRenewalQuoteHandoffs([]);
        setPilotSubsequentRenewalQuoteReleases([]);
        setPilotSubsequentRenewalAcceptanceHandoffs([]);
        setPilotSubsequentRenewalHayhashvapahDrafts([]);
        setPilotSubsequentRenewalOfficialInvoices([]);
        setPilotSubsequentRenewalPaymentCollections([]);
        setPilotSubsequentRenewalCloseouts([]);
        setPilotContinuationRenewalQuoteHandoffs([]);
        setPilotContinuationRenewalQuoteReleases([]);
        setPilotContinuationRenewalAcceptanceHandoffs([]);
        setPilotContinuationRenewalHayhashvapahDrafts([]);
        setPilotContinuationRenewalOfficialInvoices([]);
        setPilotContinuationRenewalPaymentCollections([]);
        setPilotContinuationRenewalCloseouts([]);
        setPilotOngoingRenewalQuoteHandoffs([]);
        setPilotOngoingRenewalQuoteReleases([]);
        setPilotOngoingRenewalAcceptanceHandoffs([]);
        setPilotOngoingRenewalHayhashvapahDrafts([]);
        setPilotOngoingRenewalOfficialInvoices([]);
        setPilotOngoingRenewalPaymentCollections([]);
        setPilotOngoingRenewalCloseouts([]);
        setPilotNextOngoingRenewalQuoteHandoffs([]);
        setPilotNextOngoingRenewalQuoteReleases([]);
        setPilotNextOngoingRenewalAcceptanceHandoffs([]);
        setPilotNextOngoingRenewalHayhashvapahDrafts([]);
        setPilotNextOngoingRenewalOfficialInvoices([]);
        setPilotNextOngoingRenewalPaymentCollections([]);
        setPilotNextOngoingRenewalCloseouts([]);
        setPilotFollowingOngoingRenewalQuoteHandoffs([]);
        setPilotFollowingOngoingRenewalQuoteReleases([]);
        setPilotFollowingOngoingRenewalAcceptanceHandoffs([]);
        setPilotFollowingOngoingRenewalHayhashvapahDrafts([]);
        setPilotFollowingOngoingRenewalOfficialInvoices([]);
        setPilotFollowingOngoingRenewalPaymentCollections([]);
        setPilotFollowingOngoingRenewalCloseouts([]);
        setPilotSubsequentOngoingRenewalQuoteHandoffs([]);
        setPilotSubsequentOngoingRenewalQuoteReleases([]);
        setPilotSubsequentOngoingRenewalAcceptanceHandoffs([]);
        setPilotSubsequentOngoingRenewalHayhashvapahDrafts([]);
        setPilotSubsequentOngoingRenewalOfficialInvoices([]);
        setPilotSubsequentOngoingRenewalPaymentCollections([]);
        setPilotSubsequentOngoingRenewalCloseouts([]);
        setPilotNextRecurringOngoingRenewalQuoteHandoffs([]);
        setPilotNextRecurringOngoingRenewalQuoteReleases([]);
        setPilotNextRecurringOngoingRenewalAcceptanceHandoffs([]);
        setPilotNextRecurringOngoingRenewalHayhashvapahDrafts([]);
        setPilotNextRecurringOngoingRenewalOfficialInvoices([]);
        setPilotNextRecurringOngoingRenewalPaymentCollections([]);
        setPilotNextRecurringOngoingRenewalCloseouts([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="boot">A1 Suite</div>;
  if (!session || !suite) return <Login onDone={load} />;

  // Pilot pipeline datasets, bundled into one prop to avoid ~86-way prop drilling.
  const pilot = {
    pilotTemplateData,
    pilotOwnerBriefs,
    pilotOperatorWorkbenches,
    pilotAccountantReviews,
    pilotLaunchReadinessPackets,
    pilotLaunchRemediationPlans,
    pilotRemediationResolutions,
    pilotLaunchClearancePackets,
    pilotPaidOffers,
    pilotQuoteHandoffs,
    pilotQuoteReleases,
    pilotQuoteAcceptanceHandoffs,
    pilotHayhashvapahDrafts,
    pilotOfficialInvoices,
    pilotPaymentCollections,
    pilotCloseouts,
    pilotRenewalQuoteHandoffs,
    pilotRenewalQuoteReleases,
    pilotRenewalAcceptanceHandoffs,
    pilotRenewalHayhashvapahDrafts,
    pilotRenewalOfficialInvoices,
    pilotRenewalPaymentCollections,
    pilotRenewalCloseouts,
    pilotNextRenewalQuoteHandoffs,
    pilotNextRenewalQuoteReleases,
    pilotNextRenewalAcceptanceHandoffs,
    pilotNextRenewalHayhashvapahDrafts,
    pilotNextRenewalOfficialInvoices,
    pilotNextRenewalPaymentCollections,
    pilotNextRenewalCloseouts,
    pilotFollowingRenewalQuoteHandoffs,
    pilotFollowingRenewalQuoteReleases,
    pilotFollowingRenewalAcceptanceHandoffs,
    pilotFollowingRenewalHayhashvapahDrafts,
    pilotFollowingRenewalOfficialInvoices,
    pilotFollowingRenewalPaymentCollections,
    pilotFollowingRenewalCloseouts,
    pilotSubsequentRenewalQuoteHandoffs,
    pilotSubsequentRenewalQuoteReleases,
    pilotSubsequentRenewalAcceptanceHandoffs,
    pilotSubsequentRenewalHayhashvapahDrafts,
    pilotSubsequentRenewalOfficialInvoices,
    pilotSubsequentRenewalPaymentCollections,
    pilotSubsequentRenewalCloseouts,
    pilotContinuationRenewalQuoteHandoffs,
    pilotContinuationRenewalQuoteReleases,
    pilotContinuationRenewalAcceptanceHandoffs,
    pilotContinuationRenewalHayhashvapahDrafts,
    pilotContinuationRenewalOfficialInvoices,
    pilotContinuationRenewalPaymentCollections,
    pilotContinuationRenewalCloseouts,
    pilotOngoingRenewalQuoteHandoffs,
    pilotOngoingRenewalQuoteReleases,
    pilotOngoingRenewalAcceptanceHandoffs,
    pilotOngoingRenewalHayhashvapahDrafts,
    pilotOngoingRenewalOfficialInvoices,
    pilotOngoingRenewalPaymentCollections,
    pilotOngoingRenewalCloseouts,
    pilotNextOngoingRenewalQuoteHandoffs,
    pilotNextOngoingRenewalQuoteReleases,
    pilotNextOngoingRenewalAcceptanceHandoffs,
    pilotNextOngoingRenewalHayhashvapahDrafts,
    pilotNextOngoingRenewalOfficialInvoices,
    pilotNextOngoingRenewalPaymentCollections,
    pilotNextOngoingRenewalCloseouts,
    pilotFollowingOngoingRenewalQuoteHandoffs,
    pilotFollowingOngoingRenewalQuoteReleases,
    pilotFollowingOngoingRenewalAcceptanceHandoffs,
    pilotFollowingOngoingRenewalHayhashvapahDrafts,
    pilotFollowingOngoingRenewalOfficialInvoices,
    pilotFollowingOngoingRenewalPaymentCollections,
    pilotFollowingOngoingRenewalCloseouts,
    pilotSubsequentOngoingRenewalQuoteHandoffs,
    pilotSubsequentOngoingRenewalQuoteReleases,
    pilotSubsequentOngoingRenewalAcceptanceHandoffs,
    pilotSubsequentOngoingRenewalHayhashvapahDrafts,
    pilotSubsequentOngoingRenewalOfficialInvoices,
    pilotSubsequentOngoingRenewalPaymentCollections,
    pilotSubsequentOngoingRenewalCloseouts,
    pilotNextRecurringOngoingRenewalQuoteHandoffs,
    pilotNextRecurringOngoingRenewalQuoteReleases,
    pilotNextRecurringOngoingRenewalAcceptanceHandoffs,
    pilotNextRecurringOngoingRenewalHayhashvapahDrafts,
    pilotNextRecurringOngoingRenewalOfficialInvoices,
    pilotNextRecurringOngoingRenewalPaymentCollections,
    pilotNextRecurringOngoingRenewalCloseouts,
  };

  return (
    <Workspace
      suite={suite}
      audit={audit}
      customer360={customer360}
      serviceConsole={serviceConsole}
      securityMfa={securityMfa}
      roleDashboard={roleDashboard}
      crmLeadData={crmLeadData}
      crmForecastData={crmForecastData}
      crmQuotes={crmQuotes}
      crmActivities={crmActivities}
      campaignPerformance={campaignPerformance}
      receivablesAging={receivablesAging}
      finance={finance}
      people={people}
      docs={docs}
      projects={projects}
      inventory={inventory}
      purchase={purchase}
      forms={forms}
      semanticMetrics={semanticMetrics}
      semanticSnapshots={semanticSnapshots}
      analyticsReports={analyticsReports}
      webhookDeliveries={webhookDeliveries}
      integrationConnectors={integrationConnectors}
      pilot={pilot}
      adminBackups={adminBackups}
      adminAccessReviews={adminAccessReviews}
      adminSessions={adminSessions}
      adminAuditExports={adminAuditExports}
      productionReadiness={productionReadiness}
      selectedApp={selectedApp}
      onSelectApp={selectApp}
      onSuiteEvents={events => setSuite(current => current ? { ...current, events } : current)}
      onAuditEvents={setAudit}
      onReload={load}
    />
  );
}

function Login({ onDone }) {
  const [email, setEmail] = useState("owner@armosphera.local");
  const [password, setPassword] = useState("change-me-now");
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (mfaChallenge) {
        await api("/api/login/mfa", { method: "POST", body: { challengeId: mfaChallenge.challengeId, code: mfaCode } });
        onDone();
        return;
      }
      const result = await api("/api/login", { method: "POST", body: { email, password } });
      if (result.mfaRequired) {
        setMfaChallenge(result);
        setMfaCode("");
        return;
      }
      onDone();
    } catch {
      setError("Մուտքը չհաջողվեց");
    }
  }

  return (
    <main className="login">
      <section className="login-panel">
        <div className="brand-lockup">
          <img className="brand-logo" src="/a1-suite.svg" alt="A1 Suite" style={{ height: "40px", width: "auto", display: "block" }} />
          <div>
            <strong>A1 Suite</strong>
            <span>Հայաստանի բիզնես օպերացիոն համակարգ</span>
          </div>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>
            Էլ. փոստ
            <input value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Գաղտնաբառ
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" />
          </label>
          {mfaChallenge && (
            <label>
              MFA code
              <input value={mfaCode} onChange={e => setMfaCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <button className="primary" type="submit">{mfaChallenge ? "Verify MFA" : "Մուտք գործել"}</button>
        </form>
      </section>
    </main>
  );
}

function Workspace({ suite, audit, customer360, serviceConsole, securityMfa, roleDashboard, crmLeadData, crmForecastData, crmQuotes, crmActivities, campaignPerformance, receivablesAging, finance, people, docs, projects, inventory, purchase, forms, semanticMetrics, semanticSnapshots, analyticsReports, webhookDeliveries, integrationConnectors, pilot, adminBackups, adminAccessReviews, adminSessions, adminAuditExports, productionReadiness, selectedApp, onSelectApp, onSuiteEvents, onAuditEvents, onReload }) {
  const {
    pilotTemplateData,
    pilotOwnerBriefs,
    pilotOperatorWorkbenches,
    pilotAccountantReviews,
    pilotLaunchReadinessPackets,
    pilotLaunchRemediationPlans,
    pilotRemediationResolutions,
    pilotLaunchClearancePackets,
    pilotPaidOffers,
    pilotQuoteHandoffs,
    pilotQuoteReleases,
    pilotQuoteAcceptanceHandoffs,
    pilotHayhashvapahDrafts,
    pilotOfficialInvoices,
    pilotPaymentCollections,
    pilotCloseouts,
    pilotRenewalQuoteHandoffs,
    pilotRenewalQuoteReleases,
    pilotRenewalAcceptanceHandoffs,
    pilotRenewalHayhashvapahDrafts,
    pilotRenewalOfficialInvoices,
    pilotRenewalPaymentCollections,
    pilotRenewalCloseouts,
    pilotNextRenewalQuoteHandoffs,
    pilotNextRenewalQuoteReleases,
    pilotNextRenewalAcceptanceHandoffs,
    pilotNextRenewalHayhashvapahDrafts,
    pilotNextRenewalOfficialInvoices,
    pilotNextRenewalPaymentCollections,
    pilotNextRenewalCloseouts,
    pilotFollowingRenewalQuoteHandoffs,
    pilotFollowingRenewalQuoteReleases,
    pilotFollowingRenewalAcceptanceHandoffs,
    pilotFollowingRenewalHayhashvapahDrafts,
    pilotFollowingRenewalOfficialInvoices,
    pilotFollowingRenewalPaymentCollections,
    pilotFollowingRenewalCloseouts,
    pilotSubsequentRenewalQuoteHandoffs,
    pilotSubsequentRenewalQuoteReleases,
    pilotSubsequentRenewalAcceptanceHandoffs,
    pilotSubsequentRenewalHayhashvapahDrafts,
    pilotSubsequentRenewalOfficialInvoices,
    pilotSubsequentRenewalPaymentCollections,
    pilotSubsequentRenewalCloseouts,
    pilotContinuationRenewalQuoteHandoffs,
    pilotContinuationRenewalQuoteReleases,
    pilotContinuationRenewalAcceptanceHandoffs,
    pilotContinuationRenewalHayhashvapahDrafts,
    pilotContinuationRenewalOfficialInvoices,
    pilotContinuationRenewalPaymentCollections,
    pilotContinuationRenewalCloseouts,
    pilotOngoingRenewalQuoteHandoffs,
    pilotOngoingRenewalQuoteReleases,
    pilotOngoingRenewalAcceptanceHandoffs,
    pilotOngoingRenewalHayhashvapahDrafts,
    pilotOngoingRenewalOfficialInvoices,
    pilotOngoingRenewalPaymentCollections,
    pilotOngoingRenewalCloseouts,
    pilotNextOngoingRenewalQuoteHandoffs,
    pilotNextOngoingRenewalQuoteReleases,
    pilotNextOngoingRenewalAcceptanceHandoffs,
    pilotNextOngoingRenewalHayhashvapahDrafts,
    pilotNextOngoingRenewalOfficialInvoices,
    pilotNextOngoingRenewalPaymentCollections,
    pilotNextOngoingRenewalCloseouts,
    pilotFollowingOngoingRenewalQuoteHandoffs,
    pilotFollowingOngoingRenewalQuoteReleases,
    pilotFollowingOngoingRenewalAcceptanceHandoffs,
    pilotFollowingOngoingRenewalHayhashvapahDrafts,
    pilotFollowingOngoingRenewalOfficialInvoices,
    pilotFollowingOngoingRenewalPaymentCollections,
    pilotFollowingOngoingRenewalCloseouts,
    pilotSubsequentOngoingRenewalQuoteHandoffs,
    pilotSubsequentOngoingRenewalQuoteReleases,
    pilotSubsequentOngoingRenewalAcceptanceHandoffs,
    pilotSubsequentOngoingRenewalHayhashvapahDrafts,
    pilotSubsequentOngoingRenewalOfficialInvoices,
    pilotSubsequentOngoingRenewalPaymentCollections,
    pilotSubsequentOngoingRenewalCloseouts,
    pilotNextRecurringOngoingRenewalQuoteHandoffs,
    pilotNextRecurringOngoingRenewalQuoteReleases,
    pilotNextRecurringOngoingRenewalAcceptanceHandoffs,
    pilotNextRecurringOngoingRenewalHayhashvapahDrafts,
    pilotNextRecurringOngoingRenewalOfficialInvoices,
    pilotNextRecurringOngoingRenewalPaymentCollections,
    pilotNextRecurringOngoingRenewalCloseouts,
  } = pilot;
  const assignedAppIds = useMemo(() => normalizeSuiteAppIds(suite.apps.map(app => app.id)), [suite.apps]);
  const selected = useMemo(() => (
    suite.apps.find(app => normalizeSuiteAppId(app.id, assignedAppIds) === selectedApp) || suite.apps[0]
  ), [suite.apps, assignedAppIds, selectedApp]);
  const selectedAppId = normalizeSuiteAppId(selected?.id || "", assignedAppIds);
  const canUseCopilot = assignedAppIds.includes("copilot");
  function openApp(appId) {
    const nextAppId = normalizeSuiteAppId(appId, assignedAppIds);
    onSelectApp(nextAppId);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`suite-app-${nextAppId}`) || document.querySelector(".workspace");
      target?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }
  const [actionState, setActionState] = useState("");
  // Shared sink for failed mutations: any handler's catch can push the server's error message
  // here, and the workspace renders ONE dismissable banner — so a failed create/bill/sign/run
  // is never silently swallowed. (Read-only loadOr fetches still degrade to empty panels.)
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    if (!selectedAppId || window.location.pathname !== appRoute(selectedAppId)) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`suite-app-${selectedAppId}`)?.scrollIntoView({ block: "start" });
    });
  }, [selectedAppId]);
  function reportActionError(err) {
    const message = (err && err.message) ? String(err.message) : "Գործողությունը չհաջողվեց";
    setActionError(message);
  }
  const [restoreProof, setRestoreProof] = useState(null);
  const [createdBackup, setCreatedBackup] = useState(null);
  const [createdAccessReview, setCreatedAccessReview] = useState(null);
  const [createdAuditExport, setCreatedAuditExport] = useState(null);
  const [createdPilotInstall, setCreatedPilotInstall] = useState(null);
  const [createdPilotBrief, setCreatedPilotBrief] = useState(null);
  const [createdPilotWorkbench, setCreatedPilotWorkbench] = useState(null);
  const [createdPilotAccountantReview, setCreatedPilotAccountantReview] = useState(null);
  const [createdPilotLaunchReadiness, setCreatedPilotLaunchReadiness] = useState(null);
  const [createdPilotRemediationPlan, setCreatedPilotRemediationPlan] = useState(null);
  const [createdPilotResolution, setCreatedPilotResolution] = useState(null);
  const [createdPilotClearance, setCreatedPilotClearance] = useState(null);
  const [createdPilotPaidOffer, setCreatedPilotPaidOffer] = useState(null);
  const [createdPilotQuoteHandoff, setCreatedPilotQuoteHandoff] = useState(null);
  const [createdPilotQuoteRelease, setCreatedPilotQuoteRelease] = useState(null);
  const [createdPilotAcceptanceHandoff, setCreatedPilotAcceptanceHandoff] = useState(null);
  const [createdPilotHayhashvapahDraft, setCreatedPilotHayhashvapahDraft] = useState(null);
  const [createdPilotOfficialInvoice, setCreatedPilotOfficialInvoice] = useState(null);
  const [createdPilotPaymentCollection, setCreatedPilotPaymentCollection] = useState(null);
  const [createdPilotCloseout, setCreatedPilotCloseout] = useState(null);
  const [createdPilotRenewalQuote, setCreatedPilotRenewalQuote] = useState(null);
  const [createdPilotRenewalQuoteRelease, setCreatedPilotRenewalQuoteRelease] = useState(null);
  const [createdPilotRenewalAcceptanceHandoff, setCreatedPilotRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotRenewalHayhashvapahDraft, setCreatedPilotRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotRenewalOfficialInvoice, setCreatedPilotRenewalOfficialInvoice] = useState(null);
  const [createdPilotRenewalPaymentCollection, setCreatedPilotRenewalPaymentCollection] = useState(null);
  const [createdPilotRenewalCloseout, setCreatedPilotRenewalCloseout] = useState(null);
  const [createdPilotNextRenewalQuote, setCreatedPilotNextRenewalQuote] = useState(null);
  const [createdPilotNextRenewalQuoteRelease, setCreatedPilotNextRenewalQuoteRelease] = useState(null);
  const [createdPilotNextRenewalAcceptanceHandoff, setCreatedPilotNextRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotNextRenewalHayhashvapahDraft, setCreatedPilotNextRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotNextRenewalOfficialInvoice, setCreatedPilotNextRenewalOfficialInvoice] = useState(null);
  const [createdPilotNextRenewalPaymentCollection, setCreatedPilotNextRenewalPaymentCollection] = useState(null);
  const [createdPilotNextRenewalCloseout, setCreatedPilotNextRenewalCloseout] = useState(null);
  const [createdPilotFollowingRenewalQuote, setCreatedPilotFollowingRenewalQuote] = useState(null);
  const [createdPilotFollowingRenewalQuoteRelease, setCreatedPilotFollowingRenewalQuoteRelease] = useState(null);
  const [createdPilotFollowingRenewalAcceptanceHandoff, setCreatedPilotFollowingRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotFollowingRenewalHayhashvapahDraft, setCreatedPilotFollowingRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotFollowingRenewalOfficialInvoice, setCreatedPilotFollowingRenewalOfficialInvoice] = useState(null);
  const [createdPilotFollowingRenewalPaymentCollection, setCreatedPilotFollowingRenewalPaymentCollection] = useState(null);
  const [createdPilotFollowingRenewalCloseout, setCreatedPilotFollowingRenewalCloseout] = useState(null);
  const [createdPilotSubsequentRenewalQuote, setCreatedPilotSubsequentRenewalQuote] = useState(null);
  const [createdPilotSubsequentRenewalQuoteRelease, setCreatedPilotSubsequentRenewalQuoteRelease] = useState(null);
  const [createdPilotSubsequentRenewalAcceptanceHandoff, setCreatedPilotSubsequentRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotSubsequentRenewalHayhashvapahDraft, setCreatedPilotSubsequentRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotSubsequentRenewalOfficialInvoice, setCreatedPilotSubsequentRenewalOfficialInvoice] = useState(null);
  const [createdPilotSubsequentRenewalPaymentCollection, setCreatedPilotSubsequentRenewalPaymentCollection] = useState(null);
  const [createdPilotSubsequentRenewalCloseout, setCreatedPilotSubsequentRenewalCloseout] = useState(null);
  const [createdPilotContinuationRenewalQuote, setCreatedPilotContinuationRenewalQuote] = useState(null);
  const [createdPilotContinuationRenewalQuoteRelease, setCreatedPilotContinuationRenewalQuoteRelease] = useState(null);
  const [createdPilotContinuationRenewalAcceptanceHandoff, setCreatedPilotContinuationRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotContinuationRenewalHayhashvapahDraft, setCreatedPilotContinuationRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotContinuationRenewalOfficialInvoice, setCreatedPilotContinuationRenewalOfficialInvoice] = useState(null);
  const [createdPilotContinuationRenewalPaymentCollection, setCreatedPilotContinuationRenewalPaymentCollection] = useState(null);
  const [createdPilotContinuationRenewalCloseout, setCreatedPilotContinuationRenewalCloseout] = useState(null);
  const [createdPilotOngoingRenewalQuote, setCreatedPilotOngoingRenewalQuote] = useState(null);
  const [createdPilotOngoingRenewalQuoteRelease, setCreatedPilotOngoingRenewalQuoteRelease] = useState(null);
  const [createdPilotOngoingRenewalAcceptanceHandoff, setCreatedPilotOngoingRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotOngoingRenewalHayhashvapahDraft, setCreatedPilotOngoingRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotOngoingRenewalOfficialInvoice, setCreatedPilotOngoingRenewalOfficialInvoice] = useState(null);
  const [createdPilotOngoingRenewalPaymentCollection, setCreatedPilotOngoingRenewalPaymentCollection] = useState(null);
  const [createdPilotOngoingRenewalCloseout, setCreatedPilotOngoingRenewalCloseout] = useState(null);
  const [createdPilotNextOngoingRenewalQuote, setCreatedPilotNextOngoingRenewalQuote] = useState(null);
  const [createdPilotNextOngoingRenewalQuoteRelease, setCreatedPilotNextOngoingRenewalQuoteRelease] = useState(null);
  const [createdPilotNextOngoingRenewalAcceptanceHandoff, setCreatedPilotNextOngoingRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotNextOngoingRenewalHayhashvapahDraft, setCreatedPilotNextOngoingRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotNextOngoingRenewalOfficialInvoice, setCreatedPilotNextOngoingRenewalOfficialInvoice] = useState(null);
  const [createdPilotNextOngoingRenewalPaymentCollection, setCreatedPilotNextOngoingRenewalPaymentCollection] = useState(null);
  const [createdPilotNextOngoingRenewalCloseout, setCreatedPilotNextOngoingRenewalCloseout] = useState(null);
  const [createdPilotFollowingOngoingRenewalQuote, setCreatedPilotFollowingOngoingRenewalQuote] = useState(null);
  const [createdPilotFollowingOngoingRenewalQuoteRelease, setCreatedPilotFollowingOngoingRenewalQuoteRelease] = useState(null);
  const [createdPilotFollowingOngoingRenewalAcceptanceHandoff, setCreatedPilotFollowingOngoingRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotFollowingOngoingRenewalHayhashvapahDraft, setCreatedPilotFollowingOngoingRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotFollowingOngoingRenewalOfficialInvoice, setCreatedPilotFollowingOngoingRenewalOfficialInvoice] = useState(null);
  const [createdPilotFollowingOngoingRenewalPaymentCollection, setCreatedPilotFollowingOngoingRenewalPaymentCollection] = useState(null);
  const [createdPilotFollowingOngoingRenewalCloseout, setCreatedPilotFollowingOngoingRenewalCloseout] = useState(null);
  const [createdPilotSubsequentOngoingRenewalQuote, setCreatedPilotSubsequentOngoingRenewalQuote] = useState(null);
  const [createdPilotSubsequentOngoingRenewalQuoteRelease, setCreatedPilotSubsequentOngoingRenewalQuoteRelease] = useState(null);
  const [createdPilotSubsequentOngoingRenewalAcceptanceHandoff, setCreatedPilotSubsequentOngoingRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotSubsequentOngoingRenewalHayhashvapahDraft, setCreatedPilotSubsequentOngoingRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotSubsequentOngoingRenewalOfficialInvoice, setCreatedPilotSubsequentOngoingRenewalOfficialInvoice] = useState(null);
  const [createdPilotSubsequentOngoingRenewalPaymentCollection, setCreatedPilotSubsequentOngoingRenewalPaymentCollection] = useState(null);
  const [createdPilotSubsequentOngoingRenewalCloseout, setCreatedPilotSubsequentOngoingRenewalCloseout] = useState(null);
  const [createdPilotNextRecurringOngoingRenewalQuote, setCreatedPilotNextRecurringOngoingRenewalQuote] = useState(null);
  const [createdPilotNextRecurringOngoingRenewalRelease, setCreatedPilotNextRecurringOngoingRenewalRelease] = useState(null);
  const [createdPilotNextRecurringOngoingRenewalAcceptanceHandoff, setCreatedPilotNextRecurringOngoingRenewalAcceptanceHandoff] = useState(null);
  const [createdPilotNextRecurringOngoingRenewalHayhashvapahDraft, setCreatedPilotNextRecurringOngoingRenewalHayhashvapahDraft] = useState(null);
  const [createdPilotNextRecurringOngoingRenewalOfficialInvoice, setCreatedPilotNextRecurringOngoingRenewalOfficialInvoice] = useState(null);
  const [createdPilotNextRecurringOngoingRenewalPaymentCollection, setCreatedPilotNextRecurringOngoingRenewalPaymentCollection] = useState(null);
  const [createdPilotNextRecurringOngoingRenewalCloseout, setCreatedPilotNextRecurringOngoingRenewalCloseout] = useState(null);
  const [createdQuote, setCreatedQuote] = useState(null);
  const [quoteApproval, setQuoteApproval] = useState(null);
  const [mfaSetup, setMfaSetup] = useState(null);

  async function approveAndExecute(approval) {
    setActionState(`running:${approval.id}`);
    try {
      if (approval.status === "pending") {
        await api(`/api/workflow/approvals/${approval.id}/decision`, {
          method: "POST",
          body: { decision: "approved", note: "Approved from A1 Suite workspace" }
        });
      }
      await api(`/api/workflow/approvals/${approval.id}/execute`, { method: "POST" });
      setActionState(`done:${approval.id}`);
      onReload();
    } catch (error) {
      setActionState(`error:${approval.id}`);
    }
  }

  async function askLegalGuidance(customerId) {
    setActionState("legal:running");
    try {
      await api("/api/legal/questions", {
        method: "POST",
        body: {
          customerId,
          topic: "vat",
          question: "Can we send VAT wording for procurement approval before posting the HayHashvapah invoice?"
        }
      });
      setActionState("legal:done");
      onReload();
    } catch {
      setActionState("legal:error");
    }
  }

  async function askCopilot(payload) {
    setActionState("copilot:ask");
    setActionError("");
    try {
      const data = await api("/api/copilot/questions", { method: "POST", body: payload });
      if (data.events) {
        onSuiteEvents?.(data.events);
      }
      const auditData = await loadOr({}, () => loadAuditForRole(suite.user.role, () => api("/api/audit")));
      onAuditEvents?.(auditData.events || []);
      return data.copilot;
    } catch (err) {
      reportActionError(err);
      throw err;
    } finally {
      setActionState("");
    }
  }

  async function generateCustomerBrief(customerId) {
    setActionState(`ai-brief:${customerId}`);
    try {
      await api("/api/ai/customer-briefs", {
        method: "POST",
        body: {
          customerId,
          prompt: "Generate owner-safe Customer 360 brief for the next Armenian SMB follow-up."
        }
      });
      setActionState(`ai-brief:done:${customerId}`);
      onReload();
    } catch {
      setActionState(`ai-brief:error:${customerId}`);
    }
  }

  async function recordPaymentPromise(task, invoice) {
    setActionState(`promise:${task.id}`);
    try {
      await api(`/api/crm/tasks/${task.id}/payment-promise`, {
        method: "POST",
        body: {
          promisedAmount: invoice?.total || 0,
          promisedOn: "2026-05-30",
          reminderChannel: "WhatsApp",
          note: "Customer confirmed payment promise from Customer 360"
        }
      });
      setActionState(`promise:done:${task.id}`);
      onReload();
    } catch {
      setActionState(`promise:error:${task.id}`);
    }
  }

  async function sendCollectionReminder(promise) {
    setActionState(`reminder:${promise.id}`);
    try {
      await api(`/api/crm/collection-promises/${promise.id}/send-reminder`, {
        method: "POST",
        body: { provider: "WhatsApp Business Sandbox" }
      });
      setActionState(`reminder:done:${promise.id}`);
      onReload();
    } catch {
      setActionState(`reminder:error:${promise.id}`);
    }
  }

  async function recordCollectionPayment(promise) {
    setActionState(`payment:${promise.id}`);
    try {
      await api(`/api/finance/invoices/${promise.invoiceId}/payments`, {
        method: "POST",
        body: {
          amount: promise.promisedAmount,
          paidAt: "2026-05-31",
          method: "bank-transfer",
          reference: `A1-COLLECT-${promise.invoiceNumber}`
        }
      });
      setActionState(`payment:done:${promise.id}`);
      onReload();
    } catch {
      setActionState(`payment:error:${promise.id}`);
    }
  }

  async function importBankTransaction(promise, customer) {
    setActionState(`bank-import:${promise.id}`);
    try {
      await api("/api/finance/bank-transactions", {
        method: "POST",
        body: {
          bankName: "Ameriabank",
          accountNumber: "AM00 0000 0000 0000 0000",
          transactionDate: "2026-05-31",
          amount: promise.promisedAmount,
          direction: "credit",
          description: `Payment for ${promise.invoiceNumber} from ${customer.name}`,
          reference: `AMERIA-${promise.invoiceNumber}`
        }
      });
      setActionState(`bank-import:done:${promise.id}`);
      onReload();
    } catch {
      setActionState(`bank-import:error:${promise.id}`);
    }
  }

  async function reconcileBankTransaction(transaction) {
    setActionState(`bank-reconcile:${transaction.id}`);
    try {
      await api(`/api/finance/bank-transactions/${transaction.id}/reconcile`, { method: "POST" });
      setActionState(`bank-reconcile:done:${transaction.id}`);
      onReload();
    } catch {
      setActionState(`bank-reconcile:error:${transaction.id}`);
    }
  }

  async function runOverdueWorkflowDryRun() {
    setActionState("dry-run:rule-overdue-task");
    try {
      await api("/api/workflow/rules/rule-overdue-task/dry-run", {
        method: "POST",
        body: {
          customerId: "cust-nare",
          invoiceId: "inv-1007",
          note: "Workspace dry-run before approving collection automation"
        }
      });
      setActionState("dry-run:done");
      onReload();
    } catch {
      setActionState("dry-run:error");
    }
  }

  async function runOverdueWorkflowTestEvent() {
    setActionState("test-event:rule-overdue-task");
    try {
      await api("/api/workflow/rules/rule-overdue-task/test-event", {
        method: "POST",
        body: {
          eventType: "invoice_overdue",
          customerId: "cust-nare",
          subjectType: "invoice",
          subjectId: "inv-1007",
          payload: {
            invoiceNumber: "HHV-1007",
            overdueDays: 6,
            source: "Workspace test event"
          },
          note: "Workspace test event before enabling live collection automation"
        }
      });
      setActionState("test-event:done");
      onReload();
    } catch {
      setActionState("test-event:error");
    }
  }

  async function toggleOverdueWorkflowRule(rule) {
    setActionState(`rule-state:${rule.id}`);
    const nextEnabled = !rule.enabled;
    try {
      await api(`/api/workflow/rules/${rule.id}/state`, {
        method: "POST",
        body: {
          enabled: nextEnabled,
          reason: nextEnabled
            ? "Owner resumed collection automation after reviewing Armenian reminder wording."
            : "Owner paused collection automation while reviewing Armenian reminder wording."
        }
      });
      setActionState(`rule-state:done:${rule.id}`);
      onReload();
    } catch {
      setActionState(`rule-state:error:${rule.id}`);
    }
  }

  async function rollbackWorkflowRule(rule) {
    setActionState(`rule-rollback:${rule.id}`);
    try {
      await api(`/api/workflow/rules/${rule.id}/rollback`, {
        method: "POST",
        body: {
          versionNumber: Math.max(1, (rule.currentVersion || 1) - 1),
          reason: "Owner rolled back workflow rule to the previous reviewed version."
        }
      });
      setActionState(`rule-rollback:done:${rule.id}`);
      onReload();
    } catch {
      setActionState(`rule-rollback:error:${rule.id}`);
    }
  }

  async function retryWorkflowRun(run) {
    setActionState(`workflow-retry:${run.id}`);
    try {
      await api(`/api/workflow/runs/${run.id}/retry`, { method: "POST" });
      setActionState(`workflow-retry:done:${run.id}`);
      onReload();
    } catch {
      setActionState(`workflow-retry:error:${run.id}`);
    }
  }

  async function reviewVatSource() {
    setActionState("source-review:law-tax-code");
    try {
      await api("/api/legal/sources/law-tax-code/reviews", {
        method: "POST",
        body: {
          title: "RA Tax Code Article 63 VAT rate - accountant reviewed",
          sourceUrl: "https://www.arlis.am/hy/acts/224990",
          effectiveDate: new Date().toISOString().slice(0, 10),
          status: "active",
          reviewNote: "Accountant confirmed this source is ready for Armenian production VAT guidance."
        }
      });
      setActionState("source-review:done");
      onReload();
    } catch {
      setActionState("source-review:error");
    }
  }

  async function reviewEsignSource() {
    setActionState("source-review:law-esign");
    try {
      await api("/api/legal/sources/law-esign/reviews", {
        method: "POST",
        body: {
          title: "RA Law on Electronic Document and Electronic Signature - lawyer reviewed",
          sourceUrl: "https://www.cba.am/EN/lalaws/Law_on_e_docs_and%20_e_signatures.pdf",
          effectiveDate: new Date().toISOString().slice(0, 10),
          status: "active",
          reviewNote: "Lawyer confirmed this source is ready for accepted quote evidence packets."
        }
      });
      setActionState("source-review:done");
      onReload();
    } catch {
      setActionState("source-review:error");
    }
  }

  async function reviewPersonalDataSource() {
    setActionState("source-review:law-personal-data");
    try {
      await api("/api/legal/sources/law-personal-data/reviews", {
        method: "POST",
        body: {
          title: "RA Law on Protection of Personal Data - lawyer reviewed",
          sourceUrl: "https://www.arlis.am/DocumentView.aspx?docid=117034",
          effectiveDate: new Date().toISOString().slice(0, 10),
          status: "active",
          reviewNote: "Lawyer confirmed this source is ready for customer export and deletion request handling."
        }
      });
      setActionState("source-review:done");
      onReload();
    } catch {
      setActionState("source-review:error");
    }
  }

  async function prepareSrcExport() {
    setActionState("src-export:running");
    try {
      await api("/api/finance/src-exports", {
        method: "POST",
        body: {
          periodKey: "2026-05",
          note: "Prepare May VAT export packet for accountant review."
        }
      });
      setActionState("src-export:done");
      onReload();
    } catch {
      setActionState("src-export:error");
    }
  }

  async function prepareSignaturePacket() {
    setActionState("signature-packet:running");
    try {
      await api("/api/docs/signature-packets", {
        method: "POST",
        body: {
          quoteId: "quote-ani-inbox",
          note: "Archive accepted quote evidence for Docs & Sign handoff."
        }
      });
      setActionState("signature-packet:done");
      onReload();
    } catch {
      setActionState("signature-packet:error");
    }
  }

  async function preparePrivacyExport() {
    setActionState("privacy-export:running");
    try {
      const existing = await api("/api/privacy/requests?customerId=cust-ani");
      if ((existing.exportPackets || []).length === 0) {
        const created = await api("/api/privacy/requests", {
          method: "POST",
          body: {
            customerId: "cust-ani",
            requestType: "export",
            requesterEmail: "owner@anibeauty.am",
            channel: "Telegram",
            note: "Customer asks for her appointment and consent data export."
          }
        });
        await api(`/api/workflow/approvals/${created.approval.id}/decision`, {
          method: "POST",
          body: { decision: "approved", note: "Owner approved export after personal-data source review." }
        });
        await api(`/api/workflow/approvals/${created.approval.id}/execute`, { method: "POST" });
      }
      setActionState("privacy-export:done");
      onReload();
    } catch {
      setActionState("privacy-export:error");
    }
  }

  async function prepareDeletionAssessment() {
    setActionState("privacy-delete:running");
    try {
      const existing = await api("/api/privacy/requests?customerId=cust-ani");
      if ((existing.retentionAssessments || []).length === 0) {
        const created = await api("/api/privacy/requests", {
          method: "POST",
          body: {
            customerId: "cust-ani",
            requestType: "delete",
            requesterEmail: "owner@anibeauty.am",
            channel: "Email",
            note: "Customer asks to delete marketing profile data, with statutory finance records assessed first."
          }
        });
        await api(`/api/workflow/approvals/${created.approval.id}/decision`, {
          method: "POST",
          body: { decision: "approved", note: "Owner approved retention assessment before deletion." }
        });
        await api(`/api/workflow/approvals/${created.approval.id}/execute`, { method: "POST" });
      }
      setActionState("privacy-delete:done");
      onReload();
    } catch {
      setActionState("privacy-delete:error");
    }
  }

  async function createBackupProof() {
    setActionState("backup-proof:running");
    try {
      const created = await api("/api/admin/backups", {
        method: "POST",
        body: { note: "Owner-created tenant backup proof from workspace." }
      });
      const proof = await api(`/api/admin/backups/${created.backup.id}/restore-proof`, { method: "POST" });
      setCreatedBackup(created.backup);
      setRestoreProof(proof.restoreProof);
      setActionState("backup-proof:done");
    } catch {
      setActionState("backup-proof:error");
    }
  }

  async function createAccessReview() {
    setActionState("access-review:running");
    try {
      const created = await api("/api/admin/access-reviews", {
        method: "POST",
        body: {
          reviewPeriod: currentQuarterLabel(),
          note: "Owner-created privileged access review for pilot readiness."
        }
      });
      setCreatedAccessReview(created.review);
      setActionState("access-review:done");
    } catch {
      setActionState("access-review:error");
    }
  }

  async function createAuditExport() {
    setActionState("audit-export:running");
    try {
      const created = await api("/api/admin/audit-exports", {
        method: "POST",
        body: { note: "Workspace-created tamper-evident audit export for pilot compliance review." }
      });
      setCreatedAuditExport(created.export);
      setActionState("audit-export:done");
      onReload();
    } catch {
      setActionState("audit-export:error");
    }
  }

  async function configureWhatsAppConnector() {
    setActionState("connector-configure:whatsapp-business");
    try {
      await api("/api/integrations/connectors/whatsapp-business/configure", {
        method: "POST",
        body: {
          status: "connected",
          environment: "sandbox",
          endpointUrl: "https://graph.facebook.com/v20.0",
          secret: "workspace-whatsapp-sandbox-token",
          scopes: ["messages.read", "messages.write"],
          ownerRole: "Operator",
          note: "Workspace sandbox connector for Armenian customer messaging."
        }
      });
      await api("/api/integrations/connectors/whatsapp-business/health-check", {
        method: "POST",
        body: { sampleEvent: "workspace-inbound-message", note: "Workspace readiness check after connector setup." }
      });
      setActionState("connector-configure:done:whatsapp-business");
      onReload();
    } catch {
      setActionState("connector-configure:error:whatsapp-business");
    }
  }

  async function checkConnector(connectorKey) {
    setActionState(`connector-check:${connectorKey}`);
    try {
      await api(`/api/integrations/connectors/${connectorKey}/health-check`, {
        method: "POST",
        body: { sampleEvent: "workspace-readiness-check", note: "Workspace connector readiness check." }
      });
      setActionState(`connector-check:done:${connectorKey}`);
      onReload();
    } catch {
      setActionState(`connector-check:error:${connectorKey}`);
    }
  }

  async function createStockMove(payload) {
    setActionState("inventory-move:running");
    try {
      await api("/api/inventory/moves", { method: "POST", body: payload });
      setActionState("inventory-move:done");
      onReload();
    } catch (err) {
      reportActionError(err);
      setActionState("inventory-move:error");
    }
  }

  async function createPurchaseOrder(payload) {
    setActionState("purchase-create:running");
    try {
      await api("/api/purchase/orders", { method: "POST", body: payload });
      setActionState("purchase-create:done");
      onReload();
    } catch (err) {
      reportActionError(err);
      setActionState("purchase-create:error");
    }
  }

  async function confirmPurchaseOrder(order) {
    setActionState(`purchase-confirm:running:${order.id}`);
    try {
      await api(`/api/purchase/orders/${encodeURIComponent(order.id)}/confirm`, { method: "POST", body: {} });
      setActionState(`purchase-confirm:done:${order.id}`);
      onReload();
    } catch (err) {
      reportActionError(err);
      setActionState(`purchase-confirm:error:${order.id}`);
    }
  }

  async function receivePurchaseOrder(order, receiptLine) {
    setActionState(`purchase-receive:running:${order.id}`);
    try {
      const body = {
        receivedAt: armeniaDateString(),
        reference: `RCPT-${order.orderNumber || order.id}-${Number(order.receiptCount || 0) + 1}`.slice(0, 120)
      };
      if (receiptLine) {
        body.lines = [{ lineId: receiptLine.lineId, quantity: receiptLine.quantity }];
      }
      await api(`/api/purchase/orders/${encodeURIComponent(order.id)}/receive`, {
        method: "POST",
        body
      });
      setActionState(`purchase-receive:done:${order.id}`);
      onReload();
    } catch (err) {
      reportActionError(err);
      setActionState(`purchase-receive:error:${order.id}`);
    }
  }

  async function returnPurchaseOrder(order, returnLine) {
    setActionState(`purchase-return:running:${order.id}`);
    try {
      const body = {
        returnedAt: armeniaDateString(),
        reference: `RTN-${order.orderNumber || order.id}-${Number(order.returnCount || 0) + 1}`.slice(0, 120),
        reason: `Supplier return for ${order.orderNumber || order.id}`
      };
      if (returnLine) {
        body.lines = [{ lineId: returnLine.lineId, quantity: returnLine.quantity }];
      }
      await api(`/api/purchase/orders/${encodeURIComponent(order.id)}/return`, {
        method: "POST",
        body
      });
      setActionState(`purchase-return:done:${order.id}`);
      onReload();
    } catch (err) {
      reportActionError(err);
      setActionState(`purchase-return:error:${order.id}`);
    }
  }

  async function billPurchaseOrder(order) {
    setActionState(`purchase-bill:running:${order.id}`);
    try {
      const openPeriod = (finance?.periods?.periods || []).find(period => period.status === "open");
      const billDate = openPeriod?.endsOn || order.receivedAt || order.orderDate || armeniaDateString();
      await api(`/api/purchase/orders/${encodeURIComponent(order.id)}/bill`, {
        method: "POST",
        body: {
          billDate,
          dueDate: billDate,
          description: `Vendor bill for ${order.orderNumber || order.id}`
        }
      });
      setActionState(`purchase-bill:done:${order.id}`);
      onReload();
    } catch (err) {
      reportActionError(err);
      setActionState(`purchase-bill:error:${order.id}`);
    }
  }

  async function installClinicPilotTemplate() {
    setActionState("pilot-template:install");
    try {
      const created = await api("/api/pilots/templates/clinic-wellness/install", {
        method: "POST",
        body: {
          customerId: "cust-nare",
          selectedPackageKeys: ["patient-retention", "booking-inbox", "receivables-handoff"],
          pilotCount: 5,
          note: "Workspace-created clinic/wellness pilot packet for Nare Medical Center."
        }
      });
      setCreatedPilotInstall(created.install);
      setActionState("pilot-template:done");
      onReload();
    } catch {
      setActionState("pilot-template:error");
    }
  }

  async function createPilotOwnerBrief() {
    const installId = createdPilotInstall?.id || pilotTemplateData?.installations?.[0]?.id;
    if (!installId) {
      setActionState("pilot-owner-brief:missing-install");
      return;
    }
    setActionState("pilot-owner-brief:create");
    try {
      const created = await api("/api/pilots/clinic-wellness/owner-briefs", {
        method: "POST",
        body: {
          installId,
          reportDate: armeniaDateString(),
          note: "Workspace-created owner operating brief for the clinic/wellness pilot."
        }
      });
      setCreatedPilotBrief(created.brief);
      setActionState("pilot-owner-brief:done");
      onReload();
    } catch {
      setActionState("pilot-owner-brief:error");
    }
  }

  async function createPilotOperatorWorkbench() {
    const briefId = createdPilotBrief?.id || pilotOwnerBriefs?.[0]?.id;
    if (!briefId) {
      setActionState("pilot-workbench:missing-brief");
      return;
    }
    setActionState("pilot-workbench:create");
    try {
      const created = await api("/api/pilots/clinic-wellness/operator-workbenches", {
        method: "POST",
        body: {
          briefId,
          note: "Workspace-created clinic/wellness operator workbench from owner brief."
        }
      });
      setCreatedPilotWorkbench(created.workbench);
      setActionState("pilot-workbench:done");
    } catch {
      setActionState("pilot-workbench:error");
    }
  }

  async function createPilotAccountantReview() {
    const workbenchId = createdPilotWorkbench?.id || pilotOperatorWorkbenches?.[0]?.id;
    if (!workbenchId) {
      setActionState("pilot-accountant-review:missing-workbench");
      return;
    }
    setActionState("pilot-accountant-review:create");
    try {
      const created = await api("/api/pilots/clinic-wellness/accountant-reviews", {
        method: "POST",
        body: {
          workbenchId,
          note: "Workspace-created accountant review queue from clinic/wellness workbench."
        }
      });
      setCreatedPilotAccountantReview(created.review);
      setActionState("pilot-accountant-review:done");
    } catch {
      setActionState("pilot-accountant-review:error");
    }
  }

  async function createPilotLaunchReadiness() {
    const accountantReviewId = createdPilotAccountantReview?.id || pilotAccountantReviews?.[0]?.id;
    if (!accountantReviewId) {
      setActionState("pilot-launch-readiness:missing-review");
      return;
    }
    setActionState("pilot-launch-readiness:create");
    try {
      const created = await api("/api/pilots/clinic-wellness/launch-readiness", {
        method: "POST",
        body: {
          accountantReviewId,
          targetLaunchDate: armeniaDateString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
          note: "Workspace-created clinic/wellness go-live readiness gate."
        }
      });
      setCreatedPilotLaunchReadiness(created.packet);
      setActionState("pilot-launch-readiness:done");
    } catch {
      setActionState("pilot-launch-readiness:error");
    }
  }

  async function createPilotRemediationPlan() {
    const launchReadinessId = createdPilotLaunchReadiness?.id || pilotLaunchReadinessPackets?.[0]?.id;
    if (!launchReadinessId) {
      setActionState("pilot-remediation:missing-readiness");
      return;
    }
    setActionState("pilot-remediation:create");
    try {
      const created = await api("/api/pilots/clinic-wellness/launch-remediation-plans", {
        method: "POST",
        body: {
          launchReadinessId,
          note: "Workspace-created remediation plan for blocked clinic/wellness launch."
        }
      });
      setCreatedPilotRemediationPlan(created.plan);
      setActionState("pilot-remediation:done");
    } catch {
      setActionState("pilot-remediation:error");
    }
  }

  async function resolvePilotRemediationAction(actionKey) {
    const plan = createdPilotRemediationPlan || pilotLaunchRemediationPlans?.[0];
    if (!plan?.id) {
      setActionState("pilot-resolution:missing-plan");
      return;
    }
    const defaults = remediationResolutionDefaults(actionKey);
    setActionState(`pilot-resolution:${actionKey}`);
    try {
      const resolved = await api(`/api/pilots/clinic-wellness/remediation-actions/${actionKey}/resolve`, {
        method: "POST",
        body: {
          planId: plan.id,
          evidenceType: defaults.evidenceType,
          evidence: defaults.evidence,
          note: defaults.note
        }
      });
      setCreatedPilotResolution(resolved.resolution);
      setActionState(`pilot-resolution:done:${actionKey}`);
    } catch {
      setActionState(`pilot-resolution:error:${actionKey}`);
    }
  }

  async function createPilotLaunchClearance() {
    const remediationPlanId = createdPilotRemediationPlan?.id || pilotLaunchRemediationPlans?.[0]?.id;
    if (!remediationPlanId) {
      setActionState("pilot-clearance:missing-plan");
      return;
    }
    setActionState("pilot-clearance:create");
    try {
      const created = await api("/api/pilots/clinic-wellness/launch-clearance", {
        method: "POST",
        body: {
          remediationPlanId,
          note: "Workspace-created launch clearance packet before paid pilot offer."
        }
      });
      setCreatedPilotClearance(created.packet);
      setActionState("pilot-clearance:done");
    } catch {
      setActionState("pilot-clearance:error");
    }
  }

  async function createPilotPaidOffer() {
    const clearancePacketId = createdPilotClearance?.id || pilotLaunchClearancePackets?.find(packet => packet.status === "cleared")?.id || pilotLaunchClearancePackets?.[0]?.id;
    if (!clearancePacketId) {
      setActionState("pilot-paid-offer:missing-clearance");
      return;
    }
    setActionState("pilot-paid-offer:create");
    try {
      const created = await api("/api/pilots/clinic-wellness/paid-offers", {
        method: "POST",
        body: {
          clearancePacketId,
          validUntil: armeniaDateString(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
          note: "Workspace-created paid pilot offer after launch clearance."
        }
      });
      setCreatedPilotPaidOffer(created.offer);
      setActionState("pilot-paid-offer:done");
    } catch {
      setActionState("pilot-paid-offer:error");
    }
  }

  async function createPilotQuoteHandoff() {
    const offerId = createdPilotPaidOffer?.id || pilotPaidOffers?.[0]?.id;
    if (!offerId) {
      setActionState("pilot-quote-handoff:missing-offer");
      return;
    }
    setActionState("pilot-quote-handoff:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/paid-offers/${offerId}/quote-handoff`, {
        method: "POST",
        body: {
          dealId: "deal-nare-retainer",
          validUntil: armeniaDateString(new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)),
          note: "Workspace-created CRM quote release handoff from paid pilot offer."
        }
      });
      setCreatedPilotQuoteHandoff(created.handoff);
      setCreatedQuote(created.quote);
      setQuoteApproval(created.approval);
      setActionState("pilot-quote-handoff:done");
    } catch {
      setActionState("pilot-quote-handoff:error");
    }
  }

  async function createPilotQuoteRelease() {
    const handoffId = createdPilotQuoteHandoff?.id || pilotQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-quote-release:missing-handoff");
      return;
    }
    setActionState("pilot-quote-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/quote-handoffs/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded public quote release evidence." }
      });
      setCreatedPilotQuoteRelease(created.packet);
      setActionState("pilot-quote-release:done");
    } catch {
      setActionState("pilot-quote-release:error");
    }
  }

  async function createPilotAcceptanceHandoff() {
    const releaseId = createdPilotQuoteRelease?.id || pilotQuoteReleases?.[0]?.id;
    if (!releaseId) {
      setActionState("pilot-acceptance-handoff:missing-release");
      return;
    }
    setActionState("pilot-acceptance-handoff:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/quote-releases/${releaseId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted quote to HayHashvapah invoice approval handoff." }
      });
      setCreatedPilotAcceptanceHandoff(created.packet);
      setActionState("pilot-acceptance-handoff:done");
    } catch {
      setActionState("pilot-acceptance-handoff:error");
    }
  }

  async function createPilotHayhashvapahDraft() {
    const handoffId = createdPilotAcceptanceHandoff?.id || pilotQuoteAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-hayhashvapah-draft:missing-handoff");
      return;
    }
    setActionState("pilot-hayhashvapah-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/quote-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded HayHashvapah draft invoice evidence after owner workflow execution." }
      });
      setCreatedPilotHayhashvapahDraft(created.packet);
      setActionState("pilot-hayhashvapah-draft:done");
    } catch {
      setActionState("pilot-hayhashvapah-draft:error");
    }
  }

  async function createPilotOfficialInvoice() {
    const draftPacketId = createdPilotHayhashvapahDraft?.id || pilotHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotOfficialInvoice(created.packet);
      setActionState("pilot-official-invoice:done");
    } catch {
      setActionState("pilot-official-invoice:error");
    }
  }

  async function createPilotPaymentCollection() {
    const postingPacketId = createdPilotOfficialInvoice?.id || pilotOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-payment-collection:missing-invoice");
      return;
    }
    setActionState("pilot-payment-collection:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded HayHashvapah payment collection evidence." }
      });
      setCreatedPilotPaymentCollection(created.packet);
      setActionState("pilot-payment-collection:done");
    } catch {
      setActionState("pilot-payment-collection:error");
    }
  }

  async function createPilotCloseout() {
    const paymentCollectionId = createdPilotPaymentCollection?.id || pilotPaymentCollections?.[0]?.id;
    if (!paymentCollectionId) {
      setActionState("pilot-closeout:missing-payment");
      return;
    }
    setActionState("pilot-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/payment-collections/${paymentCollectionId}/closeout-packet`, {
        method: "POST",
        body: {
          renewalDueDate: armeniaDateString(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
          note: "Workspace-recorded paid pilot closeout and renewal handoff."
        }
      });
      setCreatedPilotCloseout(created.packet);
      setActionState("pilot-closeout:done");
    } catch {
      setActionState("pilot-closeout:error");
    }
  }

  async function createPilotRenewalQuote() {
    const closeoutId = createdPilotCloseout?.id || pilotCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/closeouts/${closeoutId}/renewal-quote-handoff`, {
        method: "POST",
        body: {
          validUntil: armeniaDateString(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)),
          note: "Workspace-recorded monthly renewal quote handoff."
        }
      });
      setCreatedPilotRenewalQuote(created.handoff);
      setActionState("pilot-renewal-quote:done");
    } catch {
      setActionState("pilot-renewal-quote:error");
    }
  }

  async function createPilotRenewalQuoteRelease() {
    const handoffId = createdPilotRenewalQuote?.id || pilotRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded monthly renewal quote release evidence." }
      });
      setCreatedPilotRenewalQuoteRelease(created.packet);
      setActionState("pilot-renewal-release:done");
    } catch {
      setActionState("pilot-renewal-release:error");
    }
  }

  async function createPilotRenewalAcceptanceHandoff() {
    const releaseId = createdPilotRenewalQuoteRelease?.id || pilotRenewalQuoteReleases?.[0]?.id;
    if (!releaseId) {
      setActionState("pilot-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/renewal-quote-releases/${releaseId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted renewal quote to HayHashvapah invoice approval handoff." }
      });
      setCreatedPilotRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-renewal-acceptance:done");
    } catch {
      setActionState("pilot-renewal-acceptance:error");
    }
  }

  async function createPilotRenewalHayhashvapahDraft() {
    const handoffId = createdPilotRenewalAcceptanceHandoff?.id || pilotRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded monthly renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-renewal-draft:done");
    } catch {
      setActionState("pilot-renewal-draft:error");
    }
  }

  async function createPilotRenewalOfficialInvoice() {
    const draftPacketId = createdPilotRenewalHayhashvapahDraft?.id || pilotRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotRenewalOfficialInvoice(created.packet);
      setActionState("pilot-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-renewal-official-invoice:error");
    }
  }

  async function createPilotRenewalPaymentCollection() {
    const postingPacketId = createdPilotRenewalOfficialInvoice?.id || pilotRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded renewal HayHashvapah payment collection evidence." }
      });
      setCreatedPilotRenewalPaymentCollection(created.packet);
      setActionState("pilot-renewal-payment:done");
    } catch {
      setActionState("pilot-renewal-payment:error");
    }
  }

  async function createPilotRenewalCloseout() {
    const paymentCollectionId = createdPilotRenewalPaymentCollection?.id || pilotRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionId) {
      setActionState("pilot-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/renewal-payment-collections/${paymentCollectionId}/closeout-packet`, {
        method: "POST",
        body: {
          note: "Workspace-recorded paid renewal cycle closeout and next renewal task."
        }
      });
      setCreatedPilotRenewalCloseout(created.packet);
      setActionState("pilot-renewal-closeout:done");
    } catch {
      setActionState("pilot-renewal-closeout:error");
    }
  }

  async function createPilotNextRenewalQuote() {
    const closeoutId = createdPilotRenewalCloseout?.id || pilotRenewalCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-next-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-next-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/renewal-closeouts/${closeoutId}/next-renewal-quote-handoff`, {
        method: "POST",
        body: {
          validUntil: armeniaDateString(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)),
          note: "Workspace-recorded next monthly renewal quote handoff."
        }
      });
      setCreatedPilotNextRenewalQuote(created.handoff);
      setActionState("pilot-next-renewal-quote:done");
    } catch {
      setActionState("pilot-next-renewal-quote:error");
    }
  }

  async function createPilotNextRenewalQuoteRelease() {
    const handoffId = createdPilotNextRenewalQuote?.id || pilotNextRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-next-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-next-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next monthly renewal quote release evidence." }
      });
      setCreatedPilotNextRenewalQuoteRelease(created.packet);
      setActionState("pilot-next-renewal-release:done");
    } catch {
      setActionState("pilot-next-renewal-release:error");
    }
  }

  async function createPilotNextRenewalAcceptanceHandoff() {
    const releaseId = createdPilotNextRenewalQuoteRelease?.id || pilotNextRenewalQuoteReleases?.[0]?.id;
    if (!releaseId) {
      setActionState("pilot-next-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-next-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-renewal-quote-releases/${releaseId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted next renewal quote to HayHashvapah invoice approval handoff." }
      });
      setCreatedPilotNextRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-next-renewal-acceptance:done");
    } catch {
      setActionState("pilot-next-renewal-acceptance:error");
    }
  }

  async function createPilotNextRenewalHayhashvapahDraft() {
    const handoffId = createdPilotNextRenewalAcceptanceHandoff?.id || pilotNextRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-next-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-next-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotNextRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-next-renewal-draft:done");
    } catch {
      setActionState("pilot-next-renewal-draft:error");
    }
  }

  async function createPilotNextRenewalOfficialInvoice() {
    const draftPacketId = createdPilotNextRenewalHayhashvapahDraft?.id || pilotNextRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-next-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-next-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotNextRenewalOfficialInvoice(created.packet);
      setActionState("pilot-next-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-next-renewal-official-invoice:error");
    }
  }

  async function createPilotNextRenewalPaymentCollection() {
    const postingPacketId = createdPilotNextRenewalOfficialInvoice?.id || pilotNextRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-next-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-next-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next renewal HayHashvapah payment receipt evidence." }
      });
      setCreatedPilotNextRenewalPaymentCollection(created.packet);
      setActionState("pilot-next-renewal-payment:done");
    } catch {
      setActionState("pilot-next-renewal-payment:error");
    }
  }

  async function createPilotNextRenewalCloseout() {
    const paymentCollectionId = createdPilotNextRenewalPaymentCollection?.id || pilotNextRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionId) {
      setActionState("pilot-next-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-next-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-renewal-payment-collections/${paymentCollectionId}/closeout-packet`, {
        method: "POST",
        body: {
          note: "Workspace-recorded paid next renewal cycle closeout and following renewal task."
        }
      });
      setCreatedPilotNextRenewalCloseout(created.packet);
      setActionState("pilot-next-renewal-closeout:done");
    } catch {
      setActionState("pilot-next-renewal-closeout:error");
    }
  }

  async function createPilotFollowingRenewalQuote() {
    const closeoutId = createdPilotNextRenewalCloseout?.id || pilotNextRenewalCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-following-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-following-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-renewal-closeouts/${closeoutId}/following-renewal-quote-handoff`, {
        method: "POST",
        body: {
          note: "Workspace-created following monthly renewal quote handoff from closed next-renewal cycle."
        }
      });
      setCreatedPilotFollowingRenewalQuote(created.handoff);
      setActionState("pilot-following-renewal-quote:done");
    } catch {
      setActionState("pilot-following-renewal-quote:error");
    }
  }

  async function createPilotFollowingRenewalQuoteRelease() {
    const handoffId = createdPilotFollowingRenewalQuote?.id || pilotFollowingRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-following-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-following-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded following monthly renewal quote release evidence." }
      });
      setCreatedPilotFollowingRenewalQuoteRelease(created.packet);
      setActionState("pilot-following-renewal-release:done");
    } catch {
      setActionState("pilot-following-renewal-release:error");
    }
  }

  async function createPilotFollowingRenewalAcceptanceHandoff() {
    const releaseId = createdPilotFollowingRenewalQuoteRelease?.id || pilotFollowingRenewalQuoteReleases?.[0]?.id;
    if (!releaseId) {
      setActionState("pilot-following-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-following-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-renewal-quote-releases/${releaseId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted following renewal quote to HayHashvapah invoice approval handoff." }
      });
      setCreatedPilotFollowingRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-following-renewal-acceptance:done");
    } catch {
      setActionState("pilot-following-renewal-acceptance:error");
    }
  }

  async function createPilotFollowingRenewalHayhashvapahDraft() {
    const handoffId = createdPilotFollowingRenewalAcceptanceHandoff?.id || pilotFollowingRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-following-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-following-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded following renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotFollowingRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-following-renewal-draft:done");
    } catch {
      setActionState("pilot-following-renewal-draft:error");
    }
  }

  async function createPilotFollowingRenewalOfficialInvoice() {
    const draftPacketId = createdPilotFollowingRenewalHayhashvapahDraft?.id || pilotFollowingRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-following-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-following-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded following renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotFollowingRenewalOfficialInvoice(created.packet);
      setActionState("pilot-following-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-following-renewal-official-invoice:error");
    }
  }

  async function createPilotFollowingRenewalPaymentCollection() {
    const postingPacketId = createdPilotFollowingRenewalOfficialInvoice?.id || pilotFollowingRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-following-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-following-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded following renewal HayHashvapah payment receipt evidence." }
      });
      setCreatedPilotFollowingRenewalPaymentCollection(created.packet);
      setActionState("pilot-following-renewal-payment:done");
    } catch {
      setActionState("pilot-following-renewal-payment:error");
    }
  }

  async function createPilotFollowingRenewalCloseout() {
    const paymentCollectionId = createdPilotFollowingRenewalPaymentCollection?.id || pilotFollowingRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionId) {
      setActionState("pilot-following-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-following-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-renewal-payment-collections/${paymentCollectionId}/closeout-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded paid following renewal closeout and subsequent renewal task." }
      });
      setCreatedPilotFollowingRenewalCloseout(created.packet);
      setActionState("pilot-following-renewal-closeout:done");
    } catch {
      setActionState("pilot-following-renewal-closeout:error");
    }
  }

  async function createPilotSubsequentRenewalQuote() {
    const closeoutId = createdPilotFollowingRenewalCloseout?.id || pilotFollowingRenewalCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-subsequent-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-subsequent-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-renewal-closeouts/${closeoutId}/subsequent-renewal-quote-handoff`, {
        method: "POST",
        body: { note: "Workspace-created subsequent monthly renewal quote handoff from closed following-renewal cycle." }
      });
      setCreatedPilotSubsequentRenewalQuote(created.handoff);
      setActionState("pilot-subsequent-renewal-quote:done");
    } catch {
      setActionState("pilot-subsequent-renewal-quote:error");
    }
  }

  async function createPilotSubsequentRenewalQuoteRelease() {
    const handoffId = createdPilotSubsequentRenewalQuote?.id || pilotSubsequentRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-subsequent-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-subsequent-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded subsequent monthly renewal quote release evidence." }
      });
      setCreatedPilotSubsequentRenewalQuoteRelease(created.packet);
      setActionState("pilot-subsequent-renewal-release:done");
    } catch {
      setActionState("pilot-subsequent-renewal-release:error");
    }
  }

  async function createPilotSubsequentRenewalAcceptanceHandoff() {
    const releaseId = createdPilotSubsequentRenewalQuoteRelease?.id || pilotSubsequentRenewalQuoteReleases?.[0]?.id;
    if (!releaseId) {
      setActionState("pilot-subsequent-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-subsequent-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-renewal-quote-releases/${releaseId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded subsequent renewal acceptance handoff for HayHashvapah invoice approval." }
      });
      setCreatedPilotSubsequentRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-subsequent-renewal-acceptance:done");
    } catch {
      setActionState("pilot-subsequent-renewal-acceptance:error");
    }
  }

  async function createPilotSubsequentRenewalHayhashvapahDraft() {
    const handoffId = createdPilotSubsequentRenewalAcceptanceHandoff?.id || pilotSubsequentRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-subsequent-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-subsequent-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded subsequent renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotSubsequentRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-subsequent-renewal-draft:done");
    } catch {
      setActionState("pilot-subsequent-renewal-draft:error");
    }
  }

  async function createPilotSubsequentRenewalOfficialInvoice() {
    const draftPacketId = createdPilotSubsequentRenewalHayhashvapahDraft?.id || pilotSubsequentRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-subsequent-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-subsequent-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded subsequent renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotSubsequentRenewalOfficialInvoice(created.packet);
      setActionState("pilot-subsequent-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-subsequent-renewal-official-invoice:error");
    }
  }

  async function createPilotSubsequentRenewalPaymentCollection() {
    const postingPacketId = createdPilotSubsequentRenewalOfficialInvoice?.id || pilotSubsequentRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-subsequent-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-subsequent-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded subsequent renewal HayHashvapah payment receipt evidence." }
      });
      setCreatedPilotSubsequentRenewalPaymentCollection(created.packet);
      setActionState("pilot-subsequent-renewal-payment:done");
    } catch {
      setActionState("pilot-subsequent-renewal-payment:error");
    }
  }

  async function createPilotSubsequentRenewalCloseout() {
    const paymentCollectionPacketId = createdPilotSubsequentRenewalPaymentCollection?.id || pilotSubsequentRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionPacketId) {
      setActionState("pilot-subsequent-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-subsequent-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-renewal-payment-collections/${paymentCollectionPacketId}/closeout-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded paid subsequent renewal closeout and continuation renewal task." }
      });
      setCreatedPilotSubsequentRenewalCloseout(created.packet);
      setActionState("pilot-subsequent-renewal-closeout:done");
    } catch {
      setActionState("pilot-subsequent-renewal-closeout:error");
    }
  }

  async function createPilotContinuationRenewalQuote() {
    const closeoutId = createdPilotSubsequentRenewalCloseout?.id || pilotSubsequentRenewalCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-continuation-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-continuation-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-renewal-closeouts/${closeoutId}/continuation-renewal-quote-handoff`, {
        method: "POST",
        body: { note: "Workspace-created continuation monthly renewal quote handoff from closed subsequent-renewal cycle." }
      });
      setCreatedPilotContinuationRenewalQuote(created.handoff);
      setActionState("pilot-continuation-renewal-quote:done");
    } catch {
      setActionState("pilot-continuation-renewal-quote:error");
    }
  }

  async function createPilotContinuationRenewalQuoteRelease() {
    const handoffId = createdPilotContinuationRenewalQuote?.id || pilotContinuationRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-continuation-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-continuation-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/continuation-renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded continuation monthly renewal quote release evidence." }
      });
      setCreatedPilotContinuationRenewalQuoteRelease(created.packet);
      setActionState("pilot-continuation-renewal-release:done");
    } catch {
      setActionState("pilot-continuation-renewal-release:error");
    }
  }

  async function createPilotContinuationRenewalAcceptanceHandoff() {
    const releasePacketId = createdPilotContinuationRenewalQuoteRelease?.id || pilotContinuationRenewalQuoteReleases?.[0]?.id;
    if (!releasePacketId) {
      setActionState("pilot-continuation-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-continuation-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/continuation-renewal-quote-releases/${releasePacketId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted continuation renewal handoff to HayHashvapah invoice approval." }
      });
      setCreatedPilotContinuationRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-continuation-renewal-acceptance:done");
    } catch {
      setActionState("pilot-continuation-renewal-acceptance:error");
    }
  }

  async function createPilotContinuationRenewalHayhashvapahDraft() {
    const handoffId = createdPilotContinuationRenewalAcceptanceHandoff?.id || pilotContinuationRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-continuation-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-continuation-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/continuation-renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded continuation renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotContinuationRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-continuation-renewal-draft:done");
    } catch {
      setActionState("pilot-continuation-renewal-draft:error");
    }
  }

  async function createPilotContinuationRenewalOfficialInvoice() {
    const draftPacketId = createdPilotContinuationRenewalHayhashvapahDraft?.id || pilotContinuationRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-continuation-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-continuation-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/continuation-renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded continuation renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotContinuationRenewalOfficialInvoice(created.packet);
      setActionState("pilot-continuation-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-continuation-renewal-official-invoice:error");
    }
  }

  async function createPilotContinuationRenewalPaymentCollection() {
    const postingPacketId = createdPilotContinuationRenewalOfficialInvoice?.id || pilotContinuationRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-continuation-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-continuation-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/continuation-renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded continuation renewal HayHashvapah payment receipt evidence." }
      });
      setCreatedPilotContinuationRenewalPaymentCollection(created.packet);
      setActionState("pilot-continuation-renewal-payment:done");
    } catch {
      setActionState("pilot-continuation-renewal-payment:error");
    }
  }

  async function createPilotContinuationRenewalCloseout() {
    const paymentCollectionPacketId = createdPilotContinuationRenewalPaymentCollection?.id || pilotContinuationRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionPacketId) {
      setActionState("pilot-continuation-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-continuation-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/continuation-renewal-payment-collections/${paymentCollectionPacketId}/closeout-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded paid continuation renewal closeout and ongoing renewal task." }
      });
      setCreatedPilotContinuationRenewalCloseout(created.packet);
      setActionState("pilot-continuation-renewal-closeout:done");
    } catch {
      setActionState("pilot-continuation-renewal-closeout:error");
    }
  }

  async function createPilotOngoingRenewalQuote() {
    const closeoutId = createdPilotContinuationRenewalCloseout?.id || pilotContinuationRenewalCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-ongoing-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-ongoing-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/continuation-renewal-closeouts/${closeoutId}/ongoing-renewal-quote-handoff`, {
        method: "POST",
        body: { note: "Workspace-created ongoing monthly renewal quote handoff from closed continuation cycle." }
      });
      setCreatedPilotOngoingRenewalQuote(created.handoff);
      setActionState("pilot-ongoing-renewal-quote:done");
    } catch {
      setActionState("pilot-ongoing-renewal-quote:error");
    }
  }

  async function createPilotOngoingRenewalQuoteRelease() {
    const handoffId = createdPilotOngoingRenewalQuote?.id || pilotOngoingRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-ongoing-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-ongoing-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/ongoing-renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded ongoing monthly renewal quote release evidence." }
      });
      setCreatedPilotOngoingRenewalQuoteRelease(created.packet);
      setActionState("pilot-ongoing-renewal-release:done");
    } catch {
      setActionState("pilot-ongoing-renewal-release:error");
    }
  }

  async function createPilotOngoingRenewalAcceptanceHandoff() {
    const releasePacketId = createdPilotOngoingRenewalQuoteRelease?.id || pilotOngoingRenewalQuoteReleases?.[0]?.id;
    if (!releasePacketId) {
      setActionState("pilot-ongoing-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-ongoing-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/ongoing-renewal-quote-releases/${releasePacketId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted ongoing renewal handoff to HayHashvapah invoice approval." }
      });
      setCreatedPilotOngoingRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-ongoing-renewal-acceptance:done");
    } catch {
      setActionState("pilot-ongoing-renewal-acceptance:error");
    }
  }

  async function createPilotOngoingRenewalHayhashvapahDraft() {
    const handoffId = createdPilotOngoingRenewalAcceptanceHandoff?.id || pilotOngoingRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-ongoing-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-ongoing-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/ongoing-renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded ongoing renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotOngoingRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-ongoing-renewal-draft:done");
    } catch {
      setActionState("pilot-ongoing-renewal-draft:error");
    }
  }

  async function createPilotOngoingRenewalOfficialInvoice() {
    const draftPacketId = createdPilotOngoingRenewalHayhashvapahDraft?.id || pilotOngoingRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-ongoing-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-ongoing-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/ongoing-renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded ongoing renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotOngoingRenewalOfficialInvoice(created.packet);
      setActionState("pilot-ongoing-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-ongoing-renewal-official-invoice:error");
    }
  }

  async function createPilotOngoingRenewalPaymentCollection() {
    const postingPacketId = createdPilotOngoingRenewalOfficialInvoice?.id || pilotOngoingRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-ongoing-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-ongoing-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/ongoing-renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded ongoing renewal HayHashvapah payment collection evidence." }
      });
      setCreatedPilotOngoingRenewalPaymentCollection(created.packet);
      setActionState("pilot-ongoing-renewal-payment:done");
    } catch {
      setActionState("pilot-ongoing-renewal-payment:error");
    }
  }

  async function createPilotOngoingRenewalCloseout() {
    const paymentCollectionPacketId = createdPilotOngoingRenewalPaymentCollection?.id || pilotOngoingRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionPacketId) {
      setActionState("pilot-ongoing-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-ongoing-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/ongoing-renewal-payment-collections/${paymentCollectionPacketId}/closeout-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded paid ongoing renewal closeout and next recurring task." }
      });
      setCreatedPilotOngoingRenewalCloseout(created.packet);
      setActionState("pilot-ongoing-renewal-closeout:done");
    } catch {
      setActionState("pilot-ongoing-renewal-closeout:error");
    }
  }

  async function createPilotNextOngoingRenewalQuote() {
    const closeoutId = createdPilotOngoingRenewalCloseout?.id || pilotOngoingRenewalCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-next-ongoing-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-next-ongoing-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/ongoing-renewal-closeouts/${closeoutId}/next-ongoing-renewal-quote-handoff`, {
        method: "POST",
        body: { note: "Workspace-created next ongoing monthly renewal quote handoff from closed ongoing cycle." }
      });
      setCreatedPilotNextOngoingRenewalQuote(created.handoff);
      setActionState("pilot-next-ongoing-renewal-quote:done");
    } catch {
      setActionState("pilot-next-ongoing-renewal-quote:error");
    }
  }

  async function createPilotNextOngoingRenewalQuoteRelease() {
    const handoffId = createdPilotNextOngoingRenewalQuote?.id || pilotNextOngoingRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-next-ongoing-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-next-ongoing-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-ongoing-renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next ongoing monthly renewal public quote release evidence." }
      });
      setCreatedPilotNextOngoingRenewalQuoteRelease(created.packet);
      setActionState("pilot-next-ongoing-renewal-release:done");
    } catch {
      setActionState("pilot-next-ongoing-renewal-release:error");
    }
  }

  async function createPilotNextOngoingRenewalAcceptanceHandoff() {
    const releasePacketId = createdPilotNextOngoingRenewalQuoteRelease?.id || pilotNextOngoingRenewalQuoteReleases?.[0]?.id;
    if (!releasePacketId) {
      setActionState("pilot-next-ongoing-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-next-ongoing-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-ongoing-renewal-quote-releases/${releasePacketId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted next ongoing renewal handoff to HayHashvapah invoice approval." }
      });
      setCreatedPilotNextOngoingRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-next-ongoing-renewal-acceptance:done");
    } catch {
      setActionState("pilot-next-ongoing-renewal-acceptance:error");
    }
  }

  async function createPilotNextOngoingRenewalHayhashvapahDraft() {
    const handoffId = createdPilotNextOngoingRenewalAcceptanceHandoff?.id || pilotNextOngoingRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-next-ongoing-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-next-ongoing-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-ongoing-renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next ongoing renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotNextOngoingRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-next-ongoing-renewal-draft:done");
    } catch {
      setActionState("pilot-next-ongoing-renewal-draft:error");
    }
  }

  async function createPilotNextOngoingRenewalOfficialInvoice() {
    const draftPacketId = createdPilotNextOngoingRenewalHayhashvapahDraft?.id || pilotNextOngoingRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-next-ongoing-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-next-ongoing-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-ongoing-renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next ongoing renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotNextOngoingRenewalOfficialInvoice(created.packet);
      setActionState("pilot-next-ongoing-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-next-ongoing-renewal-official-invoice:error");
    }
  }

  async function createPilotNextOngoingRenewalPaymentCollection() {
    const postingPacketId = createdPilotNextOngoingRenewalOfficialInvoice?.id || pilotNextOngoingRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-next-ongoing-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-next-ongoing-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-ongoing-renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next ongoing renewal HayHashvapah payment collection evidence." }
      });
      setCreatedPilotNextOngoingRenewalPaymentCollection(created.packet);
      setActionState("pilot-next-ongoing-renewal-payment:done");
    } catch {
      setActionState("pilot-next-ongoing-renewal-payment:error");
    }
  }

  async function createPilotNextOngoingRenewalCloseout() {
    const paymentCollectionPacketId = createdPilotNextOngoingRenewalPaymentCollection?.id || pilotNextOngoingRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionPacketId) {
      setActionState("pilot-next-ongoing-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-next-ongoing-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-ongoing-renewal-payment-collections/${paymentCollectionPacketId}/closeout-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded paid next ongoing renewal closeout and following recurring task." }
      });
      setCreatedPilotNextOngoingRenewalCloseout(created.packet);
      setActionState("pilot-next-ongoing-renewal-closeout:done");
    } catch {
      setActionState("pilot-next-ongoing-renewal-closeout:error");
    }
  }

  async function createPilotFollowingOngoingRenewalQuote() {
    const closeoutId = createdPilotNextOngoingRenewalCloseout?.id || pilotNextOngoingRenewalCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-following-ongoing-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-following-ongoing-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-ongoing-renewal-closeouts/${closeoutId}/following-ongoing-renewal-quote-handoff`, {
        method: "POST",
        body: { note: "Workspace-created following ongoing monthly renewal quote handoff from closed next ongoing cycle." }
      });
      setCreatedPilotFollowingOngoingRenewalQuote(created.handoff);
      setActionState("pilot-following-ongoing-renewal-quote:done");
    } catch {
      setActionState("pilot-following-ongoing-renewal-quote:error");
    }
  }

  async function createPilotFollowingOngoingRenewalQuoteRelease() {
    const handoffId = createdPilotFollowingOngoingRenewalQuote?.id || pilotFollowingOngoingRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-following-ongoing-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-following-ongoing-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-ongoing-renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded following ongoing monthly renewal public quote release evidence." }
      });
      setCreatedPilotFollowingOngoingRenewalQuoteRelease(created.packet);
      setActionState("pilot-following-ongoing-renewal-release:done");
    } catch {
      setActionState("pilot-following-ongoing-renewal-release:error");
    }
  }

  async function createPilotFollowingOngoingRenewalAcceptanceHandoff() {
    const releasePacketId = createdPilotFollowingOngoingRenewalQuoteRelease?.id || pilotFollowingOngoingRenewalQuoteReleases?.[0]?.id;
    if (!releasePacketId) {
      setActionState("pilot-following-ongoing-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-following-ongoing-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-ongoing-renewal-quote-releases/${releasePacketId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted following ongoing renewal handoff to HayHashvapah invoice approval." }
      });
      setCreatedPilotFollowingOngoingRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-following-ongoing-renewal-acceptance:done");
    } catch {
      setActionState("pilot-following-ongoing-renewal-acceptance:error");
    }
  }

  async function createPilotFollowingOngoingRenewalHayhashvapahDraft() {
    const handoffId = createdPilotFollowingOngoingRenewalAcceptanceHandoff?.id || pilotFollowingOngoingRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-following-ongoing-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-following-ongoing-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-ongoing-renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded following ongoing renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotFollowingOngoingRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-following-ongoing-renewal-draft:done");
    } catch {
      setActionState("pilot-following-ongoing-renewal-draft:error");
    }
  }

  async function createPilotFollowingOngoingRenewalOfficialInvoice() {
    const draftPacketId = createdPilotFollowingOngoingRenewalHayhashvapahDraft?.id || pilotFollowingOngoingRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-following-ongoing-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-following-ongoing-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-ongoing-renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded following ongoing renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotFollowingOngoingRenewalOfficialInvoice(created.packet);
      setActionState("pilot-following-ongoing-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-following-ongoing-renewal-official-invoice:error");
    }
  }

  async function createPilotFollowingOngoingRenewalPaymentCollection() {
    const postingPacketId = createdPilotFollowingOngoingRenewalOfficialInvoice?.id || pilotFollowingOngoingRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-following-ongoing-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-following-ongoing-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-ongoing-renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded following ongoing renewal HayHashvapah payment collection evidence." }
      });
      setCreatedPilotFollowingOngoingRenewalPaymentCollection(created.packet);
      setActionState("pilot-following-ongoing-renewal-payment:done");
    } catch {
      setActionState("pilot-following-ongoing-renewal-payment:error");
    }
  }

  async function createPilotFollowingOngoingRenewalCloseout() {
    const paymentCollectionPacketId = createdPilotFollowingOngoingRenewalPaymentCollection?.id || pilotFollowingOngoingRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionPacketId) {
      setActionState("pilot-following-ongoing-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-following-ongoing-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-ongoing-renewal-payment-collections/${paymentCollectionPacketId}/closeout-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded paid following ongoing renewal closeout and subsequent recurring task." }
      });
      setCreatedPilotFollowingOngoingRenewalCloseout(created.packet);
      setActionState("pilot-following-ongoing-renewal-closeout:done");
    } catch {
      setActionState("pilot-following-ongoing-renewal-closeout:error");
    }
  }

  async function createPilotSubsequentOngoingRenewalQuote() {
    const closeoutId = createdPilotFollowingOngoingRenewalCloseout?.id || pilotFollowingOngoingRenewalCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-subsequent-ongoing-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-subsequent-ongoing-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/following-ongoing-renewal-closeouts/${closeoutId}/subsequent-ongoing-renewal-quote-handoff`, {
        method: "POST",
        body: { note: "Workspace-created subsequent ongoing monthly renewal quote handoff from closed following ongoing cycle." }
      });
      setCreatedPilotSubsequentOngoingRenewalQuote(created.handoff);
      setActionState("pilot-subsequent-ongoing-renewal-quote:done");
    } catch {
      setActionState("pilot-subsequent-ongoing-renewal-quote:error");
    }
  }

  async function createPilotSubsequentOngoingRenewalQuoteRelease() {
    const handoffId = createdPilotSubsequentOngoingRenewalQuote?.id || pilotSubsequentOngoingRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-subsequent-ongoing-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-subsequent-ongoing-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-ongoing-renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded subsequent ongoing monthly renewal public quote release evidence." }
      });
      setCreatedPilotSubsequentOngoingRenewalQuoteRelease(created.packet);
      setActionState("pilot-subsequent-ongoing-renewal-release:done");
    } catch {
      setActionState("pilot-subsequent-ongoing-renewal-release:error");
    }
  }

  async function createPilotSubsequentOngoingRenewalAcceptanceHandoff() {
    const releasePacketId = createdPilotSubsequentOngoingRenewalQuoteRelease?.id || pilotSubsequentOngoingRenewalQuoteReleases?.[0]?.id;
    if (!releasePacketId) {
      setActionState("pilot-subsequent-ongoing-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-subsequent-ongoing-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-ongoing-renewal-quote-releases/${releasePacketId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted subsequent ongoing renewal handoff to HayHashvapah invoice approval." }
      });
      setCreatedPilotSubsequentOngoingRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-subsequent-ongoing-renewal-acceptance:done");
    } catch {
      setActionState("pilot-subsequent-ongoing-renewal-acceptance:error");
    }
  }

  async function createPilotSubsequentOngoingRenewalHayhashvapahDraft() {
    const handoffId = createdPilotSubsequentOngoingRenewalAcceptanceHandoff?.id || pilotSubsequentOngoingRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-subsequent-ongoing-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-subsequent-ongoing-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-ongoing-renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded subsequent ongoing renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotSubsequentOngoingRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-subsequent-ongoing-renewal-draft:done");
    } catch {
      setActionState("pilot-subsequent-ongoing-renewal-draft:error");
    }
  }

  async function createPilotSubsequentOngoingRenewalOfficialInvoice() {
    const draftPacketId = createdPilotSubsequentOngoingRenewalHayhashvapahDraft?.id || pilotSubsequentOngoingRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-subsequent-ongoing-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-subsequent-ongoing-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-ongoing-renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded subsequent ongoing renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotSubsequentOngoingRenewalOfficialInvoice(created.packet);
      setActionState("pilot-subsequent-ongoing-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-subsequent-ongoing-renewal-official-invoice:error");
    }
  }

  async function createPilotSubsequentOngoingRenewalPaymentCollection() {
    const postingPacketId = createdPilotSubsequentOngoingRenewalOfficialInvoice?.id || pilotSubsequentOngoingRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-subsequent-ongoing-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-subsequent-ongoing-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-ongoing-renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded subsequent ongoing renewal HayHashvapah payment collection evidence." }
      });
      setCreatedPilotSubsequentOngoingRenewalPaymentCollection(created.packet);
      setActionState("pilot-subsequent-ongoing-renewal-payment:done");
    } catch {
      setActionState("pilot-subsequent-ongoing-renewal-payment:error");
    }
  }

  async function createPilotSubsequentOngoingRenewalCloseout() {
    const paymentCollectionPacketId = createdPilotSubsequentOngoingRenewalPaymentCollection?.id || pilotSubsequentOngoingRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionPacketId) {
      setActionState("pilot-subsequent-ongoing-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-subsequent-ongoing-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-ongoing-renewal-payment-collections/${paymentCollectionPacketId}/closeout-packet`, {
        method: "POST",
        body: {
          note: "Workspace-recorded paid subsequent ongoing renewal closeout and next recurring task.",
          nextRecurringOngoingRenewalDueDate: "2027-02-28"
        }
      });
      setCreatedPilotSubsequentOngoingRenewalCloseout(created.packet);
      setActionState("pilot-subsequent-ongoing-renewal-closeout:done");
    } catch {
      setActionState("pilot-subsequent-ongoing-renewal-closeout:error");
    }
  }

  async function createPilotNextRecurringOngoingRenewalQuote() {
    const closeoutId = createdPilotSubsequentOngoingRenewalCloseout?.id || pilotSubsequentOngoingRenewalCloseouts?.[0]?.id;
    if (!closeoutId) {
      setActionState("pilot-next-recurring-ongoing-renewal-quote:missing-closeout");
      return;
    }
    setActionState("pilot-next-recurring-ongoing-renewal-quote:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/subsequent-ongoing-renewal-closeouts/${closeoutId}/next-recurring-ongoing-renewal-quote-handoff`, {
        method: "POST",
        body: {
          validUntil: "2027-03-14",
          note: "Workspace-created next recurring ongoing monthly renewal quote handoff from closed subsequent ongoing cycle."
        }
      });
      setCreatedPilotNextRecurringOngoingRenewalQuote(created.handoff);
      setActionState("pilot-next-recurring-ongoing-renewal-quote:done");
    } catch {
      setActionState("pilot-next-recurring-ongoing-renewal-quote:error");
    }
  }

  async function createPilotNextRecurringOngoingRenewalRelease() {
    const handoffId = createdPilotNextRecurringOngoingRenewalQuote?.id || pilotNextRecurringOngoingRenewalQuoteHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-next-recurring-ongoing-renewal-release:missing-handoff");
      return;
    }
    setActionState("pilot-next-recurring-ongoing-renewal-release:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-quotes/${handoffId}/release-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next recurring ongoing renewal public quote release evidence." }
      });
      setCreatedPilotNextRecurringOngoingRenewalRelease(created.packet);
      setActionState("pilot-next-recurring-ongoing-renewal-release:done");
    } catch {
      setActionState("pilot-next-recurring-ongoing-renewal-release:error");
    }
  }

  async function createPilotNextRecurringOngoingRenewalAcceptanceHandoff() {
    const releaseId = createdPilotNextRecurringOngoingRenewalRelease?.id || pilotNextRecurringOngoingRenewalQuoteReleases?.[0]?.id;
    if (!releaseId) {
      setActionState("pilot-next-recurring-ongoing-renewal-acceptance:missing-release");
      return;
    }
    setActionState("pilot-next-recurring-ongoing-renewal-acceptance:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-quote-releases/${releaseId}/acceptance-handoff`, {
        method: "POST",
        body: { note: "Workspace-recorded accepted next recurring ongoing renewal quote handoff for HayHashvapah invoice approval." }
      });
      setCreatedPilotNextRecurringOngoingRenewalAcceptanceHandoff(created.packet);
      setActionState("pilot-next-recurring-ongoing-renewal-acceptance:done");
    } catch {
      setActionState("pilot-next-recurring-ongoing-renewal-acceptance:error");
    }
  }

  async function createPilotNextRecurringOngoingRenewalHayhashvapahDraft() {
    const handoffId = createdPilotNextRecurringOngoingRenewalAcceptanceHandoff?.id || pilotNextRecurringOngoingRenewalAcceptanceHandoffs?.[0]?.id;
    if (!handoffId) {
      setActionState("pilot-next-recurring-ongoing-renewal-draft:missing-handoff");
      return;
    }
    setActionState("pilot-next-recurring-ongoing-renewal-draft:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-acceptance-handoffs/${handoffId}/draft-invoice-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next recurring ongoing renewal HayHashvapah draft invoice evidence." }
      });
      setCreatedPilotNextRecurringOngoingRenewalHayhashvapahDraft(created.packet);
      setActionState("pilot-next-recurring-ongoing-renewal-draft:done");
    } catch {
      setActionState("pilot-next-recurring-ongoing-renewal-draft:error");
    }
  }

  async function createPilotNextRecurringOngoingRenewalOfficialInvoice() {
    const draftPacketId = createdPilotNextRecurringOngoingRenewalHayhashvapahDraft?.id || pilotNextRecurringOngoingRenewalHayhashvapahDrafts?.[0]?.id;
    if (!draftPacketId) {
      setActionState("pilot-next-recurring-ongoing-renewal-official-invoice:missing-draft");
      return;
    }
    setActionState("pilot-next-recurring-ongoing-renewal-official-invoice:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-hayhashvapah-drafts/${draftPacketId}/posting-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next recurring ongoing renewal official HayHashvapah invoice posting evidence." }
      });
      setCreatedPilotNextRecurringOngoingRenewalOfficialInvoice(created.packet);
      setActionState("pilot-next-recurring-ongoing-renewal-official-invoice:done");
    } catch {
      setActionState("pilot-next-recurring-ongoing-renewal-official-invoice:error");
    }
  }

  async function createPilotNextRecurringOngoingRenewalPaymentCollection() {
    const postingPacketId = createdPilotNextRecurringOngoingRenewalOfficialInvoice?.id || pilotNextRecurringOngoingRenewalOfficialInvoices?.[0]?.id;
    if (!postingPacketId) {
      setActionState("pilot-next-recurring-ongoing-renewal-payment:missing-invoice");
      return;
    }
    setActionState("pilot-next-recurring-ongoing-renewal-payment:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-official-invoices/${postingPacketId}/payment-packet`, {
        method: "POST",
        body: { note: "Workspace-recorded next recurring ongoing renewal HayHashvapah payment collection evidence." }
      });
      setCreatedPilotNextRecurringOngoingRenewalPaymentCollection(created.packet);
      setActionState("pilot-next-recurring-ongoing-renewal-payment:done");
    } catch {
      setActionState("pilot-next-recurring-ongoing-renewal-payment:error");
    }
  }

  async function createPilotNextRecurringOngoingRenewalCloseout() {
    const paymentCollectionPacketId = createdPilotNextRecurringOngoingRenewalPaymentCollection?.id || pilotNextRecurringOngoingRenewalPaymentCollections?.[0]?.id;
    if (!paymentCollectionPacketId) {
      setActionState("pilot-next-recurring-ongoing-renewal-closeout:missing-payment");
      return;
    }
    setActionState("pilot-next-recurring-ongoing-renewal-closeout:create");
    try {
      const created = await api(`/api/pilots/clinic-wellness/next-recurring-ongoing-renewal-payment-collections/${paymentCollectionPacketId}/closeout-packet`, {
        method: "POST",
        body: {
          note: "Workspace-recorded paid next recurring ongoing renewal closeout and following recurring task.",
          followingRecurringOngoingRenewalDueDate: "2027-03-31"
        }
      });
      setCreatedPilotNextRecurringOngoingRenewalCloseout(created.packet);
      setActionState("pilot-next-recurring-ongoing-renewal-closeout:done");
    } catch {
      setActionState("pilot-next-recurring-ongoing-renewal-closeout:error");
    }
  }

  async function enrollMfa() {
    setActionState("mfa:enroll");
    try {
      const enrollment = await api("/api/security/mfa/enroll", {
        method: "POST",
        body: { label: "Owner authenticator app" }
      });
      setMfaSetup(enrollment);
      setActionState("mfa:enrolled");
    } catch {
      setActionState("mfa:error");
    }
  }

  async function verifyMfa(code) {
    if (!mfaSetup?.factor?.id) return;
    setActionState("mfa:verify");
    try {
      await api("/api/security/mfa/verify-enrollment", {
        method: "POST",
        body: { factorId: mfaSetup.factor.id, code }
      });
      setMfaSetup(null);
      setActionState("mfa:enabled");
      onReload();
    } catch {
      setActionState("mfa:error");
    }
  }

  async function revokeSession(sessionId) {
    setActionState(`session-revoke:${sessionId}`);
    try {
      await api(`/api/admin/sessions/${sessionId}/revoke`, {
        method: "POST",
        body: { reason: "Revoked from A1 Suite identity console." }
      });
      setActionState(`session-revoke:done:${sessionId}`);
      onReload();
    } catch {
      setActionState(`session-revoke:error:${sessionId}`);
    }
  }

  async function captureSemanticSnapshot() {
    setActionState("semantic-snapshot:capture");
    try {
      await api("/api/analytics/semantic-snapshots", {
        method: "POST",
        body: {
          reportDate: armeniaDateString(),
          note: "Workspace metric snapshot for owner and accountant reporting."
        }
      });
      setActionState("semantic-snapshot:done");
      onReload();
    } catch {
      setActionState("semantic-snapshot:error");
    }
  }

  async function createAnalyticsReport(reportType) {
    setActionState(`analytics-report:${reportType}`);
    try {
      await api("/api/analytics/reports", {
        method: "POST",
        body: {
          reportType,
          periodKey: armeniaMonthString(),
          format: reportType === "accountant" ? "csv" : "json",
          note: `${reportType} report generated from workspace metric catalog.`
        }
      });
      setActionState(`analytics-report:done:${reportType}`);
      onReload();
    } catch {
      setActionState(`analytics-report:error:${reportType}`);
    }
  }

  async function createExpense(body) {
    setActionState("expense:create"); setActionError("");
    try {
      await api("/api/finance/expenses", { method: "POST", body });
      setActionState("expense:done");
      onReload();
    } catch (e) {
      setActionState("expense:error");
      reportActionError(e);
    }
  }
  async function requestQuoteApproval(quoteId) {
    setActionState(`quote:approve:${quoteId}`);
    try {
      await api(`/api/crm/quotes/${quoteId}/request-approval`, { method: "POST", body: {} });
      setActionState(`quote:approve:done:${quoteId}`);
      onReload();
    } catch {
      setActionState(`quote:approve:error:${quoteId}`);
    }
  }
  async function createQuote(body) {
    setActionState("quote:create");
    try {
      await api("/api/crm/quotes", { method: "POST", body });
      setActionState("quote:create:done");
      onReload();
    } catch {
      setActionState("quote:create:error");
    }
  }
  async function createBill(body) {
    setActionState("bill:create"); setActionError("");
    try { await api("/api/finance/bills", { method: "POST", body }); setActionState("bill:done"); onReload(); }
    catch (e) { setActionState("bill:error"); reportActionError(e); }
  }
  async function runPayroll(body) {
    setActionState("payroll:run"); setActionError("");
    try { await api("/api/payroll/run", { method: "POST", body }); setActionState("payroll:done"); onReload(); }
    catch (e) { setActionState("payroll:error"); reportActionError(e); }
  }
  async function setOpeningBalances(body) {
    setActionState("opening-balances:set"); setActionError("");
    try { await api("/api/finance/opening-balances", { method: "POST", body }); setActionState("opening-balances:done"); onReload(); }
    catch (e) { setActionState("opening-balances:error"); reportActionError(e); }
  }
  async function lawSearch(query) {
    return api(`/api/legal/law-search?q=${encodeURIComponent(query)}`);
  }

  async function capturePilotLead() {
    setActionState("lead:capture");
    try {
      await api("/api/crm/leads", {
        method: "POST",
        body: {
          companyName: "Էլիտ Դենտալ Քլինիք",
          contactName: "Լիլիթ Մարտիրոսյան",
          email: "lilit@elitedental.am",
          phone: "+374 93 444555",
          taxId: "02666001",
          segment: "Clinic",
          source: "Instagram",
          channel: "WhatsApp",
          interest: "Patient retention automation with HayHashvapah invoice handoff and WhatsApp reminders",
          estimatedValue: 2800000,
          consentStatus: "marketing-consent-recorded"
        }
      });
      setActionState("lead:done");
      onReload();
    } catch {
      setActionState("lead:error");
    }
  }

  async function convertHotLead(lead) {
    setActionState(`lead:convert:${lead.id}`);
    try {
      const converted = await api(`/api/crm/leads/${lead.id}/convert`, {
        method: "POST",
        body: {
          dealTitle: `${lead.companyName} onboarding package`,
          nextStep: "Send quote and schedule onboarding call",
          forecastCategory: lead.rating === "hot" ? "commit" : "pipeline"
        }
      });
      setActionState(`lead:converted:${lead.id}`);
      onReload();
    } catch {
      setActionState(`lead:error:${lead.id}`);
    }
  }

  async function updateForecastCommit(dealId = "deal-nare-retainer") {
    setActionState(`forecast:${dealId}`);
    try {
      await api(`/api/crm/deals/${dealId}/forecast`, {
        method: "POST",
        body: {
          forecastCategory: "commit",
          closeDate: "2026-06-15",
          managerNote: "Clinic buyer confirmed budget; quote is sent; HayHashvapah invoice handoff must be ready after acceptance."
        }
      });
      setActionState(`forecast:done:${dealId}`);
      onReload();
    } catch {
      setActionState(`forecast:error:${dealId}`);
    }
  }

  async function generateDealRiskBrief(dealId = "deal-nare-retainer") {
    setActionState(`deal-risk:${dealId}`);
    try {
      await api("/api/ai/deal-risk-briefs", {
        method: "POST",
        body: {
          dealId,
          prompt: "Generate grounded advisory deal risk before forecast review."
        }
      });
      setActionState(`deal-risk:done:${dealId}`);
      onReload();
    } catch {
      setActionState(`deal-risk:error:${dealId}`);
    }
  }

  async function generateInvoiceOverdueExplanation(invoiceId = "inv-1007") {
    setActionState(`invoice-ai:${invoiceId}`);
    try {
      await api("/api/ai/invoice-overdue-explanations", {
        method: "POST",
        body: {
          invoiceId,
          prompt: "Explain overdue invoice and suggest accountant-reviewed follow-up."
        }
      });
      setActionState(`invoice-ai:done:${invoiceId}`);
      onReload();
    } catch {
      setActionState(`invoice-ai:error:${invoiceId}`);
    }
  }

  async function generateTicketSummary(caseId = "case-nare-vat") {
    setActionState(`ticket-ai:${caseId}`);
    try {
      await api("/api/ai/ticket-summaries", {
        method: "POST",
        body: {
          caseId,
          prompt: "Summarize ticket and recommend reviewed knowledge before reply."
        }
      });
      setActionState(`ticket-ai:done:${caseId}`);
      onReload();
    } catch {
      setActionState(`ticket-ai:error:${caseId}`);
    }
  }

  async function generateWorkflowBuilderSuggestion() {
    setActionState("workflow-ai:suggest");
    try {
      await api("/api/ai/workflow-builder-suggestions", {
        method: "POST",
        body: {
          prompt: "Build a governed workflow for overdue HayHashvapah invoices to create CRM collection tasks with approval, dry-run, and test-event validation."
        }
      });
      setActionState("workflow-ai:done");
      onReload();
    } catch {
      setActionState("workflow-ai:error");
    }
  }

  async function createQuoteApproval() {
    setActionState("quote-approval:running");
    try {
      const created = await api("/api/crm/quotes", {
        method: "POST",
        body: {
          customerId: "cust-van",
          dealId: "deal-van-season",
          title: "Tour booking automation launch",
          validUntil: "2026-06-30",
          lines: [
            { description: "Booking form and WhatsApp follow-up setup", quantity: 1, unitPrice: 480000 },
            { description: "HayHashvapah invoice handoff checklist", quantity: 1, unitPrice: 240000 }
          ]
        }
      });
      const requested = await api(`/api/crm/quotes/${created.quote.id}/request-approval`, {
        method: "POST",
        body: { note: "Release public quote after owner review." }
      });
      setCreatedQuote(created.quote);
      setQuoteApproval(requested.approval);
      setActionState("quote-approval:done");
    } catch {
      setActionState("quote-approval:error");
    }
  }

  async function escalateServiceCase(serviceCase) {
    setActionState(`escalate:${serviceCase.id}`);
    try {
      await api(`/api/service/cases/${serviceCase.id}/escalate`, {
        method: "POST",
        body: {
          severity: "sla-risk",
          reason: "Supervisor escalation from Service Hub before SLA breach."
        }
      });
      setActionState(`done:${serviceCase.id}`);
      onReload();
    } catch {
      setActionState(`error:${serviceCase.id}`);
    }
  }

  async function resolveServiceCase(serviceCase) {
    setActionState(`resolve:${serviceCase.id}`);
    try {
      await api(`/api/service/cases/${serviceCase.id}/resolve`, {
        method: "POST",
        body: {
          resolutionCode: "answered-with-tax-review",
          summary: "Customer confirmed the reviewed service answer and the HayHashvapah handoff is ready.",
          satisfactionScore: 5,
          customerConfirmedAt: new Date().toISOString()
        }
      });
      setActionState(`done:${serviceCase.id}`);
      onReload();
    } catch {
      setActionState(`error:${serviceCase.id}`);
    }
  }

  async function createTicket(body) {
    setActionState("ticket:create"); setActionError("");
    try { await api("/api/service/cases", { method: "POST", body }); setActionState("ticket:create:done"); onReload(); }
    catch (e) { setActionState("ticket:create:error"); reportActionError(e); }
  }
  async function updateTicket(caseId, patch) {
    setActionState(`ticket:update:${caseId}`); setActionError("");
    try { await api(`/api/service/cases/${caseId}`, { method: "PATCH", body: patch }); setActionState("ticket:update:done"); onReload(); }
    catch (e) { setActionState("ticket:update:error"); reportActionError(e); }
  }
  async function createEmployee(body) {
    setActionState("employee:create"); setActionError("");
    try { await api("/api/people/employees", { method: "POST", body }); setActionState("employee:create:done"); onReload(); }
    catch (e) { setActionState("employee:create:error"); reportActionError(e); }
  }
  async function runEmployeePayroll(employeeId) {
    setActionState(`payroll:${employeeId}`); setActionError("");
    try { await api(`/api/people/employees/${employeeId}/run-payroll`, { method: "POST", body: {} }); setActionState(`payroll:done:${employeeId}`); onReload(); }
    catch (e) { setActionState(`payroll:error:${employeeId}`); reportActionError(e); }
  }
  async function createDocument(body) {
    setActionState("doc:create"); setActionError("");
    try { await api("/api/docs/documents", { method: "POST", body }); setActionState("doc:create:done"); onReload(); }
    catch (e) { setActionState("doc:create:error"); reportActionError(e); }
  }
  async function generateFromTemplate(templateId, body) {
    setActionState("doc:create"); setActionError("");
    try { await api(`/api/docs/templates/${templateId}/generate`, { method: "POST", body }); setActionState("doc:create:done"); onReload(); }
    catch (e) { setActionState("doc:create:error"); reportActionError(e); }
  }
  async function addDocSigner(documentId, signerName) {
    setActionState(`doc:act:${documentId}`); setActionError("");
    try { await api(`/api/docs/documents/${documentId}/signers`, { method: "POST", body: { signerName } }); setActionState(`doc:act:done:${documentId}`); onReload(); }
    catch (e) { setActionState(`doc:act:error:${documentId}`); reportActionError(e); }
  }
  async function sendDocument(documentId) {
    setActionState(`doc:act:${documentId}`); setActionError("");
    try { await api(`/api/docs/documents/${documentId}/send`, { method: "POST", body: {} }); setActionState(`doc:act:done:${documentId}`); onReload(); }
    catch (e) { setActionState(`doc:act:error:${documentId}`); reportActionError(e); }
  }
  async function signDocument(documentId, signerId) {
    setActionState(`doc:act:${documentId}`); setActionError("");
    try { await api(`/api/docs/documents/${documentId}/sign`, { method: "POST", body: { signerId } }); setActionState(`doc:act:done:${documentId}`); onReload(); }
    catch (e) { setActionState(`doc:act:error:${documentId}`); reportActionError(e); }
  }
  async function voidDocument(documentId) {
    setActionState(`doc:act:${documentId}`); setActionError("");
    try { await api(`/api/docs/documents/${documentId}/void`, { method: "POST", body: {} }); setActionState(`doc:act:done:${documentId}`); onReload(); }
    catch (e) { setActionState(`doc:act:error:${documentId}`); reportActionError(e); }
  }
  async function createProject(body) {
    setActionState("project:create"); setActionError("");
    try { await api("/api/projects", { method: "POST", body }); setActionState("project:create:done"); onReload(); }
    catch (e) { setActionState("project:create:error"); reportActionError(e); }
  }
  async function createForm(body) {
    setActionState("form:create"); setActionError("");
    try { await api("/api/forms", { method: "POST", body }); setActionState("form:create:done"); onReload(); }
    catch (e) { setActionState("form:create:error"); reportActionError(e); }
  }
  async function toggleFormPublish(formId, status) {
    setActionState(`form:act:${formId}`); setActionError("");
    try { await api(`/api/forms/${formId}`, { method: "PATCH", body: { status } }); setActionState(`form:act:done:${formId}`); onReload(); }
    catch (e) { setActionState(`form:act:error:${formId}`); reportActionError(e); }
  }
  async function addProjectTask(projectId, title) {
    setActionState(`project:act:${projectId}`); setActionError("");
    try { await api(`/api/projects/${projectId}/tasks`, { method: "POST", body: { title } }); setActionState(`project:act:done:${projectId}`); onReload(); }
    catch (e) { setActionState(`project:act:error:${projectId}`); reportActionError(e); }
  }
  async function updateProjectStatus(projectId, status) {
    setActionState(`project:act:${projectId}`); setActionError("");
    try { await api(`/api/projects/${projectId}`, { method: "PATCH", body: { status } }); setActionState(`project:act:done:${projectId}`); onReload(); }
    catch (e) { setActionState(`project:act:error:${projectId}`); reportActionError(e); }
  }
  async function logProjectTime(projectId, minutes) {
    setActionState(`project:act:${projectId}`); setActionError("");
    try { await api(`/api/projects/${projectId}/time-entries`, { method: "POST", body: { minutes } }); setActionState(`project:act:done:${projectId}`); onReload(); }
    catch (e) { setActionState(`project:act:error:${projectId}`); reportActionError(e); }
  }
  async function billProjectTime(projectId, hourlyRate) {
    setActionState(`project:act:${projectId}`); setActionError("");
    try { await api(`/api/projects/${projectId}/bill-time`, { method: "POST", body: { hourlyRate } }); setActionState(`project:act:done:${projectId}`); onReload(); }
    catch (e) { setActionState(`project:act:error:${projectId}`); reportActionError(e); }
  }
  async function updateEmployee(employeeId, patch) {
    setActionState(`employee:update:${employeeId}`); setActionError("");
    try { await api(`/api/people/employees/${employeeId}`, { method: "PATCH", body: patch }); setActionState(`employee:update:done:${employeeId}`); onReload(); }
    catch (e) { setActionState(`employee:update:error:${employeeId}`); reportActionError(e); }
  }

  const liveApprovals = quoteApproval && ["pending", "approved"].includes(quoteApproval.status)
    ? [
        quoteApproval,
        ...(serviceConsole?.approvals || []).filter(approval => approval.id !== quoteApproval.id)
      ]
    : (serviceConsole?.approvals || []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup compact">
          <img className="brand-logo" src="/a1-suite.svg" alt="A1 Suite" style={{ height: "32px", width: "auto", display: "block" }} />
          <div>
            <strong>A1 Suite</strong>
            <span>{suite.organization.market}</span>
          </div>
        </div>
        <nav className="app-nav">
          {suite.apps.map(app => {
            const targetAppId = normalizeSuiteAppId(app.id, assignedAppIds);
            return (
              <button
                key={app.id}
                className={targetAppId === selectedAppId ? "active" : ""}
                data-app-id={app.id}
                data-target-app-id={targetAppId}
                onClick={() => openApp(app.id)}
                title={app.description}
              >
                <span className="nav-icon">{app.name.slice(0, 1)}</span>
                <span>{app.name}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{suite.organization.name}</h1>
            <p>{suite.organization.legal_name} · ՀՎՀՀ {suite.organization.tax_id} · {suite.organization.currency}</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost" onClick={onReload}>Թարմացնել</button>
            <UserPill user={suite.user} />
          </div>
        </header>

        {actionError && (
          <div className="action-error-banner" role="alert">
            <span>⚠ {actionError}</span>
            <button className="ghost" type="button" onClick={() => setActionError("")}>Փակել</button>
          </div>
        )}

        <section className="kpi-grid">
          {suite.kpis.map(item => <Kpi key={item.label} item={item} />)}
        </section>

        <section className="control-row">
          <SelectedApp app={selected} onOpen={openApp} />
          <WorkflowStrip workflows={suite.workflows} />
        </section>

        {roleDashboard && <RoleDashboardPanel data={roleDashboard} />}
        {securityMfa && (
          <SecurityMfaPanel
            data={securityMfa}
            setup={mfaSetup}
            actionState={actionState}
            onEnroll={enrollMfa}
            onVerify={verifyMfa}
          />
        )}
        {adminSessions && (
          <SessionGovernancePanel
            data={adminSessions}
            actionState={actionState}
            canRevoke={["Owner", "Admin"].includes(suite.user.role)}
            onRevokeSession={revokeSession}
          />
        )}
        <ProductionReadinessPanel data={productionReadiness} />

        <section className="content-grid">
          <div id="suite-app-crm" className="suite-app-anchor">
            <Customer360
              data={customer360}
              actionState={actionState}
              onAskLegal={askLegalGuidance}
              onRecordPromise={recordPaymentPromise}
              onSendReminder={sendCollectionReminder}
              onRecordPayment={recordCollectionPayment}
              onImportBankTransaction={importBankTransaction}
              onReconcileBankTransaction={reconcileBankTransaction}
              onGenerateBrief={suite.user.role === "Owner" ? generateCustomerBrief : null}
            />
          </div>
          {canUseCopilot && (
          <div id="suite-app-copilot" className="suite-app-anchor">
            {suite.user.role === "Owner" && <AiOnboardingPanel api={api} />}
            <CopilotPanel
              customers={(serviceConsole && serviceConsole.customers) || []}
              docs={docs}
              people={people}
              appIds={assignedAppIds}
              onAsk={askCopilot}
              actionState={actionState}
            />
          </div>
          )}
          {crmLeadData && (
            <LeadPipeline
              data={crmLeadData}
              actionState={actionState}
              onCaptureLead={capturePilotLead}
              onConvertLead={convertHotLead}
            />
          )}
          {campaignPerformance && (
            <div id="suite-app-campaigns" className="suite-app-anchor">
              <CampaignRoiPanel data={campaignPerformance} />
            </div>
          )}
          {semanticMetrics && (
            <div id="suite-app-analytics" className="suite-app-anchor">
              <SemanticMetricsPanel
                data={semanticMetrics}
                snapshots={semanticSnapshots}
                reports={analyticsReports}
                userRole={suite.user.role}
                actionState={actionState}
                onCaptureSnapshot={["Owner", "Admin", "Accountant"].includes(suite.user.role) ? captureSemanticSnapshot : null}
                onCreateReport={["Owner", "Admin", "Accountant"].includes(suite.user.role) ? createAnalyticsReport : null}
              />
            </div>
          )}
          {receivablesAging && (
            <div className="suite-app-anchor">
              <ReceivablesAgingPanel
                data={receivablesAging}
                actionState={actionState}
                onGenerateInvoiceExplanation={["Owner", "Admin", "Accountant", "Salesperson"].includes(suite.user.role) ? generateInvoiceOverdueExplanation : null}
              />
            </div>
          )}
          {finance && (
            <>
              <div id="suite-app-finance" className="suite-app-anchor">
                <FinanceTrialBalancePanel data={finance.trialBalance} />
              </div>
              <FinanceStatementsPanel data={finance.statements} />
              <FinanceVatPanel data={finance.vat} />
              <FinanceTaxRatesPanel data={finance.taxRates} />
              <FinanceChartOfAccountsPanel data={finance.chartOfAccounts} />
              <FinanceLocalizationToolsPanel request={api} requestText={apiText} />
              <FinanceExpenseForm onCreate={createExpense} actionState={actionState} />
              <FinanceBillForm onCreate={createBill} actionState={actionState} />
              <FinancePayrollForm onRun={runPayroll} actionState={actionState} />
              <FinancePayablesPanel data={finance.payables} />
              <FinanceExpenseListPanel data={finance.expenses} />
              <FinanceBillListPanel data={finance.bills} />
              <FinancePayrollRunsPanel data={finance.payrollRuns} />
              <FinanceOpeningBalancesPanel data={finance.openingBalances} />
              {["Owner", "Admin", "Accountant"].includes(suite.user.role) && (
                <FinanceOpeningBalancesForm onSubmit={setOpeningBalances} actionState={actionState} chartOfAccounts={finance.chartOfAccounts} />
              )}
              <LegalSearchPanel onSearch={lawSearch} />
            </>
          )}
          {people && (
            <>
              <div id="suite-app-people" className="suite-app-anchor">
                <PeopleRegistryPanel data={people} onRunPayroll={["Owner", "Admin", "Accountant"].includes(suite.user.role) ? runEmployeePayroll : null} onUpdate={["Owner", "Admin", "Accountant"].includes(suite.user.role) ? updateEmployee : null} onLoadHistory={async employeeId => (await api(`/api/people/employees/${employeeId}/payroll-runs`)).runs} actionState={actionState} />
              </div>
              {["Owner", "Admin", "Accountant"].includes(suite.user.role) && (
                <PeopleEmployeeForm onCreate={createEmployee} actionState={actionState} />
              )}
            </>
          )}
          {docs && (
            <>
              <div id="suite-app-docs" className="suite-app-anchor">
                <DocsRegistryPanel
                  data={docs}
                  canWrite={["Owner", "Admin", "Operator", "Salesperson", "Service Manager"].includes(suite.user.role)}
                  onAddSigner={addDocSigner}
                  onSend={sendDocument}
                  onSign={signDocument}
                  onVoid={voidDocument}
                  actionState={actionState}
                />
              </div>
              {["Owner", "Admin", "Operator", "Salesperson", "Service Manager"].includes(suite.user.role) && (
                <DocsCreateForm customers={(serviceConsole && serviceConsole.customers) || []} templates={docs.templates || []} onCreate={createDocument} onGenerate={generateFromTemplate} actionState={actionState} />
              )}
            </>
          )}
          {projects && (
            <>
              <div id="suite-app-projects" className="suite-app-anchor">
                <ProjectsBoardPanel
                  data={projects}
                  canWrite={["Owner", "Admin", "Operator", "Salesperson", "Service Manager"].includes(suite.user.role)}
                  canBill={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                  onAddTask={addProjectTask}
                  onUpdateStatus={updateProjectStatus}
                  onLogTime={logProjectTime}
                  onBillTime={billProjectTime}
                  onLoadDetail={async projectId => (await api(`/api/projects/${projectId}`)).project}
                  actionState={actionState}
                />
              </div>
              {["Owner", "Admin", "Operator", "Salesperson", "Service Manager"].includes(suite.user.role) && (
                <ProjectCreateForm customers={(serviceConsole && serviceConsole.customers) || []} onCreate={createProject} actionState={actionState} />
              )}
            </>
          )}
          {inventory && (
            <div id="suite-app-inventory" className="suite-app-anchor">
              <InventoryWorkspacePanel
                data={inventory}
                canMove={["Owner", "Admin", "Operator", "Accountant"].includes(suite.user.role)}
                actionState={actionState}
                onCreateMove={createStockMove}
              />
            </div>
          )}
          {purchase && (
            <div id="suite-app-purchase" className="suite-app-anchor">
              <PurchaseWorkspacePanel
                data={purchase}
                canWrite={["Owner", "Admin", "Operator", "Accountant"].includes(suite.user.role)}
                canBill={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                actionState={actionState}
                onCreateOrder={createPurchaseOrder}
                onConfirmOrder={confirmPurchaseOrder}
                onReceiveOrder={receivePurchaseOrder}
                onReturnOrder={returnPurchaseOrder}
                onBillOrder={billPurchaseOrder}
              />
            </div>
          )}
          {forms && (
            <>
              <div id="suite-app-forms" className="suite-app-anchor">
                <FormsRegistryPanel
                  data={forms}
                  canWrite={["Owner", "Admin", "Operator", "Salesperson", "Service Manager"].includes(suite.user.role)}
                  onPublishToggle={toggleFormPublish}
                  actionState={actionState}
                />
              </div>
              {["Owner", "Admin", "Operator", "Salesperson", "Service Manager"].includes(suite.user.role) && (
                <FormCreateForm onCreate={createForm} actionState={actionState} />
              )}
            </>
          )}
          {crmForecastData && (
            <ForecastPanel
              data={crmForecastData}
              actionState={actionState}
              onUpdateForecast={updateForecastCommit}
              onGenerateDealRisk={["Owner", "Admin", "Salesperson"].includes(suite.user.role) ? generateDealRiskBrief : null}
            />
          )}
          {crmQuotes && (
            <CrmQuotesPanel data={crmQuotes} actionState={actionState} onRequestApproval={requestQuoteApproval} />
          )}
          {crmForecastData && (
            <>
              <CrmQuoteForm deals={crmForecastData.deals} onCreate={createQuote} actionState={actionState} />
              <CrmDealsBoard data={crmForecastData} />
            </>
          )}
          {crmActivities && (
            <CrmActivityPanel data={crmActivities} />
          )}
          <QuoteApprovalPanel
            quote={createdQuote}
            approval={quoteApproval}
            actionState={actionState}
            onCreateQuoteApproval={createQuoteApproval}
          />
          <EventStream events={suite.events || []} />
          <div id="suite-app-desk" className="suite-app-anchor">
            <ServiceConsole
              data={serviceConsole}
              actionState={actionState}
              onEscalate={escalateServiceCase}
              onResolve={resolveServiceCase}
              onGenerateTicketSummary={["Owner", "Admin", "Operator", "Support", "Service Manager"].includes(suite.user.role) ? generateTicketSummary : null}
            />
          </div>
          {serviceConsole && (
            <>
              <CreateTicketForm customers={serviceConsole.customers} onCreate={createTicket} actionState={actionState} />
              <DeskTicketList data={serviceConsole} onUpdate={updateTicket} actionState={actionState} />
            </>
          )}
          <div id="suite-app-flow" className="suite-app-anchor">
            <ApprovalQueue
              approvals={liveApprovals}
              runs={serviceConsole?.runs || []}
              rules={serviceConsole?.rules || []}
              dryRuns={serviceConsole?.dryRuns || []}
              testEvents={serviceConsole?.testEvents || []}
              suggestions={serviceConsole?.workflowBuilderSuggestions || []}
              actionState={actionState}
              onExecute={approveAndExecute}
              onDryRun={runOverdueWorkflowDryRun}
              onTestEvent={runOverdueWorkflowTestEvent}
              onToggleRule={toggleOverdueWorkflowRule}
              onRollbackRule={rollbackWorkflowRule}
              onRetryRun={retryWorkflowRun}
              onGenerateSuggestion={["Owner", "Admin"].includes(suite.user.role) ? generateWorkflowBuilderSuggestion : null}
            />
          </div>
          <WebhookDeliveries deliveries={webhookDeliveries || []} />
          {pilotTemplateData && (
            <>
              <PilotTemplatePanel
                data={pilotTemplateData}
                createdInstall={createdPilotInstall}
                actionState={actionState}
                canInstall={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onInstall={installClinicPilotTemplate}
              />
              <PilotOwnerBriefPanel
                briefs={pilotOwnerBriefs || []}
                createdBrief={createdPilotBrief}
                templateData={pilotTemplateData}
                createdInstall={createdPilotInstall}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotOwnerBrief}
              />
              <PilotOperatorWorkbenchPanel
                workbenches={pilotOperatorWorkbenches || []}
                createdWorkbench={createdPilotWorkbench}
                ownerBriefs={pilotOwnerBriefs || []}
                createdBrief={createdPilotBrief}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Operator", "Salesperson", "Service Manager"].includes(suite.user.role)}
                onCreate={createPilotOperatorWorkbench}
              />
              {["Owner", "Admin", "Accountant", "Auditor"].includes(suite.user.role) && (
                <PilotAccountantReviewPanel
                  reviews={pilotAccountantReviews || []}
                  createdReview={createdPilotAccountantReview}
                  workbenches={pilotOperatorWorkbenches || []}
                  createdWorkbench={createdPilotWorkbench}
                  actionState={actionState}
                  canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                  onCreate={createPilotAccountantReview}
                />
              )}
              <PilotLaunchReadinessPanel
                packets={pilotLaunchReadinessPackets || []}
                createdPacket={createdPilotLaunchReadiness}
                accountantReviews={pilotAccountantReviews || []}
                createdAccountantReview={createdPilotAccountantReview}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotLaunchReadiness}
              />
              <PilotLaunchRemediationPanel
                plans={pilotLaunchRemediationPlans || []}
                createdPlan={createdPilotRemediationPlan}
                resolutions={pilotRemediationResolutions || []}
                createdResolution={createdPilotResolution}
                launchPackets={pilotLaunchReadinessPackets || []}
                createdLaunchPacket={createdPilotLaunchReadiness}
                actionState={actionState}
                userRole={suite.user.role}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotRemediationPlan}
                onResolveAction={resolvePilotRemediationAction}
              />
              <PilotLaunchClearancePanel
                packets={pilotLaunchClearancePackets || []}
                createdPacket={createdPilotClearance}
                plans={pilotLaunchRemediationPlans || []}
                createdPlan={createdPilotRemediationPlan}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotLaunchClearance}
              />
              <PilotPaidOfferPanel
                offers={pilotPaidOffers || []}
                createdOffer={createdPilotPaidOffer}
                clearancePackets={pilotLaunchClearancePackets || []}
                createdClearance={createdPilotClearance}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotPaidOffer}
              />
              <PilotQuoteHandoffPanel
                handoffs={pilotQuoteHandoffs || []}
                createdHandoff={createdPilotQuoteHandoff}
                offers={pilotPaidOffers || []}
                createdOffer={createdPilotPaidOffer}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotQuoteHandoff}
              />
              <PilotQuoteReleasePanel
                releases={pilotQuoteReleases || []}
                createdRelease={createdPilotQuoteRelease}
                handoffs={pilotQuoteHandoffs || []}
                createdHandoff={createdPilotQuoteHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotQuoteRelease}
              />
              <PilotAcceptanceHandoffPanel
                packets={pilotQuoteAcceptanceHandoffs || []}
                createdPacket={createdPilotAcceptanceHandoff}
                releases={pilotQuoteReleases || []}
                createdRelease={createdPilotQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotAcceptanceHandoff}
              />
              <PilotHayhashvapahDraftPanel
                packets={pilotHayhashvapahDrafts || []}
                createdPacket={createdPilotHayhashvapahDraft}
                acceptanceHandoffs={pilotQuoteAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotHayhashvapahDraft}
              />
              <PilotOfficialInvoicePanel
                packets={pilotOfficialInvoices || []}
                createdPacket={createdPilotOfficialInvoice}
                draftPackets={pilotHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotOfficialInvoice}
              />
              <PilotPaymentCollectionPanel
                packets={pilotPaymentCollections || []}
                createdPacket={createdPilotPaymentCollection}
                postingPackets={pilotOfficialInvoices || []}
                createdPostingPacket={createdPilotOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotPaymentCollection}
              />
              <PilotCloseoutPanel
                packets={pilotCloseouts || []}
                createdPacket={createdPilotCloseout}
                paymentPackets={pilotPaymentCollections || []}
                createdPaymentPacket={createdPilotPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotCloseout}
              />
              <PilotRenewalQuotePanel
                handoffs={pilotRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotRenewalQuote}
                closeouts={pilotCloseouts || []}
                createdCloseout={createdPilotCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotRenewalQuote}
              />
              <PilotRenewalQuoteReleasePanel
                packets={pilotRenewalQuoteReleases || []}
                createdPacket={createdPilotRenewalQuoteRelease}
                handoffs={pilotRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotRenewalQuoteRelease}
              />
              <PilotRenewalAcceptanceHandoffPanel
                packets={pilotRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotRenewalAcceptanceHandoff}
                releases={pilotRenewalQuoteReleases || []}
                createdRelease={createdPilotRenewalQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotRenewalAcceptanceHandoff}
              />
              <PilotRenewalHayhashvapahDraftPanel
                packets={pilotRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotRenewalHayhashvapahDraft}
              />
              <PilotRenewalOfficialInvoicePanel
                packets={pilotRenewalOfficialInvoices || []}
                createdPacket={createdPilotRenewalOfficialInvoice}
                draftPackets={pilotRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotRenewalOfficialInvoice}
              />
              <PilotRenewalPaymentCollectionPanel
                packets={pilotRenewalPaymentCollections || []}
                createdPacket={createdPilotRenewalPaymentCollection}
                postingPackets={pilotRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotRenewalPaymentCollection}
              />
              <PilotRenewalCloseoutPanel
                packets={pilotRenewalCloseouts || []}
                createdPacket={createdPilotRenewalCloseout}
                paymentPackets={pilotRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotRenewalCloseout}
              />
              <PilotNextRenewalQuotePanel
                handoffs={pilotNextRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotNextRenewalQuote}
                closeouts={pilotRenewalCloseouts || []}
                createdCloseout={createdPilotRenewalCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotNextRenewalQuote}
              />
              <PilotNextRenewalQuoteReleasePanel
                packets={pilotNextRenewalQuoteReleases || []}
                createdPacket={createdPilotNextRenewalQuoteRelease}
                handoffs={pilotNextRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotNextRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotNextRenewalQuoteRelease}
              />
              <PilotNextRenewalAcceptanceHandoffPanel
                packets={pilotNextRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotNextRenewalAcceptanceHandoff}
                releases={pilotNextRenewalQuoteReleases || []}
                createdRelease={createdPilotNextRenewalQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextRenewalAcceptanceHandoff}
              />
              <PilotNextRenewalHayhashvapahDraftPanel
                packets={pilotNextRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotNextRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotNextRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotNextRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextRenewalHayhashvapahDraft}
              />
              <PilotNextRenewalOfficialInvoicePanel
                packets={pilotNextRenewalOfficialInvoices || []}
                createdPacket={createdPilotNextRenewalOfficialInvoice}
                draftPackets={pilotNextRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotNextRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextRenewalOfficialInvoice}
              />
              <PilotNextRenewalPaymentCollectionPanel
                packets={pilotNextRenewalPaymentCollections || []}
                createdPacket={createdPilotNextRenewalPaymentCollection}
                postingPackets={pilotNextRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotNextRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextRenewalPaymentCollection}
              />
              <PilotNextRenewalCloseoutPanel
                packets={pilotNextRenewalCloseouts || []}
                createdPacket={createdPilotNextRenewalCloseout}
                paymentPackets={pilotNextRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotNextRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotNextRenewalCloseout}
              />
              <PilotFollowingRenewalQuotePanel
                handoffs={pilotFollowingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotFollowingRenewalQuote}
                closeouts={pilotNextRenewalCloseouts || []}
                createdCloseout={createdPilotNextRenewalCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotFollowingRenewalQuote}
              />
              <PilotFollowingRenewalQuoteReleasePanel
                packets={pilotFollowingRenewalQuoteReleases || []}
                createdPacket={createdPilotFollowingRenewalQuoteRelease}
                handoffs={pilotFollowingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotFollowingRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotFollowingRenewalQuoteRelease}
              />
              <PilotFollowingRenewalAcceptanceHandoffPanel
                packets={pilotFollowingRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotFollowingRenewalAcceptanceHandoff}
                releases={pilotFollowingRenewalQuoteReleases || []}
                createdRelease={createdPilotFollowingRenewalQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotFollowingRenewalAcceptanceHandoff}
              />
              <PilotFollowingRenewalHayhashvapahDraftPanel
                packets={pilotFollowingRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotFollowingRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotFollowingRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotFollowingRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotFollowingRenewalHayhashvapahDraft}
              />
              <PilotFollowingRenewalOfficialInvoicePanel
                packets={pilotFollowingRenewalOfficialInvoices || []}
                createdPacket={createdPilotFollowingRenewalOfficialInvoice}
                draftPackets={pilotFollowingRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotFollowingRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotFollowingRenewalOfficialInvoice}
              />
              <PilotFollowingRenewalPaymentCollectionPanel
                packets={pilotFollowingRenewalPaymentCollections || []}
                createdPacket={createdPilotFollowingRenewalPaymentCollection}
                postingPackets={pilotFollowingRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotFollowingRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotFollowingRenewalPaymentCollection}
              />
              <PilotFollowingRenewalCloseoutPanel
                packets={pilotFollowingRenewalCloseouts || []}
                createdPacket={createdPilotFollowingRenewalCloseout}
                paymentPackets={pilotFollowingRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotFollowingRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotFollowingRenewalCloseout}
              />
              <PilotSubsequentRenewalQuotePanel
                handoffs={pilotSubsequentRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotSubsequentRenewalQuote}
                closeouts={pilotFollowingRenewalCloseouts || []}
                createdCloseout={createdPilotFollowingRenewalCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotSubsequentRenewalQuote}
              />
              <PilotSubsequentRenewalQuoteReleasePanel
                packets={pilotSubsequentRenewalQuoteReleases || []}
                createdPacket={createdPilotSubsequentRenewalQuoteRelease}
                handoffs={pilotSubsequentRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotSubsequentRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotSubsequentRenewalQuoteRelease}
              />
              <PilotSubsequentRenewalAcceptanceHandoffPanel
                packets={pilotSubsequentRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotSubsequentRenewalAcceptanceHandoff}
                releases={pilotSubsequentRenewalQuoteReleases || []}
                createdRelease={createdPilotSubsequentRenewalQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotSubsequentRenewalAcceptanceHandoff}
              />
              <PilotSubsequentRenewalHayhashvapahDraftPanel
                packets={pilotSubsequentRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotSubsequentRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotSubsequentRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotSubsequentRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotSubsequentRenewalHayhashvapahDraft}
              />
              <PilotSubsequentRenewalOfficialInvoicePanel
                packets={pilotSubsequentRenewalOfficialInvoices || []}
                createdPacket={createdPilotSubsequentRenewalOfficialInvoice}
                draftPackets={pilotSubsequentRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotSubsequentRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotSubsequentRenewalOfficialInvoice}
              />
              <PilotSubsequentRenewalPaymentCollectionPanel
                packets={pilotSubsequentRenewalPaymentCollections || []}
                createdPacket={createdPilotSubsequentRenewalPaymentCollection}
                postingPackets={pilotSubsequentRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotSubsequentRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotSubsequentRenewalPaymentCollection}
              />
              <PilotSubsequentRenewalCloseoutPanel
                packets={pilotSubsequentRenewalCloseouts || []}
                createdPacket={createdPilotSubsequentRenewalCloseout}
                paymentPackets={pilotSubsequentRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotSubsequentRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotSubsequentRenewalCloseout}
              />
              <PilotContinuationRenewalQuotePanel
                handoffs={pilotContinuationRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotContinuationRenewalQuote}
                closeouts={pilotSubsequentRenewalCloseouts || []}
                createdCloseout={createdPilotSubsequentRenewalCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotContinuationRenewalQuote}
              />
              <PilotContinuationRenewalQuoteReleasePanel
                packets={pilotContinuationRenewalQuoteReleases || []}
                createdPacket={createdPilotContinuationRenewalQuoteRelease}
                handoffs={pilotContinuationRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotContinuationRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotContinuationRenewalQuoteRelease}
              />
              <PilotContinuationRenewalAcceptanceHandoffPanel
                packets={pilotContinuationRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotContinuationRenewalAcceptanceHandoff}
                releases={pilotContinuationRenewalQuoteReleases || []}
                createdRelease={createdPilotContinuationRenewalQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotContinuationRenewalAcceptanceHandoff}
              />
              <PilotContinuationRenewalHayhashvapahDraftPanel
                packets={pilotContinuationRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotContinuationRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotContinuationRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotContinuationRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotContinuationRenewalHayhashvapahDraft}
              />
              <PilotContinuationRenewalOfficialInvoicePanel
                packets={pilotContinuationRenewalOfficialInvoices || []}
                createdPacket={createdPilotContinuationRenewalOfficialInvoice}
                draftPackets={pilotContinuationRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotContinuationRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotContinuationRenewalOfficialInvoice}
              />
              <PilotContinuationRenewalPaymentCollectionPanel
                packets={pilotContinuationRenewalPaymentCollections || []}
                createdPacket={createdPilotContinuationRenewalPaymentCollection}
                postingPackets={pilotContinuationRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotContinuationRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotContinuationRenewalPaymentCollection}
              />
              <PilotContinuationRenewalCloseoutPanel
                packets={pilotContinuationRenewalCloseouts || []}
                createdPacket={createdPilotContinuationRenewalCloseout}
                paymentPackets={pilotContinuationRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotContinuationRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotContinuationRenewalCloseout}
              />
              <PilotOngoingRenewalQuotePanel
                handoffs={pilotOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotOngoingRenewalQuote}
                closeouts={pilotContinuationRenewalCloseouts || []}
                createdCloseout={createdPilotContinuationRenewalCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotOngoingRenewalQuote}
              />
              <PilotOngoingRenewalQuoteReleasePanel
                packets={pilotOngoingRenewalQuoteReleases || []}
                createdPacket={createdPilotOngoingRenewalQuoteRelease}
                handoffs={pilotOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotOngoingRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotOngoingRenewalQuoteRelease}
              />
              <PilotOngoingRenewalAcceptanceHandoffPanel
                packets={pilotOngoingRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotOngoingRenewalAcceptanceHandoff}
                releases={pilotOngoingRenewalQuoteReleases || []}
                createdRelease={createdPilotOngoingRenewalQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotOngoingRenewalAcceptanceHandoff}
              />
              <PilotOngoingRenewalHayhashvapahDraftPanel
                packets={pilotOngoingRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotOngoingRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotOngoingRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotOngoingRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotOngoingRenewalHayhashvapahDraft}
              />
              <PilotOngoingRenewalOfficialInvoicePanel
                packets={pilotOngoingRenewalOfficialInvoices || []}
                createdPacket={createdPilotOngoingRenewalOfficialInvoice}
                draftPackets={pilotOngoingRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotOngoingRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotOngoingRenewalOfficialInvoice}
              />
              <PilotOngoingRenewalPaymentCollectionPanel
                packets={pilotOngoingRenewalPaymentCollections || []}
                createdPacket={createdPilotOngoingRenewalPaymentCollection}
                postingPackets={pilotOngoingRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotOngoingRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotOngoingRenewalPaymentCollection}
              />
              <PilotOngoingRenewalCloseoutPanel
                packets={pilotOngoingRenewalCloseouts || []}
                createdPacket={createdPilotOngoingRenewalCloseout}
                paymentPackets={pilotOngoingRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotOngoingRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotOngoingRenewalCloseout}
              />
              <PilotNextOngoingRenewalQuotePanel
                handoffs={pilotNextOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotNextOngoingRenewalQuote}
                closeouts={pilotOngoingRenewalCloseouts || []}
                createdCloseout={createdPilotOngoingRenewalCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotNextOngoingRenewalQuote}
              />
              <PilotNextOngoingRenewalQuoteReleasePanel
                packets={pilotNextOngoingRenewalQuoteReleases || []}
                createdPacket={createdPilotNextOngoingRenewalQuoteRelease}
                handoffs={pilotNextOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotNextOngoingRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotNextOngoingRenewalQuoteRelease}
              />
              <PilotNextOngoingRenewalAcceptanceHandoffPanel
                packets={pilotNextOngoingRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotNextOngoingRenewalAcceptanceHandoff}
                releases={pilotNextOngoingRenewalQuoteReleases || []}
                createdRelease={createdPilotNextOngoingRenewalQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextOngoingRenewalAcceptanceHandoff}
              />
              <PilotNextOngoingRenewalHayhashvapahDraftPanel
                packets={pilotNextOngoingRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotNextOngoingRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotNextOngoingRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotNextOngoingRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextOngoingRenewalHayhashvapahDraft}
              />
              <PilotNextOngoingRenewalOfficialInvoicePanel
                packets={pilotNextOngoingRenewalOfficialInvoices || []}
                createdPacket={createdPilotNextOngoingRenewalOfficialInvoice}
                draftPackets={pilotNextOngoingRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotNextOngoingRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextOngoingRenewalOfficialInvoice}
              />
              <PilotNextOngoingRenewalPaymentCollectionPanel
                packets={pilotNextOngoingRenewalPaymentCollections || []}
                createdPacket={createdPilotNextOngoingRenewalPaymentCollection}
                postingPackets={pilotNextOngoingRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotNextOngoingRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextOngoingRenewalPaymentCollection}
              />
              <PilotNextOngoingRenewalCloseoutPanel
                packets={pilotNextOngoingRenewalCloseouts || []}
                createdPacket={createdPilotNextOngoingRenewalCloseout}
                paymentPackets={pilotNextOngoingRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotNextOngoingRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotNextOngoingRenewalCloseout}
              />
              <PilotFollowingOngoingRenewalQuotePanel
                handoffs={pilotFollowingOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotFollowingOngoingRenewalQuote}
                closeouts={pilotNextOngoingRenewalCloseouts || []}
                createdCloseout={createdPilotNextOngoingRenewalCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotFollowingOngoingRenewalQuote}
              />
              <PilotFollowingOngoingRenewalQuoteReleasePanel
                packets={pilotFollowingOngoingRenewalQuoteReleases || []}
                createdPacket={createdPilotFollowingOngoingRenewalQuoteRelease}
                handoffs={pilotFollowingOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotFollowingOngoingRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotFollowingOngoingRenewalQuoteRelease}
              />
              <PilotFollowingOngoingRenewalAcceptanceHandoffPanel
                packets={pilotFollowingOngoingRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotFollowingOngoingRenewalAcceptanceHandoff}
                releases={pilotFollowingOngoingRenewalQuoteReleases || []}
                createdRelease={createdPilotFollowingOngoingRenewalQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotFollowingOngoingRenewalAcceptanceHandoff}
              />
              <PilotFollowingOngoingRenewalHayhashvapahDraftPanel
                packets={pilotFollowingOngoingRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotFollowingOngoingRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotFollowingOngoingRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotFollowingOngoingRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotFollowingOngoingRenewalHayhashvapahDraft}
              />
              <PilotFollowingOngoingRenewalOfficialInvoicePanel
                packets={pilotFollowingOngoingRenewalOfficialInvoices || []}
                createdPacket={createdPilotFollowingOngoingRenewalOfficialInvoice}
                draftPackets={pilotFollowingOngoingRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotFollowingOngoingRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotFollowingOngoingRenewalOfficialInvoice}
              />
              <PilotFollowingOngoingRenewalPaymentCollectionPanel
                packets={pilotFollowingOngoingRenewalPaymentCollections || []}
                createdPacket={createdPilotFollowingOngoingRenewalPaymentCollection}
                postingPackets={pilotFollowingOngoingRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotFollowingOngoingRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotFollowingOngoingRenewalPaymentCollection}
              />
              <PilotFollowingOngoingRenewalCloseoutPanel
                packets={pilotFollowingOngoingRenewalCloseouts || []}
                createdPacket={createdPilotFollowingOngoingRenewalCloseout}
                paymentPackets={pilotFollowingOngoingRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotFollowingOngoingRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotFollowingOngoingRenewalCloseout}
              />
              <PilotSubsequentOngoingRenewalQuotePanel
                handoffs={pilotSubsequentOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotSubsequentOngoingRenewalQuote}
                closeouts={pilotFollowingOngoingRenewalCloseouts || []}
                createdCloseout={createdPilotFollowingOngoingRenewalCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotSubsequentOngoingRenewalQuote}
              />
              <PilotSubsequentOngoingRenewalQuoteReleasePanel
                packets={pilotSubsequentOngoingRenewalQuoteReleases || []}
                createdPacket={createdPilotSubsequentOngoingRenewalQuoteRelease}
                handoffs={pilotSubsequentOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotSubsequentOngoingRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotSubsequentOngoingRenewalQuoteRelease}
              />
              <PilotSubsequentOngoingRenewalAcceptanceHandoffPanel
                packets={pilotSubsequentOngoingRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotSubsequentOngoingRenewalAcceptanceHandoff}
                releases={pilotSubsequentOngoingRenewalQuoteReleases || []}
                createdRelease={createdPilotSubsequentOngoingRenewalQuoteRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotSubsequentOngoingRenewalAcceptanceHandoff}
              />
              <PilotSubsequentOngoingRenewalHayhashvapahDraftPanel
                packets={pilotSubsequentOngoingRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotSubsequentOngoingRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotSubsequentOngoingRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotSubsequentOngoingRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotSubsequentOngoingRenewalHayhashvapahDraft}
              />
              <PilotSubsequentOngoingRenewalOfficialInvoicePanel
                packets={pilotSubsequentOngoingRenewalOfficialInvoices || []}
                createdPacket={createdPilotSubsequentOngoingRenewalOfficialInvoice}
                draftPackets={pilotSubsequentOngoingRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotSubsequentOngoingRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotSubsequentOngoingRenewalOfficialInvoice}
              />
              <PilotSubsequentOngoingRenewalPaymentCollectionPanel
                packets={pilotSubsequentOngoingRenewalPaymentCollections || []}
                createdPacket={createdPilotSubsequentOngoingRenewalPaymentCollection}
                postingPackets={pilotSubsequentOngoingRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotSubsequentOngoingRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotSubsequentOngoingRenewalPaymentCollection}
              />
              <PilotSubsequentOngoingRenewalCloseoutPanel
                packets={pilotSubsequentOngoingRenewalCloseouts || []}
                createdPacket={createdPilotSubsequentOngoingRenewalCloseout}
                paymentPackets={pilotSubsequentOngoingRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotSubsequentOngoingRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotSubsequentOngoingRenewalCloseout}
              />
              <PilotNextRecurringOngoingRenewalQuotePanel
                handoffs={pilotNextRecurringOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotNextRecurringOngoingRenewalQuote}
                closeouts={pilotSubsequentOngoingRenewalCloseouts || []}
                createdCloseout={createdPilotSubsequentOngoingRenewalCloseout}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotNextRecurringOngoingRenewalQuote}
              />
              <PilotNextRecurringOngoingRenewalQuoteReleasePanel
                packets={pilotNextRecurringOngoingRenewalQuoteReleases || []}
                createdPacket={createdPilotNextRecurringOngoingRenewalRelease}
                handoffs={pilotNextRecurringOngoingRenewalQuoteHandoffs || []}
                createdHandoff={createdPilotNextRecurringOngoingRenewalQuote}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson"].includes(suite.user.role)}
                onCreate={createPilotNextRecurringOngoingRenewalRelease}
              />
              <PilotNextRecurringOngoingRenewalAcceptanceHandoffPanel
                packets={pilotNextRecurringOngoingRenewalAcceptanceHandoffs || []}
                createdPacket={createdPilotNextRecurringOngoingRenewalAcceptanceHandoff}
                releases={pilotNextRecurringOngoingRenewalQuoteReleases || []}
                createdRelease={createdPilotNextRecurringOngoingRenewalRelease}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Salesperson", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextRecurringOngoingRenewalAcceptanceHandoff}
              />
              <PilotNextRecurringOngoingRenewalHayhashvapahDraftPanel
                packets={pilotNextRecurringOngoingRenewalHayhashvapahDrafts || []}
                createdPacket={createdPilotNextRecurringOngoingRenewalHayhashvapahDraft}
                acceptanceHandoffs={pilotNextRecurringOngoingRenewalAcceptanceHandoffs || []}
                createdAcceptanceHandoff={createdPilotNextRecurringOngoingRenewalAcceptanceHandoff}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextRecurringOngoingRenewalHayhashvapahDraft}
              />
              <PilotNextRecurringOngoingRenewalOfficialInvoicePanel
                packets={pilotNextRecurringOngoingRenewalOfficialInvoices || []}
                createdPacket={createdPilotNextRecurringOngoingRenewalOfficialInvoice}
                draftPackets={pilotNextRecurringOngoingRenewalHayhashvapahDrafts || []}
                createdDraftPacket={createdPilotNextRecurringOngoingRenewalHayhashvapahDraft}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextRecurringOngoingRenewalOfficialInvoice}
              />
              <PilotNextRecurringOngoingRenewalPaymentCollectionPanel
                packets={pilotNextRecurringOngoingRenewalPaymentCollections || []}
                createdPacket={createdPilotNextRecurringOngoingRenewalPaymentCollection}
                postingPackets={pilotNextRecurringOngoingRenewalOfficialInvoices || []}
                createdPostingPacket={createdPilotNextRecurringOngoingRenewalOfficialInvoice}
                actionState={actionState}
                canCreate={["Owner", "Admin", "Accountant"].includes(suite.user.role)}
                onCreate={createPilotNextRecurringOngoingRenewalPaymentCollection}
              />
              <PilotNextRecurringOngoingRenewalCloseoutPanel
                packets={pilotNextRecurringOngoingRenewalCloseouts || []}
                createdPacket={createdPilotNextRecurringOngoingRenewalCloseout}
                paymentPackets={pilotNextRecurringOngoingRenewalPaymentCollections || []}
                createdPaymentPacket={createdPilotNextRecurringOngoingRenewalPaymentCollection}
                actionState={actionState}
                canCreate={["Owner", "Admin"].includes(suite.user.role)}
                onCreate={createPilotNextRecurringOngoingRenewalCloseout}
              />
            </>
          )}
          {["Owner", "Admin", "Auditor"].includes(suite.user.role) && (
            <IntegrationHubPanel
              connectors={integrationConnectors || []}
              actionState={actionState}
              canManage={["Owner", "Admin"].includes(suite.user.role)}
              onConfigureWhatsApp={configureWhatsAppConnector}
              onCheckConnector={checkConnector}
            />
          )}
          {["Owner", "Auditor"].includes(suite.user.role) && (
            <AccessReviewPanel
              reviews={createdAccessReview ? [createdAccessReview, ...(adminAccessReviews || [])] : (adminAccessReviews || [])}
              actionState={actionState}
              canCreate={suite.user.role === "Owner"}
              onCreateAccessReview={createAccessReview}
            />
          )}
          {["Owner", "Admin", "Auditor"].includes(suite.user.role) && (
            <AuditExportPanel
              exports={createdAuditExport ? [createdAuditExport, ...(adminAuditExports || [])] : (adminAuditExports || [])}
              actionState={actionState}
              canCreate={["Owner", "Admin"].includes(suite.user.role)}
              onCreateAuditExport={createAuditExport}
            />
          )}
          {suite.user.role === "Owner" && (
            <BackupProofPanel
              backups={createdBackup ? [createdBackup, ...(adminBackups || [])] : (adminBackups || [])}
              restoreProof={restoreProof}
              actionState={actionState}
              onCreateBackupProof={createBackupProof}
            />
          )}
          <SuiteMap apps={suite.apps} selected={selected?.id} onSelect={openApp} />
          <Localization
            items={suite.localization}
            sources={suite.legalSources || []}
            srcExports={suite.srcExports || []}
            signaturePackets={suite.signaturePackets || []}
            privacyRequests={suite.privacyRequests || []}
            privacyExportPackets={suite.privacyExportPackets || []}
            privacyRetentionAssessments={suite.privacyRetentionAssessments || []}
            actionState={actionState}
            onReviewSource={suite.user.role === "Accountant" ? reviewVatSource : null}
            onReviewEsignSource={suite.user.role === "Lawyer" ? reviewEsignSource : null}
            onReviewPersonalDataSource={suite.user.role === "Lawyer" ? reviewPersonalDataSource : null}
            onPrepareSrcExport={suite.user.role === "Owner" ? prepareSrcExport : null}
            onPrepareSignaturePacket={suite.user.role === "Owner" ? prepareSignaturePacket : null}
            onPreparePrivacyExport={suite.user.role === "Owner" ? preparePrivacyExport : null}
            onPrepareDeletionAssessment={suite.user.role === "Owner" ? prepareDeletionAssessment : null}
          />
          <Audit events={audit} />
        </section>
      </main>
    </div>
  );
}

function UserPill({ user }) {
  return (
    <div className="user-pill">
      <span>{user.name}</span>
      <strong>{user.role}</strong>
    </div>
  );
}

function Kpi({ item }) {
  return (
    <article className={`kpi ${item.tone}`}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      {item.detail && <em>{item.detail}</em>}
    </article>
  );
}

function SelectedApp({ app, onOpen }) {
  if (!app) return null;
  return (
    <article className="selected-app">
      <span className="section-label">{app.category}</span>
      <h2>{app.name}</h2>
      <p>{app.description}</p>
      <div className="meta-row">
        <span>{app.maturity}</span>
        <a
          href={app.route || appRoute(app.id)}
          onClick={event => {
            event.preventDefault();
            onOpen?.(app.id);
          }}
        >
          Բացել
        </a>
      </div>
    </article>
  );
}

function WorkflowStrip({ workflows }) {
  return (
    <article className="workflow-strip">
      <span className="section-label">Cross-app flows</span>
      <div className="workflow-list">
        {workflows.slice(0, 3).map(flow => <span key={flow}>{flow}</span>)}
      </div>
    </article>
  );
}

function RoleDashboardPanel({ data }) {
  const cards = data.summaryCards || [];
  const reports = data.reports || [];
  const actions = data.nextActions || [];
  return (
    <section className={`role-dashboard ${data.dashboardId}`}>
      <div className="role-dashboard-head">
        <div>
          <span className="section-label">Role dashboard</span>
          <h2>{data.title}</h2>
        </div>
        <strong>{data.role}</strong>
      </div>
      <div className="role-dashboard-grid">
        <div className="role-metric-strip">
          {cards.map(card => (
            <div className="role-metric-card" key={card.metricId}>
              <span>{card.sourceApps.slice(0, 2).join(" + ")}</span>
              <strong>{card.label}</strong>
              <b>{semanticMetricValue(card)}</b>
              <em>{card.recordCount} records</em>
            </div>
          ))}
        </div>
        <div className="role-action-list">
          {actions.slice(0, 4).map(action => (
            <div className="role-action" key={action.actionKey}>
              <span>{action.actionKey}</span>
              <strong>{action.label}</strong>
              <em>{action.description}</em>
            </div>
          ))}
        </div>
        <div className="role-permission-list">
          <Metric label="analytics app" value={data.permissions?.canUseAnalyticsApp ? "yes" : "no"} />
          <Metric label="snapshots" value={data.permissions?.canCaptureSnapshots ? "capture" : "read-only"} />
          <Metric label="reports" value={data.permissions?.canReadReports ? `${reports.length} visible` : "none"} />
          <Metric label="accountant export" value={data.permissions?.canCreateAccountantReport ? "allowed" : "blocked"} />
        </div>
      </div>
      {reports.length > 0 && (
        <div className="role-report-row">
          {reports.slice(0, 3).map(report => (
            <span key={report.id}>{report.reportType} · {report.periodKey} · {report.format}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function SecurityMfaPanel({ data, setup, actionState, onEnroll, onVerify }) {
  const [code, setCode] = useState("");
  const activeFactor = (data.factors || []).find(factor => factor.status === "active");
  const pendingFactor = setup?.factor || (data.factors || []).find(factor => factor.status === "pending");
  return (
    <section className="security-mfa-panel">
      <div className="security-mfa-head">
        <div>
          <span className="section-label">Security</span>
          <h2>Privileged MFA</h2>
        </div>
        <strong className={data.mfa?.enabled ? "enabled" : "pending"}>{data.mfa?.enabled ? "enabled" : "setup required"}</strong>
      </div>
      <div className="security-mfa-grid">
        <Metric label="required" value={data.mfaRequiredForRole ? "yes" : "no"} />
        <Metric label="active factors" value={(data.factors || []).filter(factor => factor.status === "active").length} />
        <Metric label="pending factors" value={(data.factors || []).filter(factor => factor.status === "pending").length + (setup ? 1 : 0)} />
      </div>
      {activeFactor && (
        <div className="mfa-factor-card active">
          <span>{activeFactor.factorType}</span>
          <strong>{activeFactor.label}</strong>
          <em>{activeFactor.lastVerifiedAt ? `verified ${activeFactor.lastVerifiedAt}` : "ready for login challenge"}</em>
        </div>
      )}
      {setup && (
        <div className="mfa-setup-card">
          <span>Manual setup key</span>
          <strong>{setup.setup.manualSetupKey}</strong>
          <em>Use this key in an authenticator app, then verify the six-digit code.</em>
          <div className="mfa-verify-row">
            <input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" placeholder="123456" />
            <button className="mini-action" type="button" disabled={actionState === "mfa:verify"} onClick={() => onVerify(code)}>
              {actionState === "mfa:verify" ? "Verifying" : "Verify"}
            </button>
          </div>
        </div>
      )}
      {!activeFactor && !setup && (
        <button className="mini-action" type="button" disabled={actionState === "mfa:enroll"} onClick={onEnroll}>
          {actionState === "mfa:enroll" ? "Enrolling" : "Enroll authenticator"}
        </button>
      )}
      {pendingFactor && !setup && <div className="action-status">Pending MFA enrollment needs verification</div>}
    </section>
  );
}

function SessionGovernancePanel({ data, actionState, canRevoke, onRevokeSession }) {
  const sessions = data.sessions || [];
  const summary = data.summary || {};
  return (
    <section className="session-governance-panel">
      <div className="session-governance-head">
        <div>
          <span className="section-label">Identity</span>
          <h2>Session inventory</h2>
        </div>
        <strong>{summary.activeSessions || 0} active</strong>
      </div>
      <div className="session-governance-grid">
        <Metric label="privileged" value={summary.privilegedActiveSessions || 0} />
        <Metric label="MFA verified" value={summary.mfaVerifiedActiveSessions || 0} />
        <Metric label="revoked" value={summary.revokedSessions || 0} />
      </div>
      <div className="session-list">
        {sessions.slice(0, 5).map(session => (
          <div className={`session-card ${session.status}`} key={session.sessionId}>
            <div>
              <span>{session.current ? "current session" : session.status}</span>
              <strong>{session.email}</strong>
              <em>{session.role} · {session.userAgent}</em>
              <small>{(session.riskSignals || []).slice(0, 2).join(" · ") || "no risk signals"}</small>
            </div>
            {canRevoke && session.status === "active" && !session.current ? (
              <button
                className="mini-action secondary"
                type="button"
                disabled={actionState === `session-revoke:${session.sessionId}`}
                onClick={() => onRevokeSession(session.sessionId)}
              >
                {actionState === `session-revoke:${session.sessionId}` ? "Revoking" : "Revoke"}
              </button>
            ) : (
              <b>{session.mfaVerified ? "MFA" : session.status}</b>
            )}
          </div>
        ))}
        {sessions.length === 0 && <div className="action-status">No session evidence yet</div>}
      </div>
    </section>
  );
}

function Customer360({ data, actionState, onAskLegal, onRecordPromise, onSendReminder, onRecordPayment, onImportBankTransaction, onReconcileBankTransaction, onGenerateBrief }) {
  if (!data) return <article className="panel">Բեռնվում է</article>;
  const openDeals = data.crm.deals.filter(deal => deal.stage !== "Won");
  const profile = data.profile || {};
  const currentPeriod = data.finance.currentPeriod || {};
  const latestLegalQuestion = (data.legalQuestions || [])[0];
  const latestLegalAnswer = latestLegalQuestion?.answer;
  const latestBrief = (data.ai?.customerBriefs || [])[0];
  const accessPolicy = data.accessPolicy || { policy: "full-customer360", redacted: false };
  const openInvoiceById = new Map((data.finance.invoices || []).filter(invoice => invoice.status !== "paid").map(invoice => [invoice.id, invoice]));
  const promises = data.crm.collectionPromises || [];
  const reminderDeliveries = data.crm.collectionReminderDeliveries || [];
  const bankTransactions = data.finance.bankTransactions || [];
  const workflowDryRuns = data.workflowDryRuns || [];
  const workflowTestEvents = data.workflowTestEvents || [];
  const promiseTask = (data.crm.tasks || []).find(task => (
    task.invoiceId
    && openInvoiceById.has(task.invoiceId)
    && !promises.some(promise => promise.taskId === task.id)
  ));
  const sendablePromise = promises.find(promise => promise.status === "scheduled");
  const importableBankPromise = promises.find(promise => promise.status === "reminder-sent" && !bankTransactions.some(transaction => transaction.promiseId === promise.id));
  const payablePromise = promises.find(promise => (
    promise.status === "reminder-sent"
    && !bankTransactions.some(transaction => transaction.promiseId === promise.id && ["matched", "reconciled"].includes(transaction.status))
  ));
  const reconcilableBankTransaction = bankTransactions.find(transaction => transaction.status === "matched");
  const fulfilledPromises = promises.filter(promise => promise.status === "fulfilled");
  return (
    <article className="panel customer-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Customer 360</span>
          <h2>{data.customer.name}</h2>
        </div>
        <div className="customer-head-actions">
          {onGenerateBrief && (
            <button
              className="brief-action"
              type="button"
              disabled={actionState === `ai-brief:${data.customer.id}`}
              onClick={() => onGenerateBrief(data.customer.id)}
            >
              {actionState === `ai-brief:${data.customer.id}` ? "Generating" : "AI brief"}
            </button>
          )}
          <div className="score">{data.customer.health_score}</div>
        </div>
      </div>
      <div className={`access-policy ${accessPolicy.redacted ? "redacted" : "full"}`}>
        <span>{accessPolicy.policy}</span>
        <strong>{accessPolicy.redacted ? "field-level redaction" : "full access"}</strong>
      </div>
      {latestBrief && (
        <div className="ai-brief-card">
          <div>
            <span>AI customer brief · {latestBrief.modelPolicy}</span>
            <strong>{latestBrief.confidence}% confidence · advisory only</strong>
          </div>
          <p>{latestBrief.summary}</p>
          <em>{latestBrief.recommendedNextActions?.[0] || "Review Customer 360 before acting."}</em>
        </div>
      )}
      <div className="profile-line">
        <span>ՀՎՀՀ {data.customer.tax_id}</span>
        <span>{data.customer.phone}</span>
        <span>{data.customer.segment}</span>
      </div>
      <div className="mini-grid">
        <Metric label="Lifetime" value={sensitiveMoney(data.customer.lifetime_value)} />
        <Metric label="Receivables" value={sensitiveMoney(data.finance.openReceivables)} />
        <Metric label="Open deals" value={openDeals.length} />
        <Metric label="At-risk cases" value={data.service.atRiskCases || data.service.openTickets} />
      </div>
      <div className="profile-foundation">
        <div>
          <span className="section-label">Canonical profile</span>
          <strong>{profile.merge_status || "canonical"}</strong>
          <em>{profile.processing_purpose || "customer-operations"}</em>
        </div>
        <div>
          <span className="section-label">Data quality</span>
          <strong>{profile.data_quality_score || data.customer.health_score}%</strong>
          <em>{profile.consent_status || "unknown"}</em>
        </div>
      </div>
      <div className="source-lineage">
        {(data.profileSources || []).map(source => (
          <div className={source.authoritative ? "source authoritative" : "source"} key={source.id}>
            <span>{source.sourceApp}</span>
            <strong>{source.confidence}%</strong>
            <em>{source.sourceEntityType}</em>
          </div>
        ))}
      </div>
      <div className={`period-guard ${currentPeriod.status || "unknown"}`}>
        <div>
          <span className="section-label">HayHashvapah period</span>
          <strong>{currentPeriod.periodKey || "not configured"} · {currentPeriod.status || "unknown"}</strong>
        </div>
        <em>{currentPeriod.reason || "Period lock must be checked before finance records are created."}</em>
      </div>
      <div className="finance-ledger">
        <Metric label="Posted invoices" value={(data.finance.invoices || []).length} />
        <Metric label="Payments" value={(data.finance.payments || []).length} />
        <Metric label="Bank tx" value={bankTransactions.length} />
      </div>
      {data.campaigns && (
        <div className="campaign-ledger">
          <Metric label="Campaign ROI" value={`${data.campaigns.summary?.roiPercent || 0}%`} />
          <Metric label="Paid revenue" value={sensitiveMoney(data.campaigns.summary?.paidRevenue || 0)} />
          <Metric label="Attributions" value={(data.campaigns.attributions || []).length} />
        </div>
      )}
      {data.receivables && (
        <div className="receivables-ledger">
          <Metric label="Overdue" value={sensitiveMoney(data.receivables.summary?.overdue ?? "restricted")} />
          <Metric label="Current" value={sensitiveMoney(data.receivables.summary?.current ?? "restricted")} />
          <Metric label="Open invoices" value={data.receivables.summary?.invoiceCount || 0} />
        </div>
      )}
      <div className="collection-ledger">
        <Metric label="Payment promises" value={promises.length} />
        <Metric label="Reminder sent" value={reminderDeliveries.length} />
        <Metric label="Fulfilled" value={fulfilledPromises.length} />
        <Metric label="Dry-runs" value={workflowDryRuns.length} />
      </div>
      {promiseTask && (
        <div className="promise-action">
          <div>
            <span className="section-label">Collection promise</span>
            <strong>{promiseTask.invoiceNumber} · {promiseTask.title}</strong>
          </div>
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === `promise:${promiseTask.id}`}
            onClick={() => onRecordPromise(promiseTask, openInvoiceById.get(promiseTask.invoiceId))}
          >
            {actionState === `promise:${promiseTask.id}` ? "Recording" : "Record promise"}
          </button>
        </div>
      )}
      {payablePromise && (
        <div className="payment-action">
          <div>
            <span className="section-label">HayHashvapah payment</span>
            <strong>{payablePromise.invoiceNumber} · {sensitiveMoney(payablePromise.promisedAmount)} · {payablePromise.promisedOn}</strong>
          </div>
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === `payment:${payablePromise.id}`}
            onClick={() => onRecordPayment(payablePromise)}
          >
            {actionState === `payment:${payablePromise.id}` ? "Recording" : "Record payment"}
          </button>
        </div>
      )}
      {importableBankPromise && (
        <div className="bank-action">
          <div>
            <span className="section-label">Bank import</span>
            <strong>{importableBankPromise.invoiceNumber} · Ameriabank · {sensitiveMoney(importableBankPromise.promisedAmount)}</strong>
          </div>
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === `bank-import:${importableBankPromise.id}`}
            onClick={() => onImportBankTransaction(importableBankPromise, data.customer)}
          >
            {actionState === `bank-import:${importableBankPromise.id}` ? "Importing" : "Import bank tx"}
          </button>
        </div>
      )}
      {reconcilableBankTransaction && (
        <div className="reconcile-action">
          <div>
            <span className="section-label">Bank reconciliation</span>
            <strong>{reconcilableBankTransaction.invoiceNumber} · {reconcilableBankTransaction.matchConfidence}% match · {reconcilableBankTransaction.bankName}</strong>
          </div>
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === `bank-reconcile:${reconcilableBankTransaction.id}`}
            onClick={() => onReconcileBankTransaction(reconcilableBankTransaction)}
          >
            {actionState === `bank-reconcile:${reconcilableBankTransaction.id}` ? "Reconciling" : "Reconcile bank"}
          </button>
        </div>
      )}
      {sendablePromise && (
        <div className="reminder-action">
          <div>
            <span className="section-label">Reminder dispatch</span>
            <strong>{sendablePromise.invoiceNumber} · {sendablePromise.reminderChannel} · {sendablePromise.promisedOn}</strong>
          </div>
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === `reminder:${sendablePromise.id}`}
            onClick={() => onSendReminder(sendablePromise)}
          >
            {actionState === `reminder:${sendablePromise.id}` ? "Sending" : "Send reminder"}
          </button>
        </div>
      )}
      <div className="legal-guidance">
        <div className="legal-guidance-head">
          <div>
            <span className="section-label">Legal guidance</span>
            <strong>{latestLegalQuestion ? `${latestLegalQuestion.topic} · ${latestLegalQuestion.status}` : "VAT source check"}</strong>
          </div>
          <button
            className="mini-action"
            type="button"
            disabled={actionState === "legal:running"}
            onClick={() => onAskLegal(data.customer.id)}
          >
            {actionState === "legal:running" ? "Generating" : "Generate"}
          </button>
        </div>
        {latestLegalAnswer ? (
          <>
            <p>{latestLegalAnswer.answer}</p>
            <div className="legal-source-chips">
              {(latestLegalAnswer.sources || []).slice(0, 3).map(source => (
                <span key={source.answerSourceId || source.id}>{source.citationLabel}</span>
              ))}
            </div>
          </>
        ) : (
          <p>{data.finance.vatContext}</p>
        )}
      </div>
      <div className="next-action">
        <span>Next action</span>
        <strong>{data.crm.nextBestAction}</strong>
      </div>
      <div className="rows">
        {data.crm.deals.map(deal => (
          <div className="row" key={deal.id}>
            <span>{deal.title} · {forecastCategoryLabel(deal.forecastCategory)} · {deal.healthStatus || "unreviewed"}</span>
            <strong>{sensitiveMoney(deal.value)}</strong>
          </div>
        ))}
        {(data.crm.quotes || []).map(quote => (
          <div className="row crm-quote" key={quote.id}>
            <span>{quote.number} · {quote.status} · valid {quote.validUntil}</span>
            <strong>{sensitiveMoney(quote.total)}</strong>
          </div>
        ))}
        {(data.crm.quoteAcceptances || []).map(acceptance => (
          <div className="row crm-acceptance" key={acceptance.id}>
            <span>{acceptance.quoteNumber} · accepted by {acceptance.signerName}</span>
            <strong>{new Date(acceptance.acceptedAt).toLocaleDateString("hy-AM")}</strong>
          </div>
        ))}
        {(data.docs?.signaturePackets || []).map(packet => (
          <div className="row docs-signature" key={packet.id}>
            <span>{packet.quoteNumber} · signature evidence · {packet.status}</span>
            <strong>{packet.checksum.slice(0, 8)}</strong>
          </div>
        ))}
        {(data.privacy?.exportPackets || []).map(packet => (
          <div className="row privacy-export" key={packet.id}>
            <span>{packet.customerName} · privacy export · {packet.status}</span>
            <strong>{packet.checksum.slice(0, 8)}</strong>
          </div>
        ))}
        {(data.privacy?.retentionAssessments || []).map(assessment => (
          <div className="row privacy-retention" key={assessment.id}>
            <span>{assessment.customerName} · deletion assessment · {assessment.status}</span>
            <strong>{assessment.recommendation}</strong>
          </div>
        ))}
        {(data.privacy?.requests || []).map(request => (
          <div className="row privacy-request" key={request.id}>
            <span>{request.requestType} · {request.channel} · {request.requesterEmail}</span>
            <strong>{request.status}</strong>
          </div>
        ))}
        {(data.crm.tasks || []).map(task => (
          <div className="row crm-task" key={task.id}>
            <span>{task.title} · {task.status}</span>
            <strong>{task.priority}</strong>
          </div>
        ))}
        {promises.map(promise => (
          <div className="row collection-promise" key={promise.id}>
            <span>{promise.invoiceNumber} · {promise.status} · promised {promise.promisedOn} · {promise.reminderChannel}</span>
            <strong>{sensitiveMoney(promise.promisedAmount)}</strong>
          </div>
        ))}
        {reminderDeliveries.map(delivery => (
          <div className="row collection-reminder" key={delivery.id}>
            <span>{delivery.invoiceNumber} · {delivery.status} via {delivery.channel} · {delivery.provider}</span>
            <strong>{delivery.sentAt ? new Date(delivery.sentAt).toLocaleDateString("hy-AM") : delivery.status}</strong>
          </div>
        ))}
        {bankTransactions.map(transaction => (
          <div className="row bank-transaction" key={transaction.id}>
            <span>{transaction.invoiceNumber || "unmatched"} · {transaction.status} · {transaction.bankName} · {transaction.matchConfidence}%</span>
            <strong>{sensitiveMoney(transaction.amount)}</strong>
          </div>
        ))}
        {workflowDryRuns.map(run => (
          <div className="row workflow-dry-run" key={run.id}>
            <span>{run.resultPreview?.proposedTask?.invoiceNumber || run.matchedSubjectId} · {run.status} · {run.ruleName}</span>
            <strong>{run.guardrails.length} guardrails</strong>
          </div>
        ))}
        {(data.crm.activities || []).map(activity => (
          <div className="row crm-activity" key={activity.id}>
            <span>{activity.title} · {activity.forecastCategory}</span>
            <strong>{activity.kind}</strong>
          </div>
        ))}
        {(data.campaigns?.attributions || []).map(attribution => (
          <div className="row campaign-attribution" key={attribution.id}>
            <span>{attribution.campaignName} · {attribution.sourceType}</span>
            <strong>{attribution.dealTitle || attribution.leadCompanyName || attribution.customerName}</strong>
          </div>
        ))}
        {(data.receivables?.invoices || []).map(invoice => (
          <div className="row receivable-aging" key={invoice.id}>
            <span>{invoice.number} · {invoice.bucketLabel} · due {invoice.dueDate}</span>
            <strong>{sensitiveMoney(invoice.total)}</strong>
          </div>
        ))}
        {(data.finance.draftInvoices || []).map(invoice => (
          <div className="row finance-draft" key={invoice.id}>
            <span>{invoice.number} · {invoice.status} · {invoice.periodKey}</span>
            <strong>{sensitiveMoney(invoice.total)}</strong>
          </div>
        ))}
        {(data.finance.invoices || []).map(invoice => (
          <div className="row finance-invoice" key={invoice.id}>
            <span>{invoice.number} · {invoice.status} · due {invoice.dueDate || invoice.due_date}</span>
            <strong>{sensitiveMoney(invoice.total)}</strong>
          </div>
        ))}
        {(data.finance.payments || []).map(payment => (
          <div className="row finance-payment" key={payment.id}>
            <span>{payment.reference} · {payment.method} · {payment.paidAt}</span>
            <strong>{sensitiveMoney(payment.amount)}</strong>
          </div>
        ))}
        {data.service.tickets.map(ticket => (
          <div className="row service" key={ticket.id}>
            <span>{ticket.subject}</span>
            <strong>{ticket.priority}</strong>
          </div>
        ))}
        {(data.service.cases || []).map(serviceCase => (
          <div className="row service-case" key={serviceCase.id}>
            <span>{serviceCase.caseNumber} · {serviceCase.slaStatus}</span>
            <strong>{serviceCase.priority}</strong>
          </div>
        ))}
        {(data.service.escalations || []).map(escalation => (
          <div className="row service-escalation" key={escalation.id}>
            <span>{escalation.caseNumber} · {escalation.severity} · {escalation.assignedToName}</span>
            <strong>{escalation.status}</strong>
          </div>
        ))}
        {(data.service.resolutions || []).map(resolution => (
          <div className="row service-resolution" key={resolution.id}>
            <span>{resolution.caseNumber} · {resolution.resolutionCode} · CSAT {resolution.satisfactionScore || "-"}</span>
            <strong>{resolution.resolvedByName}</strong>
          </div>
        ))}
        {(data.legalQuestions || []).slice(0, 3).map(question => (
          <div className="row legal-answer" key={question.id}>
            <span>{question.topic} · {question.question}</span>
            <strong>{question.status}</strong>
          </div>
        ))}
      </div>
      {(data.approvals || []).length > 0 && (
        <div className="approval-mini">
          <span className="section-label">Approval guardrails</span>
          {data.approvals.slice(0, 2).map(approval => (
            <div className="approval-line" key={approval.id}>
              <span>{approval.title}</span>
              <strong>{approval.riskLevel}</strong>
            </div>
          ))}
        </div>
      )}
      {(data.workflowRuns || []).length > 0 && (
        <div className="execution-mini">
          <span className="section-label">Workflow runs</span>
          {data.workflowRuns.slice(0, 3).map(run => (
            <div className="run-line" key={run.id}>
              <span>{run.actionKey}</span>
              <strong>{run.status}</strong>
            </div>
          ))}
        </div>
      )}
      {workflowDryRuns.length > 0 && (
        <div className="execution-mini dry-run-mini">
          <span className="section-label">Workflow dry-runs</span>
          {workflowDryRuns.slice(0, 3).map(run => (
            <div className="run-line" key={run.id}>
              <span>{run.actionKey}</span>
              <strong>{run.status}</strong>
            </div>
          ))}
        </div>
      )}
      {workflowTestEvents.length > 0 && (
        <div className="execution-mini test-event-mini">
          <span className="section-label">Workflow test events</span>
          {workflowTestEvents.slice(0, 3).map(event => (
            <div className="run-line" key={event.id}>
              <span>{event.eventType} · {event.subjectId}</span>
              <strong>{event.status}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="timeline">
        <span className="section-label">Operating timeline</span>
        {(data.timeline || []).slice(0, 5).map(event => (
          <div className="timeline-event" key={event.id}>
            <span>{event.eventType}</span>
            <strong>{event.status}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LeadPipeline({ data, actionState, onCaptureLead, onConvertLead }) {
  const leads = data.leads || [];
  const firstConvertible = leads.find(lead => ["qualified", "new"].includes(lead.status));
  return (
    <article className="panel lead-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">A1 CRM</span>
          <h2>Lead Tube</h2>
        </div>
        <button
          className="mini-action"
          type="button"
          disabled={actionState === "lead:capture"}
          onClick={onCaptureLead}
        >
          {actionState === "lead:capture" ? "Capturing" : "Capture lead"}
        </button>
      </div>
      <div className="lead-summary">
        <Metric label="hot leads" value={data.summary?.hot || 0} />
        <Metric label="qualified Tube" value={money(data.summary?.qualifiedPipeline || 0)} />
        <Metric label="converted" value={data.summary?.converted || 0} />
      </div>
      <div className="lead-list">
        {leads.slice(0, 5).map(lead => (
          <div className={`lead-card ${lead.rating} ${lead.status}`} key={lead.id}>
            <div>
              <span>{lead.source} · {lead.channel} · {lead.status}</span>
              <strong>{lead.companyName}</strong>
              <em>{lead.segment} · {lead.routedToName || "unrouted"} · {money(lead.estimatedValue)}</em>
            </div>
            <b>{lead.score}</b>
          </div>
        ))}
        {leads.length === 0 && <div className="action-status">No CRM leads yet</div>}
      </div>
      {firstConvertible && (
        <button
          className="inline-action"
          type="button"
          disabled={actionState === `lead:convert:${firstConvertible.id}`}
          onClick={() => onConvertLead(firstConvertible)}
        >
          {actionState === `lead:convert:${firstConvertible.id}` ? "Converting..." : "Convert hot lead"}
        </button>
      )}
    </article>
  );
}

function CampaignRoiPanel({ data }) {
  const campaigns = data.campaigns || [];
  return (
    <article className="panel campaign-roi-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Growth Hub</span>
          <h2>Campaign ROI</h2>
        </div>
        <strong className="roi-badge">{data.summary?.roiPercent || 0}%</strong>
      </div>
      <div className="campaign-summary">
        <Metric label="spend" value={money(data.summary?.totalSpend || 0)} />
        <Metric label="Tube" value={money(data.summary?.influencedPipeline || 0)} />
        <Metric label="paid revenue" value={money(data.summary?.paidRevenue || 0)} />
      </div>
      <div className="campaign-list">
        {campaigns.slice(0, 4).map(campaign => (
          <div className="campaign-card" key={campaign.id}>
            <div>
              <span>{campaign.channel} · {campaign.status}</span>
              <strong>{campaign.name}</strong>
              <em>{campaign.leadCount} leads · {campaign.customerCount} customers · {money(campaign.paidRevenue)}</em>
            </div>
            <b>{campaign.roiPercent}%</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function SemanticMetricsPanel({ data, snapshots, reports = [], userRole, actionState, onCaptureSnapshot, onCreateReport }) {
  const metrics = data.metrics || [];
  const priorityMetrics = [
    "pipeline-value",
    "forecast-weighted",
    "overdue-exposure",
    "sla-risk",
    "campaign-roi",
    "vat-readiness",
    "receivables-aging",
    "ticket-backlog"
  ];
  const ordered = priorityMetrics.map(id => metrics.find(metric => metric.id === id)).filter(Boolean);
  const trendSeries = priorityMetrics.map(id => (snapshots?.series || []).find(item => item.metricId === id)).filter(Boolean).slice(0, 4);
  const reportTypes = userRole === "Accountant" ? ["accountant"] : ["Owner", "Admin"].includes(userRole) ? ["owner", "accountant"] : [];
  return (
    <article className="panel semantic-metrics-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Analytics layer</span>
          <h2>Metric catalog</h2>
        </div>
        <div className="semantic-actions">
          <strong className="semantic-version">{data.semanticLayerVersion}</strong>
          {onCaptureSnapshot && (
            <button
              className="mini-action"
              type="button"
              disabled={actionState === "semantic-snapshot:capture"}
              onClick={onCaptureSnapshot}
            >
              {actionState === "semantic-snapshot:capture" ? "Capturing" : "Capture snapshot"}
            </button>
          )}
        </div>
      </div>
      <div className="semantic-metric-list">
        {ordered.map(metric => (
          <div className={`semantic-metric-card ${metric.id}`} key={metric.id}>
            <div>
              <span>{metric.sourceApps.slice(0, 2).join(" + ")}</span>
              <strong>{metric.label}</strong>
              <em>{metric.formula}</em>
            </div>
            <div className="semantic-metric-value">
              <b>{semanticMetricValue(metric)}</b>
              <small>{metric.recordCount} records · {metric.ownerRole}</small>
            </div>
          </div>
        ))}
      </div>
      {trendSeries.length > 0 && (
        <div className="semantic-snapshot-series">
          {trendSeries.map(series => {
            const latest = series.points[series.points.length - 1];
            return (
              <div className="semantic-series-card" key={series.metricId}>
                <span>{series.label}</span>
                <strong>{series.unit === "AMD" ? money(latest?.value) : semanticMetricValue({ ...series, value: latest?.value })}</strong>
                <em>{series.points.length} snapshots · {latest?.reportDate}</em>
              </div>
            );
          })}
        </div>
      )}
      {(reportTypes.length > 0 || reports.length > 0) && (
        <div className="analytics-report-strip">
          {reportTypes.length > 0 && onCreateReport && (
            <div className="analytics-report-actions">
              {reportTypes.map(type => (
                <button
                  className="mini-action"
                  type="button"
                  key={type}
                  disabled={actionState === `analytics-report:${type}`}
                  onClick={() => onCreateReport(type)}
                >
                  {actionState === `analytics-report:${type}` ? "Exporting" : `${type} report`}
                </button>
              ))}
            </div>
          )}
          {reports.slice(0, 3).map(report => (
            <div className={`analytics-report-card ${report.reportType}`} key={report.id}>
              <span>{report.reportType} · {report.format}</span>
              <strong>{report.fileName}</strong>
              <em>{report.metricCount} metrics · {report.snapshotCount} snapshots · {report.periodKey}</em>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ReceivablesAgingPanel({ data, actionState, onGenerateInvoiceExplanation }) {
  const buckets = data.buckets || [];
  const invoices = data.invoices || [];
  const maxBucketTotal = Math.max(1, ...buckets.map(bucket => bucket.total || 0));
  const topInvoice = invoices.find(invoice => invoice.bucket !== "current") || invoices[0];
  const latestExplanation = topInvoice
    ? (data.invoiceOverdueExplanations || []).find(explanation => explanation.invoiceId === topInvoice.id)
    : null;
  return (
    <article className="panel receivables-aging-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">HayHashvapah analytics</span>
          <h2>Receivables aging</h2>
        </div>
        <div className="aging-head-actions">
          <strong className="aging-badge">{data.summary?.overdueInvoiceCount || 0} overdue</strong>
          {topInvoice && onGenerateInvoiceExplanation && (
            <button
              className="mini-action"
              type="button"
              disabled={actionState === `invoice-ai:${topInvoice.id}`}
              onClick={() => onGenerateInvoiceExplanation(topInvoice.id)}
            >
              {actionState === `invoice-ai:${topInvoice.id}` ? "Explaining" : "Explain invoice"}
            </button>
          )}
        </div>
      </div>
      <div className="aging-summary">
        <Metric label="open" value={money(data.summary?.totalOpen || 0)} />
        <Metric label="overdue" value={money(data.summary?.overdue || 0)} />
        <Metric label="current" value={money(data.summary?.current || 0)} />
      </div>
      <div className="aging-buckets">
        {buckets.map(bucket => (
          <div className={`aging-bucket ${bucket.key === "current" ? "current" : "overdue"}`} key={bucket.key}>
            <div className="aging-bucket-head">
              <span>{bucket.label}</span>
              <strong>{money(bucket.total)}</strong>
            </div>
            <div className="aging-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(3, Math.round((bucket.total / maxBucketTotal) * 100))}%` }} />
            </div>
            <em>{bucket.invoiceCount} invoices · {bucket.customerCount} customers</em>
          </div>
        ))}
      </div>
      {topInvoice && (
        <div className="aging-action">
          <span>{topInvoice.number} · {topInvoice.customerName} · {topInvoice.bucketLabel}</span>
          <strong>{topInvoice.nextAction}</strong>
        </div>
      )}
      {latestExplanation && (
        <div className={`invoice-explanation-card ${latestExplanation.riskLevel}`}>
          <span>{latestExplanation.riskLevel} risk · {latestExplanation.daysPastDue} days overdue · {latestExplanation.confidence}% confidence</span>
          <strong>{latestExplanation.invoiceNumber} · {money(latestExplanation.amount)}</strong>
          <p>{latestExplanation.summary}</p>
          <em>{latestExplanation.accountantReviewStatus} · {latestExplanation.modelPolicy}</em>
        </div>
      )}
    </article>
  );
}

function ForecastPanel({ data, actionState, onUpdateForecast, onGenerateDealRisk }) {
  const deals = data.deals || [];
  const focusDeal = deals.find(deal => deal.id === "deal-nare-retainer") || deals[0];
  const latestRiskBrief = focusDeal
    ? (data.dealRiskBriefs || []).find(brief => brief.dealId === focusDeal.id)
    : null;
  return (
    <article className="panel forecast-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Sales forecast</span>
          <h2>Deal health</h2>
        </div>
        {focusDeal && (
          <div className="forecast-actions">
            <button
              className="mini-action secondary"
              type="button"
              disabled={actionState === `forecast:${focusDeal.id}`}
              onClick={() => onUpdateForecast(focusDeal.id)}
            >
              {actionState === `forecast:${focusDeal.id}` ? "Updating" : "Update commit"}
            </button>
            {onGenerateDealRisk && (
              <button
                className="mini-action"
                type="button"
                disabled={actionState === `deal-risk:${focusDeal.id}`}
                onClick={() => onGenerateDealRisk(focusDeal.id)}
              >
                {actionState === `deal-risk:${focusDeal.id}` ? "Generating" : "Risk brief"}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="forecast-summary">
        <Metric label="weighted" value={money(data.totals?.weightedValue || 0)} />
        <Metric label="open value" value={money(data.totals?.value || 0)} />
        <Metric label="unreviewed" value={data.totals?.unreviewed || 0} />
      </div>
      {latestRiskBrief && (
        <div className={`deal-risk-card ${latestRiskBrief.riskLevel}`}>
          <span>{latestRiskBrief.riskLevel} risk · {latestRiskBrief.riskScore}/100 · {latestRiskBrief.confidence}% confidence</span>
          <strong>{latestRiskBrief.dealTitle}</strong>
          <p>{latestRiskBrief.summary}</p>
          <ul>
            {latestRiskBrief.riskFactors.slice(0, 3).map(factor => <li key={factor}>{factor}</li>)}
          </ul>
          <em>{latestRiskBrief.advisoryOnly ? "Advisory only" : "Review required"} · {latestRiskBrief.modelPolicy}</em>
        </div>
      )}
      <div className="forecast-categories">
        {(data.categories || []).map(category => (
          <div className="forecast-category" key={category.forecastCategory}>
            <span>{forecastCategoryLabel(category.forecastCategory)}</span>
            <strong>{money(category.weightedValue)}</strong>
            <em>{category.count} deals · {money(category.value)}</em>
          </div>
        ))}
      </div>
      <div className="forecast-deal-list">
        {deals.slice(0, 4).map(deal => (
          <div className={`forecast-deal ${deal.healthStatus}`} key={deal.id}>
            <div>
              <span>{deal.stage} · {forecastCategoryLabel(deal.forecastCategory)}</span>
              <strong>{deal.title}</strong>
              <em>{deal.customerName} · {money(deal.weightedValue || 0)}</em>
            </div>
            <b>{deal.healthScore ?? "-"}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function QuoteApprovalPanel({ quote, approval, actionState, onCreateQuoteApproval }) {
  return (
    <article className="panel quote-approval-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Quote governance</span>
          <h2>Public release</h2>
        </div>
        <button
          className="mini-action"
          type="button"
          disabled={actionState === "quote-approval:running"}
          onClick={onCreateQuoteApproval}
        >
          {actionState === "quote-approval:running" ? "Preparing" : "Prepare quote"}
        </button>
      </div>
      {quote ? (
        <div className={`quote-release-card ${quote.status}`}>
          <div>
            <span>{quote.number} · {quote.status}</span>
            <strong>{quote.title}</strong>
            <em>{quote.customerName} · {money(quote.total)} · {approval?.status || "approval requested"}</em>
          </div>
          <b>{approval?.riskLevel || "financial"}</b>
        </div>
      ) : (
        <div className="action-status">No draft quote release pending</div>
      )}
    </article>
  );
}

function SuiteMap({ apps, selected, onSelect }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const app of apps) {
      if (!map.has(app.category)) map.set(app.category, []);
      map.get(app.category).push(app);
    }
    return [...map.entries()];
  }, [apps]);

  return (
    <article className="panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Suite launcher</span>
          <h2>Zoho-parity coverage</h2>
        </div>
      </div>
      <div className="suite-groups">
        {grouped.map(([category, items]) => (
          <div className="suite-group" key={category}>
            <h3>{category}</h3>
            {items.map(app => (
              <button key={app.id} className={selected === app.id ? "selected" : ""} onClick={() => onSelect(app.id)}>
                <span>{app.name}</span>
                <em>{app.maturity}</em>
              </button>
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}

function EventStream({ events }) {
  return (
    <article className="panel event-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Event bus</span>
          <h2>Platform operating layer</h2>
        </div>
      </div>
      <div className="event-list">
        {events.map(event => (
          <div className={`event ${event.status}`} key={event.id}>
            <div>
              <span>{event.eventType}</span>
              <strong>{event.customerName || event.subjectId}</strong>
            </div>
            <time>{new Date(event.createdAt).toLocaleDateString("hy-AM")}</time>
          </div>
        ))}
      </div>
    </article>
  );
}

function ServiceConsole({ data, actionState, onEscalate, onResolve, onGenerateTicketSummary }) {
  if (!data) return <article className="panel">Բեռնվում է</article>;
  const cases = data.cases || [];
  const focusCase = cases.find(serviceCase => serviceCase.id === "case-nare-vat") || cases[0];
  const latestSummary = focusCase
    ? (data.ticketSummaries || []).find(summary => summary.caseId === focusCase.id)
    : null;
  return (
    <article className="panel service-console">
      <div className="panel-head">
        <div>
          <span className="section-label">Service Hub</span>
          <h2>Operator console</h2>
        </div>
        <div className="service-head-actions">
          <strong className="queue-count">{data.queue.highPriorityOpen}</strong>
          {focusCase && onGenerateTicketSummary && (
            <button
              className="mini-action secondary"
              type="button"
              disabled={actionState === `ticket-ai:${focusCase.id}`}
              onClick={() => onGenerateTicketSummary(focusCase.id)}
            >
              {actionState === `ticket-ai:${focusCase.id}` ? "Summarizing" : "Summarize"}
            </button>
          )}
        </div>
      </div>
      <div className="queue-metrics">
        {(data.queue.bySla || []).map(row => (
          <Metric key={row.slaStatus} label={row.slaStatus} value={row.count} />
        ))}
        <Metric label="open escalations" value={data.queue.escalatedOpen || 0} />
        <Metric label="avg CSAT" value={data.queue.averageSatisfaction || "-"} />
        <Metric label="pending approvals" value={data.queue.pendingApprovals} />
      </div>
      {latestSummary && (
        <div className={`ticket-summary-card ${latestSummary.reviewRequired ? "review" : "ready"}`}>
          <span>{latestSummary.caseNumber} · {latestSummary.confidence}% confidence · {latestSummary.recommendedKnowledgeReview}</span>
          <strong>{latestSummary.recommendedKnowledgeTitle}</strong>
          <p>{latestSummary.summary}</p>
          <em>{latestSummary.advisoryOnly ? "Advisory only" : "Actionable"} · {latestSummary.modelPolicy}</em>
        </div>
      )}
      <div className="case-list">
        {cases.slice(0, 4).map(serviceCase => (
          <div className={`case-card ${serviceCase.slaStatus}`} key={serviceCase.id}>
            <div>
              <span>{serviceCase.caseNumber} · {serviceCase.channel}</span>
              <strong>{serviceCase.subject}</strong>
              <em>{serviceCase.customerName} · {serviceCase.ownerName} · {serviceCase.messageCount} msgs</em>
            </div>
            <time>{serviceCase.slaStatus}</time>
            {serviceCase.slaStatus === "at-risk" && (
              <button
                className="case-action"
                type="button"
                disabled={actionState === `escalate:${serviceCase.id}`}
                onClick={() => onEscalate(serviceCase)}
              >
                {actionState === `escalate:${serviceCase.id}` ? "Escalating" : "Escalate SLA"}
              </button>
            )}
            {serviceCase.status === "escalated" && (
              <button
                className="case-action resolve"
                type="button"
                disabled={actionState === `resolve:${serviceCase.id}`}
                onClick={() => onResolve(serviceCase)}
              >
                {actionState === `resolve:${serviceCase.id}` ? "Resolving" : "Resolve"}
              </button>
            )}
          </div>
        ))}
      </div>
      {(data.escalations || []).length > 0 && (
        <div className="escalation-list">
          {(data.escalations || []).slice(0, 3).map(escalation => (
            <div className="escalation-card" key={escalation.id}>
              <div>
                <span>{escalation.caseNumber} · {escalation.severity}</span>
                <strong>{escalation.subject}</strong>
                <em>{escalation.assignedToName} · {new Date(escalation.responseDueAt).toLocaleTimeString("hy-AM", { hour: "2-digit", minute: "2-digit" })}</em>
              </div>
              <b>{escalation.status}</b>
            </div>
          ))}
        </div>
      )}
      {(data.resolutions || []).length > 0 && (
        <div className="resolution-list">
          {(data.resolutions || []).slice(0, 3).map(resolution => (
            <div className="resolution-card" key={resolution.id}>
              <div>
                <span>{resolution.caseNumber} · {resolution.resolutionCode}</span>
                <strong>{resolution.summary}</strong>
                <em>{resolution.resolvedByName} · CSAT {resolution.satisfactionScore || "-"}</em>
              </div>
              <b>closed</b>
            </div>
          ))}
        </div>
      )}
      <div className="knowledge-list">
        {data.knowledge.slice(0, 3).map(article => (
          <span key={article.id}>{article.title}</span>
        ))}
      </div>
    </article>
  );
}

function ApprovalQueue({ approvals, runs, rules, dryRuns, testEvents, suggestions, actionState, onExecute, onDryRun, onTestEvent, onToggleRule, onRollbackRule, onRetryRun, onGenerateSuggestion }) {
  const executableActions = ["crm.task.create", "service.reply.send", "crm.quote.release", "finance.invoice.propose", "legal.answer.approve", "privacy.request.approve"];
  const overdueRule = (rules || []).find(rule => rule.id === "rule-overdue-task");
  const latestSuggestion = (suggestions || [])[0];
  const runStatusLabel = run => {
    if (run.status === "failed") return run.payload?.errorCode || "failed";
    return run.resultType;
  };
  const runDetailLabel = run => {
    const attempts = run.payload?.attempts?.length || 1;
    if (run.status === "failed") return run.payload?.nextRetryAction || run.customerName;
    if (run.payload?.retryOf) return `${run.customerName} · retried · ${attempts} attempts`;
    return `${run.customerName} · ${run.status || "completed"}`;
  };
  return (
    <article className="panel approvals-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Workflow Studio</span>
          <h2>Approval queue</h2>
        </div>
        <div className="workflow-action-buttons">
          <button
            className="inline-action dry-run-button"
            type="button"
            disabled={actionState === "dry-run:rule-overdue-task" || overdueRule?.enabled === false}
            onClick={onDryRun}
          >
            {actionState === "dry-run:rule-overdue-task" ? "Testing" : overdueRule?.enabled === false ? "Paused" : "Dry-run"}
          </button>
          <button
            className="inline-action test-event-button"
            type="button"
            disabled={actionState === "test-event:rule-overdue-task" || overdueRule?.enabled === false}
            onClick={onTestEvent}
          >
            {actionState === "test-event:rule-overdue-task" ? "Sending" : overdueRule?.enabled === false ? "Paused" : "Test event"}
          </button>
          {onGenerateSuggestion && (
            <button
              className="inline-action workflow-suggest-button"
              type="button"
              disabled={actionState === "workflow-ai:suggest"}
              onClick={onGenerateSuggestion}
            >
              {actionState === "workflow-ai:suggest" ? "Suggesting" : "Suggest rule"}
            </button>
          )}
        </div>
      </div>
      {latestSuggestion && (
        <div className="workflow-suggestion-card">
          <span>{latestSuggestion.targetTrigger} to {latestSuggestion.targetAction} · {latestSuggestion.confidence}% confidence</span>
          <strong>{latestSuggestion.suggestedRuleName}</strong>
          <p>{latestSuggestion.suggestedPayload.description}</p>
          <div className="workflow-suggestion-meta">
            <b>{latestSuggestion.riskLevel}</b>
            <em>{latestSuggestion.approvalRequired ? "owner approval required" : "approval optional"}</em>
          </div>
          <small>{latestSuggestion.guardrails.slice(0, 3).join(" · ")}</small>
        </div>
      )}
      {overdueRule && (
        <div className={`dry-run-rule ${overdueRule.enabled ? "enabled" : "paused"}`}>
          <div>
            <span>{overdueRule.trigger} · v{overdueRule.currentVersion}</span>
            <strong>{overdueRule.name}</strong>
            <em>{overdueRule.lastVersion?.reason || "Initial workflow rule version"}</em>
          </div>
          <div className="rule-state-actions">
            <b>{overdueRule.enabled ? "enabled" : "paused"}</b>
            <button
              className="rule-state-button"
              type="button"
              disabled={actionState === `rule-state:${overdueRule.id}`}
              onClick={() => onToggleRule(overdueRule)}
            >
              {actionState === `rule-state:${overdueRule.id}`
                ? "Saving"
                : overdueRule.enabled ? "Pause rule" : "Resume rule"}
            </button>
            {overdueRule.currentVersion > 1 && (
              <button
                className="rule-state-button rollback"
                type="button"
                disabled={actionState === `rule-rollback:${overdueRule.id}`}
                onClick={() => onRollbackRule(overdueRule)}
              >
                {actionState === `rule-rollback:${overdueRule.id}` ? "Restoring" : `Rollback v${overdueRule.currentVersion - 1}`}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="approval-list">
        {approvals.map(approval => (
          <div className={`approval-card ${approval.riskLevel}`} key={approval.id}>
            <span>{approval.actionKey}</span>
            <strong>{approval.title}</strong>
            <p>{approval.reason}</p>
            <div className="approval-meta">
              <em>{approval.customerName}</em>
              <b>{approval.riskLevel}</b>
            </div>
            {executableActions.includes(approval.actionKey) ? (
              <button
                className="inline-action"
                type="button"
                disabled={actionState === `running:${approval.id}`}
                onClick={() => onExecute(approval)}
              >
                {actionState === `running:${approval.id}`
                  ? "Executing..."
                  : approval.actionKey === "finance.invoice.propose"
                    ? "Approve & draft invoice"
                    : approval.actionKey === "service.reply.send"
                      ? "Approve & send"
                    : approval.actionKey === "crm.quote.release"
                      ? "Approve & release"
                    : approval.actionKey === "legal.answer.approve"
                      ? "Approve & publish"
                      : approval.actionKey === "privacy.request.approve"
                        ? approval.payload?.requestType === "delete" ? "Approve & assess" : "Approve & export"
                    : "Approve & execute"}
              </button>
            ) : (
              <div className="action-status">Manual review required</div>
            )}
          </div>
        ))}
      </div>
      {(runs || []).length > 0 && (
        <div className="run-history">
          <span className="section-label">Run history</span>
          {runs.slice(0, 4).map(run => (
            <div className={`run-card ${run.status || "completed"}`} key={run.id}>
              <div>
                <span>{run.actionKey}</span>
                <strong>{runStatusLabel(run)}</strong>
                <em>{runDetailLabel(run)}</em>
              </div>
              {run.status === "failed" && run.payload?.retryable && (
                <button
                  className="run-retry-button"
                  type="button"
                  disabled={actionState === `workflow-retry:${run.id}`}
                  onClick={() => onRetryRun(run)}
                >
                  {actionState === `workflow-retry:${run.id}` ? "Retrying" : "Retry"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {(dryRuns || []).length > 0 && (
        <div className="dry-run-history">
          <span className="section-label">Dry-run evidence</span>
          {(dryRuns || []).slice(0, 4).map(run => (
            <div className="dry-run-card" key={run.id}>
              <span>{run.resultPreview?.proposedTask?.invoiceNumber || run.matchedSubjectId}</span>
              <strong>{run.status} · {run.riskLevel}</strong>
              <em>{run.checksum.slice(0, 8)}</em>
            </div>
          ))}
        </div>
      )}
      {(testEvents || []).length > 0 && (
        <div className="test-event-history">
          <span className="section-label">Test-event evidence</span>
          {(testEvents || []).slice(0, 4).map(event => (
            <div className="test-event-card" key={event.id}>
              <span>{event.eventType} · {event.subjectId}</span>
              <strong>{event.status} · {event.actionKey}</strong>
              <em>{event.checksum.slice(0, 8)}</em>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function WebhookDeliveries({ deliveries }) {
  return (
    <article className="panel webhook-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Integration webhooks</span>
          <h2>Delivery log</h2>
        </div>
      </div>
      <div className="webhook-list">
        {deliveries.slice(0, 5).map(delivery => (
          <div className={`webhook-card ${delivery.status}`} key={delivery.id}>
            <div>
              <span>{delivery.eventKey}</span>
              <strong>{delivery.endpointName}</strong>
              <em>{delivery.endpointUrl}</em>
            </div>
            <b>{delivery.status}</b>
          </div>
        ))}
        {deliveries.length === 0 && <div className="action-status">No deliveries yet</div>}
      </div>
    </article>
  );
}

function IntegrationHubPanel({ connectors, actionState, canManage, onConfigureWhatsApp, onCheckConnector }) {
  const connected = connectors.filter(connector => connector.status === "connected").length;
  const ready = connectors.filter(connector => connector.lastHealthStatus === "ready").length;
  const whatsapp = connectors.find(connector => connector.connectorKey === "whatsapp-business");
  return (
    <article className="panel integration-hub-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Integration Hub</span>
          <h2>Connector contracts</h2>
        </div>
        {canManage && whatsapp?.status !== "connected" && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "connector-configure:whatsapp-business"}
            onClick={onConfigureWhatsApp}
          >
            {actionState === "connector-configure:whatsapp-business" ? "Configuring" : "Connect WhatsApp"}
          </button>
        )}
      </div>
      <div className="integration-summary">
        <Metric label="contracts" value={connectors.length} />
        <Metric label="connected" value={connected} />
        <Metric label="ready" value={ready} />
      </div>
      <div className="integration-list">
        {connectors.slice(0, 8).map(connector => (
          <div className={`integration-card ${connector.lastHealthStatus || connector.status}`} key={connector.connectorKey}>
            <div>
              <span>{connector.provider}</span>
              <strong>{connector.name}</strong>
              <em>{connector.rebuildPolicy} · {connector.requiredScopes.length} scopes</em>
              <small>{connector.lastHealthStatus || connector.status}</small>
            </div>
            {canManage && connector.status === "connected" ? (
              <button
                className="mini-action secondary"
                type="button"
                disabled={actionState === `connector-check:${connector.connectorKey}`}
                onClick={() => onCheckConnector(connector.connectorKey)}
              >
                {actionState === `connector-check:${connector.connectorKey}` ? "Checking" : "Check"}
              </button>
            ) : (
              <b>{connector.status}</b>
            )}
          </div>
        ))}
        {connectors.length === 0 && <div className="action-status">No integration contracts yet</div>}
      </div>
    </article>
  );
}

function PilotTemplatePanel({ data, createdInstall, actionState, canInstall, onInstall }) {
  const template = data.template || {};
  const installRows = createdInstall ? [createdInstall, ...(data.installations || [])] : (data.installations || []);
  const installs = Array.from(new Map(installRows.map(install => [install.id, install])).values());
  const latest = installs[0];
  const setupFee = template.packageRows?.reduce((sum, row) => sum + row.setupFee, 0) || latest?.pricing?.setupFee || 0;
  const monthlyFee = template.packageRows?.reduce((sum, row) => sum + row.monthlyOpsFee, 0) || latest?.pricing?.monthlyOpsFee || 0;
  return (
    <article className="panel pilot-template-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Pilot template</span>
          <h2>{template.name || "Clinic / wellness pilot"}</h2>
        </div>
        {canInstall && !latest && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-template:install"}
            onClick={onInstall}
          >
            {actionState === "pilot-template:install" ? "Installing" : "Install pilot"}
          </button>
        )}
      </div>
      <div className="pilot-template-summary">
        <Metric label="setup AMD" value={setupFee.toLocaleString("hy-AM")} />
        <Metric label="monthly AMD" value={monthlyFee.toLocaleString("hy-AM")} />
        <Metric label="connectors" value={template.requiredConnectors?.length || 0} />
      </div>
      <div className="pilot-package-list">
        {(template.packageRows || []).map(row => (
          <div className="pilot-package-card" key={row.key}>
            <span>{row.key}</span>
            <strong>{row.name}</strong>
            <em>{row.setupFee.toLocaleString("hy-AM")} setup · {row.monthlyOpsFee.toLocaleString("hy-AM")} monthly</em>
          </div>
        ))}
      </div>
      {latest ? (
        <div className={`pilot-install-card ${latest.status}`}>
          <div>
            <span>{latest.customer?.name || "pilot customer"}</span>
            <strong>{latest.status}</strong>
            <em>{latest.readiness?.status || "readiness pending"} · {(latest.readiness?.gaps || []).slice(0, 2).join(" · ") || "no gaps"}</em>
          </div>
          <b>{latest.checksum.slice(0, 10)}</b>
        </div>
      ) : (
        <div className="action-status">No clinic/wellness pilot installed yet</div>
      )}
    </article>
  );
}

function PilotOwnerBriefPanel({ briefs, createdBrief, templateData, createdInstall, actionState, canCreate, onCreate }) {
  const briefRows = createdBrief ? [createdBrief, ...(briefs || [])] : (briefs || []);
  const rows = Array.from(new Map(briefRows.map(brief => [brief.id, brief])).values());
  const latest = rows[0];
  const installRows = createdInstall ? [createdInstall, ...(templateData?.installations || [])] : (templateData?.installations || []);
  const latestInstall = installRows[0];
  const answers = latest?.payload?.answers || [];
  const readinessGaps = latest?.payload?.readinessGaps || latestInstall?.readiness?.gaps || [];
  const nextActions = latest?.payload?.nextActions || [];
  const answerCount = latest?.answerCount || answers.length || 0;
  return (
    <article className="panel pilot-owner-brief-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Pilot owner brief</span>
          <h2>Operating answers</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-owner-brief:create" || !latestInstall}
            onClick={onCreate}
          >
            {actionState === "pilot-owner-brief:create" ? "Creating" : "Create brief"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className={`pilot-brief-status ${latest.status}`}>
            <div>
              <span>{latest.customerName || latest.payload?.customer?.name || "pilot customer"}</span>
              <strong>{latest.reportDate} · {latest.status}</strong>
              <em>{answerCount} answers · {latest.nextActionCount || nextActions.length} next actions</em>
            </div>
            <b>{latest.checksum.slice(0, 10)}</b>
          </div>
          {answers.length > 0 ? (
            <div className="pilot-brief-answer-grid">
              {answers.map(answer => (
                <div className="pilot-brief-card" key={answer.question}>
                  <span>{answer.question}</span>
                  <strong>{(answer.records || []).length}</strong>
                  <em>{answer.summary}</em>
                </div>
              ))}
            </div>
          ) : (
            <div className="pilot-brief-answer-grid">
              {[
                "Who owes money?",
                "Which leads are stuck?",
                "Which tickets are late?",
                "Which campaigns produced paying clients?",
                "What tax/accounting actions need review?"
              ].map(question => (
                <div className="pilot-brief-card" key={question}>
                  <span>{question}</span>
                  <strong>{answerCount ? "ready" : "pending"}</strong>
                  <em>payload stored in audited brief packet</em>
                </div>
              ))}
            </div>
          )}
          <div className="pilot-brief-actions">
            {(nextActions.length ? nextActions : readinessGaps.slice(0, 3).map(gap => `Resolve ${gap}`)).map(action => (
              <span key={action}>{action}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestInstall ? "No owner operating brief yet" : "Install pilot before creating owner brief"}</div>
      )}
    </article>
  );
}

function PilotOperatorWorkbenchPanel({ workbenches, createdWorkbench, ownerBriefs, createdBrief, actionState, canCreate, onCreate }) {
  const workbenchRows = createdWorkbench ? [createdWorkbench, ...(workbenches || [])] : (workbenches || []);
  const rows = Array.from(new Map(workbenchRows.map(workbench => [workbench.id, workbench])).values());
  const latest = rows[0];
  const briefRows = createdBrief ? [createdBrief, ...(ownerBriefs || [])] : (ownerBriefs || []);
  const latestBrief = briefRows[0];
  const lanes = latest?.payload?.lanes || [];
  const checklist = latest?.payload?.handoffChecklist || [];
  return (
    <article className="panel pilot-workbench-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Pilot operator workbench</span>
          <h2>Action lanes</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-workbench:create" || !latestBrief}
            onClick={onCreate}
          >
            {actionState === "pilot-workbench:create" ? "Building" : "Build workbench"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className={`pilot-workbench-status ${latest.status}`}>
            <div>
              <span>{latest.customerName || latest.payload?.customer?.name || "pilot customer"}</span>
              <strong>{latest.totalActionCount || latest.payload?.summary?.totalActions || 0} frontline actions</strong>
              <em>{latest.highPriorityActionCount || latest.payload?.summary?.highPriorityActions || 0} high priority · {latest.reviewRequiredActionCount || latest.payload?.summary?.reviewRequiredActions || 0} review required</em>
            </div>
            <b>{latest.checksum.slice(0, 10)}</b>
          </div>
          {lanes.length > 0 ? (
            <div className="pilot-workbench-lanes">
              {lanes.map(lane => (
                <div className="pilot-workbench-lane" key={lane.key}>
                  <span>{lane.ownerRole}</span>
                  <strong>{lane.title}</strong>
                  <em>{(lane.actions || []).length} actions</em>
                </div>
              ))}
            </div>
          ) : (
            <div className="pilot-workbench-lanes">
              {["Receivables", "Leads", "Tickets", "Campaigns", "Compliance"].map(label => (
                <div className="pilot-workbench-lane" key={label}>
                  <span>ready</span>
                  <strong>{label}</strong>
                  <em>metadata packet stored</em>
                </div>
              ))}
            </div>
          )}
          <div className="pilot-workbench-checklist">
            {(checklist.length ? checklist : ["Open Customer 360 before each touch.", "Route accounting wording to review."]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestBrief ? "No operator workbench yet" : "Create owner brief before building workbench"}</div>
      )}
    </article>
  );
}

function PilotAccountantReviewPanel({ reviews, createdReview, workbenches, createdWorkbench, actionState, canCreate, onCreate }) {
  const reviewRows = createdReview ? [createdReview, ...(reviews || [])] : (reviews || []);
  const rows = Array.from(new Map(reviewRows.map(review => [review.id, review])).values());
  const latest = rows[0];
  const workbenchRows = createdWorkbench ? [createdWorkbench, ...(workbenches || [])] : (workbenches || []);
  const latestWorkbench = workbenchRows[0];
  const items = latest?.payload?.items || [];
  const checklist = latest?.payload?.checklist || [];
  return (
    <article className="panel pilot-accountant-review-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Pilot accountant review</span>
          <h2>VAT and period queue</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-accountant-review:create" || !latestWorkbench}
            onClick={onCreate}
          >
            {actionState === "pilot-accountant-review:create" ? "Preparing" : "Prepare review"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className={`pilot-accountant-status ${latest.status}`}>
            <div>
              <span>{latest.customerName || latest.payload?.customer?.name || "pilot customer"}</span>
              <strong>{latest.openReviewCount || latest.payload?.summary?.openReviewCount || 0} open reviews</strong>
              <em>{latest.itemCount || latest.payload?.summary?.itemCount || 0} items · {money(latest.moneyAtRisk || latest.payload?.summary?.moneyAtRisk || 0)} at risk</em>
            </div>
            <b>{latest.checksum.slice(0, 10)}</b>
          </div>
          {items.length > 0 ? (
            <div className="pilot-accountant-items">
              {items.slice(0, 6).map(item => (
                <div className="pilot-accountant-item" key={item.key}>
                  <span>{item.category}</span>
                  <strong>{item.title}</strong>
                  <em>{item.status} · {item.invoiceNumber || item.periodKey || item.legalSource?.id || item.key}</em>
                </div>
              ))}
            </div>
          ) : (
            <div className="pilot-accountant-items">
              {["VAT source", "Period lock", "Receivable wording"].map(label => (
                <div className="pilot-accountant-item" key={label}>
                  <span>queued</span>
                  <strong>{label}</strong>
                  <em>metadata packet stored</em>
                </div>
              ))}
            </div>
          )}
          <div className="pilot-accountant-checklist">
            {(checklist.length ? checklist : ["Confirm VAT legal source status.", "Verify HayHashvapah period lock."]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestWorkbench ? "No accountant review queue yet" : "Build operator workbench before accountant review"}</div>
      )}
    </article>
  );
}

function PilotLaunchReadinessPanel({ packets, createdPacket, accountantReviews, createdAccountantReview, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map(packetRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const reviewRows = createdAccountantReview ? [createdAccountantReview, ...(accountantReviews || [])] : (accountantReviews || []);
  const latestReview = reviewRows[0];
  const gates = latest?.payload?.gates || [];
  const nextActions = latest?.payload?.nextActions || [];
  return (
    <article className="panel pilot-launch-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Pilot launch gate</span>
          <h2>Go-live readiness</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-launch-readiness:create" || !latestReview}
            onClick={onCreate}
          >
            {actionState === "pilot-launch-readiness:create" ? "Checking" : "Check launch"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className={`pilot-launch-status ${latest.status}`}>
            <div>
              <span>{latest.customerName || latest.payload?.customer?.name || "pilot customer"}</span>
              <strong>{latest.status} · {latest.blockerCount || latest.payload?.summary?.blockerCount || 0} blockers</strong>
              <em>{money(latest.moneyAtRisk || latest.payload?.summary?.moneyAtRisk || 0)} at risk · target {latest.targetLaunchDate}</em>
            </div>
            <b>{latest.checksum.slice(0, 10)}</b>
          </div>
          {gates.length > 0 ? (
            <div className="pilot-launch-gates">
              {gates.map(gate => (
                <div className={`pilot-launch-gate ${gate.status}`} key={gate.key}>
                  <span>{gate.status}</span>
                  <strong>{gate.label}</strong>
                  <em>{(gate.blockers || []).slice(0, 2).join(" · ") || "ready"}</em>
                </div>
              ))}
            </div>
          ) : (
            <div className="pilot-launch-gates">
              {["Evidence", "Commercial", "Workbench", "Accountant", "Connectors", "Money"].map(label => (
                <div className="pilot-launch-gate" key={label}>
                  <span>{latest.status}</span>
                  <strong>{label}</strong>
                  <em>metadata packet stored</em>
                </div>
              ))}
            </div>
          )}
          <div className="pilot-launch-actions">
            {(nextActions.length ? nextActions : ["Resolve launch blockers before paid pilot offer."]).map(action => (
              <span key={action}>{action}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestReview ? "No launch readiness packet yet" : "Prepare accountant review before launch check"}</div>
      )}
    </article>
  );
}

function PilotLaunchRemediationPanel({ plans, createdPlan, resolutions, createdResolution, launchPackets, createdLaunchPacket, actionState, userRole, canCreate, onCreate, onResolveAction }) {
  const planRows = createdPlan ? [createdPlan, ...(plans || [])] : (plans || []);
  const rows = Array.from(new Map(planRows.map(plan => [plan.id, plan])).values());
  const latest = rows[0];
  const resolutionRows = createdResolution ? [createdResolution, ...(resolutions || [])] : (resolutions || []);
  const allResolutions = Array.from(new Map(resolutionRows.map(resolution => [resolution.id, resolution])).values());
  const planResolutions = latest ? allResolutions.filter(resolution => resolution.remediationPlanId === latest.id) : [];
  const resolvedActionKeys = new Set(planResolutions.map(resolution => resolution.actionKey));
  const launchRows = createdLaunchPacket ? [createdLaunchPacket, ...(launchPackets || [])] : (launchPackets || []);
  const latestLaunch = launchRows[0];
  const actions = latest?.payload?.actions || latest?.actionSummaries || [];
  const checklist = latest?.payload?.checklist || [];
  const totalActions = latest?.actionCount || latest?.payload?.summary?.actionCount || actions.length || 0;
  const resolvedCount = Math.min(resolvedActionKeys.size, totalActions);
  const remainingCount = Math.max(totalActions - resolvedCount, 0);
  const completionPercent = totalActions ? Math.round((resolvedCount / totalActions) * 100) : 0;
  const latestResolution = planResolutions[0];
  const canResolveAction = action => (
    !resolvedActionKeys.has(action.key)
    && onResolveAction
    && (["Owner", "Admin"].includes(userRole) || userRole === action.ownerRole)
  );
  return (
    <article className="panel pilot-remediation-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Pilot remediation</span>
          <h2>Blocker action plan</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-remediation:create" || !latestLaunch}
            onClick={onCreate}
          >
            {actionState === "pilot-remediation:create" ? "Planning" : "Plan fixes"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className={`pilot-remediation-status ${latest.status}`}>
            <div>
              <span>{latest.customerName || latest.payload?.customer?.name || "pilot customer"}</span>
              <strong>{remainingCount} remaining actions</strong>
              <em>{resolvedCount} resolved · {completionPercent}% complete · {money(latest.moneyAtRisk || latest.payload?.summary?.moneyAtRisk || 0)} at risk</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          {latestResolution && (
            <div className="pilot-remediation-proof">
              <span>Latest resolution</span>
              <strong>{latestResolution.actionKey}</strong>
              <em>{latestResolution.ownerRole} · {latestResolution.evidenceType}</em>
              <b>{latestResolution.checksum?.slice(0, 10)}</b>
            </div>
          )}
          {actions.length > 0 ? (
            <div className="pilot-remediation-actions">
              {actions.slice(0, 8).map(action => {
                const resolved = resolvedActionKeys.has(action.key);
                const resolving = actionState === `pilot-resolution:${action.key}`;
                return (
                  <div className={`pilot-remediation-action ${action.priority} ${resolved ? "resolved" : ""}`} key={action.key}>
                    <span>{action.ownerRole} · {action.sourceGate}</span>
                    <strong>{action.title}</strong>
                    <em>{resolved ? "resolved" : action.status} · due {action.dueDate}</em>
                    {canResolveAction(action) && (
                      <button
                        className="mini-action secondary"
                        type="button"
                        disabled={resolving}
                        onClick={() => onResolveAction(action.key)}
                      >
                        {resolving ? "Resolving" : "Resolve"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="pilot-remediation-actions">
              {["Accountant", "Connectors", "Receivables"].map(label => (
                <div className="pilot-remediation-action" key={label}>
                  <span>{resolvedCount} resolved</span>
                  <strong>{label}</strong>
                  <em>metadata packet stored</em>
                </div>
              ))}
            </div>
          )}
          <div className="pilot-remediation-checklist">
            {(checklist.length ? checklist : ["Re-run launch readiness after fixes."]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestLaunch ? "No remediation plan yet" : "Create launch readiness before remediation plan"}</div>
      )}
    </article>
  );
}

function PilotLaunchClearancePanel({ packets, createdPacket, plans, createdPlan, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map(packetRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const planRows = createdPlan ? [createdPlan, ...(plans || [])] : (plans || []);
  const latestPlan = planRows[0];
  const controls = latest?.payload?.controls || [];
  const unresolved = latest?.payload?.unresolvedActions || [];
  const resolved = latest?.payload?.resolvedActions || [];
  return (
    <article className="panel pilot-clearance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Pilot clearance</span>
          <h2>Go-live decision</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-clearance:create" || !latestPlan}
            onClick={onCreate}
          >
            {actionState === "pilot-clearance:create" ? "Checking" : "Check clearance"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className={`pilot-clearance-status ${latest.status}`}>
            <div>
              <span>{latest.customerName || latest.payload?.customer?.name || "pilot customer"}</span>
              <strong>{latest.goLiveAllowed ? "Ready for paid pilot" : "Blocked before go-live"}</strong>
              <em>{latest.resolvedActionCount || latest.payload?.summary?.resolvedActionCount || 0} resolved · {latest.unresolvedActionCount || latest.payload?.summary?.unresolvedActionCount || 0} open · {latest.completionPercent || latest.payload?.summary?.completionPercent || 0}% complete</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-clearance-grid">
            {(unresolved.length ? unresolved : resolved.slice(0, 6)).map(action => (
              <div className={`pilot-clearance-action ${action.status}`} key={action.key}>
                <span>{action.ownerRole} · {action.sourceGate}</span>
                <strong>{action.title}</strong>
                <em>{action.status}{action.resolutionChecksum ? ` · ${action.resolutionChecksum.slice(0, 10)}` : ""}</em>
              </div>
            ))}
            {!unresolved.length && !resolved.length && (
              <div className="pilot-clearance-action blocked">
                <span>metadata</span>
                <strong>{latest.status}</strong>
                <em>packet stored</em>
              </div>
            )}
          </div>
          <div className="pilot-clearance-controls">
            {(controls.length ? controls : ["owner-admin-clearance-only"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPlan ? "No launch clearance packet yet" : "Create remediation plan before clearance"}</div>
      )}
    </article>
  );
}

function PilotPaidOfferPanel({ offers, createdOffer, clearancePackets, createdClearance, actionState, canCreate, onCreate }) {
  const offerRows = createdOffer ? [createdOffer, ...(offers || [])] : (offers || []);
  const rows = Array.from(new Map(offerRows.map(offer => [offer.id, offer])).values());
  const latest = rows[0];
  const clearanceRows = createdClearance ? [createdClearance, ...(clearancePackets || [])] : (clearancePackets || []);
  const latestCleared = clearanceRows.find(packet => packet.status === "cleared");
  const commercial = latest?.payload?.commercial || latest || {};
  const setupFee = commercial.setupFee || latest?.setupFee || 0;
  const monthlyOpsFee = commercial.monthlyOpsFee || latest?.monthlyOpsFee || 0;
  const firstMonthTotal = commercial.firstMonthTotal || latest?.firstMonthTotal || 0;
  const firstMonthSubtotal = commercial.firstMonthSubtotal ?? (setupFee + monthlyOpsFee);
  const firstMonthVat = commercial.firstMonthVat ?? Math.max(firstMonthTotal - firstMonthSubtotal, 0);
  const handoffs = latest?.payload?.handoffs || [];
  return (
    <article className="panel pilot-paid-offer-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Paid pilot offer</span>
          <h2>Customer package</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-paid-offer:create" || !latestCleared}
            onClick={onCreate}
          >
            {actionState === "pilot-paid-offer:create" ? "Preparing" : "Prepare offer"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-paid-offer-status">
            <div>
              <span>{latest.customerName || latest.payload?.customer?.name || "pilot customer"}</span>
              <strong>{money(firstMonthTotal)} first month</strong>
              <em>{money(setupFee)} setup · {money(monthlyOpsFee)} monthly · valid {latest.validUntil}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-paid-offer-grid">
            {[
              ["VAT", `${Math.round((commercial.vatRate || 0.2) * 100)}%`],
              ["Subtotal", money(firstMonthSubtotal)],
              ["VAT amount", money(firstMonthVat)],
              ["Pilots", commercial.pilotCount || 5]
            ].map(([label, value]) => (
              <div className="pilot-paid-offer-metric" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-paid-offer-handoffs">
            {(handoffs.length ? handoffs : ["crm-quote-release-approval"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCleared ? "No paid pilot offer yet" : "Clear launch before preparing offer"}</div>
      )}
    </article>
  );
}

function PilotQuoteHandoffPanel({ handoffs, createdHandoff, offers, createdOffer, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map(handoffRows.map(handoff => [handoff.id, handoff])).values());
  const latest = rows[0];
  const offerRows = createdOffer ? [createdOffer, ...(offers || [])] : (offers || []);
  const latestOffer = offerRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || latest || {};
  const approval = payload.approval || latest || {};
  return (
    <article className="panel pilot-quote-handoff-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Quote handoff</span>
          <h2>CRM release package</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-quote-handoff:create" || !latestOffer}
            onClick={onCreate}
          >
            {actionState === "pilot-quote-handoff:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-quote-handoff-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.firstMonthTotal || quote.total || 0)} quote pending release</strong>
              <em>{latest.quoteId || quote.id} · {latest.approvalId || approval.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-quote-handoff-grid">
            {[
              ["Quote", latest.quoteId || quote.id],
              ["Approval", latest.approvalId || approval.id],
              ["Status", latest.status],
              ["Deal", latest.dealId || payload.deal?.id]
            ].map(([label, value]) => (
              <div className="pilot-quote-handoff-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-quote-handoff-controls">
            {(payload.controls || ["crm-quote-release-approval-required"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestOffer ? "No CRM quote handoff yet" : "Prepare paid offer before quote handoff"}</div>
      )}
    </article>
  );
}

function PilotQuoteReleasePanel({ releases, createdRelease, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const rows = Array.from(new Map(releaseRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || latest || {};
  const approval = payload.approval || latest || {};
  return (
    <article className="panel pilot-quote-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Quote release</span>
          <h2>Customer link</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-quote-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-quote-release:create" ? "Recording" : "Record release"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-quote-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} public quote</strong>
              <em>{latest.quoteId || quote.id} · {latest.approvalId || approval.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-quote-release-grid">
            {[
              ["Public", payload.publicAvailability ? "visible" : latest.status],
              ["Quote", latest.quoteId || quote.id],
              ["Approval", latest.approvalId || approval.id],
              ["Handoff", latest.quoteHandoffId || payload.handoff?.id]
            ].map(([label, value]) => (
              <div className="pilot-quote-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-quote-release-controls">
            {(payload.controls || ["public-quote-visible-after-workflow-execution"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Release the quote workflow before recording evidence" : "Create CRM quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map(packetRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || latest || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-acceptance-handoff-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Acceptance handoff</span>
          <h2>HayHashvapah approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-acceptance-handoff:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-acceptance-handoff:create" ? "Recording" : "Record handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-acceptance-handoff-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} invoice approval pending</strong>
              <em>{latest.acceptanceId || payload.acceptance?.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-acceptance-handoff-grid">
            {[
              ["Signer", latest.signerName || payload.acceptance?.signerName],
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Approval", latest.financeApprovalId || financeApproval.id]
            ].map(([label, value]) => (
              <div className="pilot-acceptance-handoff-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-acceptance-handoff-controls">
            {(payload.controls || ["owner-approval-required-before-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the public quote before HayHashvapah handoff" : "Record quote release before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map(packetRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-hayhashvapah-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">HayHashvapah draft</span>
          <h2>Invoice packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-hayhashvapah-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-hayhashvapah-draft:create" ? "Recording" : "Record draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-hayhashvapah-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} HayHashvapah draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-hayhashvapah-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-hayhashvapah-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-hayhashvapah-draft-controls">
            {(payload.controls || ["hayhashvapah-draft-created-from-accepted-quote"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute finance approval before recording HayHashvapah draft" : "Record accepted quote handoff before draft invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map(packetRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-official-invoice-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Official invoice</span>
          <h2>Receivable packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-official-invoice-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || invoice.total || 0)} open receivable</strong>
              <em>{latest.invoiceNumber || invoice.number} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-official-invoice-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || payload.draftInvoice?.periodKey],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Invoice", latest.invoiceId || invoice.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-official-invoice-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-official-invoice-controls">
            {(payload.controls || ["official-receivable-created-from-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post official invoice before recording receivable evidence" : "Record HayHashvapah draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map(packetRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-payment-collection-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Payment collection</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-payment-collection:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-payment-collection:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-payment-collection-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-payment-collection-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-payment-collection-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-payment-collection-controls">
            {(payload.controls || ["hayhashvapah-payment-receipt-linked"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record HayHashvapah payment before collection evidence" : "Record official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map(packetRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const renewalTask = payload.renewalTask || {};
  const payment = payload.payment || {};
  return (
    <article className="panel pilot-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Pilot closeout</span>
          <h2>Renewal handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-closeout:create" ? "Closing" : "Close pilot"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {renewalTask.id || latest.renewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-closeout-grid">
            {[
              ["Collected", money(latest.amount || payment.amount || 0)],
              ["Closeout", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Renewal due", latest.renewalDueDate || renewalTask.dueDate],
              ["Task", latest.renewalTaskId || renewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-closeout-controls">
            {(payload.controls || ["paid-pilot-closeout-after-collection"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid pilot and hand renewal to CRM" : "Record payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map(handoffRows.map(handoff => [handoff.id, handoff])).values());
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  return (
    <article className="panel pilot-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Renewal quote</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-renewal-quote:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} renewal quote</strong>
              <em>{latest.quoteId || quote.id} · {latest.approvalId || approval.id}</em>
            </div>
            <b>{latest.status || "renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["Subtotal", money(latest.subtotal || quote.subtotal || 0)],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Checksum", latest.checksum?.slice(0, 10)]
            ].map(([label, value]) => (
              <div className="pilot-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-renewal-quote-controls">
            {(payload.controls || ["renewal-quote-release-approval-required"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the monthly renewal quote and owner release approval" : "Close the paid pilot before renewal quote handoff"}</div>
      )}
    </article>
  );
}

function PilotRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map(packetRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || latest || {};
  const approval = payload.approval || latest || {};
  return (
    <article className="panel pilot-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Renewal release</span>
          <h2>Customer link</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-renewal-release:create" ? "Recording" : "Record release"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} public renewal</strong>
              <em>{latest.quoteId || quote.id} · {latest.approvalId || approval.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-renewal-release-grid">
            {[
              ["Public", payload.publicAvailability ? "visible" : latest.status],
              ["Quote", latest.quoteId || quote.id],
              ["Approval", latest.approvalId || approval.id],
              ["Handoff", latest.renewalQuoteHandoffId || payload.handoff?.id]
            ].map(([label, value]) => (
              <div className="pilot-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-renewal-release-controls">
            {(payload.controls || ["public-renewal-quote-visible-after-workflow-execution"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the renewal quote approval before release evidence" : "Create renewal quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map(packetRows.map(packet => [packet.id, packet])).values());
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || latest || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Renewal acceptance</span>
          <h2>HayHashvapah approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-renewal-acceptance:create" ? "Preparing" : "Prepare handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted renewal</strong>
              <em>{latest.acceptanceId || payload.acceptance?.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-renewal-acceptance-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Approval", latest.financeApprovalId || financeApproval.id],
              ["Task", latest.renewalTaskId || payload.renewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-renewal-acceptance-controls">
            {(payload.controls || ["owner-approval-required-before-renewal-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the renewal quote before HayHashvapah handoff" : "Release the renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Renewal draft</span>
          <h2>HayHashvapah invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-renewal-draft:create" ? "Recording" : "Record draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} renewal draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-renewal-draft-controls">
            {(payload.controls || ["renewal-hayhashvapah-draft-created-from-accepted-quote"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute renewal finance approval before recording HayHashvapah draft" : "Record accepted renewal handoff before draft invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Renewal receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || invoice.total || 0)} renewal receivable</strong>
              <em>{latest.invoiceNumber || invoice.number} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-renewal-official-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || payload.draftInvoice?.periodKey],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Invoice", latest.invoiceId || invoice.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-renewal-official-controls">
            {(payload.controls || ["renewal-official-receivable-created-from-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post renewal official invoice before recording receivable evidence" : "Record renewal HayHashvapah draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Renewal payment</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} renewal collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-renewal-payment-controls">
            {(payload.controls || ["renewal-hayhashvapah-payment-receipt-linked"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record renewal HayHashvapah payment before collection evidence" : "Record renewal official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const nextRenewalTask = payload.nextRenewalTask || {};
  const payment = payload.payment || {};
  return (
    <article className="panel pilot-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Renewal closeout</span>
          <h2>Next cycle task</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-renewal-closeout:create" ? "Closing" : "Close renewal"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {nextRenewalTask.id || latest.nextRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-renewal-closeout-grid">
            {[
              ["Collected", money(latest.amount || payment.amount || 0)],
              ["Closeout", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Next due", latest.nextRenewalDueDate || nextRenewalTask.dueDate],
              ["Task", latest.nextRenewalTaskId || nextRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-renewal-closeout-controls">
            {(payload.controls || ["paid-renewal-cycle-closeout-after-collection"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid renewal cycle and schedule the next task" : "Record renewal payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map([...handoffRows].reverse().map(handoff => [handoff.id, handoff])).values()).reverse();
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const nextRenewalTask = payload.nextRenewalTask || {};
  return (
    <article className="panel pilot-next-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next renewal quote</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-next-renewal-quote:create" ? "Creating" : "Create next quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} next cycle</strong>
              <em>{latest.quoteId || quote.id} · {nextRenewalTask.id || latest.nextRenewalTaskId}</em>
            </div>
            <b>{latest.status || "next-renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-next-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["Subtotal", money(latest.subtotal || quote.subtotal || 0)],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id]
            ].map(([label, value]) => (
              <div className="pilot-next-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-renewal-quote-controls">
            {(payload.controls || ["next-renewal-quote-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the next monthly renewal quote from the closed cycle" : "Close the renewal cycle before next quote handoff"}</div>
      )}
    </article>
  );
}

function PilotNextRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || latest || {};
  const approval = payload.approval || latest || {};
  return (
    <article className="panel pilot-next-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next renewal release</span>
          <h2>Customer link</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-next-renewal-release:create" ? "Recording" : "Record release"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} public next quote</strong>
              <em>{latest.quoteId || quote.id} · {latest.approvalId || approval.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-renewal-release-grid">
            {[
              ["Public", payload.publicAvailability ? "visible" : latest.status],
              ["Quote", latest.quoteId || quote.id],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.nextRenewalTaskId || payload.nextRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-next-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-renewal-release-controls">
            {(payload.controls || ["public-next-renewal-quote-visible-after-workflow-execution"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the next renewal quote approval before release evidence" : "Create next renewal quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || latest || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-next-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next renewal acceptance</span>
          <h2>HayHashvapah approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-next-renewal-acceptance:create" ? "Preparing" : "Prepare handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted next quote</strong>
              <em>{latest.acceptanceId || payload.acceptance?.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-next-renewal-acceptance-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Approval", latest.financeApprovalId || financeApproval.id],
              ["Task", latest.nextRenewalTaskId || payload.nextRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-next-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-renewal-acceptance-controls">
            {(payload.controls || ["owner-approval-required-before-next-renewal-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the next renewal quote before HayHashvapah handoff" : "Release the next renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotNextRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-next-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next renewal draft</span>
          <h2>HayHashvapah invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-next-renewal-draft:create" ? "Recording" : "Record draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} next draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-next-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-renewal-draft-controls">
            {(payload.controls || ["next-renewal-hayhashvapah-draft-created-from-accepted-quote"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Open the next accounting period and execute finance approval before recording draft evidence" : "Record accepted next renewal handoff before draft invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-next-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next renewal receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-next-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || invoice.total || 0)} next receivable</strong>
              <em>{latest.invoiceNumber || invoice.number} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-renewal-official-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || payload.draftInvoice?.periodKey],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Invoice", latest.invoiceId || invoice.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-next-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-renewal-official-controls">
            {(payload.controls || ["next-renewal-official-receivable-created-from-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post next renewal official invoice before recording receivable evidence" : "Record next renewal HayHashvapah draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-next-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next renewal payment</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-next-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} next collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-next-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-renewal-payment-controls">
            {(payload.controls || ["next-renewal-hayhashvapah-payment-receipt-linked"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record next renewal HayHashvapah payment before collection evidence" : "Record next renewal official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const followingRenewalTask = payload.followingRenewalTask || {};
  const payment = payload.payment || {};
  return (
    <article className="panel pilot-next-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next renewal closeout</span>
          <h2>Following task</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-next-renewal-closeout:create" ? "Closing" : "Close cycle"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {followingRenewalTask.id || latest.followingRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-renewal-closeout-grid">
            {[
              ["Collected", money(latest.amount || payment.amount || 0)],
              ["Closeout", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Following due", latest.followingRenewalDueDate || followingRenewalTask.dueDate],
              ["Task", latest.followingRenewalTaskId || followingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-next-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-renewal-closeout-controls">
            {(payload.controls || ["paid-next-renewal-cycle-closeout-after-collection"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid next renewal and schedule the following task" : "Record next renewal payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map([...handoffRows].reverse().map(handoff => [handoff.id, handoff])).values()).reverse();
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const followingRenewalTask = payload.followingRenewalTask || {};
  return (
    <article className="panel pilot-following-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following renewal</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-following-renewal-quote:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} following renewal</strong>
              <em>{latest.quoteId || quote.id} · {followingRenewalTask.id || latest.followingRenewalTaskId}</em>
            </div>
            <b>{latest.status || "following-renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-following-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.followingRenewalTaskId || followingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-following-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-renewal-quote-controls">
            {(payload.controls || ["following-renewal-quote-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the following renewal quote from the closed next-renewal cycle" : "Close next renewal before following quote handoff"}</div>
      )}
    </article>
  );
}

function PilotFollowingRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || latest || {};
  const approval = payload.approval || latest || {};
  return (
    <article className="panel pilot-following-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following release</span>
          <h2>Customer link</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-following-renewal-release:create" ? "Recording" : "Record release"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} public following quote</strong>
              <em>{latest.quoteId || quote.id} · {latest.approvalId || approval.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-following-renewal-release-grid">
            {[
              ["Public", payload.publicAvailability ? "visible" : latest.status],
              ["Quote", latest.quoteId || quote.id],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.followingRenewalTaskId || payload.followingRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-following-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-renewal-release-controls">
            {(payload.controls || ["public-following-renewal-quote-visible-after-workflow-execution"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the following renewal quote approval before release evidence" : "Create following renewal quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || latest || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-following-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following acceptance</span>
          <h2>HayHashvapah approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-following-renewal-acceptance:create" ? "Preparing" : "Prepare handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted following quote</strong>
              <em>{latest.acceptanceId || payload.acceptance?.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-following-renewal-acceptance-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Approval", latest.financeApprovalId || financeApproval.id],
              ["Task", latest.followingRenewalTaskId || payload.followingRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-following-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-renewal-acceptance-controls">
            {(payload.controls || ["owner-approval-required-before-following-renewal-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the following renewal quote before HayHashvapah handoff" : "Release the following renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotFollowingRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-following-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following draft</span>
          <h2>HayHashvapah invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-following-renewal-draft:create" ? "Recording" : "Record draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} following draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-following-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-following-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-renewal-draft-controls">
            {(payload.controls || ["following-renewal-hayhashvapah-draft-created-from-accepted-quote"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Open the following accounting period and execute finance approval before recording draft evidence" : "Record accepted following renewal handoff before draft invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-following-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-following-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || invoice.total || 0)} following receivable</strong>
              <em>{latest.invoiceNumber || invoice.number} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-following-renewal-official-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || payload.draftInvoice?.periodKey],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Invoice", latest.invoiceId || invoice.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-following-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-renewal-official-controls">
            {(payload.controls || ["following-renewal-official-receivable-created-from-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post following renewal official invoice before recording receivable evidence" : "Record following renewal HayHashvapah draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-following-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following payment</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-following-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} following collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-following-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-following-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-renewal-payment-controls">
            {(payload.controls || ["following-renewal-hayhashvapah-payment-receipt-linked"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record following renewal HayHashvapah payment before collection evidence" : "Record following renewal official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const subsequentRenewalTask = payload.subsequentRenewalTask || {};
  return (
    <article className="panel pilot-following-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following closeout</span>
          <h2>Subsequent task</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-following-renewal-closeout:create" ? "Closing" : "Close cycle"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {subsequentRenewalTask.id || latest.subsequentRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-following-renewal-closeout-grid">
            {[
              ["Closed", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Amount", money(latest.amount || payment.amount || 0)],
              ["Subsequent due", latest.subsequentRenewalDueDate || subsequentRenewalTask.dueDate],
              ["Task", latest.subsequentRenewalTaskId || subsequentRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-following-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-renewal-closeout-controls">
            {(payload.controls || ["following-renewal-payment-confirmed-before-closeout"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid following renewal and schedule the subsequent task" : "Record following renewal payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map([...handoffRows].reverse().map(handoff => [handoff.id, handoff])).values()).reverse();
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const subsequentRenewalTask = payload.subsequentRenewalTask || {};
  return (
    <article className="panel pilot-subsequent-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent renewal</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-renewal-quote:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} subsequent renewal</strong>
              <em>{latest.quoteId || quote.id} · {subsequentRenewalTask.id || latest.subsequentRenewalTaskId}</em>
            </div>
            <b>{latest.status || "subsequent-renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-subsequent-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.subsequentRenewalTaskId || subsequentRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-renewal-quote-controls">
            {(payload.controls || ["subsequent-renewal-quote-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the subsequent renewal quote from the closed following cycle" : "Close following renewal before subsequent quote handoff"}</div>
      )}
    </article>
  );
}

function PilotSubsequentRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const subsequentRenewalTask = payload.subsequentRenewalTask || {};
  return (
    <article className="panel pilot-subsequent-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent release</span>
          <h2>Public quote</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-renewal-release:create" ? "Releasing" : "Release quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || quote.status || "released"}</strong>
              <em>{latest.publicUrl || quote.acceptanceUrl || latest.publicToken} · {latest.quoteId || quote.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-subsequent-renewal-release-grid">
            {[
              ["Total", money(latest.total || quote.total || 0)],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.subsequentRenewalTaskId || subsequentRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-renewal-release-controls">
            {(payload.controls || ["owner-approved-subsequent-renewal-quote-release"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Release the approved subsequent quote after workflow execution" : "Create subsequent quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const acceptance = payload.acceptance || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-subsequent-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent acceptance</span>
          <h2>Invoice approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-renewal-acceptance:create" ? "Creating" : "Create handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted subsequent quote</strong>
              <em>{latest.acceptanceId || acceptance.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-subsequent-renewal-acceptance-grid">
            {[
              ["Signer", latest.signerEmail || acceptance.signerEmail],
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Approval", latest.financeApprovalId || financeApproval.id]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-renewal-acceptance-controls">
            {(payload.controls || ["hayhashvapah-subsequent-renewal-invoice-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the subsequent renewal quote before invoice approval handoff" : "Release the subsequent renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotSubsequentRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-subsequent-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent draft</span>
          <h2>HayHashvapah invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-renewal-draft:create" ? "Recording" : "Record draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} subsequent draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-subsequent-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-renewal-draft-controls">
            {(payload.controls || ["subsequent-renewal-hayhashvapah-draft-created-from-accepted-quote"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the subsequent finance approval before recording draft evidence" : "Record accepted subsequent renewal handoff before draft invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-subsequent-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || invoice.total || 0)} subsequent receivable</strong>
              <em>{latest.invoiceNumber || invoice.number} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-subsequent-renewal-official-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || payload.draftInvoice?.periodKey],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Invoice", latest.invoiceId || invoice.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-renewal-official-controls">
            {(payload.controls || ["subsequent-renewal-official-receivable-created-from-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post subsequent renewal official invoice before recording receivable evidence" : "Record subsequent renewal HayHashvapah draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-subsequent-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent payment</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} subsequent collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-subsequent-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-renewal-payment-controls">
            {(payload.controls || ["subsequent-renewal-hayhashvapah-payment-receipt-linked"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record subsequent renewal HayHashvapah payment before collection evidence" : "Record subsequent renewal official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const continuationRenewalTask = payload.continuationRenewalTask || {};
  return (
    <article className="panel pilot-subsequent-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent closeout</span>
          <h2>Continuation task</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-renewal-closeout:create" ? "Closing" : "Close cycle"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {continuationRenewalTask.id || latest.continuationRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-subsequent-renewal-closeout-grid">
            {[
              ["Closed", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Amount", money(latest.amount || payment.amount || 0)],
              ["Continuation due", latest.continuationRenewalDueDate || continuationRenewalTask.dueDate],
              ["Task", latest.continuationRenewalTaskId || continuationRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-renewal-closeout-controls">
            {(payload.controls || ["subsequent-renewal-payment-confirmed-before-closeout"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid subsequent renewal and schedule the continuation task" : "Record subsequent renewal payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotContinuationRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map([...handoffRows].reverse().map(handoff => [handoff.id, handoff])).values()).reverse();
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const continuationRenewalTask = payload.continuationRenewalTask || {};
  return (
    <article className="panel pilot-continuation-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Continuation renewal</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-continuation-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-continuation-renewal-quote:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-continuation-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} continuation renewal</strong>
              <em>{latest.quoteId || quote.id} · {continuationRenewalTask.id || latest.continuationRenewalTaskId}</em>
            </div>
            <b>{latest.status || "continuation-renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-continuation-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.continuationRenewalTaskId || continuationRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-continuation-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-continuation-renewal-quote-controls">
            {(payload.controls || ["continuation-renewal-quote-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the continuation renewal quote from the closed subsequent cycle" : "Close subsequent renewal before continuation quote handoff"}</div>
      )}
    </article>
  );
}

function PilotContinuationRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const continuationRenewalTask = payload.continuationRenewalTask || {};
  return (
    <article className="panel pilot-continuation-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Continuation release</span>
          <h2>Public quote</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-continuation-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-continuation-renewal-release:create" ? "Releasing" : "Release quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-continuation-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || quote.status || "released"}</strong>
              <em>{latest.publicUrl || quote.acceptanceUrl || latest.publicToken} · {latest.quoteId || quote.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-continuation-renewal-release-grid">
            {[
              ["Total", money(latest.total || quote.total || 0)],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.continuationRenewalTaskId || continuationRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-continuation-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-continuation-renewal-release-controls">
            {(payload.controls || ["owner-approved-continuation-renewal-quote-release"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Release the approved continuation quote after workflow execution" : "Create continuation quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotContinuationRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const acceptance = payload.acceptance || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-continuation-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Continuation acceptance</span>
          <h2>Invoice approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-continuation-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-continuation-renewal-acceptance:create" ? "Creating" : "Create handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-continuation-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted continuation quote</strong>
              <em>{latest.acceptanceId || acceptance.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-continuation-renewal-acceptance-grid">
            {[
              ["Signer", latest.signerEmail || acceptance.signerEmail],
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Task", latest.continuationRenewalTaskId || payload.continuationRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-continuation-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-continuation-renewal-acceptance-controls">
            {(payload.controls || ["hayhashvapah-continuation-renewal-invoice-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the continuation renewal quote before invoice approval handoff" : "Release the continuation renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotContinuationRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-continuation-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Continuation draft</span>
          <h2>HayHashvapah invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-continuation-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-continuation-renewal-draft:create" ? "Recording" : "Record draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-continuation-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} continuation draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-continuation-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-continuation-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-continuation-renewal-draft-controls">
            {(payload.controls || ["continuation-renewal-hayhashvapah-draft-created-from-accepted-quote"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the continuation finance approval before recording draft evidence" : "Record accepted continuation renewal handoff before draft invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotContinuationRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-continuation-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Continuation receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-continuation-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-continuation-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-continuation-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || invoice.total || 0)} continuation receivable</strong>
              <em>{latest.invoiceNumber || invoice.number} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-continuation-renewal-official-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || payload.draftInvoice?.periodKey],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Invoice", latest.invoiceId || invoice.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-continuation-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-continuation-renewal-official-controls">
            {(payload.controls || ["continuation-renewal-official-receivable-created-from-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post continuation renewal official invoice before recording receivable evidence" : "Record continuation renewal HayHashvapah draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotContinuationRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-continuation-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Continuation payment</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-continuation-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-continuation-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-continuation-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} continuation collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-continuation-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-continuation-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-continuation-renewal-payment-controls">
            {(payload.controls || ["continuation-renewal-hayhashvapah-payment-receipt-linked"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record continuation renewal HayHashvapah payment before collection evidence" : "Record continuation renewal official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotContinuationRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const ongoingRenewalTask = payload.ongoingRenewalTask || {};
  return (
    <article className="panel pilot-continuation-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Continuation closeout</span>
          <h2>Ongoing task</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-continuation-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-continuation-renewal-closeout:create" ? "Closing" : "Close cycle"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-continuation-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {ongoingRenewalTask.id || latest.ongoingRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-continuation-renewal-closeout-grid">
            {[
              ["Closed", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Amount", money(latest.amount || payment.amount || 0)],
              ["Ongoing due", latest.ongoingRenewalDueDate || ongoingRenewalTask.dueDate],
              ["Task", latest.ongoingRenewalTaskId || ongoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-continuation-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-continuation-renewal-closeout-controls">
            {(payload.controls || ["continuation-renewal-payment-confirmed-before-closeout"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid continuation renewal and schedule the ongoing task" : "Record continuation renewal payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotOngoingRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map([...handoffRows].reverse().map(handoff => [handoff.id, handoff])).values()).reverse();
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const ongoingRenewalTask = payload.ongoingRenewalTask || {};
  return (
    <article className="panel pilot-ongoing-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Ongoing renewal</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-ongoing-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-ongoing-renewal-quote:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-ongoing-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} ongoing renewal</strong>
              <em>{latest.quoteId || quote.id} · {ongoingRenewalTask.id || latest.ongoingRenewalTaskId}</em>
            </div>
            <b>{latest.status || "ongoing-renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-ongoing-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.ongoingRenewalTaskId || ongoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-ongoing-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-ongoing-renewal-quote-controls">
            {(payload.controls || ["ongoing-renewal-quote-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the ongoing renewal quote from the closed continuation cycle" : "Close continuation renewal before ongoing quote handoff"}</div>
      )}
    </article>
  );
}

function PilotOngoingRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const ongoingRenewalTask = payload.ongoingRenewalTask || {};
  return (
    <article className="panel pilot-ongoing-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Ongoing release</span>
          <h2>Public quote</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-ongoing-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-ongoing-renewal-release:create" ? "Releasing" : "Release quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-ongoing-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || quote.status || "released"}</strong>
              <em>{latest.publicUrl || quote.acceptanceUrl || latest.publicToken} · {latest.quoteId || quote.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-ongoing-renewal-release-grid">
            {[
              ["Total", money(latest.total || quote.total || 0)],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.ongoingRenewalTaskId || ongoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-ongoing-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-ongoing-renewal-release-controls">
            {(payload.controls || ["owner-approved-ongoing-renewal-quote-release"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Release the approved ongoing quote after workflow execution" : "Create ongoing quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotOngoingRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const acceptance = payload.acceptance || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-ongoing-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Ongoing acceptance</span>
          <h2>Invoice approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-ongoing-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-ongoing-renewal-acceptance:create" ? "Creating" : "Create handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-ongoing-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted ongoing quote</strong>
              <em>{latest.acceptanceId || acceptance.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-ongoing-renewal-acceptance-grid">
            {[
              ["Signer", latest.signerEmail || acceptance.signerEmail],
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Task", latest.ongoingRenewalTaskId || payload.ongoingRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-ongoing-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-ongoing-renewal-acceptance-controls">
            {(payload.controls || ["hayhashvapah-ongoing-renewal-invoice-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the ongoing renewal quote before invoice approval handoff" : "Release the ongoing renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotOngoingRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-ongoing-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Ongoing draft</span>
          <h2>HayHashvapah invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-ongoing-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-ongoing-renewal-draft:create" ? "Recording" : "Record draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-ongoing-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} ongoing draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-ongoing-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-ongoing-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-ongoing-renewal-draft-controls">
            {(payload.controls || ["ongoing-renewal-hayhashvapah-draft-created-from-accepted-quote"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the ongoing finance approval before recording draft evidence" : "Record accepted ongoing renewal handoff before draft invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotOngoingRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-ongoing-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Ongoing receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-ongoing-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-ongoing-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-ongoing-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || invoice.total || 0)} ongoing receivable</strong>
              <em>{latest.invoiceNumber || invoice.number} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-ongoing-renewal-official-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || payload.draftInvoice?.periodKey],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Invoice", latest.invoiceId || invoice.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-ongoing-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-ongoing-renewal-official-controls">
            {(payload.controls || ["ongoing-renewal-official-receivable-created-from-hayhashvapah-draft"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post ongoing renewal official invoice before recording receivable evidence" : "Record ongoing renewal HayHashvapah draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotOngoingRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-ongoing-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Ongoing payment</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-ongoing-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-ongoing-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-ongoing-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} ongoing collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-ongoing-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-ongoing-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-ongoing-renewal-payment-controls">
            {(payload.controls || ["ongoing-renewal-hayhashvapah-payment-receipt-linked"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record ongoing renewal HayHashvapah payment before collection evidence" : "Record ongoing renewal official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotOngoingRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const nextOngoingRenewalTask = payload.nextOngoingRenewalTask || {};
  return (
    <article className="panel pilot-ongoing-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Ongoing closeout</span>
          <h2>Next task</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-ongoing-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-ongoing-renewal-closeout:create" ? "Closing" : "Close cycle"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-ongoing-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {nextOngoingRenewalTask.id || latest.nextOngoingRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-ongoing-renewal-closeout-grid">
            {[
              ["Closed", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Amount", money(latest.amount || payment.amount || 0)],
              ["Next due", latest.nextOngoingRenewalDueDate || nextOngoingRenewalTask.dueDate],
              ["Task", latest.nextOngoingRenewalTaskId || nextOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-ongoing-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-ongoing-renewal-closeout-controls">
            {(payload.controls || ["ready-for-next-ongoing-renewal-quote-cycle"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid ongoing renewal and schedule the next recurring task" : "Record ongoing renewal payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotNextOngoingRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map([...handoffRows].reverse().map(handoff => [handoff.id, handoff])).values()).reverse();
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const nextOngoingRenewalTask = payload.nextOngoingRenewalTask || {};
  return (
    <article className="panel pilot-next-ongoing-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next ongoing renewal</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-ongoing-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-next-ongoing-renewal-quote:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-ongoing-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} next ongoing renewal</strong>
              <em>{latest.quoteId || quote.id} · {nextOngoingRenewalTask.id || latest.nextOngoingRenewalTaskId}</em>
            </div>
            <b>{latest.status || "next-ongoing-renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-next-ongoing-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.nextOngoingRenewalTaskId || nextOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-next-ongoing-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-ongoing-renewal-quote-controls">
            {(payload.controls || ["next-ongoing-renewal-quote-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the next ongoing renewal quote from the closed ongoing cycle" : "Close ongoing renewal before next quote handoff"}</div>
      )}
    </article>
  );
}

function PilotNextOngoingRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const nextOngoingRenewalTask = payload.nextOngoingRenewalTask || {};
  return (
    <article className="panel pilot-next-ongoing-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next ongoing release</span>
          <h2>Public quote</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-ongoing-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-next-ongoing-renewal-release:create" ? "Releasing" : "Release quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-ongoing-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || quote.status || "released"}</strong>
              <em>{latest.publicUrl || quote.acceptanceUrl || latest.publicToken} · {latest.quoteId || quote.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-ongoing-renewal-release-grid">
            {[
              ["Total", money(latest.total || quote.total || 0)],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.nextOngoingRenewalTaskId || nextOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-next-ongoing-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-ongoing-renewal-release-controls">
            {(payload.controls || ["owner-approved-next-ongoing-renewal-quote-release"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Release the approved next ongoing quote after workflow execution" : "Create next ongoing quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotNextOngoingRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const acceptance = payload.acceptance || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-next-ongoing-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next ongoing acceptance</span>
          <h2>Invoice approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-ongoing-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-next-ongoing-renewal-acceptance:create" ? "Creating" : "Create handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-ongoing-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted next ongoing quote</strong>
              <em>{latest.acceptanceId || acceptance.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-next-ongoing-renewal-acceptance-grid">
            {[
              ["Signer", latest.signerEmail || acceptance.signerEmail],
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Task", latest.nextOngoingRenewalTaskId || payload.nextOngoingRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-next-ongoing-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-ongoing-renewal-acceptance-controls">
            {(payload.controls || ["hayhashvapah-next-ongoing-renewal-invoice-approval-created"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the next ongoing renewal quote before invoice approval handoff" : "Release the next ongoing renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotNextOngoingRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  return (
    <article className="panel pilot-next-ongoing-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next ongoing draft</span>
          <h2>HayHashvapah invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-ongoing-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-next-ongoing-renewal-draft:create" ? "Recording" : "Record draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-ongoing-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} next ongoing draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-ongoing-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-next-ongoing-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-ongoing-renewal-draft-controls">
            {(payload.controls || ["next-ongoing-renewal-hayhashvapah-draft-created-from-accepted-quote"]).map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the next ongoing finance approval before recording draft evidence" : "Record accepted next ongoing renewal handoff before draft invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotNextOngoingRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "next-ongoing-renewal-official-receivable-created-from-hayhashvapah-draft",
    "next-ongoing-renewal-draft-packet-checksum-linked",
    "accepted-next-ongoing-renewal-quote-total-preserved",
    "armenian-vat-period-lineage-preserved",
    "next-ongoing-monthly-renewal-ready-for-payment-collection"
  ];
  return (
    <article className="panel pilot-next-ongoing-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next ongoing receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-ongoing-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-next-ongoing-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-ongoing-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.invoiceNumber || invoice.number || "official invoice"}</strong>
              <em>{latest.invoiceId || invoice.id} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-ongoing-renewal-official-grid">
            {[
              ["Invoice", latest.invoiceNumber || invoice.number],
              ["Period", latest.periodKey || hayhashvapah.periodKey || invoice.periodKey],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-next-ongoing-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-ongoing-renewal-official-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post the next ongoing draft before recording official invoice evidence" : "Record next ongoing draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotNextOngoingRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "next-ongoing-renewal-official-invoice-fully-paid",
    "next-ongoing-renewal-hayhashvapah-payment-receipt-linked",
    "next-ongoing-renewal-official-posting-checksum-linked",
    "armenian-vat-period-lineage-preserved",
    "customer-360-next-ongoing-renewal-payment-timeline-linked",
    "next-ongoing-monthly-renewal-ready-for-closeout"
  ];
  return (
    <article className="panel pilot-next-ongoing-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next ongoing payment</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-ongoing-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-next-ongoing-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-ongoing-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} next ongoing collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-ongoing-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["Period", latest.periodKey || hayhashvapah.periodKey || payment.periodKey],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-next-ongoing-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-ongoing-renewal-payment-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record next ongoing renewal HayHashvapah payment before collection evidence" : "Record next ongoing official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotNextOngoingRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const followingOngoingRenewalTask = payload.followingOngoingRenewalTask || {};
  const controls = payload.controls || [
    "next-ongoing-renewal-payment-confirmed-before-closeout",
    "next-ongoing-renewal-payment-collection-checksum-linked",
    "next-ongoing-renewal-official-posting-checksum-linked",
    "crm-following-ongoing-renewal-task-created",
    "ready-for-following-ongoing-renewal-quote-cycle"
  ];
  return (
    <article className="panel pilot-next-ongoing-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next ongoing closeout</span>
          <h2>Following task</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-ongoing-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-next-ongoing-renewal-closeout:create" ? "Closing" : "Close cycle"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-ongoing-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {followingOngoingRenewalTask.id || latest.followingOngoingRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-ongoing-renewal-closeout-grid">
            {[
              ["Closed", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Amount", money(latest.amount || payment.amount || 0)],
              ["Next due", latest.followingOngoingRenewalDueDate || followingOngoingRenewalTask.dueDate],
              ["Task", latest.followingOngoingRenewalTaskId || followingOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-next-ongoing-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-ongoing-renewal-closeout-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid next ongoing renewal and schedule the following recurring task" : "Record next ongoing payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingOngoingRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map([...handoffRows].reverse().map(handoff => [handoff.id, handoff])).values()).reverse();
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const followingOngoingRenewalTask = payload.followingOngoingRenewalTask || {};
  const controls = payload.controls || [
    "following-ongoing-renewal-quote-approval-created",
    "public-following-ongoing-renewal-quote-hidden-until-approved",
    "next-ongoing-renewal-closeout-checksum-linked",
    "following-ongoing-renewal-task-linked"
  ];
  return (
    <article className="panel pilot-following-ongoing-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following ongoing renewal</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-ongoing-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-following-ongoing-renewal-quote:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-ongoing-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} following ongoing renewal</strong>
              <em>{latest.quoteId || quote.id} · {followingOngoingRenewalTask.id || latest.followingOngoingRenewalTaskId}</em>
            </div>
            <b>{latest.status || "following-ongoing-renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-following-ongoing-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.followingOngoingRenewalTaskId || followingOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-following-ongoing-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-ongoing-renewal-quote-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the following ongoing renewal quote from the closed next ongoing cycle" : "Close next ongoing renewal before following quote handoff"}</div>
      )}
    </article>
  );
}

function PilotFollowingOngoingRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const followingOngoingRenewalTask = payload.followingOngoingRenewalTask || {};
  const controls = payload.controls || [
    "owner-approved-following-ongoing-renewal-quote-release",
    "public-following-ongoing-renewal-quote-visible-after-workflow-execution",
    "following-ongoing-renewal-quote-handoff-checksum-linked",
    "next-ongoing-renewal-closeout-checksum-linked",
    "following-ongoing-renewal-task-linked"
  ];
  return (
    <article className="panel pilot-following-ongoing-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following ongoing release</span>
          <h2>Public quote</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-ongoing-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-following-ongoing-renewal-release:create" ? "Releasing" : "Release quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-ongoing-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || quote.status || "released"}</strong>
              <em>{latest.publicUrl || quote.acceptanceUrl || latest.publicToken} · {latest.quoteId || quote.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-following-ongoing-renewal-release-grid">
            {[
              ["Total", money(latest.total || quote.total || 0)],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.followingOngoingRenewalTaskId || followingOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-following-ongoing-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-ongoing-renewal-release-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Release the approved following ongoing quote after workflow execution" : "Create following ongoing quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingOngoingRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const acceptance = payload.acceptance || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "accepted-following-ongoing-renewal-quote-linked",
    "following-ongoing-renewal-public-release-checksum-linked",
    "following-ongoing-renewal-finance-approval-created",
    "following-ongoing-renewal-hayhashvapah-invoice-handoff-ready"
  ];
  return (
    <article className="panel pilot-following-ongoing-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following ongoing acceptance</span>
          <h2>Invoice approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-ongoing-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-following-ongoing-renewal-acceptance:create" ? "Creating" : "Create handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-ongoing-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted following ongoing quote</strong>
              <em>{latest.acceptanceId || acceptance.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-following-ongoing-renewal-acceptance-grid">
            {[
              ["Signer", latest.signerName || acceptance.signerName],
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Approval", latest.financeApprovalId || financeApproval.id]
            ].map(([label, value]) => (
              <div className="pilot-following-ongoing-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-ongoing-renewal-acceptance-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the following ongoing renewal quote before invoice approval handoff" : "Release the following ongoing renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotFollowingOngoingRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "owner-approved-following-ongoing-renewal-finance-invoice-proposal",
    "following-ongoing-renewal-hayhashvapah-draft-created-from-accepted-quote",
    "armenian-vat-20-period-lock-reviewed",
    "following-ongoing-monthly-renewal-invoice-ready-for-official-posting",
    "following-ongoing-renewal-acceptance-handoff-checksum-linked"
  ];
  return (
    <article className="panel pilot-following-ongoing-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following ongoing draft</span>
          <h2>HayHashvapah invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-ongoing-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-following-ongoing-renewal-draft:create" ? "Recording" : "Record draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-ongoing-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} following ongoing draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.status || hayhashvapah.status}</b>
          </div>
          <div className="pilot-following-ongoing-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Task", latest.followingOngoingRenewalTaskId || payload.followingOngoingRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-following-ongoing-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-ongoing-renewal-draft-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the following ongoing finance approval before recording draft evidence" : "Record accepted following ongoing renewal handoff before draft invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingOngoingRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "following-ongoing-renewal-official-receivable-created-from-hayhashvapah-draft",
    "following-ongoing-renewal-draft-packet-checksum-linked",
    "accepted-following-ongoing-renewal-quote-total-preserved",
    "armenian-vat-period-lineage-preserved",
    "following-ongoing-monthly-renewal-ready-for-payment-collection"
  ];
  return (
    <article className="panel pilot-following-ongoing-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following ongoing receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-ongoing-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-following-ongoing-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-ongoing-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.invoiceNumber || invoice.number || "official invoice"}</strong>
              <em>{latest.invoiceId || invoice.id} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.status || hayhashvapah.status}</b>
          </div>
          <div className="pilot-following-ongoing-renewal-official-grid">
            {[
              ["Invoice", latest.invoiceNumber || invoice.number],
              ["Period", latest.periodKey || hayhashvapah.periodKey || invoice.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-following-ongoing-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-ongoing-renewal-official-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post the following ongoing draft before recording official invoice evidence" : "Record following ongoing draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingOngoingRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "following-ongoing-renewal-official-invoice-fully-paid",
    "following-ongoing-renewal-hayhashvapah-payment-receipt-linked",
    "following-ongoing-renewal-official-posting-checksum-linked",
    "armenian-vat-period-lineage-preserved",
    "customer-360-following-ongoing-renewal-payment-timeline-linked",
    "following-ongoing-monthly-renewal-ready-for-closeout"
  ];
  return (
    <article className="panel pilot-following-ongoing-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following ongoing payment</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-ongoing-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-following-ongoing-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-ongoing-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} following ongoing collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-following-ongoing-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["Period", latest.periodKey || hayhashvapah.periodKey || payment.periodKey],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-following-ongoing-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-ongoing-renewal-payment-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record following ongoing renewal HayHashvapah payment before collection evidence" : "Record following ongoing official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotFollowingOngoingRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const subsequentOngoingRenewalTask = payload.subsequentOngoingRenewalTask || {};
  const controls = payload.controls || [
    "following-ongoing-renewal-payment-confirmed-before-closeout",
    "following-ongoing-renewal-payment-collection-checksum-linked",
    "following-ongoing-renewal-official-posting-checksum-linked",
    "crm-subsequent-ongoing-renewal-task-created",
    "ready-for-subsequent-ongoing-renewal-quote-cycle"
  ];
  return (
    <article className="panel pilot-following-ongoing-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Following ongoing closeout</span>
          <h2>Subsequent task</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-following-ongoing-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-following-ongoing-renewal-closeout:create" ? "Closing" : "Close cycle"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-following-ongoing-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {subsequentOngoingRenewalTask.id || latest.subsequentOngoingRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-following-ongoing-renewal-closeout-grid">
            {[
              ["Closed", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Amount", money(latest.amount || payment.amount || 0)],
              ["Next due", latest.subsequentOngoingRenewalDueDate || subsequentOngoingRenewalTask.dueDate],
              ["Task", latest.subsequentOngoingRenewalTaskId || subsequentOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-following-ongoing-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-following-ongoing-renewal-closeout-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid following ongoing renewal and schedule the subsequent recurring task" : "Record following ongoing payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentOngoingRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map([...handoffRows].reverse().map(handoff => [handoff.id, handoff])).values()).reverse();
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const subsequentOngoingRenewalTask = payload.subsequentOngoingRenewalTask || {};
  const controls = payload.controls || [
    "subsequent-ongoing-renewal-quote-approval-created",
    "public-subsequent-ongoing-renewal-quote-hidden-until-approved",
    "following-ongoing-renewal-closeout-checksum-linked",
    "subsequent-ongoing-renewal-task-linked"
  ];
  return (
    <article className="panel pilot-subsequent-ongoing-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent ongoing renewal</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-ongoing-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-ongoing-renewal-quote:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-ongoing-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} subsequent ongoing renewal</strong>
              <em>{latest.quoteId || quote.id} · {subsequentOngoingRenewalTask.id || latest.subsequentOngoingRenewalTaskId}</em>
            </div>
            <b>{latest.status || "subsequent-ongoing-renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-subsequent-ongoing-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.subsequentOngoingRenewalTaskId || subsequentOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-ongoing-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-ongoing-renewal-quote-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the subsequent ongoing renewal quote from the closed following ongoing cycle" : "Close following ongoing renewal before subsequent quote handoff"}</div>
      )}
    </article>
  );
}

function PilotSubsequentOngoingRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const subsequentOngoingRenewalTask = payload.subsequentOngoingRenewalTask || {};
  const controls = payload.controls || [
    "owner-approved-subsequent-ongoing-renewal-quote-release",
    "public-subsequent-ongoing-renewal-quote-visible-after-workflow-execution",
    "subsequent-ongoing-renewal-quote-handoff-checksum-linked",
    "following-ongoing-renewal-closeout-checksum-linked",
    "subsequent-ongoing-renewal-task-linked"
  ];
  return (
    <article className="panel pilot-subsequent-ongoing-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent ongoing release</span>
          <h2>Public quote</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-ongoing-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-ongoing-renewal-release:create" ? "Releasing" : "Release quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-ongoing-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || quote.status || "released"}</strong>
              <em>{latest.publicUrl || quote.acceptanceUrl || latest.publicToken} · {latest.quoteId || quote.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-subsequent-ongoing-renewal-release-grid">
            {[
              ["Total", money(latest.total || quote.total || 0)],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.subsequentOngoingRenewalTaskId || subsequentOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-ongoing-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-ongoing-renewal-release-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Release the approved subsequent ongoing quote after workflow execution" : "Create subsequent ongoing quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentOngoingRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const acceptance = payload.acceptance || {};
  const financeApproval = payload.financeApproval || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "accepted-subsequent-ongoing-renewal-quote-linked",
    "subsequent-ongoing-renewal-public-release-checksum-linked",
    "subsequent-ongoing-renewal-finance-approval-created",
    "subsequent-ongoing-renewal-hayhashvapah-invoice-handoff-ready",
    "following-ongoing-renewal-closeout-checksum-linked",
    "subsequent-ongoing-renewal-task-linked"
  ];
  return (
    <article className="panel pilot-subsequent-ongoing-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent ongoing acceptance</span>
          <h2>Invoice approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-ongoing-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-ongoing-renewal-acceptance:create" ? "Creating" : "Create handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-ongoing-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted subsequent ongoing quote</strong>
              <em>{latest.acceptanceId || acceptance.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-subsequent-ongoing-renewal-acceptance-grid">
            {[
              ["Signer", latest.signerName || acceptance.signerName],
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Approval", latest.financeApprovalId || financeApproval.id]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-ongoing-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-ongoing-renewal-acceptance-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the subsequent ongoing renewal quote before invoice approval handoff" : "Release the subsequent ongoing renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotSubsequentOngoingRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "owner-approved-subsequent-ongoing-renewal-finance-invoice-proposal",
    "subsequent-ongoing-renewal-hayhashvapah-draft-created-from-accepted-quote",
    "armenian-vat-20-period-lock-reviewed",
    "subsequent-ongoing-monthly-renewal-invoice-ready-for-official-posting",
    "subsequent-ongoing-renewal-acceptance-handoff-checksum-linked"
  ];
  return (
    <article className="panel pilot-subsequent-ongoing-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent ongoing draft</span>
          <h2>HayHashvapah draft</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-ongoing-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-ongoing-renewal-draft:create" ? "Recording" : "Create draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-ongoing-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} subsequent ongoing draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.status || hayhashvapah.status}</b>
          </div>
          <div className="pilot-subsequent-ongoing-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Task", latest.subsequentOngoingRenewalTaskId || payload.subsequentOngoingRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-ongoing-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-ongoing-renewal-draft-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the subsequent ongoing finance approval before draft evidence" : "Create subsequent ongoing acceptance handoff before draft evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentOngoingRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "subsequent-ongoing-renewal-official-receivable-created-from-hayhashvapah-draft",
    "subsequent-ongoing-renewal-draft-packet-checksum-linked",
    "accepted-subsequent-ongoing-renewal-quote-total-preserved",
    "armenian-vat-period-lineage-preserved",
    "subsequent-ongoing-monthly-renewal-ready-for-payment-collection"
  ];
  return (
    <article className="panel pilot-subsequent-ongoing-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent ongoing receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-ongoing-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-ongoing-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-ongoing-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.invoiceNumber || invoice.number || "official invoice"}</strong>
              <em>{latest.invoiceId || invoice.id} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.status || hayhashvapah.status}</b>
          </div>
          <div className="pilot-subsequent-ongoing-renewal-official-grid">
            {[
              ["Invoice", latest.invoiceNumber || invoice.number],
              ["Period", latest.periodKey || hayhashvapah.periodKey || invoice.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-ongoing-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-ongoing-renewal-official-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post the subsequent ongoing draft before recording official invoice evidence" : "Record subsequent ongoing draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentOngoingRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "subsequent-ongoing-renewal-official-invoice-fully-paid",
    "subsequent-ongoing-renewal-hayhashvapah-payment-receipt-linked",
    "subsequent-ongoing-renewal-official-posting-checksum-linked",
    "armenian-vat-period-lineage-preserved",
    "customer-360-subsequent-ongoing-renewal-payment-timeline-linked",
    "subsequent-ongoing-monthly-renewal-ready-for-closeout"
  ];
  return (
    <article className="panel pilot-subsequent-ongoing-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent ongoing payment</span>
          <h2>Receipt packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-ongoing-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-ongoing-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-ongoing-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} subsequent ongoing collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-subsequent-ongoing-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["Period", latest.periodKey || hayhashvapah.periodKey || payment.periodKey],
              ["Payment", latest.paymentId || payment.id],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-ongoing-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-ongoing-renewal-payment-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record subsequent ongoing renewal HayHashvapah payment before collection evidence" : "Record subsequent ongoing official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotSubsequentOngoingRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const nextRecurringOngoingRenewalTask = payload.nextRecurringOngoingRenewalTask || {};
  const controls = payload.controls || [
    "subsequent-ongoing-renewal-payment-confirmed-before-closeout",
    "subsequent-ongoing-renewal-payment-collection-checksum-linked",
    "subsequent-ongoing-renewal-official-posting-checksum-linked",
    "crm-next-recurring-ongoing-renewal-task-created",
    "customer-360-subsequent-ongoing-renewal-closeout-linked",
    "ready-for-next-recurring-ongoing-renewal-cycle"
  ];
  return (
    <article className="panel pilot-subsequent-ongoing-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Subsequent ongoing closeout</span>
          <h2>Closeout packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-subsequent-ongoing-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-subsequent-ongoing-renewal-closeout:create" ? "Closing" : "Close cycle"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-subsequent-ongoing-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {nextRecurringOngoingRenewalTask.id || latest.nextRecurringOngoingRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-subsequent-ongoing-renewal-closeout-grid">
            {[
              ["Closed", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Amount", money(latest.amount || payment.amount || 0)],
              ["Next due", latest.nextRecurringOngoingRenewalDueDate || nextRecurringOngoingRenewalTask.dueDate],
              ["Task", latest.nextRecurringOngoingRenewalTaskId || nextRecurringOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-subsequent-ongoing-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-subsequent-ongoing-renewal-closeout-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid subsequent ongoing renewal and schedule the next recurring task" : "Record subsequent ongoing payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRecurringOngoingRenewalQuotePanel({ handoffs, createdHandoff, closeouts, createdCloseout, actionState, canCreate, onCreate }) {
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const rows = Array.from(new Map([...handoffRows].reverse().map(handoff => [handoff.id, handoff])).values()).reverse();
  const latest = rows[0];
  const closeoutRows = createdCloseout ? [createdCloseout, ...(closeouts || [])] : (closeouts || []);
  const latestCloseout = closeoutRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const nextRecurringOngoingRenewalTask = payload.nextRecurringOngoingRenewalTask || {};
  const controls = payload.controls || [
    "next-recurring-ongoing-renewal-quote-approval-created",
    "public-next-recurring-ongoing-renewal-quote-hidden-until-approved",
    "subsequent-ongoing-renewal-closeout-checksum-linked",
    "next-recurring-ongoing-renewal-task-linked"
  ];
  return (
    <article className="panel pilot-next-recurring-ongoing-renewal-quote-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next recurring ongoing</span>
          <h2>Quote handoff</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-recurring-ongoing-renewal-quote:create" || !latestCloseout}
            onClick={onCreate}
          >
            {actionState === "pilot-next-recurring-ongoing-renewal-quote:create" ? "Creating" : "Create quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-recurring-ongoing-renewal-quote-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.monthlyTotal || quote.total || 0)} next recurring ongoing</strong>
              <em>{latest.quoteId || quote.id} · {nextRecurringOngoingRenewalTask.id || latest.nextRecurringOngoingRenewalTaskId}</em>
            </div>
            <b>{latest.status || "next-recurring-ongoing-renewal-quote-release-pending"}</b>
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-quote-grid">
            {[
              ["Valid until", latest.validUntil || quote.validUntil],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.nextRecurringOngoingRenewalTaskId || nextRecurringOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-next-recurring-ongoing-renewal-quote-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-quote-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestCloseout ? "Create the next recurring ongoing renewal quote handoff from the closed subsequent cycle" : "Close the subsequent ongoing renewal before the next recurring quote handoff"}</div>
      )}
    </article>
  );
}

function PilotNextRecurringOngoingRenewalQuoteReleasePanel({ packets, createdPacket, handoffs, createdHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdHandoff ? [createdHandoff, ...(handoffs || [])] : (handoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const approval = payload.approval || {};
  const nextRecurringOngoingRenewalTask = payload.nextRecurringOngoingRenewalTask || {};
  const controls = payload.controls || [
    "owner-approved-next-recurring-ongoing-renewal-quote-release",
    "public-next-recurring-ongoing-renewal-quote-visible-after-workflow-execution",
    "next-recurring-ongoing-renewal-quote-handoff-checksum-linked",
    "subsequent-ongoing-renewal-closeout-checksum-linked",
    "next-recurring-ongoing-renewal-task-linked"
  ];
  return (
    <article className="panel pilot-next-recurring-ongoing-renewal-release-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next recurring release</span>
          <h2>Public quote</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-recurring-ongoing-renewal-release:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-next-recurring-ongoing-renewal-release:create" ? "Releasing" : "Release quote"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-recurring-ongoing-renewal-release-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || quote.status || "released"}</strong>
              <em>{latest.publicUrl || quote.acceptanceUrl || latest.publicToken} · {latest.quoteId || quote.id}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-release-grid">
            {[
              ["Total", money(latest.total || quote.total || 0)],
              ["VAT", money(latest.vat || quote.vat || 0)],
              ["Approval", latest.approvalId || approval.id],
              ["Task", latest.nextRecurringOngoingRenewalTaskId || nextRecurringOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-next-recurring-ongoing-renewal-release-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-release-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Release the approved next recurring ongoing quote after workflow execution" : "Create next recurring ongoing quote handoff before release evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRecurringOngoingRenewalAcceptanceHandoffPanel({ packets, createdPacket, releases, createdRelease, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const releaseRows = createdRelease ? [createdRelease, ...(releases || [])] : (releases || []);
  const latestRelease = releaseRows[0];
  const payload = latest?.payload || {};
  const quote = payload.quote || {};
  const acceptance = payload.acceptance || {};
  const financeApproval = payload.financeApproval || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "accepted-next-recurring-ongoing-renewal-quote-linked",
    "next-recurring-ongoing-renewal-public-release-checksum-linked",
    "next-recurring-ongoing-renewal-finance-approval-created",
    "next-recurring-ongoing-renewal-hayhashvapah-invoice-handoff-ready",
    "subsequent-ongoing-renewal-closeout-checksum-linked",
    "next-recurring-ongoing-renewal-task-linked"
  ];
  return (
    <article className="panel pilot-next-recurring-ongoing-renewal-acceptance-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next recurring acceptance</span>
          <h2>Invoice approval</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-recurring-ongoing-renewal-acceptance:create" || !latestRelease}
            onClick={onCreate}
          >
            {actionState === "pilot-next-recurring-ongoing-renewal-acceptance:create" ? "Handing off" : "Create handoff"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-recurring-ongoing-renewal-acceptance-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || quote.total || 0)} accepted next recurring quote</strong>
              <em>{latest.acceptanceId || acceptance.id} · {latest.financeApprovalId || financeApproval.id}</em>
            </div>
            <b>{latest.status}</b>
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-acceptance-grid">
            {[
              ["Signer", latest.signerName || acceptance.signerName],
              ["Period", latest.periodKey || hayhashvapah.periodKey || financeApproval.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode || financeApproval.vatMode],
              ["Approval", latest.financeApprovalId || financeApproval.id]
            ].map(([label, value]) => (
              <div className="pilot-next-recurring-ongoing-renewal-acceptance-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-acceptance-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestRelease ? "Accept the next recurring ongoing renewal quote before invoice approval handoff" : "Release the next recurring ongoing renewal quote before acceptance handoff"}</div>
      )}
    </article>
  );
}

function PilotNextRecurringOngoingRenewalHayhashvapahDraftPanel({ packets, createdPacket, acceptanceHandoffs, createdAcceptanceHandoff, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const handoffRows = createdAcceptanceHandoff ? [createdAcceptanceHandoff, ...(acceptanceHandoffs || [])] : (acceptanceHandoffs || []);
  const latestHandoff = handoffRows[0];
  const payload = latest?.payload || {};
  const draft = payload.draftInvoice || latest || {};
  const run = payload.workflowRun || latest || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "owner-approved-next-recurring-ongoing-renewal-finance-invoice-proposal",
    "next-recurring-ongoing-renewal-hayhashvapah-draft-created-from-accepted-quote",
    "armenian-vat-20-period-lock-reviewed",
    "next-recurring-ongoing-monthly-renewal-invoice-ready-for-official-posting",
    "next-recurring-ongoing-renewal-acceptance-handoff-checksum-linked"
  ];
  return (
    <article className="panel pilot-next-recurring-ongoing-renewal-draft-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next recurring draft</span>
          <h2>HayHashvapah draft</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-recurring-ongoing-renewal-draft:create" || !latestHandoff}
            onClick={onCreate}
          >
            {actionState === "pilot-next-recurring-ongoing-renewal-draft:create" ? "Recording" : "Create draft"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-recurring-ongoing-renewal-draft-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.total || draft.total || 0)} next recurring draft</strong>
              <em>{latest.draftNumber || draft.number} · {latest.workflowRunId || run.id}</em>
            </div>
            <b>{latest.status || hayhashvapah.status}</b>
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-draft-grid">
            {[
              ["Period", latest.periodKey || hayhashvapah.periodKey || draft.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode],
              ["VAT", money(latest.vat || draft.vat || 0)],
              ["Subtotal", money(latest.subtotal || draft.subtotal || 0)],
              ["Task", latest.nextRecurringOngoingRenewalTaskId || payload.nextRecurringOngoingRenewalTask?.id]
            ].map(([label, value]) => (
              <div className="pilot-next-recurring-ongoing-renewal-draft-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-draft-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestHandoff ? "Execute the next recurring finance approval before draft evidence" : "Create next recurring acceptance handoff before draft evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRecurringOngoingRenewalOfficialInvoicePanel({ packets, createdPacket, draftPackets, createdDraftPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const draftRows = createdDraftPacket ? [createdDraftPacket, ...(draftPackets || [])] : (draftPackets || []);
  const latestDraft = draftRows[0];
  const payload = latest?.payload || {};
  const invoice = payload.invoice || latest || {};
  const financeLink = payload.financeLink || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "next-recurring-ongoing-renewal-official-receivable-created-from-hayhashvapah-draft",
    "next-recurring-ongoing-renewal-draft-packet-checksum-linked",
    "accepted-next-recurring-ongoing-renewal-quote-total-preserved",
    "armenian-vat-period-lineage-preserved",
    "next-recurring-ongoing-monthly-renewal-ready-for-payment-collection"
  ];
  return (
    <article className="panel pilot-next-recurring-ongoing-renewal-official-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next recurring receivable</span>
          <h2>Official invoice</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-recurring-ongoing-renewal-official-invoice:create" || !latestDraft}
            onClick={onCreate}
          >
            {actionState === "pilot-next-recurring-ongoing-renewal-official-invoice:create" ? "Recording" : "Record invoice"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-recurring-ongoing-renewal-official-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.invoiceNumber || invoice.number || "official invoice"}</strong>
              <em>{latest.invoiceId || invoice.id} · {latest.invoiceLinkId || financeLink.id}</em>
            </div>
            <b>{latest.status || hayhashvapah.status}</b>
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-official-grid">
            {[
              ["Invoice", latest.invoiceNumber || invoice.number],
              ["Period", latest.periodKey || hayhashvapah.periodKey || invoice.periodKey],
              ["VAT mode", latest.vatMode || hayhashvapah.vatMode],
              ["VAT", money(latest.vat || invoice.vat || 0)],
              ["Status", latest.status || hayhashvapah.status]
            ].map(([label, value]) => (
              <div className="pilot-next-recurring-ongoing-renewal-official-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-official-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestDraft ? "Post the next recurring draft before recording official invoice evidence" : "Record next recurring draft before official invoice evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRecurringOngoingRenewalPaymentCollectionPanel({ packets, createdPacket, postingPackets, createdPostingPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const postingRows = createdPostingPacket ? [createdPostingPacket, ...(postingPackets || [])] : (postingPackets || []);
  const latestPosting = postingRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const invoice = payload.invoice || {};
  const hayhashvapah = payload.hayhashvapah || {};
  const controls = payload.controls || [
    "next-recurring-ongoing-renewal-official-invoice-fully-paid",
    "next-recurring-ongoing-renewal-official-posting-checksum-linked",
    "next-recurring-ongoing-renewal-payment-receipt-linked",
    "armenian-vat-period-lineage-preserved",
    "next-recurring-ongoing-monthly-renewal-ready-for-closeout"
  ];
  return (
    <article className="panel pilot-next-recurring-ongoing-renewal-payment-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next recurring payment</span>
          <h2>Payment collection</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-recurring-ongoing-renewal-payment:create" || !latestPosting}
            onClick={onCreate}
          >
            {actionState === "pilot-next-recurring-ongoing-renewal-payment:create" ? "Recording" : "Record receipt"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-recurring-ongoing-renewal-payment-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{money(latest.amount || payment.amount || 0)} next recurring collected</strong>
              <em>{latest.paymentReference || payment.reference} · {latest.invoiceNumber || invoice.number}</em>
            </div>
            <b>{latest.status || hayhashvapah.status || invoice.status}</b>
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-payment-grid">
            {[
              ["Paid", latest.paidAt || payment.paidAt],
              ["Period", latest.periodKey || hayhashvapah.periodKey || payment.periodKey],
              ["Payment", latest.paymentId || payment.id],
              ["Invoice", latest.invoiceNumber || invoice.number],
              ["Status", latest.status || hayhashvapah.status || invoice.status]
            ].map(([label, value]) => (
              <div className="pilot-next-recurring-ongoing-renewal-payment-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-payment-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPosting ? "Record next recurring renewal HayHashvapah payment before collection evidence" : "Record next recurring official invoice before payment collection evidence"}</div>
      )}
    </article>
  );
}

function PilotNextRecurringOngoingRenewalCloseoutPanel({ packets, createdPacket, paymentPackets, createdPaymentPacket, actionState, canCreate, onCreate }) {
  const packetRows = createdPacket ? [createdPacket, ...(packets || [])] : (packets || []);
  const rows = Array.from(new Map([...packetRows].reverse().map(packet => [packet.id, packet])).values()).reverse();
  const latest = rows[0];
  const paymentRows = createdPaymentPacket ? [createdPaymentPacket, ...(paymentPackets || [])] : (paymentPackets || []);
  const latestPayment = paymentRows[0];
  const payload = latest?.payload || {};
  const payment = payload.payment || {};
  const followingRecurringOngoingRenewalTask = payload.followingRecurringOngoingRenewalTask || {};
  const controls = payload.controls || [
    "next-recurring-ongoing-renewal-payment-confirmed-before-closeout",
    "next-recurring-ongoing-renewal-payment-collection-checksum-linked",
    "next-recurring-ongoing-renewal-official-posting-checksum-linked",
    "crm-following-recurring-ongoing-renewal-task-created",
    "customer-360-next-recurring-ongoing-renewal-closeout-linked",
    "ready-for-following-recurring-ongoing-renewal-cycle"
  ];
  return (
    <article className="panel pilot-next-recurring-ongoing-renewal-closeout-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Next recurring closeout</span>
          <h2>Closeout packet</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "pilot-next-recurring-ongoing-renewal-closeout:create" || !latestPayment}
            onClick={onCreate}
          >
            {actionState === "pilot-next-recurring-ongoing-renewal-closeout:create" ? "Closing" : "Close cycle"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className="pilot-next-recurring-ongoing-renewal-closeout-status">
            <div>
              <span>{latest.customerName || payload.customer?.name || "pilot customer"}</span>
              <strong>{latest.status || payload.closeout?.status}</strong>
              <em>{latest.paymentReference || payment.reference} · {followingRecurringOngoingRenewalTask.id || latest.followingRecurringOngoingRenewalTaskId}</em>
            </div>
            <b>{latest.checksum?.slice(0, 10)}</b>
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-closeout-grid">
            {[
              ["Closed", latest.closeoutDate || payload.closeout?.closeoutDate],
              ["Amount", money(latest.amount || payment.amount || 0)],
              ["Following due", latest.followingRecurringOngoingRenewalDueDate || followingRecurringOngoingRenewalTask.dueDate],
              ["Task", latest.followingRecurringOngoingRenewalTaskId || followingRecurringOngoingRenewalTask.id]
            ].map(([label, value]) => (
              <div className="pilot-next-recurring-ongoing-renewal-closeout-metric" key={label}>
                <span>{label}</span>
                <strong>{value || "metadata"}</strong>
              </div>
            ))}
          </div>
          <div className="pilot-next-recurring-ongoing-renewal-closeout-controls">
            {controls.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="action-status">{latestPayment ? "Close the paid next recurring renewal and schedule the following recurring task" : "Record next recurring payment collection before closeout evidence"}</div>
      )}
    </article>
  );
}

function AccessReviewPanel({ reviews, actionState, canCreate, onCreateAccessReview }) {
  const latest = reviews[0];
  return (
    <article className="panel access-review-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Admin governance</span>
          <h2>Access review</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "access-review:running"}
            onClick={onCreateAccessReview}
          >
            {actionState === "access-review:running" ? "Reviewing" : "Create review"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className={`access-review-status ${latest.status}`}>
            <div>
              <span>{latest.reviewPeriod}</span>
              <strong>{latest.status}</strong>
            </div>
            <b>{latest.roleCount} roles · {latest.userCount} users</b>
          </div>
          <div className="access-finding-list">
            {(latest.findings || []).slice(0, 4).map(finding => (
              <span key={finding}>{finding}</span>
            ))}
          </div>
          <div className="access-review-card">
            <div>
              <span>{latest.createdByName || "system"} · {new Date(latest.createdAt).toLocaleDateString("hy-AM")}</span>
              <strong>{latest.checksum.slice(0, 16)}</strong>
              <em>{latest.privilegedUserCount} privileged user{latest.privilegedUserCount === 1 ? "" : "s"}</em>
            </div>
            <b>{latest.payload ? "payload ready" : "audit copy"}</b>
          </div>
        </>
      ) : (
        <div className="action-status">No access review packet yet</div>
      )}
    </article>
  );
}

function AuditExportPanel({ exports, actionState, canCreate, onCreateAuditExport }) {
  const latest = exports[0];
  return (
    <article className="panel audit-export-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Audit integrity</span>
          <h2>Audit export</h2>
        </div>
        {canCreate && (
          <button
            className="mini-action secondary"
            type="button"
            disabled={actionState === "audit-export:running"}
            onClick={onCreateAuditExport}
          >
            {actionState === "audit-export:running" ? "Hashing" : "Create export"}
          </button>
        )}
      </div>
      {latest ? (
        <>
          <div className={`audit-export-status ${latest.status}`}>
            <div>
              <span>{latest.eventCount} audit events</span>
              <strong>{latest.status}</strong>
            </div>
            <b>{latest.chainHead.slice(0, 10)}</b>
          </div>
          <div className="audit-export-card">
            <div>
              <span>{latest.createdByName || "system"} · {new Date(latest.createdAt).toLocaleDateString("hy-AM")}</span>
              <strong>{latest.checksum.slice(0, 16)}</strong>
              <em>{latest.firstEventId || "none"}{" -> "}{latest.lastEventId || "none"}</em>
            </div>
            <b>{latest.payload ? "payload ready" : "export packet"}</b>
          </div>
        </>
      ) : (
        <div className="action-status">No audit export packet yet</div>
      )}
    </article>
  );
}

function BackupProofPanel({ backups, restoreProof, actionState, onCreateBackupProof }) {
  const latest = backups[0];
  const proofStatus = restoreProof?.status || latest?.status || "not-run";
  return (
    <article className="panel backup-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Backup and restore</span>
          <h2>Tenant proof</h2>
        </div>
        <button
          className="mini-action secondary"
          type="button"
          disabled={actionState === "backup-proof:running"}
          onClick={onCreateBackupProof}
        >
          {actionState === "backup-proof:running" ? "Verifying" : "Create proof"}
        </button>
      </div>
      <div className={`backup-proof-status ${proofStatus}`}>
        <div>
          <span>{restoreProof ? "restore proof" : "latest backup"}</span>
          <strong>{proofStatus}</strong>
        </div>
        <b>{restoreProof?.checksumVerified ? "checksum ok" : latest ? "snapshot ready" : "not created"}</b>
      </div>
      {latest ? (
        <div className="backup-card">
          <div>
            <span>{latest.createdByName || "system"} · {new Date(latest.createdAt).toLocaleDateString("hy-AM")}</span>
            <strong>{latest.checksum.slice(0, 16)}</strong>
            <em>{(latest.exclusions || []).join(" · ")}</em>
          </div>
          <b>{latest.tableCounts?.customers || 0} customers</b>
        </div>
      ) : (
        <div className="action-status">No tenant backup proof yet</div>
      )}
      {restoreProof && (
        <div className="restore-proof-card">
          <span>{restoreProof.restorePlan.join(" · ")}</span>
          <strong>{restoreProof.secretScan.clean ? "secret scan clean" : "secret scan blocked"}</strong>
        </div>
      )}
    </article>
  );
}

function Localization({
  items,
  sources,
  srcExports,
  signaturePackets,
  privacyRequests,
  privacyExportPackets,
  privacyRetentionAssessments,
  actionState,
  onReviewSource,
  onReviewEsignSource,
  onReviewPersonalDataSource,
  onPrepareSrcExport,
  onPrepareSignaturePacket,
  onPreparePrivacyExport,
  onPrepareDeletionAssessment
}) {
  return (
    <article className="panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Armenia localization</span>
          <h2>Legal and accounting readiness</h2>
        </div>
      </div>
      <div className="checklist">
        {items.map(item => (
          <div className={`check ${item.status}`} key={item.key}>
            <span>{item.label}</span>
            <strong>{item.status}</strong>
          </div>
        ))}
      </div>
      <div className="src-export-registry">
        <div className="registry-head">
          <span className="section-label">SRC export packets</span>
          {onPrepareSrcExport && (
            <button
              className="mini-action"
              type="button"
              disabled={actionState === "src-export:running"}
              onClick={onPrepareSrcExport}
            >
              {actionState === "src-export:running" ? "Preparing" : "Prepare SRC"}
            </button>
          )}
        </div>
        {(srcExports || []).slice(0, 3).map(item => (
          <div className={`src-export-card ${item.status}`} key={item.id}>
            <div>
              <span>{item.periodKey} · {item.status}</span>
              <strong>{item.invoiceCount} invoices · {money(item.total)}</strong>
              <em>{item.checksum.slice(0, 16)} · {item.createdByName || "system"}</em>
            </div>
            <b>{money(item.vat)}</b>
          </div>
        ))}
        {(srcExports || []).length === 0 && <div className="action-status">No SRC export packet yet</div>}
      </div>
      <div className="signature-packet-registry">
        <div className="registry-head">
          <span className="section-label">E-sign evidence</span>
          {onPrepareSignaturePacket && (
            <button
              className="mini-action"
              type="button"
              disabled={actionState === "signature-packet:running"}
              onClick={onPrepareSignaturePacket}
            >
              {actionState === "signature-packet:running" ? "Preparing" : "Prepare eSign"}
            </button>
          )}
        </div>
        {(signaturePackets || []).slice(0, 3).map(packet => (
          <div className={`signature-packet-card ${packet.status}`} key={packet.id}>
            <div>
              <span>{packet.quoteNumber} · {packet.status}</span>
              <strong>{packet.payload.acceptance?.signerName || "Accepted quote"}</strong>
              <em>{packet.checksum.slice(0, 16)} · {packet.createdByName || "system"}</em>
            </div>
            <b>{packet.payload.legalSource?.status || "source"}</b>
          </div>
        ))}
        {(signaturePackets || []).length === 0 && <div className="action-status">No e-sign evidence packet yet</div>}
      </div>
      <div className="privacy-export-registry">
        <div className="registry-head">
          <span className="section-label">Personal-data exports</span>
          {onPreparePrivacyExport && (
            <button
              className="mini-action"
              type="button"
              disabled={actionState === "privacy-export:running"}
              onClick={onPreparePrivacyExport}
            >
              {actionState === "privacy-export:running" ? "Preparing" : "Prepare export"}
            </button>
          )}
        </div>
        {(privacyExportPackets || []).slice(0, 3).map(packet => (
          <div className={`privacy-export-card ${packet.status}`} key={packet.id}>
            <div>
              <span>{packet.customerName} · {packet.status}</span>
              <strong>{packet.payload.profile?.consentStatus || "consent record"}</strong>
              <em>{packet.checksum.slice(0, 16)} · {packet.createdByName || "system"}</em>
            </div>
            <b>{packet.payload.legalSource?.status || "source"}</b>
          </div>
        ))}
        {(privacyExportPackets || []).length === 0 && (
          <div className="action-status">
            {(privacyRequests || []).length > 0 ? "Privacy request awaiting approval" : "No personal-data export packet yet"}
          </div>
        )}
      </div>
      <div className="privacy-retention-registry">
        <div className="registry-head">
          <span className="section-label">Deletion assessments</span>
          {onPrepareDeletionAssessment && (
            <button
              className="mini-action secondary"
              type="button"
              disabled={actionState === "privacy-delete:running"}
              onClick={onPrepareDeletionAssessment}
            >
              {actionState === "privacy-delete:running" ? "Assessing" : "Assess delete"}
            </button>
          )}
        </div>
        {(privacyRetentionAssessments || []).slice(0, 3).map(assessment => (
          <div className={`privacy-retention-card ${assessment.status}`} key={assessment.id}>
            <div>
              <span>{assessment.customerName} · {assessment.status}</span>
              <strong>{assessment.recommendation}</strong>
              <em>{assessment.checksum.slice(0, 16)} · {assessment.createdByName || "system"}</em>
            </div>
            <b>{assessment.payload.retention?.finance?.invoices?.length || 0} invoices</b>
          </div>
        ))}
        {(privacyRetentionAssessments || []).length === 0 && (
          <div className="action-status">
            {(privacyRequests || []).some(request => request.requestType === "delete")
              ? "Deletion request awaiting assessment"
              : "No deletion assessment yet"}
          </div>
        )}
      </div>
      <div className="legal-source-registry">
        <div className="registry-head">
          <span className="section-label">Legal source registry</span>
          {(onReviewSource || onReviewEsignSource || onReviewPersonalDataSource) && (
            <div className="registry-actions">
              {onReviewSource && (
                <button
                  className="mini-action"
                  type="button"
                  disabled={actionState === "source-review:law-tax-code"}
                  onClick={onReviewSource}
                >
                  {actionState === "source-review:law-tax-code" ? "Reviewing" : "Review VAT"}
                </button>
              )}
              {onReviewEsignSource && (
                <button
                  className="mini-action secondary"
                  type="button"
                  disabled={actionState === "source-review:law-esign"}
                  onClick={onReviewEsignSource}
                >
                  {actionState === "source-review:law-esign" ? "Reviewing" : "Review eSign"}
                </button>
              )}
              {onReviewPersonalDataSource && (
                <button
                  className="mini-action secondary"
                  type="button"
                  disabled={actionState === "source-review:law-personal-data"}
                  onClick={onReviewPersonalDataSource}
                >
                  {actionState === "source-review:law-personal-data" ? "Reviewing" : "Review data"}
                </button>
              )}
            </div>
          )}
        </div>
        {(sources || []).slice(0, 3).map(source => (
          <div className={`source-review-card ${source.status}`} key={source.id}>
            <div>
              <span>{source.status}</span>
              <strong>{source.title}</strong>
              <em>{source.effectiveDate} · {source.reviewCount || 0} review{source.reviewCount === 1 ? "" : "s"}</em>
            </div>
            {source.latestReview && <b>{source.latestReview.reviewedByName}</b>}
          </div>
        ))}
      </div>
    </article>
  );
}

function Audit({ events }) {
  return (
    <article className="panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Audit</span>
          <h2>Suite activity</h2>
        </div>
      </div>
      <div className="audit-list">
        {events.slice(0, 6).map(event => (
          <div className="audit-event" key={event.id}>
            <span>{event.type}</span>
            <time>{new Date(event.created_at).toLocaleString("hy-AM")}</time>
          </div>
        ))}
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
