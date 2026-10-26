// ── DPS API Client ────────────────────────────────────────────
const BASE = "/api";

function getToken() {
  return localStorage.getItem("dps_token");
}

async function req(method, path, body) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  login: (email, password) => req("POST", "/auth/login", { email, password }),
  me: () => req("GET", "/auth/me"),

  // Dashboard
  dashboardStats: () => req("GET", "/dashboard/stats"),

  // Jobs
  getJobs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/jobs${qs ? "?" + qs : ""}`);
  },
  getJob: (id) => req("GET", `/jobs/${id}`),
  createJob: (data) => req("POST", "/jobs", data),
  updateJob: (id, data) => req("PATCH", `/jobs/${id}`, data),

  // Customers
  getCustomers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/customers${qs ? "?" + qs : ""}`);
  },
  getCustomer: (id) => req("GET", `/customers/${id}`),
  lookupPhone: (phone) => req("GET", `/customers?phone=${encodeURIComponent(phone)}`),
  createCustomer: (data) => req("POST", "/customers", data),

  // Technicians
  getTechnicians: () => req("GET", "/technicians"),
  get: (path) => req("GET", path),
  patch: (path, body) => req("PATCH", path, body),
  put: (path, body) => req("PUT", path, body),
  getPricebookSettings: () => req("GET", "/pricebook/settings"),
  savePricebookSettings: (settings) => req("PUT", "/pricebook/settings", { settings }),
  recalculatePricebook: () => req("POST", "/pricebook/recalculate", {}),

  // GPS
  gpsLive: () => req("GET", "/gps/live"),
  gpsPing: (data) => req("POST", "/gps/ping", data),
  gpsHistory: (techId, date) => req("GET", `/gps/history/${techId}?date=${date}`),

  // Inventory — Categories
  getInventoryCategories: () => req("GET", "/inventory/categories"),
  createInventoryCategory: (data) => req("POST", "/inventory/categories", data),
  updateInventoryCategory: (id, data) => req("PUT", `/inventory/categories/${id}`, data),
  deleteInventoryCategory: (id) => req("DELETE", `/inventory/categories/${id}`),
  // Inventory — Items
  getInventory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/inventory/items${qs ? "?" + qs : ""}`);
  },
  createItem: (data) => req("POST", "/inventory/items", data),
  updateItem: (id, data) => req("PUT", `/inventory/items/${id}`, data),
  deleteItem: (id) => req("DELETE", `/inventory/items/${id}`),
  hardDeleteItem: (id) => req("DELETE", `/inventory/items/${id}/permanent`),
  getLowStock: () => req("GET", "/inventory/low-stock"),
  // Inventory — Locations
  getLocations: () => req("GET", "/inventory/locations"),
  createLocation: (data) => req("POST", "/inventory/locations", data),
  updateLocation: (id, data) => req("PUT", `/inventory/locations/${id}`, data),
  getLocationStock: (id) => req("GET", `/inventory/locations/${id}/stock`),
  moveStock: (data) => req("POST", "/inventory/move", data),
  removeStock: (item_id, location_id) => req("DELETE", "/inventory/stock", { item_id, location_id }),
  getJobMovements: (jobId) => req("GET", `/inventory/movements?job_id=${jobId}`),
  // Inventory — Truck Templates
  getTemplates: () => req("GET", "/inventory/templates"),
  createTemplate: (data) => req("POST", "/inventory/templates", data),
  updateTemplate: (id, data) => req("PUT", `/inventory/templates/${id}`, data),
  deleteTemplate: (id) => req("DELETE", `/inventory/templates/${id}`),
  applyTemplate: (id, location_id) => req("POST", `/inventory/templates/${id}/apply`, { location_id }),
  // Inventory — Purchase Orders
  getPurchaseOrders: () => req("GET", "/inventory/purchase-orders"),
  createPurchaseOrder: (data) => req("POST", "/inventory/purchase-orders", data),
  updatePurchaseOrder: (id, data) => req("PATCH", `/inventory/purchase-orders/${id}`, data),
  deletePurchaseOrder: (id) => req("DELETE", `/inventory/purchase-orders/${id}`),
  autoGeneratePO: () => req("POST", "/inventory/purchase-orders/auto-generate", {}),
  // Inventory — Count Schedules
  getCountSchedules: () => req("GET", "/inventory/count-schedules"),
  createCountSchedule: (data) => req("POST", "/inventory/count-schedules", data),
  updateCountSchedule: (id, data) => req("PUT", `/inventory/count-schedules/${id}`, data),
  deleteCountSchedule: (id) => req("DELETE", `/inventory/count-schedules/${id}`),
  // Inventory — Counts
  getCounts: () => req("GET", "/inventory/counts"),
  startCount: (data) => req("POST", "/inventory/counts", data),
  getCount: (id) => req("GET", `/inventory/counts/${id}`),
  updateCount: (id, data) => req("PATCH", `/inventory/counts/${id}`, data),

  // Invoices
  getInvoices: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/invoices${qs ? "?" + qs : ""}`);
  },
  createInvoice: (data) => req("POST", "/invoices", data),
  updateInvoice: (id, data) => req("PATCH", `/invoices/${id}`, data),
  mergeInvoices: (invoice_ids) => req("POST", "/invoices/merge", { invoice_ids }),

  // AI
  aiRewrite: (text, context) => req("POST", "/ai/rewrite", { text, context }),

  // Phone system
  getPhoneSettings: () => req("GET", "/phone/settings"),
  savePhoneSettings: (data) => req("PUT", "/phone/settings", data),
  phoneLookup: (number) => req("GET", `/phone/lookup?number=${encodeURIComponent(number)}`),
  getSmsHistory: (phone) => req("GET", `/phone/sms?phone=${encodeURIComponent(phone)}`),
  sendSms: (to, body, customer_id) => req("POST", "/phone/sms/send", { to, body, customer_id }),

  // Operations
  getArrivalWindows: () => req("GET", "/operations/arrival-windows"),
  saveArrivalWindows: (windows) => req("PUT", "/operations/arrival-windows", { windows }),
  getJobTypes: () => req("GET", "/operations/job-types"),
  saveJobTypes: (types) => req("PUT", "/operations/job-types", { types }),
  getBusinessHours: () => req("GET", "/operations/business-hours"),
  saveBusinessHours: (hours, holidays, weekEndDay) => req("PUT", "/operations/business-hours", { hours, holidays, weekEndDay }),
  getPricingModel: () => req("GET", "/operations/pricing-model"),
  savePricingModel: (model) => req("PUT", "/operations/pricing-model", { model }),

  // Google Maps
  saveMapsKey: (key) => req("PUT", "/company/maps-key", { key }),
  placesAutocomplete: (input) => req("GET", `/company/places-autocomplete?input=${encodeURIComponent(input)}`),
  placeDetails: (placeId) => req("GET", `/company/place-details?place_id=${encodeURIComponent(placeId)}`),

  // Apple Maps
  getAppleMapsConfig: () => req("GET", "/company/apple-maps-config"),
  saveAppleMapsConfig: (data) => req("PUT", "/company/apple-maps-config", data),
  getAppleMapsToken: () => req("GET", "/company/apple-maps-token"),

  // Moore Supply (SupplyZone)
  getMooreConfig:       ()       => req("GET",  "/integrations/moore"),
  saveMooreConfig:      (data)   => req("POST", "/integrations/moore", data),
  testMooreConnection:  (data)   => req("POST", "/integrations/moore/test", data),
  mooreSearchProducts:  (q)      => req("GET",  `/integrations/moore/products?q=${encodeURIComponent(q)}`),
  mooreOrders:          ()       => req("GET",  "/integrations/moore/orders"),
  mooreCreateOrder:     (data)   => req("POST", "/integrations/moore/orders", data),
  mooreUpdateOrder:     (id, data) => req("PATCH", `/integrations/moore/orders/${id}`, data),

  // Reece Supply
  getReeceConfig:       ()       => req("GET",  "/integrations/reece"),
  saveReeceConfig:      (data)   => req("POST", "/integrations/reece", data),
  testReeceConnection:  (data)   => req("POST", "/integrations/reece/test", data),
  reeceSearchProducts:  (q)      => req("GET",  `/integrations/reece/products?q=${encodeURIComponent(q)}`),
  reeceOrders:          ()       => req("GET",  "/integrations/reece/orders"),
  reeceCreateOrder:     (data)   => req("POST", "/integrations/reece/orders", data),
  reeceUpdateOrder:     (id, data) => req("PATCH", `/integrations/reece/orders/${id}`, data),

  // Company services
  getEnabledServices: () => req("GET", "/company/enabled-services"),
  toggleService: (service, enabled) => req("PATCH", "/company/service-enabled", { service, enabled }),

  // Flat Rate Pricebook — Engine
  getFREngine: () => req("GET", "/flatrate/engine"),
  getFREngineFor: (service, customerType) => req("GET", `/flatrate/engine/${service}/${customerType}`),
  saveFREngine: (service, customerType, data) => req("PUT", `/flatrate/engine/${service}/${customerType}`, data),
  recalculateFR: (data) => req("POST", "/flatrate/recalculate", data),
  // Flat Rate Pricebook — Categories
  getFRCategories: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/flatrate/categories${qs ? "?" + qs : ""}`);
  },
  createFRCategory: (data) => req("POST", "/flatrate/categories", data),
  updateFRCategory: (id, data) => req("PUT", `/flatrate/categories/${id}`, data),
  deleteFRCategory: (id) => req("DELETE", `/flatrate/categories/${id}`),
  // Flat Rate Pricebook — Tasks
  getFRTasks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/flatrate/tasks${qs ? "?" + qs : ""}`);
  },
  createFRTask: (data) => req("POST", "/flatrate/tasks", data),
  updateFRTask: (id, data) => req("PUT", `/flatrate/tasks/${id}`, data),
  deleteFRTask: (id) => req("DELETE", `/flatrate/tasks/${id}`),
  // Flat Rate Pricebook — Materials
  getMaterials: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/flatrate/materials${qs ? "?" + qs : ""}`);
  },
  createMaterial: (data) => req("POST", "/flatrate/materials", data),
  updateMaterial: (id, data) => req("PUT", `/flatrate/materials/${id}`, data),
  deleteMaterial: (id) => req("DELETE", `/flatrate/materials/${id}`),
  updateMaterialPrices: (items) => req("POST", "/flatrate/materials/update-prices", { items }),
  getMaterialCategories: () => req("GET", "/flatrate/material-categories"),

  // Square
  squareStatus: () => req("GET", "/square/status"),
  processPayment: (data) => req("POST", "/square/payment", data),
  sandboxCards: () => req("GET", "/square/sandbox-cards"),
  squareConfig: () => req("GET", "/square/config"),

  // Flat-rate pricebook (new)
  // Every pricebook call takes (service, service_type) — 4 pricebooks: plumbing/hvac × install/service.
  pbEngine: (service = 'plumbing', service_type = 'service') =>
    req("GET", `/pricebook/engine?service=${encodeURIComponent(service)}&service_type=${encodeURIComponent(service_type)}`),
  pbSaveEngine: (data) => req("PUT", "/pricebook/engine", data),
  pbTasks: (params) => req("GET", `/pricebook/tasks?${new URLSearchParams(params||{})}`),
  pbCategories: (service = 'plumbing', service_type = 'service') =>
    req("GET", `/pricebook/categories?service=${encodeURIComponent(service)}&service_type=${encodeURIComponent(service_type)}`),
  pbTask: (id) => req("GET", `/pricebook/tasks/${id}`),
  pbMaterials: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/pricebook/materials${qs ? '?' + qs : ''}`);
  },
  pbUpdateMaterial: (id, data) => req("PUT", `/pricebook/materials/${id}`, data),
  pbCreateMaterial: (data) => req("POST", "/pricebook/materials", data),
  pbUpdateTask: (id, data) => req("PATCH", `/pricebook/tasks/${id}`, data),
  pbUpdateTaskMaterials: (id, materials) => req("PUT", `/pricebook/tasks/${id}/materials`, { materials }),
  pbCreateCategory: (data) => req("POST", "/pricebook/categories", data),
  pbCreateTask:     (data) => req("POST", "/pricebook/tasks", data),

  // Estimates (new)
  getEstimates: (params) => req("GET", `/estimates?${new URLSearchParams(params||{})}`),
  createEstimate: (data) => req("POST", "/estimates", data),
  getEstimate: (id) => req("GET", `/estimates/${id}`),
  updateEstimate: (id, data) => req("PUT", `/estimates/${id}`, data),
  deleteEstimate: (id) => req("DELETE", `/estimates/${id}`),
  addEstimateItem: (id, data) => req("POST", `/estimates/${id}/items`, data),
  removeEstimateItem: (id, itemId) => req("DELETE", `/estimates/${id}/items/${itemId}`),
  sendEstimate: (id) => req("POST", `/estimates/${id}/send`),
  signEstimate: (id, data) => req("POST", `/estimates/${id}/sign`, data),
  convertEstimate: (id) => req("POST", `/estimates/${id}/convert`),
  getPublicEstimate: (token) => req("GET", `/estimates/public/${token}`),
  signPublicEstimate: (token, data) => req("POST", `/estimates/public/${token}/sign`, data),

  // Import / Export
  exportData: (type, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return `${BASE}/import-export/export/${type}${qs ? '?' + qs : ''}`;
  },
  importData: (type, body) => req("POST", `/import-export/import/${type}`, body),
  fetchGoogleSheet: (url) => req("GET", `/import-export/fetch-sheet?url=${encodeURIComponent(url)}`),
  previewCsv: (csv) => req("POST", "/import-export/preview-csv", { csv }),

  // Return trips / projects
  createReturnTrip: (jobId, data) => req("POST", `/jobs/${jobId}/return-trip`, data),

  // Job Purchase Orders
  getJobPOs: (jobId) => req("GET", `/jobs/${jobId}/purchase-orders`),
  createJobPO: (jobId, data) => req("POST", `/jobs/${jobId}/purchase-orders`, data),
  updateJobPO: (jobId, poId, data) => req("PATCH", `/jobs/${jobId}/purchase-orders/${poId}`, data),
  addPOItem: (jobId, poId, data) => req("POST", `/jobs/${jobId}/purchase-orders/${poId}/items`, data),
  removePOItem: (jobId, poId, itemId) => req("DELETE", `/jobs/${jobId}/purchase-orders/${poId}/items/${itemId}`),

  // Supply Houses
  getSupplyHouses: () => req("GET", "/company/supply-houses"),
  saveSupplyHouses: (houses) => req("PUT", "/company/supply-houses", { houses }),

  // Subcontractors
  getSubcontractors: () => req("GET", "/company/subcontractors"),
  saveSubcontractors: (subcontractors) => req("PUT", "/company/subcontractors", { subcontractors }),

  // Inventory locations (trucks)
  getInventoryLocations: () => req("GET", "/inventory/locations"),
  createInventoryLocation: (data) => req("POST", "/inventory/locations", data),
  updateInventoryLocation: (id, data) => req("PUT", `/inventory/locations/${id}`, data),

  // Invoice layout
  getInvoiceLayout: () => req("GET", "/company/invoice-layout"),
  saveInvoiceLayout: (data) => req("PUT", "/company/invoice-layout", data),

  // Invoice actions
  sendInvoiceEmail: (id, data) => req("POST", `/invoices/${id}/send-email`, data),
  addInvoiceItem: (id, data) => req("POST", `/invoices/${id}/items`, data),
  removeInvoiceItem: (id, itemId) => req("DELETE", `/invoices/${id}/items/${itemId}`),
  recordPayment: (id, data) => req("POST", `/invoices/${id}/payment`, data),

  // Accounting
  getAccountingSummary: ()        => req("GET", "/accounting/summary"),
  getAccountingRevenueChart: ()   => req("GET", "/accounting/revenue-chart"),
  getAccountingRevenueDetail: (from, to) => req("GET", `/accounting/revenue-detail${from && to ? `?from=${from}&to=${to}` : ''}`),
  getAccountingTaxDetail: (year)  => req("GET", `/accounting/tax-detail${year ? `?year=${year}` : ''}`),
  getOpenInvoices: ()             => req("GET", "/accounting/open-invoices"),
  getAccountingPayroll: (from, to, staffType, managerId) => {
    let url = `/accounting/payroll?from=${from}&to=${to}`;
    if (staffType)  url += `&staffType=${staffType}`;
    if (managerId)  url += `&managerId=${managerId}`;
    return req("GET", url);
  },
  getPayrollManagers: () => req("GET", "/accounting/payroll/managers"),
  getAccountingPL: (from, to)     => req("GET", `/accounting/pl?from=${from}&to=${to}`),
  getExpenses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/accounting/expenses${qs ? "?" + qs : ""}`);
  },
  createExpense: (data)           => req("POST", "/accounting/expenses", data),
  updateExpense: (id, data)       => req("PUT",  `/accounting/expenses/${id}`, data),
  deleteExpense: (id)             => req("DELETE", `/accounting/expenses/${id}`),

  // General Ledger Accounts
  getGLAccounts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/gl-accounts${qs ? "?" + qs : ""}`);
  },
  createGLAccount: (data)         => req("POST",   "/gl-accounts", data),
  updateGLAccount: (id, data)     => req("PUT",    `/gl-accounts/${id}`, data),
  deleteGLAccount: (id)           => req("DELETE", `/gl-accounts/${id}`),
  seedGLAccounts: ()              => req("POST",   "/gl-accounts/seed"),

  // Payment Terms
  getPaymentTerms: ()             => req("GET",    "/payment-terms"),
  createPaymentTerm: (d)          => req("POST",   "/payment-terms", d),
  updatePaymentTerm: (id, d)      => req("PUT",    `/payment-terms/${id}`, d),
  deletePaymentTerm: (id)         => req("DELETE", `/payment-terms/${id}`),

  // Tax Zones
  getTaxZones: ()                 => req("GET",    "/tax-zones"),
  createTaxZone: (d)              => req("POST",   "/tax-zones", d),
  updateTaxZone: (id, d)          => req("PUT",    `/tax-zones/${id}`, d),
  deleteTaxZone: (id)             => req("DELETE", `/tax-zones/${id}`),

  // Business Units
  getBusinessUnits: ()            => req("GET",    "/business-units"),
  createBusinessUnit: (d)         => req("POST",   "/business-units", d),
  updateBusinessUnit: (id, d)     => req("PUT",    `/business-units/${id}`, d),
  deleteBusinessUnit: (id)        => req("DELETE", `/business-units/${id}`),

  // Phone Numbers
  getPhoneNumbers: ()             => req("GET",    "/phone-numbers"),
  createPhoneNumber: (d)          => req("POST",   "/phone-numbers", d),
  updatePhoneNumber: (id, d)      => req("PUT",    `/phone-numbers/${id}`, d),
  deletePhoneNumber: (id)         => req("DELETE", `/phone-numbers/${id}`),

  // Generic integration credential save (acorn, stripe, freshbooks, caller_id, online_payments)
  getIntegrationConfig: (name)    => req("GET",    `/integrations/${name}`),
  saveIntegrationConfig: (name, c) => req("POST",  `/integrations/${name}`, c),

  // Payment methods + invoice defaults (Settings → Invoices)
  getPaymentMethods: ()           => req("GET",  "/company/payment-methods"),
  savePaymentMethods: (methods)   => req("PUT",  "/company/payment-methods", { methods }),
  getInvoiceDefaults: ()          => req("GET",  "/company/invoice-defaults"),
  saveInvoiceDefaults: (cfg)      => req("PUT",  "/company/invoice-defaults", cfg),

  // Marketing
  getMarketingOverview: ()        => req("GET",    "/marketing/overview"),
  getMarketingLeadSources: (from, to) => req("GET", `/marketing/lead-sources${from && to ? `?from=${from}&to=${to}` : ''}`),
  getMarketingCampaigns: ()       => req("GET",    "/marketing/campaigns"),
  createMarketingCampaign: (d)    => req("POST",   "/marketing/campaigns", d),
  updateMarketingCampaign: (id,d) => req("PUT",    `/marketing/campaigns/${id}`, d),
  deleteMarketingCampaign: (id)   => req("DELETE", `/marketing/campaigns/${id}`),
  getMarketingPromotions: ()      => req("GET",    "/marketing/promotions"),
  createMarketingPromotion: (d)   => req("POST",   "/marketing/promotions", d),
  updateMarketingPromotion: (id,d)=> req("PUT",    `/marketing/promotions/${id}`, d),
  deleteMarketingPromotion: (id)  => req("DELETE", `/marketing/promotions/${id}`),
  getMarketingReviews: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("GET", `/marketing/reviews${qs ? "?" + qs : ""}`);
  },
  createMarketingReview: (d)      => req("POST",   "/marketing/reviews", d),
  updateMarketingReview: (id,d)   => req("PUT",    `/marketing/reviews/${id}`, d),
  deleteMarketingReview: (id)     => req("DELETE", `/marketing/reviews/${id}`),

  // Per-technician CSAT
  getTechCSAT: (techId) => req("GET", techId ? `/marketing/tech-csat/${techId}` : `/marketing/tech-csat`),

  // Review requests + automation
  getReviewRequests: ()           => req("GET", "/marketing/review-requests"),
  createReviewRequest: (jobId, sent_via) => req("POST", `/marketing/review-request/${jobId}`, sent_via ? { sent_via } : {}),
  // Public (token-based, no auth header) — but req() sends one anyway; backend ignores it.
  getFeedbackContext: (token)     => req("GET",  `/marketing/feedback/${token}`),
  submitFeedback: (token, data)   => req("POST", `/marketing/feedback/${token}`, data),
  getQBStatus: ()                 => req("GET", "/qb/status"),
  syncAllQB: ()                   => req("POST", "/accounting/qb/sync-all"),

  logoutBackend: ()               => req("POST",   "/auth/logout"),

  // Timesheets
  getTimesheets:  (weekEnding, staffType) => req("GET", `/timesheets?weekEnding=${weekEnding}&staffType=${staffType||'technicians'}`),
  createPunch:    (d)             => req("POST",   "/timesheets", d),
  updatePunch:    (id, d)         => req("PUT",    `/timesheets/${id}`, d),
  deletePunch:    (id)            => req("DELETE", `/timesheets/${id}`),
  clockIn:        (notes)         => req("POST",   "/timesheets/clock-in",  notes ? { notes } : {}),
  clockOut:       (notes)         => req("POST",   "/timesheets/clock-out", notes ? { notes } : {}),
  getPunchStatus: ()              => req("GET",    "/timesheets/status"),
};

// ── WebSocket GPS connection ───────────────────────────────────
export function connectGpsWebSocket(onMessage) {
  const token = getToken();
  if (!token) return null;

  let cancelled = false;
  let currentWs = null;

  function connect() {
    if (cancelled) return;
    const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/gps?token=${token}`;
    const ws = new WebSocket(wsUrl);
    currentWs = ws;

    ws.onopen = () => console.log("📡 GPS WebSocket connected");
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch {}
    };
    ws.onerror = (e) => console.warn("GPS WS error", e);
    ws.onclose = () => {
      if (!cancelled) {
        console.log("GPS WS closed, reconnecting in 5s...");
        setTimeout(connect, 5000);
      }
    };
  }

  connect();

  // Return a handle that callers can .close() to permanently stop reconnects
  return {
    close: () => {
      cancelled = true;
      currentWs?.close();
    }
  };
}
