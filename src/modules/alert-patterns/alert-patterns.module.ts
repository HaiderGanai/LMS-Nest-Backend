import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { AlertPatternsController } from './controllers/alert-patterns.controller';
import { AlertPatternModelName, AlertPatternSchema } from './entities/alert-pattern.entity';
import { AlertPatternsService } from './services/alert-patterns.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([{ name: AlertPatternModelName, schema: AlertPatternSchema }]),
  ],
  controllers: [AlertPatternsController],
  providers: [AlertPatternsService],
  exports: [AlertPatternsService],
})
export class AlertPatternsModule {}
