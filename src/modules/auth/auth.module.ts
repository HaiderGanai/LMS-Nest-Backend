import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { SharedModule } from '../../shared/shared.module';
import { getLegacyModelSchema } from '../../shared/utils/legacy-model.util';
import { AuthController } from './controllers/auth.controller';
import {
  AuthRefreshTokenModelName,
  AuthRefreshTokenSchema,
} from './entities/auth-refresh-token.entity';
import { AuthUserModelName, AuthUserSchema } from './entities/auth-user.entity';
import {
  LocalAuthCredentialModelName,
  LocalAuthCredentialSchema,
} from './entities/local-auth-credential.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

@Module({
  imports: [
    SharedModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.accessTokenSecret') || 'local_access_secret',
      }),
    }),
    MongooseModule.forFeature([
      { name: AuthUserModelName, schema: AuthUserSchema },
      { name: LocalAuthCredentialModelName, schema: LocalAuthCredentialSchema },
      { name: AuthRefreshTokenModelName, schema: AuthRefreshTokenSchema },
      { name: 'User', schema: getLegacyModelSchema('User') },
      { name: 'Employee', schema: getLegacyModelSchema('Employee') },
      { name: 'Student', schema: getLegacyModelSchema('Student') },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, JwtStrategy],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
