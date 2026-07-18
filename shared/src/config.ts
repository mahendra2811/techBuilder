/**
 * OrgConfig — FROZEN. The per-merchant config (config is DATA, not code).
 * Validated with zod at app boot AND on backend org-load; invalid config FAILS LOUDLY (CONFIG_INVALID).
 */
import { z } from 'zod';
import {
  EMERGENCY_CONTACT_KINDS,
  EXPENSE_CATEGORIES,
  LOCALES,
  ROLES,
  RECORD_TYPES,
  VEHICLE_TRACKING_MODES,
} from './enums';

const hexColor = z.string().regex(/^#([0-9a-fA-F]{6})$/, 'must be a #RRGGBB hex color');

export const VehicleTypeConfigSchema = z.object({
  key: z.string().min(1),
  labelHi: z.string().min(1),
  labelEn: z.string().min(1),
  trackingMode: z.enum(VEHICLE_TRACKING_MODES),
  extraFields: z
    .array(
      z.object({
        key: z.string().min(1),
        labelHi: z.string().min(1),
        labelEn: z.string().min(1),
        type: z.enum(['text', 'number', 'select', 'photo']),
        required: z.boolean().default(false),
        options: z.array(z.string()).optional(), // for type:'select'
      }),
    )
    .default([]),
});
export type VehicleTypeConfig = z.infer<typeof VehicleTypeConfigSchema>;

export const ExpenseCategoryConfigSchema = z.object({
  key: z.enum(EXPENSE_CATEGORIES),
  labelHi: z.string().min(1),
  labelEn: z.string().min(1),
  enabled: z.boolean().default(true),
});
export type ExpenseCategoryConfig = z.infer<typeof ExpenseCategoryConfigSchema>;

/** frozen.10 (SM-2): SM-created SUBcategory under one of the 6 fixed categories.
 *  Config-only — the expense row stores the `key` in its `subcategory` column. */
export const ExpenseSubcategoryConfigSchema = z.object({
  key: z.string().min(1).max(40),
  parent: z.enum(EXPENSE_CATEGORIES),
  labelHi: z.string().min(1),
  labelEn: z.string().min(1),
  enabled: z.boolean().default(true),
});
export type ExpenseSubcategoryConfig = z.infer<typeof ExpenseSubcategoryConfigSchema>;

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryConfig[] = [
  { key: 'FOOD', labelHi: 'खाना', labelEn: 'Food', enabled: true },
  { key: 'SUPPLIES', labelHi: 'सामान', labelEn: 'Supplies', enabled: true },
  { key: 'TRANSPORT', labelHi: 'यातायात', labelEn: 'Transport', enabled: true },
  { key: 'LABOUR', labelHi: 'मज़दूरी', labelEn: 'Labour', enabled: true },
  { key: 'REPAIR', labelHi: 'मरम्मत', labelEn: 'Repair', enabled: true },
  { key: 'MISC', labelHi: 'अन्य', labelEn: 'Other', enabled: true },
];

/** Round 2 (frozen.8): per-material-type entry rules stored in materials.config (jsonb).
 *  The SM sets these when creating a type; forms and validation follow them.
 *  Supervisor entries are always the FINAL record; driver picks are data-only inputs. */
export const MaterialTypeConfigSchema = z.object({
  /** Supervisor logs IN/CONSUME for this type (the accountable, final entry). */
  supervisorLogs: z.boolean().default(true),
  /** Drivers pick this type on trips (data-only; matched against the supervisor's entry). */
  driverPicks: z.boolean().default(false),
  /** Drivers may see this type's numbers but never enter them. */
  driverViewOnly: z.boolean().default(false),
});
export type MaterialTypeConfig = z.infer<typeof MaterialTypeConfigSchema>;

export const EmergencyContactSchema = z.object({
  kind: z.enum(EMERGENCY_CONTACT_KINDS),
  label: z.string().min(1),
  phone: z.string().min(3),
});
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;

/** Per-site overrides stored in sites.expense_form_config (jsonb). Everything optional — org defaults apply.
 *  Limit-editing rule: each threshold is edited by the role ONE level above the one it binds. */
export const SiteExpenseFormConfigSchema = z.object({
  /** Worker/driver expense-request cap (paise). Round 2: supervisor requests have NO cap. */
  requestCapPaise: z.number().int().nonnegative().optional(),
  /** frozen.10 (SUP-9): UN-deprecated — the supervisor's per-entry DIRECT limit again. Below it he
   *  books directly (accountant verify still pending); above it the entry routes as an
   *  EXPENSE_ADD request that the ACCOUNTANT (or Owner) decides. Falls back to org expense.thDirectLimitPaise. */
  thDirectLimitPaise: z.number().int().nonnegative().optional(),
  /** @deprecated Round 2 (frozen.8): SM books any amount (accountant-verified) — key kept so stored configs parse; not read. */
  smDirectLimitPaise: z.number().int().nonnegative().optional(),
  /** Site category subset/labels; falls back to org expense.categories. */
  categories: z.array(ExpenseCategoryConfigSchema).optional(),
  /** frozen.10 (SM-2): SM-created subcategories (site-level; falls back to org expense.subcategories). */
  subcategories: z.array(ExpenseSubcategoryConfigSchema).optional(),
  /** Boolean toggles for which boxes the worker/driver request form shows. */
  fields: z
    .object({
      billPhoto: z.boolean().optional(),
      extraPhotos: z.boolean().optional(),
      remark: z.boolean().optional(),
      voiceNote: z.boolean().optional(),
      vendor: z.boolean().optional(),
    })
    .optional(),
  /** frozen.10 (SM-2/D12): per-form field configuration hub — keyed by form key
   *  (e.g. 'expense', 'expenseRequest', 'fuel', 'damage', 'progress', 'materialEntry',
   *  'complaint', 'vehicleSwitch'); each field gets visible/required toggles. Loose record
   *  so new forms/fields need no contracts change. */
  formsConfig: z
    .record(
      z.string(),
      z.object({
        fields: z.record(z.string(), z.object({ visible: z.boolean().optional(), required: z.boolean().optional() })),
      }),
    )
    .optional(),
});
export type SiteExpenseFormConfig = z.infer<typeof SiteExpenseFormConfigSchema>;

export const OrgConfigSchema = z.object({
  brand: z.object({
    name: z.string().min(1),
    logoAsset: z.string().optional(),
    primaryColor: hexColor,
    secondaryColor: hexColor.optional(),
  }),
  locale: z.object({
    default: z.enum(LOCALES).default('hi'),
    enabled: z.array(z.enum(LOCALES)).min(1).default(['hi', 'en']),
  }),
  roles: z.object({
    enabled: z.array(z.enum(ROLES)).min(1),
  }),
  records: z.object({
    enabled: z.array(z.enum(RECORD_TYPES)).min(1),
  }),
  features: z.object({
    voiceNotes: z.boolean().default(true),
    kioskMode: z.boolean().default(true),
    fuelReconciliation: z.boolean().default(true),
    materialReconciliation: z.boolean().default(true),
    wageSummary: z.boolean().default(true),
    whatsappShare: z.boolean().default(true),
    pdfExport: z.boolean().default(false),
    docExpiryAlerts: z.boolean().default(false),
    qrScan: z.boolean().default(true),
    gpsGeotag: z.boolean().default(true),
  }),
  vehicleTypes: z.array(VehicleTypeConfigSchema).default([]),
  wage: z.object({
    model: z.literal('daily').default('daily'),
    otMultiplier: z.number().positive().default(1.5),
  }),
  /** Org-level expense defaults; per-site overrides live on sites.expense_form_config. */
  expense: z
    .object({
      requestCapPaise: z.number().int().nonnegative().default(200_000), // ₹2,000 worker/driver request cap
      thDirectLimitPaise: z.number().int().nonnegative().default(2_500_000), // frozen.10: UN-deprecated — supervisor direct limit (₹25k default; site override wins)
      smDirectLimitPaise: z.number().int().nonnegative().default(10_000_000), // @deprecated frozen.8 — unread (SM direct unlimited, accountant-verified)
      requestBackdateDays: z.number().int().min(0).default(1), // worker/driver: today + 1 day back (frozen.9 — was 2)
      thBackdateDays: z.number().int().min(0).default(1), // frozen.10 (D1): supervisor entries = today + yesterday (was 7)
      categories: z.array(ExpenseCategoryConfigSchema).default(DEFAULT_EXPENSE_CATEGORIES),
      subcategories: z.array(ExpenseSubcategoryConfigSchema).default([]), // frozen.10 (SM-2)
    })
    .default({}),
  reconciliation: z.object({
    /** litres-or-units-per-km/hour norm, keyed by vehicleType.key */
    fuelNorms: z.record(z.string(), z.number().positive()).default({}),
  }),
  completion: z.object({
    /** which RecordTypes a role must produce for a site/day to be COMPLETE */
    requiredRecordsByRole: z.record(z.string(), z.array(z.enum(RECORD_TYPES))).default({}),
    cutoffLocalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('20:00'),
  }),
});

export type OrgConfig = z.infer<typeof OrgConfigSchema>;

/** Parse + validate; throws ZodError (caller maps to CONFIG_INVALID). */
export function parseOrgConfig(input: unknown): OrgConfig {
  return OrgConfigSchema.parse(input);
}
