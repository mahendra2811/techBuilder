# techBuilder — Backend & Database (Phase 1)

> The real backend + Postgres, built properly. **Low budget ≠ cheap/hacky** — this is the best-practice stack done lean.
> The frontend talks to this through the engine's **`rest` adapter** (same interface as the `mock` adapter, so screens never change).
> Stack: **NestJS + Drizzle + PostgreSQL (Neon) + Cloudflare R2**. Versions pinned via `ctx7` at scaffold.

---

## 1. Architecture & principles
- **One backend + one Postgres, shared-schema multi-tenant.** Every table has `org_id`; **Row-Level Security (RLS)** enforces `org_id = current_org` on every query. Onboarding a company = insert one `orgs` row — no new DB.
- **Auth:** manual login (no OTP/signup/payment). `POST /auth/login` → **JWT** carrying `{ userId, orgId, role }`. First login forces change-password.
- **RBAC enforced server-side** (NestJS guards) using **role + scope** (`org` / `own-site` / `own-crew` / `own`), mirroring the engine's `can()`. Client `can()` = UX; server guard = the real security gate.
- **Tenant context:** a NestJS middleware reads `orgId` from the JWT and runs `SET LOCAL app.current_org = $orgId` at the start of each request → RLS does the rest, even for raw SQL.
- **NOT in Phase 1** (keeps it cheap/simple): no Redis/BullMQ, no Socket.io/real-time, no server-side Puppeteer/PDF. Exports are client-side; the backend just serves clean aggregated data.

## 2. Hosting & budget
| Piece | Service | Cost |
|---|---|---|
| Database | **Neon** (free 0.5 GB, scale-to-zero) → Launch $19 when needed | ₹0 |
| API | **Railway / Render / Fly.io** hobby, or ~$5 Docker VPS | ₹0–₹500/mo |
| Files | **Cloudflare R2** (10 GB free, zero egress) | ₹0 |
| **Total Phase 1** | | **~₹0–₹500/mo** |

---

## 3. Database schema (Postgres — every table: `id uuid pk`, `org_id`, `created_at`, `updated_at`, RLS by `org_id`)

### Identity & org
```
orgs          (id, name, brand jsonb, languages text[], status)
users         (id, org_id, name, phone, photo_url,
               role: owner|site-manager|team-head|driver|worker,
               username UNIQUE-per-org, password_hash, must_change_password bool,
               assigned_site_id?, crew_id?, allowed_vehicle_type_ids uuid[],   -- driver
               emergency_contact?, daily_wage?, active bool, created_by)
sites         (id, org_id, name, address, lat, lng, start_date, expected_end_date,
               budget, status: active|paused|done, site_manager_id?)
crews         (id, org_id, site_id, team_head_id, name)
```

### Vehicles (type-driven)
```
vehicle_types (id, org_id, name, metric: km|hours,
               fields jsonb)               -- [{key,label,type,required}] → dynamic inputs, config not code
vehicles      (id, org_id, vehicle_type_id, name, plate,
               values jsonb,               -- values for the type's fields
               assigned_site_id?, assigned_driver_id?, status: active|idle|maintenance)
vehicle_docs  (id, org_id, vehicle_id, kind: rc|insurance|puc, photo_url, expiry)
```

### Assignment history (audit-safe)
```
assignments   (id, org_id, kind: user-site|driver-vehicle|worker-crew|vehicle-site,
               subject_id, target_id, effective_from, effective_to?, by)
```

### Attendance (per-person, manual, no GPS/clock-in)
```
attendance    (id, org_id, site_id, crew_id?, user_id, date,
               status: present|absent|half-day|leave, marked_by)   -- UNIQUE(org_id,user_id,date)
                                                                    -- marked_by ALWAYS team-head/site-manager
leave_ranges  (id, org_id, user_id, start_date, end_date, reason, status)  -- auto-fills attendance as 'leave'
```

### Records (typed → clean aggregation for dashboards)
```
vehicle_logs       (id, org_id, vehicle_id, driver_id, site_id, date,
                    type: start|end, reading, photo_url, gps?, ts)
fuel_entries       (id, org_id, vehicle_id, driver_id, date, amount, liters, receipt_url, gps?, ts)
expenses           (id, org_id, site_id, crew_id?, vehicle_id?, submitted_by,
                    category: material|fuel|labor|food|transport|repair|other,
                    amount, description, receipt_url?, date)        -- incl. Team-Head expenses
trips              (id, org_id, vehicle_id, driver_id, site_id, date, count, note?)
material_usage     (id, org_id, site_id, logged_by, material_type, quantity, unit, date, photo_url?)
material_movements (id, org_id, from_site_id, to_site_id?, material_type, quantity, unit, vehicle_id?, date)
material_requests  (id, org_id, site_id, requested_by, material_type, quantity,
                    urgency, needed_by, status: pending|approved|rejected|fulfilled)
issues             (id, org_id, site_id, vehicle_id?, reported_by, title, description,
                    severity: low|medium|high|critical, category, status: open|in-progress|escalated|resolved, photo_ids[])
daily_reports      (id, org_id, site_id, author_id, date, summary, worker_count, expense_total)
progress_updates   (id, org_id, site_id, milestone, percentage, photo_url?, by, date)
```

### Workflow & system
```
requests      (id, org_id, type: vehicle-switch|leave|material, requested_by, payload jsonb,
               status: pending|approved|rejected, approver_id?, decided_by?, decided_at?)
notifications (id, org_id, user_id, type, title, body, ref_id?, is_read bool)
media         (id, org_id, url, thumb_url, kind: photo|scan, gps?, watermark jsonb,
               captured_by, captured_at, ref_type, ref_id)
audit_log     (id, org_id, actor_id, action, entity, entity_id, at)
```

**Indexes:** composite `(org_id, <frequently-queried col>)` on hot paths — e.g. `(org_id, site_id, date)` on records, `(org_id, user_id, date)` on attendance, `(org_id, status)` on requests. Keeps RLS overhead negligible and dashboards fast.

**RLS pattern (every table):**
```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <t>
  USING (org_id = current_setting('app.current_org')::uuid);
```

---

## 4. API surface (matches the engine's adapter interfaces)
- **Auth:** `POST /auth/login`, `POST /auth/change-password`
- **Users:** `POST /users` (create + temp password, scope-checked), `GET /users`, `PATCH /users/:id`
- **Sites / Vehicles / Types:** standard CRUD, scope-checked
- **Assignments:** `POST /assignments` (validates driver↔vehicle-type compatibility)
- **Attendance:** `POST /attendance` (bulk per-day), `GET /attendance?date&site`, `POST /leave-ranges`
- **Records:** typed endpoints — `POST /expenses`, `/fuel`, `/vehicle-logs`, `/trips`, `/material-usage`, `/material-movements`, `/issues`, `/daily-reports`, `/progress` (+ `GET` with filters)
- **Requests (approval engine):** `POST /requests`, `POST /requests/:id/approve|reject`, `GET /requests?status`
- **Dashboards/rollups:** `GET /dashboard/owner`, `/dashboard/site/:id`, analytics (spend-by-category, fleet, headcount) — these also feed **client-side export** (the app turns the JSON into Excel via SheetJS).
- **Media:** `POST /media/presign` → presigned R2 URL (client uploads directly), then record the `media` row.
- **Notifications:** `GET /notifications`, `PATCH /notifications/:id/read`

Every endpoint passes through: **JWT auth → tenant middleware (`SET LOCAL app.current_org`) → RBAC guard (role+scope) → service → Drizzle → Postgres (RLS)**.

## 5. How it connects to the frontend
- The engine's **`rest` adapter** implements `RecordsClient` / `AuthClient` against these endpoints.
- Dev uses the **`mock` adapter**; switching `backend: 'rest'` in config flips to this API — **zero screen changes** (the whole point of the adapter).
- Multi-tenant-ready already: even though P1 is one org per onboarded merchant, all rows are `org_id`-scoped, so a future self-serve flip needs only a registration endpoint + org-provisioning — no schema change.

---

*Schema + API are the contract. Next: scaffold Drizzle schema + migrations + RLS policies, then the NestJS modules (auth, users, sites, vehicles, attendance, records, requests, dashboards) — or build the frontend against the `mock` adapter first and stand this up in parallel.*
