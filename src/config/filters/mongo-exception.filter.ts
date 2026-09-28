import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Response } from 'express';
import mongoose from 'mongoose';

@Catch(mongoose.Error)
export class MongoExceptionFilter implements ExceptionFilter {
  catch(exception: mongoose.Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const isDuplicateKeyError = exception.name === 'MongoServerError'
      && 'code' in exception
      && (exception as unknown as { code?: number }).code === 11000;

    const normalizedException = isDuplicateKeyError
      ? new ConflictException('Duplicate key detected for requested operation')
      : new InternalServerErrorException(exception.message || 'Mongo operation failed');

    response.status(normalizedException.getStatus()).json({
      statusCode: normalizedException.getStatus(),
      message: normalizedException.message,
      timestamp: new Date().toISOString(),
    });
  }
}
