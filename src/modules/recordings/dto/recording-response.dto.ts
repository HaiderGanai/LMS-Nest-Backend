export class RecordingResponseDto {
  id!: string;
  callId!: string;
  status!: string;
  filePath?: string;
  createdAt?: string | Date;
}
