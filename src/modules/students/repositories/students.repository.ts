import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface StudentsRepoModule {
  getStudentProfile: (payload: { dataBackend: string; studentId: string }) => Promise<unknown>;
}

@Injectable()
export class StudentsRepository {
  private readonly studentsRepoModule: StudentsRepoModule = requireLegacyModule<StudentsRepoModule>('src/legacy/repos/studentsRepo.js');

  async getStudentProfile(studentId: string): Promise<unknown> {
    return this.studentsRepoModule.getStudentProfile({
      dataBackend: 'mongo',
      studentId,
    });
  }
}
