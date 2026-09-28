import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LocalAuthCredentialModelName,
  LocalAuthCredentialSchema,
} from '../auth/entities/local-auth-credential.entity';
import { SharedModule } from '../../shared/shared.module';
import { EmployeesController } from './controllers/employees.controller';
import { EmployeeModelName, EmployeeSchema } from './entities/employee.entity';
import { EmployeeUserModelName, EmployeeUserSchema } from './entities/user.entity';
import { EmployeesRepository } from './repositories/employees.repository';
import { EmployeesService } from './services/employees.service';
import { getLegacyModelSchema } from '../../shared/utils/legacy-model.util';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: EmployeeModelName, schema: EmployeeSchema },
      { name: EmployeeUserModelName, schema: EmployeeUserSchema },
      { name: LocalAuthCredentialModelName, schema: LocalAuthCredentialSchema },
      { name: 'Student', schema: getLegacyModelSchema('Student') },
    ]),
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeesRepository],
  exports: [EmployeesService, EmployeesRepository],
})
export class EmployeesModule {}
