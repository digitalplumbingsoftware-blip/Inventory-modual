require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { initWebSocket } = require("./websocket/gps");
const { testConnection } = require("./db/pool");

// Routes
const authRoutes = require("./routes/auth");
const qbRoutes = require("./routes/quickbooks");
const techRoutes = require("./routes/technicians");
const jobRoutes = require("./routes/jobs");
const customerRoutes = require("./routes/customers");
const inventoryRoutes = require("./routes/inventory");
const invoiceRoutes = require("./routes/invoices");
const squareRoutes = require("./routes/square");
const gpsRoutes = require("./routes/gps");
const dashboardRoutes = require("./routes/dashboard");
const pricebookRoutes = require("./routes/pricebook");
const payrollRoutes      = require("./routes/payroll");
const rolesRoutes        = require("./routes/roles");
const employeeRoutes     = require("./routes/employees");
const companyRoutes      = require("./routes/company");
const integrationsRoutes = require("./routes/integrations");
const phoneRoutes        = require("./routes/phone");
const operationsRoutes   = require("./routes/operations");
const reportsRoutes      = require("./routes/reports");
const reeceRoutes        = require("./routes/reece");
const mooreRoutes        = require("./routes/moore");
const flatrateRoutes     = require("./routes/flatrate");

const app = express();
const server = http.createServer(app);

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));

// Request logger (dev)
if (process.env.NODE_ENV === "development") {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Routes ─────────────────────────────────────────────────────
app.use("/api/auth",       authRoutes);
app.use("/api/technicians", techRoutes);
app.use("/api/jobs",        jobRoutes);
app.use("/api/customers",   customerRoutes);
app.use("/api/inventory",   inventoryRoutes);
app.use("/api/invoices",    invoiceRoutes);
app.use("/api/square",      squareRoutes);
app.use("/api/gps",         gpsRoutes);
app.use("/api/dashboard",   dashboardRoutes);
app.use("/api/pricebook",   pricebookRoutes);
app.use("/api/payroll",      payrollRoutes);
app.use("/api/roles",        rolesRoutes);
app.use("/api/employees",    employeeRoutes);
app.use("/api/company",      companyRoutes);
app.use("/api/integrations", integrationsRoutes);
app.use("/api/phone",        phoneRoutes);
app.use("/api/operations",   operationsRoutes);
app.use("/api/reports",      reportsRoutes);
app.use("/api/integrations/reece", reeceRoutes);
app.use("/api/integrations/moore", mooreRoutes);
app.use("/api/flatrate",           flatrateRoutes);
app.use("/api/qb",                 qbRoutes);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date() }));

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ── WebSocket (GPS) ────────────────────────────────────────────
initWebSocket(server);

// ── Start (skip when required by tests) ───────────────────────
const PORT = process.env.PORT || 4000;
if (require.main === module) {
  server.listen(PORT, async () => {
    await testConnection();
    console.log(`\n🚿 DPS Backend running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket GPS feed on ws://localhost:${PORT}/ws/gps`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
  });
}

module.exports = app;
