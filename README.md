# Sentinel Campus: Smart Attendance & Campus Presence Verification

> **IEEE IGNITE 2026 — SKIT Jaipur**  
> **Problem Statement 23:** Smart Campus, Facial Recognition and Mobile Application Development  
> **Stack:** React 19, TypeScript, Tailwind CSS, `@vladmandic/face-api`, Node.js, Express, IndexedDB, PostgreSQL / Supabase Schema

---

## 1. Problem Overview & Solution Architecture

Staff members traditionally queue up at the college's main gate to register attendance on fixed biometric machines. Morning traffic spikes and physical congestion cause delays.

**Sentinel Campus** decentralizes attendance by allowing staff and students to mark attendance directly from their mobile phones **after entering campus**:
1. **Live Camera Enforcement:** Directly accesses device camera (`navigator.mediaDevices.getUserMedia`). File inputs and gallery uploads are strictly disabled in the attendance flow.
2. **Local Face Verification:** Employs an open-source facial recognition network (`@vladmandic/face-api`) with locally hosted model weights in `/models/` — zero paid API reliance.
3. **Active Liveness Challenge:** Prompts randomized challenges (*blink, smile, head-turn*) to deter static photo spoofing.
4. **Campus Presence Geofencing:** Computes Haversine distance server-side against SKIT Jaipur coordinates (`26.8227° N, 75.8647° E`) and rejects requests outside the permitted perimeter or with coarse GPS accuracy (> 80m).
5. **Continuous Class Checkpoints:** Supports start-of-class (Checkpoint 1) and mid-class presence verification (Checkpoint 2).
6. **Store-and-Forward Offline Sync:** When disconnected, captures enter a client-side IndexedDB pending queue, auto-synchronizing once online. Captures are marked confirmed only after server validation.
7. **Administrative Command Center:** Provides real-time attendance auditing, CSV export, role/account management, and live campus geofence reconfiguration.

---

## 2. Quick Start & Local Demonstration

### Prerequisites
- Node.js `v18+` (Tested on `v24.15.0`)
- npm `v9+`

### Installation & Setup
```bash
# 1. Navigate to project directory
cd sentinel-campus

# 2. Install all dependencies (already installed)
npm install

# 3. Run automated verification test suite
npm test

# 4. Start both Backend API Server and Vite Frontend concurrently
npm run dev
```

The application will be accessible at:
- **Frontend App:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:5000](http://localhost:5000)
- **Health Check:** [http://localhost:5000/health](http://localhost:5000/health)

---

## 3. Environment Variables

Create a `.env` file in `sentinel-campus` if configuring production or remote endpoints:

```env
# Server Port (Default: 5000)
PORT=5000

# Node Environment
NODE_ENV=development

# Optional Supabase Integration (when moving beyond local demo mode)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Campus Center Reference (Defaults to SKIT Jaipur)
CAMPUS_LAT=26.8227
CAMPUS_LON=75.8647
CAMPUS_RADIUS_METERS=450
MAX_ACCURACY_METERS=80
```

> **Note:** Sentinel Campus runs in a zero-configuration local demonstration mode by default, persisting to `server/data/db.json` with pre-seeded faculty, students, and admin records. No cloud database credentials are required to run or test.

---

## 4. Pre-Configured Accounts for Demonstration

The top **DEMO CONTROLS** bar allows 1-click switching between accounts:

| Role | Name | Identifier | Biometric Enrolled |
| :--- | :--- | :--- | :--- |
| **Faculty (Staff)** | Dr. Rajesh Sharma (Prof. CSE) | `SKIT-FAC-104` | Yes (Ready to verify) |
| **Faculty (Unenrolled)** | Er. Priya Mehta (Asst. Prof. ECE) | `SKIT-FAC-119` | No (Test enrollment flow) |
| **Student** | Aarav Verma (3rd Year CSE) | `22SKITCS045` | Yes (Test class checkpoints) |
| **Admin** | Prof. Ramesh K. Agarwal (Dean) | `SKIT-ADM-001` | Yes (Full control center) |

---

## 5. Offline Attendance & Store-and-Forward Sync

1. **Detection:** Network state is monitored via `window.onLine` and can be toggled via the demo bar button **"Simulating Offline Mode"**.
2. **Queueing:** When disconnected, camera capture and live facial feature extraction still run in the browser. The resulting 128-d descriptor, GPS coordinates, and timestamp are written to IndexedDB store (`pending_submissions`).
3. **Privacy Protection:** Raw video frames are discarded immediately after vector generation; images are never persisted indefinitely.
4. **Verification Status:** Unverified offline items are strictly marked **"Pending Sync"** and are **never falsely displayed as confirmed**.
5. **Re-connection & Sync:** As soon as internet connectivity returns (or when the user clicks **"Sync Pending With Server"**), the client batches pending events to `POST /api/attendance/sync`.
6. **Server Authority:** The server calculates the real distance, verifies the face embedding against stored database vectors, enforces duplicate constraints, and returns a final `confirmed`, `rejected`, or `duplicate` decision.

---

## 6. Campus Geofence & Wi-Fi Provider Integration

### Geolocation Geofencing
- The administrator can configure campus latitude, longitude, permitted radius (default `450m`), and maximum accuracy tolerance (`80m`).
- Calculation uses the **Haversine formula**:
  $$a = \sin^2(\Delta\phi/2) + \cos(\phi_1)\cos(\phi_2)\sin^2(\Delta\lambda/2)$$
  $$d = 2 R \operatorname{atan2}(\sqrt{a}, \sqrt{1-a})$$
- For hackathon demonstration convenience, the **GPS Presence** dropdown in the top bar allows evaluators to simulate:
  - **Inside SKIT Campus (~15m, Pass)**
  - **Outside Campus (Jaipur Airport ~6km, Reject)**
  - **Inaccurate Signal (±145m > 80m limit, Reject)**
  - **Real Device Browser GPS** (Uses device sensor)

### Campus Wi-Fi Integration Interface
Standard browser sandboxes prohibit JavaScript from directly reading the SSID or BSSID of the connected Wi-Fi network for security reasons. Sentinel Campus provides an extensible provider interface:
- Captive portal / RADIUS authentication webhooks (RFC 802.1x)
- Configurable trusted SSIDs (`SKIT_CAMPUS_SECURE`, `SKIT_FACULTY_WIFI`)
- Documented in `server/db.ts` and `supabase/schema.sql`.

---

## 7. Hackathon Step-by-Step Demonstration Script

### Walkthrough 1: Primary Staff Attendance (Within Campus)
1. In the top demo bar, ensure account is **Staff (Dr. Rajesh)** and GPS is **Inside SKIT Campus**.
2. Click **"Mark Daily Attendance (Live Camera)"**.
3. Allow camera access. Note the live oval face guide and the randomized liveness challenge (*e.g., "Please blink both eyes naturally"*).
4. Tap **"Verify & Record Attendance"**.
5. Result: Confirmed attendance with distance (~14m), biometric distance (< 0.55), and tamper-evident SHA-256 audit hash.
6. Try tapping **"Mark Daily Attendance"** again. Notice the server immediately rejects duplicate submission with HTTP 409!

### Walkthrough 2: Geofence Rejection Test (Off-Campus Proxy Attempt)
1. Switch the top bar **GPS Presence** dropdown to **"Outside Campus (Jaipur Airport 6km, Reject)"**.
2. Open attendance verification for a class checkpoint or new session.
3. Observe the geofence indicator turning red: *"Device is 5901m from campus center"*.
4. Attempt verification. The server returns HTTP 422 with the exact rejection reason recorded in the security audit ledger.

### Walkthrough 3: Unenrolled Staff Biometric Registration
1. Switch account to **Staff (Unenrolled) — Er. Priya Mehta**.
2. Notice the yellow banner: *"Facial Enrollment Required"*.
3. Click **"Enroll Now"**.
4. Read the biometric consent declaration and check the agreement box.
5. Align face inside the oval guide and click **"Register Biometric Profile"**.
6. 128-dimensional embedding vector is registered on the server. The user is now enabled for one-tap attendance!

### Walkthrough 4: Offline Queue & Auto-Sync
1. In the demo bar, click **"Simulating Online"** to switch it to **"Simulating Offline Mode"**.
2. Notice the top bar displays a pulsing amber pill: `Offline Mode`.
3. Open attendance capture and complete the camera verification.
4. Result shows: `Attendance Queued (Offline) — Saved to local IndexedDB`.
5. Notice the navbar badge: `1 Pending`.
6. Click the badge to open the **Offline Attendance Queue** drawer. Observe status is `Pending Sync`.
7. In the top bar, click to toggle back to **"Simulating Online"**.
8. Click **"Sync Pending With Server"** (or let auto-sync fire). The server validates the capture and marks it `Confirmed` with sync timestamp!

### Walkthrough 5: Student In-Class Checkpoints
1. Switch to **Student (Aarav)**.
2. View class **CS-501: Distributed Systems & Cloud Architecture**.
3. Notice two distinct checkpoint windows:
   - Checkpoint 1 (Class Start: 09:00 - 09:30)
   - Checkpoint 2 (Mid-Class Presence Check: 09:50 - 10:20)
4. Mark attendance for Checkpoint 1 and verify that Checkpoint 2 remains pending without conflict.

### Walkthrough 6: Administrator Control Center
1. Switch account to **Admin (Dean)**.
2. View KPI cards: Total directory, confirmed today, rejections, campus perimeter.
3. Review the **Attendance Master Log** with live filters (Date, Role, Status, Checkpoint, Search).
4. Click **"Export Official CSV"** to download the attendance log.
5. Open the **"Geofence & Network Rules"** tab and edit the campus perimeter or coordinates.
6. Open the **"Security Audit Trail"** tab to inspect cryptographically hashed tamper logs.

---

## 8. Honest Limitations & Security Disclosures

- **GPS Spoofing:** Standard browser Geolocation APIs rely on OS-level location providers, which can be spoofed by rooted devices or mock location apps. Sentinel Campus mitigates this by requiring sensor accuracy checks (≤ 80m) and coupling geolocation with real-time biometric face verification.
- **Biometric Anti-Spoofing:** Camera-based facial matching with active liveness challenges (blinking/head turn) protects against simple printed photo spoofing, but does not claim Level 2 3D structured light / IR depth anti-spoofing.
- **Wi-Fi SSID In Browser:** Due to W3C security policies, web browsers cannot read connected Wi-Fi SSIDs without an operating system bridge or enterprise RADIUS network integration.

---

## 9. Repository Structure

```
sentinel-campus/
├── public/
│   ├── favicon.svg             # Campus shield SVG icon
│   ├── manifest.json           # PWA web manifest
│   └── models/                 # Locally hosted @vladmandic/face-api weights
├── server/
│   ├── __tests__/              # Automated test suite (npm test)
│   ├── data/                   # JSON persistence (db.json)
│   ├── routes/                 # Express API routes (auth, attendance, admin, etc.)
│   ├── db.ts                   # In-memory store, Haversine & Euclidean calculators
│   └── index.ts                # Express backend entrypoint
├── src/
│   ├── components/
│   │   ├── AdminDashboard.tsx   # Admin dashboard, audit logs, CSV export
│   │   ├── AttendanceModal.tsx  # Direct camera, liveness, geofence verification
│   │   ├── DemoControlBar.tsx   # Top tester toolbar for judges
│   │   ├── EnrollmentModal.tsx  # Biometric consent & 128-d vector registration
│   │   ├── Navbar.tsx           # Branding, role pill, network status
│   │   ├── OfflineQueueDrawer.tsx # IndexedDB offline queue and sync UI
│   │   ├── StaffDashboard.tsx   # Primary mobile faculty attendance view
│   │   └── StudentDashboard.tsx # Student view with class checkpoints
│   ├── services/
│   │   ├── api.ts               # Typed REST client
│   │   ├── faceVerification.ts  # Face-API inference & liveness
│   │   ├── geofence.ts          # Haversine distance & simulation presets
│   │   └── offlineSync.ts       # IndexedDB offline store & auto-sync engine
│   ├── types/index.ts          # TypeScript interfaces
│   ├── App.tsx                 # Root application controller
│   └── main.tsx                # Entrypoint
├── supabase/
│   └── schema.sql              # Production PostgreSQL schema with RLS policies
├── package.json
└── vite.config.ts
```

---

*Built for IEEE IGNITE 2026, SKIT Jaipur — Problem Statement 23.*
