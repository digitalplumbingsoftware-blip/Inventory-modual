# DPS — Digital Plumbing Software

> Field service management platform competing with ServiceTitan, Housecall Pro & Jobber.

---

## ⚡ Quick Start (5 minutes)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- That's it.

### 1. Clone & configure
```bash
cd dps
cp .env.example .env
```

### 2. Start everything
```bash
docker compose up --build
```

This spins up:
- **PostgreSQL** on port 5432 (auto-seeded with demo data)
- **Backend API** on http://localhost:4000
- **Frontend** on http://localhost:3000

### 3. Open the app
```
http://localhost:3000
```

**Demo login:**
- Email: `admin@dps.local`
- Password: `password`

**Technician logins** (password: `password`):
- `marcus@dps.local` · `devon@dps.local` · `priya@dps.local`
- `carl@dps.local` · `jin@dps.local`

---

## 🔌 Integrations Setup

### Square (Payments) — 10 minutes, free
1. Go to [developer.squareup.com](https://developer.squareup.com) and sign up
2. Create a new application
3. Navigate to **Sandbox → Credentials**
4. Copy your **Sandbox Access Token** and **Sandbox Location ID**
5. Paste them into `.env`:
   ```
   SQUARE_ACCESS_TOKEN=EAAAl...your_token
   SQUARE_LOCATION_ID=L...your_location
   ```
6. Restart: `docker compose restart backend`
7. Test cards (use in sandbox):
   - ✅ Success: `4111 1111 1111 1111`
   - ❌ Declined: `4000 0000 0000 0002`

### GPS Tracking — works out of the box
The GPS system uses the **browser's Geolocation API** on the technician's tablet.

**Tablet integration:**
```javascript
// On the technician tablet, call this every 30 seconds while on duty:
navigator.geolocation.watchPosition(async (pos) => {
  await fetch('/api/gps/ping', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${techToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      on_duty: true  // set false when tech clocks out
    })
  });
});
```

**Live dashboard** connects via WebSocket:
```
ws://localhost:4000/ws/gps?token=YOUR_JWT
```

### QuickBooks — coming next
1. Register at [developer.intuit.com](https://developer.intuit.com)
2. Create an app, get Client ID + Secret
3. Add to `.env` as `QB_CLIENT_ID` / `QB_CLIENT_SECRET`
4. OAuth flow will activate automatically

### FreshBooks — coming next
1. Register at [freshbooks.com/api](https://www.freshbooks.com/api)
2. Same OAuth flow as QuickBooks

---

## 📡 API Reference

All endpoints require `Authorization: Bearer <token>` except `/api/auth/login`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login → returns JWT |
| GET | `/api/auth/me` | Current user |
| GET | `/api/dashboard/stats` | KPIs, revenue chart, tech stats |
| GET | `/api/jobs?date=YYYY-MM-DD` | Jobs (filterable) |
| POST | `/api/jobs` | Create job |
| PATCH | `/api/jobs/:id` | Update job / status |
| GET | `/api/customers?phone=xxx` | Phone lookup (call pop) |
| GET | `/api/customers?q=smith` | Search customers |
| POST | `/api/customers` | Create customer |
| GET | `/api/technicians` | All techs + GPS status |
| POST | `/api/gps/ping` | Submit GPS ping (tablet) |
| GET | `/api/gps/live` | Latest position all techs |
| GET | `/api/gps/history/:id?date=` | Route history |
| GET | `/api/inventory/items` | All inventory |
| GET | `/api/inventory/low-stock` | Below minimum |
| POST | `/api/inventory/move` | Transfer stock |
| GET | `/api/square/status` | Check Square connection |
| POST | `/api/square/payment` | Process card payment |
| WS | `/ws/gps?token=` | Live GPS WebSocket |

---

## 🏗 Architecture

```
dps/
├── docker-compose.yml          # One-command startup
├── .env.example                # Copy to .env
│
├── backend/
│   ├── src/
│   │   ├── index.js            # Express server + WebSocket
│   │   ├── db/
│   │   │   ├── pool.js         # PostgreSQL connection
│   │   │   ├── schema.sql      # Full DB schema (auto-run)
│   │   │   └── seed.sql        # Demo data (auto-run)
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT middleware
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── jobs.js
│   │   │   ├── customers.js
│   │   │   ├── technicians.js
│   │   │   ├── gps.js
│   │   │   ├── inventory.js
│   │   │   ├── invoices.js
│   │   │   ├── square.js
│   │   │   └── dashboard.js
│   │   └── websocket/
│   │       └── gps.js          # WS server + broadcast
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── main.jsx            # Auth context + login page
    │   ├── App.jsx             # Full live-wired UI
    │   └── api.js              # All API calls + WS client
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## 🛠 Development (without Docker)

```bash
# Start PostgreSQL separately (or use Docker just for DB)
docker compose up postgres -d

# Backend
cd backend
npm install
cp ../.env.example .env  # edit DATABASE_URL to localhost
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

---

## 🔒 Security Notes for Production

1. Change `JWT_SECRET` to a long random string: `openssl rand -hex 64`
2. Change PostgreSQL password in `docker-compose.yml`
3. Set `NODE_ENV=production`
4. Use `SQUARE_ENVIRONMENT=production` with production Square credentials
5. Add HTTPS (nginx reverse proxy or Cloudflare)
6. Set `FRONTEND_URL` to your actual domain

---

## 📱 Tablet App Notes

The technician tablet app should:
1. Login via `POST /api/auth/login` to get a JWT
2. Call `POST /api/gps/ping` every 30 seconds **only when `on_duty: true`**
3. Connect to `ws://host/ws/gps?token=JWT` to receive dispatch updates
4. Use Square Web Payments SDK for card payments on-site

GPS privacy: Setting `on_duty: false` stops all tracking. No location is stored after duty ends.
