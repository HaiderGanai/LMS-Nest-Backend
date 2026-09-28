import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import * as crypto from 'crypto';
import { UsersRepository } from '../repositories/users.repository';
import type { CreateUserDto } from '../dto/create-user.dto';
import type { UpdateUserDto } from '../dto/update-user.dto';

interface UserDocument {
  _id: string;
  role?: string;
  email?: string;
  name?: string;
  username?: string;
  isActive?: boolean;
  isOnline?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User')
    private readonly userModel: Model<UserDocument>,
    private readonly usersRepository: UsersRepository,
  ) {}

  async getUsers(): Promise<{ users: UserDocument[] }> {
    // 1. Load users sorted by creation time for deterministic admin lists
    const users = await this.userModel.find({}).sort({ createdAt: -1 }).lean();
    return { users };
  }

  async createUser(body: CreateUserDto): Promise<{ message: string; user: UserDocument }> {
    const id = body.id || crypto.randomBytes(12).toString('hex');

    // 1. Check for duplicate ID (only when caller supplied one)
    if (body.id) {
      const existingById = await this.userModel.findById(id).lean();
      if (existingById) {
        throw new ConflictException(`User with ID '${id}' already exists. Choose a different ID.`);
      }
    }

    // 2. Check for duplicate email
    const normalizedEmail = body.email.trim().toLowerCase();
    const existingByEmail = await this.userModel.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } }).lean();
    if (existingByEmail) {
      throw new ConflictException(`A user with email '${body.email}' already exists.`);
    }

    const createData = {
      _id: id,
      role: body.role || 'user',
      email: normalizedEmail,
      name: body.name || '',
      username: body.username || '',
      password: body.password,
      isActive: body.isActive ?? true,
    };

    // 3. Insert user record into MongoDB collection
    await this.userModel.create(createData);

    const createdUser = await this.userModel.findById(id).lean();
    if (!createdUser) {
      throw new NotFoundException('User not found after creation');
    }

    return {
      message: 'User created successfully',
      user: createdUser,
    };
  }

  async getUserById(id: string): Promise<{ user: unknown }> {
    // 1. Use repository wrapper so legacy compatibility stays in one place
    const user = await this.usersRepository.getUserById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { user };
  }

  async updateUser(id: string, body: UpdateUserDto): Promise<{ message: string; user: UserDocument }> {
    // 1. Remove undefined values to prevent accidental field overwrites
    const updateData = Object.fromEntries(
      Object.entries(body).filter(([_, value]) => value !== undefined),
    );

    // 2. Check email uniqueness if email is being changed
    if (updateData['email']) {
      const normalizedEmail = String(updateData['email']).trim().toLowerCase();
      updateData['email'] = normalizedEmail;
      const conflict = await this.userModel.findOne({
        email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') },
        _id: { $ne: id },
      }).lean();
      if (conflict) {
        throw new ConflictException(`A user with email '${updateData['email']}' already exists.`);
      }
    }

    // 3. Update user document with explicit affected-record validation
    const result = await this.userModel.updateOne({ _id: id }, { $set: updateData });
    if (result.matchedCount === 0) {
      throw new NotFoundException('User not found');
    }

    // 3. Re-fetch updated user after update for consistency in API response
    const updatedUser = await this.userModel.findById(id).lean();
    if (!updatedUser) {
      throw new NotFoundException('User not found after update');
    }

    return {
      message: 'User updated successfully',
      user: updatedUser,
    };
  }

  async deleteUser(id: string): Promise<{ message: string }> {
    // 1. Delete user by id and validate delete count
    const result = await this.userModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('User not found');
    }

    return { message: 'User deleted successfully' };
  }
}
