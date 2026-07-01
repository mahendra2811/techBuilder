import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '@techbuilder/contracts';
import { loadEnv } from '../config/env';
import type { Principal } from '../common/current-user.decorator';

interface AccessClaims {
  sub: string;
  orgId: string;
  role: Role;
  deviceId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: loadEnv().JWT_ACCESS_SECRET,
    });
  }

  validate(payload: AccessClaims): Principal {
    return { userId: payload.sub, orgId: payload.orgId, role: payload.role, deviceId: payload.deviceId };
  }
}
