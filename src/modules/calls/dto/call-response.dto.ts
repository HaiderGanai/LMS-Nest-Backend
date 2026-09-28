export class CallResponseDto {
  callId!: string;
  status!: string;
  teacherId?: string;
  studentId?: string;
  roomId?: string;
  startedAt?: string | Date;
  endedAt?: string | Date;
}
