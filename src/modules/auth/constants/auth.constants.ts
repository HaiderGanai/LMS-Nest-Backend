export const AUTH_CONSTANTS = {
  bcryptRounds: Number(process.env.AUTH_BCRYPT_ROUNDS || 10),
  accessTokenTtlSeconds: Number(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS || 900),
  refreshTokenTtlSeconds: Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS || 1209600),
  refreshTokenType: 'refresh',
  accessTokenType: 'access',
  socketTokenType: 'socket',
} as const;
