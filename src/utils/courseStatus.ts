import type { CourseStatus } from '../api/courses';

// 회차 상태 → 한글 라벨. RoundsPage / RoundDetailPage / AssignPage 공용.
const STATUS_LABELS: Record<string, string> = {
  PLANNED: '예정',
  OPEN: '모집중',
  CLOSED: '모집마감',
  IN_PROGRESS: '교육중',
  COMPLETED: '완료',
  CANCELED: '취소',
};

// 상태 라이프사이클 정렬 랭크. 취소(CANCELED)는 뒤, 알 수 없는 값은 맨 뒤(UNKNOWN_ORDER).
const UNKNOWN_ORDER = 99;
export const STATUS_ORDER: Record<string, number> = {
  PLANNED: 0,
  OPEN: 1,
  CLOSED: 2,
  IN_PROGRESS: 3,
  COMPLETED: 4,
  CANCELED: 5,
};

export function statusLabel(status?: CourseStatus): string {
  return status ? (STATUS_LABELS[status] ?? status) : '-';
}

// 회차 상태 → chip 색상 클래스. RoundsPage/RoundDetailPage 의 중복 로직을 공용화.
// OPEN·IN_PROGRESS=진행(info), COMPLETED=완료(ok), CANCELED=취소(danger), CLOSED=마감(warn), 그 외 neutral.
export function statusChipClass(status?: CourseStatus): string {
  if (status === 'OPEN' || status === 'IN_PROGRESS') return 'info';
  if (status === 'COMPLETED') return 'ok';
  if (status === 'CANCELED') return 'danger';
  if (status === 'CLOSED') return 'warn';
  return 'neutral';
}

export function statusOrder(status?: CourseStatus): number {
  return status ? (STATUS_ORDER[status] ?? UNKNOWN_ORDER) : UNKNOWN_ORDER;
}

// 상태 라이프사이클 순 비교(같은 상태면 0). 2차 정렬은 호출부에서 처리.
export function compareCourseStatus(a?: CourseStatus, b?: CourseStatus): number {
  return statusOrder(a) - statusOrder(b);
}

// 교육중(IN_PROGRESS) 우선 정렬 랭크 — 출결·현황 페이지 전용.
// 진행 중인 회차를 먼저 확인하도록 예정↔교육중 순서를 교체(예정은 뒤로).
export const STATUS_ORDER_ONGOING_FIRST: Record<string, number> = {
  IN_PROGRESS: 0,
  OPEN: 1,
  CLOSED: 2,
  PLANNED: 3,
  COMPLETED: 4,
  CANCELED: 5,
};

export function statusOrderOngoingFirst(status?: CourseStatus): number {
  return status ? (STATUS_ORDER_ONGOING_FIRST[status] ?? UNKNOWN_ORDER) : UNKNOWN_ORDER;
}

// 교육중 우선 순 비교(출결·현황 전용). 2차 정렬은 호출부에서 처리.
export function compareCourseStatusOngoingFirst(a?: CourseStatus, b?: CourseStatus): number {
  return statusOrderOngoingFirst(a) - statusOrderOngoingFirst(b);
}
