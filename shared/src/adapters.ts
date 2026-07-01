/**
 * Adapter interfaces — FROZEN. THE inviolable boundary.
 * Screens import ONLY these interfaces — NEVER axios/fetch/RestClient/the DB directly (lint-guarded).
 * Two implementations: MockClient (seeded, offline) and RestClient (talks to the backend). Identical signatures.
 */
import type { UUID, DateWindow, PageQuery, PageMeta } from './common';
import type * as D from './domain';
import type * as Dto from './dto';

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface AuthClient {
  login(input: Dto.LoginInput): Promise<D.AuthSession>;
  refresh(refreshToken: string, deviceId: string): Promise<Pick<D.AuthSession, 'accessToken' | 'refreshToken'>>;
  logout(deviceId: string): Promise<void>;
  changePassword(input: Dto.ChangePasswordInput): Promise<void>;
  me(): Promise<{ user: D.User; org: D.Org }>;
}

export interface SyncEvent {
  outboxId: UUID;
  idempotencyKey: UUID;
  entityType: string;
  op: 'CREATE' | 'UPDATE' | 'VOID';
  payload: unknown;
}
export interface SyncResult {
  outboxId: UUID;
  ok: boolean;
  /** server-resolved version for LWW; or error code for a rejected (CONFLICT) event */
  version?: number;
  errorCode?: string;
}
export interface SyncClient {
  pushBatch(events: SyncEvent[]): Promise<SyncResult[]>;
  pull(since: string | null): Promise<{ changes: Array<{ entityType: string; rows: unknown[] }>; cursor: string }>;
}

/**
 * RecordsClient — all org-scoped reads/writes the screens need.
 * Writes are idempotent (server dedupes on the entity's client UUIDv7 / idempotencyKey).
 */
export interface RecordsClient {
  // --- masters: people, sites, vehicles, crews ---
  createUser(input: Dto.CreateUserInput): Promise<D.User>;
  listUsers(q?: PageQuery): Promise<Paginated<D.User>>;
  deactivateUser(id: UUID): Promise<void>;

  createPerson(input: Dto.CreatePersonInput): Promise<D.Person>;
  listPeople(q?: PageQuery): Promise<Paginated<D.Person>>;

  createSite(input: Dto.CreateSiteInput): Promise<D.Site>;
  listSites(q?: PageQuery): Promise<Paginated<D.Site>>;
  getSite(id: UUID): Promise<D.Site>;

  createVehicleType(input: Dto.CreateVehicleTypeInput): Promise<D.VehicleType>;
  listVehicleTypes(): Promise<D.VehicleType[]>;
  createVehicle(input: Dto.CreateVehicleInput): Promise<D.Vehicle>;
  listVehicles(q?: PageQuery): Promise<Paginated<D.Vehicle>>;

  // --- attendance / leave / wage ---
  markAttendance(input: Dto.MarkAttendanceInput): Promise<D.Attendance[]>;
  listAttendance(siteId: UUID, window: DateWindow): Promise<D.Attendance[]>;
  createLeave(input: Dto.CreateLeaveInput): Promise<D.Leave>;
  setWageRate(input: Dto.SetWageRateInput): Promise<D.WageRate>;
  createAdvance(input: Dto.CreateAdvanceInput): Promise<D.Advance>;

  // --- records ---
  createProgressNote(input: Dto.CreateProgressNoteInput): Promise<D.ProgressNote>;
  createExpense(input: Dto.CreateExpenseInput): Promise<D.Expense>;
  createFuelLog(input: Dto.CreateFuelLogInput): Promise<D.FuelLog>;
  createVehicleLog(input: Dto.CreateVehicleLogInput): Promise<D.VehicleLog>;
  createTrip(input: Dto.CreateTripInput): Promise<D.Trip>;
  createMaterialTxn(input: Dto.CreateMaterialTxnInput): Promise<D.MaterialTxn>;
  createIssue(input: Dto.CreateIssueInput): Promise<D.Issue>;
  /** same-day correction (until business-day +1); audited. */
  updateRecord(entityType: string, id: UUID, patch: Record<string, unknown>): Promise<void>;
  voidRecord(entityType: string, id: UUID): Promise<void>;
  listRecords(entityType: string, siteId: UUID | null, window: DateWindow, q?: PageQuery): Promise<Paginated<unknown>>;

  // --- approvals ---
  submitRequest(input: Dto.SubmitRequestInput): Promise<D.ApprovalRequest>;
  decideRequest(id: UUID, input: Dto.DecideRequestInput): Promise<D.ApprovalRequest>;
  listRequests(status?: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<D.ApprovalRequest[]>;

  // --- media ---
  presignMedia(input: Dto.PresignMediaInput): Promise<Dto.PresignMediaResult>;

  // --- rollups / analytics / reports ---
  getOwnerDashboard(window: DateWindow): Promise<D.OwnerDashboard>;
  getCompleteness(window: DateWindow): Promise<D.Completeness[]>;
  getWageSummary(window: DateWindow): Promise<D.WageSummary>;
  getReconciliation(window: DateWindow): Promise<D.Reconciliation>;

  // --- notifications ---
  listNotifications(): Promise<D.Notification[]>;
  markNotificationRead(id: UUID): Promise<void>;
}
