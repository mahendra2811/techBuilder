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
} from './enums';
import type { EmergencyContact, SiteExpenseFormConfig } from './config';

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
  amountPaise: Paise;
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
  businessDate: BusinessDate;
  note?: string;
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
  amountPaise: Paise;
  businessDate: BusinessDate;
  note?: string;
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
