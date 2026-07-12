# techBuilder — Deployment Architecture

> Written 2026-07-11 after a full repository audit (see the chat record / commit that introduced this
> doc for the complete Step-1 findings). This is the **production-track** plan: RDS is never public,
> role separation happens before the app ever runs, EC2 is stood up from day one (not "later, if
> needed"). It **supersedes** the dev-only stopgap in `docs/perf/techBuilder-AWS-Testing-Setup-Plan.md`
> and `docs/perf/techBuilder-AWS-Onboarding-Steps.md` (public RDS, start/stop usage, written 2026-07-09
> to fix local-dev latency only) — those docs are marked superseded, not deleted, since their SQL
> role-bootstrap sequence and cost-model math are still correct and reused here.

## Why this shape

The root problem this whole plan fixes: Neon Postgres runs in `us-east-1` (confirmed: `backend/.env`
host `ep-curly-boat-...neon.tech`, and `docs/perf/techBuilder-Performance-Report.md` measured the
resulting latency). Every architecture decision below optimizes for **India-local latency** at
**one-developer operability** and **near-zero idle cost** — nothing here is sized for the traffic
this app will actually get (10–50 users now, a few dozen concurrent within a year).

## Phase 1 — Internal testing (build this first)

```
                         HTTPS                          HTTPS (Bearer token,
   Browser (India) ───────────────▶ Vercel (bom1) ───────── server-to-server) ──▶ EC2 (ap-south-1)
                                    Next.js SSR/                                    NestJS :4000
                                    Route Handlers                                  (behind Caddy :443)
                                    httpOnly cookies                                        │
                                    NEVER calls RDS                                         │ SET LOCAL
                                    directly                                                ▼
                                                                                RDS PostgreSQL (ap-south-1)
                                                                                private subnet, RLS-enforced,
                                                                                only reachable from EC2's SG
```

- **Frontend:** Next.js 16 on **Vercel Hobby**, Function region pinned to `bom1` (Mumbai) via `web/vercel.json`. Vercel Hobby is explicitly a **non-commercial testing deployment only** — see `COST_AND_SHUTDOWN_CHECKLIST.md` and the hard rule against treating it as production.
- **Backend:** NestJS on a single EC2 `t4g.micro` (smallest viable size — Phase 1 runs only this one process), `ap-south-1`, native Node 22 process under **systemd** (not Docker — see "systemd vs Docker" below).
- **Database:** RDS PostgreSQL, `ap-south-1`, `db.t4g.micro`, Single-AZ, **private** (no public accessibility), reachable only from the EC2 security group.
- **No load balancer, no NAT Gateway, no Kubernetes/ECS.** A single EC2 instance behind Caddy is the entire compute layer.

## Phase 2 — First merchant production (add later, same infra)

Same EC2 box also serves the Next.js frontend (`app.example.com`) alongside the API
(`api.example.com`), both behind Caddy. Vercel becomes optional/removed. **Resize the instance up
to `t4g.small` (2GB) first** — stop instance → Change instance type → start, a few minutes, no
rebuild — running two Node processes on the Phase-1 `t4g.micro` (1GB) would OOM. See
`PRODUCTION_DEPLOYMENT.md` for the exact systemd + Caddy config for both processes.

## Component choices + reasoning

| Component | Choice | Why |
|---|---|---|
| Region | `ap-south-1` (Mumbai) exclusively | Physically closest AWS region to users; this alone fixes the diagnosed latency problem. |
| EC2 instance | **`t4g.micro`** (2 vCPU burstable, 1GB RAM), Ubuntu 24.04 LTS ARM64 — smallest/cheapest viable size (chosen 2026-07-11 over the earlier `t4g.small` default) | **Confirmed zero native Node addons** anywhere in `backend/` or `web/` dependency trees (no `bcrypt`, no `sharp`, no native `pg` bindings — password hashing uses Node's built-in `scrypt`). Graviton/ARM64 is fully safe here and ~20% cheaper than the x86 equivalent. Phase 1 runs only NestJS on this box (Vercel hosts the frontend) — 1GB is enough for one Node process + Caddy + OS with reasonable headroom. `t4g.nano` (0.5GB) is cheaper still but not recommended (real OOM risk, no headroom at all). **Resize to `t4g.small` (2GB) before Phase 2** puts a second Node process (Next.js) on the same box — a stop/change-type/start operation, not a rebuild. |
| RDS instance | `db.t4g.micro`, Single-AZ, gp3 20GB | **Already the smallest ARM/burstable RDS instance class AWS offers** — there's no smaller tier to downsize to; this was already at the cost floor. Fits this app's actual load (10–50 users, a few GB/year growth) with margin. Single-AZ is correct at this scale — Multi-AZ roughly doubles cost for redundancy this project doesn't need yet (RDS automated backups + the S3 logical-backup layer already cover the realistic failure modes). |
| RDS version | Latest PostgreSQL RDS supports today (verify in console — was 16.x/17.x as of 2026-07-09 per this repo's own prior research) | **Verify before creating:** Neon currently runs **PostgreSQL 18.4** (confirmed via `docs/PENDING-AND-DEFERRED.md`'s exact `pg_dump` version match). RDS may not yet offer 18.x. Nothing in `shared/src/db/schema.ts` or `shared/src/db/rls.sql` uses PG18-specific syntax (RLS + `FORCE ROW LEVEL SECURITY` have existed since PG9.5/9.5; `security_invoker` views since PG15) — a downgrade to RDS's newest available 16.x/17.x should be schema-compatible, but **run the test suite against it once before trusting that** (`npm run test:integration` — see `DATABASE_MIGRATION.md` §Validation). |
| Reverse proxy | **Caddy** | Automatic HTTPS (Let's Encrypt) with zero manual cert management — the single biggest simplicity win for a one-developer setup. Nginx was the alternative; nothing in this repo needs Nginx-specific features (no complex rewrite rules, no existing Nginx config to migrate from). |
| Process manager | **systemd**, native Node 22 — NOT Docker | See below. |
| Secrets storage | **Root-owned `.env` file, `chmod 600`** — NOT SSM Parameter Store | See below. |
| VPC | **Default VPC** | See below. |

### systemd vs Docker — chose systemd

Compared both as instructed. On a 1GB `t4g.micro` running one Node process plus Caddy (Phase 1):

- **Docker overhead:** the Docker daemon itself reserves ~100–200MB RAM before a single container starts. On a 1GB box that's 10–20% of total RAM gone before the app even starts — an even bigger relative cost than on the original 2GB sizing.
- **No native deps to containerize for.** Docker's biggest win — reproducible builds across OS/arch — doesn't apply here: there's nothing native to compile (confirmed above), so a plain `node dist/main.js` on Ubuntu 24.04 ARM64 is exactly as reproducible as a container, without the daemon tax.
- **Fewer moving parts to operate solo.** systemd is already on the box; Docker Compose adds a second orchestration layer, a second set of logs (`docker logs` vs `journalctl`), and a second update mechanism to keep patched.
- Per the hard rule ("do not add both native systemd and Docker configs unless there is a clear reason to maintain both") — no Dockerfile or docker-compose.yml is included in this deliverable set.

### Secrets: root `.env` (chmod 600) vs SSM Parameter Store — chose `.env`

- SSM Parameter Store's real win is **rotation without redeploying** and **audit trail** — valuable at team scale, not for one developer operating one box.
- SSM adds: an IAM role with `ssm:GetParameters` scoped correctly, a fetch-at-boot script (or `aws ssm get-parameters` wired into the systemd `ExecStartPre`), and a new failure mode (SSM API down/throttled = app can't boot) that a local file never has.
- A root-owned `chmod 600` file that only the app's service user can read (via a dedicated group, or running the app as root's own restricted user — see `PRODUCTION_DEPLOYMENT.md`) is simpler, has zero extra AWS API surface, and is exactly as secure for a single-operator box where SSH access is already the trust boundary.
- **Revisit SSM once there's a second engineer or a second environment** (e.g. staging + prod on separate boxes needing the same secret rotated in both places) — that's the point where the operational cost of `.env` files starts exceeding SSM's setup cost.

### Is the default VPC sufficient?

**Yes.** Reasoning:
- The default VPC already spans all AZs in `ap-south-1` with a public subnet in each — satisfies RDS's requirement for a subnet group spanning ≥2 AZs even for a Single-AZ instance, with no custom subnet/route-table work.
- Isolation between "the internet" and "the database" is achieved with **security groups**, not network topology — RDS's security group only accepts port 5432 from the EC2 security group (by SG-ID reference, not IP), and RDS has "Public access" explicitly set to **No**. This is enough isolation at this scale; a custom VPC with private subnets + a NAT Gateway would add the exact cost/complexity this plan explicitly avoids, for isolation the security groups already provide.
- Reconsider a custom VPC only if a compliance requirement mandates network-level (not just SG-level) isolation, or once there's more than one compute tier that needs segmenting.

## What this plan explicitly does NOT include (and why)

- **NAT Gateway** — EC2 sits in a public subnet with a public IP; it doesn't need outbound-via-NAT because it *is* the internet-facing tier. RDS never needs outbound internet access at all.
- **Load balancer** — one EC2 instance has nothing to balance across. Caddy terminates TLS directly.
- **Kubernetes / ECS** — no orchestration need exists at one-instance scale; the repo gave no technical reason requiring it (no existing container images, no multi-service scaling requirement).
- **Read replicas / Multi-AZ RDS** — not justified at a few dozen concurrent users and a few GB/year growth.
- **Elastic IP left unattached** — always attach it to a running instance (unattached EIPs bill hourly; this is a classic forgotten-cost trap called out explicitly in this plan).

## Related docs
- `AWS_SETUP_GUIDE.md` — console steps + billing safeguards (read before creating anything).
- `DATABASE_MIGRATION.md` — Neon → RDS migration, role/RLS bootstrap order.
- `PRODUCTION_DEPLOYMENT.md` — EC2 systemd + Caddy config, Phase 2 frontend-on-EC2.
- `VERCEL_TESTING_GUIDE.md` — Phase 1 frontend deploy.
- `SECURITY_CHECKLIST.md`, `BACKUP_AND_RESTORE.md`, `ROLLBACK.md`, `COST_AND_SHUTDOWN_CHECKLIST.md`, `DAY_0_TO_40_PLAN.md`.
