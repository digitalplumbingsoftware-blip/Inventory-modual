# DPS — TODOS

Post-launch backlog. Items here are NOT blockers for initial launch. Tackle after the company is running on DPS.

---

## P1 — High priority post-launch

### Production Deployment
**What:** Deploy backend to a hosted server (Railway, Render, Fly.io, etc.) so dps-mobile works in the field.
**Why:** Required for technicians to use the mobile app on any network, not just the owner's local WiFi.
**Context:** docker-compose.yml runs fine locally but has no production config. JWT_SECRET and DB credentials must be rotated before any hosted deployment. Railway.app is the recommended path (~$10-20/month, ~20 min to set up).
**Effort:** S (human ~1 day / CC: ~30 min)
**Priority:** P1

### Twilio A2P 10DLC Registration
**What:** Register the business phone number with Twilio's A2P 10DLC carrier approval program.
**Why:** Without this, Twilio SMS messages get filtered as spam by carriers. Takes 2-4 weeks to process.
**Context:** The SMS integration is built (activatable via Integrations settings). The A2P registration is a separate non-technical process: create Twilio account → register campaign → wait for carrier approval. Cost: ~$20 one-time.
**Effort:** S (1-2 hours to submit, 2-4 weeks to approve)
**Priority:** P1 — start before you need SMS live

---

## P2 — Medium priority

### Stripe + Customer Payment Portal
**What:** Accept credit card payments via invoice links. Customer clicks a link in their invoice email, pays online.
**Why:** Reduces friction for customer payment. ServiceTitan charges extra for this; DPS should include it.
**Context:** Square integration is already active for in-person payment. Stripe adds online/remote payment. Requires Stripe account + `stripe` npm package on backend + payment link generation on invoices.
**Effort:** M (human ~5 days / CC: ~1.5 hours)
**Priority:** P2

### Recurring Jobs / Maintenance Agreements
**What:** Schedule jobs that repeat automatically (e.g., quarterly drain cleaning, annual water heater flush).
**Why:** Predictable recurring revenue. Customers sign up for a maintenance plan; DPS auto-creates jobs on schedule.
**Context:** Requires new DB table (`recurring_jobs`), a scheduler (node-cron or pg_cron), and a UI in the job creation flow. No existing code to build on.
**Effort:** M (human ~1 week / CC: ~2 hours)
**Priority:** P2

### GPS Ping Retention Policy
**What:** Add a scheduled job to delete GPS pings older than 30 days.
**Why:** A 5-tech company generates ~14,400 pings/day. After 1 year that's ~5M rows. The table will bloat silently.
**Context:** Add a pg_cron job or node-cron task: `DELETE FROM gps_pings WHERE created_at < NOW() - INTERVAL '30 days'`. Run nightly. No UI needed.
**Effort:** S (human ~2 hours / CC: ~10 min)
**Priority:** P2

### Invoice Online Payments (Stripe)
**What:** Invoices include a "Pay Online" link. Depends on Stripe integration above.
**Why:** Reduces calls for payment. Customer can pay at midnight if they want.
**Context:** Blocked on Stripe integration. Once Stripe is in, this is an additional ~1 hour of work.
**Effort:** S (after Stripe is added)
**Priority:** P2

---

## P3 — Lower priority / future vision

### Customer Portal (Booking + Tracking + Payment)
**What:** Customer-facing web page where they can book jobs, see tech ETA, track job status, and pay invoices.
**Why:** Reduces inbound calls. Customers want self-service. ServiceTitan charges significantly for this.
**Context:** Requires a new frontend (separate from the desktop web app) or a public route on the existing frontend. Auth needs to be customer-facing (email link or SMS code). Significant new scope.
**Effort:** L (human ~3 weeks / CC: ~4 hours)
**Priority:** P3

### Marketing Board / Review Board Portal
**What:** Customer-facing marketing campaigns and review collection.
**Why:** Helps grow the business. Collect Google reviews, send promotions to past customers.
**Context:** Currently in SETTINGS_TREE with `soon: true`. No backend routes exist.
**Effort:** L
**Priority:** P3

### QuickBooks Desktop Integration
**What:** Sync to QB Desktop (Pro/Premier/Enterprise) in addition to QB Online.
**Why:** Some customers use QB Desktop.
**Context:** QB Online is in scope for launch. QB Desktop uses IIF files or the QB Desktop API — significantly more complex. Low priority unless a specific customer requests it.
**Effort:** L
**Priority:** P3

### Import / Export
**What:** Bulk import customers, jobs, invoices from CSV. Export data to CSV.
**Why:** Useful when onboarding other plumbing companies to DPS (if DPS becomes a product).
**Context:** Customer CSV import from ServiceTitan is in scope for initial launch. This TODO covers bulk export and import of other entity types.
**Effort:** M
**Priority:** P3

### Acorn Finance Integration
**What:** Equipment financing for large jobs. Customer applies for financing from the DPS invoice.
**Why:** Closes larger jobs that customers can't pay upfront.
**Context:** Currently in SETTINGS_TREE with `soon: true`. No backend implementation exists.
**Effort:** M
**Priority:** P3

### App Store Distribution (dps-mobile)
**What:** Publish dps-mobile to the iOS App Store and/or Google Play.
**Why:** Currently only distributable via Expo Go or EAS build. For a real production tool, App Store distribution is needed.
**Context:** Requires Apple Developer account ($99/year) and EAS Build setup. Not needed while testing internally.
**Effort:** M
**Priority:** P3

---

## Architecture debt (non-blocking, address when painful)

- **Split App.jsx** — 9,169-line single file. Should be split into feature modules (Dispatch, Customers, Invoices, etc.). Not urgent but makes future development significantly easier.
- **Add React error boundaries** — prevents a single component crash from blanking the entire app.
- **Replace alert() with toast notifications** — ~30 uses of `alert(e.message)` throughout the frontend. Replace with a toast library for professional UX.
- **Add structured logging to backend** — replace `console.error` with a logging library (pino, winston) so production errors are searchable.
- **Token refresh endpoint** — add `/api/auth/refresh` so mobile sessions don't expire after 12h.
