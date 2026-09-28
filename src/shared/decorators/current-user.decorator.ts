import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../interfaces/request-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser | null => {
    const request = context.switchToHttp().getRequest<Request>();
    return (request.user as RequestUser | undefined) ?? null;
  },
);
