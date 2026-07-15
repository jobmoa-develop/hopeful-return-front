import { apiClient } from './client';
import type { ApiResponse } from './courses';

// GET /api/participant-memos?courseParticipantId= 응답 항목
export type ParticipantMemoItem = {
  memoId: number;
  writerName: string | null;
  content: string;
  createdAt: string; // "YYYY-MM-DDTHH:mm:ss"
};

export function getParticipantMemos(courseParticipantId: number) {
  return apiClient.get<ApiResponse<{ content: ParticipantMemoItem[] }>>('/api/participant-memos', {
    params: { courseParticipantId },
  });
}

export function createParticipantMemo(courseParticipantId: number, content: string) {
  return apiClient.post<ApiResponse<{ memoId: number }>>('/api/participant-memos', {
    courseParticipantId,
    content,
  });
}
