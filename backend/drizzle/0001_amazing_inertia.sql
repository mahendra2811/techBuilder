CREATE TYPE "public"."cash_transfer_kind" AS ENUM('GIVE', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('CASH', 'VENDOR_CREDIT');--> statement-breakpoint
ALTER TYPE "public"."approval_type" ADD VALUE 'EXPENSE_ADD';--> statement-breakpoint
CREATE TABLE "cash_transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"kind" "cash_transfer_kind" NOT NULL,
	"business_date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "vendor_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"business_date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "paid_via" "payment_mode" DEFAULT 'CASH' NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "closing_note" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "emergency_contacts" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "expense_form_config" jsonb;--> statement-breakpoint
ALTER TABLE "vehicle_logs" ADD COLUMN "hours_worked" double precision;--> statement-breakpoint
ALTER TABLE "vehicle_logs" ADD COLUMN "loads_count" integer;--> statement-breakpoint
ALTER TABLE "vehicle_logs" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "site_id" uuid;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "sells" text;--> statement-breakpoint
CREATE INDEX "cash_transfers_org_date_idx" ON "cash_transfers" USING btree ("org_id","business_date");--> statement-breakpoint
CREATE INDEX "cash_transfers_to_idx" ON "cash_transfers" USING btree ("org_id","to_user_id");--> statement-breakpoint
CREATE INDEX "cash_transfers_from_idx" ON "cash_transfers" USING btree ("org_id","from_user_id");--> statement-breakpoint
CREATE INDEX "vendor_payments_vendor_idx" ON "vendor_payments" USING btree ("org_id","vendor_id","business_date");