import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

interface UserDocument {
  _id: string;
  role?: string;
  isActive?: boolean;
}

@Injectable()
export class ParentService {
  constructor(
    @InjectModel('User')
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getParentUsers(): Promise<{ parents: UserDocument[] }> {
    const parents = await this.userModel.find({ role: 'parent', isActive: { $ne: false } }).sort({ createdAt: -1 }).lean();
    return { parents };
  }
}
