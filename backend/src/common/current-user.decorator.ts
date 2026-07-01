import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@techbuilder/contracts';

/** The authenticated principal carried by the access JWT. */
export interface Principal {
  userId: string;
  orgId: string;
  role: Role;
  deviceId: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest<{ user: Principal }>().user;
});
