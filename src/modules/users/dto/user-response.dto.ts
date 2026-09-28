export class UserResponseDto {
  id!: string;
  email!: string;
  role!: string;
  name?: string;
  username?: string;
  isActive?: boolean;
  isOnline?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
