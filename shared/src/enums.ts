/**
 * Canonical enums — FROZEN single source of truth.
 * Defined as `as const` arrays so we derive BOTH the TS union AND the Drizzle pgEnum from one place.
 * Backend and frontend import these. NEVER redefine an enum anywhere else.
 */

export const ROLES = ['OWNER', 'SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'] as const;
export type Role = (typeof ROLES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const LEAVE_TYPES = ['CASUAL', 'SICK', 'UNPAID', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const EXPENSE_CATEGORIES = ['FOOD', 'SUPPLIES', 'TRANSPORT', 'LABOUR', 'REPAIR', 'MISC'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const VEHICLE_TRACKING_MODES = ['KM', 'HOURS'] as const;
export type VehicleTrackingMode = (typeof VEHICLE_TRACKING_MODES)[number];

export const MATERIAL_TXN_TYPES = ['IN', 'CONSUME', 'DISPATCH', 'RECEIVE'] as const;
export type MaterialTxnType = (typeof MATERIAL_TXN_TYPES)[number];

export const MATERIAL_TXN_STATUSES = ['PENDING', 'CONFIRMED', 'MISMATCH'] as const;
export type MaterialTxnStatus = (typeof MATERIAL_TXN_STATUSES)[number];

export const UOMS = ['BAG', 'KG', 'CFT', 'NOS', 'MT', 'LITRE'] as const;
export type Uom = (typeof UOMS)[number];

export const APPROVAL_TYPES = ['VEHICLE_SWITCH', 'LEAVE', 'MATERIAL'] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const ISSUE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const SITE_STATUSES = ['ACTIVE', 'PAUSED', 'CLOSED'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const VEHICLE_STATUSES = ['ACTIVE', 'IDLE', 'MAINTENANCE'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const PERSON_SKILLS = ['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'OPERATOR', 'DRIVER'] as const;
export type PersonSkill = (typeof PERSON_SKILLS)[number];

export const MEDIA_KINDS = ['PHOTO', 'RECEIPT', 'VOICE'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const COMPLETENESS_STATES = ['COMPLETE', 'PARTIAL', 'MISSING'] as const;
export type CompletenessState = (typeof COMPLETENESS_STATES)[number];

export const COMPLETENESS_SCOPES = ['SITE', 'VEHICLE'] as const;
export type CompletenessScope = (typeof COMPLETENESS_SCOPES)[number];

export const VEHICLE_LOG_KINDS = ['START', 'END'] as const;
export type VehicleLogKind = (typeof VEHICLE_LOG_KINDS)[number];

export const VEHICLE_DOC_KINDS = ['RC', 'INSURANCE', 'PUC', 'FITNESS', 'PERMIT'] as const;
export type VehicleDocKind = (typeof VEHICLE_DOC_KINDS)[number];

export const NOTIFICATION_TYPES = [
  'APPROVAL_REQUESTED',
  'APPROVAL_DECIDED',
  'ASSIGNMENT_CHANGED',
  'ISSUE_RAISED',
  'SYNC_FAILED',
  'DAILY_DIGEST',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Record types toggled per-org in OrgConfig.records.enabled and used by the record registry. */
export const RECORD_TYPES = [
  'progress',
  'expense',
  'fuel',
  'trip',
  'materialUsage',
  'materialMove',
  'issue',
  'attendance',
  'leave',
  'vehicleStartEnd',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Offline outbox (client SQLite only). */
export const OUTBOX_STATUSES = ['PENDING', 'IN_FLIGHT', 'SYNCED', 'FAILED'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const OUTBOX_OPS = ['CREATE', 'UPDATE', 'VOID'] as const;
export type OutboxOp = (typeof OUTBOX_OPS)[number];

export const LOCALES = ['hi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
