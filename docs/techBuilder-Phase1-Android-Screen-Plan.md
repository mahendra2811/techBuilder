# techBuilder — Phase 1 Android App
## Screen-by-Screen Plan (All Roles)

> **What this document is:** the complete list of screens for the Phase 1 Android app, role by role, with what every screen shows and what the user can do on it. No technology, no code — just the product. This is the blueprint to design and build against.
>
> **⚠️ Read §12 first.** This plan was written before the domain model was finalized. **§12 (Revisions) is authoritative** where it differs — it folds in per-person attendance + leave, delegated account creation, vehicle types + approvals, and Team-Head expense. The per-screen detail below still holds; §12 lists what changed/was added. Foundation: `techBuilder-Domain-Model-and-Permissions.md`.

---

## 1. Phase 1 at a Glance

- **Platform:** Android mobile app (mobile-first). Web/iOS not in this phase.
- **Customer:** one construction company (single tenant). Everything is set up for this one owner.
- **Login:** manual — the Owner creates a username + password for each person and hands it to them. No OTP, no self-signup.
- **Languages:** Hindi (default) + English toggle, everywhere.
- **What this product IS:** a daily **records + visibility** tool. The field and managers log simple records; the Owner sees clean status and analysis across all sites and vehicles.

### What's IN Phase 1  *(updated — see §12)*
- **Self-service org management** — Owner/Site Manager/Team Head create accounts + run the company (no developer involvement after onboarding)
- **Per-person attendance + multi-day leave** (present/absent/half-day; leave ranges) — marked by Team Head / Site Manager *(NOT clock-in; no GPS punch)*
- Daily site status / progress notes + site progress photos
- Issues / problems flagged
- **Type-driven vehicles** (KM / hours + dynamic inputs by type) + driver-compatibility + **vehicle-switch / leave / material request→approval**
- Vehicle logs (start/end), fuel records (₹ + liters + receipt), **trips**, **material-movement**
- **Expense tracker** incl. **Team Head** (food/supplies) → visible to Site Manager + Owner, aggregated daily
- Material usage records (quantity)
- Capture: camera / **scanner** / GPS on records
- Owner dashboard + weekly / current analysis (end-of-day rollup)
- **Excel export** + windowed (7 / 30-day) import/export + scheduled backups

### What's OUT of Phase 1 (deferred)
- **Signup / OTP / forgot-password / payment** — manual: developer provisions org + owner login after taking payment offline (manual login stub only)
- Clock-in / clock-out with GPS punch (attendance is a per-person mark, not a punch)
- Wages, payouts, payment gateway, any money movement
- Worker data-entry (worker is **view-only** this phase)
- Multi-company self-registration, subscriptions, real-time live tracking

---

## 2. The 5 Roles

| Role | Who they are | Main job in the app |
|---|---|---|
| **Owner** | The boss / company owner (your customer) | Set everything up, see everything, analyse, export |
| **Site Manager** | Runs one construction site | Log & oversee all records for their site |
| **Team Head** | Crew leader on the ground (under a Site Manager) | Log crew-level records for the people allocated to him |
| **Driver** | Drives a vehicle / operates equipment | Log everything about his vehicle (KM, fuel, issues, photos) |
| **Worker** | On-ground labourer | View-only — sees his own basic info |

Each role logs in and lands on **their own home screen**, with a bottom navigation bar showing only their screens. Nobody sees another role's screens.

---

## 3. Screen Count Summary

| Role | Screens |
|---|---|
| Shared (used by all roles) | 7 |
| Owner | 16 |
| Site Manager | 12 |
| Team Head | 8 |
| Driver | 10 |
| Worker | 2 |
| **Total unique screens** | **55** |

---

## 4. Shared Screens (all roles use these)

### S1. Splash
- **Purpose:** opening screen while the app loads.
- **On screen:** company logo, app name, loading indicator.
- **Action:** auto-moves to Login (if logged out) or the role's Home (if logged in).

### S2. Login
- **Purpose:** enter the app.
- **On screen:** username/phone field, password field, language toggle (HI/EN), Login button, "forgot password? contact your owner" note.
- **Actions:** log in; on success, routed to the correct role home automatically.

### S3. Change Password (first login)
- **Purpose:** force a new password the first time, since the Owner handed out a temporary one.
- **On screen:** new password, confirm password, save button.
- **Action:** set new password, then continue to home. (Shown only on first login or when reset by Owner.)

### S4. Profile
- **Purpose:** the logged-in person's own details.
- **On screen:** photo, name, role, phone, assigned site/vehicle, emergency contact.
- **Actions:** edit basic fields (phone, photo, emergency contact); change password.

### S5. Notifications Center
- **Purpose:** all alerts for this user in one place.
- **On screen:** list of notifications (issue raised, breakdown alert, allocation changed, etc.) with read/unread state and time.
- **Actions:** tap to open the related item; mark read; clear.

### S6. Settings & Language
- **Purpose:** app preferences.
- **On screen:** language toggle (HI/EN), notification on/off, about/version, logout.
- **Actions:** switch language, toggle notifications, log out.

### S7. Help / Report a Problem
- **Purpose:** let users report issues with the app.
- **On screen:** short form (describe the problem) + a WhatsApp/contact button.
- **Action:** send the report.

---

## 5. Owner — 16 Screens

The Owner sets up the whole company and consumes all the data. Bottom nav (suggested): **Dashboard · Sites · Fleet · More**.

### O1. Owner Dashboard (Home)
- **Purpose:** the whole company at a glance, today.
- **On screen:** key number cards — active sites, total headcount today (sum across sites), vehicles active today, total spend today; alert strip (breakdowns, critical issues, high spend); a short "latest activity" preview.
- **Actions:** tap any card to drill into that area; open alerts.

### O2. All Sites
- **Purpose:** list of every construction site.
- **On screen:** a card per site — name, location, today's headcount, today's spend, open-issues count, progress %.
- **Actions:** tap a site to open its detail; add new site; search/filter.

### O3. Site Detail
- **Purpose:** everything about one site in one place.
- **On screen:** site summary header, then sections/tabs — Daily reports, Photos, Headcount, Spend, Materials, Vehicles on site, Issues, Assigned people.
- **Actions:** view each section; assign a Site Manager to this site; assign vehicles to this site.

### O4. Add / Edit Site
- **Purpose:** create or change a site.
- **On screen:** name, address, map location, start date, expected end date, budget, status (active/paused/done).
- **Actions:** save, deactivate.

### O5. People / Users
- **Purpose:** directory of everyone in the company.
- **On screen:** list of all users — photo, name, role badge, assigned site/vehicle, active/inactive.
- **Actions:** tap to view/edit; add new user; search/filter by role or site.

### O6. Add / Edit User
- **Purpose:** create a login for a person and place them in the org.
- **On screen:** name, phone, role (Owner/Site Manager/Team Head/Driver/Worker), photo, assigned site, assigned vehicle (for drivers), daily-wage field *(stored for later — not used in Phase 1)*, set/reset temporary password.
- **Actions:** create user + generate credentials to hand over; edit; deactivate; reset password.

### O7. Vehicles / Fleet List
- **Purpose:** every vehicle in the company.
- **On screen:** card per vehicle — name, plate, type (KM / Hours), assigned site, assigned driver, status (active/idle/maintenance), today's KM-or-hours, today's fuel.
- **Actions:** tap to view/edit; add new vehicle; filter.

### O8. Add / Edit Vehicle
- **Purpose:** create or change a vehicle/equipment.
- **On screen:** name, type (KM-type / Hours-type), plate number, document photos (RC, insurance, PUC) with expiry dates, assigned site, assigned driver, status.
- **Actions:** save, assign driver, assign site, deactivate.

### O9. Fleet Overview / Analytics
- **Purpose:** how the whole fleet is performing.
- **On screen:** per-vehicle KM/hours for the period, fuel consumed, cost per vehicle, idle vs active; date-range selector (today / week / month).
- **Actions:** change range; tap a vehicle for its log history.

### O10. Spend Analytics
- **Purpose:** where the money is going (records only — no payments).
- **On screen:** total spend for the period; breakdown by category (fuel / material / misc); breakdown by site; trend chart (daily/weekly); date-range selector.
- **Actions:** change range; filter by site or category; drill into individual spend records.

### O11. Headcount Overview
- **Purpose:** workforce numbers across all sites.
- **On screen:** total headcount today, per-site breakdown, weekly trend.
- **Actions:** change date; tap a site for its daily headcount history.

### O12. Materials Overview
- **Purpose:** material consumption across sites.
- **On screen:** material used by type and quantity, per site, over the period.
- **Actions:** filter by site/material; change range.

### O13. Issues Overview
- **Purpose:** all problems across all sites.
- **On screen:** issue list with severity badges, site, status (open/in-progress/resolved); filters.
- **Actions:** open an issue; filter by severity/site/status.

### O14. Activity Feed
- **Purpose:** one structured stream of everything happening (the "WhatsApp replacement").
- **On screen:** chronological feed — reports, photos, fuel entries, issues, headcount submissions — each with who/what/when and a photo preview where relevant.
- **Actions:** filter by site / type / person; tap any item to open it.

### O15. Photo Gallery (all sites)
- **Purpose:** browse every photo in the company.
- **On screen:** grid of photos with date/site/type tags; filters.
- **Actions:** filter by site/date/type; open full-screen; download.

### O16. Reports & Export
- **Purpose:** generate downloadable reports.
- **On screen:** report type (site summary / fleet / spend / materials / headcount), date range, site filter, format (PDF / Excel), generate button.
- **Action:** generate and download/share the file.

---

## 6. Site Manager — 12 Screens

Sees and manages **one site only**. Bottom nav (suggested): **Site · Records · People · More**.

### SM1. Site Manager Home / Site Dashboard
- **Purpose:** the nerve-centre for their one site, today.
- **On screen:** today's headcount, today's spend, open issues, recent activity at this site, quick-action buttons (add report / photo / spend / issue).
- **Actions:** jump to any record screen; open recent items.

### SM2. Daily Site Report
- **Purpose:** the daily written status of the site.
- **On screen:** date (today, fixed), free-text "what happened today" note, auto-filled summary (headcount, spend), space to attach photos, submit button.
- **Actions:** write and submit the day's report; edit today's.

### SM3. Progress Photos
- **Purpose:** capture site photos as proof of daily progress.
- **On screen:** in-app camera; captured photo gets a stamped watermark (date, time, GPS, site name); optional note; morning/evening tag; an upload/queue indicator; gallery of recent site photos.
- **Actions:** capture, tag, add note, submit; browse this site's photos.

### SM4. Worker Headcount
- **Purpose:** record how many workers were on site today (just a number).
- **On screen:** date (today), a number entry (total present), optional split by crew/team head, submit.
- **Action:** submit today's headcount.

### SM5. Material Usage
- **Purpose:** record what materials were used on site.
- **On screen:** material type (cement, steel, sand, bricks, etc.), quantity + unit, optional photo, optional note, running daily list.
- **Actions:** add an entry; view today's/this week's usage.

### SM6. Spend / Expense Record
- **Purpose:** log a site expense as a record (no money is moved).
- **On screen:** amount (₹), category (material / misc / transport / repair / other), description, optional receipt photo, date; list of recent spend.
- **Actions:** add a spend record; view site spend history.

### SM7. Issues
- **Purpose:** track problems on this site.
- **On screen:** list of issues with severity + status; a "raise issue" form (title, description, severity, category, photos).
- **Actions:** raise a new issue; update status; mark resolved; escalate to Owner.

### SM8. Progress Tracker / Milestones
- **Purpose:** show how complete the site/work is.
- **On screen:** milestone list with progress bars, a percentage slider, optional photo evidence, history of updates.
- **Actions:** update progress %, attach evidence.

### SM9. People on Site
- **Purpose:** see everyone assigned to this site.
- **On screen:** list of workers, team heads and drivers on the site — photo, name, role, crew.
- **Actions:** view a person's details; quick call.

### SM10. Allocate to Team Heads
- **Purpose:** decide which workers/drivers work under which Team Head.
- **On screen:** list of team heads; for each, the workers/drivers currently under them; a picker to add/remove people.
- **Actions:** assign / re-assign workers and drivers to a Team Head.

### SM11. Vehicles on Site
- **Purpose:** see the vehicles working on this site (read-only).
- **On screen:** vehicle cards with driver, today's KM/hours, today's fuel, status.
- **Actions:** view a vehicle's recent logs (cannot reassign — that's the Owner's job).

### SM12. Material Request
- **Purpose:** ask the office/Owner for materials.
- **On screen:** material type, quantity, urgency, needed-by date; status tracker of past requests.
- **Actions:** submit a request; track its status.

---

## 7. Team Head — 8 Screens

A crew leader. Works with the workers/drivers **allocated to him** by the Site Manager. Bottom nav (suggested): **Home · Crew · Record · More**.

### TH1. Team Head Home
- **Purpose:** his crew at a glance.
- **On screen:** crew size, today's headcount for his crew, quick-action buttons (headcount / photo / note / material / issue), recent activity.
- **Actions:** jump to any record screen.

### TH2. My Crew
- **Purpose:** see the workers and drivers under him.
- **On screen:** list — photo, name, role; basic details on tap.
- **Actions:** view a crew member's details; quick call.

### TH3. Crew Headcount
- **Purpose:** record how many of his crew are present today.
- **On screen:** date (today), present count (or a quick tick-list of his crew), submit.
- **Action:** submit today's crew headcount.

### TH4. Progress Photos
- **Purpose:** upload photos of his crew's work.
- **On screen:** in-app camera with stamped watermark (date, time, GPS, site), optional note, upload indicator.
- **Actions:** capture, note, submit.

### TH5. Daily Note
- **Purpose:** a short end-of-day text update (replaces the WhatsApp evening message).
- **On screen:** free-text box, auto timestamp, submit.
- **Action:** submit the note.

### TH6. Material Usage
- **Purpose:** record materials his crew used.
- **On screen:** material type, quantity + unit, optional photo.
- **Action:** add an entry.

### TH7. Raise Issue
- **Purpose:** flag a problem from the ground.
- **On screen:** title, description, severity, category, photos.
- **Action:** submit — appears on Site Manager + Owner screens.

### TH8. Upload on Behalf
- **Purpose:** post a photo or note for a worker who has no phone.
- **On screen:** pick a worker from his crew → choose action (photo / note) → the normal form, tagged "by Team Head on behalf of [Worker]".
- **Action:** submit with dual attribution.

---

## 8. Driver — 10 Screens

Everything is tied to the driver's assigned vehicle. The app adapts to vehicle type: **KM-type** (truck/car) shows KM; **Hours-type** (JCB/crane) shows hours. Bottom nav (suggested): **Home · Fuel · Photos · More**.

### D1. Driver Home
- **Purpose:** today's vehicle + quick actions.
- **On screen:** vehicle card (name, plate, type badge, status), today's summary (KM/hours so far, fuel, trips), action buttons (Start Day / End Day / Fuel / Expense / Issue).
- **Actions:** jump to any log screen.

### D2. Start Day Log
- **Purpose:** record the vehicle's starting state.
- **On screen:** mandatory in-app photo of the odometer/hour-meter, number entry (KM or hours reading), auto-captured GPS + timestamp.
- **Action:** submit start log (photo required; warns if reading looks wrong).

### D3. End Day Log
- **Purpose:** record the ending state and auto-calculate the day's total.
- **On screen:** mandatory meter photo, ending reading, auto-calculated "today = end − start" shown prominently.
- **Action:** submit; validates end > start.

### D4. Fuel Entry
- **Purpose:** log a fuel fill-up with proof.
- **On screen:** amount (₹), liters, **mandatory** receipt photo, auto GPS, auto cost-per-liter, optional note.
- **Action:** submit (cannot submit without receipt photo).

### D5. Vehicle Expense Entry
- **Purpose:** log non-fuel vehicle costs as a record.
- **On screen:** amount (₹), category (toll / parking / repair / food / other), optional receipt photo, note.
- **Action:** submit.

### D6. Vehicle Issue Report
- **Purpose:** report a mechanical problem or breakdown.
- **On screen:** issue type, description, photos, severity (can continue / needs attention / breakdown).
- **Action:** submit — "breakdown" triggers an immediate alert to the Owner.

### D7. Trip / Photo Upload
- **Purpose:** upload trip evidence (loading, delivery, transport).
- **On screen:** in-app camera with watermark, trip/purpose tag, note.
- **Action:** capture and submit, tagged to the vehicle.

### D8. Daily Summary
- **Purpose:** auto-built recap of the driver's day (read-only).
- **On screen:** total KM/hours, start→end readings, fuel (liters + ₹), expenses, trips, vehicle status.
- **Action:** view only.

### D9. Vehicle Documents
- **Purpose:** quick access to the vehicle's papers.
- **On screen:** RC, insurance, PUC photos with expiry dates.
- **Action:** view (and flag if expiring soon).

### D10. Maintenance / Service Log
- **Purpose:** keep a record of servicing and repairs.
- **On screen:** list of past services (date, what was done, cost record, photo); add-entry form.
- **Action:** add a service record; view history.

---

## 9. Worker — 2 Screens (View-Only)

Minimal this phase. The worker logs in and can only **see** his own basic information. No data entry, no photos, no records.

### W1. Worker Home / Digital ID
- **Purpose:** the worker's identity card inside the app.
- **On screen:** photo, name, role, assigned site, phone, emergency contact (can double as a QR ID for site entry later).
- **Action:** view only.

### W2. My Info / Attendance
- **Purpose:** a placeholder for the worker's own records.
- **On screen:** basic details; an attendance summary area that shows **"coming soon"/empty** for now (since attendance isn't built this phase).
- **Action:** view only. *(This screen fills with real data whenever attendance is added in a later phase.)*

*(Worker uses the Shared screens for Notifications and Settings — no extra screens needed.)*

---

## 10. How the Records Roll Up

The point of every record is that it travels **up the chain** automatically, entered once:

- **Driver** logs KM / fuel / issues → feeds the **Owner's** Fleet and Spend analytics.
- **Team Head** logs crew headcount / photos / materials / issues → visible to his **Site Manager** → rolled into the **Owner's** dashboard.
- **Site Manager** logs site reports / spend / headcount / progress → rolled into the **Owner's** cross-site view.
- The **Owner** never enters daily data — he only consumes, analyses, and exports.

One record entered at the bottom shows up everywhere above it. That is the whole product.

---

## 11. Decisions — now SETTLED

1. **Overlapping records** — ✅ Confirmed: **Team Head logs at crew level, Site Manager at whole-site level.** Both can log headcount/photos/notes/materials/issues, scoped accordingly (enforced by RBAC).
2. **Team Head spend** — ✅ **Team Heads DO log expenses** (food/supplies for workers); visible to Site Manager + Owner, aggregated daily. (See §12.)
3. **Worker login** — ✅ Worker stays a **view-only** role in Phase 1 (logs in, sees own info + own attendance). Attendance is now marked *for* the worker by Team Head / Site Manager.

---

## 12. Phase-1 Revisions (per Domain Model) — AUTHORITATIVE

These changes/additions reconcile this product plan with `techBuilder-Domain-Model-and-Permissions.md`. Where they differ from §§4–9 above, **these win**.

### 12.1 Delegated account creation (NEW capability on existing screens)
Account + credential creation cascades **Owner → Site Manager → Team Head**, each scoped:
- **Owner** — creates anyone (Site Managers, Team Heads, Drivers, Workers), org-wide. *(O5/O6 People + Add/Edit User.)*
- **Site Manager** — creates Team Heads / Drivers / Workers **for their site**. *(New: SM "People" + "Add User" screens, same form as O6, scoped to site.)*
- **Team Head** — creates Workers / Drivers **for their crew**. *(New: TH "Add crew member" screen — name, phone, role, temp password.)*
Every "Add User" mints a temporary password handed over in person; first login forces Change Password (S3).

### 12.2 Per-person attendance + multi-day leave (REPLACES the headcount-number screens)
- **SM4 / TH3 become per-person attendance**, not a single number: a roster with **Present / Absent / Half-day** per person (bulk "All Present" + adjust), **marked manually by Team Head (crew) / Site Manager (site) ONLY** — **no driver/worker clock-in/out, no GPS on attendance.**
- **NEW — Leave Range:** mark a person on leave for a date range (e.g. 15–20 days). Those days auto-show as `leave`; person returns → mark present. (Replaces the worker "leave request" flow — leave is set by TH/SM, not requested by the worker, in P1.)
- **Rollup:** today's headcount per site / per crew is derived from attendance for the Owner (O11) and Site Manager (SM1).
- **Worker W2** now shows the worker's own real attendance + leave (no longer "coming soon").

### 12.3 Vehicle types + driver compatibility + switch approval (EXTENDS O8 / driver screens)
- **NEW — Vehicle Types:** a vehicle has a **type** (Truck/JCB/Crane/Mixer…); the type defines its **metric (KM vs Hours)** and **dynamic input fields**. Owner/Site Manager manage types; adding a type is config, no new screen per type. *(O8 Add/Edit Vehicle gains a "type" selector that drives its fields.)*
- **Driver capability:** each Driver has the **vehicle types he may operate**; assignment is blocked if the vehicle's type isn't allowed.
- **NEW — Vehicle-switch request→approve:** Driver raises a switch request → **Site Manager / Team Head approves** → vehicle reassigned. SM/TH can also assign directly.

### 12.4 Approvals inbox (NEW shared/role screen)
A single **Approvals** screen (Site Manager + Team Head) backed by the generic request engine, handling **vehicle-switch, leave, and material requests**: list of pending requests → approve/reject with note → triggers the change + a notification.

### 12.5 Records expanded (NEW record types)
Add to the daily records (driver + team-head + site-manager as scoped):
- **Trips** — count of trips per driver/machine per day.
- **Material-movement** — quantity of material moved A→B / site→site.
- **Team-Head expense** — ₹ + category + optional receipt photo (see 12.1/§11.2).
- **Scanner** capture available alongside camera/GPS on relevant records.

### 12.6 Export & backup (EXTENDS O16)
- **Excel** export for **Owner + Site Manager** over a chosen window.
- **Windowed import/export** (7-day / 30-day) and **scheduled backups** available in-app.

### 12.7 Net effect on screen list
New/changed vs the original 55: **+** Site-Manager "Add User", Team-Head "Add crew member", per-person Attendance (SM + TH), Leave-range, Vehicle-Type management (within O8), Approvals inbox (SM + TH), Trips, Material-movement, Team-Head Expense. Removed/changed: headcount-number screens → per-person attendance; worker "leave request" → TH/SM-set leave. Final count to be re-tallied during scaffolding.

---

*End of Phase 1 Android Screen Plan.*
