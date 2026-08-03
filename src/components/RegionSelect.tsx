import { useEffect, useRef, useState } from 'react';
import type { RegionGroup } from '../api/regions';

interface RegionSelectProps {
  value: number | '';
  onChange: (value: number | '') => void;
  groups: RegionGroup[];
  allLabel?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function RegionSelect({
  value,
  onChange,
  groups,
  allLabel = '전체 지역',
  placeholder = '지역 선택',
  className = '',
  style = {},
}: RegionSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 현재 선택된 항목 이름 찾기
  let selectedLabel = allLabel;
  if (value !== '') {
    for (const group of groups) {
      const match = group.children.find((c) => c.regionId === value);
      if (match) {
        selectedLabel = `${group.parent.regionName} > ${match.regionName}`;
        break;
      }
    }
  }

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          color: value === '' ? 'var(--muted, #64748b)' : 'var(--fg, #1e293b)',
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

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div
          style={{
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
          }}
        >
          {/* 전체 옵션 */}
          <div
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
            style={{
              padding: '7px 14px',
              fontSize: 12.5,
              fontWeight: value === '' ? 600 : 400,
              color: value === '' ? '#2563eb' : '#334155',
              background: value === '' ? '#eff6ff' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            onMouseEnter={(e) => {
              if (value !== '') e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              if (value !== '') e.currentTarget.style.background = 'transparent';
            }}
          >
            <span>{allLabel}</span>
            {value === '' && <span style={{ color: '#2563eb', fontSize: 12 }}>✓</span>}
          </div>

          {/* 상위 및 하위 지역 그룹 */}
          {groups.map((group) => (
            <div key={group.parent.regionId} style={{ marginTop: 4 }}>
              {/* 상위 지역 (라벨 - 선택 불가) */}
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

              {/* 하위 지역 옵션 */}
              {group.children.map((child) => {
                const isSelected = value === child.regionId;
                return (
                  <div
                    key={child.regionId}
                    onClick={() => {
                      onChange(child.regionId);
                      setIsOpen(false);
                    }}
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
          ))}
        </div>
      )}
    </div>
  );
}
