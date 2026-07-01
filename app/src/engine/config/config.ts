/**
 * Merchant config loader — the per-org config (brand, enabled roles/records, vehicle types, feature flags).
 * Config is DATA, validated by the frozen OrgConfig zod schema. A new merchant = a config object + assets.
 */
import { parseOrgConfig, type OrgConfig } from '@techbuilder/contracts';

export type MerchantConfig = OrgConfig;

/** Default demo merchant (mirrors the backend seed) — used by the mock adapter / first-run. */
export const ACME_CONFIG: MerchantConfig = parseOrgConfig({
  brand: { name: 'Acme Builders Pvt Ltd', primaryColor: '#1A5276' },
  locale: { default: 'hi', enabled: ['hi', 'en'] },
  roles: { enabled: ['OWNER', 'SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'] },
  records: {
    enabled: ['progress', 'expense', 'fuel', 'trip', 'materialUsage', 'materialMove', 'issue', 'attendance', 'leave', 'vehicleStartEnd'],
  },
  features: {},
  vehicleTypes: [
    { key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] },
    { key: 'jcb', labelHi: 'जेसीबी', labelEn: 'JCB', trackingMode: 'HOURS', extraFields: [] },
  ],
  wage: {},
  reconciliation: {},
  completion: {},
});

let active: MerchantConfig = ACME_CONFIG;

export function setActiveConfig(cfg: unknown): MerchantConfig {
  active = parseOrgConfig(cfg);
  return active;
}
export function getActiveConfig(): MerchantConfig {
  return active;
}

/** Feature-flag + enablement helpers used by the role-router and screens. */
export const isRecordEnabled = (cfg: MerchantConfig, t: MerchantConfig['records']['enabled'][number]): boolean =>
  cfg.records.enabled.includes(t);
export const isRoleEnabled = (cfg: MerchantConfig, r: MerchantConfig['roles']['enabled'][number]): boolean =>
  cfg.roles.enabled.includes(r);
export const isFeatureOn = (cfg: MerchantConfig, f: keyof MerchantConfig['features']): boolean => cfg.features[f];
