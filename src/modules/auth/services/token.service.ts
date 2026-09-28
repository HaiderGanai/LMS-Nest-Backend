import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'crypto';
import type { Model } from 'mongoose';
import { AUTH_CONSTANTS } from '../constants/auth.constants';
import { AuthRefreshTokenModelName } from '../entities/auth-refresh-token.entity';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

interface RefreshTokenDocument {
  _id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenHash?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  clientApp?: string | null;
  save: () => Promise<unknown>;
}

export interface GeneratedAuthTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  socketToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    @InjectModel(AuthRefreshTokenModelName)
    private readonly authRefreshTokenModel: Model<RefreshTokenDocument>,
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    private readonly nestConfigService: ConfigService,
  ) {}

  private hashRefreshToken(refreshToken: string): string {
    return crypto.createHash('sha256').update(refreshToken).digest('hex');
  }

  private buildJti(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  createSocketToken(userId: string): string {
    return this.jwtService.sign(
      { uid: userId, typ: AUTH_CONSTANTS.socketTokenType },
      {
        secret: this.nestConfigService.get<string>('auth.socketTokenSecret'),
        expiresIn: '1h',
      },
    );
  }

  async generateAuthTokens(
    payload: JwtPayload,
    metadata: { ip: string | null; userAgent: string | null; clientApp: string | null },
  ): Promise<GeneratedAuthTokens> {
    // 1. Build stable token identifiers for refresh token rotation
    const jti = this.buildJti();

    // 2. Sign access token used by HTTP guards
    const accessToken = this.jwtService.sign(
      { ...payload, typ: AUTH_CONSTANTS.accessTokenType },
      {
        secret: this.nestConfigService.get<string>('auth.accessTokenSecret'),
        expiresIn: AUTH_CONSTANTS.accessTokenTtlSeconds,
      },
    );

    // 3. Sign refresh token with jti for revocation and rotation tracking
    const refreshToken = this.jwtService.sign(
      {
        uid: payload.uid,
        typ: AUTH_CONSTANTS.refreshTokenType,
        jti,
        clientApp: metadata.clientApp,
      },
      {
        secret: this.nestConfigService.get<string>('auth.refreshTokenSecret'),
        expiresIn: AUTH_CONSTANTS.refreshTokenTtlSeconds,
      },
    );

    // 4. Persist refresh token hash so plaintext token never gets stored
    await this.authRefreshTokenModel.create({
      _id: jti,
      userId: payload.uid,
      tokenHash: this.hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + (AUTH_CONSTANTS.refreshTokenTtlSeconds * 1000)),
      revokedAt: null,
      issuedAt: new Date(),
      lastUsedAt: null,
      userAgent: metadata.userAgent,
      ip: metadata.ip,
      clientApp: metadata.clientApp,
    });

    return {
      accessToken,
      accessTokenExpiresIn: AUTH_CONSTANTS.accessTokenTtlSeconds,
      refreshToken,
      refreshTokenExpiresIn: AUTH_CONSTANTS.refreshTokenTtlSeconds,
      socketToken: this.createSocketToken(payload.uid),
    };
  }

  async rotateRefreshToken(
    refreshToken: string,
    metadata: { ip: string | null; userAgent: string | null; clientApp: string | null },
  ): Promise<{ userId: string; clientApp: string | null }> {
    // 1. Verify refresh token signature and token type before using it
    const decoded = this.jwtService.verify<JwtPayload>(refreshToken, {
      secret: this.nestConfigService.get<string>('auth.refreshTokenSecret'),
    });

    if (decoded.typ !== AUTH_CONSTANTS.refreshTokenType || !decoded.uid || !decoded.jti) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    // 2. Validate token hash against persisted refresh token record
    const currentTokenHash = this.hashRefreshToken(refreshToken);
    const tokenDocument = await this.authRefreshTokenModel.findById(decoded.jti);
    if (!tokenDocument) {
      throw new UnauthorizedException('Refresh token does not exist');
    }

    const isTokenRevoked = Boolean(tokenDocument.revokedAt);
    const isHashMismatch = tokenDocument.tokenHash !== currentTokenHash;
    const isTokenExpired = tokenDocument.expiresAt.getTime() <= Date.now();
    if (isTokenRevoked || isHashMismatch || isTokenExpired) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 3. Revoke current token and mark it as rotated before issuing a replacement
    tokenDocument.revokedAt = new Date();
    tokenDocument.replacedByTokenHash = '__rotated__';
    await tokenDocument.save();

    const nextClientApp = metadata.clientApp || tokenDocument.clientApp || decoded.clientApp || null;
    return { userId: decoded.uid, clientApp: nextClientApp };
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    // 1. Decode and locate persisted token record if possible
    let decoded: JwtPayload | null = null;
    try {
      decoded = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.nestConfigService.get<string>('auth.refreshTokenSecret'),
      });
    } catch {
      decoded = null;
    }

    if (!decoded?.jti) {
      return;
    }

    // 2. Mark token as revoked to prevent future refresh usage
    await this.authRefreshTokenModel.updateOne(
      { _id: decoded.jti },
      { $set: { revokedAt: new Date() } },
    );
  }
}
