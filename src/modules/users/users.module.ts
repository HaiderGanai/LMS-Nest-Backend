import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule } from '../../shared/shared.module';
import { getLegacyModelSchema } from '../../shared/utils/legacy-model.util';
import { UsersController } from './controllers/users.controller';
import { UsersEmployeeModelName, UsersEmployeeSchema } from './entities/employee.entity';
import { UsersAuthUserModelName, UsersAuthUserSchema } from './entities/auth-user.entity';
import { UserModelName, UserSchema } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';
import { AdminService } from './services/admin.service';
import { ParentService } from './services/parent.service';
import { TeacherService } from './services/teacher.service';
import { UsersService } from './services/users.service';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: UserModelName, schema: UserSchema },
      { name: UsersAuthUserModelName, schema: UsersAuthUserSchema },
      { name: UsersEmployeeModelName, schema: UsersEmployeeSchema },
      { name: 'FamilyMember', schema: getLegacyModelSchema('FamilyMember') },
      { name: 'Student', schema: getLegacyModelSchema('Student') },
    ]),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    AdminService,
    TeacherService,
    ParentService,
    UsersRepository,
  ],
  exports: [UsersService, AdminService, TeacherService, ParentService],
})
export class UsersModule {}
