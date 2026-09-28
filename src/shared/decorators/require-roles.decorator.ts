import { SetMetadata } from '@nestjs/common';
import { MIN_PERMISSION_METADATA_KEY, REQUIRE_ADMIN_DEPT_METADATA_KEY, REQUIRE_HR_DEPT_METADATA_KEY, ROLE_METADATA_KEY } from '../constants/roles.constants';

export const RequireRoles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLE_METADATA_KEY, roles);

export const MinPermission = (level: number): MethodDecorator & ClassDecorator =>
  SetMetadata(MIN_PERMISSION_METADATA_KEY, level);

export const RequireAdminDept = (minLevel = 0): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_ADMIN_DEPT_METADATA_KEY, minLevel);

export const RequireHRDept = (minLevel = 0): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_HR_DEPT_METADATA_KEY, minLevel);
