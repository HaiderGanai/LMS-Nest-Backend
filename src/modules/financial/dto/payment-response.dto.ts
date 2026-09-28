export class PaymentResponseDto {
  id!: string;
  invoiceId!: string;
  familyId!: string;
  amount!: number;
  method!: string;
  status!: string;
  createdAt?: string | Date;
}
