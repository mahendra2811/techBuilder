# AWS Setup — Step by Step (do in this exact order)

Region: **Asia Pacific (Mumbai) `ap-south-1`** — check the region dropdown (top-right of console) shows this before every step below.

---

## 1. IAM user

1. Console → IAM → Users → Create user.
2. Name: `techbuilder-admin`.
3. Attach policy: `AdministratorAccess`.
4. Create user.
5. IAM → Users → `techbuilder-admin` → Security credentials → Assign MFA device → set up with an authenticator app.
6. Log out of root. Log in as `techbuilder-admin` from now on.
7. Also add MFA to the root account (IAM → root user → Security credentials → Assign MFA device).

## 2. Budget alert

1. Console → Billing and Cost Management → Budgets → Create budget.
2. Type: Cost budget.
3. Amount: **$10**, Monthly.
4. Alert threshold: 100%, email = your email.
5. Create.

## 3. VPC

1. Console (region = `ap-south-1`) → VPC.
2. If a VPC already listed → skip to step 4.
3. If "No VPCs found" → Actions → Create default VPC → Create.
4. Note the VPC ID.

## 4. Security groups (create empty, rules added later)

1. VPC → Security Groups → Create security group.
2. Name: `techbuilder-ec2-sg`. VPC: the one from step 3. No inbound rules yet. Create.
3. Create security group again.
4. Name: `techbuilder-rds-sg`. Same VPC. No inbound rules yet. Create.

## 5. IAM role for EC2

1. IAM → Roles → Create role.
2. Trusted entity: AWS service → EC2.
3. Attach policy: `AmazonSSMManagedInstanceCore`.
4. Name: `techbuilder-ec2-role`.
5. Create role.

## 6. Launch EC2 instance

1. EC2 console → Launch instance.
2. Name: `techbuilder-backend`.
3. AMI: **Amazon Linux 2023** (2026-07-15 — supersedes the original Ubuntu 24.04 plan; see `ARCHITECTURE.md`'s note on why). Architecture: **64-bit (Arm)** if you want the cheaper Graviton pricing this plan originally assumed (t4g family); **64-bit (x86)** works identically for this app (confirmed zero native Node addons — see `ARCHITECTURE.md` — so architecture choice is a pure cost/availability decision, not a compatibility one) and is what the actual standing instance uses today.
4. Instance type: **t4g.micro** (Arm) or **t3.micro** (x86) — match whichever architecture you picked above. Size up to `.small` if you want headroom without resizing later (see `ARCHITECTURE.md`'s sizing table).
5. Key pair: Create new key pair → name it something identifiable (e.g. `<project>-keyPair`) → download the `.pem` file → keep it safe.
6. Network settings → Edit:
   - VPC: the one from step 3.
   - Subnet: any.
   - Auto-assign public IP: **Enable**.
   - Security group: Select existing → `techbuilder-ec2-sg`.
7. Configure storage: **20 GiB**, type **gp3** (the standing instance was launched with 8 GiB — works fine at this app's current scale, but 20 GiB gives more headroom for release history + logs; resize later via Modify Volume if needed, no downtime).
8. Advanced details → IAM instance profile → select `techbuilder-ec2-role`.
9. Launch instance.
10. Wait until instance state = "Running" and status checks = "2/2 checks passed".

## 7. EC2 security group rules

1. EC2 → Security Groups → `techbuilder-ec2-sg` → Inbound rules → Edit inbound rules.
2. Add rule: Type `HTTP`, Port 80, Source `0.0.0.0/0`.
3. Add rule: Type `HTTPS`, Port 443, Source `0.0.0.0/0`.
4. Add rule: Type `SSH`, Port 22, Source `My IP`.
5. Save rules.

## 8. Create RDS database

1. RDS console → Create database.
2. Creation method: **Standard create**.
3. Engine: **PostgreSQL**. Version: pick the newest one listed.
4. Templates: **Dev/Test**.
5. Availability: **Single-AZ DB instance**.
6. DB instance identifier: `techbuilder-prod`.
7. Master username: `postgres`.
8. Master password: type a strong password → save it somewhere safe → confirm password.
9. Instance class: Burstable classes → **db.t4g.micro**.
10. Storage: **gp3**, **20 GiB**, uncheck "Enable storage autoscaling".
11. Connectivity:
    - Compute resource: "Don't connect to an EC2 compute resource".
    - VPC: the one from step 3.
    - Public access: **No**.
    - VPC security group: Choose existing → select `techbuilder-rds-sg` → remove `default` if it's also selected.
    - Database port: 5432.
12. Additional configuration:
    - Initial database name: `techbuilder`.
    - Backup retention period: 7 days.
    - Enable encryption: checked.
    - Enhanced monitoring: uncheck / off.
    - Performance Insights: uncheck / off.
    - Enable auto minor version upgrade: checked.
13. Create database.
14. Wait until status = "Available".
15. Click the DB instance → copy the **Endpoint** value → save it.

## 9. RDS security group rule

1. EC2 → Security Groups → `techbuilder-rds-sg` → Inbound rules → Edit inbound rules.
2. Add rule: Type `PostgreSQL`, Port 5432, Source → type `techbuilder-ec2-sg` and select the security group (not an IP).
3. Save rules.

## 10. Connect to the EC2 instance

1. EC2 → Instances → select `techbuilder-backend` → Connect → Session Manager tab → Connect.
   (If Session Manager isn't available yet, wait 2–3 minutes after launch and retry — the SSM agent needs to register.)

> **First time connecting to this instance?** See `EC2_INITIAL_CONNECT_AND_SETUP.md` for both connection methods (SSM + SSH/`.pem`) in detail, plus the initial OS-level setup (updates, swap file, basic hardening) to do before anything else. Steps 10–11 below can be done via either connection method.

## 11. Verify RDS is reachable from EC2 only

Run inside the Session Manager terminal (from step 10):

```bash
sudo apt-get update && sudo apt-get install -y postgresql-client
psql "postgresql://postgres:<MASTER_PASSWORD>@<RDS_ENDPOINT>:5432/techbuilder" -c "select version();"
```
Replace `<MASTER_PASSWORD>` and `<RDS_ENDPOINT>` with the values from step 8. Expect a version string printed.

Then, on your own laptop (not the EC2 box), run the same command. Expect it to **fail / time out**. If it connects, stop — something is misconfigured (redo step 8 → Public access, and step 9).

---

Next: `EC2_INITIAL_CONNECT_AND_SETUP.md` (connect + initial OS setup on the instance you just launched), then `docs/deployment/DATABASE_MIGRATION.md`.
