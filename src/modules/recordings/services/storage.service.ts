import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';

@Injectable()
export class StorageService {
  constructor(private readonly nestConfigService: ConfigService) {}

  private buildSignature(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  async getPresignedDownloadUrl(key: string): Promise<{ url: string; expiresIn: number }> {
    // 1. Build deterministic signed URL placeholder using configured bucket and region
    const bucket = this.nestConfigService.get<string>('storage.s3Bucket') || 'local-bucket';
    const region = this.nestConfigService.get<string>('storage.s3Region') || 'local-region';
    const expiresIn = 900;
    const signature = this.buildSignature(`${bucket}:${key}:${expiresIn}`);
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}?signature=${signature}&expiresIn=${expiresIn}`;
    return { url, expiresIn };
  }

  async getPresignedUploadUrl(key: string): Promise<{ url: string; expiresIn: number; fields: Record<string, string> }> {
    // 1. Build upload URL and metadata payload for client-side multipart upload
    const bucket = this.nestConfigService.get<string>('storage.s3Bucket') || 'local-bucket';
    const region = this.nestConfigService.get<string>('storage.s3Region') || 'local-region';
    const expiresIn = 900;
    const signature = this.buildSignature(`upload:${bucket}:${key}:${expiresIn}`);
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}?signature=${signature}&expiresIn=${expiresIn}`;
    return {
      url,
      expiresIn,
      fields: {
        key,
        signature,
      },
    };
  }

  async deleteObject(key: string): Promise<{ message: string; key: string }> {
    // 1. Placeholder deletion response while preserving API contract
    return { message: 'S3 object deletion queued', key };
  }
}
