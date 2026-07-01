/**
 * Mock adapter — in-memory, seeded. Implements AuthClient + RecordsClient + SyncClient from the frozen
 * contracts so screens can be built/tested fully offline. Swapped for RestClient at integration (STEP 4)
 * with ZERO screen changes (identical interfaces).
 */
import { uuidv7 } from 'uuidv7';
import type {
  AuthClient,
  RecordsClient,
  SyncClient,
  Paginated,
  AuthSession,
  DateWindow,
  SyncEvent,
  SyncResult,
} from '@techbuilder/contracts';
import type * as D from '@techbuilder/contracts';
import type * as Dto from '@techbuilder/contracts';
import { ACME_CONFIG } from '../config/config';

const iso = (): string => new Date().toISOString();
const audit = (by: string): D.AuditFields => ({ createdAt: iso(), updatedAt: iso(), createdBy: by, updatedBy: by, deletedAt: null, version: 1 });
const page = <T>(items: T[]): Paginated<T> => ({ items, meta: { nextCursor: null } });

interface Store {
  currentUserId: string;
  org: D.Org;
  users: D.User[];
  people: D.Person[];
  sites: D.Site[];
  vehicleTypes: D.VehicleType[];
  vehicles: D.Vehicle[];
  attendance: D.Attendance[];
  leaves: D.Leave[];
  wageRates: D.WageRate[];
  advances: D.Advance[];
  progress: D.ProgressNote[];
  expenses: D.Expense[];
  fuel: D.FuelLog[];
  vehicleLogs: D.VehicleLog[];
  trips: D.Trip[];
  materialTxns: D.MaterialTxn[];
  issues: D.Issue[];
  media: D.Media[];
  requests: D.ApprovalRequest[];
  notifications: D.Notification[];
}

function seed(): Store {
  const orgId = uuidv7();
  const ownerId = uuidv7();
  const sm = uuidv7();
  const site1 = uuidv7();
  const site2 = uuidv7();
  const truckType = uuidv7();
  const jcbType = uuidv7();
  const a = audit(ownerId);
  const people: D.Person[] = Array.from({ length: 6 }, (_, i) => ({
    id: uuidv7(), orgId, name: `Worker ${i + 1}`, phone: null, skill: 'UNSKILLED', defaultWagePaise: 50000, active: true, ...audit(ownerId),
  }));
  const today = iso().slice(0, 10);
  return {
    currentUserId: ownerId,
    org: { id: orgId, name: ACME_CONFIG.brand.name, code: 'acme', config: ACME_CONFIG, status: 'ACTIVE' },
    users: [
      { id: ownerId, orgId, personId: null, name: 'Acme Owner', username: 'acme_owner', phone: null, role: 'OWNER', mustChangePassword: false, assignedSiteId: null, crewId: null, allowedVehicleTypeIds: [], emergencyContact: null, active: true, ...a },
      { id: sm, orgId, personId: null, name: 'Site Manager 1', username: 'sm1', phone: null, role: 'SITE_MANAGER', mustChangePassword: false, assignedSiteId: site1, crewId: null, allowedVehicleTypeIds: [], emergencyContact: null, active: true, ...a },
    ],
    people,
    sites: [
      { id: site1, orgId, name: 'Greenfield Residency', code: 'GF', lat: null, lng: null, status: 'ACTIVE', weeklyOff: [0], startDate: null, expectedEndDate: null, budgetPaise: null, siteManagerId: sm, ...a },
      { id: site2, orgId, name: 'Sunrise Towers', code: 'ST', lat: null, lng: null, status: 'ACTIVE', weeklyOff: [0], startDate: null, expectedEndDate: null, budgetPaise: null, siteManagerId: null, ...a },
    ],
    vehicleTypes: [
      { id: truckType, orgId, name: 'Truck', trackingMode: 'KM', fieldsSchema: [], ...a },
      { id: jcbType, orgId, name: 'JCB', trackingMode: 'HOURS', fieldsSchema: [], ...a },
    ],
    vehicles: [
      { id: uuidv7(), orgId, vehicleTypeId: truckType, regNo: 'MH04AB1234', name: 'Tata 407', values: {}, assignedSiteId: site1, assignedDriverPersonId: null, status: 'ACTIVE', docs: [], ...a },
      { id: uuidv7(), orgId, vehicleTypeId: jcbType, regNo: 'MH04CD5678', name: 'JCB 3DX', values: {}, assignedSiteId: site1, assignedDriverPersonId: null, status: 'IDLE', docs: [], ...a },
    ],
    attendance: people.slice(0, 5).map((p) => ({ id: uuidv7(), orgId, siteId: site1, crewId: null, personId: p.id, businessDate: today, status: 'PRESENT', otHours: 0, markedBy: sm, ...a })),
    leaves: [],
    wageRates: [],
    advances: [],
    progress: [{ id: uuidv7(), orgId, siteId: site1, text: 'Foundation work block B', businessDate: today, enteredBy: sm, mediaIds: [], ...a }],
    expenses: [{ id: uuidv7(), orgId, siteId: site1, category: 'MISC', amountPaise: 250000, vendorId: null, billNo: null, receiptMediaId: null, businessDate: today, enteredBy: sm, void: false, ...a }],
    fuel: [],
    vehicleLogs: [],
    trips: [],
    materialTxns: [],
    issues: [],
    media: [],
    requests: [],
    notifications: [],
  };
}

export class MockClient implements AuthClient, RecordsClient, SyncClient {
  private s = seed();

  // ---- AuthClient ----
  async login(input: Dto.LoginInput): Promise<AuthSession> {
    const user = this.s.users.find((u) => u.username === input.username) ?? this.s.users[0]!;
    this.s.currentUserId = user.id;
    return { user, org: this.s.org, accessToken: 'mock-access', refreshToken: 'mock-refresh' };
  }
  async refresh(): Promise<Pick<AuthSession, 'accessToken' | 'refreshToken'>> {
    return { accessToken: 'mock-access', refreshToken: 'mock-refresh' };
  }
  async logout(): Promise<void> {}
  async changePassword(): Promise<void> {
    const u = this.cur();
    u.mustChangePassword = false;
  }
  async me(): Promise<{ user: D.User; org: D.Org }> {
    return { user: this.cur(), org: this.s.org };
  }
  private cur(): D.User {
    return this.s.users.find((u) => u.id === this.s.currentUserId) ?? this.s.users[0]!;
  }
  private get orgId(): string {
    return this.s.org.id;
  }

  // ---- RecordsClient: masters ----
  async createUser(i: Dto.CreateUserInput): Promise<D.User> {
    const row: D.User = { id: i.id, orgId: this.orgId, personId: i.personId ?? null, name: i.name, username: i.username, phone: i.phone ?? null, role: i.role, mustChangePassword: true, assignedSiteId: i.assignedSiteId ?? null, crewId: i.crewId ?? null, allowedVehicleTypeIds: i.allowedVehicleTypeIds ?? [], emergencyContact: i.emergencyContact ?? null, active: true, ...audit(this.s.currentUserId) };
    this.s.users.push(row);
    return row;
  }
  async listUsers(): Promise<Paginated<D.User>> {
    return page(this.s.users.filter((u) => !u.deletedAt));
  }
  async deactivateUser(id: string): Promise<void> {
    const u = this.s.users.find((x) => x.id === id);
    if (u) u.active = false;
  }
  async createPerson(i: Dto.CreatePersonInput): Promise<D.Person> {
    const row: D.Person = { id: i.id, orgId: this.orgId, name: i.name, phone: i.phone ?? null, skill: i.skill ?? null, defaultWagePaise: i.defaultWagePaise ?? null, active: true, ...audit(this.s.currentUserId) };
    this.s.people.push(row);
    return row;
  }
  async listPeople(): Promise<Paginated<D.Person>> {
    return page(this.s.people.filter((p) => !p.deletedAt));
  }
  async createSite(i: Dto.CreateSiteInput): Promise<D.Site> {
    const row: D.Site = { id: i.id, orgId: this.orgId, name: i.name, code: i.code, lat: i.lat ?? null, lng: i.lng ?? null, status: i.status ?? 'ACTIVE', weeklyOff: i.weeklyOff ?? [], startDate: i.startDate ?? null, expectedEndDate: i.expectedEndDate ?? null, budgetPaise: i.budgetPaise ?? null, siteManagerId: i.siteManagerId ?? null, ...audit(this.s.currentUserId) };
    this.s.sites.push(row);
    return row;
  }
  async listSites(): Promise<Paginated<D.Site>> {
    return page(this.s.sites.filter((x) => !x.deletedAt));
  }
  async getSite(id: string): Promise<D.Site> {
    const x = this.s.sites.find((s) => s.id === id);
    if (!x) throw new Error('NOT_FOUND');
    return x;
  }
  async createVehicleType(i: Dto.CreateVehicleTypeInput): Promise<D.VehicleType> {
    const row: D.VehicleType = { id: i.id, orgId: this.orgId, name: i.name, trackingMode: i.trackingMode, fieldsSchema: i.fieldsSchema, ...audit(this.s.currentUserId) };
    this.s.vehicleTypes.push(row);
    return row;
  }
  async listVehicleTypes(): Promise<D.VehicleType[]> {
    return this.s.vehicleTypes.filter((x) => !x.deletedAt);
  }
  async createVehicle(i: Dto.CreateVehicleInput): Promise<D.Vehicle> {
    const row: D.Vehicle = { id: i.id, orgId: this.orgId, vehicleTypeId: i.vehicleTypeId, regNo: i.regNo, name: i.name ?? null, values: i.values ?? {}, assignedSiteId: i.assignedSiteId ?? null, assignedDriverPersonId: i.assignedDriverPersonId ?? null, status: i.status ?? 'IDLE', docs: (i.docs ?? []).map((d) => ({ kind: d.kind, mediaId: d.mediaId ?? null, expiry: d.expiry ?? null })), ...audit(this.s.currentUserId) };
    this.s.vehicles.push(row);
    return row;
  }
  async listVehicles(): Promise<Paginated<D.Vehicle>> {
    return page(this.s.vehicles.filter((x) => !x.deletedAt));
  }

  // ---- attendance / leave / wage ----
  async markAttendance(i: Dto.MarkAttendanceInput): Promise<D.Attendance[]> {
    const out: D.Attendance[] = [];
    for (const r of i.rows) {
      const existing = this.s.attendance.find((a) => a.personId === r.personId && a.businessDate === i.businessDate);
      if (existing) {
        existing.status = r.status;
        existing.otHours = r.otHours ?? 0;
        existing.updatedAt = iso();
        out.push(existing);
      } else {
        const row: D.Attendance = { id: r.id, orgId: this.orgId, siteId: i.siteId, crewId: i.crewId ?? null, personId: r.personId, businessDate: i.businessDate, status: r.status, otHours: r.otHours ?? 0, markedBy: this.s.currentUserId, ...audit(this.s.currentUserId) };
        this.s.attendance.push(row);
        out.push(row);
      }
    }
    return out;
  }
  async listAttendance(siteId: string, window: DateWindow): Promise<D.Attendance[]> {
    return this.s.attendance.filter((a) => a.siteId === siteId && a.businessDate >= window.from && a.businessDate <= window.to && !a.deletedAt);
  }
  async createLeave(i: Dto.CreateLeaveInput): Promise<D.Leave> {
    const row: D.Leave = { id: i.id, orgId: this.orgId, personId: i.personId, startDate: i.startDate, endDate: i.endDate, type: i.type, reason: i.reason ?? null, ...audit(this.s.currentUserId) };
    this.s.leaves.push(row);
    return row;
  }
  async setWageRate(i: Dto.SetWageRateInput): Promise<D.WageRate> {
    const row: D.WageRate = { id: i.id, orgId: this.orgId, personId: i.personId, dailyPaise: i.dailyPaise, effectiveFrom: i.effectiveFrom, ...audit(this.s.currentUserId) };
    this.s.wageRates.push(row);
    return row;
  }
  async createAdvance(i: Dto.CreateAdvanceInput): Promise<D.Advance> {
    const row: D.Advance = { id: i.id, orgId: this.orgId, personId: i.personId ?? null, crewId: i.crewId ?? null, amountPaise: i.amountPaise, businessDate: i.businessDate, note: i.note ?? null, ...audit(this.s.currentUserId) };
    this.s.advances.push(row);
    return row;
  }

  // ---- records ----
  async createProgressNote(i: Dto.CreateProgressNoteInput): Promise<D.ProgressNote> {
    const row: D.ProgressNote = { id: i.id, orgId: this.orgId, siteId: i.siteId, text: i.text, businessDate: i.businessDate, enteredBy: this.s.currentUserId, mediaIds: i.mediaIds ?? [], ...audit(this.s.currentUserId) };
    this.s.progress.push(row);
    return row;
  }
  async createExpense(i: Dto.CreateExpenseInput): Promise<D.Expense> {
    const row: D.Expense = { id: i.id, orgId: this.orgId, siteId: i.siteId, category: i.category, amountPaise: i.amountPaise, vendorId: i.vendorId ?? null, billNo: i.billNo ?? null, receiptMediaId: i.receiptMediaId ?? null, businessDate: i.businessDate, enteredBy: this.s.currentUserId, void: false, ...audit(this.s.currentUserId) };
    this.s.expenses.push(row);
    return row;
  }
  async createFuelLog(i: Dto.CreateFuelLogInput): Promise<D.FuelLog> {
    const row: D.FuelLog = { id: i.id, orgId: this.orgId, vehicleId: i.vehicleId, amountPaise: i.amountPaise, litres: i.litres, reading: i.reading, receiptMediaId: i.receiptMediaId ?? null, businessDate: i.businessDate, ...audit(this.s.currentUserId) };
    this.s.fuel.push(row);
    return row;
  }
  async createVehicleLog(i: Dto.CreateVehicleLogInput): Promise<D.VehicleLog> {
    const row: D.VehicleLog = { id: i.id, orgId: this.orgId, vehicleId: i.vehicleId, driverPersonId: i.driverPersonId, startReading: i.startReading, endReading: i.endReading ?? null, businessDate: i.businessDate, ...audit(this.s.currentUserId) };
    this.s.vehicleLogs.push(row);
    return row;
  }
  async createTrip(i: Dto.CreateTripInput): Promise<D.Trip> {
    const row: D.Trip = { id: i.id, orgId: this.orgId, vehicleId: i.vehicleId, fromText: i.fromText, toText: i.toText, purpose: i.purpose ?? null, materialTxnId: i.materialTxnId ?? null, businessDate: i.businessDate, ...audit(this.s.currentUserId) };
    this.s.trips.push(row);
    return row;
  }
  async createMaterialTxn(i: Dto.CreateMaterialTxnInput): Promise<D.MaterialTxn> {
    const row: D.MaterialTxn = { id: i.id, orgId: this.orgId, type: i.type, materialId: i.materialId, qty: i.qty, uom: i.uom, siteId: i.siteId, counterpartSiteId: i.counterpartSiteId ?? null, relatedTxnId: i.relatedTxnId ?? null, status: 'CONFIRMED', businessDate: i.businessDate, ...audit(this.s.currentUserId) };
    this.s.materialTxns.push(row);
    return row;
  }
  async createIssue(i: Dto.CreateIssueInput): Promise<D.Issue> {
    const row: D.Issue = { id: i.id, orgId: this.orgId, siteId: i.siteId ?? null, vehicleId: i.vehicleId ?? null, severity: i.severity, description: i.description, status: 'OPEN', businessDate: i.businessDate, mediaIds: i.mediaIds ?? [], ...audit(this.s.currentUserId) };
    this.s.issues.push(row);
    return row;
  }
  async updateRecord(): Promise<void> {}
  async voidRecord(): Promise<void> {}
  async listRecords(entityType: string, siteId: string | null, window: DateWindow): Promise<Paginated<unknown>> {
    const map: Record<string, Array<{ siteId?: string | null; businessDate: string; deletedAt: string | null }>> = {
      progress: this.s.progress, expense: this.s.expenses, issue: this.s.issues, 'material-txn': this.s.materialTxns,
    };
    const rows = (map[entityType] ?? []).filter((r) => !r.deletedAt && (!siteId || r.siteId === siteId) && r.businessDate >= window.from && r.businessDate <= window.to);
    return page(rows as unknown[]);
  }

  // ---- approvals ----
  async submitRequest(i: Dto.SubmitRequestInput): Promise<D.ApprovalRequest> {
    const row: D.ApprovalRequest = { id: i.id, orgId: this.orgId, type: i.type, payload: i.payload, status: 'PENDING', requestedBy: this.s.currentUserId, approverUserId: null, decidedAt: null, comment: null, ...audit(this.s.currentUserId) };
    this.s.requests.push(row);
    return row;
  }
  async decideRequest(id: string, i: Dto.DecideRequestInput): Promise<D.ApprovalRequest> {
    const r = this.s.requests.find((x) => x.id === id);
    if (!r) throw new Error('NOT_FOUND');
    r.status = i.approve ? 'APPROVED' : 'REJECTED';
    r.approverUserId = this.s.currentUserId;
    r.decidedAt = iso();
    r.comment = i.comment ?? null;
    return r;
  }
  async listRequests(status?: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<D.ApprovalRequest[]> {
    return this.s.requests.filter((r) => !status || r.status === status);
  }

  // ---- media ----
  async presignMedia(i: Dto.PresignMediaInput): Promise<Dto.PresignMediaResult> {
    const r2Key = `${this.orgId}/${i.parentType}/${i.parentId}/${i.id}`;
    this.s.media.push({ id: i.id, orgId: this.orgId, kind: i.kind, r2Key, thumbKey: null, parentType: i.parentType, parentId: i.parentId, lat: i.lat ?? null, lng: i.lng ?? null, takenAt: iso() });
    return { mediaId: i.id, uploadUrl: `mock://upload/${r2Key}`, r2Key };
  }

  // ---- rollups / analytics ----
  async getOwnerDashboard(window: DateWindow): Promise<D.OwnerDashboard> {
    const today = window.to;
    const spend = this.s.expenses.filter((e) => e.businessDate === today && !e.void).reduce((s, e) => s + e.amountPaise, 0) + this.s.fuel.filter((f) => f.businessDate === today).reduce((s, f) => s + f.amountPaise, 0);
    return {
      window,
      kpis: {
        activeSites: this.s.sites.filter((s) => s.status === 'ACTIVE').length,
        headcountToday: this.s.attendance.filter((a) => a.businessDate === today && (a.status === 'PRESENT' || a.status === 'HALF_DAY')).length,
        vehiclesActiveToday: new Set(this.s.vehicleLogs.filter((l) => l.businessDate === today).map((l) => l.vehicleId)).size,
        spendTodayPaise: spend,
        openIssues: this.s.issues.filter((i) => i.status === 'OPEN').length,
        pendingApprovals: this.s.requests.filter((r) => r.status === 'PENDING').length,
      },
      completeness: await this.getCompleteness(window),
      costRollup: {
        bySite: this.s.sites.map((s) => ({ siteId: s.id, totalPaise: this.s.expenses.filter((e) => e.siteId === s.id && !e.void).reduce((n, e) => n + e.amountPaise, 0) })),
        byVehicle: [],
        byCrew: [],
        byMaterial: [],
      },
    };
  }
  async getCompleteness(window: DateWindow): Promise<D.Completeness[]> {
    return this.s.sites.filter((s) => s.status === 'ACTIVE').map((s) => {
      const hasAtt = this.s.attendance.some((a) => a.siteId === s.id && a.businessDate === window.to);
      const hasProg = this.s.progress.some((p) => p.siteId === s.id && p.businessDate === window.to);
      const state: D.CompletenessState = hasAtt && hasProg ? 'COMPLETE' : hasAtt || hasProg ? 'PARTIAL' : 'MISSING';
      return { orgId: this.orgId, scopeType: 'SITE', scopeId: s.id, businessDate: window.to, state };
    });
  }
  async getWageSummary(window: DateWindow): Promise<D.WageSummary> {
    const rows: D.WageSummaryRow[] = this.s.people.map((p) => {
      const present = this.s.attendance.filter((a) => a.personId === p.id && a.status === 'PRESENT').length;
      const half = this.s.attendance.filter((a) => a.personId === p.id && a.status === 'HALF_DAY').length;
      const rate = p.defaultWagePaise ?? 0;
      const gross = Math.round(rate * (present + 0.5 * half));
      return { personId: p.id, personName: p.name, crewId: null, siteId: this.s.sites[0]?.id ?? '', presentDays: present, halfDays: half, otHours: 0, ratePaise: rate, grossPayablePaise: gross, advancePaise: 0, netPayablePaise: gross };
    });
    const grossPaise = rows.reduce((s, r) => s + r.grossPayablePaise, 0);
    return { window, rows, totals: { grossPaise, advancePaise: 0, netPaise: grossPaise } };
  }
  async getReconciliation(window: DateWindow): Promise<D.Reconciliation> {
    return { window, fuel: [], material: [] };
  }

  // ---- notifications ----
  async listNotifications(): Promise<D.Notification[]> {
    return this.s.notifications.filter((n) => n.userId === this.s.currentUserId);
  }
  async markNotificationRead(id: string): Promise<void> {
    const n = this.s.notifications.find((x) => x.id === id);
    if (n) n.readAt = iso();
  }

  // ---- SyncClient ----
  async pushBatch(events: SyncEvent[]): Promise<SyncResult[]> {
    return events.map((e) => ({ outboxId: e.outboxId, ok: true }));
  }
  async pull(): Promise<{ changes: Array<{ entityType: string; rows: unknown[] }>; cursor: string }> {
    return { changes: [], cursor: iso() };
  }
}
