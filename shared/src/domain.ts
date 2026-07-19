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
  PaymentMode,
  CashTransferKind,
  MoneyTag,
  VendorPaymentKind,
  ComplaintTarget,
  ReminderKind,
  ReminderRecurrence,
} from './enums';
import type { OrgConfig, EmergencyContact, SiteExpenseFormConfig, MaterialTypeConfig } from './config';

/** Round 2 two-tick rule: the accountant's VERIFIED mark carried by money rows.
 *  verifiedAt set → immutable; flagged → 🚩 SM + Owner see it, Owner resolves. */
export interface VerificationFields {
  verifiedBy: UUID | null;
  verifiedAt: Timestamp | null;
  flagged: boolean;
  flagNote: string | null;
}

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
  /** Round 2 (C6): ID-card family details — SM/Owner-only edit after onboarding. */
  guardianName: string | null;
  guardianPhone: string | null;
  /** frozen.12: the site this person belongs to (sites are independent — labour master is
   *  site-scoped for SM/Accountant). Server-set at creation; null = unassigned (Owner-created). */
  siteId: UUID | null;
}

export interface Crew extends AuditFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  /** Round 2: renamed from teamHeadUserId — the crew's SUPERVISOR. */
  supervisorUserId: UUID;
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
  /** Round 2: the site's per-site accountant (Owner-assigned). */
  accountantId: UUID | null;
  emergencyContacts: EmergencyContact[];
  expenseFormConfig: SiteExpenseFormConfig | null;
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
  markedBy: UUID; // legacy: attendance is OUT of the app for every role (Round 2)
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
  siteId: UUID | null;
  name: string;
  phone: string | null;
  sells: string | null;
}

export interface Expense extends AuditFields, VerificationFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  category: ExpenseCategory;
  /** frozen.10 (SM-2): SM-configured subcategory key under `category` (nullable). */
  subcategory: string | null;
  amountPaise: Paise;
  vendorId: UUID | null;
  billNo: string | null;
  receiptMediaId: UUID | null;
  paidVia: PaymentMode;
  remark: string | null;
  businessDate: BusinessDate;
  enteredBy: UUID;
  void: boolean;
}

export interface FuelLog extends AuditFields {
  id: UUID;
  orgId: UUID;
  vehicleId: UUID;
  /** frozen.10 (DRV-4): null when the diesel came from site stock / khata (no money paid). */
  amountPaise: Paise | null;
  /** frozen.10 (DRV-4): true only when the driver actually paid. */
  paidByDriver: boolean;
  litres: number;
  reading: number; // odometer/hour-meter at fill
  receiptMediaId: UUID | null;
  businessDate: BusinessDate;
  /** Round 2 (C7): diesel-match state vs the supervisor's issuance. */
  status: MaterialTxnStatus;
  matchedIssuanceId: UUID | null;
}

/** Round 2 (C7): supervisor's bulk diesel purchase — site stock = purchases − issuances. */
export interface FuelStockPurchase extends AuditFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  litres: number;
  amountPaise: Paise | null;
  receiptMediaId: UUID | null;
  purchasedBy: UUID;
  businessDate: BusinessDate;
  note: string | null;
}

/** Round 2 (C7): supervisor's ISSUED side of the diesel double-check. */
export interface FuelIssuance extends AuditFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID;
  vehicleId: UUID;
  litres: number;
  issuedBy: UUID;
  businessDate: BusinessDate;
  status: MaterialTxnStatus;
  matchedFuelLogId: UUID | null;
  note: string | null;
}

/** Round 2 (C7): one row of the diesel red-flag list (accountant / SM / Owner). */
export interface FuelMatchFlag {
  vehicleId: UUID;
  siteId: UUID;
  businessDate: BusinessDate;
  issuedLitres: number | null; // null = supervisor side missing
  receivedLitres: number | null; // null = driver side missing
  status: MaterialTxnStatus;
  issuanceId: UUID | null;
  fuelLogId: UUID | null;
}

export interface VehicleLog extends AuditFields {
  id: UUID;
  orgId: UUID;
  vehicleId: UUID;
  driverPersonId: UUID;
  startReading: number;
  endReading: number | null;
  hoursWorked: number | null;
  loadsCount: number | null;
  note: string | null;
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
  /** Round 2 (C11): per-type entry rules (SM-set); null = defaults (supervisor-only logs). */
  config: MaterialTypeConfig | null;
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
  /** Round 2 (C11): SUPERVISOR entry = final; DRIVER pick = data-only input. */
  enteredRole: Role | null;
  finalized: boolean;
  /** frozen.10 (SUP-4): free note — the UI requires it when the "Other" material is picked. */
  remark: string | null;
}

export interface Issue extends AuditFields {
  id: UUID;
  orgId: UUID;
  siteId: UUID | null;
  vehicleId: UUID | null;
  severity: IssueSeverity;
  description: string;
  status: IssueStatus;
  resolvedBy: UUID | null;
  resolutionNote: string | null;
  closingNote: string | null;
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

export interface ApprovalRequest extends AuditFields, VerificationFields {
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

// ---- Client-plan v1 read models: contacts · ledger · vendors · insights · vehicle drill-downs ----

export interface ContactPerson {
  name: string;
  phone: string | null;
}
/** Resolved tap-to-call panel for the calling user (worker/driver dashboards). */
export interface ContactPanel {
  siteManager: ContactPerson | null;
  /** Round 2: renamed from teamHead. */
  supervisor: ContactPerson | null;
  emergency: EmergencyContact[];
}

export interface CashTransfer extends AuditFields, VerificationFields {
  id: UUID;
  orgId: UUID;
  fromUserId: UUID;
  toUserId: UUID;
  amountPaise: Paise;
  kind: CashTransferKind;
  /** Round 2: WORK = khata advance; SALARY/PERSONAL = personal draw. */
  tag: MoneyTag;
  businessDate: BusinessDate;
  note: string | null;
}

/** My khata: balance = received − given − approved CASH expenses. */
export interface MyBalance {
  receivedPaise: Paise;
  givenPaise: Paise;
  spentPaise: Paise;
  balancePaise: Paise;
}

export interface LedgerRollupRow {
  userId: UUID;
  name: string;
  role: Role;
  receivedPaise: Paise;
  givenPaise: Paise;
  spentPaise: Paise;
  balancePaise: Paise;
  byCategory: Partial<Record<ExpenseCategory, Paise>>;
}

export interface VendorPayment extends AuditFields, VerificationFields {
  id: UUID;
  orgId: UUID;
  vendorId: UUID;
  /** Round 2: PAYMENT = pay the vendor; RECEIPT = vendor money-IN. */
  kind: VendorPaymentKind;
  amountPaise: Paise;
  businessDate: BusinessDate;
  note: string | null;
}

/** Shop khata: purchased (credit expenses) vs paid vs received (money-IN), month-wise ('YYYY-MM').
 *  balance = purchased + received − paid (what the site owes the vendor). */
export interface VendorLedger {
  vendorId: UUID;
  name: string;
  purchasedPaise: Paise;
  paidPaise: Paise;
  /** Round 2: vendor money-IN total (RECEIPT rows). */
  receivedPaise: Paise;
  balancePaise: Paise;
  months: Array<{ month: string; purchasedPaise: Paise; paidPaise: Paise; receivedPaise: Paise }>;
}

export interface DayInsights {
  businessDate: BusinessDate;
  progress: ProgressNote[];
  expenses: Expense[];
  requests: ApprovalRequest[];
  noProgress: boolean;
  totalExpensePaise: Paise;
}

export interface PeriodTotals {
  from: BusinessDate;
  to: BusinessDate;
  totalExpensePaise: Paise;
  byCategory: Partial<Record<ExpenseCategory, Paise>>;
  progressDays: number;
  noProgressDays: number;
  requestsPending: number;
  requestsApproved: number;
  requestsRejected: number;
}

/** Per-person drill-down (TH crew / SM site / Owner org scope). */
export interface PersonInsights {
  userId: UUID | null;
  personId: UUID | null;
  name: string;
  days: DayInsights[];
  totals: PeriodTotals;
}

/** Driver dashboard vehicle card. */
export interface VehicleSnapshot {
  vehicle: Vehicle;
  currentReading: number | null;
  previousReading: number | null;
  pendingSwitchRequestId: UUID | null;
}

export interface VehicleAnalytics {
  vehicleId: UUID;
  avgRunPerDay7: number | null;
  avgRunPerDay30: number | null;
  avgRunPerDay90: number | null;
  fuelLitres30: number;
  fuelPaise30: Paise;
  monthlyCostPaise: Paise;
  totalExpensePaise: Paise;
}

export interface VehicleDetail {
  vehicle: Vehicle;
  analytics: VehicleAnalytics;
  logs: VehicleLog[];
  fuel: FuelLog[];
  expenses: Expense[];
  trips: Trip[];
  damages: Issue[];
}

export interface DriverDetail {
  user: User;
  person: Person | null;
  vehicle: Vehicle | null;
  logs: VehicleLog[];
  fuel: FuelLog[];
  trips: Trip[];
  expenses: Expense[];
}

// ---- Round 2 (frozen.8) read models: complaints · vehicle docs · my-money · accountant queue ----

export interface Complaint extends AuditFields {
  id: UUID;
  orgId: UUID;
  /** frozen.10 (SUP-1): per-org human number (#101, #102…) — the trackable ID. */
  complaintNo: number;
  raisedBy: UUID;
  target: ComplaintTarget;
  siteId: UUID | null;
  text: string;
  mediaIds: UUID[];
  status: IssueStatus;
}

/** Per-vehicle document vault entry (SM + Owner ONLY). */
export interface VehicleDocument extends AuditFields {
  id: UUID;
  orgId: UUID;
  vehicleId: UUID;
  kind: VehicleDocKind;
  title: string;
  mediaId: UUID | null;
  expiryDate: BusinessDate | null;
  note: string | null;
}

export interface VehicleReminder extends AuditFields {
  id: UUID;
  orgId: UUID;
  vehicleId: UUID;
  documentId: UUID | null;
  label: string;
  kind: ReminderKind;
  dueDate: BusinessDate;
  recurrence: ReminderRecurrence;
  remindDaysBefore: number;
  active: boolean;
  lastNotifiedFor: BusinessDate | null;
}

/** "Money I've taken" (C10): one verified personal draw shown to its receiver. */
export interface MyMoneyEntry {
  id: UUID;
  businessDate: BusinessDate;
  amountPaise: Paise;
  tag: MoneyTag; // SALARY | PERSONAL
  fromUserId: UUID;
  fromName: string;
  note: string | null;
  /** frozen.11: null for WORK-tag entries (`GET /me/money?tag=WORK` — khata credits show regardless of the tick). */
  verifiedAt: Timestamp | null;
}
export interface MyMoney {
  entries: MyMoneyEntry[];
  totalPaise: Paise;
}

/** The accountant's screen: a WORK QUEUE, not analytics (client decision). */
export interface AccountantQueue {
  pendingRequests: ApprovalRequest[];
  unverifiedExpenses: Expense[];
  unverifiedTransfers: CashTransfer[];
  unverifiedVendorPayments: VendorPayment[];
  fuelFlags: FuelMatchFlag[];
  decidedToday: { approved: number; rejected: number; verified: number };
  /** Cash currently in the accountant's own hands (his khata balance). */
  cashInHandPaise: Paise;
}

export interface AuthSession {
  user: User;
  org: Org;
  accessToken: string;
  refreshToken: string;
}
