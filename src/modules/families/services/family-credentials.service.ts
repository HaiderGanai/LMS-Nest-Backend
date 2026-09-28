import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Model } from 'mongoose';

function generateTempPassword(): string {
  return crypto.randomBytes(8).toString('base64url').slice(0, 12);
}

@Injectable()
export class FamilyCredentialsService {
  constructor(
    @InjectModel('Family')
    private readonly familyModel: Model<Record<string, unknown>>,
    @InjectModel('User')
    private readonly userModel: Model<Record<string, unknown>>,
    @InjectModel('LocalAuthCredential')
    private readonly localAuthCredentialModel: Model<Record<string, unknown>>,
  ) {}

  // POST /api/admin/families/:id/generate-credentials
  async generateFamilyCredentials(
    id: string,
    body: { password?: string } = {},
  ): Promise<{
    success: true;
    familyId: string;
    parentUid: string;
    parentEmail: string;
    tempPassword: string;
    message: string;
  }> {
    const family = await this.familyModel.findById(id).lean() as Record<string, unknown> | null;
    if (!family) throw new NotFoundException('Family not found');

    const raw = (family['raw'] && typeof family['raw'] === 'object' ? family['raw'] : {}) as Record<string, unknown>;
    const normalizedEmail = String(
      family['parentEmail'] || family['email'] || raw['email'] || '',
    ).trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Family has no parent email');
    }

    // Resolve or generate parentUid
    let parentUid = String(family['parentUid'] || '').trim();

    if (!parentUid) {
      const existingCred = await this.localAuthCredentialModel.findById(normalizedEmail).lean() as Record<string, unknown> | null;
      if (existingCred?.['userId']) {
        parentUid = String(existingCred['userId']);
      }
    }

    if (!parentUid) {
      const emailRx = {
        $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        $options: 'i',
      };
      const existingUser = await this.userModel.findOne({ email: emailRx }).lean() as Record<string, unknown> | null;
      if (existingUser?.['_id']) {
        parentUid = String(existingUser['_id']);
      }
    }

    if (!parentUid) {
      parentUid = crypto.randomBytes(16).toString('hex');
    }

    const tempPassword = body.password || generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const parentName = String(family['parentName'] || family['name'] || 'Parent');

    await this.userModel.findOneAndUpdate(
      { _id: parentUid },
      {
        $setOnInsert: {
          _id: parentUid,
          children: [],
          raw: {},
          createdAt: new Date(),
        },
        $set: {
          email: normalizedEmail,
          name: parentName,
          role: 'parent',
          password: passwordHash,
          familyId: id,
          isActive: true,
          status: 'active',
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    await this.localAuthCredentialModel.findOneAndUpdate(
      { _id: normalizedEmail },
      {
        $setOnInsert: { _id: normalizedEmail },
        $set: {
          email: normalizedEmail,
          userId: parentUid,
          role: 'parent',
          name: parentName,
          passwordHash,
          isActive: true,
          disabled: false,
        },
      },
      { upsert: true, new: true },
    );

    await this.familyModel.findByIdAndUpdate(
      id,
      {
        $set: {
          parentUid,
          parentEmail: normalizedEmail,
          email: normalizedEmail,
          parentName,
          'raw.tempPassword': tempPassword,
        },
      },
      { new: true },
    );

    return {
      success: true,
      familyId: id,
      parentUid,
      parentEmail: normalizedEmail,
      tempPassword,
      message: 'Family credentials generated successfully',
    };
  }
}
