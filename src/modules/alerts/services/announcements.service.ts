import { Injectable } from '@nestjs/common';
import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface AnnouncementsRepoModule {
  getLatestAnnouncements: (payload: { dataBackend: string; limit?: number }) => Promise<unknown>;
}

@Injectable()
export class AnnouncementsService {
  private readonly announcementsRepoModule: AnnouncementsRepoModule = requireLegacyModule<AnnouncementsRepoModule>('src/legacy/repos/announcementsRepo.js');

  async getAnnouncements(limit = 20): Promise<unknown> {
    return this.announcementsRepoModule.getLatestAnnouncements({
      dataBackend: 'mongo',
      limit,
    });
  }
}
