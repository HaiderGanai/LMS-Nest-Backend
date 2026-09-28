import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface UsersRepoModule {
  getUserById: (payload: { firestore?: unknown; dataBackend?: string; userId: string }) => Promise<unknown>;
}

@Injectable()
export class UsersRepository {
  private readonly usersRepoModule: UsersRepoModule = requireLegacyModule<UsersRepoModule>('src/legacy/repos/usersRepo.js');

  async getUserById(userId: string): Promise<unknown> {
    return this.usersRepoModule.getUserById({
      dataBackend: 'mongo',
      userId,
    });
  }
}
