import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

interface UserDocument {
  _id: string;
  role?: string;
  isActive?: boolean;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel('User')
    private readonly userModel: Model<UserDocument>,
    @InjectModel('Employee')
    private readonly employeeModel: Model<any>,
  ) {}

  async getAdminUsers(): Promise<{ admins: UserDocument[] }> {
    const admins = await this.userModel
      .find({ role: 'admin' })
      .sort({ createdAt: -1 })
      .lean();
    return { admins };
  }

  async getMergedAdmins(): Promise<{ admins: any[] }> {
    const [employeeAdmins, userAdmins] = await Promise.all([
      this.employeeModel
        .find({ $or: [{ role: 'admin' }, { designation: 'admin' }] })
        .lean(),
      this.userModel.find({ role: 'admin' }).lean(),
    ]);

    // Merge: employee records take precedence, deduplicate by _id
    const merged = new Map<string, any>();

    for (const u of userAdmins as any[]) {
      const { password, passwordHash, ...rest } = u;
      merged.set(String(u._id), { ...rest, isOnline: false });
    }

    for (const e of employeeAdmins as any[]) {
      const { password, passwordHash, ...rest } = e;
      merged.set(String(e._id), { ...rest, isOnline: false });
    }

    return { admins: Array.from(merged.values()) };
  }
}
