export interface ActiveCallState {
  callId: string;
  teacherId?: string;
  studentId?: string;
  status: string;
  roomId?: string;
  participants: string[];
  updatedAt: string;
}
