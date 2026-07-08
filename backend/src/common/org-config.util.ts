import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import {
  parseOrgConfig,
  type ExpenseCategoryConfig,
  type OrgConfig,
  type SiteExpenseFormConfig,
} from '@techbuilder/contracts';
import type { Tx } from '../db/db.service';

/** Load + parse the current org's config inside a tenant tx (RLS scopes the row). */
export async function loadOrgConfig(tx: Tx): Promise<OrgConfig> {
  const [o] = await tx.select({ config: schema.orgs.config }).from(schema.orgs).limit(1);
  return parseOrgConfig(o?.config ?? {});
}

/** Convenience: the org's EOD cutoff (falls back to the schema default '20:00'). */
export async function loadEodCutoff(tx: Tx): Promise<string> {
  const cfg = await loadOrgConfig(tx);
  return cfg.completion.cutoffLocalTime;
}

/** Effective expense limits/windows/categories: per-site overrides on top of org defaults
 *  (client-plan v1 — the limit-editing rule: each threshold edited one level above). */
export interface ExpenseLimits {
  requestCapPaise: number;
  thDirectLimitPaise: number;
  smDirectLimitPaise: number;
  requestBackdateDays: number;
  thBackdateDays: number;
  categories: ExpenseCategoryConfig[];
}

export async function loadExpenseLimits(tx: Tx, siteId: string | null): Promise<ExpenseLimits> {
  const cfg = await loadOrgConfig(tx);
  const base = cfg.expense;
  let site: SiteExpenseFormConfig | null = null;
  if (siteId) {
    const [s] = await tx
      .select({ c: schema.sites.expenseFormConfig })
      .from(schema.sites)
      .where(and(eq(schema.sites.id, siteId), isNull(schema.sites.deletedAt)));
    site = (s?.c as SiteExpenseFormConfig | null) ?? null;
  }
  return {
    requestCapPaise: site?.requestCapPaise ?? base.requestCapPaise,
    thDirectLimitPaise: site?.thDirectLimitPaise ?? base.thDirectLimitPaise,
    smDirectLimitPaise: site?.smDirectLimitPaise ?? base.smDirectLimitPaise,
    requestBackdateDays: base.requestBackdateDays,
    thBackdateDays: base.thBackdateDays,
    categories: site?.categories ?? base.categories,
  };
}
