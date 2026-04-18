# DPS Mobile App — Setup Guide

## Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your iPhone/Android (free from App Store/Play Store)
- Or Xcode for iOS Simulator

---

## Step 1 — Add pin_hash column to database

Run this in Terminal (adds PIN support to your existing database):

```bash
docker compose -f ~/Downloads/dps2_clean/docker-compose.yml exec postgres psql -U dps -d dps -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;"
```

Then restart the backend to pick up the new auth routes:

```bash
cd ~/Downloads/dps2_clean && docker compose restart backend
```

---

## Step 2 — Install the mobile app

```bash
cd ~/Downloads/dps-mobile
npm install
```

---

## Step 3 — Configure your IP address

If testing on a **real device**, open `src/services/api.js` and change:

```js
export const BASE_URL = 'http://localhost:4000';
```

To your Mac's local IP (find it in System Preferences → Network):

```js
export const BASE_URL = 'http://192.168.1.XXX:4000';
```

For **iOS Simulator**, `localhost` works fine.

---

## Step 4 — Start the app

```bash
cd ~/Downloads/dps-mobile
npx expo start
```

- Press **i** to open iOS Simulator
- Scan the QR code with Expo Go on your phone

---

## Step 5 — Log in

On the login screen:
1. Tap your technician name
2. Enter PIN — **default PIN is `1234`** for all technicians until they set their own
3. You're in!

To set a custom PIN for a technician, call:
```
POST /api/auth/set-pin
Authorization: Bearer <token>
Body: { "pin": "5678" }
```

---

## Features

| Screen | What it does |
|--------|-------------|
| **My Jobs** | See today's jobs, filter by status, tap to open |
| **Job Detail** | Update status (En Route → On Site → Done), add notes, take photos, collect payment |
| **GPS** | Go on/off duty, live location pings every 60 seconds to dispatch |
| **Payment** | Enter amount, select tip, charge via Square |
| **Profile** | View account info, sign out |

---

## Default PINs
All technicians start with PIN `1234`. They can change it via the API or you can set them via the database:

```bash
# Set a specific PIN for a tech (replace HASH with bcrypt hash of their PIN)
docker compose exec postgres psql -U dps -d dps -c \
  "UPDATE users SET pin_hash = crypt('5678', gen_salt('bf')) WHERE first_name = 'Carl';"
```
