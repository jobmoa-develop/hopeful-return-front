import { useEffect, useState } from 'react';

/**
 * 뷰포트가 모바일 폭(기본 ≤768px) 이하인지 반응형으로 반환한다.
 * CSS breakpoint 표준(768px)과 동일한 기준으로, 모바일 전용 인터랙션 분기에 사용한다.
 */
export function useIsMobile(query: string = '(max-width: 768px)'): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // 마운트 시점 값 동기화(초기 렌더 이후 뷰포트가 바뀐 경우 대비)
    setIsMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return isMobile;
}
