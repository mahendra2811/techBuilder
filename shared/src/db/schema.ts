/**
 * Drizzle PostgreSQL schema — FROZEN structural source of truth.
 * RLS (ENABLE + FORCE + tenant-isolation policy + app role + security_invoker views) lives in `rls.sql`
 * (applied AFTER drizzle migrations) — drizzle-kit does not emit FORCE/role DDL.
 *
 * Conventions: PK = client-generated UUIDv7 (no DB default). org_id on every tenant table (RLS).
 * Money = bigint paise. business_date = date (Asia/Kolkata). timestamps = timestamptz.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  doublePrecision,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import {
  ROLES,
  PERSON_SKILLS,
  SITE_STATUSES,
  VEHICLE_STATUSES,
  VEHICLE_TRACKING_MODES,
  VEHICLE_DOC_KINDS,
  ATTENDANCE_STATUSES,
  LEAVE_TYPES,
  EXPENSE_CATEGORIES,
  UOMS,
  MATERIAL_TXN_TYPES,
  MATERIAL_TXN_STATUSES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  MEDIA_KINDS,
  APPROVAL_TYPES,
  APPROVAL_STATUSES,
  NOTIFICATION_TYPES,
  COMPLETENESS_SCOPES,
  COMPLETENESS_STATES,
} from '../enums';

// ---- pgEnums (derived from the frozen enum arrays — single source) ----
export const roleEnum = pgEnum('role', ROLES);
export const personSkillEnum = pgEnum('person_skill', PERSON_SKILLS);
export const siteStatusEnum = pgEnum('site_status', SITE_STATUSES);
export const vehicleStatusEnum = pgEnum('vehicle_status', VEHICLE_STATUSES);
export const trackingModeEnum = pgEnum('vehicle_tracking_mode', VEHICLE_TRACKING_MODES);
export const vehicleDocKindEnum = pgEnum('vehicle_doc_kind', VEHICLE_DOC_KINDS);
export const attendanceStatusEnum = pgEnum('attendance_status', ATTENDANCE_STATUSES);
export const leaveTypeEnum = pgEnum('leave_type', LEAVE_TYPES);
export const expenseCategoryEnum = pgEnum('expense_category', EXPENSE_CATEGORIES);
export const uomEnum = pgEnum('uom', UOMS);
export const materialTxnTypeEnum = pgEnum('material_txn_type', MATERIAL_TXN_TYPES);
export const materialTxnStatusEnum = pgEnum('material_txn_status', MATERIAL_TXN_STATUSES);
export const issueSeverityEnum = pgEnum('issue_severity', ISSUE_SEVERITIES);
export const issueStatusEnum = pgEnum('issue_status', ISSUE_STATUSES);
export const mediaKindEnum = pgEnum('media_kind', MEDIA_KINDS);
export const approvalTypeEnum = pgEnum('approval_type', APPROVAL_TYPES);
export const approvalStatusEnum = pgEnum('approval_status', APPROVAL_STATUSES);
export const notificationTypeEnum = pgEnum('notification_type', NOTIFICATION_TYPES);
export const completenessScopeEnum = pgEnum('completeness_scope', COMPLETENESS_SCOPES);
export const completenessStateEnum = pgEnum('completeness_state', COMPLETENESS_STATES);

// ---- reusable column groups (functions → fresh builder instances per table) ----
const audit = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
});
const pk = () => ({ id: uuid('id').primaryKey() }); // client-supplied UUIDv7
const orgCol = () => ({ orgId: uuid('org_id').notNull() });
const base = () => ({ ...pk(), ...orgCol(), ...audit() });
const money = (name: string) => bigint(name, { mode: 'number' }); // integer paise

// ---- identity & org ----
export const orgs = pgTable('orgs', {
  ...pk(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  config: jsonb('config').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  ...audit(),
});

export const people = pgTable(
  'people',
  {
    ...base(),
    name: text('name').notNull(),
    phone: text('phone'),
    skill: personSkillEnum('skill'),
    defaultWagePaise: money('default_wage_paise'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('people_org_idx').on(t.orgId)],
);

export const users = pgTable(
  'users',
  {
    ...base(),
    personId: uuid('person_id'),
    name: text('name').notNull(),
    username: text('username').notNull(),
    phone: text('phone'),
    role: roleEnum('role').notNull(),
    passwordHash: text('password_hash').notNull(),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    assignedSiteId: uuid('assigned_site_id'),
    crewId: uuid('crew_id'),
    allowedVehicleTypeIds: uuid('allowed_vehicle_type_ids').array(),
    emergencyContact: text('emergency_contact'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('users_org_username_uq').on(t.orgId, t.username)],
);

export const sites = pgTable(
  'sites',
  {
    ...base(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    status: siteStatusEnum('status').notNull().default('ACTIVE'),
    weeklyOff: integer('weekly_off').array(),
    startDate: date('start_date'),
    expectedEndDate: date('expected_end_date'),
    budgetPaise: money('budget_paise'),
    siteManagerId: uuid('site_manager_id'),
  },
  (t) => [uniqueIndex('sites_org_code_uq').on(t.orgId, t.code)],
);

export const siteHolidays = pgTable(
  'site_holidays',
  {
    ...pk(),
    ...orgCol(),
    siteId: uuid('site_id').notNull(),
    date: date('date').notNull(),
    label: text('label').notNull(),
  },
  (t) => [index('site_holidays_idx').on(t.orgId, t.siteId, t.date)],
);

export const crews = pgTable(
  'crews',
  {
    ...base(),
    siteId: uuid('site_id').notNull(),
    teamHeadUserId: uuid('team_head_user_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [index('crews_org_site_idx').on(t.orgId, t.siteId)],
);

export const crewMembers = pgTable(
  'crew_members',
  {
    orgId: uuid('org_id').notNull(),
    crewId: uuid('crew_id').notNull(),
    personId: uuid('person_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.crewId, t.personId] })],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    ...pk(),
    ...orgCol(),
    userId: uuid('user_id').notNull(),
    deviceId: text('device_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('refresh_user_device_uq').on(t.userId, t.deviceId)],
);

// ---- vehicles ----
export const vehicleTypes = pgTable('vehicle_types', {
  ...base(),
  name: text('name').notNull(),
  trackingMode: trackingModeEnum('tracking_mode').notNull(),
  fieldsSchema: jsonb('fields_schema').notNull().default('[]'),
});

export const vehicles = pgTable(
  'vehicles',
  {
    ...base(),
    vehicleTypeId: uuid('vehicle_type_id').notNull(),
    regNo: text('reg_no').notNull(),
    name: text('name'),
    values: jsonb('values').notNull().default('{}'),
    assignedSiteId: uuid('assigned_site_id'),
    assignedDriverPersonId: uuid('assigned_driver_person_id'),
    status: vehicleStatusEnum('status').notNull().default('IDLE'),
    docs: jsonb('docs').notNull().default('[]'),
  },
  (t) => [uniqueIndex('vehicles_org_reg_uq').on(t.orgId, t.regNo)],
);

export const driverAllowedTypes = pgTable(
  'driver_allowed_types',
  {
    orgId: uuid('org_id').notNull(),
    userId: uuid('user_id').notNull(),
    vehicleTypeId: uuid('vehicle_type_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.vehicleTypeId] })],
);

// ---- attendance / leave / wage ----
export const attendance = pgTable(
  'attendance',
  {
    ...base(),
    siteId: uuid('site_id').notNull(),
    crewId: uuid('crew_id'),
    personId: uuid('person_id').notNull(),
    businessDate: date('business_date').notNull(),
    status: attendanceStatusEnum('status').notNull(),
    otHours: doublePrecision('ot_hours').notNull().default(0),
    markedBy: uuid('marked_by').notNull(),
  },
  (t) => [uniqueIndex('attendance_person_day_uq').on(t.orgId, t.personId, t.businessDate)],
);

export const leaves = pgTable(
  'leaves',
  {
    ...base(),
    personId: uuid('person_id').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    type: leaveTypeEnum('type').notNull(),
    reason: text('reason'),
  },
  (t) => [index('leaves_person_idx').on(t.orgId, t.personId)],
);

export const wageRates = pgTable(
  'wage_rates',
  {
    ...base(),
    personId: uuid('person_id').notNull(),
    dailyPaise: money('daily_paise').notNull(),
    effectiveFrom: date('effective_from').notNull(),
  },
  (t) => [index('wage_rates_person_idx').on(t.orgId, t.personId, t.effectiveFrom)],
);

export const advances = pgTable(
  'advances',
  {
    ...base(),
    personId: uuid('person_id'),
    crewId: uuid('crew_id'),
    amountPaise: money('amount_paise').notNull(),
    businessDate: date('business_date').notNull(),
    note: text('note'),
  },
  (t) => [index('advances_idx').on(t.orgId, t.businessDate)],
);

// ---- records ----
export const progressNotes = pgTable(
  'progress_notes',
  {
    ...base(),
    siteId: uuid('site_id').notNull(),
    text: text('text').notNull(),
    businessDate: date('business_date').notNull(),
    enteredBy: uuid('entered_by').notNull(),
    mediaIds: uuid('media_ids').array(),
  },
  (t) => [index('progress_site_day_idx').on(t.orgId, t.siteId, t.businessDate)],
);

export const vendors = pgTable('vendors', {
  ...base(),
  name: text('name').notNull(),
  phone: text('phone'),
});

export const expenses = pgTable(
  'expenses',
  {
    ...base(),
    siteId: uuid('site_id').notNull(),
    category: expenseCategoryEnum('category').notNull(),
    amountPaise: money('amount_paise').notNull(),
    vendorId: uuid('vendor_id'),
    billNo: text('bill_no'),
    receiptMediaId: uuid('receipt_media_id'),
    businessDate: date('business_date').notNull(),
    enteredBy: uuid('entered_by').notNull(),
    void: boolean('void').notNull().default(false),
  },
  (t) => [index('expenses_site_day_idx').on(t.orgId, t.siteId, t.businessDate)],
);

export const fuelLogs = pgTable(
  'fuel_logs',
  {
    ...base(),
    vehicleId: uuid('vehicle_id').notNull(),
    amountPaise: money('amount_paise').notNull(),
    litres: doublePrecision('litres').notNull(),
    reading: doublePrecision('reading').notNull(),
    receiptMediaId: uuid('receipt_media_id'),
    businessDate: date('business_date').notNull(),
  },
  (t) => [index('fuel_vehicle_day_idx').on(t.orgId, t.vehicleId, t.businessDate)],
);

export const vehicleLogs = pgTable(
  'vehicle_logs',
  {
    ...base(),
    vehicleId: uuid('vehicle_id').notNull(),
    driverPersonId: uuid('driver_person_id').notNull(),
    startReading: doublePrecision('start_reading').notNull(),
    endReading: doublePrecision('end_reading'),
    businessDate: date('business_date').notNull(),
  },
  (t) => [uniqueIndex('vehicle_log_day_uq').on(t.orgId, t.vehicleId, t.businessDate)],
);

export const trips = pgTable(
  'trips',
  {
    ...base(),
    vehicleId: uuid('vehicle_id').notNull(),
    fromText: text('from_text').notNull(),
    toText: text('to_text').notNull(),
    purpose: text('purpose'),
    materialTxnId: uuid('material_txn_id'),
    businessDate: date('business_date').notNull(),
  },
  (t) => [index('trips_vehicle_day_idx').on(t.orgId, t.vehicleId, t.businessDate)],
);

export const materials = pgTable('materials', {
  ...base(),
  name: text('name').notNull(),
  uom: uomEnum('uom').notNull(),
});

export const materialBalances = pgTable(
  'material_balances',
  {
    ...pk(),
    ...orgCol(),
    siteId: uuid('site_id').notNull(),
    materialId: uuid('material_id').notNull(),
    opening: doublePrecision('opening').notNull().default(0),
    businessDate: date('business_date').notNull(),
  },
  (t) => [uniqueIndex('matbal_site_material_uq').on(t.orgId, t.siteId, t.materialId)],
);

export const materialTxns = pgTable(
  'material_txns',
  {
    ...base(),
    type: materialTxnTypeEnum('type').notNull(),
    materialId: uuid('material_id').notNull(),
    qty: doublePrecision('qty').notNull(),
    uom: uomEnum('uom').notNull(),
    siteId: uuid('site_id').notNull(),
    counterpartSiteId: uuid('counterpart_site_id'),
    relatedTxnId: uuid('related_txn_id'),
    status: materialTxnStatusEnum('status').notNull().default('CONFIRMED'),
    businessDate: date('business_date').notNull(),
  },
  (t) => [index('mattxn_site_day_idx').on(t.orgId, t.siteId, t.businessDate)],
);

export const issues = pgTable(
  'issues',
  {
    ...base(),
    siteId: uuid('site_id'),
    vehicleId: uuid('vehicle_id'),
    severity: issueSeverityEnum('severity').notNull(),
    description: text('description').notNull(),
    status: issueStatusEnum('status').notNull().default('OPEN'),
    businessDate: date('business_date').notNull(),
    mediaIds: uuid('media_ids').array(),
  },
  (t) => [index('issues_status_idx').on(t.orgId, t.status)],
);

export const media = pgTable(
  'media',
  {
    ...pk(),
    ...orgCol(),
    kind: mediaKindEnum('kind').notNull(),
    r2Key: text('r2_key').notNull(),
    thumbKey: text('thumb_key'),
    parentType: text('parent_type').notNull(),
    parentId: uuid('parent_id').notNull(),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('media_parent_idx').on(t.orgId, t.parentType, t.parentId)],
);

// ---- workflow & system ----
export const approvalRequests = pgTable(
  'approval_requests',
  {
    ...base(),
    type: approvalTypeEnum('type').notNull(),
    payload: jsonb('payload').notNull(),
    status: approvalStatusEnum('status').notNull().default('PENDING'),
    requestedBy: uuid('requested_by').notNull(),
    approverUserId: uuid('approver_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    comment: text('comment'),
  },
  (t) => [index('requests_status_idx').on(t.orgId, t.status)],
);

export const notifications = pgTable(
  'notifications',
  {
    ...pk(),
    ...orgCol(),
    userId: uuid('user_id').notNull(),
    type: notificationTypeEnum('type').notNull(),
    payload: jsonb('payload').notNull().default('{}'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.orgId, t.userId, t.readAt)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    ...pk(),
    ...orgCol(),
    actorUserId: uuid('actor_user_id').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_entity_idx').on(t.orgId, t.entityType, t.entityId)],
);

export const completeness = pgTable(
  'completeness',
  {
    ...pk(),
    ...orgCol(),
    scopeType: completenessScopeEnum('scope_type').notNull(),
    scopeId: uuid('scope_id').notNull(),
    businessDate: date('business_date').notNull(),
    state: completenessStateEnum('state').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('completeness_uq').on(t.orgId, t.scopeType, t.scopeId, t.businessDate)],
);

/** All tenant tables that require RLS (org_id-scoped). `orgs` itself is filtered by id, handled in rls.sql. */
export const TENANT_TABLES = [
  'people', 'users', 'sites', 'site_holidays', 'crews', 'crew_members', 'refresh_tokens',
  'vehicle_types', 'vehicles', 'driver_allowed_types', 'attendance', 'leaves', 'wage_rates',
  'advances', 'progress_notes', 'vendors', 'expenses', 'fuel_logs', 'vehicle_logs', 'trips',
  'materials', 'material_balances', 'material_txns', 'issues', 'media', 'approval_requests',
  'notifications', 'audit_logs', 'completeness',
] as const;
