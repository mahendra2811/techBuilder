# Production Deployment — NestJS + (later) Next.js on EC2, systemd + Caddy

> Phase 1: this doc covers **just the backend** on EC2 (frontend stays on Vercel). Phase 2 adds the
> Next.js process to the same box — that section is clearly marked below, do it only once you're
> ready to drop the Vercel dependency for commercial onboarding (see `ARCHITECTURE.md` Phase 2).

## Build strategy — why builds happen OFF the box

The EC2 instance is `t4g.micro` (1GB RAM, Phase 1) — sized to the smallest viable option (see
`ARCHITECTURE.md`). Running any build (`tsc`, let alone `next build`/Turbopack, which is heavier)
directly on a 1GB box risks an OOM kill mid-deploy — exactly the failure mode the user's brief
warned against, and even more likely here than it would be on a larger box. Chosen approach:
**build locally (or in CI), transfer only the build artifacts.** This matters just as much once
Phase 2 resizes to `t4g.small` (2GB) and runs two processes side by side.

- Backend: `tsc` output (`backend/dist/`) + `node_modules` (pure JS, no native rebuild needed on ARM — see `ARCHITECTURE.md`) is small; ship the whole built package.
- Frontend (Phase 2 only): build with `NEXT_OUTPUT_STANDALONE=1` (wired into `web/next.config.ts` in this pass) — produces `.next/standalone/` containing a minimal `server.js` + only the traced `node_modules` subset, small enough to `scp` without installing anything on the box.

`scripts/deploy-backend.sh` (this repo, added in this pass) implements the release-dir + symlink-swap
pattern below and can build either `backend` or `web` — see its `--app` flag.

## One-time server setup

```bash
# Node 22 (matches root package.json's engines.node pin) via NodeSource, ARM64-safe (no native compiles):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Dedicated, unprivileged service user — the app never runs as root or as your login user:
sudo useradd --system --create-home --shell /usr/sbin/nologin techbuilder

# Release directory layout (both apps share this pattern):
sudo mkdir -p /opt/techbuilder/{backend,web}/releases
sudo chown -R techbuilder:techbuilder /opt/techbuilder

# Caddy (see deploy/Caddyfile in this repo for the full config):
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

### Secrets — root-owned env file, `chmod 600`

```bash
sudo install -m 600 -o techbuilder -g techbuilder /dev/null /opt/techbuilder/backend/.env
sudo -u techbuilder nano /opt/techbuilder/backend/.env   # paste production values — see backend/.env.production.example in this repo
```

Only the `techbuilder` system user (and root) can read this file. Never in Git, never in the
systemd unit file directly (`EnvironmentFile=` references the path — see below — rather than
inlining values), never in deploy logs.

### systemd units

Copy this repo's `deploy/systemd/techbuilder-backend.service` (and, Phase 2, `techbuilder-web.service`) to `/etc/systemd/system/`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now techbuilder-backend
sudo systemctl status techbuilder-backend
journalctl -u techbuilder-backend -f   # tail logs
```

Both unit files (see `deploy/systemd/`) set:
- `User=techbuilder`, `Group=techbuilder` — never root.
- `EnvironmentFile=/opt/techbuilder/<app>/.env` — the chmod-600 secrets file.
- `Restart=on-failure`, `RestartSec=5` — automatic restart after a crash.
- `WorkingDirectory=/opt/techbuilder/<app>/current` — the release symlink (see deploy flow below).
- Resource limits (`MemoryMax=`) sized so neither process alone can OOM the whole box.

### Automatic restart after reboot

`systemctl enable` (above) already makes both services start on boot. Verify:

```bash
sudo reboot
# after it comes back:
systemctl is-enabled techbuilder-backend    # → enabled
systemctl is-active techbuilder-backend     # → active
curl -s https://api.example.com/api/v1/health
```

### Timezone

```bash
sudo timedatectl set-timezone Asia/Kolkata
timedatectl   # confirm
```

The app already computes "business day" client-side of the DB using explicit `Asia/Kolkata`
business-date logic (`backend/src/common/business-date.ts`) — it does **not** rely on the OS
timezone for correctness — but setting the box to IST makes `journalctl` timestamps and log
rotation windows match your own working hours, which matters for a one-developer operation.

### Log rotation

systemd's `journald` handles this automatically for anything written to stdout/stderr (which is
where NestJS/Next.js logs go under these unit files) — cap its disk usage:

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
cat <<'EOF' | sudo tee /etc/systemd/journald.conf.d/techbuilder.conf
[Journal]
SystemMaxUse=500M
MaxRetentionSec=30day
EOF
sudo systemctl restart systemd-journald
```

Caddy's own access logs (if enabled in the Caddyfile) rotate via `logrotate` — Ubuntu 24.04 ships
`logrotate` by default; Caddy's Debian package drops a working `/etc/logrotate.d/caddy` config
automatically.

### Disk-space and basic resource monitoring

Simplest viable option for one developer (no CloudWatch agent install/cost needed at this scale):

```bash
# quick manual check
df -h /
free -h

# a minimal daily disk-space check + email-via-cron alternative: a cron job that just logs (or
# alerts through the same nodemailer path the app already uses) if disk usage crosses 80% —
# see scripts/verify-production.sh in this repo, which includes a disk-space assertion you can
# also run on a schedule via cron.
```

For anything beyond this, AWS **CloudWatch Agent** (free tier: basic EC2 metrics like CPU/network
are already collected without the agent; the agent is only needed for memory/disk metrics) is the
next step up — skip it until you actually need alerting beyond what `verify-production.sh` gives you.

## Deploy flow (release dir + symlink swap — zero-downtime, instant rollback)

`scripts/deploy-backend.sh` (this repo) implements:

1. Build **locally or in CI** (never on the box).
2. `scp`/`rsync` the build artifact to `/opt/techbuilder/<app>/releases/<timestamp>/`.
3. Run migrations (backend only, and only if the release includes schema changes — see `db:migrate` step inside the script).
4. Atomically swap `/opt/techbuilder/<app>/current` → the new release directory (a symlink swap is atomic on Linux — there's no window where `current` points to a half-written directory).
5. `systemctl restart techbuilder-<app>`.
6. Run `scripts/verify-production.sh` against the live URL.
7. **If the health check fails, automatically re-point `current` at the previous release and restart** — see the script's rollback branch.

```bash
# from your own machine, having built the release locally already:
./scripts/deploy-backend.sh --app backend --host ec2-user@<EC2_PUBLIC_IP_OR_DOMAIN>
# Phase 2, once the frontend also lives here:
./scripts/deploy-backend.sh --app web --host ec2-user@<EC2_PUBLIC_IP_OR_DOMAIN>
```

## Graceful shutdown

NestJS's default `app.close()` (triggered by systemd's `SIGTERM` on stop/restart) drains in-flight
requests and calls `DbService.onModuleDestroy()` (already implemented — closes the `pg.Pool`
cleanly). `systemd`'s default `TimeoutStopSec` (90s) is generous enough for this; no change needed.

## Rollback procedure

See `ROLLBACK.md` §1 "Application rollback" — in short: re-point the `current` symlink at the
previous release directory (still on disk — the deploy script never deletes old releases
immediately, see its retention policy) and `systemctl restart`.

## Update procedure (routine, no schema change)

```bash
./scripts/deploy-backend.sh --app backend --host ec2-user@<host>
```

## Update procedure (with a new migration)

1. Confirm the migration is additive/backward-compatible if at all possible (the frozen-contracts convention already favors this — see `.claude/rules/contracts-frozen.md`).
2. `scripts/deploy-backend.sh` runs `npm run db:migrate` (using `DATABASE_URL_ADMIN` from the server's `.env`, per the `drizzle.config.ts` fix in this pass) **before** swapping the symlink — if the migration fails, the old release keeps serving traffic, nothing swaps.
3. If a migration must be reverted, see `ROLLBACK.md` §2 "Failed migration handling" — **never auto-rollback a destructive migration** without a verified reverse migration; this is a hard rule.

---

## Phase 2 — Next.js on the same EC2 box

Only do this once you're ready to drop the Vercel Hobby dependency for commercial use (Vercel Hobby
is non-commercial-only — see `VERCEL_TESTING_GUIDE.md`).

1. Build web with standalone output: `NEXT_OUTPUT_STANDALONE=1 npm run build --workspace=web` (locally/CI — see the conditional wired into `web/next.config.ts` in this pass).
2. `cp -r web/public .next/standalone/ && cp -r web/.next/static .next/standalone/.next/` (per Next.js's own documented standalone-output step — the traced bundle deliberately excludes these, expecting a CDN; here Caddy serves them as static files instead).
3. Deploy via the same `scripts/deploy-backend.sh --app web` flow.
4. Start via `deploy/systemd/techbuilder-web.service`, which runs `node .next/standalone/server.js` — **not** `next start` (Next.js explicitly warns `next start` doesn't work with `output: standalone`; the standalone `server.js` is the correct entry point).
5. `web/.env` (production) needs only `BACKEND_ORIGIN=http://localhost:4000` now — same-box, loopback, no TLS needed for this internal hop (Caddy terminates the public-facing TLS for both `app.example.com` and `api.example.com`; the Next→Nest hop never leaves the box).
6. Update DNS: `app.example.com` and `api.example.com` both → the EC2 box's IP (or a stable endpoint — see `deploy/Caddyfile`'s two site blocks, one per subdomain, each auto-provisioning its own Let's Encrypt cert).
7. Remove/pause the Vercel project once traffic is confirmed flowing correctly through EC2 (see `ROLLBACK.md` §6 "DNS rollback" if you need to flip back quickly).
