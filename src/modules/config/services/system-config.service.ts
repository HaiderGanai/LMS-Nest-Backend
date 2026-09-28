import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  DEFAULT_DESIGNATIONS,
  ROLE_DEPARTMENTS,
  STAFF_ROLES,
} from '../../../shared/constants/roles.constants';
import { getPermissionLevel } from '../../../shared/constants/roles.constants';
import { RoleDesignationModelName } from '../entities/role-designation.entity';

interface BrandingConfig {
  systemName: string;
  systemShortName: string;
  portalSubtitle: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  primaryDarkColor: string;
  accentColor: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
  updatedByEmail?: string;
}

function sanitizeBrandingConfig(input: Record<string, unknown>): BrandingConfig {
  return {
    systemName: (input.systemName as string) || 'Tarteel e Quran',
    systemShortName: (input.systemShortName as string) || 'Tarteel',
    portalSubtitle: (input.portalSubtitle as string) || 'Management Portal',
    logoUrl: (input.logoUrl as string) || '/logo.png',
    faviconUrl: (input.faviconUrl as string) || '/logo.png',
    primaryColor: (input.primaryColor as string) || '#76A6F6',
    primaryDarkColor: (input.primaryDarkColor as string) || '#4A7BC7',
    accentColor: (input.accentColor as string) || '#A3C4F9',
    ...(input.updatedAt !== undefined && { updatedAt: input.updatedAt as string }),
    ...(input.updatedBy !== undefined && { updatedBy: input.updatedBy as string }),
    ...(input.updatedByName !== undefined && { updatedByName: input.updatedByName as string }),
    ...(input.updatedByEmail !== undefined && { updatedByEmail: input.updatedByEmail as string }),
  };
}

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectModel('AppConfig')
    private readonly appConfigModel: Model<Record<string, unknown>>,

    @InjectModel(RoleDesignationModelName)
    private readonly roleDesignationModel: Model<Record<string, unknown>>,
  ) {}

  // ── Branding ────────────────────────────────────────────────────────────────

  async getBranding(): Promise<{ branding: BrandingConfig }> {
    try {
      const doc = await this.appConfigModel.findById('system:branding').lean() as Record<string, unknown> | null;
      const raw = (doc?.value ?? doc?.['raw'] ?? {}) as Record<string, unknown>;
      return { branding: sanitizeBrandingConfig(raw) };
    } catch {
      throw new InternalServerErrorException('Failed to load branding settings');
    }
  }

  async updateBranding(
    body: Record<string, unknown>,
    user: { uid: string; email?: string; name?: string },
  ): Promise<{ branding: BrandingConfig }> {
    try {
      const branding = sanitizeBrandingConfig(body);
      const metadata: BrandingConfig = {
        ...branding,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid ?? 'admin',
        updatedByName: user.name || user.email || user.uid || 'Admin',
        updatedByEmail: user.email || '',
      };
      await this.appConfigModel.findOneAndUpdate(
        { _id: 'system:branding' },
        { $set: { key: 'system_branding', value: metadata, raw: metadata } },
        { upsert: true, new: true },
      ).lean();
      return { branding };
    } catch {
      throw new InternalServerErrorException('Failed to save branding settings');
    }
  }

  // ── Role Designations ───────────────────────────────────────────────────────

  async getRoleDesignations(): Promise<{ designations: Record<string, unknown>[] }> {
    try {
      const saved = await this.roleDesignationModel.find().lean() as Array<Record<string, unknown>>;
      const savedMap = Object.fromEntries(saved.map(d => [d.role as string, d]));

      const designations: Record<string, unknown>[] = [];

      for (const dept of ROLE_DEPARTMENTS) {
        for (const role of dept.roles) {
          designations.push({
            role,
            displayName: (savedMap[role]?.displayName as string) ?? DEFAULT_DESIGNATIONS[role] ?? role,
            description: (savedMap[role]?.description as string) ?? '',
            department: dept.department,
            permissionLevel: getPermissionLevel(role),
          });
        }
      }

      for (const role of ['teacher', 'student', 'parent']) {
        if (!designations.find(d => d.role === role)) {
          designations.push({
            role,
            displayName: (savedMap[role]?.displayName as string) ?? DEFAULT_DESIGNATIONS[role] ?? role,
            description: (savedMap[role]?.description as string) ?? '',
            department: role === 'teacher' ? 'Teaching Staff' : 'Users',
            permissionLevel: getPermissionLevel(role),
          });
        }
      }

      return { designations };
    } catch {
      throw new InternalServerErrorException('Failed to load role designations');
    }
  }

  async updateRoleDesignations(
    designations: Array<{ role: string; displayName: string; description?: string }>,
    userId: string,
  ): Promise<{ updated: number }> {
    try {
      const ops = designations
        .filter(d => d.role && typeof d.displayName === 'string' && d.displayName.trim())
        .map(d => ({
          updateOne: {
            filter: { _id: d.role },
            update: {
              $set: {
                _id: d.role,
                role: d.role,
                displayName: d.displayName.trim(),
                description: (d.description || '').trim(),
                updatedBy: userId,
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        }));

      if (ops.length > 0) {
        await this.roleDesignationModel.bulkWrite(ops);
      }

      return { updated: ops.length };
    } catch {
      throw new InternalServerErrorException('Failed to save role designations');
    }
  }

  async getPublicRoleDesignations(): Promise<{ designations: Record<string, string> }> {
    try {
      const saved = await this.roleDesignationModel.find().lean() as Array<Record<string, unknown>>;
      const savedMap = Object.fromEntries(saved.map(d => [d.role as string, d.displayName as string]));

      const result: Record<string, string> = {};
      for (const role of STAFF_ROLES) {
        result[role] = savedMap[role] ?? DEFAULT_DESIGNATIONS[role] ?? role;
      }

      return { designations: result };
    } catch {
      throw new InternalServerErrorException('Failed to load designations');
    }
  }
}
