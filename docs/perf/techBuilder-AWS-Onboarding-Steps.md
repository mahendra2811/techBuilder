# AWS Onboarding — Step-by-Step (Phase 1: RDS in Mumbai)

> Executes the plan in [`techBuilder-AWS-Testing-Setup-Plan.md`](techBuilder-AWS-Testing-Setup-Plan.md). Read that doc first for the *why* and the cost model. This doc is the *how* — exact console clicks + exact commands, grounded in this repo's actual scripts (`backend/package.json`, `shared/src/db/rls.sql`, `backend/sql/auth.sql`).
>
> Goal of Phase 1: move only the database to `ap-south-1` (Mumbai) and point your local backend at it. Nothing else changes. EC2 (Phase 2) comes later, only if you need the backend reachable without your laptop.

---

## Part A — Account setup (one-time)

1. **Create the AWS account** at aws.amazon.com if you don't have one. Use an email you control; you'll be asked for a card (required even for the credit program, not charged unless you exceed it).
2. **Do not use the root account day-to-day.** In IAM, create yourself an **IAM user** with `AdministratorAccess` policy attached (or use IAM Identity Center), and **enable MFA on both root and this user**. Log in as this user going forward.
3. **Set a budget alert immediately, before creating anything:**
   - Console → **Billing and Cost Management → Budgets → Create budget**
   - Type: *Cost budget*, amount **$20**, alert at 80%/100% to your email. Add a second one at $50 as a backstop.
4. Confirm your account is on the new credit program (mentioned in the plan doc): **Billing → Credits** should show up to $200, with a 6-month clock. Note the expiry date somewhere.

---

## Part B — RDS PostgreSQL in Mumbai (the actual fix)

### B1. Create the instance

Console → switch region (top-right) to **Asia Pacific (Mumbai) `ap-south-1`** → **RDS → Create database**.

| Field | Value |
|---|---|
| Creation method | Standard create |
| Engine | PostgreSQL |
| Version | Latest available (16.x or 17.x — whatever the console offers in this region) |
| Templates | Free tier (if offered) or Dev/Test |
| DB instance identifier | `techbuilder-dev` |
| Master username | `postgres` |
| Master password | Generate a strong one, save it in a password manager — **never commit it** |
| Instance class | `db.t4g.micro` (burstable, ARM, cheapest that fits) |
| Storage | gp3, 20 GiB, **disable storage autoscaling** |
| Multi-AZ | **No** (single-AZ — this is a test DB) |
| Connectivity → Public access | **Yes** (Phase 1 keeps the backend on your laptop, so it must be reachable from your home/office IP) |
| VPC security group | Create new → name it `techbuilder-dev-sg` |
| Availability Zone | any |
| Database port | 5432 (default) |
| Initial database name | `techbuilder` — **must set this**, matches the app's connection strings |
| Backup retention | 1 day (minimize storage cost; this is test data) |
| Enhanced monitoring | **Off** |
| Performance Insights | **Off** |
| Deletion protection | **Off** (you may want to tear this down and recreate) |

Click **Create database**. Takes a few minutes to reach "Available".

### B2. Lock down the security group (do this before anything else touches the DB)

1. RDS → your instance → note the **Endpoint** (`techbuilder-dev.xxxxxxxxxx.ap-south-1.rds.amazonaws.com`).
2. EC2 → **Security Groups** → `techbuilder-dev-sg` → **Inbound rules → Edit**.
3. Add rule: Type `PostgreSQL` (port 5432), Source = **My IP** (console auto-fills your current public IP as a `/32`). **Never use `0.0.0.0/0`.**
4. If your home ISP gives you a dynamic IP, you'll need to re-edit this rule when it changes (symptom: connection suddenly times out that worked yesterday — check `https://checkip.amazonaws.com` and update the rule).

### B3. Create the two DB roles (mirrors what's already running on Neon)

Connect as master and set up the app role + grants. From your machine:

```bash
psql "postgresql://postgres:<MASTER_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder"
```

Run (this is exactly the block documented at the top of `shared/src/db/rls.sql`):

```sql
CREATE ROLE techbuilder_app LOGIN PASSWORD '<APP_PASSWORD>' NOSUPERUSER NOBYPASSRLS;
-- (grants on tables happen in B4, after migrations create the tables)
```

Pick `<APP_PASSWORD>` now (different from the master password) — you'll need it in `.env` shortly.

### B4. Run migrations + RLS + grants against RDS

All commands from `backend/`. The key trick: `drizzle-kit migrate` (via `db:migrate`) reads `DATABASE_URL` directly, so **`DATABASE_URL` must temporarily be the master/owner connection** while you migrate — only after that do you flip it to the restricted app role for actual runtime use.

```bash
cd backend

# 1) Point DATABASE_URL at the MASTER connection temporarily (edit .env, or export inline):
export DATABASE_URL="postgresql://postgres:<MASTER_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder"
export DATABASE_URL_ADMIN="$DATABASE_URL"

# 2) Apply the existing migration files (0000..0003 already committed — no db:generate needed)
npm run db:migrate

# 3) Apply RLS policies + the auth_lookup() function (uses DATABASE_URL_ADMIN)
npm run db:rls
```

Now grant the app role its table privileges and function access — the tables exist now, and this line in `backend/sql/auth.sql` is **deliberately left commented out** in the frozen file (must be run by hand once per database):

```sql
-- still connected as master via psql:
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO techbuilder_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO techbuilder_app;
GRANT EXECUTE ON FUNCTION auth_lookup(text) TO techbuilder_app;
```

### B5. Flip `.env` to the real runtime shape, seed, and start

Edit `backend/.env` for real now (not just exported vars):

```bash
DATABASE_URL=postgresql://techbuilder_app:<APP_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder
DATABASE_URL_ADMIN=postgresql://postgres:<MASTER_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder
```

```bash
npm run seed              # runs as techbuilder_app — sets app.org_id itself, no bypass needed
npm run build && npm start
```

### B6. Verify

- `curl http://localhost:4000/api/v1/health` → fast, no DB.
- Log in via the web app (`devco`/owner seed creds) and confirm dashboards load — this is the actual test: compare load time against the old Neon `us-east-1` numbers in `techBuilder-Performance-Report.md` (dashboard was 6.2s warm). Should now be a fraction of that, since round-trip latency drops from ~300ms to India-internal (~5–15ms).
- Optional but recommended given how much RLS matters here: `npm run test:integration` against this RDS instance to re-prove the same 19 checks that passed on Neon (cross-tenant isolation, RBAC scope, etc.) — new DB, worth reproving once.

### B7. Cost/usage habits

- **Stop the instance** (RDS console → Actions → Stop, or schedule it) when you're not actively testing — compute stops billing, only the 20GB storage (~$2.3/mo) keeps billing.
- **Known quirk:** AWS auto-restarts a stopped RDS instance after 7 continuous days off. If you skip a full week of testing, check it hasn't silently restarted (and start billing compute) before assuming it's stopped.
- Re-confirm real `ap-south-1` rates in the [AWS Pricing Calculator](https://calculator.aws/) if you want exact numbers beyond the plan's ~$5/mo estimate.

---

## Part C — Phase 2: EC2 (later, only when needed)

Only do this once you need the backend reachable from something other than your laptop (a phone over mobile data, a demo link for someone else). Skip entirely if Phase 1 alone fixes the perceived slowness for your own testing.

1. EC2 → **Launch instance**, `ap-south-1`, AMI = Amazon Linux 2023, type `t4g.micro`, new key pair (download the `.pem`, keep it safe).
2. Security group: inbound `22` (SSH) from **My IP** only, `80`/`443` from `0.0.0.0/0` (needed for real users to reach it).
3. Elastic IP: allocate one and associate it to the instance **only after it's running** — an unattached Elastic IP bills hourly (the plan doc's "explicitly avoid" list).
4. SSH in, install Node.js (matching the root `package.json` `engines.node` pin, currently `22.x`), `git clone` the repo (or `scp` a build), `npm ci && npm run build --workspace=shared --workspace=backend`.
5. Update the EC2 instance's security group in RDS's `techbuilder-dev-sg` inbound rule (replace/add the EC2 instance's private or public IP — tighter: use the EC2 security-group ID as the source instead of an IP, so it doesn't break on IP change).
6. Run the backend with `pm2` (or systemd) so it survives SSH disconnects: `pm2 start dist/main.js --name techbuilder-backend`.
7. Nginx + Certbot on the box for TLS, proxying to `localhost:4000` — only needed once you have a real domain pointed at the Elastic IP.

---

## Part D — Optional: S3 for media (fills the currently-unwired R2 slot)

Not urgent — `R2_*` env vars are already unset today and photo/voice capture is accepted but not stored (per the build-status note in `CLAUDE.md`). If you want this working before EC2/production:

1. S3 → Create bucket, `ap-south-1`, block all public access (serve via presigned URLs, matching the existing `media` module's design).
2. IAM → create a user (or better, an IAM role once EC2 exists) with a scoped policy: `s3:PutObject`/`s3:GetObject` on just this bucket's ARN — not `AmazonS3FullAccess`.
3. The backend's `media` module already expects R2-shaped env vars (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/`R2_PUBLIC_BASE`) — check `backend/src/media/` before assuming S3 is a drop-in; S3's presigned-URL and endpoint shape differ slightly from R2's S3-compatible API. Worth a quick `ctx7`/docs check on `@aws-sdk/client-s3` presigned URLs before wiring this in, since this is a genuine "verify current docs" case per the project's library-integration rule.

---

## Part E — When Phase 1 is actually running

Update `docs/PROJECT_AI_CONTEXT.md` §0 and this repo's `CLAUDE.md` build status with: RDS Mumbai live, measured before/after latency numbers, and whether it's now the daily-dev default (`backend/.env` pointed at RDS) or still opt-in vs Neon. Also update the auto-memory (`techbuilder-web-perf-diagnosis`) once you've actually measured the fix, since that memory currently says "fix tiers agreed, not yet implemented."
