import type { AnchorHTMLAttributes, ReactNode } from 'react';

// 전화번호 표시 지점 공용 래퍼 — 클릭 시 tel: 로 통화 연결.
// 번호가 없으면 fallback('—')을 그대로 렌더한다. 목록 행 클릭 등 상위 핸들러로의
// 전파를 막아(stopPropagation) 링크만 동작하게 한다.
type PhoneLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  phone?: string | null;
  children?: ReactNode;
  fallback?: ReactNode;
};

export function PhoneLink({ phone, children, fallback = '—', onClick, ...rest }: PhoneLinkProps) {
  // tel: 스킴은 숫자와 +만 유효 — 하이픈/공백 제거.
  const digits = (phone ?? '').replace(/[^0-9+]/g, '');
  if (!digits) return <>{fallback}</>;
  return (
    <a
      href={`tel:${digits}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...rest}
    >
      {children ?? phone}
    </a>
  );
}
