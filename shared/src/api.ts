/**
 * REST API contract — FROZEN. The RestClient adapter implements exactly these.
 * Conventions: base `/api/v1`; JSON; success `{ data, meta? }`; failure `{ error }` (see errors.ts);
 * cursor pagination `?limit=&cursor=`; all list endpoints scope server-side from the JWT.
 */

export const API_BASE = '/api/v1' as const;

/** Endpoint registry — method + path template. Keep adapter + backend routes in lockstep with this. */
export const ENDPOINTS = {
  // auth
  login: { method: 'POST', path: '/auth/login' },
  refresh: { method: 'POST', path: '/auth/refresh' },
  logout: { method: 'POST', path: '/auth/logout' },
  changePassword: { method: 'POST', path: '/auth/change-password' },
  me: { method: 'GET', path: '/me' },
  orgCurrent: { method: 'GET', path: '/orgs/current' },

  // masters
  usersList: { method: 'GET', path: '/users' },
  usersCreate: { method: 'POST', path: '/users' },
  usersDeactivate: { method: 'POST', path: '/users/:id/deactivate' },
  usersActivate: { method: 'POST', path: '/users/:id/activate' },
  usersResetPassword: { method: 'POST', path: '/users/:id/reset-password' },
  peopleList: { method: 'GET', path: '/people' },
  peopleCreate: { method: 'POST', path: '/people' },
  peopleUpdate: { method: 'PATCH', path: '/people/:id' }, // frozen.8: guardian/ID-card edits (SM/Owner)
  sitesList: { method: 'GET', path: '/sites' },
  sitesCreate: { method: 'POST', path: '/sites' },
  siteGet: { method: 'GET', path: '/sites/:id' },
  siteUpdate: { method: 'PATCH', path: '/sites/:id' }, // frozen.8: Owner-only role assignments (SM/accountant)
  vehicleTypesList: { method: 'GET', path: '/vehicle-types' },
  vehicleTypesCreate: { method: 'POST', path: '/vehicle-types' },
  vehiclesList: { method: 'GET', path: '/vehicles' },
  vehiclesCreate: { method: 'POST', path: '/vehicles' },

  // attendance / leave / wage
  attendanceMark: { method: 'POST', path: '/attendance' },
  attendanceList: { method: 'GET', path: '/attendance' },
  leaveCreate: { method: 'POST', path: '/leave' },
  wageRateSet: { method: 'POST', path: '/wage-rates' },
  advanceCreate: { method: 'POST', path: '/advances' },

  // records (typed)
  progressCreate: { method: 'POST', path: '/records/progress' },
  expenseCreate: { method: 'POST', path: '/records/expense' },
  fuelCreate: { method: 'POST', path: '/records/fuel' },
  vehicleLogCreate: { method: 'POST', path: '/records/vehicle-log' },
  tripCreate: { method: 'POST', path: '/records/trip' },
  materialTxnCreate: { method: 'POST', path: '/records/material-txn' },
  issueCreate: { method: 'POST', path: '/records/issue' },
  recordUpdate: { method: 'PATCH', path: '/records/:entityType/:id' },
  recordVoid: { method: 'POST', path: '/records/:entityType/:id/void' },
  recordsList: { method: 'GET', path: '/records/:entityType' },

  // approvals
  requestSubmit: { method: 'POST', path: '/requests' },
  requestDecide: { method: 'POST', path: '/requests/:id/decide' },
  requestsList: { method: 'GET', path: '/requests' },

  // media
  mediaPresign: { method: 'POST', path: '/media/presign' },

  // rollups / reports
  dashboardOwner: { method: 'GET', path: '/dashboards/owner' },
  completeness: { method: 'GET', path: '/completeness' },
  wageSummary: { method: 'GET', path: '/reports/wage-summary' },
  reconciliation: { method: 'GET', path: '/reports/reconciliation' },

  // sync
  syncPush: { method: 'POST', path: '/sync/push' },
  syncPull: { method: 'GET', path: '/sync/pull' },

  // notifications
  notificationsList: { method: 'GET', path: '/notifications' },
  notificationRead: { method: 'POST', path: '/notifications/:id/read' },

  // contacts & cash ledger (client-plan v1)
  meContacts: { method: 'GET', path: '/me/contacts' },
  myBalance: { method: 'GET', path: '/me/balance' },
  cashTransferCreate: { method: 'POST', path: '/cash-transfers' },
  cashTransfersList: { method: 'GET', path: '/cash-transfers' },
  ledgerRollup: { method: 'GET', path: '/ledger/rollup' },

  // vendors (udhaar khata)
  vendorsList: { method: 'GET', path: '/vendors' },
  vendorsCreate: { method: 'POST', path: '/vendors' },
  vendorPaymentCreate: { method: 'POST', path: '/vendors/:id/payments' },
  vendorLedger: { method: 'GET', path: '/vendors/:id/ledger' },

  // site config (SM-scoped narrow update)
  siteConfigUpdate: { method: 'PATCH', path: '/sites/:id/config' },

  // damage lifecycle
  issueResolve: { method: 'POST', path: '/records/issue/:id/resolve' },
  issueClose: { method: 'POST', path: '/records/issue/:id/close' },

  // vehicles: switch + drill-downs
  vehicleSelfSwitch: { method: 'POST', path: '/vehicles/:id/switch' },
  vehicleSnapshot: { method: 'GET', path: '/vehicles/my-snapshot' },
  vehicleDetail: { method: 'GET', path: '/vehicles/:id/detail' },
  driverDetail: { method: 'GET', path: '/users/:id/driver-detail' },

  // insights (day/period/person — scoped per caller role)
  insightsDay: { method: 'GET', path: '/insights/day' },
  insightsPeriod: { method: 'GET', path: '/insights/period' },
  insightsPerson: { method: 'GET', path: '/insights/person/:id' },

  // Excel export v2 (frozen.6): section-picker download + server-built email delivery
  exportConfig: { method: 'GET', path: '/exports/config' },
  exportEmail: { method: 'POST', path: '/exports/email' },

  // ---- Round 2 (frozen.8) ----
  // two-tick verification (accountant of the site / Owner)
  requestVerify: { method: 'POST', path: '/requests/:id/verify' },
  expenseVerify: { method: 'POST', path: '/records/expense/:id/verify' },
  cashTransferVerify: { method: 'POST', path: '/cash-transfers/:id/verify' },
  vendorPaymentVerify: { method: 'POST', path: '/vendors/payments/:id/verify' },
  // "money I've taken" — verified SALARY/PERSONAL draws of the caller.
  // frozen.11: also accepts ?tag=WORK → the caller's WORK-cash credits (khata GIVEs to him,
  // any verification state, with resolved giver names) — the worker/driver "money received" list.
  myMoney: { method: 'GET', path: '/me/money' },

  // ---- frozen.10 (5-role client-audit round) ----
  // supervisor allots a vehicle to one of his crew drivers (direct, log-only + notifications;
  // SM/Owner may also use it — service-scoped)
  vehicleAssignDriver: { method: 'POST', path: '/vehicles/:id/assign-driver' },
  // NOTE (no new paths): GET /cash-transfers now also accepts ?tag=&kind= (sub-page histories);
  // GET /complaints now also accepts ?limit=&offset= (load-more paging).

  // ---- frozen.9 (Profile page + guardian self-add) ----
  // one-time guardian/emergency-contact self-add (any authenticated user with a linked person;
  // service enforces set-once — edits stay SM/Owner-only via peopleUpdate)
  meGuardianSet: { method: 'PATCH', path: '/me/guardian' },
  // upper-role view of a subordinate's money-taken history (same MyMoney shape;
  // OWNER any · SM/ACCOUNTANT site-scoped)
  userMoney: { method: 'GET', path: '/users/:id/money' },
  // materials catalog (SM/Owner manage; supervisor/driver consume)
  materialsList: { method: 'GET', path: '/materials' },
  materialsCreate: { method: 'POST', path: '/materials' },
  materialUpdate: { method: 'PATCH', path: '/materials/:id' },
  // diesel: bulk stock + issuances + red flags
  fuelStockCreate: { method: 'POST', path: '/fuel-stock/purchases' },
  fuelStockList: { method: 'GET', path: '/fuel-stock/purchases' },
  fuelIssuanceCreate: { method: 'POST', path: '/fuel-stock/issuances' },
  fuelIssuancesList: { method: 'GET', path: '/fuel-stock/issuances' },
  fuelMatchFlags: { method: 'GET', path: '/fuel-stock/flags' },
  // complaint box
  complaintCreate: { method: 'POST', path: '/complaints' },
  complaintsList: { method: 'GET', path: '/complaints' },
  complaintResolve: { method: 'POST', path: '/complaints/:id/resolve' },
  // vehicle document vault + reminders (SM + Owner ONLY)
  vehicleDocsList: { method: 'GET', path: '/vehicles/:id/docs' },
  vehicleDocCreate: { method: 'POST', path: '/vehicles/:id/docs' },
  vehicleDocUpdate: { method: 'PATCH', path: '/vehicle-docs/:id' },
  vehicleDocDelete: { method: 'DELETE', path: '/vehicle-docs/:id' },
  vehicleRemindersList: { method: 'GET', path: '/vehicles/:id/reminders' },
  vehicleReminderCreate: { method: 'POST', path: '/vehicles/:id/reminders' },
  vehicleReminderUpdate: { method: 'PATCH', path: '/vehicle-reminders/:id' },
  vehicleReminderDelete: { method: 'DELETE', path: '/vehicle-reminders/:id' },
  // the accountant's work queue
  accountantQueue: { method: 'GET', path: '/accountant/queue' },
} as const satisfies Record<string, { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string }>;

export type EndpointKey = keyof typeof ENDPOINTS;
