export class AlertResponseDto {
  id!: string;
  type!: string;
  status!: string;
  title?: string;
  message?: string;
  createdAt?: string | Date;
}
