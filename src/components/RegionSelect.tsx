import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RegionGroup } from '../api/regions';

// 지역 필터 값 — 상위(서울) 선택 시 parentRegionId, 하위(양천) 선택 시 regionId.
// 둘 다 없으면 전체. 서버는 parentRegionId 를 받으면 산하 하위 지역 전체로 확장 조회한다.
export type RegionFilterValue = { regionId?: number; parentRegionId?: number };

interface RegionSelectProps {
  value: RegionFilterValue;
  onChange: (value: RegionFilterValue) => void;
  groups: RegionGroup[];
  // true 면 상위 지역행을 "○○ 전체"로 클릭 선택 가능(parentRegionId). false(기본)면 상위는 라벨만.
  allowParentSelect?: boolean;
  allLabel?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  // true 면 드롭다운 메뉴를 body 로 포탈 렌더한다. 모달 등 overflow(스크롤) 컨테이너 안에서
  // 절대배치 메뉴가 컨테이너 경계에 잘리는 것을 방지한다(예: 참여자 등록 모달).
  menuPortal?: boolean;
}

/**
 * 공용 지역 필터(사후관리 디자인). 커스텀 드롭다운으로 전체·상위지역 전체·하위지역을 선택한다.
 * - 하위 지역만 필요한 화면(대시보드·사후관리): allowParentSelect 생략 → 상위는 라벨.
 * - 상위지역 "전체"까지 필요한 화면(참여자관리·문자내역·상담사일정): allowParentSelect 로 활성화.
 * - 모달 안(스크롤 컨테이너)에서 쓸 때: menuPortal 로 드롭다운을 body 로 띄워 잘림 방지.
 */
export function RegionSelect({
  value,
  onChange,
  groups,
  allowParentSelect = false,
  allLabel = '전체 지역',
  placeholder = '지역 선택',
  className = '',
  style = {},
  menuPortal = false,
}: RegionSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // 현재 선택된 항목 이름 찾기 — 상위 전체 / 하위 개별 / 전체
  let selectedLabel = allLabel;
  if (value.parentRegionId != null) {
    const group = groups.find((g) => g.parent.regionId === value.parentRegionId);
    if (group) selectedLabel = `${group.parent.regionName} 전체`;
  } else if (value.regionId != null) {
    for (const group of groups) {
      const match = group.children.find((c) => c.regionId === value.regionId);
      if (match) {
        selectedLabel = `${group.parent.regionName} > ${match.regionName}`;
        break;
      }
    }
  }

  const isAllSelected = value.regionId == null && value.parentRegionId == null;

  // 외부 클릭 시 드롭다운 닫기 — 포탈 메뉴는 containerRef 밖에 있으므로 menuRef 도 함께 제외한다
  // (제외하지 않으면 옵션의 onClick 전에 mousedown 이 메뉴를 닫아 선택이 동작하지 않는다).
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 포탈 사용 시: 열릴 때 버튼 위치 기준으로 메뉴 좌표(fixed) 계산
  useLayoutEffect(() => {
    if (!menuPortal || !isOpen) return;
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [menuPortal, isOpen]);

  // 포탈 사용 시: 스크롤/리사이즈로 버튼과 메뉴가 어긋나면 닫는다(분리된 메뉴 방지)
  useEffect(() => {
    if (!menuPortal || !isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuPortal, isOpen]);

  const select = (next: RegionFilterValue) => {
    onChange(next);
    setIsOpen(false);
  };

  const menuStyle: React.CSSProperties = menuPortal
    ? {
        position: 'fixed',
        top: menuPos?.top ?? 0,
        left: menuPos?.left ?? 0,
        zIndex: 1000, // 모달 오버레이(z-index 100) 위로
        minWidth: menuPos?.width,
        width: 'max-content',
        maxWidth: 240,
        maxHeight: 260,
        overflowY: 'auto',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '4px 0',
      }
    : {
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        zIndex: 999,
        minWidth: '100%',
        width: 'max-content',
        maxWidth: 240,
        maxHeight: 260,
        overflowY: 'auto',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '4px 0',
      };

  // 드롭다운 메뉴 본체 — 포탈 사용 여부와 무관하게 내용은 동일
  const menu = (
    <div ref={menuRef} style={menuStyle}>
      {/* 전체 옵션 */}
      <div
        onClick={() => select({})}
        style={{
          padding: '7px 14px',
          fontSize: 12.5,
          fontWeight: isAllSelected ? 600 : 400,
          color: isAllSelected ? '#2563eb' : '#334155',
          background: isAllSelected ? '#eff6ff' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        onMouseEnter={(e) => {
          if (!isAllSelected) e.currentTarget.style.background = '#f8fafc';
        }}
        onMouseLeave={(e) => {
          if (!isAllSelected) e.currentTarget.style.background = 'transparent';
        }}
      >
        <span>{allLabel}</span>
        {isAllSelected && <span style={{ color: '#2563eb', fontSize: 12 }}>✓</span>}
      </div>

      {/* 상위 및 하위 지역 그룹 */}
      {groups.map((group) => {
        const isParentSelected = value.parentRegionId === group.parent.regionId;
        return (
          <div key={group.parent.regionId} style={{ marginTop: 4 }}>
            {/* 상위 지역 — allowParentSelect 면 "○○ 전체"로 선택 가능, 아니면 라벨 */}
            {allowParentSelect ? (
              <div
                onClick={() => select({ parentRegionId: group.parent.regionId })}
                style={{
                  padding: '6px 14px 6px 12px',
                  fontSize: 12,
                  fontWeight: isParentSelected ? 700 : 600,
                  color: isParentSelected ? '#2563eb' : '#475569',
                  background: isParentSelected ? '#eff6ff' : 'transparent',
                  letterSpacing: '0.02em',
                  borderTop: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 4,
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isParentSelected) e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!isParentSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span>
                  <span style={{ color: '#94a3b8', marginRight: 4 }}>•</span>
                  {group.parent.regionName} 전체
                </span>
                {isParentSelected && <span style={{ color: '#2563eb', fontSize: 12 }}>✓</span>}
              </div>
            ) : (
              <div
                style={{
                  padding: '6px 14px 2px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#64748b',
                  letterSpacing: '0.02em',
                  borderTop: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ color: '#94a3b8' }}>•</span>
                {group.parent.regionName}
              </div>
            )}

            {/* 하위 지역 옵션 */}
            {group.children.map((child) => {
              const isSelected = value.regionId === child.regionId;
              return (
                <div
                  key={child.regionId}
                  onClick={() => select({ regionId: child.regionId })}
                  style={{
                    padding: '6px 14px 6px 24px',
                    fontSize: 12.5,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? '#2563eb' : '#334155',
                    background: isSelected ? '#eff6ff' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>{child.regionName}</span>
                  {isSelected && <span style={{ color: '#2563eb', fontSize: 12 }}>✓</span>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`region-select-wrap ${className}`}
      style={{
        position: 'relative',
        display: 'inline-block',
        minWidth: 140,
        ...style,
      }}
    >
      {/* 선택 버튼 */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '5px 10px',
          fontSize: 12.5,
          fontWeight: 500,
          color: isAllSelected ? 'var(--muted, #64748b)' : 'var(--fg, #1e293b)',
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border, #cbd5e1)',
          borderRadius: 6,
          cursor: 'pointer',
          textAlign: 'left',
          boxShadow: isOpen ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none',
          borderColor: isOpen ? '#2563eb' : undefined,
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel || placeholder}
        </span>
        <span
          style={{
            fontSize: 9,
            color: 'var(--muted, #64748b)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          ▼
        </span>
      </button>

      {/* 드롭다운 메뉴 — 모달 등 스크롤 컨테이너 안에서는 body 로 포탈해 잘림 방지 */}
      {isOpen && (menuPortal ? createPortal(menu, document.body) : menu)}
    </div>
  );
}
