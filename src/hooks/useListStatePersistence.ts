import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * 목록 페이지의 검색·필터·페이지네이션 상태를 상세 페이지 왕복 사이에 보존하기 위한 공용 훅.
 *
 * 동작 규약:
 * - **뒤로가기**(브라우저 back/forward = 내비게이션 'POP', 또는 상세 화면의 "뒤로" 버튼이
 *   `navigate(..., { state: { restoreList: true } })` 로 넘긴 신호) → 마지막 상태 복원.
 * - **새 진입**(GNB 메뉴 Link = 'PUSH', state 없음) → 복원하지 않음(기본값으로 초기화).
 *
 * 저장소로 sessionStorage 를 쓰는 이유: 상세 화면의 인앱 "뒤로" 버튼이 `navigate('/list')`(쿼리 없음)로
 * 동작하므로 URL 쿼리 방식은 그 경로에서 상태를 잃는다. sessionStorage 는 복귀 경로와 무관하게 복원 가능하다.
 */

const STORAGE_PREFIX = 'listState:';

/** 저장된 목록 상태 스냅샷을 읽는다. 없거나 파싱 실패 시 null. */
export function readListState<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * 이번 진입이 "뒤로가기"라서 목록 상태를 복원해야 하는지 판정한다.
 * 각 목록 페이지에서 마운트 시 1회 호출해 `readListState` 호출 여부를 결정한다.
 */
export function useShouldRestoreListState(): boolean {
  const navigationType = useNavigationType();
  const location = useLocation();
  const state = location.state as { restoreList?: boolean } | null;
  return navigationType === 'POP' || state?.restoreList === true;
}

/** 목록 상태 스냅샷을 sessionStorage 에 저장한다(마운트 중 스냅샷이 바뀔 때마다 갱신). */
export function usePersistListState<T>(key: string, snapshot: T): void {
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(snapshot));
    } catch {
      /* sessionStorage 사용 불가(프라이빗 모드 등) — 조용히 무시 */
    }
  }, [key, snapshot]);
}
