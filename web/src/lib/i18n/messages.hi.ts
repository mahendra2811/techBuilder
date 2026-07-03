/**
 * Hindi message catalog — the DEFAULT locale (Hindi-first product).
 *
 * Typed against `Messages` (the shape of the English catalog): a key missing
 * here is a TypeScript build error.
 *
 * Register: simple, everyday spoken Hindi as used on Indian construction
 * sites — NOT formal/Sanskritized Hindi. Common loanwords (साइट, फ़ोटो, बिल,
 * सेव, रिपोर्ट, OT) are kept as spoken. Technical tokens (site codes, reg
 * numbers, ₹ amounts, file names) stay as-is.
 *
 * Dev-only strings (dev login panel, RBAC matrix) intentionally stay English.
 */
import type { Messages } from "./messages.en";

export const hi: Messages = {
  AUTH_MESSAGES: {
    UNAUTHENTICATED: "यूज़रनेम या पासवर्ड गलत है।",
    VALIDATION_FAILED: "लाल निशान वाली जगहें ठीक करें।",
    TOKEN_EXPIRED: "सेशन खत्म हो गया। दोबारा लॉग इन करें।",
    FORBIDDEN: "आपको इसकी इजाज़त नहीं है।",
    RATE_LIMITED: "बहुत बार कोशिश हो गई। थोड़ा रुककर फिर करें।",
    PASSWORD_CHANGE_REQUIRED: "आगे बढ़ने से पहले पासवर्ड बदलना ज़रूरी है।",
    DEFAULT: "कुछ गड़बड़ हो गई। फिर से कोशिश करें।",
  },

  API_MESSAGES: {
    VALIDATION_FAILED: "कुछ जानकारी गलत है — भरी हुई चीज़ें जांच लें (आगे की तारीख नहीं चलेगी)।",
    FORBIDDEN: "इजाज़त नहीं — यह आपकी साइट या तारीख की सीमा से बाहर है।",
    NOT_FOUND: "यह रिकॉर्ड नहीं मिला।",
    CONFLICT: "यह एंट्री पहले से है।",
    RATE_LIMITED: "बहुत जल्दी-जल्दी कोशिश हो रही है। थोड़ा रुककर फिर करें।",
    TOKEN_EXPIRED: "सेशन खत्म हो गया। दोबारा लॉग इन करें।",
    UNAUTHENTICATED: "सेशन खत्म हो गया। दोबारा लॉग इन करें।",
    DEFAULT: "कुछ गड़बड़ हो गई। फिर से कोशिश करें।",
  },

  FORM_MESSAGES: {
    usernameRequired: "यूज़रनेम भरें।",
    passwordRequired: "पासवर्ड भरें।",
    currentPasswordRequired: "पुराना पासवर्ड भरें।",
    newPasswordMin: "नया पासवर्ड कम से कम 8 अक्षर का रखें।",
    confirmMismatch: "दोनों पासवर्ड एक जैसे नहीं हैं।",
  },

  UI: {
    appName: "techBuilder",
    loginTitle: "लॉग इन करें",
    loginSubtitle: "आपकी कंपनी का रोज़ का साइट रिकॉर्ड",
    username: "यूज़रनेम",
    password: "पासवर्ड",
    loginSubmit: "लॉग इन करें",
    loggingIn: "लॉग इन हो रहा है…",
    // DEV ONLY — dev surface stays English on purpose.
    devCredentialsTitle: "Dev logins — tap to fill",
    devCredentialsPassword: "Password for all:",
    changePasswordTitle: "नया पासवर्ड बनाएँ",
    changePasswordSubtitle: "आगे बढ़ने से पहले पासवर्ड बदलना ज़रूरी है।",
    currentPassword: "पुराना पासवर्ड",
    newPassword: "नया पासवर्ड",
    confirmPassword: "नया पासवर्ड दोबारा भरें",
    changePasswordSubmit: "पासवर्ड बदलें",
    changingPassword: "सेव हो रहा है…",
    logout: "लॉग आउट",
    loggedInAs: "लॉग इन:",
    comingSoon: "आपकी स्क्रीनें अगले फ़ेज़ में यहाँ आएँगी।",
    languageToggle: "भाषा",
  },

  ROLE_LABELS: {
    OWNER: "मालिक",
    SITE_MANAGER: "साइट मैनेजर",
    TEAM_HEAD: "टीम हेड",
    DRIVER: "ड्राइवर",
    WORKER: "मज़दूर",
  },

  NAV_LABELS: {
    dashboard: "डैशबोर्ड",
    attendance: "हाज़िरी",
    records: "रिकॉर्ड",
    vehicleFuel: "गाड़ी / तेल",
    requests: "रिक्वेस्ट",
    approvals: "मंज़ूरी",
    wages: "मज़दूरी",
    reports: "रिपोर्ट",
    people: "लोग",
    sites: "साइटें",
    fleet: "गाड़ियाँ",
    settings: "सेटिंग",
  },

  ATTENDANCE_STATUS_LABELS: {
    PRESENT: "हाज़िर",
    ABSENT: "गैर-हाज़िर",
    HALF_DAY: "आधा दिन",
  },

  EXPENSE_CATEGORY_LABELS: {
    FOOD: "खाना",
    SUPPLIES: "सामान",
    TRANSPORT: "भाड़ा",
    LABOUR: "मज़दूरी",
    REPAIR: "मरम्मत",
    MISC: "अन्य",
  },

  ENTRY_UI: {
    // shared
    loading: "लोड हो रहा है…",
    saving: "सेव हो रहा है…",
    retry: "फिर से कोशिश करें",
    site: "साइट",
    date: "तारीख",
    photo: "बिल की फ़ोटो (ज़रूरी नहीं)",
    photoSelected: "फ़ोटो लग गई",
    photoRemove: "हटाएँ",
    photoNotUploaded: "एंट्री सेव हो गई, पर फ़ोटो अपलोड नहीं हो पाई।",
    recentTitle: "पिछले 7 दिन",
    recentEmpty: "पिछले 7 दिनों में कोई एंट्री नहीं।",
    noSites: "आपके लिए कोई साइट नहीं मिली।",
    corrected: "सुधारा गया",

    // attendance
    attendanceTitle: "हाज़िरी",
    attendanceSubtitle: "आज की हाज़िरी लगाएँ और एक बार में सेव करें।",
    allPresent: "सब हाज़िर",
    otHours: "OT",
    otHoursAria: "ओवरटाइम घंटे",
    attendanceSubmit: "हाज़िरी सेव करें",
    attendanceSavedPrefix: "हाज़िरी सेव हो गई —",
    attendanceSavedSuffix: "लोग।",
    attendanceNoChanges: "सेव करने को कुछ नया नहीं — सब वैसा ही है।",
    rosterEmpty: "आपके लिए कोई मज़दूर नहीं मिला।",
    markedTick: "हो गई",

    // records page
    recordsTitle: "रिकॉर्ड",
    recordsSubtitle: "रोज़ का खर्च और काम की एंट्री।",
    tabExpense: "खर्च",
    tabProgress: "आज का काम",

    // expense form
    expenseTitle: "नया खर्च",
    amountRupees: "रकम (₹)",
    category: "किस चीज़ पर",
    billNo: "बिल नं. (ज़रूरी नहीं)",
    expenseSubmit: "खर्च सेव करें",
    expenseSaved: "खर्च सेव हो गया।",
    amountInvalid: "0 से ज़्यादा रकम भरें।",
    categoryRequired: "कोई एक चुनें।",

    // progress form
    progressTitle: "आज का काम",
    progressPlaceholder: "आज साइट पर क्या-क्या हुआ?",
    progressTextRequired: "कुछ लिखें या “आज कुछ खास नहीं” दबाएँ।",
    nothingToReport: "आज कुछ खास नहीं",
    progressSubmit: "सेव करें",
    progressSaved: "काम की एंट्री सेव हो गई।",

    // fuel form
    fuelTitle: "तेल की एंट्री",
    fuelSubtitle: "गाड़ी में भरवाया तेल यहाँ लिखें।",
    vehicle: "गाड़ी",
    noVehicle: "आपके नाम पर कोई गाड़ी नहीं है।",
    reading: "मीटर रीडिंग",
    litres: "लीटर",
    fuelSubmit: "तेल की एंट्री सेव करें",
    fuelSaved: "तेल की एंट्री सेव हो गई।",
    enterAnother: "एक और भरें",
    readingInvalid: "अभी की मीटर रीडिंग भरें।",
    litresInvalid: "कितने लीटर भरा, यह भरें।",
  },

  COMPLETENESS_STATE_LABELS: {
    COMPLETE: "पूरा",
    PARTIAL: "अधूरा",
    MISSING: "नहीं भरा",
  },

  OWNER_UI: {
    // window toggle
    windowToday: "आज",
    window7d: "7 दिन",
    window30d: "30 दिन",

    // dashboard
    dashboardTitle: "डैशबोर्ड",
    dashboardSubtitle: "आपकी साइटों पर क्या हुआ।",
    kpiHeadcount: "आज साइट पर",
    kpiSpendToday: "आज का खर्च",
    kpiActiveSites: "चालू साइटें",
    kpiVehiclesActive: "आज चली गाड़ियाँ",
    kpiOpenIssues: "खुले मुद्दे",
    kpiPendingApprovals: "मंज़ूरी बाकी",
    completenessTitle: "रोज़ का रिकॉर्ड — हर साइट का",
    completenessSubtitle: "आज का हाल और पिछले 7 दिन।",
    completenessNoData: "कुछ नहीं",
    offDay: "छुट्टी / कुछ नहीं",
    markedSuffix: "हाज़िरी आज",
    costTitle: "पैसा कहाँ गया",
    costBySite: "साइट के हिसाब से खर्च",
    costByVehicle: "गाड़ी के हिसाब से तेल",
    costEmpty: "इस दौरान कोई खर्च नहीं।",
    unknownSite: "अनजान साइट",
    unknownVehicle: "अनजान गाड़ी",

    // WhatsApp digest
    digestTitle: "आज का सार",
    digestSubtitle: "आपके WhatsApp ग्रुप के लिए एक मैसेज।",
    digestShare: "WhatsApp पर भेजें",
    digestCopy: "कॉपी करें",
    digestCopied: "कॉपी हो गया।",
    digestCopyFailed: "कॉपी नहीं हुआ — ऊपर के टेक्स्ट को देर तक दबाकर कॉपी करें।",
    digestSitesHeading: "साइटें:",
    digestMarked: "हाज़िरी",
    digestExpense: "खर्च",
    digestFuel: "तेल",
    digestTotalSpend: "आज कुल खर्च:",
    digestHeadcount: "आज साइट पर:",
    digestFooter: "— techBuilder से",

    // sites list + drill-in
    sitesTitle: "साइटें",
    sitesSubtitle: "साइट पर टैप करें, उसका रिकॉर्ड देखें।",
    sitesEmpty: "अभी कोई साइट नहीं।",
    siteBack: "सब साइटें",
    siteNotFound: "यह साइट नहीं मिली।",
    tabAttendance: "हाज़िरी",
    tabExpenses: "खर्च",
    tabProgress: "काम",
    tabFuel: "तेल",
    attendanceEmpty: "इस दौरान कोई हाज़िरी नहीं।",
    expensesEmpty: "इस दौरान कोई खर्च नहीं।",
    progressEmpty: "इस दौरान काम की कोई एंट्री नहीं।",
    fuelEmpty: "इस दौरान तेल की कोई एंट्री नहीं।",
    markedByPrefix: "लगाई:",
    enteredByPrefix: "भरा:",
    voided: "रद्द",
    litresSuffix: "ली",
    readingPrefix: "रीडिंग",
    otPrefix: "OT",

    // audit chip
    auditCorrected: "सुधारा गया",
    auditUnknownUser: "अनजान यूज़र",

    // reports / Excel export
    reportsTitle: "रिपोर्ट",
    reportsSubtitle: "हाज़िरी और खर्च की Excel फ़ाइल डाउनलोड करें।",
    reportsDownload: "Excel डाउनलोड करें",
    reportsPreparing: "रिकॉर्ड आ रहे हैं…",
    reportsPreviewAttendance: "हाज़िरी की लाइनें",
    reportsPreviewExpenses: "खर्च की लाइनें",
    reportsFileLabel: "फ़ाइल",
    reportsDone: "Excel फ़ाइल डाउनलोड हो गई।",
    sheetAttendance: "हाज़िरी",
    sheetExpenses: "खर्च",
    colDate: "तारीख",
    colSite: "साइट",
    colPerson: "नाम",
    colStatus: "हाज़िरी",
    colOtHours: "OT घंटे",
    colMarkedBy: "किसने लगाई",
    colCorrected: "सुधारा गया",
    colCategory: "किस चीज़ पर",
    colAmount: "रकम ₹",
    colBillNo: "बिल नं",
    colEnteredBy: "किसने भरा",
    colVoided: "रद्द",
    exportYes: "हाँ",
  },

  // Dev-only surface — stays English on purpose (stripped before pilot).
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
