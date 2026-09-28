import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './config/filters/http-exception.filter';
import { MongoExceptionFilter } from './config/filters/mongo-exception.filter';
import { RequestValidationPipe } from './config/pipes/validation.pipe';
import { ConfigService } from './config/services/config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(new RequestValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter(), new MongoExceptionFilter());

  const configService = app.get(ConfigService);
  const port = configService.getPort();

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`NestJS server listening on port ${port}`);
}

void bootstrap();
