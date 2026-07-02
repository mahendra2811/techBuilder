import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig, type OrgConfig } from '@techbuilder/contracts';
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
