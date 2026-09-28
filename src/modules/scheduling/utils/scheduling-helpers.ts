import { requireLegacyModule } from '../../../shared/utils/legacy-module.util';

interface SchedulingHelpersModule {
  normalizeDateKey: (value: string) => string;
  normalizeTimeString: (value: string) => string;
  normalizeTimezone: (value: string, fallback?: string) => string;
}

export const schedulingHelpers = requireLegacyModule<SchedulingHelpersModule>('src/legacy/utils/scheduling.js');
