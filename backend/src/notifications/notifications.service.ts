import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { Notification } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import type { Principal } from '../common/current-user.decorator';

@Injectable()
export class NotificationsService {
  constructor(private readonly dbs: DbService) {}

  async listNotifications(p: Principal): Promise<Notification[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, p.userId))
        .orderBy(desc(schema.notifications.createdAt));
      return rows.map(mapNotification);
    });
  }

  async markNotificationRead(p: Principal, id: string): Promise<void> {
    await this.dbs.runInTenant(p.orgId, async (tx) => {
      await tx
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, p.userId)));
    });
  }
}

function mapNotification(n: typeof schema.notifications.$inferSelect): Notification {
  return {
    id: n.id,
    orgId: n.orgId,
    userId: n.userId,
    type: n.type,
    payload: n.payload as Record<string, unknown>,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}
