export interface RequestUser {
  uid: string;
  id: string;
  userId?: string;
  role: string;
  email?: string;
  name?: string;
  permissionLevel?: number;
  [key: string]: unknown;
}
