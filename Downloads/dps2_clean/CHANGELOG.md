# Changelog

All notable changes to DPS are documented here.

## [1.1.0] — 2026-04-21

### Field Inventory Module (new)

- **Mobile: Barcode scan loop** (`ScanPartsScreen`) — technicians scan parts from
  the material book, see item name / SKU / unit cost / truck stock count, adjust
  quantity, and confirm. Parts logged instantly as `inventory_movements` with
  `type=use` tied to the active job.
- **Mobile: Offline scan queue** — if the device loses connectivity, scans are
  queued to AsyncStorage and flushed automatically when the connection returns
  (max 20 retries, then dropped with console warning).
- **Mobile: Return / decrement** — "−" button on the Parts Used list fires a
  `type=return` move to put the item back on the truck.
- **Backend: `GET /api/jobs/:id/material-cost`** — returns line items (name, SKU,
  unit cost, qty, line total), total material cost, revenue from invoices, and
  gross margin %.
- **Backend: Restock alert** — when a job is marked `completed`, the system checks
  the technician's truck stock for items at or below `min_qty` and sets
  `jobs.restock_needed = true` (fire-and-forget, non-fatal).
- **Web: Restock badge** — dispatch board timeline cards show a red `⚠` badge when
  `restock_needed = true`. Sidebar shows the alert with a "Mark Restocked" button.
- **Web: Profitability tab** — completed jobs show Revenue / Materials / Margin %
  with color coding (≥40% green, 20–39% amber, <20% red) and a line-item breakdown.
- **DB: Performance indexes** — `idx_inventory_items_barcode`,
  `idx_inventory_movements_job`, `idx_inventory_locations_technician`.

### P0 Fixes (from prior commits)

- QuickBooks export, SMS opt-out toggle, job photo upload
- JWT refresh on mobile, offline queue for general ops
- Error boundaries on all web pages
- Expo environment variable wiring

## [1.0.0] — initial release
