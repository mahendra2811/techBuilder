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
  EmergencyContactKind,
  ErrorCode,
  ExpenseCategory,
  IssueSeverity,
  IssueStatus,
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
    expense: "Expense",
    progress: "Progress",
    records: "Records",
    vehicleFuel: "Vehicle / Fuel",
    requests: "Requests",
    approvals: "Approvals",
    wages: "Wages",
    reports: "Reports",
    people: "People",
    sites: "Sites",
    fleet: "Fleet",
    vendors: "Shops",
    ledger: "Khata",
    insights: "Insights",
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
    EXPENSE_ADD: "Expense request",
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
    amount: "Amount",
    category: "Category",
    businessDate: "Date",
    remark: "Remark",
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

  /** Multi-photo picker + voice-note recorder (shared "media kit" fields). */
  MEDIA_UI: {
    // multi-photo picker
    photos: "Photos (optional)",
    camera: "Camera",
    gallery: "Gallery",
    photoRemove: "Remove photo",
    photosMaxReached: "Maximum photos reached.",

    // voice-note recorder
    voiceNote: "Voice note (optional)",
    recordStart: "Record",
    recordStop: "Stop",
    recordDelete: "Delete recording",
    recordingLabel: "Recording",
    micPermissionDenied: "Microphone access was denied. Allow microphone access to record a voice note.",
    micUnsupported: "Voice recording is not supported on this device.",
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

  /** Driver's day (WO-7): vehicle snapshot card + morning start / evening end forms. */
  DRIVER_DAY_UI: {
    // vehicle snapshot card
    currentReadingLabel: "Current reading",
    yesterdayReadingLabel: "Yesterday's reading",
    noReadingYet: "No reading yet",
    noVehicleAssigned: "No vehicle is assigned to you yet. Contact your site manager.",

    // morning (start-of-day) form
    morningBanner: "Morning update pending — fill before starting",
    morningTitle: "Start of day",
    morningSubtitle: "Log your meter reading before you start.",
    meterPhotoLabel: "Meter photo",
    meterPhotoRequired: "Take a photo of the meter before saving.",
    startReadingLabel: "Start reading",
    startReadingRequired: "Enter today's start reading.",
    extraPhotosLabel: "Vehicle / site photos (optional)",
    morningSubmit: "Save start reading",

    // evening (end-of-day) form — optional
    eveningTitle: "End of day",
    eveningSubtitle: "Optional to fill in — but if you do, the meter photo is required.",
    endReadingRequired: "Enter today's current reading.",
    endReadingTooLow: "Current reading can't be less than the start reading.",
    hoursWorkedLabel: "Hours worked",
    hoursWorkedHint: "Two shifts? Add the hours together.",
    hoursWorkedInvalid: "Enter a valid number of hours.",
    loadsCountLabel: "Trips / truckloads",
    loadsCountInvalid: "Enter a valid number.",
    noteLabel: "Note (optional)",
    eveningSubmit: "Save end of day",
    eveningSaved: "End-of-day update saved.",
  },

  /** Emergency & contacts tap-to-call footer (worker + driver dashboards). */
  CONTACTS_UI: {
    title: "Emergency & contacts",
    people: "People",
    emergency: "Emergency",
    siteManager: "Site Manager",
    teamHead: "Team Head",
    KIND_LABELS: {
      POLICE: "Police",
      AMBULANCE: "Ambulance",
      HOSPITAL: "Hospital",
      FIRE: "Fire brigade",
      SITE_OFFICE: "Site office",
      OTHER: "Other",
    } satisfies Record<EmergencyContactKind, string>,
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
    finalCategoryLabel: "Final category",
    rejectReasonRequired: "A reason is required to reject",
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

  /** Worker/Driver expense-addition request form + "my requests" (WO-5). */
  EXPENSE_REQUEST_UI: {
    title: "New expense request",
    subtitle: "Ask your Team Head / Site Manager to add an expense.",
    noSite: "No site is assigned to your account yet.",
    amountLabel: "Amount (₹)",
    amountInvalid: "Enter an amount greater than 0.",
    amountOverCapPrefix: "This is over your request limit of",
    amountOverCapSuffix: " — ask your Team Head / Site Manager to enter it directly.",
    dateLabel: "Date",
    dateToday: "Today",
    dateYesterday: "Yesterday",
    categoryLabel: "Category",
    categoryRequired: "Pick a category.",
    photosLabel: "Bill photo + extra photos (optional)",
    remarkLabel: "Remark (optional)",
    remarkPlaceholder: "Anything to add?",
    submit: "Send request",
    submitting: "Sending…",
    submitted: "Request sent.",
    mediaNotUploaded: "Sent, but some photos or the voice note could not be uploaded.",
    myRequestsTitle: "My expense requests",
    myRequestsEmpty: "You haven't sent any expense requests yet.",
    rejectedReasonPrefix: "Reason:",
    summaryTitle: "My requests",
    summaryPendingLabel: "Pending",
    summaryApprovedLabel: "Approved",
    summaryRejectedLabel: "Rejected",
    summaryEmpty: "No requests yet.",
    summaryViewAll: "View all / raise a request",
  },

  /** Site-Manager Settings — per-site expense limits/categories/form-fields + emergency contacts (WO-8). */
  SM_SETTINGS_UI: {
    noSite: "No site is assigned to you yet.",

    limitsTitle: "Limits",
    limitsSubtitle: "Amounts your workers/drivers and Team Head can enter directly.",
    requestCapLabel: "Worker / driver request cap (₹)",
    thLimitLabel: "Team Head per-entry limit (₹)",
    smLimitLabel: "Your (Site Manager) per-entry limit (₹)",
    smLimitReadOnlyNote: "Set by the Owner — you cannot change this.",
    effectivePrefix: "Currently:",
    defaultHint: "default",
    customHint: "custom",
    limitInvalid: "Enter a valid amount (0 or more), or leave blank to use the default.",

    categoriesTitle: "Expense categories",
    categoriesSubtitle: "Turn categories on or off and edit their Hindi/English labels.",
    categoryOn: "On",
    categoryOff: "Off",
    categoryHiLabel: "Hindi label",
    categoryEnLabel: "English label",
    categoryLabelRequired: "Every category needs both a Hindi and an English label.",

    fieldsTitle: "Request-form fields",
    fieldsSubtitle: "Choose which boxes show on the worker/driver expense-request form.",
    fieldLabels: {
      billPhoto: "Bill photo",
      extraPhotos: "Extra photos",
      remark: "Remark",
      voiceNote: "Voice note",
      vendor: "Vendor",
    },
    fieldShown: "Shown",
    fieldHidden: "Hidden",

    saveExpenseSettings: "Save settings",
    savingExpenseSettings: "Saving…",
    expenseSettingsSaved: "Settings saved.",

    contactsTitle: "Emergency contacts",
    contactsSubtitle: "Shown to workers and drivers at your site.",
    contactsEmpty: "No emergency contacts added yet.",
    contactKindLabel: "Type",
    contactLabelLabel: "Label",
    contactPhoneLabel: "Phone",
    contactLabelRequired: "Enter a label.",
    contactPhoneRequired: "Enter a valid phone number.",
    addContact: "Add contact",
    removeContact: "Remove",
    saveContacts: "Save contacts",
    savingContacts: "Saving…",
    contactsSaved: "Contacts saved.",
  },

  /** SM/TH direct-expense screen (WO-6) — limit-aware: booked at once under the
   *  cap, sent as an EXPENSE_ADD approval request over it. */
  EXPENSE_UI: {
    title: "Expense",
    subtitle: "Log a site expense — booked at once if it's within your limit, otherwise sent for approval.",
    category: "Category",
    categoryRequired: "Pick a category.",
    amountRupees: "Amount (₹)",
    amountInvalid: "Enter an amount greater than 0.",
    limitHintPrefix: "Your direct-entry limit:",
    overLimitBanner: "Above your limit — this will go for approval.",
    billPhotoLabel: "Bill / receipt photo (optional)",
    extraPhotosLabel: "More photos (optional)",
    remark: "Remark (optional)",
    remarkPlaceholder: "Anything to add?",
    overLimitServerNotice: "This needs approval, or the date is outside your direct-entry window.",
    sendAsRequest: "Send for approval instead",
    submittingRequest: "Sending…",
    saving: "Saving…",
    submitDirect: "Save expense",
    submitRequest: "Send for approval",
    savedDirect: "Expense saved.",
    savedRequest: "Sent for approval.",
    photoNotUploaded: "Saved, but some photos or the voice note could not be uploaded.",
    enteredByPrefix: "by",
    unknownUser: "unknown user",
  },

  /** Vendor / shop accounts — udhaar khata (WO-10): SM shop list + ledger + payments,
   *  plus the shared "paid by cash / on credit" selector on both expense forms. */
  VENDOR_UI: {
    title: "Shops (Udhaar Khata)",
    subtitle: "Shops you buy from on credit — track what's owed and record payments.",
    listTitle: "Shops",
    listEmpty: "No shops added yet.",
    sellsUnknown: "General store",
    phoneUnknown: "No phone",
    viewLedger: "View khata",
    backToList: "Back to shops",

    addShopTitle: "Add a shop",
    nameLabel: "Shop name",
    nameRequired: "Enter the shop name.",
    phoneLabel: "Phone (optional)",
    sellsLabel: "What they sell (optional)",
    addShopSubmit: "Add shop",
    addingShop: "Saving…",
    shopAdded: "Shop added.",

    ledgerTitle: "Khata",
    purchasedLabel: "Total purchased",
    paidLabel: "Total paid",
    balanceLabel: "Balance (owed)",
    monthsTitle: "Month-wise",
    monthsEmpty: "No purchases or payments yet.",
    monthPurchased: "Purchased",
    monthPaid: "Paid",

    recordPaymentTitle: "Record a payment",
    amountLabel: "Amount paid (₹)",
    amountInvalid: "Enter an amount greater than 0.",
    noteLabel: "Note (optional)",
    paymentSubmit: "Save payment",
    savingPayment: "Saving…",
    paymentSaved: "Payment recorded.",

    // Shared "paid by" selector on the SM/TH direct-expense form + the worker/driver
    // expense-request form (only shown when the site has >=1 shop).
    paidByLabel: "Paid by",
    paidByCash: "Cash",
    paidByCredit: "On credit at shop",
    shopLabel: "Shop",
    selectShop: "Select shop",
    shopRequired: "Pick a shop.",
  },

  /** Progress report — WO-14: the "Progress" half of the split Records screen
   *  (SM + TH). Morning/evening usage, multiple reports per site/day allowed;
   *  filing one never blocks another. */
  PROGRESS_UI: {
    title: "Progress report",
    subtitle: "What was done on site today — morning or evening, as many reports as you need.",
    textLabel: "What was done today",
    textPlaceholder: "Describe today's work…",
    textRequired: "Write something, or attach a photo.",
    sitePhotosLabel: "Site photos (optional, up to 20)",
    billPhotosLabel: "Bill photos (optional)",
    saving: "Saving…",
    submit: "Save report",
    saved: "Progress report saved.",
    photoNotUploaded: "Saved, but some photos or the voice note could not be uploaded.",
    unknownUser: "unknown user",
    coveredBannerPrefix: "Today is covered — filed by",
    todaysReportsTitle: "Today's reports",
    todaysReportsEmpty: "No report filed yet today.",
    historyTitle: "Last 7 days",
    historyEmpty: "No progress reports in the last 7 days.",
    attachmentsLabel: "attachment(s)",
  },

  /** Cash ledger — money khata (WO-9): the dashboard <KhataCard /> + the
   *  Owner/SM/TH ledger screen (give/receive-back form, history, rollup). */
  LEDGER_UI: {
    // Dashboard khata card
    cardTitle: "My khata",
    balanceLabel: "Cash with me",
    receivedLabel: "Received",
    spentLabel: "Spent",
    givenLabel: "Given",

    // Ledger screen
    title: "Money khata",
    subtitle: "Cash given out, received back, and who holds what.",

    // Give / receive-back form
    formTitle: "Give / receive money",
    formSubtitle: "Record cash you handed over or got back.",
    personLabel: "Person",
    selectPerson: "Select person",
    personRequired: "Pick a person.",
    noPeople: "No one under you to give cash to yet.",
    kindLabel: "What happened?",
    kindGive: "Gave money",
    kindReturn: "Received back",
    kindGiveHint: "You handed cash to this person.",
    kindReturnHint: "This person returned cash to you.",
    amountLabel: "Amount (₹)",
    amountInvalid: "Enter an amount greater than 0.",
    noteLabel: "Note (optional)",
    submit: "Save entry",
    submitting: "Saving…",
    saved: "Entry saved.",

    // Transfers history
    historyTitle: "Cash entries",
    historyEmpty: "No cash entries yet.",
    kindChipGive: "Gave",
    kindChipReturn: "Returned",

    // Rollup (Owner + Site Manager only)
    rollupTitle: "Who holds what",
    rollupSubtitle: "Each person's cash position — where the money went.",
    rollupEmpty: "No cash movement yet.",
    rollupReceived: "Received",
    rollupGiven: "Given onward",
    rollupSpent: "Spent",
  },

  /**
   * WO-11/WO-12: driver self-switch, damage lifecycle (report → resolve → close), and
   * fleet/driver drill-downs (Owner + Site Manager).
   */
  VEHICLE_WAVE_UI: {
    SEVERITY_LABELS: {
      LOW: "Small",
      MEDIUM: "Medium",
      HIGH: "Big",
    } satisfies Record<IssueSeverity, string>,
    STATUS_LABELS: {
      OPEN: "Open",
      RESOLVED: "Resolved",
    } satisfies Record<IssueStatus, string>,

    // driver: switch section
    switchTitle: "Switch vehicle",
    switchSubtitle: "Move yourself onto another vehicle at your site.",
    switchListEmpty: "No other vehicles at your site right now.",
    currentVehicleBadge: "Current",
    switchNow: "Switch now",
    switchNowBusy: "Switching…",
    switchNowDone: "You are now on this vehicle.",
    needsApproval: "Needs approval",
    requestSwitchLink: "Ask for this vehicle",

    // driver: damage report form
    reportDamageTitle: "Report damage",
    reportDamageSubtitle: "Tell us what happened to the vehicle.",
    severityLabel: "How bad?",
    descriptionLabel: "What happened?",
    descriptionRequired: "Describe what happened.",
    reportSubmit: "Report damage",
    reportSubmitting: "Saving…",
    reportSaved: "Damage report sent.",

    // damage timeline (shared: driver history + vehicle-detail tab)
    damageHistoryTitle: "Damage reports",
    damageHistoryEmpty: "No damage reports yet.",
    timelineRaised: "Raised",
    timelineResolved: "Resolved",
    timelineClosed: "Closed by driver",

    // driver: closing remark (on a RESOLVED issue they raised)
    closeButton: "Add closing remark",
    closeFormTitle: "Closing remark",
    closeNoteLabel: "Note (optional)",
    closeSubmit: "Close",
    closeSubmitting: "Saving…",
    closeSaved: "Closed.",

    // SM / Owner: resolve form (on an OPEN issue)
    resolveButton: "Mark resolved",
    resolveFormTitle: "Resolve this damage report",
    resolutionNoteLabel: "What was done?",
    resolutionNoteRequired: "Describe what was repaired.",
    resolveSubmit: "Mark resolved",
    resolveSubmitting: "Saving…",
    resolveSaved: "Marked resolved.",

    // vehicle detail screen (Owner + SM)
    vehicleDetailBack: "Back to fleet",
    vehicleNotFound: "Vehicle not found.",
    analyticsTitle: "Vehicle performance",
    avgRunPerDay7: "Avg / day (7d)",
    avgRunPerDay30: "Avg / day (30d)",
    avgRunPerDay90: "Avg / day (90d)",
    noData: "No data yet",
    fuel30Title: "Fuel (30d)",
    fuelLitresSuffix: "L",
    monthlyCostTitle: "Cost this month",
    totalCostTitle: "Total fuel cost (all-time)",
    logsTitle: "Vehicle logs",
    logsEmpty: "No logs yet.",
    fuelTitle: "Fuel entries",
    fuelEmpty: "No fuel entries yet.",
    tripsTitle: "Trips",
    tripsEmpty: "No trips yet.",
    currentDriverLabel: "Current driver",
    viewDriverLink: "View driver details",
    noDriverAssigned: "No driver assigned",

    // driver detail screen (Owner + SM)
    driverDetailBack: "Back",
    driverDetailTitle: "Driver details",
    driverNotFound: "Driver not found.",
    driverPhoneLabel: "Phone",
    driverVehicleLabel: "Current vehicle",
    driverNoVehicle: "No vehicle assigned",
    driverExpensesTitle: "Expenses entered",
    driverExpensesEmpty: "No expenses yet.",
  },

  /**
   * WO-13 — date-wise "pick a day, see everything" insights (client plan S-1/T-1/O-1):
   * the Owner/SM/TH insights screen + the per-person drill-down + the two dashboard embeds.
   */
  INSIGHTS_UI: {
    title: "Day-wise insights",
    subtitle: "Pick a day and see everything that happened.",
    unknownUser: "unknown user",

    // date presets
    chipToday: "Today",
    chipYesterday: "Yesterday",
    chipDayBefore: "Day before",
    chipLast7: "Last 7 days",
    chipLast30: "Last 30 days",
    customDateLabel: "Custom date",

    // single-day view
    noProgressBanner: "No progress filed on this day.",
    progressTitle: "Progress",
    progressEmpty: "No progress notes on this day.",
    attachmentsSuffix: "attachment(s)",
    expensesTitle: "Expenses",
    expensesEmpty: "No expenses on this day.",
    expenseTotalPrefix: "Total",
    requestsTitle: "Requests",
    requestsEmpty: "No requests on this day.",

    // period view
    periodTotalSpend: "Total spend",
    periodProgressLabel: "Days with progress",
    periodNoProgressLabel: "Days with no progress",
    dayListTitle: "Day by day",
    dayListNoteCount: "notes",
    periodEmpty: "Nothing recorded in this period.",

    // dashboard embeds
    crewTodayStripTitle: "Crew — today",
    crewTodayStripSubtitle: "See everything your crew filed today, or any other day.",
    dashboardLinkTitle: "Day-wise insights",
    dashboardLinkSubtitle: "Pick any day and see everything that happened.",

    // person drill-down
    personTitle: "Person insights",
    personBack: "Back to people",
    personTotalsTitle: "Totals",
    personDaysTitle: "Day by day",
  },
};

/**
 * The catalog shape. Derived from `en` (whose literals widen to `string`
 * because the object is not `as const`), so every locale must provide exactly
 * the same keys.
 */
export type Messages = typeof en;
