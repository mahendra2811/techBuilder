# Research Prompt #1 — "Research before the mega plan"

> **How to use this:** copy everything inside the `=== PROMPT ===` block below and paste it into a web-connected AI (Perplexity, or Claude/ChatGPT with web access). Bring its answer back here — it becomes the input for the mega plan. The prompt is self-contained: it carries all the context the research AI needs.

---

=== PROMPT ===

You are a **senior product, market, and software-architecture researcher with live internet access**. Your job is to pressure-test and enrich a product plan I have already designed, by researching the real-world landscape. Be **curious, skeptical, and thorough**. Cite sources (URLs). Distinguish verified fact from your opinion. Flag anything you're unsure about. Do **not** invent competitors, prices, or features — if you can't verify, say so.

## Part A — First, show me you understand what I'm building

Before any research, **restate the project below in your own words** (concise), then give an **honest first verdict**: is what I've locked sound, or are there gaps/risks I should reconsider *before* I finalize? Be direct.

### The project: "techBuilder"
A **mobile app for running a construction company's day-to-day field operations** — a *records + visibility* tool that replaces the WhatsApp + paper + Excel chaos most Indian construction SMBs use today. The field and managers log simple daily records; the Owner sees clean, rolled-up status and analytics across all sites and vehicles, and exports it.

**What it is (and is not):** It is NOT a heavy project-management/BIM/estimation tool. It is a **daily operational logbook + role-based workflow + owner dashboard**. Think: "structured WhatsApp + attendance register + vehicle logbook + expense sheet," in one app, in Hindi.

### What I have already LOCKED (decisions made)
- **Platform:** Android app (Expo / React Native), Hindi-first + English. Web/iOS later.
- **Customer model:** **managed/agency** — *I* (the developer) onboard each construction company by hand (take payment offline, create their org + an Owner login, hand it over). No self-signup, no in-app payment, no OTP in this phase. After onboarding, **everything is self-service inside the app.**
- **One company at a time** (single-tenant in practice), but built **multi-tenant-ready** (`orgId` on all data) so it can scale to many companies on one backend later.
- **Architecture:** one reusable **engine** (all shared logic + screens) + **one app codebase**; a new company = a small **config file + assets**, never a code fork. Inspired by how headless e-commerce "storefront builders" reuse one engine across many brands.
- **Adapter pattern:** screens talk to an interface, not the backend — so I build the whole app on mock data first, then plug in the real API with zero screen changes.
- **5 roles:** **Owner** (sees/analyses everything), **Site Manager** (runs one site), **Team Head / Mistri** (crew leader), **Driver** (logs his vehicle), **Worker** (view-only this phase).
- **Self-service org management:** account creation cascades **Owner → Site Manager → Team Head** (each creates users within their scope). Owner also creates sites + vehicles.
- **Vehicles are type-driven:** a vehicle's *type* (truck / JCB / crane…) decides what it tracks — **KM vs Hours** + custom fields — as config, not code. Drivers are restricted to vehicle types they can operate. A **request→approval** workflow handles vehicle switches, leave, and material requests.
- **Attendance:** per-person present / absent / half-day + multi-day leave ranges, **marked manually by Team Head / Site Manager only** — **no clock-in/out, no GPS punch** (deliberately simple; many workers share/lack phones).
- **Daily records (entered end-of-day, not real-time):** site progress notes + photos, headcount, **expenses** (incl. Team Head buying food/supplies), fuel (₹ + liters + receipt), vehicle start/end logs, **trips**, **material usage + material movement** (e.g. cement bags moved site→site), issues/breakdowns. Capture via **camera, QR/barcode scanner, GPS geotag** (GPS on records/photos, not attendance).
- **Roll-up:** every record entered once at the bottom flows **up** to the Site Manager and Owner automatically. Owner consumes + analyses + exports; never enters daily data.
- **Reports:** **Excel export** (primary) + occasional PDF; **client-side** generation (no heavy server). Windowed (7/30-day) import/export + backups. (Reports are mostly numbers/English; Hindi appears only in free-text remarks.)
- **Tech stack — frontend:** Expo SDK 55, Expo Router, NativeWind (Tailwind), TypeScript, npm; Zustand + TanStack Query + a custom offline outbox; **expo-sqlite** for offline-first (NOT PowerSync); **expo-camera** + watermark + image compression; i18next (Hindi/English); SheetJS + expo-print for export; Cloudflare R2 for files; Expo Notifications + FCM.
- **Tech stack — backend:** **NestJS + Drizzle ORM + PostgreSQL (Neon) + Cloudflare R2.** One backend + one Postgres, **shared-schema multi-tenant with Row-Level Security** (`org_id` everywhere). JWT manual login. Server-side role-based access control. Deliberately **no Redis/queues, no real-time sockets, no server-side PDF** in this phase (to stay lean — target infra cost ~₹0–500/month).
- **Offline-first** is core: construction sites have poor connectivity; writes go local → sync when online.

## Part B — Now research the landscape (this is the main job)

Investigate the open internet and report findings on all of the following. Prefer recent (2023–2026) sources. Name real products, real features, real pricing where you can.

1. **Direct competitors — construction field-ops / site-management apps**, especially India-focused SMB ones, but also global. For each: target user, key features, pricing, offline support, languages, strengths, weaknesses, what they do that I don't, what I do that they don't. (Look for things like Indian construction-management/labour-attendance/site-reporting apps, and global ones for field crews.)
2. **What do these competitors do *differently* from my approach** (e.g. do they use GPS clock-in, real-time tracking, payroll, BIM, procurement)? Where is my "deliberately simpler / records-only / agency-onboarded" approach an advantage vs a weakness?
3. **The SAME pattern in OTHER industries** — find software in *non-construction* fields that uses the same shape: **field workforce + role hierarchy + offline mobile data entry + end-of-day records that roll up to an owner/manager dashboard.** Candidates to investigate: facility management & cleaning, agriculture/farming & plantations, logistics & fleet/driver management, mining, field service (HVAC/solar/telecom), security-guard management, event/contract staffing, NGO/field-survey data collection, manufacturing shop-floor. For each relevant one: what platforms exist, what features translate to my product, what clever ideas I can borrow.
4. **The "one engine, many tenants/brands, config-driven onboarding" productization pattern** — who does this well in *vertical SaaS* (any industry)? What can I learn about onboarding new clients fast, white-labeling, and propagating engine updates?
5. **Feature gaps & possibilities** — based on 1–4, what features do similar tools have that I have NOT planned, that would matter for a construction SMB? Split into: (a) should-add-now, (b) nice-later, (c) deliberately-skip-and-why.
6. **Tech & architecture validation** — research best practices and pitfalls for: offline-first mobile data sync (expo-sqlite + custom outbox vs alternatives), multi-tenant Postgres RLS, dynamic/type-driven forms, approval workflows, and **UX for low-literacy / vernacular field workers on low-end Android**. Is my stack a good fit? What commonly goes wrong?
7. **India market reality** — construction SMB digitization in India: adoption barriers, what's actually working, vernacular/voice needs, low-end device constraints, and whether the "agency onboards each company manually" model is sensible vs self-serve.

## Part C — Critical questions to answer explicitly
- Is the plan I locked **sound and complete enough to start building**, or are there must-fix gaps?
- What am I **missing** that real users in this space need?
- What are the **top risks** (product, technical, market) and how do similar players mitigate them?
- If you had to **change 3 things** about my plan, what and why?
- What should I **deliberately NOT build** (scope discipline)?

## Part D — Output format (return your answer like this)
1. **Understanding & verdict** (Part A restated + your honest first take).
2. **Competitor table** (construction) — columns: product · region · users · key features · pricing · offline · languages · notable strengths/weaknesses.
3. **Cross-industry analogues table** — industry · example products · the transferable idea.
4. **Feature gap analysis** — add-now / later / skip, with reasons.
5. **Tech & architecture findings** — validation + pitfalls + recommendations.
6. **India market notes.**
7. **Top risks + mitigations.**
8. **"If I were you, I'd change these 3 things."**
9. **Sources** — list of URLs you used, grouped by section.

Be specific and concrete. I will feed your answer into the next planning step, so make it actionable, not generic.

=== END PROMPT ===
