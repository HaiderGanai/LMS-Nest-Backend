import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { MinPermissionGuard } from '../../shared/guards/min-permission.guard';
import { MinPermission } from '../../shared/decorators/require-roles.decorator';
import { StorageService } from './storage.service';

@Controller()
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  // ─── S3 Presign endpoints (admin only, stub — return 503 if S3 not configured) ───

  @Get('api/storage/s3/presign-download')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(100)
  presignDownload(@Query('key') key: string) {
    if (!key) throw new BadRequestException('key is required');
    // S3 not configured — fall back to local presigned URL
    const signed = this.storageService.buildLocalPresignedUrl(key, 'download');
    return { success: true, ...signed, storageMode: 'local' };
  }

  @Post('api/storage/s3/presign-upload')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(100)
  presignUpload(@Req() req: Request) {
    const { key, contentType } = (req.body || {}) as { key?: string; contentType?: string };
    if (!key) throw new BadRequestException('key is required');
    const signed = this.storageService.buildLocalPresignedUrl(key, 'upload');
    return {
      success: true,
      ...signed,
      headers: contentType ? { 'Content-Type': contentType } : {},
      storageMode: 'local',
    };
  }

  @Get('api/storage/s3/object')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(100)
  getS3Object(
    @Query('key') key: string,
    @Res() res: Response,
  ): void {
    if (!key) {
      res.status(400).json({ error: 'key is required' });
      return;
    }
    const { filePath, exists } = this.storageService.getLocalFileStream(key);
    if (!exists) {
      res.status(404).json({ error: 'Object not found', key });
      return;
    }
    res.sendFile(filePath);
  }

  @Delete('api/storage/s3/object')
  @UseGuards(JwtAuthGuard, MinPermissionGuard)
  @MinPermission(100)
  deleteS3Object(@Query('key') key: string) {
    if (!key) throw new BadRequestException('key is required');
    const existed = this.storageService.deleteLocalFile(key);
    return { success: true, key, statusCode: existed ? 200 : 404, storageMode: 'local' };
  }

  // ─── Local storage upload/download (no auth — signature-verified) ───

  @Put(['api/storage/local/upload', 'storage/local/upload'])
  async localUpload(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      this.storageService.verifyLocalSignature(key, 'upload', expires, sig);
      const target = this.storageService.getLocalFilePath(key);
      this.storageService.ensureDir(target);
      const tmpTarget = `${target}.tmp-${Date.now()}`;
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(tmpTarget);
        (req as any).pipe(writeStream);
        (req as any).on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
      });
      fs.renameSync(tmpTarget, target);
      res.status(200).json({ success: true, key, storageMode: 'local' });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message || 'Upload failed' });
    }
  }

  @Get(['api/storage/local/download', 'storage/local/download'])
  localDownload(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ): void {
    try {
      this.storageService.verifyLocalSignature(key, 'download', expires, sig);
      const target = this.storageService.getLocalFilePath(key);
      if (!this.storageService.fileExists(target)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      res.sendFile(target);
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message || 'Download failed' });
    }
  }
}
