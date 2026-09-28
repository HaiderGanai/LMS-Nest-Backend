import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const authorizationHeader = String(request.headers.authorization || '');
    if (authorizationHeader.toLowerCase().startsWith('bearer ')) {
      request.headers.authorization = authorizationHeader;
    }
    next();
  }
}
