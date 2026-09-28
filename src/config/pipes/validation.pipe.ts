import { BadRequestException, ValidationPipe } from '@nestjs/common';

export class RequestValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (validationErrors) => {
        const messages = validationErrors.flatMap((error) => {
          if (!error.constraints) {
            return [`Validation failed on ${error.property}`];
          }
          return Object.values(error.constraints);
        });
        return new BadRequestException({
          message: 'Validation failed',
          errors: messages,
        });
      },
    });
  }
}
