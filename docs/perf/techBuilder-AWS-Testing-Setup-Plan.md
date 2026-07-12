> **⚠️ SUPERSEDED (2026-07-11) for anything beyond a cheap RDS-only dev test:** see
> `docs/deployment/ARCHITECTURE.md` for the full production-track plan (RDS never public, EC2 from
> day one, proper role bootstrap order). This doc's RDS-only start/stop cost model is still valid
> and referenced from `docs/deployment/COST_AND_SHUTDOWN_CHECKLIST.md` as a cheaper pre-EC2 option —
> but its "Public access: Yes" RDS step is **not** what the production docs do; don't follow that
> step if you're going straight to the full plan.

# AWS Free-Tier Testing Setup — Plan (not yet built)

> **Status: PLANNING ONLY.** Nothing in this doc has been provisioned. Written 2026-07-09 after the [Performance Report](techBuilder-Performance-Report.md) traced the app's slowness to Neon Postgres being in `us-east-1` while the user + backend are in India. This doc captures the AWS option the user is considering for **dev/testing use, before any merchant is onboarded** — budget matters now, won't matter once a merchant is paying.

## Context

- Purpose: **testing only**, not production. Usage pattern: ~4–6 hrs/day, 5–6 days/week, manually started and stopped (no 24/7 uptime needed).
- Once the first merchant is onboarded, budget stops being a constraint — at that point the setup should move to always-on / production sizing (not covered here).
- AWS account: **new account, created now** → falls under AWS's post-2025-07-15 program: **up to $200 in credits, Free-plan window closes after 6 months or when credits run out, whichever is first.** EC2 and RDS are **not** in the "always free" always-on list for new accounts (that changed in July 2025) — they draw down the $200 credit at normal pay-as-you-go rates. This is fundamentally different from the old "12 months of free EC2+RDS hours" deal.

## Recommended shape

| Piece | Choice | Why |
|---|---|---|
| Region | `ap-south-1` (Mumbai) | Physically near India — this is the actual fix for the latency the perf report identified. |
| Database | RDS PostgreSQL `db.t4g.micro`, single-AZ, 20GB gp3 | Cheapest instance class that supports the project's RLS/Drizzle setup. |
| Backend compute | EC2 `t4g.micro` (add in Phase 2, not Phase 1) | Only needed once the backend must be reachable without the developer's own laptop being the origin. |
| Frontend | **Stays on Vercel** | Free, zero setup, already optimized for Next.js — no reason to move it. |
| Media storage | S3 (fills the currently-unwired R2 slot — see `docs/CODEBASE-INDEX.md`) | |
| TLS | Nginx + Certbot on the EC2 box, once EC2 exists | Avoids paying for ALB/CloudFront just to terminate TLS. |
| Explicitly avoid | NAT Gateway, Load Balancer, unattached Elastic IPs | Classic hidden AWS cost traps for a single-instance setup. |

## Staged rollout

1. **Phase 1 — RDS only.** Stand up `db.t4g.micro` in Mumbai. Point the *local* backend (still running on the developer's own PC, as today) at it via `DATABASE_URL`. This isolates the one variable that was actually causing the slowness, at the lowest possible cost, before spending anything on EC2.
2. **Phase 2 — add EC2**, only once the backend needs to be reachable from other devices (phone, demo link) instead of just the developer's laptop.

## Cost model for this usage pattern (start/stop, not 24/7)

AWS bills EC2/RDS **compute per second while running**; only **storage** bills continuously even while stopped.

- Usage: ~90–155 hrs/month running (vs. 730 hrs if left on 24/7) — roughly 15–20% of full-time.
- RDS: ~$2.5–3/mo compute (usage-hours only) + ~$2.3/mo storage (always-on) = ~$5/mo
- EC2 (Phase 2): ~$1.5–1.6/mo compute (usage-hours only) + ~$1/mo EBS (always-on) = ~$2.5/mo
- **Total estimate: ~$7–9/month** (Phase 1 alone: ~$5/month). Treat as an estimate — confirm exact `ap-south-1` rates in the [AWS Pricing Calculator](https://calculator.aws/) before relying on it.
- At this burn rate the $200 credit would technically stretch 20+ months of *spend*, but the account's Free-plan window still closes at 6 months regardless of unused credit. Not expected to matter here since a merchant should be onboarded well within that window.

## Safety habits (recommended, not required)

- **AWS Budgets alert** at $20 / $50 thresholds — catches a forgotten shutdown before it matters.
- **Optional EventBridge scheduled rule** to force-stop EC2 + RDS at a fixed time daily (e.g. midnight IST) as a backstop against forgetting to shut down manually — same pattern as the cron-style automation already used for the cold-email project.

## Known quirk

A **stopped RDS instance auto-restarts on its own after 7 days** if left off continuously. At 5–6 days/week usage this shouldn't matter — only relevant if a full week+ goes by with no testing.

## Open alternative (not chosen, just noted)

Since the actual bug is "DB in the wrong region," check whether **Neon itself offers a Singapore region** on the existing plan before standing up AWS infra — that would be a one-setting change with zero new billing surface. Not pursued yet because the user has chosen to test the AWS path directly; revisit if AWS setup friction outweighs the benefit.

## Next step (when ready to proceed)

✅ **Written:** [`techBuilder-AWS-Onboarding-Steps.md`](techBuilder-AWS-Onboarding-Steps.md) — the exact console steps + commands for Phase 1 (RDS-only), grounded in this repo's actual `db:migrate`/`db:rls`/`seed` scripts and role setup. Not yet executed — pending the user actually running through it.
