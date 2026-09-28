import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface PeopleRepoModule {
  getTeachers: (payload: { dataBackend: string }) => Promise<unknown>;
}

@Injectable()
export class FamiliesRepository {
  private readonly peopleRepoModule: PeopleRepoModule = requireLegacyModule<PeopleRepoModule>('src/legacy/repos/peopleRepo.js');

  async getTeachers(): Promise<unknown> {
    return this.peopleRepoModule.getTeachers({ dataBackend: 'mongo' });
  }
}
