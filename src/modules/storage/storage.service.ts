import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const STORAGE_LOCAL_DIR = process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), 'storage');
const STORAGE_HMAC_SECRET = process.env.LOCAL_STORAGE_SECRET || 'default-local-storage-secret';
const SIGNED_URL_TTL_SECONDS = 3600;

@Injectable()
export class StorageService {
  private normalizeKey(key: string): string {
    // Strip leading slashes and path traversal
    return key.replace(/^[/\\]+/, '').replace(/\.\./g, '');
  }

  private resolveLocalPath(key: string): string {
    const normalized = this.normalizeKey(key);
    if (!normalized) throw new BadRequestException('Invalid storage key');
    const target = path.join(STORAGE_LOCAL_DIR, normalized);
    // Safety: ensure path is within storage dir
    if (!target.startsWith(STORAGE_LOCAL_DIR)) throw new BadRequestException('Invalid storage key');
    return target;
  }

  buildLocalPresignedUrl(key: string, action: 'upload' | 'download', expiresIn = SIGNED_URL_TTL_SECONDS): {
    key: string; method: string; url: string; expiresIn: number;
  } {
    const normalized = this.normalizeKey(key);
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const payload = `${action}:${normalized}:${expires}`;
    const sig = crypto.createHmac('sha256', STORAGE_HMAC_SECRET).update(payload).digest('hex');
    const method = action === 'upload' ? 'PUT' : 'GET';
    const urlPath = action === 'upload' ? '/api/storage/local/upload' : '/api/storage/local/download';
    const url = `${urlPath}?key=${encodeURIComponent(normalized)}&expires=${expires}&sig=${sig}`;
    return { key: normalized, method, url, expiresIn };
  }

  verifyLocalSignature(key: string, action: 'upload' | 'download', expires: string, sig: string): void {
    const now = Math.floor(Date.now() / 1000);
    const expiresNum = parseInt(expires || '0');
    if (!expiresNum || now > expiresNum) throw new BadRequestException('Signed URL expired');
    const expected = crypto.createHmac('sha256', STORAGE_HMAC_SECRET)
      .update(`${action}:${key}:${expiresNum}`)
      .digest('hex');
    if (expected !== sig) throw new BadRequestException('Invalid signature');
  }

  getLocalFilePath(key: string): string {
    return this.resolveLocalPath(key);
  }

  ensureDir(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  deleteLocalFile(key: string): boolean {
    const target = this.resolveLocalPath(key);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      return true;
    }
    return false;
  }

  getLocalFileStream(key: string): { filePath: string; exists: boolean } {
    const filePath = this.resolveLocalPath(key);
    return { filePath, exists: fs.existsSync(filePath) };
  }
}
