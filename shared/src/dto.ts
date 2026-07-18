/**
 * Input DTOs — FROZEN. Client-supplied fields only (server fills id?/audit/org).
 * NOTE: `id` is client-generated UUIDv7 and IS supplied on create (offline-first). `idempotencyKey` rides on the sync envelope.
 */
import type { UUID, Paise, BusinessDate, DateWindow } from './common';
import type {
  Role,
  PersonSkill,
  SiteStatus,
  VehicleStatus,
  AttendanceStatus,
  LeaveType,
  ExpenseCategory,
  Uom,
  MaterialTxnType,
  IssueSeverity,
  ApprovalType,
  VehicleDocKind,
  PaymentMode,
  CashTransferKind,
  MoneyTag,
  VendorPaymentKind,
  ComplaintTarget,
  ReminderKind,
  ReminderRecurrence,
} from './enums';
import type { EmergencyContact, SiteExpenseFormConfig, MaterialTypeConfig } from './config';

export interface LoginInput {
  username: string;
  password: string;
  deviceId: string;
}
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserInput {
  id: UUID;
  personId?: UUID;
  name: string;
  username: string;
  phone?: string;
  role: Role;
  assignedSiteId?: UUID;
  crewId?: UUID;
  allowedVehicleTypeIds?: UUID[];
  emergencyContact?: string;
  tempPassword: string;
}

export interface CreatePersonInput {
  id: UUID;
  name: string;
  phone?: string;
  skill?: PersonSkill;
  defaultWagePaise?: Paise;
  /** Round 2 (C6): set once at onboarding by whoever creates the person. */
  guardianName?: string;
  guardianPhone?: string;
}

/** Round 2: person edit. Guardian/phone changes are stripped server-side unless the caller is SM (own site) / Owner. */
export interface UpdatePersonInput {
  name?: string;
  phone?: string;
  skill?: PersonSkill;
  defaultWagePaise?: Paise;
  guardianName?: string;
  guardianPhone?: string;
}

/** frozen.9: one-time guardian/emergency-contact self-add (PATCH /me/guardian).
 *  Allowed only while BOTH fields are still empty on the caller's linked person;
 *  later edits go through UpdatePersonInput (SM/Owner). */
export interface SetGuardianInput {
  guardianName: string;
  guardianPhone: string;
}

export interface CreateSiteInput {
  id: UUID;
  name: string;
  code: string;
  lat?: number;
  lng?: number;
  status?: SiteStatus;
  weeklyOff?: number[];
  startDate?: BusinessDate;
  expectedEndDate?: BusinessDate;
  budgetPaise?: Paise;
  siteManagerId?: UUID;
  /** Round 2: the site's per-site accountant (Owner-assigned). */
  accountantId?: UUID;
}

/** Round 2: narrow Owner-only site update (role assignments; NOT the SM config path). */
export interface UpdateSiteInput {
  siteManagerId?: UUID | null;
  accountantId?: UUID | null;
}

export interface CreateVehicleTypeInput {
  id: UUID;
  name: string;
  trackingMode: 'KM' | 'HOURS';
  fieldsSchema: Array<{ key: string; label: string; type: 'text' | 'number' | 'select' | 'photo'; required: boolean }>;
}

export interface CreateVehicleInput {
  id: UUID;
  vehicleTypeId: UUID;
  regNo: string;
  name?: string;
  values?: Record<string, unknown>;
  assignedSiteId?: UUID;
  assignedDriverPersonId?: UUID;
  status?: VehicleStatus;
  docs?: Array<{ kind: VehicleDocKind; mediaId?: UUID; expiry?: BusinessDate }>;
}

export interface MarkAttendanceRow {
  id: UUID;
  personId: UUID;
  status: AttendanceStatus;
  otHours?: number;
}
export interface MarkAttendanceInput {
  siteId: UUID;
  crewId?: UUID;
  businessDate: BusinessDate;
  rows: MarkAttendanceRow[];
}

export interface CreateLeaveInput {
  id: UUID;
  personId: UUID;
  startDate: BusinessDate;
  endDate: BusinessDate;
  type: LeaveType;
  reason?: string;
}

export interface SetWageRateInput {
  id: UUID;
  personId: UUID;
  dailyPaise: Paise;
  effectiveFrom: BusinessDate;
}
export interface CreateAdvanceInput {
  id: UUID;
  personId?: UUID;
  crewId?: UUID;
  amountPaise: Paise;
  businessDate: BusinessDate;
  note?: string;
}

export interface CreateProgressNoteInput {
  id: UUID;
  siteId: UUID;
  text: string;
  businessDate: BusinessDate;
  mediaIds?: UUID[];
}
export interface CreateExpenseInput {
  id: UUID;
  siteId: UUID;
  category: ExpenseCategory;
  /** frozen.10 (SM-2): key of an SM-configured subcategory under `category`. */
  subcategory?: string;
  amountPaise: Paise;
  vendorId?: UUID;
  billNo?: string;
  receiptMediaId?: UUID;
  paidVia?: PaymentMode; // default CASH
  remark?: string;
  businessDate: BusinessDate;
}
export interface CreateFuelLogInput {
  id: UUID;
  vehicleId: UUID;
  /** frozen.10 (DRV-4): omitted when the diesel came from site stock / the shop's khata (no money paid). */
  amountPaise?: Paise;
  /** frozen.10 (DRV-4): true only when the driver actually paid out of pocket. */
  paidByDriver?: boolean;
  litres: number;
  reading: number;
  receiptMediaId?: UUID;
  businessDate: BusinessDate;
}
export interface CreateVehicleLogInput {
  id: UUID;
  vehicleId: UUID;
  driverPersonId: UUID;
  startReading: number;
  endReading?: number;
  hoursWorked?: number;
  loadsCount?: number;
  note?: string;
  businessDate: BusinessDate;
}
export interface CreateTripInput {
  id: UUID;
  vehicleId: UUID;
  fromText: string;
  toText: string;
  purpose?: string;
  materialTxnId?: UUID;
  businessDate: BusinessDate;
}
export interface CreateMaterialTxnInput {
  id: UUID;
  type: MaterialTxnType;
  materialId: UUID;
  qty: number;
  uom: Uom;
  siteId: UUID;
  counterpartSiteId?: UUID;
  relatedTxnId?: UUID;
  businessDate: BusinessDate;
  /** frozen.10 (SUP-4): free note — the UI requires it when the "Other" material is picked. */
  remark?: string;
}

/** frozen.10 (SUP-7): supervisor allots a vehicle to one of his crew drivers (direct, log-only). */
export interface AssignDriverInput {
  driverPersonId: UUID;
}
export interface CreateIssueInput {
  id: UUID;
  siteId?: UUID;
  vehicleId?: UUID;
  severity: IssueSeverity;
  description: string;
  businessDate: BusinessDate;
  mediaIds?: UUID[];
}

export interface SubmitRequestInput {
  id: UUID;
  type: ApprovalType;
  payload: Record<string, unknown>;
}
export interface DecideRequestInput {
  approve: boolean;
  comment?: string;
  /** EXPENSE_ADD only: decider's final category override ("the SM creates the final expense"). */
  categoryOverride?: ExpenseCategory;
}

/** Payload for type='EXPENSE_ADD' requests. siteId is derived server-side for workers/drivers. */
export interface ExpenseRequestPayload {
  siteId?: UUID;
  category: ExpenseCategory;
  amountPaise: Paise;
  businessDate: BusinessDate;
  paidVia?: PaymentMode; // default CASH
  vendorId?: UUID;
  billNo?: string;
  remark?: string;
  mediaIds?: UUID[];
}

export interface CreateCashTransferInput {
  id: UUID;
  toUserId: UUID;
  amountPaise: Paise;
  kind: CashTransferKind;
  /** Round 2: WORK (default) = khata advance; SALARY/PERSONAL = personal draw (givers: Owner/SM/Accountant only). */
  tag?: MoneyTag;
  businessDate: BusinessDate;
  note?: string;
}

/** Round 2 two-tick rule: the accountant's verdict on a money event (expense / request / cash transfer). */
export interface VerifyInput {
  /** true = verified ✓ (row becomes immutable); false = flagged 🚩 (SM + Owner notified). */
  ok: boolean;
  /** Required when ok=false — what didn't match. */
  flagNote?: string;
}

export interface CreateVendorInput {
  id: UUID;
  name: string;
  phone?: string;
  siteId?: UUID;
  sells?: string;
}

export interface CreateVendorPaymentInput {
  id: UUID;
  vendorId: UUID;
  /** Round 2: PAYMENT (default) = pay the vendor; RECEIPT = vendor money-IN. */
  kind?: VendorPaymentKind;
  amountPaise: Paise;
  businessDate: BusinessDate;
  note?: string;
}

// ---- Round 2 (frozen.8): diesel · materials · complaints · vehicle docs ----

export interface CreateFuelStockPurchaseInput {
  id: UUID;
  siteId: UUID;
  litres: number;
  amountPaise?: Paise;
  receiptMediaId?: UUID;
  businessDate: BusinessDate;
  note?: string;
}

export interface CreateFuelIssuanceInput {
  id: UUID;
  /** Derived from the vehicle's assigned site when omitted. */
  siteId?: UUID;
  vehicleId: UUID;
  litres: number;
  businessDate: BusinessDate;
  note?: string;
}

export interface CreateMaterialInput {
  id: UUID;
  name: string;
  uom: Uom;
  config?: MaterialTypeConfig;
}
export interface UpdateMaterialInput {
  name?: string;
  config?: MaterialTypeConfig;
}

export interface CreateComplaintInput {
  id: UUID;
  /** SITE_MANAGER-addressed complaints are Owner-visible too; OWNER = private to the Owner. */
  target: ComplaintTarget;
  text: string;
  mediaIds?: UUID[];
}

export interface CreateVehicleDocumentInput {
  id: UUID;
  vehicleId: UUID;
  kind: VehicleDocKind;
  title: string;
  mediaId?: UUID;
  expiryDate?: BusinessDate;
  note?: string;
}
export interface UpdateVehicleDocumentInput {
  kind?: VehicleDocKind;
  title?: string;
  mediaId?: UUID | null;
  expiryDate?: BusinessDate | null;
  note?: string | null;
}

export interface CreateVehicleReminderInput {
  id: UUID;
  vehicleId: UUID;
  documentId?: UUID;
  label: string;
  kind: ReminderKind;
  dueDate: BusinessDate;
  recurrence?: ReminderRecurrence; // default ONCE
  remindDaysBefore?: number; // default 7
}
export interface UpdateVehicleReminderInput {
  label?: string;
  dueDate?: BusinessDate;
  recurrence?: ReminderRecurrence;
  remindDaysBefore?: number;
  active?: boolean;
}

/** SM-scoped narrow site-config update (NOT full site.manage). */
export interface UpdateSiteConfigInput {
  emergencyContacts?: EmergencyContact[];
  expenseFormConfig?: SiteExpenseFormConfig;
}

export interface ResolveIssueInput {
  resolutionNote: string;
}
export interface CloseIssueInput {
  closingNote?: string;
}

/** Presigned upload request → backend returns a PUT url + the media row id. */
export interface PresignMediaInput {
  id: UUID;
  kind: 'PHOTO' | 'RECEIPT' | 'VOICE';
  parentType: string;
  parentId: UUID;
  contentType: string;
  lat?: number;
  lng?: number;
}
export interface PresignMediaResult {
  mediaId: UUID;
  uploadUrl: string;
  r2Key: string;
}

export type { DateWindow };
