import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();
    response.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      // eslint-disable-next-line no-console
      console.log(
        `${request.method} ${request.originalUrl} ${response.statusCode} ${durationMs}ms`,
      );
    });
    next();
  }
}
