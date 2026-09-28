import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class HttpsMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv !== 'production') {
      next();
      return;
    }

    const forwardedProtocol = String(request.headers['x-forwarded-proto'] || '').toLowerCase();
    if (forwardedProtocol === 'https' || request.secure) {
      next();
      return;
    }

    const host = request.headers.host || '';
    return response.redirect(301, `https://${host}${request.originalUrl}`);
  }
}
