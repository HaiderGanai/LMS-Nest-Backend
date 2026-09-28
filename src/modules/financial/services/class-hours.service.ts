import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import type { Model } from 'mongoose';
import type { FamilyScopedRequest } from '../../../shared/middleware/family-scope.middleware';

@Injectable()
export class ClassHoursService {
  constructor(
    @InjectModel('ClassHours')
    private readonly classHoursModel: Model<Record<string, unknown>>,
  ) {}

  // -------------------------------------------------------------------------
  // GET /api/class-hours  (line 7453)
  // -------------------------------------------------------------------------

  async getClassHours(
    query: Record<string, unknown>,
    req: FamilyScopedRequest,
  ): Promise<{ success: boolean; hours: Record<string, unknown>[] }> {
    const filter: Record<string, unknown> = {};
    if (query.familyId) filter.familyId = query.familyId;
    if (query.studentId) filter.studentId = query.studentId;
    if (query.month && query.year) {
      filter.month = `${query.year}-${String(query.month).padStart(2, '0')}`;
    }

    if (req.familyScopeActive && Array.isArray(req.familyScope)) {
      if (filter.familyId) {
        if (!req.familyScope.includes(String(filter.familyId))) {
          return { success: true, hours: [] };
        }
      } else {
        filter.familyId = { $in: req.familyScope };
      }
    }

    const hours = await this.classHoursModel.find(filter).sort({ date: -1 }).lean() as Record<string, unknown>[];
    return { success: true, hours };
  }

  // -------------------------------------------------------------------------
  // POST /api/class-hours  (line 7464)
  // -------------------------------------------------------------------------

  async createClassHours(
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; hourId: string; entry: Record<string, unknown> }> {
    const id = String(body._id || '').trim() || crypto.randomBytes(12).toString('hex');
    const entry = await this.classHoursModel.create({ _id: id, ...body });
    return {
      success: true,
      hourId: id,
      entry: (entry as unknown as { toObject(): Record<string, unknown> }).toObject(),
    };
  }

  // -------------------------------------------------------------------------
  // PUT /api/class-hours/:id  (line 7472)
  // recalculate remainingHours = includedHours - usedHours
  // -------------------------------------------------------------------------

  async updateClassHours(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; entry: Record<string, unknown> }> {
    // Recalculate remainingHours if includedHours or usedHours are present in body
    const updateBody = { ...body };
    const includedHours = body.includedHours !== undefined ? Number(body.includedHours) : undefined;
    const usedHours = body.usedHours !== undefined ? Number(body.usedHours) : undefined;
    if (includedHours !== undefined || usedHours !== undefined) {
      // Load existing document to get current values for fields not in body
      const existing = await this.classHoursModel.findById(id).lean() as Record<string, unknown> | null;
      const resolvedIncluded = includedHours !== undefined ? includedHours : Number(existing?.includedHours ?? 0);
      const resolvedUsed = usedHours !== undefined ? usedHours : Number(existing?.usedHours ?? 0);
      updateBody.remainingHours = Math.max(0, resolvedIncluded - resolvedUsed);
    }

    const updated = await this.classHoursModel
      .findByIdAndUpdate(id, { $set: updateBody }, { new: true })
      .lean() as Record<string, unknown> | null;
    if (!updated) throw new NotFoundException('Class hours entry not found');
    return { success: true, entry: updated };
  }
}
