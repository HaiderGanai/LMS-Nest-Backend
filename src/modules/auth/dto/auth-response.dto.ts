export class AuthResponseDto {
  uid!: string;
  parentId!: string;
  email!: string | undefined;
  name!: string | undefined;
  username!: string | undefined;
  role!: string;
  accessToken!: string;
  accessTokenExpiresIn!: number;
  refreshToken!: string;
  refreshTokenExpiresIn!: number;
  clientApp!: string | null;
  socketToken!: string;
  children!: unknown[];
  students!: unknown[];
  activeStudentId!: string | null;
  isActive!: boolean;
  createdAt!: Date | undefined;
  authBackend!: string;
}

export class RefreshResponseDto {
  accessToken!: string;
  accessTokenExpiresIn!: number;
  refreshToken!: string;
  refreshTokenExpiresIn!: number;
  clientApp!: string | null;
  socketToken!: string;
}
