import { Controller, Get } from '@nestjs/common';

/** Unauthenticated liveness probe for the host (Railway/uptime checks). No DB dependency on purpose. */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; time: string } {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
