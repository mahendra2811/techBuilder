# techBuilder — Domain Model, Permissions & Workflows (Phase 1)

> **⚠️ For BUILD details (final entity list, enums, conventions, RBAC), `techBuilder-Build-Readiness-Spec.md` is now authoritative** and extends this doc — it adds the `person`/labour master, wage_rate, advance, vendor, material UOM/balance/two-sided txn, completeness, voice media, site calendar, refresh tokens, and the UUIDv7/paise/soft-delete/version conventions. This doc remains the narrative/rationale for the model + workflows.
>
> The data + rules foundation. Once the org is onboarded, **everything is self-service inside the app** —
> the developer does nothing further. So the model, RBAC, and workflows below must be right up front.
> All entities are **`orgId`-scoped**. Records are entered **end-of-day** and **roll up** to the Owner.

---

## 1. Core principle: self-service after onboarding

Developer's only job = create the Org + the Owner's login, hand it over (payment taken offline). **After that, no developer involvement.** Owner → Site Manager → Team Head run the entire company from inside the app: create people, sites, vehicles, assign, approve, log, export. The app must enforce *who can do what* itself.

---

## 2. Data model (org-scoped)

```ts
Org        { id, name, brand, languages, createdAt }

User       { id, orgId, name, phone, photo,
             role: 'owner'|'site-manager'|'team-head'|'driver'|'worker',
             username, password, mustChangePassword, active,
             assignedSiteId?,                 // site-manager, team-head, worker, driver
             crewId?,                          // which crew (under a team head)
             allowedVehicleTypeIds?: string[], // DRIVER: vehicle types he may operate
             emergencyContact?, dailyWage?,    // dailyWage stored, unused in P1
             createdBy }                       // audit: who minted this account

Site       { id, orgId, name, address, lat, lng,
             startDate, expectedEndDate, budget, status:'active'|'paused'|'done',
             siteManagerId? }

Crew       { id, orgId, siteId, teamHeadId, name }   // a team head + his members

VehicleType{ id, orgId, name,                 // 'Truck' | 'JCB' | 'Crane' | 'Mixer'…
             metric: 'km'|'hours',            // drives the start/end log unit
             fields: Array<{ key, label, type:'number'|'text'|'photo'|'date', required }> }
                                               // ← type-driven dynamic inputs, NO code change to add a type

Vehicle    { id, orgId, vehicleTypeId, name, plate,
             values: Record<string, unknown>, // values for the type's `fields`
             assignedSiteId?, assignedDriverId?,
             status:'active'|'idle'|'maintenance',
             docs: Array<{ kind:'rc'|'insurance'|'puc', photoUrl, expiry }> }

Assignment { id, orgId, kind:'user-site'|'driver-vehicle'|'worker-crew'|'vehicle-site',
             subjectId, targetId, effectiveFrom, effectiveTo?, by }  // history-preserving

// ---- Attendance (IN scope: per-person + leave ranges) ----
Attendance { id, orgId, siteId, crewId?, userId, date,
             status:'present'|'absent'|'half-day'|'leave', markedBy }
             // markedBy = ALWAYS a Team Head or Site Manager. No clock-in/out, no GPS, no self-marking.
LeaveRange { id, orgId, userId, startDate, endDate, reason, status }
             // a leave range auto-fills Attendance as 'leave' across the span until the person is back

// ---- Records (the daily logs that roll up) ----
Record     { id, orgId, siteId, crewId?, type: RecordType,
             payload: object,                 // shape defined per type by the Record Registry
             capturedBy, onBehalfOf?,         // team-head logging for a phone-less worker
             photos?: MediaRef[], gps?, scan?, date, createdAt }

// RecordType ∈ { daily-report, progress-photo, headcount, expense, fuel,
//                vehicle-log(start|end), trip, material-usage, material-movement,
//                issue, daily-note, maintenance }

// ---- Generic request → approval engine (reused everywhere) ----
Request    { id, orgId, type:'vehicle-switch'|'leave'|'material',
             requestedBy, payload, status:'pending'|'approved'|'rejected',
             approverId?, decidedBy?, decidedAt? }

Notification{ id, orgId, userId, type, title, body, refId?, isRead, createdAt }
MediaRef    { id, orgId, url, thumbUrl, kind:'photo'|'scan', gps?, watermark, capturedAt }
```

**Why this shape:**
- `VehicleType.fields` makes "add a new vehicle type with its own inputs" **config, not code**.
- `Record` is generic + a **Record Registry** (form + allowed roles + how it aggregates per type) so new record kinds don't need new tables.
- `Assignment` is history-preserving (effective dates) → "who drove what when," reassignment audit.
- `Request` is one engine for vehicle-switch / leave / material — same UI, same approve flow.

---

## 3. Permission matrix (RBAC) — "you manage what lies inside you"

Confirmed: account creation cascades **Owner → Site Manager → Team Head**.

| Action | Owner | Site Manager | Team Head | Driver | Worker |
|---|---|---|---|---|---|
| Create **Site Manager** account | ✅ | — | — | — | — |
| Create **Team Head / Driver / Worker** | ✅ org | ✅ own site | ✅ own crew (Worker/Driver) | — | — |
| Create / edit **Site** | ✅ | — | — | — | — |
| Create / edit **Vehicle** (+ type) | ✅ | ✅ own site | — | — | — |
| Assign **Site Manager → site** | ✅ | — | — | — | — |
| Assign **Vehicle → Driver** | ✅ | ✅ own site | ✅ own crew | request only | — |
| Allocate **Worker/Driver → Crew** | ✅ | ✅ own site | — | — | — |
| **Approve** vehicle-switch / leave | ✅ | ✅ own site | ✅ own crew | — | — |
| Mark **attendance** (per person) | ✅ | ✅ own site | ✅ own crew | — | — |
| Log **records** (expense/fuel/trip/material/photo/issue…) | ✅ | ✅ site | ✅ crew (+ on-behalf) | ✅ own vehicle | — |
| **View** records / dashboards | ✅ org-wide | ✅ own site | ✅ own crew | ✅ own | ✅ self only |
| **Export** Excel / data window | ✅ org | ✅ own site | — | — | — |

**Scope qualifier** (`org` / `own-site` / `own-crew` / `own` / `self`) is enforced in the engine on every action, not just hidden in the UI.

---

## 4. Key workflows

### 4.1 Vehicle type → dynamic inputs
Site Manager adds a `VehicleType` (e.g. "JCB", metric `hours`, fields `[hourMeterPhoto, hourReading]`) → every Vehicle of that type shows those inputs and logs in **hours**; a "Truck" type logs **km**. New type = new config row, no code.

### 4.2 Driver ↔ vehicle compatibility + switch approval
- Driver has `allowedVehicleTypeIds`. Assignment is **rejected** if the vehicle's type isn't in that list.
- **Switch flow:** Driver raises a `Request{type:'vehicle-switch'}` → Site Manager / Team Head approves → engine creates a new `Assignment(driver-vehicle)` and ends the old one. SM/TH can also assign directly (no request).

### 4.3 Attendance + multi-day leave
- **Marked manually by Team Head (crew) / Site Manager (site) ONLY.** There is **no clock-in/clock-out**, **no GPS** on attendance, and **drivers/workers never self-mark** — `markedBy` is always a TH or SM.
- TH/SM marks each person present / absent / half-day per day (bulk "all present" + adjust).
- A `LeaveRange(start,end)` auto-marks `leave` across the span; person returns → marked present again. Rolls up to "today's headcount per site / per crew" for the Owner.
- *(GPS + camera/scanner capture still apply to **records** — site photos, vehicle logs — just not to attendance.)*

### 4.4 Records roll up (entered end-of-day)
Driver/Team-Head/Site-Manager log after the day → Owner & Site Manager see **today's status**: km/hours done, trips, **expenses** (per crew/site/day), materials moved, issues, attendance. Owner never enters daily data — only consumes.

### 4.5 Expenses, trips, materials
- **Expense** record (esp. Team Head — food, supplies) → visible to SM + Owner → aggregated daily totals.
- **Trip** record — count of trips per driver/machine.
- **Material-movement** record — quantity of material (cement bags, etc.) moved A→B / site→site.

### 4.6 Capture
Photo / **camera** / **scanner** / **GPS** attachable to records via `MediaRef` (watermark: date, time, GPS, site, name — same pipeline for all roles).

### 4.7 Export & backup
- **Excel export** for Owner + Site Manager over a date window (**7 / 30 day**).
- Scheduled **backups** + in-app **import/export** of windowed data.

---

## 5. State management (so nothing breaks later)
- **Server / synced data** → always through the **adapter** (`RecordsClient`), cached + offline-queued. Never fetched directly in screens.
- **Offline-first**: writes go local → queue → flush when online (records + media). Reads hit local first.
- **UI / session state** (current user, org, language, nav) → a small Zustand store.
- **Permissions** computed once from `{role, scope}` and enforced in the engine layer (a `can(action, target)` guard), not scattered in screens.

---

*This is the foundation the screens build on. Next: confirm, then scaffold the engine with this model + a `can()` permission guard + the mock adapter seeded with one org's data.*
