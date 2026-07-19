ALTER TABLE "people" ADD COLUMN "site_id" uuid;--> statement-breakpoint
CREATE INDEX "people_site_idx" ON "people" USING btree ("org_id","site_id");