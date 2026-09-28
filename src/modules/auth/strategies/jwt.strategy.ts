import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getPermissionLevel } from '../../../shared/constants/roles.constants';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly nestConfigService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: nestConfigService.get<string>('auth.accessTokenSecret') || 'local_access_secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload & { id: string; uid: string; permissionLevel: number }> {
    if (!payload.uid) {
      throw new UnauthorizedException('Invalid access token payload');
    }

    if (payload.typ && payload.typ !== 'access') {
      throw new UnauthorizedException('Token type is not allowed for API access');
    }

    return {
      ...payload,
      id: payload.uid,
      uid: payload.uid,
      permissionLevel: getPermissionLevel(payload.role),
    };
  }
}
