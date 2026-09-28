import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { NextFunction, Request, Response } from 'express';
import type { Model } from 'mongoose';
import { getPermissionLevel } from '../constants/roles.constants';
import type { RequestUser } from '../interfaces/request-user.interface';

export interface FamilyScopedRequest extends Request {
  familyScope: string[] | null;
  familyScopeActive: boolean;
}

@Injectable()
export class FamilyScopeMiddleware implements NestMiddleware {
  constructor(
    @InjectModel('Employee') private readonly employeeModel: Model<any>,
    @InjectModel('Family') private readonly familyModel: Model<any>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user as RequestUser | undefined;
    if (!user) {
      // JwtAuthGuard runs after middleware and will reject unauthenticated requests
      return next();
    }

    const level = user.permissionLevel ?? getPermissionLevel(user.role);

    if (level >= 80) {
      (req as FamilyScopedRequest).familyScope = null;
      (req as FamilyScopedRequest).familyScopeActive = false;
      return next();
    }

    try {
      const employee = await this.employeeModel
        .findById(user.uid)
        .select({ assignedFamilies: 1, raw: 1 })
        .lean();

      if (!employee) {
        res.status(403).json({ error: 'Employee record not found' });
        return;
      }

      const emp = employee as any;
      const explicit: string[] = (
        emp.assignedFamilies?.length
          ? emp.assignedFamilies
          : (emp.raw?.assignedFamilies || [])
      ).map(String);

      const orConditions: object[] = [
        { assignedManager: user.uid },
        { 'raw.assignedManager': user.uid },
      ];
      if (explicit.length) {
        orConditions.push({ _id: { $in: explicit } });
      }

      const families = await this.familyModel
        .find({ $or: orConditions })
        .select({ _id: 1 })
        .lean();

      (req as FamilyScopedRequest).familyScope = families.map((f: any) => String(f._id));
      (req as FamilyScopedRequest).familyScopeActive = true;
      return next();
    } catch {
      res.status(500).json({ error: 'Failed to resolve family scope' });
    }
  }
}

export function applyFamilyScope(baseFilter: Record<string, unknown>, req: FamilyScopedRequest): Record<string, unknown> {
  if (req.familyScopeActive && Array.isArray(req.familyScope)) {
    return { ...baseFilter, _id: { $in: req.familyScope } };
  }
  return baseFilter;
}

export function isFamilyInScope(familyId: string, req: FamilyScopedRequest): boolean {
  if (!req.familyScopeActive) return true;
  return (req.familyScope ?? []).includes(String(familyId));
}
