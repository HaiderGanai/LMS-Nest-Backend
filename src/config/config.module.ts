import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService as NestConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import emailConfig from './config/email.config';
import paymentConfig from './config/payment.config';
import storageConfig from './config/storage.config';
import { ConfigController } from './config.controller';
import { AuthMiddleware } from './middleware/auth.middleware';
import { ErrorHandlingMiddleware } from './middleware/error-handling.middleware';
import { janusProxyMiddleware } from './middleware/janus-proxy.middleware';
import { LoggingMiddleware } from './middleware/logging.middleware';
import { DatabaseService } from './services/database.service';
import { ConfigService } from './services/config.service';
import { LoggerService } from './services/logger.service';
import { MailService } from './services/mail.service';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [databaseConfig, authConfig, storageConfig, emailConfig, paymentConfig],
    }),
    MongooseModule.forRootAsync({
      inject: [NestConfigService],
      useFactory: (nestConfigService: NestConfigService) => ({
        uri: nestConfigService.get<string>('database.mongoUri') || 'mongodb://127.0.0.1:27017',
        dbName: nestConfigService.get<string>('database.dbName') || 'tarteel_v2',
        maxPoolSize: nestConfigService.get<number>('database.maxPoolSize') || 20,
      }),
    }),
  ],
  controllers: [ConfigController],
  providers: [ConfigService, DatabaseService, MailService, LoggerService],
  exports: [ConfigService, DatabaseService, MailService, LoggerService, NestConfigModule, MongooseModule],
})
export class ConfigModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LoggingMiddleware, AuthMiddleware, ErrorHandlingMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    consumer
      .apply(janusProxyMiddleware)
      .forRoutes({ path: 'janus/(.*)', method: RequestMethod.ALL });
  }
}
