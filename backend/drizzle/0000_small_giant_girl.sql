CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."approval_type" AS ENUM('VEHICLE_SWITCH', 'LEAVE', 'MATERIAL');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'HALF_DAY');--> statement-breakpoint
CREATE TYPE "public"."completeness_scope" AS ENUM('SITE', 'VEHICLE');--> statement-breakpoint
CREATE TYPE "public"."completeness_state" AS ENUM('COMPLETE', 'PARTIAL', 'MISSING');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('FOOD', 'SUPPLIES', 'TRANSPORT', 'LABOUR', 'REPAIR', 'MISC');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('CASUAL', 'SICK', 'UNPAID', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."material_txn_status" AS ENUM('PENDING', 'CONFIRMED', 'MISMATCH');--> statement-breakpoint
CREATE TYPE "public"."material_txn_type" AS ENUM('IN', 'CONSUME', 'DISPATCH', 'RECEIVE');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('PHOTO', 'RECEIPT', 'VOICE');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('APPROVAL_REQUESTED', 'APPROVAL_DECIDED', 'ASSIGNMENT_CHANGED', 'ISSUE_RAISED', 'SYNC_FAILED', 'DAILY_DIGEST');--> statement-breakpoint
CREATE TYPE "public"."person_skill" AS ENUM('UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'OPERATOR', 'DRIVER');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('ACTIVE', 'PAUSED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."vehicle_tracking_mode" AS ENUM('KM', 'HOURS');--> statement-breakpoint
CREATE TYPE "public"."uom" AS ENUM('BAG', 'KG', 'CFT', 'NOS', 'MT', 'LITRE');--> statement-breakpoint
CREATE TYPE "public"."vehicle_doc_kind" AS ENUM('RC', 'INSURANCE', 'PUC', 'FITNESS', 'PERMIT');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('ACTIVE', 'IDLE', 'MAINTENANCE');--> statement-breakpoint
CREATE TABLE "advances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"person_id" uuid,
	"crew_id" uuid,
	"amount_paise" bigint NOT NULL,
	"business_date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"type" "approval_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"requested_by" uuid NOT NULL,
	"approver_user_id" uuid,
	"decided_at" timestamp with time zone,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"site_id" uuid NOT NULL,
	"crew_id" uuid,
	"person_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"status" "attendance_status" NOT NULL,
	"ot_hours" double precision DEFAULT 0 NOT NULL,
	"marked_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "completeness" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"scope_type" "completeness_scope" NOT NULL,
	"scope_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"state" "completeness_state" NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_members" (
	"org_id" uuid NOT NULL,
	"crew_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "crew_members_crew_id_person_id_pk" PRIMARY KEY("crew_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"site_id" uuid NOT NULL,
	"team_head_user_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_allowed_types" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_type_id" uuid NOT NULL,
	CONSTRAINT "driver_allowed_types_user_id_vehicle_type_id_pk" PRIMARY KEY("user_id","vehicle_type_id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"site_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"vendor_id" uuid,
	"bill_no" text,
	"receipt_media_id" uuid,
	"business_date" date NOT NULL,
	"entered_by" uuid NOT NULL,
	"void" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"litres" double precision NOT NULL,
	"reading" double precision NOT NULL,
	"receipt_media_id" uuid,
	"business_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"site_id" uuid,
	"vehicle_id" uuid,
	"severity" "issue_severity" NOT NULL,
	"description" text NOT NULL,
	"status" "issue_status" DEFAULT 'OPEN' NOT NULL,
	"business_date" date NOT NULL,
	"media_ids" uuid[]
);
--> statement-breakpoint
CREATE TABLE "leaves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"person_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"type" "leave_type" NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "material_balances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"opening" double precision DEFAULT 0 NOT NULL,
	"business_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_txns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"type" "material_txn_type" NOT NULL,
	"material_id" uuid NOT NULL,
	"qty" double precision NOT NULL,
	"uom" "uom" NOT NULL,
	"site_id" uuid NOT NULL,
	"counterpart_site_id" uuid,
	"related_txn_id" uuid,
	"status" "material_txn_status" DEFAULT 'CONFIRMED' NOT NULL,
	"business_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"uom" "uom" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"r2_key" text NOT NULL,
	"thumb_key" text,
	"parent_type" text NOT NULL,
	"parent_id" uuid NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"taken_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "orgs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"skill" "person_skill",
	"default_wage_paise" bigint,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"site_id" uuid NOT NULL,
	"text" text NOT NULL,
	"business_date" date NOT NULL,
	"entered_by" uuid NOT NULL,
	"media_ids" uuid[]
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_holidays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"status" "site_status" DEFAULT 'ACTIVE' NOT NULL,
	"weekly_off" integer[],
	"start_date" date,
	"expected_end_date" date,
	"budget_paise" bigint,
	"site_manager_id" uuid
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"from_text" text NOT NULL,
	"to_text" text NOT NULL,
	"purpose" text,
	"material_txn_id" uuid,
	"business_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"person_id" uuid,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"phone" text,
	"role" "role" NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"assigned_site_id" uuid,
	"crew_id" uuid,
	"allowed_vehicle_type_ids" uuid[],
	"emergency_contact" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_person_id" uuid NOT NULL,
	"start_reading" double precision NOT NULL,
	"end_reading" double precision,
	"business_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"tracking_mode" "vehicle_tracking_mode" NOT NULL,
	"fields_schema" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"vehicle_type_id" uuid NOT NULL,
	"reg_no" text NOT NULL,
	"name" text,
	"values" jsonb DEFAULT '{}' NOT NULL,
	"assigned_site_id" uuid,
	"assigned_driver_person_id" uuid,
	"status" "vehicle_status" DEFAULT 'IDLE' NOT NULL,
	"docs" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"phone" text
);
--> statement-breakpoint
CREATE TABLE "wage_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"person_id" uuid NOT NULL,
	"daily_paise" bigint NOT NULL,
	"effective_from" date NOT NULL
);
--> statement-breakpoint
CREATE INDEX "advances_idx" ON "advances" USING btree ("org_id","business_date");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "approval_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_person_day_uq" ON "attendance" USING btree ("org_id","person_id","business_date");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "completeness_uq" ON "completeness" USING btree ("org_id","scope_type","scope_id","business_date");--> statement-breakpoint
CREATE INDEX "crews_org_site_idx" ON "crews" USING btree ("org_id","site_id");--> statement-breakpoint
CREATE INDEX "expenses_site_day_idx" ON "expenses" USING btree ("org_id","site_id","business_date");--> statement-breakpoint
CREATE INDEX "fuel_vehicle_day_idx" ON "fuel_logs" USING btree ("org_id","vehicle_id","business_date");--> statement-breakpoint
CREATE INDEX "issues_status_idx" ON "issues" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "leaves_person_idx" ON "leaves" USING btree ("org_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matbal_site_material_uq" ON "material_balances" USING btree ("org_id","site_id","material_id");--> statement-breakpoint
CREATE INDEX "mattxn_site_day_idx" ON "material_txns" USING btree ("org_id","site_id","business_date");--> statement-breakpoint
CREATE INDEX "media_parent_idx" ON "media" USING btree ("org_id","parent_type","parent_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("org_id","user_id","read_at");--> statement-breakpoint
CREATE INDEX "people_org_idx" ON "people" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "progress_site_day_idx" ON "progress_notes" USING btree ("org_id","site_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_user_device_uq" ON "refresh_tokens" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "site_holidays_idx" ON "site_holidays" USING btree ("org_id","site_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_org_code_uq" ON "sites" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "trips_vehicle_day_idx" ON "trips" USING btree ("org_id","vehicle_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_username_uq" ON "users" USING btree ("org_id","username");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_log_day_uq" ON "vehicle_logs" USING btree ("org_id","vehicle_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_org_reg_uq" ON "vehicles" USING btree ("org_id","reg_no");--> statement-breakpoint
CREATE INDEX "wage_rates_person_idx" ON "wage_rates" USING btree ("org_id","person_id","effective_from");