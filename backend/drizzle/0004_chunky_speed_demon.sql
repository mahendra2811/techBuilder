CREATE TYPE "public"."complaint_target" AS ENUM('OWNER', 'SITE_MANAGER');--> statement-breakpoint
CREATE TYPE "public"."money_tag" AS ENUM('WORK', 'SALARY', 'PERSONAL');--> statement-breakpoint
CREATE TYPE "public"."reminder_kind" AS ENUM('EXPIRY', 'EMI', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."reminder_recurrence" AS ENUM('ONCE', 'MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."vendor_payment_kind" AS ENUM('PAYMENT', 'RECEIPT');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'MONEY_FLAGGED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'VEHICLE_DOC_DUE';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'COMPLAINT_RAISED';--> statement-breakpoint
ALTER TYPE "public"."vehicle_doc_kind" ADD VALUE 'OTHER';--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"raised_by" uuid NOT NULL,
	"target" "complaint_target" NOT NULL,
	"site_id" uuid,
	"text" text NOT NULL,
	"media_ids" uuid[],
	"status" "issue_status" DEFAULT 'OPEN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_issuances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"site_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"litres" double precision NOT NULL,
	"issued_by" uuid NOT NULL,
	"business_date" date NOT NULL,
	"status" "material_txn_status" DEFAULT 'PENDING' NOT NULL,
	"matched_fuel_log_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "fuel_stock_purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"site_id" uuid NOT NULL,
	"litres" double precision NOT NULL,
	"amount_paise" bigint,
	"receipt_media_id" uuid,
	"purchased_by" uuid NOT NULL,
	"business_date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "vehicle_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"kind" "vehicle_doc_kind" NOT NULL,
	"title" text NOT NULL,
	"media_id" uuid,
	"expiry_date" date,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "vehicle_reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"document_id" uuid,
	"label" text NOT NULL,
	"kind" "reminder_kind" NOT NULL,
	"due_date" date NOT NULL,
	"recurrence" "reminder_recurrence" DEFAULT 'ONCE' NOT NULL,
	"remind_days_before" integer DEFAULT 7 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_notified_for" date
);
--> statement-breakpoint
ALTER TYPE "public"."role" RENAME VALUE 'TEAM_HEAD' TO 'SUPERVISOR';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'ACCOUNTANT';--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "flag_note" text;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD COLUMN "tag" "money_tag" DEFAULT 'WORK' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD COLUMN "flag_note" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "flag_note" text;--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD COLUMN "status" "material_txn_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD COLUMN "matched_issuance_id" uuid;--> statement-breakpoint
ALTER TABLE "material_txns" ADD COLUMN "entered_role" "role";--> statement-breakpoint
ALTER TABLE "material_txns" ADD COLUMN "finalized" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "guardian_name" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "guardian_phone" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "accountant_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD COLUMN "kind" "vendor_payment_kind" DEFAULT 'PAYMENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD COLUMN "flag_note" text;--> statement-breakpoint
CREATE INDEX "complaints_status_idx" ON "complaints" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "fuel_issuance_vehicle_day_idx" ON "fuel_issuances" USING btree ("org_id","vehicle_id","business_date");--> statement-breakpoint
CREATE INDEX "fuel_stock_site_day_idx" ON "fuel_stock_purchases" USING btree ("org_id","site_id","business_date");--> statement-breakpoint
CREATE INDEX "vehicle_docs_vehicle_idx" ON "vehicle_documents" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_reminders_due_idx" ON "vehicle_reminders" USING btree ("org_id","active","due_date");--> statement-breakpoint
CREATE INDEX "vehicle_reminders_vehicle_idx" ON "vehicle_reminders" USING btree ("org_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "expenses_unverified_idx" ON "expenses" USING btree ("org_id","site_id","verified_at");