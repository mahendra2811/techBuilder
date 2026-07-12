# Rollback & Disaster Recovery

## 1. Application rollback (backend or web, on EC2)

`scripts/deploy-backend.sh` never deletes old release directories immediately (keeps the last 5 by
default — see the script's `RELEASES_TO_KEEP` var). To roll back:

```bash
# on the EC2 box (via SSM Session Manager or SSH)
ls -la /opt/techbuilder/backend/releases/            # find the previous timestamped release
sudo ln -sfn /opt/techbuilder/backend/releases/<previous-timestamp> /opt/techbuilder/backend/current
sudo systemctl restart techbuilder-backend
curl -s http://localhost:4000/api/v1/health
```
Same pattern for `web` (Phase 2), swapping the path/service name. This is the same symlink-swap the
deploy script itself uses — rollback is just doing the swap backwards, and `scripts/verify-production.sh`
run right after confirms it worked.

## 2. Failed migration handling

**Never auto-rollback a destructive migration without a verified reverse migration** — this is a
hard rule, not a suggestion. Concretely:

- If `npm run db:migrate` fails mid-way: `scripts/deploy-backend.sh` aborts the deploy **before**
  swapping the release symlink (the old code + old schema keep serving traffic — nothing user-facing
  breaks). Fix the migration file, re-run.
- If a migration **succeeded** but is now known to be wrong (e.g. a bad column default): write a
  new forward migration that corrects it — do not attempt to hand-edit drizzle's migration history
  or manually `DROP`/`ALTER` in production without a written, reviewed reverse migration first.
- If data was already written under the new (wrong) schema before you noticed: a schema-only revert
  can silently orphan or truncate that data — restore from the most recent Layer-2 S3 backup
  (`BACKUP_AND_RESTORE.md`) into a throwaway target, diff/recover the affected rows there, then
  decide a targeted fix — don't blind-restore over production without that intermediate step.

## 3. Database snapshot/restore rollback

- **RDS automated snapshot / point-in-time restore:** RDS console → your instance → "Restore to
  point in time" — this always creates a **new** instance, never overwrites the running one. Update
  `backend/.env`'s `DATABASE_URL`/`DATABASE_URL_ADMIN` to the new instance's endpoint only after
  validating it (`DATABASE_MIGRATION.md` Step 6's checklist), then decommission the old instance.
- **Logical (S3) restore:** `scripts/restore-database.sh --target <throwaway>` — see
  `BACKUP_AND_RESTORE.md`. Never targets production directly without the confirmation prompt.

## 4. Logical backup restore

Covered above and in `BACKUP_AND_RESTORE.md` — repeated here for the checklist format: confirm the
object exists in S3 (`aws s3 ls s3://<bucket>/backups/`), restore into a throwaway target, validate
row counts/recency, only then consider promoting.

## 5. DNS rollback

If `app.example.com`/`api.example.com` were repointed to EC2 (Phase 2) and something's wrong:
revert the DNS `A`/`CNAME` record back to Vercel's target (note Vercel's assigned value **before**
switching, so you have it to revert to) or back to the previous EC2 IP if you just changed
instances. DNS TTL determines how fast this propagates — set a short TTL (e.g. 300s) **before** any
planned cutover specifically so a rollback is fast if needed; a long-TTL record you forgot to
lower ahead of time is the actual risk here, not the rollback mechanism itself.

## 6. Vercel rollback

Vercel dashboard → Project → Deployments → find the last-known-good deployment → **Promote to
Production** (or "Instant Rollback" if shown) — Vercel keeps every deployment addressable
indefinitely by default; this is a near-instant, zero-downtime action, no rebuild needed.

## 7. EC2 replacement

If the instance itself is unhealthy beyond a simple restart:
1. Launch a new `t4g.micro` (or whatever size the box had been resized to — check current instance type first) in the same subnet/AMI/security groups (`AWS_SETUP_GUIDE.md` Part C).
2. Attach the same IAM role (Part C1).
3. Re-run the one-time server setup (`PRODUCTION_DEPLOYMENT.md`'s "One-time server setup") on the new box.
4. Restore the `.env` secrets file from your password manager (never from a backup that might be stale — re-derive/re-paste the current values).
5. Deploy the current release via `scripts/deploy-backend.sh` (targets the new host).
6. Update the RDS security group (`techbuilder-rds-sg`) — if you referenced the EC2 SG by ID (as instructed), **no change needed here** as long as the new instance is placed in the same `techbuilder-ec2-sg`; this is exactly why the SG-ID-based rule was chosen over an IP-based one.
7. Update DNS/Elastic IP association to the new instance.
8. Terminate the old instance only after the new one is verified (`scripts/verify-production.sh`).

## 8. RDS credential rotation

```sql
-- connect as master:
ALTER ROLE techbuilder_app WITH PASSWORD '<new-strong-password>';
```
Update `backend/.env`'s `DATABASE_URL` with the new password, then:
```bash
sudo systemctl restart techbuilder-backend
```
Existing connections in the pool are dropped and re-established with the new password on next use;
no downtime beyond the restart itself (a few seconds). Rotate the master (`postgres`) password the
same way, updating `DATABASE_URL_ADMIN` — this one is used only by migration/backup scripts, not by
the always-running app, so its rotation has zero runtime impact.

## 9. Lost SSH-key recovery

- If you set up **SSM Session Manager** (recommended, `AWS_SETUP_GUIDE.md` Part C2): you never
  needed the SSH key for day-to-day access — connect via Session Manager regardless of the lost key.
- If SSH was the only access path: EC2 console → Instance → **no built-in "reset key" for a running
  instance**. Options: (a) if SSM was attached to the IAM role even if unused, enable Session Manager
  access now and use it to add a new key to `~/.ssh/authorized_keys`; (b) stop the instance, detach
  its root EBS volume, attach it as a secondary volume to a temporary instance, edit
  `authorized_keys` there, reattach, restart. Prefer (a) — this is exactly why the IAM role in Part
  C1 includes `AmazonSSMManagedInstanceCore` even if you plan to primarily use SSH.

## 10. Expired TLS certificate troubleshooting

Caddy auto-renews Let's Encrypt certs well before expiry (starts renewal at 30 days remaining) and
retries on failure — an actually-expired cert almost always means Caddy itself couldn't reach the
ACME server or complete the HTTP-01 challenge (e.g. port 80 got blocked, or DNS pointed elsewhere).
```bash
sudo systemctl status caddy
sudo journalctl -u caddy -n 100 --no-pager | grep -i cert
sudo caddy reload --config /etc/caddy/Caddyfile   # re-trigger without a full restart
```
Confirm port 80 is still open in `techbuilder-ec2-sg` (needed for HTTP-01 challenges even though
end-user traffic is all HTTPS) and DNS still points at this instance.

## 11. Out-of-disk recovery

```bash
df -h /
sudo du -sh /opt/techbuilder/*/releases/*   # old releases are the most likely culprit
sudo journalctl --vacuum-size=200M          # trim journald logs if they've grown past the configured cap
```
`scripts/deploy-backend.sh`'s release retention (keeps last 5) should prevent this in steady state —
if disk still fills, check for an unexpectedly large `node_modules` in a release, or Caddy access
logs that outgrew their logrotate config.

## 12. Out-of-memory recovery

```bash
free -h
sudo systemctl status techbuilder-backend techbuilder-web caddy
dmesg | grep -i "killed process"   # confirms an actual OOM-kill, not just a crash
```
The systemd units' `MemoryMax=` settings (see `deploy/systemd/*.service`) are sized so one runaway
process gets killed and restarted (`Restart=on-failure`) rather than taking the whole box down via
swap thrashing. If OOM-kills recur under normal (not runaway) load on the Phase-1 `t4g.micro`
(1GB), the next step up is `t4g.small` (2GB) — the same resize this plan already expects at the
Phase-2 frontend-on-EC2 transition, just done earlier than planned. A simple instance-type change
(stop → change instance type → start), not an architecture change; bump `MemoryMax` afterward too.
