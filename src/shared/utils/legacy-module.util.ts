import { join } from 'path';

export const requireLegacyModule = <T>(legacyRelativePath: string): T => {
  const absolutePath = join(process.cwd(), legacyRelativePath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(absolutePath) as T;
};
