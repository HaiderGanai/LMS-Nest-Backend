import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface PeopleRepoModule {
  getAdmins: (payload: { dataBackend: string }) => Promise<unknown>;
  getTeachers: (payload: { dataBackend: string }) => Promise<unknown>;
  getTeacherById: (payload: { dataBackend: string; teacherId: string }) => Promise<unknown>;
  getTeacherStudents: (payload: { dataBackend: string; teacherId: string }) => Promise<unknown>;
}

@Injectable()
export class EmployeesRepository {
  private readonly peopleRepoModule: PeopleRepoModule = requireLegacyModule<PeopleRepoModule>('src/legacy/repos/peopleRepo.js');

  async getAdmins(): Promise<unknown> {
    return this.peopleRepoModule.getAdmins({ dataBackend: 'mongo' });
  }

  async getTeachers(): Promise<unknown> {
    return this.peopleRepoModule.getTeachers({ dataBackend: 'mongo' });
  }

  async getTeacherById(teacherId: string): Promise<unknown> {
    return this.peopleRepoModule.getTeacherById({ dataBackend: 'mongo', teacherId });
  }

  async getTeacherStudents(teacherId: string): Promise<unknown> {
    return this.peopleRepoModule.getTeacherStudents({ dataBackend: 'mongo', teacherId });
  }
}
