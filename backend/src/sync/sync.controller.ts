import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { SyncEvent } from '@techbuilder/contracts';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const PushSchema = z.object({
  events: z.array(
    z.object({
      outboxId: z.string().uuid(),
      idempotencyKey: z.string().uuid(),
      entityType: z.string().min(1),
      op: z.enum(['CREATE', 'UPDATE', 'VOID']),
      payload: z.unknown(),
    }),
  ),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  push(@CurrentUser() u: Principal, @Body(new ZodBody(PushSchema)) body: { events: SyncEvent[] }) {
    return this.sync.pushBatch(u, body.events);
  }

  @Get('pull')
  pull(@CurrentUser() u: Principal, @Query('since') since?: string) {
    return this.sync.pull(u, since ?? null);
  }
}
