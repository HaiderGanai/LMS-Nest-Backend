import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class ErrorHandlingMiddleware implements NestMiddleware {
  use(_request: Request, _response: Response, next: NextFunction): void {
    next();
  }
}
