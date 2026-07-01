/**
 * OrgConfig — FROZEN. The per-merchant config (config is DATA, not code).
 * Validated with zod at app boot AND on backend org-load; invalid config FAILS LOUDLY (CONFIG_INVALID).
 */
import { z } from 'zod';
import { LOCALES, ROLES, RECORD_TYPES, VEHICLE_TRACKING_MODES } from './enums';

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
