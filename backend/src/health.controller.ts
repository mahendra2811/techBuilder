import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from './db/db.service';

/** Unauthenticated liveness probe for the host (Railway/uptime checks). No DB dependency on purpose. */
@Controller('health')
export class HealthController {
  constructor(private readonly dbs: DbService) {}

  @Get()
  check(): { status: 'ok'; time: string } {
    return { status: 'ok', time: new Date().toISOString() };
  }

  /** Readiness: proves the DB is reachable. 503 with no detail on failure — for a reverse-proxy
   * or orchestrator health check, never a public status page (no connection info leaks). */
  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.dbs.raw.execute(sql`select 1`);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('not ready');
    }
  }
}
