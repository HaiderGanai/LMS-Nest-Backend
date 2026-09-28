import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { AuthService } from '../services/auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/auth/login
  @Post('/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto, @Req() req: Request) {
    try {
      return await this.authService.login(body, req);
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof UnauthorizedException ||
        err instanceof ForbiddenException ||
        err instanceof NotFoundException ||
        err instanceof InternalServerErrorException
      ) {
        throw err;
      }
      throw new InternalServerErrorException('Login failed');
    }
  }

  // POST /api/auth/refresh
  @Post('/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshTokenDto, @Req() req: Request) {
    try {
      return await this.authService.refresh(body, req);
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof UnauthorizedException
      ) {
        throw err;
      }
      throw new InternalServerErrorException('Token refresh failed');
    }
  }

  // POST /api/auth/logout
  @Post('/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: { refreshToken?: string }) {
    try {
      return await this.authService.logout(body.refreshToken);
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new InternalServerErrorException('Logout failed');
    }
  }

  // POST /api/auth/updateOnlineStatus  — no auth guard (matches single file)
  @Post('/updateOnlineStatus')
  @HttpCode(HttpStatus.OK)
  async updateOnlineStatus(
    @Body() body: { userId?: string; isOnline?: boolean },
    @Req() _req: Request,
  ) {
    if (!body.userId) {
      throw new BadRequestException('userId is required');
    }
    if (typeof body.isOnline !== 'boolean') {
      throw new BadRequestException('isOnline must be a boolean');
    }
    try {
      return await this.authService.updateOnlineStatus(body.userId, body.isOnline);
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      throw new InternalServerErrorException('Failed to update online status');
    }
  }
}
