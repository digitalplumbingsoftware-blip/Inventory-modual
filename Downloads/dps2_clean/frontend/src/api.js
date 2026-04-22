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
  getLowStock: () => req("GET", "/inventory/low-stock"),
  // Inventory — Locations
  getLocations: () => req("GET", "/inventory/locations"),
  createLocation: (data) => req("POST", "/inventory/locations", data),
  updateLocation: (id, data) => req("PUT", `/inventory/locations/${id}`, data),
  getLocationStock: (id) => req("GET", `/inventory/locations/${id}/stock`),
  moveStock: (data) => req("POST", "/inventory/move", data),
  removeStock: (item_id, location_id) => req("DELETE", "/inventory/stock", { item_id, location_id }),
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
  saveBusinessHours: (hours, holidays) => req("PUT", "/operations/business-hours", { hours, holidays }),

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
  pbEngine: () => req("GET", "/pricebook/engine"),
  pbSaveEngine: (data) => req("PUT", "/pricebook/engine", data),
  pbTasks: (params) => req("GET", `/pricebook/tasks?${new URLSearchParams(params||{})}`),
  pbTask: (id) => req("GET", `/pricebook/tasks/${id}`),
  pbMaterials: () => req("GET", "/pricebook/materials"),

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
};

// ── WebSocket GPS connection ───────────────────────────────────
export function connectGpsWebSocket(onMessage) {
  const token = getToken();
  if (!token) return null;

  const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/gps?token=${token}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => console.log("📡 GPS WebSocket connected");
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch {}
  };
  ws.onerror = (e) => console.warn("GPS WS error", e);
  ws.onclose = () => {
    console.log("GPS WS closed, reconnecting in 5s...");
    setTimeout(() => connectGpsWebSocket(onMessage), 5000);
  };

  return ws;
}
