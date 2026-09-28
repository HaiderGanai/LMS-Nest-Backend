import { Global, Module } from '@nestjs/common';
import { AdminDeptGuard } from './guards/admin-dept.guard';
import { HRDeptGuard } from './guards/hr-dept.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MinPermissionGuard } from './guards/min-permission.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  providers: [JwtAuthGuard, RolesGuard, MinPermissionGuard, AdminDeptGuard, HRDeptGuard],
  exports: [JwtAuthGuard, RolesGuard, MinPermissionGuard, AdminDeptGuard, HRDeptGuard],
})
export class SharedModule {}
