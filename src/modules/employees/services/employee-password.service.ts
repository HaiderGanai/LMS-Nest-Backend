import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import type { Model } from 'mongoose';

interface LocalAuthCredentialDocument {
  _id: string;
  userId: string;
  passwordHash?: string;
  password?: string;
}

@Injectable()
export class EmployeePasswordService {
  constructor(
    @InjectModel('LocalAuthCredential')
    private readonly localAuthCredentialModel: Model<LocalAuthCredentialDocument>,
  ) {}

  async resetEmployeePassword(employeeId: string, password: string): Promise<{ message: string }> {
    // 1. Resolve credential document by user id for the target employee
    const credential = await this.localAuthCredentialModel.findOne({ userId: employeeId });
    if (!credential) {
      throw new NotFoundException('No login credential found for this employee');
    }

    // 2. Hash password and update both hash and plain migration field for compatibility
    credential.passwordHash = await bcrypt.hash(password, 10);
    credential.password = password;
    await credential.save();

    return { message: 'Employee password reset successfully' };
  }
}
