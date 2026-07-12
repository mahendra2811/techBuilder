# Backup & Restore

Two independent layers, per the brief's requirement — neither depends on the other being healthy.

> **This repo already has a Neon → Cloudflare R2 backup pipeline** (`backend/scripts/backup-db.sh`,
> `restore-db.sh`, `.github/workflows/backup.yml`, WP-8) — it's currently **broken/unresolved in CI**
> per `docs/PENDING-AND-DEFERRED.md` (a Docker-image-version debug trail, not root-caused). Once the
> DB moves to RDS, that pipeline becomes moot (RDS has its own automated backups; Neon will no
> longer hold the live data) — this doc gives you a **fresh RDS→S3 equivalent** rather than
> debugging the old one. Leave the old Neon scripts in place (harmless, unused) until you're ready
> to delete the Neon project entirely — see `COST_AND_SHUTDOWN_CHECKLIST.md`.

## Layer 1 — RDS automated backups

Already configured if you followed `AWS_SETUP_GUIDE.md` Part D: **7-day retention**, daily
automated snapshot + continuous transaction-log backup (enables point-in-time restore to any
second within the retention window, not just the daily snapshot boundary).

- **To restore:** RDS console → Snapshots (or the instance → "Restore to point in time") → creates a
  **new** DB instance from the snapshot/PITR target — it does not overwrite the running instance.
  Point the app at the new instance's endpoint only after validating it, then decommission the old one.
- This layer protects against: accidental data corruption, a bad migration, instance-level failure.
- This layer does **not** protect against: an AWS `ap-south-1` region-wide event, or an accidental
  RDS instance + all its snapshots being deleted together — that's what Layer 2 is for.

## Layer 2 — Nightly logical backup to S3 (this repo's new scripts)

`scripts/backup-database.sh` (repo root, added in this pass) — runs `pg_dump --format=custom` via
the official `postgres` Docker image (exact version match to the RDS engine — avoids the
client/server version-mismatch class of bug already hit once in this repo's Neon pipeline, per
`docs/PENDING-AND-DEFERRED.md`), uploads to a private S3 bucket in `ap-south-1`.

### One-time setup

1. **S3 bucket:** Console → S3 → Create bucket, `ap-south-1`, name e.g. `techbuilder-backups-<random-suffix>` (bucket names are globally unique). **Block all public access: ON** (all 4 checkboxes). Default encryption: SSE-S3 (or SSE-KMS if you already manage a KMS key).
2. **Lifecycle rule:** bucket → Management → Create lifecycle rule → apply to prefix `backups/` → expire objects after **14 days** (or your preferred retention — matches "at least seven daily backups" with margin).
3. **IAM policy** (attach to the EC2 instance role from `AWS_SETUP_GUIDE.md` Part C1, or a dedicated CI-only IAM user if running this from GitHub Actions instead of the EC2 box):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
       "Resource": [
         "arn:aws:s3:::techbuilder-backups-<suffix>",
         "arn:aws:s3:::techbuilder-backups-<suffix>/backups/*"
       ]
     }]
   }
   ```
4. **Env vars the scripts need** (server `.env`, or GitHub Actions secrets if run from CI instead):
   ```bash
   DATABASE_URL_ADMIN=postgresql://postgres:<MASTER_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder
   BACKUP_S3_BUCKET=techbuilder-backups-<suffix>
   AWS_REGION=ap-south-1
   PG_MAJOR=17   # match whatever RDS engine major version you actually created — verify, don't assume 18
   ```
   On the EC2 box (with the instance IAM role attached), no `AWS_ACCESS_KEY_ID`/`SECRET` is needed —
   the AWS CLI/SDK picks up the instance role automatically. Running from GitHub Actions instead
   needs an IAM user's access keys as repo secrets (same pattern as the existing `backup.yml`, just
   pointed at S3 + the new IAM user instead of R2).

### Run it

```bash
DATABASE_URL_ADMIN="..." BACKUP_S3_BUCKET="techbuilder-backups-<suffix>" AWS_REGION="ap-south-1" \
  ./scripts/backup-database.sh
```

Cron it nightly on the EC2 box (outside the 20:00 IST EOD cutoff / field-entry hours):

```bash
# crontab -e (as the techbuilder service user, or root with sudo -u techbuilder)
30 20 * * * DATABASE_URL_ADMIN="..." BACKUP_S3_BUCKET="..." AWS_REGION="ap-south-1" /opt/techbuilder/backend/current/../../../scripts/backup-database.sh >> /var/log/techbuilder-backup.log 2>&1
```
(Adjust the script path to wherever you actually keep the repo/scripts on the box — e.g. a
dedicated `/opt/techbuilder/ops/` checkout, separate from the app release directories.)

### Restore drill (do this once before merchant onboarding — it's in `DAY_0_TO_40_PLAN.md`)

```bash
./scripts/restore-database.sh --key backups/techbuilder-2026-07-15T20-30-00Z.dump \
  --target "postgresql://postgres:<pw>@<A-THROWAWAY-RDS-OR-LOCAL-TARGET>/techbuilder"
```

**Never pass your production endpoint as `--target`** — the script's own confirmation prompt exists
specifically to catch this, but the discipline is: always restore into a throwaway target first
(a temporary RDS instance, or a local/Docker Postgres) and validate row counts before ever
considering the dump "trustworthy."

### Verification after any restore

```bash
psql "$TARGET" -c "select count(*) from users;"
psql "$TARGET" -c "select count(*) from expenses;"
psql "$TARGET" -c "select max(created_at) from attendance;"   # confirms recency, not just row presence
```
Compare counts against what you expect from the source at backup time.

## Failed-backup detection

`scripts/backup-database.sh` exits non-zero on any failure (strict shell mode) and asserts the dump
file is non-empty before uploading — a cron failure shows up as a non-zero exit in `/var/log`; wire
a simple check (e.g. `verify-production.sh`'s pattern, or a one-line `mail`/existing SMTP path) if
you want an active alert rather than checking logs manually. At 10–50 users, a weekly manual glance
at the S3 bucket's object list (confirming a file landed for each of the last 7 nights) is a
reasonable minimum cadence for a one-developer operation.
