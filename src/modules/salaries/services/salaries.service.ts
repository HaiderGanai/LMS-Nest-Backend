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
import type { CreateSalaryDto } from '../dto/create-salary.dto';

@Injectable()
export class SalariesService {
  constructor(
    @InjectModel('Salary')
    private readonly salaryModel: Model<Record<string, unknown>>,
  ) {}

  async getSalaries(query: Record<string, unknown> = {}): Promise<{ salaries: Record<string, unknown>[] }> {
    const filters: Record<string, unknown> = {};
    const employeeId = String(query.employeeId || '').trim();
    const status = String(query.status || '').trim();
    const month = String(query.month || '').trim();
    const year = String(query.year || '').trim();

    if (employeeId) {
      filters.employeeId = employeeId;
    }
    if (status) {
      filters.status = status;
    }
    if (month && year) {
      filters.month = `${year}-${month.padStart(2, '0')}`;
    }

    const salaries = await this.salaryModel.find(filters).sort({ createdAt: -1 }).lean();
    return { salaries };
  }

  async getSalaryStats(): Promise<{ totalSalaries: number; paidSalaries: number; pendingSalaries: number }> {
    const [totalSalaries, paidSalaries, pendingSalaries] = await Promise.all([
      this.salaryModel.countDocuments({}),
      this.salaryModel.countDocuments({ status: 'paid' }),
      this.salaryModel.countDocuments({ status: { $in: ['pending', 'approved'] } }),
    ]);
    return { totalSalaries, paidSalaries, pendingSalaries };
  }

  async createSalary(body: CreateSalaryDto): Promise<{ message: string; salary: Record<string, unknown> }> {
    const id = String(body.id || '').trim() || crypto.randomBytes(12).toString('hex');
    const employeeId = String(body.employeeId || '').trim();
    const status = String(body.status || 'pending').trim() || 'pending';

    if (!employeeId) {
      throw new BadRequestException('employeeId is required');
    }

    const baseSalary = body.baseSalary !== undefined ? Number(body.baseSalary) : undefined;
    const bonuses = body.bonuses !== undefined ? Number(body.bonuses) : 0;
    const deductions = body.deductions !== undefined ? Number(body.deductions) : 0;
    const amount = body.amount !== undefined ? Number(body.amount) : undefined;

    const gross = body.grossAmount !== undefined
      ? Number(body.grossAmount)
      : baseSalary !== undefined
        ? baseSalary + bonuses
        : amount ?? 0;

    const net = body.netAmount !== undefined
      ? Number(body.netAmount)
      : baseSalary !== undefined
        ? baseSalary + bonuses - deductions
        : amount ?? 0;

    const doc: Record<string, unknown> = {
      _id: id,
      employeeId,
      status,
      grossAmount: gross,
      netAmount: net,
    };

    if (baseSalary !== undefined) doc.baseSalary = baseSalary;
    if (body.bonuses !== undefined) doc.bonuses = bonuses;
    if (body.deductions !== undefined) doc.deductions = deductions;
    if (body.month !== undefined) doc.month = String(body.month).trim();
    if (body.year !== undefined) doc.year = Number(body.year);
    if (body.currency !== undefined) doc.currency = String(body.currency).trim();
    if (amount !== undefined) doc.amount = amount;

    try {
      await this.salaryModel.create(doc);
    } catch (error: unknown) {
      const errorCode = (error as { code?: number } | null)?.code;
      if (errorCode === 11000) {
        throw new ConflictException(`Salary with id "${id}" already exists`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to create salary: ${message}`);
    }

    const salary = await this.salaryModel.findById(id).lean();
    if (!salary) {
      throw new NotFoundException('Salary not found after creation');
    }
    return { message: 'Salary created successfully', salary };
  }

  async getSalaryById(id: string): Promise<{ salary: Record<string, unknown> }> {
    const salary = await this.salaryModel.findById(id).lean();
    if (!salary) {
      throw new NotFoundException('Salary not found');
    }
    return { salary };
  }

  async updateSalary(id: string, body: Record<string, unknown>): Promise<{ message: string; salary: Record<string, unknown> }> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('id is required');
    }

    const updateData = Object.fromEntries(Object.entries({
      ...(body.employeeId !== undefined ? { employeeId: String(body.employeeId || '').trim() } : {}),
      ...(body.status !== undefined ? { status: String(body.status || '').trim() } : {}),
      ...(body.amount !== undefined ? { amount: Number(body.amount), grossAmount: Number(body.amount), netAmount: Number(body.amount) } : {}),
      ...(body.month !== undefined ? { month: String(body.month || '').trim() } : {}),
      ...(body.year !== undefined ? { year: Number(body.year) } : {}),
      ...(body.raw !== undefined && typeof body.raw === 'object' ? { raw: body.raw } : {}),
      ...(body.paidAt !== undefined ? { paidAt: body.paidAt } : {}),
    }).filter(([_, value]) => value !== undefined));

    if (updateData.amount !== undefined) {
      const amount = Number(updateData.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new BadRequestException('amount must be a non-negative number');
      }
    }
    if (updateData.year !== undefined) {
      const year = Number(updateData.year);
      if (!Number.isFinite(year) || year <= 0) {
        throw new BadRequestException('year must be a positive number');
      }
    }

    let result: { matchedCount: number };
    try {
      result = await this.salaryModel.updateOne({ _id: normalizedId }, { $set: updateData });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to update salary: ${message}`);
    }

    if (result.matchedCount === 0) {
      throw new NotFoundException('Salary not found');
    }
    const salary = await this.salaryModel.findById(normalizedId).lean();
    if (!salary) {
      throw new NotFoundException('Salary not found after update');
    }
    return { message: 'Salary updated successfully', salary };
  }

  async deleteSalary(id: string): Promise<{ message: string }> {
    const result = await this.salaryModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Salary not found');
    }
    return { message: 'Salary deleted successfully' };
  }

  async approveSalary(id: string): Promise<{ message: string; salary: Record<string, unknown> }> {
    return this.updateSalary(id, { status: 'approved' });
  }

  async paySalary(id: string): Promise<{ message: string; salary: Record<string, unknown> }> {
    return this.updateSalary(id, { status: 'paid', paidAt: new Date().toISOString() });
  }
}
