import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { VENDOR_PAYMENT_KINDS } from '@techbuilder/contracts';
import type { CreateVendorInput, CreateVendorPaymentInput, VerifyInput } from '@techbuilder/contracts';
import { VendorsService } from './vendors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';
import { VerifySchema } from '../approvals/approvals.controller';

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
  // Round 2 (CW-6): PAYMENT (default) = site pays the vendor; RECEIPT = vendor money-IN.
  kind: z.enum(VENDOR_PAYMENT_KINDS).optional(),
  amountPaise: z.number().int().positive(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().min(1).optional(),
});

// WO-10: vendors carry no `vendor.*` RBAC action — every route except verify is open to any
// authenticated user; VendorsService enforces the OWNER/SITE_MANAGER/ACCOUNTANT-own-site rule for
// create/payments/ledger (vendorsList is intentionally unscoped-by-role, scoped-by-site only —
// workers/drivers need it for the expense-form shop picker). verifyPayment (CW-6, two-tick rule)
// is gated coarsely on request.decide, narrowed in-service to the site accountant / Owner.
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

  // ENDPOINTS.vendorPaymentVerify — declared BEFORE ':id/...' routes (Nest matches path patterns
  // in registration order for same-position dynamic segments). Coarse gate: request.decide
  // (ACCOUNTANT/SITE_MANAGER/OWNER hold it); the service narrows to the vendor's site accountant
  // or the Owner (SITE_MANAGER never holds the verify tick — two-tick rule).
  @RequireAction('request.decide')
  @Post('payments/:id/verify')
  verifyPayment(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(VerifySchema)) body: VerifyInput,
  ) {
    return this.vendors.verifyPayment(u, id, body);
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
