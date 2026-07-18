ALTER TABLE "fuel_logs" ALTER COLUMN "amount_paise" DROP NOT NULL;--> statement-breakpoint
-- frozen.10 HAND-EDITED (drizzle emitted a bare ADD COLUMN ... NOT NULL that fails on existing
-- rows): add nullable -> backfill per-org sequential numbers starting at 101 -> SET NOT NULL.
ALTER TABLE "complaints" ADD COLUMN "complaint_no" integer;--> statement-breakpoint
UPDATE "complaints" c SET "complaint_no" = n.no FROM (
  SELECT id, 100 + row_number() OVER (PARTITION BY org_id ORDER BY created_at, id) AS no
  FROM "complaints"
) n WHERE c.id = n.id;--> statement-breakpoint
ALTER TABLE "complaints" ALTER COLUMN "complaint_no" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "subcategory" text;--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD COLUMN "paid_by_driver" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Pre-frozen.10 fuel rows always carried a real paid amount -> mark them driver-paid.
UPDATE "fuel_logs" SET "paid_by_driver" = true WHERE "amount_paise" IS NOT NULL AND "amount_paise" > 0;--> statement-breakpoint
ALTER TABLE "material_txns" ADD COLUMN "remark" text;--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_org_no_uq" ON "complaints" USING btree ("org_id","complaint_no");
