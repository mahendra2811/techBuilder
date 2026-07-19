import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreatePersonInput, SetGuardianInput, UpdatePersonInput } from '@techbuilder/contracts';
import { PeopleService } from './people.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreatePersonSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().optional(),
  skill: z.enum(['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'OPERATOR', 'DRIVER']).optional(),
  defaultWagePaise: z.number().int().positive().optional(),
  // Round 2 (C6): onboarder sets guardian/ID-card fields once at creation.
  guardianName: z.string().max(120).optional(),
  guardianPhone: z.string().max(20).optional(),
  // frozen.12: preferred site (only honored for an OWNER caller; server forces own-site otherwise).
  siteId: z.string().uuid().optional(),
});

// Round 2 (CW-4): all optional — the service decides field-by-field who may actually change
// what (guardianName/guardianPhone/phone are SM-in-reach/Owner-only; see people.service.ts).
const UpdatePersonSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(20).optional(),
  skill: z.enum(['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'OPERATOR', 'DRIVER']).optional(),
  defaultWagePaise: z.number().int().optional(),
  guardianName: z.string().max(120).optional(),
  guardianPhone: z.string().max(20).optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @RequireAction('user.create')
  @Post()
  create(@CurrentUser() u: Principal, @Body(new ZodBody(CreatePersonSchema)) body: CreatePersonInput) {
    return this.people.create(u, body);
  }

  @RequireAction('view.all')
  @Get()
  list(@CurrentUser() u: Principal) {
    return this.people.list(u);
  }

  // Same action as create — SM/Supervisor/Owner may all reach the route; the service enforces
  // the narrower field-by-field rule (guardian/phone = SM-in-reach/Owner only).
  @RequireAction('user.create')
  @Patch(':id')
  update(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(UpdatePersonSchema)) body: UpdatePersonInput,
  ) {
    return this.people.update(u, id, body);
  }
}

// frozen.9: one-time guardian self-add — both fields required (it's set-once, so a partial
// set would burn the one chance with half the data).
const SetGuardianSchema = z.object({
  guardianName: z.string().min(1).max(120),
  guardianPhone: z.string().min(1).max(20),
});

/** ENDPOINTS.meGuardianSet = PATCH /me/guardian. No @RequireAction — any authenticated user
 *  (worker/driver have no RBAC action that fits); the service enforces linked-person + set-once. */
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeGuardianController {
  constructor(private readonly people: PeopleService) {}

  @Patch('guardian')
  setGuardian(@CurrentUser() u: Principal, @Body(new ZodBody(SetGuardianSchema)) body: SetGuardianInput) {
    return this.people.setOwnGuardian(u, body);
  }
}
