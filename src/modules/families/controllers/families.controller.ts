import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { FamilyScopedRequest } from '../../../shared/middleware/family-scope.middleware';
import type { RequestUser } from '../../../shared/interfaces/request-user.interface';
import { FamilyCredentialsService } from '../services/family-credentials.service';
import { FamiliesService } from '../services/families.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FamiliesController {
  constructor(
    private readonly familiesService: FamiliesService,
    private readonly familyCredentialsService: FamilyCredentialsService,
  ) {}

  @Get('/api/admin/families')
  @RequireRoles('admin')
  async getFamilies(@Req() req: FamilyScopedRequest) {
    return this.familiesService.getFamilies(
      req.familyScope ?? null,
      req.familyScopeActive ?? false,
    );
  }

  @Get('/api/admin/families/stats')
  @RequireRoles('admin')
  async getFamilyStats() {
    return this.familiesService.getFamilyStats();
  }

  @Get('/api/admin/families/:id')
  @RequireRoles('admin')
  async getFamilyById(@Param('id') id: string, @Req() req: FamilyScopedRequest) {
    return this.familiesService.getFamilyById(
      id,
      req.familyScope ?? null,
      req.familyScopeActive ?? false,
    );
  }

  @Post('/api/admin/families')
  @RequireRoles('admin')
  async createFamily(@Body() body: Record<string, unknown>) {
    return this.familiesService.createFamily(body);
  }

  @Put('/api/admin/families/:id')
  @RequireRoles('admin')
  async updateFamily(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.familiesService.updateFamily(id, body);
  }

  @Put('/api/admin/families/:id/status')
  @RequireRoles('admin')
  async updateFamilyStatus(
    @Param('id') id: string,
    @Body() body: { status: string; reason?: string },
    @Req() req: FamilyScopedRequest,
  ) {
    const user = req.user as RequestUser;
    return this.familiesService.updateFamilyStatus(id, body, user?.uid ?? 'admin');
  }

  @Delete('/api/admin/families/:id')
  @RequireRoles('admin')
  async deleteFamily(
    @Param('id') id: string,
    @Query('hard') hard: string,
    @Req() req: FamilyScopedRequest,
  ) {
    const user = req.user as RequestUser;
    return this.familiesService.deleteFamily(id, hard, user?.uid ?? 'admin');
  }

  @Post('/api/admin/families/:id/generate-credentials')
  @RequireRoles('admin')
  async generateFamilyCredentials(@Param('id') id: string) {
    return this.familyCredentialsService.generateFamilyCredentials(id);
  }

  @Get('/api/parent/:parentId')
  @RequireRoles('parent', 'admin')
  async getParentById(@Param('parentId') parentId: string) {
    return this.familiesService.getParentById(parentId);
  }

  @Get('/api/parent/:parentId/children')
  @RequireRoles('parent', 'admin')
  async getParentChildren(@Param('parentId') parentId: string) {
    return this.familiesService.getParentChildren(parentId);
  }
}
