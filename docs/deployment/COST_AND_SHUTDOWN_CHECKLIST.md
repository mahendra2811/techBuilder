# Cost Estimate & Shutdown Checklist

## Cost estimate — treat as a rough planning number, not a bill

> Per the hard rule against relying on remembered AWS pricing: **re-verify every figure below in the
> [AWS Pricing Calculator](https://calculator.aws/) for `ap-south-1` before creating anything**, and
> check `Billing → Free Tier` in your actual account (`AWS_SETUP_GUIDE.md` Part A) for what's
> currently covered. Third-party pricing-aggregator sites were checked during this audit and gave
> **inconsistent, likely-stale numbers for `ap-south-1` specifically** — general AWS pricing
> knowledge (Asia Pacific regions typically run ~15–25% above `us-east-1`) is used below instead of
> trusting those scraped figures, but this is still an estimate, not a quote.

### Always-on, this plan's architecture (EC2 `t4g.micro` + RDS `db.t4g.micro`, 24/7) — updated 2026-07-11 for smallest/cheapest sizing

> ⚠️ **2026-07-15:** the actual standing EC2 instance is Amazon Linux 2023 on x86_64, not the
> `t4g.micro` (ARM/Graviton) this table prices below — check EC2 console → Instances → your
> instance → Instance type, then re-price it in the AWS Pricing Calculator (x86 `t3`/`t2` family
> pricing differs from the `t4g` numbers here, and is typically ~20% higher for the same RAM/vCPU).
> Everything else in this table (RDS, EBS, data transfer) is unaffected by the EC2 architecture choice.

| Item | Rough monthly cost |
|---|---|
| EC2 `t4g.micro` compute (730 hrs) | ~$7–8 (roughly half of `t4g.small`, which this plan used before this pass — the two sizes differ only in RAM, 1GB vs 2GB, and price scales with it) |
| EC2 EBS gp3 20GB | ~$1.6–2 |
| RDS `db.t4g.micro` compute (730 hrs) — already the smallest RDS class, unchanged | ~$13–15 |
| RDS gp3 storage 20GB | ~$2.3 |
| RDS automated backup storage (within the free allotment ≈ DB size, early on) | ~$0 |
| S3 logical backups (a few GB, 14-day retention) | ~$0.50–1 |
| Data transfer (Vercel↔EC2 API calls, EC2↔RDS same-region free, EC2→internet responses) | ~$1–3 at 10–50 users |
| **Total, normal pay-as-you-go rate** | **~$25–29/month** (was ~$32–40/month at the earlier `t4g.small` sizing) |

Note: EC2 is the smaller of the two line items here — RDS `db.t4g.micro` is already at AWS's floor for
this instance family, so **RDS compute is now the single largest cost driver**, not EC2.

### This account's actual program (per this repo's own 2026-07-09 research, re-verify it's still current)

- New AWS accounts created after **2025-07-15** get **up to $200 in credit, valid 6 months** — EC2/RDS are **not** on an "always free" list under this program; they draw down the credit at normal rates from hour one.
- At the ~$25–29/mo always-on rate above, $200 of *spend* would last ~7–8 months — but the account's Free-plan window still closes at **6 months regardless of unused credit**, so the practical answer is: **this plan should not exhaust the $200 credit before the program's own 6-month clock runs out anyway**, comfortably covering the 30–40 day testing period + early merchant-onboarding runway either way.
- **Re-confirm** this program is still what your account is on: Console → Billing → Credits (shows balance + exact expiry date) — do this before relying on the "effectively free" framing for budgeting.

### Cheaper option during pre-EC2 dev/testing (already documented in this repo)

If you don't yet need the backend reachable from anywhere but your own machine,
`docs/perf/techBuilder-AWS-Testing-Setup-Plan.md`'s **RDS-only, start/stop usage pattern**
(~90–155 hrs/month instead of 730) estimates **~$5/month** for the DB alone — a good way to prove
the latency fix cheaply before committing to always-on EC2. That doc is otherwise superseded by
this plan (see `ARCHITECTURE.md`'s header) for the *production-track* pieces (public RDS access,
master-role bootstrapping) — but its cost math for a start/stop RDS-only phase is still valid if
you want that cheaper interim step.

## Cost safeguards (set up before creating any resource — see `AWS_SETUP_GUIDE.md` Part A4/A5)

- [ ] Budget alerts at $5, $10, $15 (+ optional $50 backstop).
- [ ] Billing alerts + Free Tier usage alerts turned on in Billing preferences.
- [ ] `Project=techbuilder` / `Environment` / `Owner` / `ManagedBy` tags on every resource.

## Identifying unused/forgotten resources (repeat periodically)

See `AWS_SETUP_GUIDE.md` Part F — unattached Elastic IPs, orphaned EBS volumes, stray manual RDS
snapshots, and untagged resources are the classic hidden-cost traps for a single-instance setup.

---

## Shutdown checklist (two paths — choose one after the 30–40 day window)

### Path 1 — Continue running production

Nothing to do here beyond ongoing operation per `DAY_0_TO_40_PLAN.md`'s "After 30–40 days" section
— skip to Path 2 only if actually stopping.

### Path 2 — Shut everything down safely

Do these **in order** — each step assumes the previous one succeeded:

1. **Final `pg_dump`:**
   ```bash
   DATABASE_URL_ADMIN="..." BACKUP_S3_BUCKET="..." AWS_REGION="ap-south-1" ./scripts/backup-database.sh
   ```
   Confirm the object landed in S3 (`aws s3 ls s3://<bucket>/backups/ | tail -5`) before proceeding.
2. **Final RDS snapshot** (belt-and-suspenders alongside the logical dump — a snapshot restores faster and preserves exact engine-version state): RDS console → instance → Actions → **Take snapshot** → name it clearly (e.g. `techbuilder-final-shutdown-2026-XX-XX`). Wait for it to complete.
3. **Export any required files** off the EC2 instance you're about to terminate — the `.env` secrets file (copy to your password manager, not a plain file on your laptop), any ad-hoc logs you want to keep beyond what's already in S3/backups.
4. **Terminate EC2** — console → Instances → select → Instance state → Terminate. **This is irreversible** — confirm step 3 is actually done first.
5. **Delete unused EBS volumes** — after termination, the root volume is deleted automatically only if "Delete on termination" was left at its default (true); check EC2 → Volumes for any `available` volume left over regardless, and delete it.
6. **Release the Elastic IP** (if one was allocated) — EC2 → Elastic IPs → Release. An unattached EIP bills hourly even with everything else off.
7. **Review S3 retention** — either let the 14-day lifecycle rule finish expiring old backups naturally, or manually empty + delete the bucket if you want zero ongoing storage cost immediately (only after confirming the final snapshot in step 2 is a sufficient standalone recovery point).
8. **Delete the RDS instance** — console → instance → Actions → Delete. **Uncheck "skip final snapshot" only if you're fine relying solely on step 2's manual snapshot** (typically leave the automatic final-snapshot checkbox checked as extra safety, it costs only its storage). If deletion protection was enabled (recommended for real production), disable it first (Modify → uncheck → Apply, wait for it to take effect, then delete).
9. **Confirm no remaining chargeable resources:** Billing → Cost Explorer filtered by `Project=techbuilder` tag should show a flat/declining trend to zero over the next billing cycle; EC2/RDS/VPC consoles (in `ap-south-1`) should show nothing left except any snapshots/S3 objects you deliberately kept.
