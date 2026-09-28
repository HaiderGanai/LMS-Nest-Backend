import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../shared/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { StorageService } from '../services/storage.service';

@Controller('api/storage/s3')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles('admin')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('/presign-download')
  async getPresignedDownloadUrl(@Query('key') key: string) {
    return this.storageService.getPresignedDownloadUrl(key);
  }

  @Post('/presign-upload')
  async getPresignedUploadUrl(@Body() body: { key: string }) {
    return this.storageService.getPresignedUploadUrl(body.key);
  }

  @Delete('/object')
  async deleteObject(@Body() body: { key: string }) {
    return this.storageService.deleteObject(body.key);
  }
}
