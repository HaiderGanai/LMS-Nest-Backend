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
import type { CreateComplaintDto } from '../dto/create-complaint.dto';

@Injectable()
export class ComplaintsService {
  constructor(
    @InjectModel('Complaint')
    private readonly complaintModel: Model<Record<string, unknown>>,
  ) {}

  async getComplaints(query: Record<string, unknown> = {}): Promise<{ complaints: Record<string, unknown>[] }> {
    const filters: Record<string, unknown> = {};
    const teacherId = String(query.teacherId || '').trim();
    const status = String(query.status || '').trim();
    const severity = String(query.severity || '').trim();

    if (teacherId) {
      filters.teacherId = teacherId;
    }
    if (status) {
      filters.status = status;
    }
    if (severity) {
      filters.severity = severity;
    }

    const complaints = await this.complaintModel.find(filters).sort({ createdAt: -1 }).lean();
    return { complaints };
  }

  async createComplaint(body: CreateComplaintDto): Promise<{ message: string; complaint: Record<string, unknown> }> {
    const id = String(body.id || '').trim() || crypto.randomBytes(12).toString('hex');
    const status = String(body.status || 'pending').trim() || 'pending';

    const payload: Record<string, unknown> = { _id: id, status };

    const strFields = ['studentId', 'teacherId', 'complainantId', 'complainantType',
      'subject', 'relatedEntityId', 'description', 'severity', 'category'] as const;
    for (const field of strFields) {
      const val = String(body[field] || '').trim();
      if (val) payload[field] = val;
    }
    if (body.resolved !== undefined) payload.resolved = Boolean(body.resolved);
    if (body.raw !== undefined) payload.raw = body.raw;

    try {
      await this.complaintModel.create(payload);
    } catch (error: unknown) {
      const errorCode = (error as { code?: number } | null)?.code;
      if (errorCode === 11000) {
        throw new ConflictException(`Complaint with id "${id}" already exists`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to create complaint: ${message}`);
    }

    const complaint = await this.complaintModel.findById(id).lean();
    if (!complaint) {
      throw new NotFoundException('Complaint not found after creation');
    }
    return { message: 'Complaint created successfully', complaint };
  }

  async getComplaintById(id: string): Promise<{ complaint: Record<string, unknown> }> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('id is required');
    }
    const complaint = await this.complaintModel.findById(normalizedId).lean();
    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }
    return { complaint };
  }

  async updateComplaint(id: string, body: Record<string, unknown>): Promise<{ message: string; complaint: Record<string, unknown> }> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('id is required');
    }

    const updateData = Object.fromEntries(
      Object.entries(body).filter(([key, value]) => key !== 'id' && key !== '_id' && value !== undefined),
    );
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No updatable fields were provided');
    }

    let result: { matchedCount: number };
    try {
      result = await this.complaintModel.updateOne({ _id: normalizedId }, { $set: updateData });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to update complaint: ${message}`);
    }

    if (result.matchedCount === 0) {
      throw new NotFoundException('Complaint not found');
    }
    const complaint = await this.complaintModel.findById(normalizedId).lean();
    if (!complaint) {
      throw new NotFoundException('Complaint not found after update');
    }
    return { message: 'Complaint updated successfully', complaint };
  }

  async deleteComplaint(id: string): Promise<{ message: string }> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('id is required');
    }

    let result: { deletedCount?: number };
    try {
      result = await this.complaintModel.deleteOne({ _id: normalizedId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(`Failed to delete complaint: ${message}`);
    }

    if (result.deletedCount === 0) {
      throw new NotFoundException('Complaint not found');
    }
    return { message: 'Complaint deleted successfully' };
  }

  async resolveComplaint(
    id: string,
    body: Record<string, unknown> = {},
  ): Promise<{ message: string; complaint: Record<string, unknown> }> {
    const resolvedBy = String(body.resolvedBy || '').trim();
    const resolutionNotes = String(body.resolutionNotes || '').trim();

    return this.updateComplaint(id, {
      status: 'resolved',
      resolved: true,
      resolvedAt: new Date().toISOString(),
      ...(resolvedBy ? { 'raw.resolvedBy': resolvedBy } : {}),
      ...(resolutionNotes ? { 'raw.resolutionNotes': resolutionNotes } : {}),
      'raw.resolvedAt': new Date().toISOString(),
    });
  }
}
