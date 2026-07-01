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
  peopleList: { method: 'GET', path: '/people' },
  peopleCreate: { method: 'POST', path: '/people' },
  sitesList: { method: 'GET', path: '/sites' },
  sitesCreate: { method: 'POST', path: '/sites' },
  siteGet: { method: 'GET', path: '/sites/:id' },
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
} as const satisfies Record<string, { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string }>;

export type EndpointKey = keyof typeof ENDPOINTS;
