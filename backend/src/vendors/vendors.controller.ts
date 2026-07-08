import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreateVendorInput, CreateVendorPaymentInput } from '@techbuilder/contracts';
import { VendorsService } from './vendors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreateVendorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().min(1).optional(),
  siteId: z.string().uuid().optional(),
  sells: z.string().min(1).optional(),
});

// vendorId is the :id path param, not part of the body (frozen CreateVendorPaymentInput
// carries a vendorId field, but the REST shape nests payments under /vendors/:id/payments).
const CreateVendorPaymentSchema = z.object({
  id: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().min(1).optional(),
});

// WO-10: vendors carry no `vendor.*` RBAC action — every route is open to any
// authenticated user; VendorsService enforces the OWNER/SITE_MANAGER-own-site
// rule for create/payments/ledger (vendorsList is intentionally unscoped-by-role,
// scoped-by-site only — workers/drivers need it for the expense-form shop picker).
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  list(@CurrentUser() u: Principal) {
    return this.vendors.list(u);
  }

  @Post()
  create(@CurrentUser() u: Principal, @Body(new ZodBody(CreateVendorSchema)) body: CreateVendorInput) {
    return this.vendors.create(u, body);
  }

  @Post(':id/payments')
  createPayment(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(CreateVendorPaymentSchema)) body: Omit<CreateVendorPaymentInput, 'vendorId'>,
  ) {
    return this.vendors.createPayment(u, id, body);
  }

  @Get(':id/ledger')
  ledger(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.vendors.ledger(u, id);
  }
}
