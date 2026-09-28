import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const parsed = typeof exceptionResponse === 'string'
      ? { message: exceptionResponse }
      : (exceptionResponse as { message?: string | string[]; errors?: string[] } | null) ?? {};
    const message = parsed.message ?? 'Unexpected server error';

    const body: Record<string, unknown> = {
      statusCode,
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };
    if (parsed.errors) body['errors'] = parsed.errors;

    response.status(statusCode).json(body);
  }
}
