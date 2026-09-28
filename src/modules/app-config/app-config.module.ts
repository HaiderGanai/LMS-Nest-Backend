import { Module } from '@nestjs/common';
import { AppConfigController } from './controllers/app-config.controller';

@Module({
  controllers: [AppConfigController],
})
export class AppConfigModule {}
