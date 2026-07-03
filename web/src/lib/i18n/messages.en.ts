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
  AttendanceStatus,
  CompletenessState,
  ErrorCode,
  ExpenseCategory,
  Role,
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
    comingSoon: "Your screens will appear here in the next phase.",
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
