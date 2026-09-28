import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AUTH_CONSTANTS } from '../constants/auth.constants';

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, AUTH_CONSTANTS.bcryptRounds);
  }

  async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  isBcryptHash(value: string): boolean {
    return /^\$2[abxy]\$\d{2}\$/.test(value);
  }

  /**
   * Verify a MongoUser's password field (which may be bcrypt or plain text).
   * If the stored value is plain text and matches, upgrade it to bcrypt in-place
   * by calling the provided save callback.
   */
  async verifyAndMaybeUpgradeUserPassword(
    user: { password?: string },
    inputPassword: string,
    saveUpgradedHash: (hash: string) => Promise<void>,
  ): Promise<boolean> {
    const stored = user.password;

    // No password material at all — cannot verify
    if (!stored) {
      return false;
    }

    if (this.isBcryptHash(stored)) {
      return bcrypt.compare(inputPassword, stored);
    }

    // Plain-text comparison
    if (stored !== inputPassword) {
      return false;
    }

    // Upgrade plain text → bcrypt hash in-place
    const upgraded = await bcrypt.hash(inputPassword, AUTH_CONSTANTS.bcryptRounds);
    await saveUpgradedHash(upgraded);
    return true;
  }

  /**
   * Verify a LocalAuthCredential password (passwordHash field preferred, then password plain).
   * If plain matches, upgrade to bcrypt via save callback.
   */
  async verifyAndMaybeUpgradeCredentialPassword(
    cred: { password?: string; passwordHash?: string },
    inputPassword: string,
    saveUpgradedHash?: (hash: string) => Promise<void>,
  ): Promise<boolean> {
    if (cred.passwordHash && this.isBcryptHash(cred.passwordHash)) {
      return bcrypt.compare(inputPassword, cred.passwordHash);
    }

    if (cred.password) {
      if (this.isBcryptHash(cred.password)) {
        return bcrypt.compare(inputPassword, cred.password);
      }
      if (cred.password !== inputPassword) {
        return false;
      }
      // Plain matched — upgrade if callback provided
      if (saveUpgradedHash) {
        const upgraded = await bcrypt.hash(inputPassword, AUTH_CONSTANTS.bcryptRounds);
        await saveUpgradedHash(upgraded);
      }
      return true;
    }

    return false;
  }

  hasPasswordMaterial(entity: { password?: string; passwordHash?: string }): boolean {
    return Boolean(entity.passwordHash || entity.password);
  }
}
