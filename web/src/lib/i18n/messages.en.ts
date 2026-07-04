/**
 * English message catalog — the SHAPE-DEFINING locale.
 *
 * `Messages` is derived from this object, and `messages.hi.ts` is typed
 * against it: add/remove a key here (or forget it in hi) and TypeScript fails
 * the build. `satisfies` clauses keep enum-keyed sections honest against the
 * frozen contracts WITHOUT widening the inferred key set.
 *
 * No English strings live inside component logic — every user-facing string in
 * the app flows from getMessages(locale) (see ./messages.ts).
 */
import type {
  ApprovalStatus,
  ApprovalType,
  AttendanceStatus,
  CompletenessState,
  ErrorCode,
  ExpenseCategory,
  LeaveType,
  Locale,
  OrgConfig,
  PersonSkill,
  RecordType,
  Role,
  Uom,
  VehicleStatus,
  VehicleTrackingMode,
} from "@techbuilder/contracts";

export const en = {
  /** Auth-flow API error → user message (login / change-password). */
  AUTH_MESSAGES: {
    UNAUTHENTICATED: "Wrong username or password.",
    VALIDATION_FAILED: "Please check the highlighted fields.",
    TOKEN_EXPIRED: "Your session expired. Please log in again.",
    FORBIDDEN: "You do not have access to that.",
    RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
    PASSWORD_CHANGE_REQUIRED: "You must change your password before continuing.",
    DEFAULT: "Something went wrong. Please try again.",
  } satisfies Partial<Record<ErrorCode, string>> & { DEFAULT: string },

  /** General API error → user message (field-entry + owner screens). */
  API_MESSAGES: {
    VALIDATION_FAILED:
      "Some values are invalid — please check the fields (future dates are not allowed).",
    FORBIDDEN: "Not allowed: outside your scope or your allowed date window.",
    NOT_FOUND: "That record was not found.",
    CONFLICT: "This entry already exists.",
    RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
    TOKEN_EXPIRED: "Your session expired. Please log in again.",
    UNAUTHENTICATED: "Your session expired. Please log in again.",
    DEFAULT: "Something went wrong. Please try again.",
  } satisfies Partial<Record<ErrorCode, string>> & { DEFAULT: string },

  /** Form-level validation messages (client-side zod). */
  FORM_MESSAGES: {
    usernameRequired: "Username is required.",
    passwordRequired: "Password is required.",
    currentPasswordRequired: "Current password is required.",
    newPasswordMin: "New password must be at least 8 characters.",
    confirmMismatch: "Passwords do not match.",
  },

  /** Static UI strings (login, change-password, shell). */
  UI: {
    appName: "techBuilder",
    loginTitle: "Log in",
    loginSubtitle: "Daily site records for your company",
    username: "Username",
    password: "Password",
    loginSubmit: "Log in",
    loggingIn: "Logging in…",
    // DEV ONLY — remove with the dev-credentials block in login/page.tsx before pilot.
    devCredentialsTitle: "Dev logins — tap to fill",
    devCredentialsPassword: "Password for all:",
    changePasswordTitle: "Set a new password",
    changePasswordSubtitle: "You must change your password before continuing.",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    changePasswordSubmit: "Change password",
    changingPassword: "Saving…",
    logout: "Log out",
    loggedInAs: "Logged in as",
    languageToggle: "Language",
  },

  /** Role display names (shell badge + placeholder homes). */
  ROLE_LABELS: {
    OWNER: "Owner",
    SITE_MANAGER: "Site Manager",
    TEAM_HEAD: "Team Head",
    DRIVER: "Driver",
    WORKER: "Worker",
  } satisfies Record<Role, string>,

  /** Navigation item labels, keyed by nav id (see src/lib/nav.ts). */
  NAV_LABELS: {
    dashboard: "Dashboard",
    attendance: "Attendance",
    records: "Records",
    vehicleFuel: "Vehicle / Fuel",
    requests: "Requests",
    approvals: "Approvals",
    wages: "Wages",
    reports: "Reports",
    people: "People",
    sites: "Sites",
    fleet: "Fleet",
    settings: "Settings",
  },

  /** Attendance status labels (enum values come from the frozen contracts). */
  ATTENDANCE_STATUS_LABELS: {
    PRESENT: "Present",
    ABSENT: "Absent",
    HALF_DAY: "Half day",
  } satisfies Record<AttendanceStatus, string>,

  /** Expense category labels (enum values come from the frozen contracts). */
  EXPENSE_CATEGORY_LABELS: {
    FOOD: "Food",
    SUPPLIES: "Supplies",
    TRANSPORT: "Transport",
    LABOUR: "Labour",
    REPAIR: "Repair",
    MISC: "Misc",
  } satisfies Record<ExpenseCategory, string>,

  /** Approval request type labels (enum values come from the frozen contracts). */
  APPROVAL_TYPE_LABELS: {
    VEHICLE_SWITCH: "Vehicle change",
    LEAVE: "Leave",
    MATERIAL: "Material",
  } satisfies Record<ApprovalType, string>,

  /** Approval status labels (enum values come from the frozen contracts). */
  APPROVAL_STATUS_LABELS: {
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  } satisfies Record<ApprovalStatus, string>,

  /** Leave type labels (enum values come from the frozen contracts). */
  LEAVE_TYPE_LABELS: {
    CASUAL: "Casual",
    SICK: "Sick",
    UNPAID: "Unpaid",
    OTHER: "Other",
  } satisfies Record<LeaveType, string>,

  /** Person skill labels (enum values come from the frozen contracts). */
  PERSON_SKILL_LABELS: {
    UNSKILLED: "Unskilled",
    SEMI_SKILLED: "Semi-skilled",
    SKILLED: "Skilled",
    OPERATOR: "Operator",
    DRIVER: "Driver",
  } satisfies Record<PersonSkill, string>,

  /** Unit-of-measure labels (enum values come from the frozen contracts). */
  UOM_LABELS: {
    BAG: "Bag",
    KG: "Kg",
    CFT: "CFT",
    NOS: "Nos",
    MT: "Tonne",
    LITRE: "Litre",
  } satisfies Record<Uom, string>,

  /** Vehicle status labels (enum values come from the frozen contracts). */
  VEHICLE_STATUS_LABELS: {
    ACTIVE: "Active",
    IDLE: "Idle",
    MAINTENANCE: "Maintenance",
  } satisfies Record<VehicleStatus, string>,

  /** Vehicle-type tracking-mode labels (enum values come from the frozen contracts). */
  VEHICLE_TRACKING_MODE_LABELS: {
    KM: "Kilometers",
    HOURS: "Hours",
  } satisfies Record<VehicleTrackingMode, string>,

  /** Record-type labels (enum values come from the frozen contracts; used by Settings). */
  RECORD_TYPE_LABELS: {
    progress: "Progress",
    expense: "Expense",
    fuel: "Fuel",
    trip: "Trip",
    materialUsage: "Material usage",
    materialMove: "Material move",
    issue: "Issue",
    attendance: "Attendance",
    leave: "Leave",
    vehicleStartEnd: "Vehicle start/end",
  } satisfies Record<RecordType, string>,

  /** Locale display names (used by Settings' language section). */
  LOCALE_LABELS: {
    hi: "Hindi",
    en: "English",
  } satisfies Record<Locale, string>,

  /** OrgConfig feature-flag labels (keys mirror shared/src/config.ts OrgConfigSchema.features). */
  FEATURE_FLAG_LABELS: {
    voiceNotes: "Voice notes",
    kioskMode: "Kiosk mode",
    fuelReconciliation: "Fuel reconciliation",
    materialReconciliation: "Material reconciliation",
    wageSummary: "Wage summary",
    whatsappShare: "WhatsApp share",
    pdfExport: "PDF export",
    docExpiryAlerts: "Document expiry alerts",
    qrScan: "QR scan",
    gpsGeotag: "GPS geotag",
  } satisfies Record<keyof OrgConfig["features"], string>,

  /** Approval request payload field labels — shared by the requests + approvals screens. */
  REQUEST_FIELDS: {
    vehicle: "Vehicle",
    reason: "Reason",
    desiredType: "Wanted vehicle type",
    person: "Worker",
    self: "Myself",
    fromDate: "From",
    toDate: "To",
    leaveType: "Leave type",
    material: "Material",
    qty: "Quantity",
    uom: "Unit",
    note: "Note",
  },

  /** Field-entry screens: attendance, records, fuel. */
  ENTRY_UI: {
    // shared
    loading: "Loading…",
    saving: "Saving…",
    retry: "Retry",
    site: "Site",
    date: "Date",
    photo: "Receipt photo (optional)",
    photoSelected: "Photo attached",
    photoRemove: "Remove",
    photoNotUploaded: "Saved, but the photo could not be uploaded.",
    recentTitle: "Last 7 days",
    recentEmpty: "No entries in the last 7 days.",
    noSites: "No sites available for your account.",
    corrected: "corrected",

    // attendance
    attendanceTitle: "Attendance",
    attendanceSubtitle: "Mark today’s roster, adjust exceptions, save once.",
    allPresent: "All present",
    otHours: "OT",
    otHoursAria: "Overtime hours",
    attendanceSubmit: "Save attendance",
    attendanceSavedPrefix: "Attendance saved for",
    attendanceSavedSuffix: "worker(s).",
    attendanceNoChanges: "Nothing new to save — statuses are unchanged.",
    rosterEmpty: "No workers found for your account.",
    markedTick: "Saved",

    // records page
    recordsTitle: "Records",
    recordsSubtitle: "Daily expense and progress entries.",
    tabExpense: "Expense",
    tabProgress: "Progress",

    // expense form
    expenseTitle: "New expense",
    amountRupees: "Amount (₹)",
    category: "Category",
    billNo: "Bill no. (optional)",
    expenseSubmit: "Save expense",
    expenseSaved: "Expense saved.",
    amountInvalid: "Enter an amount greater than 0.",
    categoryRequired: "Pick a category.",

    // progress form
    progressTitle: "Progress note",
    progressPlaceholder: "What happened on site today?",
    progressTextRequired: "Write a note or use “Nothing to report”.",
    nothingToReport: "Nothing to report",
    progressSubmit: "Save note",
    progressSaved: "Progress note saved.",

    // fuel form
    fuelTitle: "Fuel entry",
    fuelSubtitle: "Log a fuel fill for your vehicle.",
    vehicle: "Vehicle",
    noVehicle: "No vehicle is assigned to you.",
    reading: "Odometer / meter reading",
    litres: "Litres",
    fuelSubmit: "Save fuel entry",
    fuelSaved: "Fuel entry saved.",
    enterAnother: "Enter another",
    readingInvalid: "Enter the current reading.",
    litresInvalid: "Enter the litres filled.",
  },

  /** Completeness state labels — always shown as TEXT next to the color. */
  COMPLETENESS_STATE_LABELS: {
    COMPLETE: "Complete",
    PARTIAL: "Partial",
    MISSING: "Missing",
  } satisfies Record<CompletenessState, string>,

  /** Owner value screens: dashboard, site drill-in, reports. */
  OWNER_UI: {
    // window toggle
    windowToday: "Today",
    window7d: "7 days",
    window30d: "30 days",

    // dashboard
    dashboardTitle: "Dashboard",
    dashboardSubtitle: "What happened across your sites.",
    kpiHeadcount: "On site today",
    kpiSpendToday: "Spend today",
    kpiActiveSites: "Active sites",
    kpiVehiclesActive: "Vehicles active today",
    kpiOpenIssues: "Open issues",
    kpiPendingApprovals: "Pending approvals",
    completenessTitle: "Daily records — site by site",
    completenessSubtitle: "Today’s state and the last 7 days.",
    completenessNoData: "No data",
    offDay: "Off day / no data",
    markedSuffix: "marked today",
    costTitle: "Where the money went",
    costBySite: "Expenses by site",
    costByVehicle: "Fuel by vehicle",
    costEmpty: "No spend recorded in this window.",
    unknownSite: "Unknown site",
    unknownVehicle: "Unknown vehicle",

    // WhatsApp digest
    digestTitle: "Today’s summary",
    digestSubtitle: "One message for your WhatsApp group.",
    digestShare: "Share on WhatsApp",
    digestCopy: "Copy",
    digestCopied: "Copied.",
    digestCopyFailed: "Could not copy — long-press the text above instead.",
    digestSitesHeading: "Sites:",
    digestMarked: "marked",
    digestExpense: "exp",
    digestFuel: "fuel",
    digestTotalSpend: "Total spend today:",
    digestHeadcount: "On site today:",
    digestFooter: "— via techBuilder",

    // sites list + drill-in
    sitesTitle: "Sites",
    sitesSubtitle: "Tap a site to see its records.",
    sitesEmpty: "No sites yet.",
    siteBack: "All sites",
    siteNotFound: "This site was not found.",
    tabAttendance: "Attendance",
    tabExpenses: "Expenses",
    tabProgress: "Progress",
    tabFuel: "Fuel",
    attendanceEmpty: "No attendance in this window.",
    expensesEmpty: "No expenses in this window.",
    progressEmpty: "No progress notes in this window.",
    fuelEmpty: "No fuel entries in this window.",
    markedByPrefix: "marked by",
    enteredByPrefix: "by",
    voided: "VOID",
    litresSuffix: "L",
    readingPrefix: "reading",
    otPrefix: "OT",

    // audit chip
    auditCorrected: "corrected",
    auditUnknownUser: "unknown user",

    // reports / Excel export
    reportsTitle: "Reports",
    reportsSubtitle: "Download attendance and expenses as an Excel file.",
    reportsDownload: "Download Excel",
    reportsPreparing: "Fetching records…",
    reportsPreviewAttendance: "Attendance rows",
    reportsPreviewExpenses: "Expense rows",
    reportsFileLabel: "File",
    reportsDone: "Excel file downloaded.",
    sheetAttendance: "Attendance",
    sheetExpenses: "Expenses",
    colDate: "Date",
    colSite: "Site",
    colPerson: "Person",
    colStatus: "Status",
    colOtHours: "OT hours",
    colMarkedBy: "Marked by",
    colCorrected: "Corrected",
    colCategory: "Category",
    colAmount: "Amount ₹",
    colBillNo: "Bill no",
    colEnteredBy: "Entered by",
    colVoided: "Voided",
    exportYes: "YES",
  },

  /** Role dashboards (SM / TH / Driver / Worker homes). */
  DASH_UI: {
    quickActions: "Quick actions",

    // Site-manager dashboard (owner dashboard scoped to their sites)
    smTitle: "Site dashboard",
    smSubtitle: "Your sites at a glance.",

    // Team-head dashboard
    thCrewTitle: "Today's attendance",
    thCrewSubtitle: "Your crew, today.",
    thOnSiteLabel: "on site today (present + half day)",
    thUnmarked: "Not marked",
    thProgressTitle: "Today's work note",
    thProgressDone: "Note saved for today.",
    thProgressPending: "Today's note is pending.",

    // Driver dashboard
    driverVehicleTitle: "My vehicle",
    driverAddFuel: "Add fuel",
    driverLastFuel: "Last fuel entry",
    driverNoFuelYet: "No fuel entry yet.",

    // Worker dashboard (read-only)
    workerIdTitle: "My card",
    workerAttTitle: "My attendance",
    workerAttSubtitle: "This month, day by day.",
    workerAttEmpty: "No attendance marked this month yet.",
    workerViewOnly: "View only — your team head marks the attendance.",
  },

  /** Approvals inbox (Owner / SM / TH). */
  APPROVALS_UI: {
    title: "Approvals",
    subtitle: "Requests waiting for your decision.",
    filterLabel: "Show",
    filterAll: "All",
    raisedByPrefix: "Raised by",
    decidedByPrefix: "Decided by",
    approve: "Approve",
    reject: "Reject",
    deciding: "Saving…",
    commentLabel: "Comment (optional)",
    commentPlaceholder: "Add a note for the requester…",
    emptyPending: "Nothing waiting for approval.",
    emptyGeneric: "No requests to show.",
    ownRequestNote: "Your own request — someone else decides it.",
    conflictNotice: "This was already decided. Refreshed the list.",
    approvedNotice: "Approved.",
    rejectedNotice: "Rejected.",
    unknownRequester: "Unknown user",
  },

  /** Raise-request screen (SM / TH / Driver). */
  REQUESTS_UI: {
    title: "Requests",
    subtitle: "Raise a request for approval.",
    newRequestTitle: "New request",
    typeLabel: "Request type",
    submit: "Send request",
    submitting: "Sending…",
    submitted: "Request sent.",
    myRequestsTitle: "My requests",
    myRequestsEmpty: "You haven't sent any requests yet.",
    selectVehicle: "Select vehicle",
    noVehiclesInScope: "No vehicle available for your account.",
    reasonPlaceholder: "Why is this needed?",
    materialPlaceholder: "e.g. Cement",
    notePlaceholder: "Anything to add? (optional)",
    optionalDesiredType: "Wanted vehicle type (optional)",
    none: "— none —",
    reasonRequired: "Write a reason.",
    vehicleRequired: "Pick a vehicle.",
    datesRequired: "Pick both dates.",
    dateOrderInvalid: "The 'to' date can't be before the 'from' date.",
    materialRequired: "Enter the material.",
    qtyInvalid: "Enter a quantity greater than 0.",
  },

  /** People management (Owner / SM / TH): logins + labour list. */
  PEOPLE_UI: {
    title: "People",
    subtitle: "Manage logins and the labour list.",
    usersTitle: "Logins",
    usersEmpty: "No users yet.",
    createUserTitle: "Add a login",
    name: "Name",
    username: "Username",
    phone: "Phone (optional)",
    roleLabel: "Role",
    site: "Site",
    selectSite: "Select site",
    siteRequired: "Pick a site.",
    linkPerson: "Link to worker (optional)",
    none: "— none —",
    tempPasswordLabel: "Temporary password",
    createUserSubmit: "Create login",
    creatingUser: "Creating…",
    userCreatedNotice: "Login created.",
    tempPasswordHint:
      "Give this password to the user — they must set their own on first login.",
    usernameTaken: "This username is already taken.",
    nameRequired: "Enter a name.",
    usernameRequired: "Enter a username.",
    deactivate: "Deactivate",
    deactivateConfirm: "Confirm?",
    deactivating: "Deactivating…",
    activeYes: "Active",
    activeNo: "Inactive",
    crewPrefillNote: "This login joins your crew.",
    noCrewNote:
      "A team head's crew is set up separately — here you only pick their site.",
    noCrewWarning:
      "Your account has no crew assigned, so you cannot create logins yet.",
    createPersonTitle: "Add a worker (labour list)",
    personName: "Worker name",
    skill: "Skill (optional)",
    defaultWage: "Daily wage ₹ (optional)",
    createPersonSubmit: "Add worker",
    creatingPerson: "Saving…",
    personCreatedNotice: "Worker added.",
  },

  /** Fleet management (Owner / SM): vehicle list + add-vehicle + add-vehicle-type. */
  FLEET_UI: {
    title: "Fleet",
    subtitle: "Vehicles, their type, and where they're assigned.",
    listTitle: "Vehicles",
    listEmpty: "No vehicles yet.",
    assignedSite: "Site",
    assignedDriver: "Driver",
    noSite: "Not assigned to a site",
    noDriver: "No driver assigned",
    addVehicleTitle: "Add a vehicle",
    regNo: "Registration no.",
    name: "Name (optional)",
    type: "Vehicle type",
    selectType: "Select type",
    noTypes: "No vehicle types yet — add one below first.",
    site: "Site",
    selectSite: "Select site",
    driver: "Driver (optional)",
    status: "Status",
    addVehicleSubmit: "Add vehicle",
    addingVehicle: "Adding…",
    vehicleAdded: "Vehicle added.",
    regNoRequired: "Enter the registration number.",
    typeRequired: "Pick a vehicle type.",
    siteRequired: "Pick a site.",
    regNoTaken: "This registration number is already in use.",
    typesTitle: "Vehicle types",
    typesEmpty: "No vehicle types yet.",
    addTypeTitle: "Add a vehicle type",
    typeName: "Type name",
    trackingMode: "Tracking mode",
    addTypeSubmit: "Add type",
    addingType: "Adding…",
    typeAdded: "Vehicle type added.",
    typeNameRequired: "Enter a name.",
  },

  /** Wage / cost summary (Owner / SM): read-only payroll view + advances + rates. */
  WAGES_UI: {
    title: "Wages",
    subtitle: "What's payable, from attendance, rates, and advances.",
    totalsTitle: "Totals for this window",
    totalGross: "Gross payable",
    totalAdvance: "Advances",
    totalNet: "Net payable",
    totalNetDue: "Net due from workers",
    rowsTitle: "Per-worker summary",
    rowsEmpty: "No attendance in this window yet.",
    presentDaysShort: "Present",
    halfDaysShort: "Half day",
    otHoursShort: "OT",
    dailyRate: "Daily rate",
    gross: "Gross",
    advance: "Advance",
    net: "Net payable",
    netDue: "Due from worker",
    noRate: "No rate set",
    advanceFormTitle: "Record an advance (peshgi)",
    person: "Worker",
    selectPerson: "Select worker",
    amountRupees: "Amount (₹)",
    date: "Date",
    note: "Note (optional)",
    advanceSubmit: "Save advance",
    savingAdvance: "Saving…",
    advanceSaved: "Advance recorded.",
    personRequired: "Pick a worker.",
    amountInvalid: "Enter an amount greater than 0.",
    rateFormTitle: "Set a wage rate",
    rateFormSubtitle: "Only the owner can set wage rates.",
    effectiveFrom: "Effective from",
    rateSubmit: "Save rate",
    savingRate: "Saving…",
    rateSaved: "Wage rate saved.",
    rateReadOnlyNote: "Only the owner can set wage rates — ask them to update a rate.",
  },

  /** Settings (Owner-only): read-only org-config viewer. */
  SETTINGS_UI: {
    title: "Settings",
    subtitle: "Your company's setup.",
    readOnlyNote:
      "These settings are set up by the developer when your company is onboarded. In-app editing is coming in a future update.",
    brandTitle: "Company",
    brandName: "Name",
    brandColor: "Brand color",
    localeTitle: "Language",
    localeDefault: "Default",
    localeEnabled: "Available",
    rolesTitle: "Roles in use",
    recordsTitle: "Record types in use",
    featuresTitle: "Features",
    featureOn: "On",
    featureOff: "Off",
    wageTitle: "Wage model",
    wageModel: "Model",
    wageModelDaily: "Daily rate",
    otMultiplier: "Overtime multiplier",
    vehicleTypesTitle: "Configured vehicle-type templates",
    vehicleTypesEmpty: "None configured yet.",
  },

  /** Dev RBAC-matrix page strings (dev-only surface — stays English). */
  RBAC_MATRIX_UI: {
    title: "RBAC matrix",
    subtitle:
      "Who may do what, at which scope — rendered live from the frozen @techbuilder/contracts PERMISSIONS matrix.",
    actionHeader: "Action",
    denied: "—",
    deniedLegend: "— = denied (NONE)",
    yourRole: "you",
  },
};

/**
 * The catalog shape. Derived from `en` (whose literals widen to `string`
 * because the object is not `as const`), so every locale must provide exactly
 * the same keys.
 */
export type Messages = typeof en;
