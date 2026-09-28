import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getPermissionLevel, HR_DEPARTMENT_ROLES, REQUIRE_HR_DEPT_METADATA_KEY } from '../constants/roles.constants';
import type { RequestUser } from '../interfaces/request-user.interface';

@Injectable()
export class HRDeptGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minLevel = this.reflector.getAllAndOverride<number>(REQUIRE_HR_DEPT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (minLevel === undefined || minLevel === null) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as RequestUser | undefined;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!HR_DEPARTMENT_ROLES.includes(user.role)) {
      throw new ForbiddenException('HR department access required');
    }

    const level = getPermissionLevel(user.role);
    if (level < minLevel) {
      throw new ForbiddenException(`Insufficient permissions. Required: ${minLevel}, current: ${level}`);
    }

    (request.user as RequestUser).permissionLevel = level;
    return true;
  }
}
