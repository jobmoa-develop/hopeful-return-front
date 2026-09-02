import type { AnchorHTMLAttributes, ReactNode } from 'react';

// 주소(교육장 등) 표시 지점 공용 래퍼 — 클릭 시 네이버 지도 검색으로 새 탭 이동.
// 값이 없으면 fallback('—')을 그대로 렌더한다. 목록 행 클릭 등 상위 핸들러로의 전파를 막는다.
const NAVER_MAP_SEARCH = 'https://map.naver.com/p/search/';

type MapLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  address?: string | null;
  children?: ReactNode;
  fallback?: ReactNode;
};

export function MapLink({ address, children, fallback = '—', onClick, ...rest }: MapLinkProps) {
  const query = (address ?? '').trim();
  if (!query) return <>{fallback}</>;
  return (
    <a
      href={`${NAVER_MAP_SEARCH}${encodeURIComponent(query)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...rest}
    >
      {children ?? address}
    </a>
  );
}
