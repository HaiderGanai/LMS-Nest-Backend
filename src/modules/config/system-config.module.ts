import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import { SharedModule } from '../../shared/shared.module';
import { SystemConfigController } from './controllers/system-config.controller';
import { RoleDesignationModelName, RoleDesignationSchema } from './entities/role-designation.entity';
import { SystemConfigService } from './services/system-config.service';

// AppConfig schema — mirrors src/modules/financial/models/AppConfig.js
const AppConfigSchema = new Schema(
  {
    _id: { type: String },
    key: { type: String, index: true },
    value: { type: Schema.Types.Mixed },
    raw: { type: Schema.Types.Mixed, default: {} },
  },
  { collection: 'appConfig', strict: false, timestamps: true },
);

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: 'AppConfig', schema: AppConfigSchema },
      { name: RoleDesignationModelName, schema: RoleDesignationSchema },
    ]),
  ],
  controllers: [SystemConfigController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
