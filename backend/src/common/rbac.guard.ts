import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Action, can } from '@techbuilder/contracts';
import { ApiException } from './api-exception';
import type { Principal } from './current-user.decorator';

export const REQUIRE_ACTION = 'require_action';
/** Mark a route with the RBAC action it needs. Server is authoritative; scope is re-checked in the service. */
export const RequireAction = (action: Action): MethodDecorator => SetMetadata(REQUIRE_ACTION, action);

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const action = this.reflector.getAllAndOverride<Action | undefined>(REQUIRE_ACTION, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!action) return true; // no action required (still behind JwtAuthGuard)
    const user = ctx.switchToHttp().getRequest<{ user?: Principal }>().user;
    if (!user) throw new ApiException('UNAUTHENTICATED', 'Authentication required');
    if (!can(user.role, action)) throw new ApiException('FORBIDDEN', `Role ${user.role} cannot ${action}`);
    return true;
  }
}
