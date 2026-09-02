import { useCallback, useRef } from 'react';

/**
 * 서버 목록 조회의 응답 경쟁(race)을 막는 "최신 응답 우선" 가드.
 *
 * 문제: 빠르게 연속 검색하면(예: 회차번호 "2" → "20") 각 키 입력이 요청을 발생시키는데,
 * 서버가 느리면 먼저 보낸 "2" 응답이 나중 "20" 응답보다 늦게 도착해 최신 결과를 덮어쓴다.
 *
 * 사용법:
 * - 요청 시작 직전 `const token = next();` 로 토큰을 발급한다.
 * - 응답을 화면 상태에 반영하기 직전 `if (isStale(token)) return;` 로 낡은 응답을 버린다.
 *
 * 취소(AbortController) 없이도 화면에는 항상 마지막으로 시작한 요청의 결과만 반영된다.
 */
export function useLatestRequest() {
  const seqRef = useRef(0);

  const next = useCallback(() => {
    seqRef.current += 1;
    return seqRef.current;
  }, []);

  const isStale = useCallback((token: number) => token !== seqRef.current, []);

  return { next, isStale };
}
