import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  CreateVehicleDocumentInput,
  CreateVehicleReminderInput,
  UpdateVehicleDocumentInput,
  UpdateVehicleReminderInput,
  VehicleDocument,
  VehicleReminder,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, loadScope, type ScopeContext } from '../common/scope.util';
import { addDays, kolkataClock } from '../common/business-date';

/**
 * CW-12 — per-vehicle document vault + expiry/EMI reminders.
 *
 * HARD RULE (client's explicit demand): upload + view is SITE_MANAGER (own sites) + OWNER
 * ONLY. This is enforced HERE, freshly, on every method — `@RequireAction('vehicle.manage')`
 * on the controller already blocks every other role at the guard (their role has no
 * `vehicle.manage` scope in the permissions matrix → RbacGuard throws FORBIDDEN before this
 * service ever runs), but we re-check role from a DB-fresh `loadScope` per the WP-1 pattern
 * (defense-in-depth against a stale/forged JWT role) rather than trusting the guard alone.
 */
@Injectable()
export class VehicleDocsService implements OnModuleInit {
  private readonly logger = new Logger(VehicleDocsService.name);

  constructor(private readonly dbs: DbService) {}

  /**
   * `orgs` is RLS'd (`org_self`: `id = app_current_org()`) and the app connects as a
   * non-superuser/non-BYPASSRLS role (see conventions.md). With no tenant context set,
   * `SELECT id FROM orgs` returns ZERO rows for this role — there is no admin/bypass path
   * exposed by `DbService` (only `runInTenant(orgId, ...)` and the raw `db`, which is the
   * SAME non-bypass connection). So a org-agnostic `setInterval` sweep cannot enumerate
   * tenants from this process at all: every query it ran would come back empty regardless
   * of interval or query shape. Per the task's own fallback instruction, the interval is
   * therefore skipped cleanly — the LAZY sweep (`checkDueReminders(orgId)` fired from the
   * docs/reminders LIST endpoints, which always run inside a real tenant tx) is the only
   * correct trigger available without adding a new BYPASSRLS/admin DB role, which is out of
   * this WO's scope.
   */
  onModuleInit(): void {
    this.logger.log(
      'CW-12: vehicle-doc reminder sweep runs LAZILY (per-org, on docs/reminders LIST calls) — ' +
        'no cross-org interval, because `orgs` is RLS-scoped and this service has no BYPASSRLS/admin DB path.',
    );
  }

  // ---- shared scope guards -------------------------------------------------

  private assertSmOrOwner(ctx: ScopeContext): void {
    if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
      forbidScope(`Role ${ctx.role} cannot access vehicle documents`);
    }
  }

  /** Loads the vehicle and enforces OWNER-any / SITE_MANAGER-own-site. */
  private async loadVehicleInScope(tx: Tx, ctx: ScopeContext, vehicleId: string) {
    this.assertSmOrOwner(ctx);
    const [vehicle] = await tx
      .select({ id: schema.vehicles.id, regNo: schema.vehicles.regNo, assignedSiteId: schema.vehicles.assignedSiteId })
      .from(schema.vehicles)
      .where(and(eq(schema.vehicles.id, vehicleId), isNull(schema.vehicles.deletedAt)));
    if (!vehicle) throw new ApiException('NOT_FOUND', 'Vehicle not found');
    if (ctx.role === 'SITE_MANAGER' && (!vehicle.assignedSiteId || !ctx.siteIds.includes(vehicle.assignedSiteId))) {
      forbidScope('Vehicle out of scope');
    }
    return vehicle;
  }

  // ---- documents ------------------------------------------------------------

  async listDocs(p: Principal, vehicleId: string): Promise<VehicleDocument[]> {
    void this.checkDueReminders(p.orgId).catch(() => {});
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      await this.loadVehicleInScope(tx, ctx, vehicleId);
      const rows = await tx
        .select()
        .from(schema.vehicleDocuments)
        .where(and(eq(schema.vehicleDocuments.vehicleId, vehicleId), isNull(schema.vehicleDocuments.deletedAt)))
        .orderBy(desc(schema.vehicleDocuments.createdAt));
      return rows.map(mapVehicleDocument);
    });
  }

  async createDoc(p: Principal, vehicleId: string, input: CreateVehicleDocumentInput): Promise<VehicleDocument> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      await this.loadVehicleInScope(tx, ctx, vehicleId);

      const [row] = await tx
        .insert(schema.vehicleDocuments)
        .values({
          id: input.id,
          orgId: p.orgId,
          vehicleId,
          kind: input.kind,
          title: input.title,
          mediaId: input.mediaId ?? null,
          expiryDate: input.expiryDate ?? null,
          note: input.note ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();

      let doc = row;
      if (!doc) {
        const [existing] = await tx.select().from(schema.vehicleDocuments).where(eq(schema.vehicleDocuments.id, input.id));
        if (!existing) throw new ApiException('CONFLICT', 'Could not create vehicle document');
        doc = existing;
      } else if (doc.expiryDate) {
        // Auto-create the linked EXPIRY reminder, unless one already exists for this doc
        // (idempotent replay of the same create).
        const [existingReminder] = await tx
          .select({ id: schema.vehicleReminders.id })
          .from(schema.vehicleReminders)
          .where(
            and(
              eq(schema.vehicleReminders.documentId, doc.id),
              eq(schema.vehicleReminders.kind, 'EXPIRY'),
              isNull(schema.vehicleReminders.deletedAt),
            ),
          );
        if (!existingReminder) {
          await tx.insert(schema.vehicleReminders).values({
            id: uuidv7(),
            orgId: p.orgId,
            vehicleId,
            documentId: doc.id,
            label: doc.title,
            kind: 'EXPIRY',
            dueDate: doc.expiryDate,
            recurrence: 'ONCE',
            remindDaysBefore: 7,
            active: true,
            createdBy: p.userId,
            updatedBy: p.userId,
          });
        }
      }
      return mapVehicleDocument(doc);
    });
  }

  async updateDoc(p: Principal, id: string, input: UpdateVehicleDocumentInput): Promise<VehicleDocument> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [existing] = await tx
        .select()
        .from(schema.vehicleDocuments)
        .where(and(eq(schema.vehicleDocuments.id, id), isNull(schema.vehicleDocuments.deletedAt)));
      if (!existing) throw new ApiException('NOT_FOUND', 'Vehicle document not found');
      await this.loadVehicleInScope(tx, ctx, existing.vehicleId);

      const set: Record<string, unknown> = {
        updatedBy: p.userId,
        updatedAt: new Date(),
        version: sql`${schema.vehicleDocuments.version} + 1`,
      };
      if (input.kind !== undefined) set.kind = input.kind;
      if (input.title !== undefined) set.title = input.title;
      if (input.mediaId !== undefined) set.mediaId = input.mediaId;
      if (input.expiryDate !== undefined) set.expiryDate = input.expiryDate;
      if (input.note !== undefined) set.note = input.note;

      const [row] = await tx
        .update(schema.vehicleDocuments)
        .set(set as never)
        .where(eq(schema.vehicleDocuments.id, id))
        .returning();
      if (!row) throw new ApiException('NOT_FOUND', 'Vehicle document not found');
      return mapVehicleDocument(row);
    });
  }

  async deleteDoc(p: Principal, id: string): Promise<void> {
    await this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [existing] = await tx
        .select()
        .from(schema.vehicleDocuments)
        .where(and(eq(schema.vehicleDocuments.id, id), isNull(schema.vehicleDocuments.deletedAt)));
      if (!existing) throw new ApiException('NOT_FOUND', 'Vehicle document not found');
      await this.loadVehicleInScope(tx, ctx, existing.vehicleId);

      await tx
        .update(schema.vehicleDocuments)
        .set({ deletedAt: new Date(), updatedBy: p.userId, updatedAt: new Date(), version: sql`${schema.vehicleDocuments.version} + 1` })
        .where(eq(schema.vehicleDocuments.id, id));
    });
  }

  // ---- reminders --------------------------------------------------------------

  async listReminders(p: Principal, vehicleId: string): Promise<VehicleReminder[]> {
    void this.checkDueReminders(p.orgId).catch(() => {});
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      await this.loadVehicleInScope(tx, ctx, vehicleId);
      const rows = await tx
        .select()
        .from(schema.vehicleReminders)
        .where(and(eq(schema.vehicleReminders.vehicleId, vehicleId), isNull(schema.vehicleReminders.deletedAt)))
        .orderBy(desc(schema.vehicleReminders.dueDate));
      return rows.map(mapVehicleReminder);
    });
  }

  async createReminder(p: Principal, vehicleId: string, input: CreateVehicleReminderInput): Promise<VehicleReminder> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      await this.loadVehicleInScope(tx, ctx, vehicleId);

      if (input.documentId) {
        const [doc] = await tx
          .select({ id: schema.vehicleDocuments.id })
          .from(schema.vehicleDocuments)
          .where(
            and(
              eq(schema.vehicleDocuments.id, input.documentId),
              eq(schema.vehicleDocuments.vehicleId, vehicleId),
              isNull(schema.vehicleDocuments.deletedAt),
            ),
          );
        if (!doc) throw new ApiException('VALIDATION_FAILED', 'Document not found for this vehicle', { documentId: 'not found' });
      }

      const [row] = await tx
        .insert(schema.vehicleReminders)
        .values({
          id: input.id,
          orgId: p.orgId,
          vehicleId,
          documentId: input.documentId ?? null,
          label: input.label,
          kind: input.kind,
          dueDate: input.dueDate,
          recurrence: input.recurrence ?? 'ONCE',
          remindDaysBefore: input.remindDaysBefore ?? 7,
          active: true,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();

      if (!row) {
        const [existing] = await tx.select().from(schema.vehicleReminders).where(eq(schema.vehicleReminders.id, input.id));
        if (existing) return mapVehicleReminder(existing);
        throw new ApiException('CONFLICT', 'Could not create vehicle reminder');
      }
      return mapVehicleReminder(row);
    });
  }

  async updateReminder(p: Principal, id: string, input: UpdateVehicleReminderInput): Promise<VehicleReminder> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [existing] = await tx
        .select()
        .from(schema.vehicleReminders)
        .where(and(eq(schema.vehicleReminders.id, id), isNull(schema.vehicleReminders.deletedAt)));
      if (!existing) throw new ApiException('NOT_FOUND', 'Vehicle reminder not found');
      await this.loadVehicleInScope(tx, ctx, existing.vehicleId);

      const set: Record<string, unknown> = {
        updatedBy: p.userId,
        updatedAt: new Date(),
        version: sql`${schema.vehicleReminders.version} + 1`,
      };
      if (input.label !== undefined) set.label = input.label;
      if (input.dueDate !== undefined) set.dueDate = input.dueDate;
      if (input.recurrence !== undefined) set.recurrence = input.recurrence;
      if (input.remindDaysBefore !== undefined) set.remindDaysBefore = input.remindDaysBefore;
      if (input.active !== undefined) set.active = input.active;

      const [row] = await tx
        .update(schema.vehicleReminders)
        .set(set as never)
        .where(eq(schema.vehicleReminders.id, id))
        .returning();
      if (!row) throw new ApiException('NOT_FOUND', 'Vehicle reminder not found');
      return mapVehicleReminder(row);
    });
  }

  /**
   * True soft-delete (removes the reminder from the vault entirely — mirrors `deleteDoc`).
   * The web's "deactivate" toggle is a separate action: `PATCH .../reminders/:id` with
   * `{ active: false }` via `updateReminder`, which keeps the row listed (so it can be
   * turned back on) — this DELETE is for removing a mis-created reminder outright.
   */
  async deleteReminder(p: Principal, id: string): Promise<void> {
    await this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [existing] = await tx
        .select()
        .from(schema.vehicleReminders)
        .where(and(eq(schema.vehicleReminders.id, id), isNull(schema.vehicleReminders.deletedAt)));
      if (!existing) throw new ApiException('NOT_FOUND', 'Vehicle reminder not found');
      await this.loadVehicleInScope(tx, ctx, existing.vehicleId);

      await tx
        .update(schema.vehicleReminders)
        .set({
          deletedAt: new Date(),
          updatedBy: p.userId,
          updatedAt: new Date(),
          version: sql`${schema.vehicleReminders.version} + 1`,
        })
        .where(eq(schema.vehicleReminders.id, id));
    });
  }

  // ---- due-check sweep --------------------------------------------------------

  /**
   * Fired lazily (fire-and-forget) from the docs/reminders LIST endpoints — every SM/Owner
   * visit sweeps THEIR OWN org for due reminders. Runs in its own tenant tx (independent of
   * the caller's), so a failure here never affects the caller's request.
   */
  async checkDueReminders(orgId: string): Promise<void> {
    await this.dbs.runInTenant(orgId, async (tx) => {
      const today = kolkataClock(new Date()).date;
      const candidates = await tx
        .select()
        .from(schema.vehicleReminders)
        .where(and(eq(schema.vehicleReminders.active, true), isNull(schema.vehicleReminders.deletedAt)));

      const due = candidates.filter((r) => {
        const windowStart = addDays(r.dueDate, -r.remindDaysBefore);
        return windowStart <= today && r.lastNotifiedFor !== r.dueDate;
      });
      if (!due.length) return;

      const owners = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.role, 'OWNER'), eq(schema.users.active, true), isNull(schema.users.deletedAt)));
      const ownerIds = owners.map((o) => o.id);

      // Cache site-manager lookups per site within this sweep.
      const smBySite = new Map<string, string | null>();

      for (const r of due) {
        const [vehicle] = await tx
          .select({ regNo: schema.vehicles.regNo, assignedSiteId: schema.vehicles.assignedSiteId })
          .from(schema.vehicles)
          .where(eq(schema.vehicles.id, r.vehicleId));
        if (!vehicle) continue;

        let smUserId: string | null = null;
        if (vehicle.assignedSiteId) {
          if (!smBySite.has(vehicle.assignedSiteId)) {
            const [site] = await tx
              .select({ sm: schema.sites.siteManagerId })
              .from(schema.sites)
              .where(and(eq(schema.sites.id, vehicle.assignedSiteId), isNull(schema.sites.deletedAt)));
            smBySite.set(vehicle.assignedSiteId, site?.sm ?? null);
          }
          smUserId = smBySite.get(vehicle.assignedSiteId) ?? null;
        }

        const recipients = new Set<string>(ownerIds);
        if (smUserId) recipients.add(smUserId);
        if (recipients.size) {
          await tx.insert(schema.notifications).values(
            [...recipients].map((userId) => ({
              id: uuidv7(),
              orgId,
              userId,
              type: 'VEHICLE_DOC_DUE' as const,
              payload: {
                vehicleId: r.vehicleId,
                regNo: vehicle.regNo,
                label: r.label,
                dueDate: r.dueDate,
                kind: r.kind,
              },
            })),
          );
        }

        const nextDueDate =
          r.recurrence === 'MONTHLY' ? addMonthsClamped(r.dueDate, 1) : r.recurrence === 'YEARLY' ? addMonthsClamped(r.dueDate, 12) : r.dueDate;

        await tx
          .update(schema.vehicleReminders)
          .set({
            lastNotifiedFor: r.dueDate,
            dueDate: nextDueDate,
            updatedAt: new Date(),
            version: sql`${schema.vehicleReminders.version} + 1`,
          })
          .where(eq(schema.vehicleReminders.id, r.id));
      }
    });
  }
}

/** `isoDate` + `months`, keeping the day-of-month but clamped to the target month's length
 *  (e.g. 31 Jan + 1 month → 28/29 Feb, never rolling into March). */
function addMonthsClamped(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const year = y ?? 1970;
  const month = (m ?? 1) - 1; // 0-based
  const day = d ?? 1;
  const total = month + months;
  const targetYear = year + Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12; // 0-based, always positive
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

function mapVehicleDocument(r: typeof schema.vehicleDocuments.$inferSelect): VehicleDocument {
  return {
    id: r.id,
    orgId: r.orgId,
    vehicleId: r.vehicleId,
    kind: r.kind,
    title: r.title,
    mediaId: r.mediaId ?? null,
    expiryDate: r.expiryDate ?? null,
    note: r.note ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapVehicleReminder(r: typeof schema.vehicleReminders.$inferSelect): VehicleReminder {
  return {
    id: r.id,
    orgId: r.orgId,
    vehicleId: r.vehicleId,
    documentId: r.documentId ?? null,
    label: r.label,
    kind: r.kind,
    dueDate: r.dueDate,
    recurrence: r.recurrence,
    remindDaysBefore: r.remindDaysBefore,
    active: r.active,
    lastNotifiedFor: r.lastNotifiedFor ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}
