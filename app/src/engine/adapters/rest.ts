/**
 * Rest adapter — talks to the NestJS backend over the frozen ENDPOINTS. Implements the SAME interfaces
 * as MockClient, so flipping createClients('mock'→'rest') changes ZERO screens. Backend wraps success as
 * `{ data }` and errors as `{ error: { code, message, fields?, traceId } }`.
 */
import {
  API_BASE,
  type AuthClient,
  type RecordsClient,
  type SyncClient,
  type Paginated,
  type AuthSession,
  type DateWindow,
  type SyncEvent,
  type SyncResult,
} from '@techbuilder/contracts';
import type * as D from '@techbuilder/contracts';
import type * as Dto from '@techbuilder/contracts';

export interface RestOptions {
  apiBaseUrl: string; // origin, e.g. https://api.techbuilder.in
  getAccessToken: () => string | null;
}

type Method = 'GET' | 'POST' | 'PATCH';
const page = <T>(items: T[]): Paginated<T> => ({ items, meta: { nextCursor: null } });
const qs = (q: Record<string, string | null | undefined>): string => {
  const p = Object.entries(q).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
  return p.length ? `?${p.join('&')}` : '';
};

export class RestClient implements AuthClient, RecordsClient, SyncClient {
  constructor(private readonly opts: RestOptions) {}

  private async req<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const token = this.opts.getAccessToken();
    const res = await fetch(`${this.opts.apiBaseUrl}${API_BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code: string; message: string } };
    if (!res.ok || json.error) {
      throw Object.assign(new Error(json.error?.message ?? `Request failed (${res.status})`), { code: json.error?.code ?? 'INTERNAL' });
    }
    return json.data as T;
  }

  // ---- AuthClient ----
  login(input: Dto.LoginInput): Promise<AuthSession> { return this.req('POST', '/auth/login', input); }
  refresh(refreshToken: string, deviceId: string): Promise<Pick<AuthSession, 'accessToken' | 'refreshToken'>> { return this.req('POST', '/auth/refresh', { refreshToken, deviceId }); }
  async logout(deviceId: string): Promise<void> { await this.req('POST', '/auth/logout', { deviceId }); }
  async changePassword(input: Dto.ChangePasswordInput): Promise<void> { await this.req('POST', '/auth/change-password', input); }
  me(): Promise<{ user: D.User; org: D.Org }> { return this.req('GET', '/me'); }

  // ---- masters ----
  createUser(i: Dto.CreateUserInput): Promise<D.User> { return this.req('POST', '/users', i); }
  async listUsers(): Promise<Paginated<D.User>> { return page(await this.req<D.User[]>('GET', '/users')); }
  async deactivateUser(id: string): Promise<void> { await this.req('POST', `/users/${id}/deactivate`); }
  createPerson(i: Dto.CreatePersonInput): Promise<D.Person> { return this.req('POST', '/people', i); }
  async listPeople(): Promise<Paginated<D.Person>> { return page(await this.req<D.Person[]>('GET', '/people')); }
  createSite(i: Dto.CreateSiteInput): Promise<D.Site> { return this.req('POST', '/sites', i); }
  async listSites(): Promise<Paginated<D.Site>> { return page(await this.req<D.Site[]>('GET', '/sites')); }
  getSite(id: string): Promise<D.Site> { return this.req('GET', `/sites/${id}`); }
  createVehicleType(i: Dto.CreateVehicleTypeInput): Promise<D.VehicleType> { return this.req('POST', '/vehicle-types', i); }
  listVehicleTypes(): Promise<D.VehicleType[]> { return this.req('GET', '/vehicle-types'); }
  createVehicle(i: Dto.CreateVehicleInput): Promise<D.Vehicle> { return this.req('POST', '/vehicles', i); }
  async listVehicles(): Promise<Paginated<D.Vehicle>> { return page(await this.req<D.Vehicle[]>('GET', '/vehicles')); }

  // ---- attendance / leave / wage ----
  markAttendance(i: Dto.MarkAttendanceInput): Promise<D.Attendance[]> { return this.req('POST', '/attendance', i); }
  listAttendance(siteId: string, w: DateWindow): Promise<D.Attendance[]> { return this.req('GET', `/attendance${qs({ siteId, from: w.from, to: w.to })}`); }
  createLeave(i: Dto.CreateLeaveInput): Promise<D.Leave> { return this.req('POST', '/leave', i); }
  setWageRate(i: Dto.SetWageRateInput): Promise<D.WageRate> { return this.req('POST', '/wage-rates', i); }
  createAdvance(i: Dto.CreateAdvanceInput): Promise<D.Advance> { return this.req('POST', '/advances', i); }

  // ---- records ----
  createProgressNote(i: Dto.CreateProgressNoteInput): Promise<D.ProgressNote> { return this.req('POST', '/records/progress', i); }
  createExpense(i: Dto.CreateExpenseInput): Promise<D.Expense> { return this.req('POST', '/records/expense', i); }
  createFuelLog(i: Dto.CreateFuelLogInput): Promise<D.FuelLog> { return this.req('POST', '/records/fuel', i); }
  createVehicleLog(i: Dto.CreateVehicleLogInput): Promise<D.VehicleLog> { return this.req('POST', '/records/vehicle-log', i); }
  createTrip(i: Dto.CreateTripInput): Promise<D.Trip> { return this.req('POST', '/records/trip', i); }
  createMaterialTxn(i: Dto.CreateMaterialTxnInput): Promise<D.MaterialTxn> { return this.req('POST', '/records/material-txn', i); }
  createIssue(i: Dto.CreateIssueInput): Promise<D.Issue> { return this.req('POST', '/records/issue', i); }
  async updateRecord(entityType: string, id: string, patch: Record<string, unknown>): Promise<void> { await this.req('PATCH', `/records/${entityType}/${id}`, patch); }
  async voidRecord(entityType: string, id: string): Promise<void> { await this.req('POST', `/records/${entityType}/${id}/void`); }
  async listRecords(entityType: string, siteId: string | null, w: DateWindow): Promise<Paginated<unknown>> {
    return page(await this.req<unknown[]>('GET', `/records/${entityType}${qs({ siteId, from: w.from, to: w.to })}`));
  }

  // ---- approvals ----
  submitRequest(i: Dto.SubmitRequestInput): Promise<D.ApprovalRequest> { return this.req('POST', '/requests', i); }
  decideRequest(id: string, i: Dto.DecideRequestInput): Promise<D.ApprovalRequest> { return this.req('POST', `/requests/${id}/decide`, i); }
  listRequests(status?: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<D.ApprovalRequest[]> { return this.req('GET', `/requests${qs({ status })}`); }

  // ---- media ----
  presignMedia(i: Dto.PresignMediaInput): Promise<Dto.PresignMediaResult> { return this.req('POST', '/media/presign', i); }

  // ---- rollups / reports ----
  getOwnerDashboard(w: DateWindow): Promise<D.OwnerDashboard> { return this.req('GET', `/dashboards/owner${qs({ from: w.from, to: w.to })}`); }
  getCompleteness(w: DateWindow): Promise<D.Completeness[]> { return this.req('GET', `/completeness${qs({ from: w.from, to: w.to })}`); }
  getWageSummary(w: DateWindow): Promise<D.WageSummary> { return this.req('GET', `/reports/wage-summary${qs({ from: w.from, to: w.to })}`); }
  getReconciliation(w: DateWindow): Promise<D.Reconciliation> { return this.req('GET', `/reports/reconciliation${qs({ from: w.from, to: w.to })}`); }

  // ---- notifications ----
  listNotifications(): Promise<D.Notification[]> { return this.req('GET', '/notifications'); }
  async markNotificationRead(id: string): Promise<void> { await this.req('POST', `/notifications/${id}/read`); }

  // ---- SyncClient ----
  pushBatch(events: SyncEvent[]): Promise<SyncResult[]> { return this.req('POST', '/sync/push', { events }); }
  pull(since: string | null): Promise<{ changes: Array<{ entityType: string; rows: unknown[] }>; cursor: string }> { return this.req('GET', `/sync/pull${qs({ since })}`); }
}
