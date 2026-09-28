import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { FamilyScopedRequest } from '../../../shared/middleware/family-scope.middleware';
import { FamilyMembersService } from '../services/family-members.service';
import { SignalingBroadcasterService } from '../../signaling/services/signaling-broadcaster.service';

@Controller('api/admin/families/:id/members')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles('admin')
export class FamilyMembersController {
  constructor(
    private readonly familyMembersService: FamilyMembersService,
    private readonly broadcaster: SignalingBroadcasterService,
  ) {}

  @Get()
  async getFamilyMembers(@Param('id') id: string, @Req() req: FamilyScopedRequest) {
    return this.familyMembersService.getFamilyMembers(
      id,
      req.familyScope ?? null,
      req.familyScopeActive ?? false,
    );
  }

  @Post()
  async createFamilyMember(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.familyMembersService.createFamilyMember(id, body);
  }

  @Put('/:memberId')
  async updateFamilyMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.familyMembersService.updateFamilyMember(id, memberId, body);
  }

  @Put('/:memberId/status')
  async updateFamilyMemberStatus(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: { status: string; reason?: string },
  ) {
    const result = await this.familyMembersService.updateFamilyMember(id, memberId, {
      status: body.status,
      statusReason: body.reason || '',
      statusChangedAt: new Date(),
    });
    // Real-time: push status change to student/parent app so they can react
    const isActive = String(body.status || '').toLowerCase() === 'active';
    this.broadcaster.emitAccountStatusChanged(memberId, {
      userId: memberId,
      status: body.status,
      isActive,
      reason: body.reason || '',
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  @Delete('/:memberId')
  async deleteFamilyMember(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.familyMembersService.deleteFamilyMember(id, memberId);
  }
}
