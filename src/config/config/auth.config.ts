import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  accessTokenSecret: process.env.AUTH_ACCESS_TOKEN_SECRET || 'local_access_secret',
  refreshTokenSecret: process.env.AUTH_REFRESH_TOKEN_SECRET || 'local_refresh_secret',
  accessTokenTtlSeconds: Number(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS || 900),
  refreshTokenTtlSeconds: Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS || 1209600),
  socketTokenSecret: process.env.SOCKET_TOKEN_SECRET || process.env.AUTH_ACCESS_TOKEN_SECRET || 'local_socket_secret',
}));
