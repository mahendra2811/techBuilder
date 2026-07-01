/**
 * Domain entity types — FROZEN read models returned by the API / adapters.
 * Mirror the DB (db/schema.ts) but are the transport shape. All amounts are Paise; dates are BusinessDate; instants Timestamp.
 */
import type { UUID, Paise, BusinessDate, Timestamp, AuditFields } from './common';
import type {
  Role,
  PersonSkill,
  SiteStatus,
  VehicleStatus,
  VehicleTrackingMode,
  VehicleDocKind,
  AttendanceStatus,
  LeaveType,
  ExpenseCategory,
  Uom,
  MaterialTxnType,
  MaterialTxnStatus,
  IssueSeverity,
  IssueStatus,
  MediaKind,
  ApprovalType,
  ApprovalStatus,
  NotificationType,
  CompletenessScope,
  CompletenessState,
  Locale,
} from './enums';
import type { OrgConfig } from './config';

export interface Org {
  id: UUID;
  name: string;
  code: string;
  config: OrgConfig;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface User extends AuditFields {
  id: UUID;
  orgId: UUID;
  personId: UUID | null; // link to labour master if this login represents a person
  name: string;
  username: string;
  phone: string | null;
  role: Role;
  mustChangePassword: boolean;
  assignedSiteId: UUID | null;
  crewId: UUID | null;
  allowedVehicleTypeIds: UUID[]; // DRIVER only
  emergencyContact: string | null;
  active: boolean;
}

/** Labour master — attendance/wage subject. MAY have no user account (phone-less workers). */
export interface Person extends AuditFields {
  id: UUID;
  orgId: UUID;
  name: string;
  phone: string | null;
  skill: PersonSkill | null;
  defaultWagePaise: Paise | null;
  active: boolean;
}

export interface Crew extends AuditFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  teamHeadUserId: UUID;
  name: string;
  memberPersonIds: UUID[];
}

export interface Site extends AuditFields {
  id: UUID;
  orgId: UUID;
  name: string;
  code: string;
  lat: number | null;
  lng: number | null;
  status: SiteStatus;
  weeklyOff: number[]; // 0=Sun..6=Sat
  startDate: BusinessDate | null;
  expectedEndDate: BusinessDate | null;
  budgetPaise: Paise | null;
  siteManagerId: UUID | null;
}

export interface SiteHoliday {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  date: BusinessDate;
  label: string;
}

export interface VehicleType extends AuditFields {
  id: UUID;
  orgId: UUID;
  name: string;
  trackingMode: VehicleTrackingMode;
  fieldsSchema: Array<{ key: string; label: string; type: 'text' | 'number' | 'select' | 'photo'; required: boolean }>;
}

export interface VehicleDoc {
  kind: VehicleDocKind;
  mediaId: UUID | null;
  expiry: BusinessDate | null;
}

export interface Vehicle extends AuditFields {
  id: UUID;
  orgId: UUID;
  vehicleTypeId: UUID;
  regNo: string;
  name: string | null;
  values: Record<string, unknown>; // values for the type's fieldsSchema
  assignedSiteId: UUID | null;
  assignedDriverPersonId: UUID | null;
  status: VehicleStatus;
  docs: VehicleDoc[];
}

export interface Attendance extends AuditFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  crewId: UUID | null;
  personId: UUID;
  businessDate: BusinessDate;
  status: AttendanceStatus;
  otHours: number; // default 0
  markedBy: UUID; // ALWAYS a TEAM_HEAD or SITE_MANAGER
}

export interface Leave extends AuditFields {
  id: UUID;
  orgId: UUID;
  personId: UUID;
  startDate: BusinessDate;
  endDate: BusinessDate;
  type: LeaveType;
  reason: string | null;
}

export interface WageRate extends AuditFields {
  id: UUID;
  orgId: UUID;
  personId: UUID;
  dailyPaise: Paise;
  effectiveFrom: BusinessDate;
}

export interface Advance extends AuditFields {
  id: UUID;
  orgId: UUID;
  personId: UUID | null;
  crewId: UUID | null;
  amountPaise: Paise;
  businessDate: BusinessDate;
  note: string | null;
}

export interface ProgressNote extends AuditFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  text: string;
  businessDate: BusinessDate;
  enteredBy: UUID;
  mediaIds: UUID[];
}

export interface Vendor extends AuditFields {
  id: UUID;
  orgId: UUID;
  name: string;
  phone: string | null;
}

export interface Expense extends AuditFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  category: ExpenseCategory;
  amountPaise: Paise;
  vendorId: UUID | null;
  billNo: string | null;
  receiptMediaId: UUID | null;
  businessDate: BusinessDate;
  enteredBy: UUID;
  void: boolean;
}

export interface FuelLog extends AuditFields {
  id: UUID;
  orgId: UUID;
  vehicleId: UUID;
  amountPaise: Paise;
  litres: number;
  reading: number; // odometer/hour-meter at fill
  receiptMediaId: UUID | null;
  businessDate: BusinessDate;
}

export interface VehicleLog extends AuditFields {
  id: UUID;
  orgId: UUID;
  vehicleId: UUID;
  driverPersonId: UUID;
  startReading: number;
  endReading: number | null;
  businessDate: BusinessDate;
}

export interface Trip extends AuditFields {
  id: UUID;
  orgId: UUID;
  vehicleId: UUID;
  fromText: string;
  toText: string;
  purpose: string | null;
  materialTxnId: UUID | null;
  businessDate: BusinessDate;
}

export interface Material extends AuditFields {
  id: UUID;
  orgId: UUID;
  name: string;
  uom: Uom;
}

export interface MaterialBalance {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  materialId: UUID;
  opening: number;
  businessDate: BusinessDate;
}

export interface MaterialTxn extends AuditFields {
  id: UUID;
  orgId: UUID;
  type: MaterialTxnType;
  materialId: UUID;
  qty: number;
  uom: Uom;
  siteId: UUID;
  counterpartSiteId: UUID | null; // for DISPATCH/RECEIVE
  relatedTxnId: UUID | null; // links DISPATCH ↔ RECEIVE
  status: MaterialTxnStatus;
  businessDate: BusinessDate;
}

export interface Issue extends AuditFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID | null;
  vehicleId: UUID | null;
  severity: IssueSeverity;
  description: string;
  status: IssueStatus;
  businessDate: BusinessDate;
  mediaIds: UUID[];
}

export interface Media {
  id: UUID;
  orgId: UUID;
  kind: MediaKind;
  r2Key: string;
  thumbKey: string | null;
  parentType: string;
  parentId: UUID;
  lat: number | null;
  lng: number | null;
  takenAt: Timestamp;
}

export interface ApprovalRequest extends AuditFields {
  id: UUID;
  orgId: UUID;
  type: ApprovalType;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requestedBy: UUID;
  approverUserId: UUID | null;
  decidedAt: Timestamp | null;
  comment: string | null;
}

export interface Notification {
  id: UUID;
  orgId: UUID;
  userId: UUID;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface AuditLog {
  id: UUID;
  orgId: UUID;
  actorUserId: UUID;
  action: string;
  entityType: string;
  entityId: UUID;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: Timestamp;
}

/** Derived: per site/vehicle/business-day completeness. */
export interface Completeness {
  orgId: UUID;
  scopeType: CompletenessScope;
  scopeId: UUID;
  businessDate: BusinessDate;
  state: CompletenessState;
}

// ---- Derived / computed read models (not stored 1:1) ----

export interface WageSummaryRow {
  personId: UUID;
  personName: string;
  crewId: UUID | null;
  siteId: UUID;
  presentDays: number;
  halfDays: number;
  otHours: number;
  ratePaise: Paise;
  grossPayablePaise: Paise;
  advancePaise: Paise;
  netPayablePaise: Paise;
}

export interface WageSummary {
  window: { from: BusinessDate; to: BusinessDate };
  rows: WageSummaryRow[];
  totals: { grossPaise: Paise; advancePaise: Paise; netPaise: Paise };
}

export interface CostRollup {
  bySite: Array<{ siteId: UUID; totalPaise: Paise }>;
  byVehicle: Array<{ vehicleId: UUID; totalPaise: Paise }>;
  byCrew: Array<{ crewId: UUID; totalPaise: Paise }>;
  byMaterial: Array<{ materialId: UUID; qty: number; uom: Uom }>;
}

export interface FuelReconRow {
  vehicleId: UUID;
  expectedLitres: number;
  actualLitres: number;
  variancePct: number;
  flagged: boolean;
}

export interface MaterialReconRow {
  siteId: UUID;
  materialId: UUID;
  opening: number;
  inQty: number;
  consumed: number;
  dispatched: number;
  received: number;
  balance: number;
  negativeFlag: boolean;
}

export interface Reconciliation {
  window: { from: BusinessDate; to: BusinessDate };
  fuel: FuelReconRow[];
  material: MaterialReconRow[];
}

export interface OwnerDashboard {
  window: { from: BusinessDate; to: BusinessDate };
  kpis: {
    activeSites: number;
    headcountToday: number;
    vehiclesActiveToday: number;
    spendTodayPaise: Paise;
    openIssues: number;
    pendingApprovals: number;
  };
  completeness: Completeness[];
  costRollup: CostRollup;
}

export interface AuthSession {
  user: User;
  org: Org;
  accessToken: string;
  refreshToken: string;
}
