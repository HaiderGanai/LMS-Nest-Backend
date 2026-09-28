import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import type { Model } from 'mongoose';
import type { SalaryAdvanceDto } from '../dto/salary-advance.dto';

@Injectable()
export class SalaryAdvancesService {
  constructor(
    @InjectModel('SalaryAdvance')
    private readonly salaryAdvanceModel: Model<Record<string, unknown>>,
  ) {}

  async getSalaryAdvances(query: Record<string, unknown> = {}): Promise<{ advances: Record<string, unknown>[] }> {
    const filters: Record<string, unknown> = {};
    const employeeId = String(query.employeeId || '').trim();
    const status = String(query.status || '').trim();

    if (employeeId) {
      filters.employeeId = employeeId;
    }
    if (status) {
      filters.status = status;
    }

    const advances = await this.salaryAdvanceModel.find(filters).sort({ createdAt: -1 }).lean();
    return { advances };
  }

  async createSalaryAdvance(body: SalaryAdvanceDto): Promise<{ message: string; advance: Record<string, unknown> }> {
    const id = String(body.id || '').trim() || crypto.randomBytes(12).toString('hex');
    const employeeId = String(body.employeeId || '').trim();
    const amount = Number(body.amount);
    const status = String(body.status || 'pending').trim() || 'pending';

    if (!employeeId) {
      throw new BadRequestException('employeeId is required');
    }
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('amount must be a non-negative number');
    }

    try {
      await this.salaryAdvanceModel.create({
        _id: id,
        employeeId,
        amount,
        status,
      });
    } catch (error: unknown) {
      const errorCode = (error as { code?: number } | null)?.code;
      if (errorCode === 11000) {
        throw new ConflictException(`Salary advance with id "${id}" already exists`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to create salary advance: ${message}`);
    }

    const advance = await this.salaryAdvanceModel.findById(id).lean();
    if (!advance) {
      throw new NotFoundException('Salary advance not found after creation');
    }
    return { message: 'Salary advance created successfully', advance };
  }

  async approveSalaryAdvance(id: string): Promise<{ message: string; advance: Record<string, unknown> }> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('id is required');
    }

    let result: { matchedCount: number };
    try {
      result = await this.salaryAdvanceModel.updateOne({ _id: normalizedId }, { $set: { status: 'approved' } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to approve salary advance: ${message}`);
    }

    if (result.matchedCount === 0) {
      throw new NotFoundException('Salary advance not found');
    }
    const advance = await this.salaryAdvanceModel.findById(normalizedId).lean();
    if (!advance) {
      throw new NotFoundException('Salary advance not found after approval');
    }
    return { message: 'Salary advance approved successfully', advance };
  }

  async rejectSalaryAdvance(id: string): Promise<{ message: string; advance: Record<string, unknown> }> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('id is required');
    }

    let result: { matchedCount: number };
    try {
      result = await this.salaryAdvanceModel.updateOne({ _id: normalizedId }, { $set: { status: 'rejected' } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to reject salary advance: ${message}`);
    }

    if (result.matchedCount === 0) {
      throw new NotFoundException('Salary advance not found');
    }
    const advance = await this.salaryAdvanceModel.findById(normalizedId).lean();
    if (!advance) {
      throw new NotFoundException('Salary advance not found after rejection');
    }
    return { message: 'Salary advance rejected successfully', advance };
  }
}
