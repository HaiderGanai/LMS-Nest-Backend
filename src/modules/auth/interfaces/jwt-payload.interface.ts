export interface JwtPayload {
  uid: string;
  role: string;
  email: string;
  name?: string;
  typ?: 'access' | 'refresh' | 'socket';
  jti?: string;
  clientApp?: string | null;
}
