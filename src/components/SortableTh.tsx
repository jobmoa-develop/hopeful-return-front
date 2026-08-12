import type { CSSProperties, ReactNode } from 'react';
import type { SortOrder } from '../hooks/useTableSort';

type SortableThProps = {
  /** 서버로 전달할 정렬 키(BE 화이트리스트와 일치해야 함) */
  column: string;
  sortBy: string;
  sortOrder: SortOrder;
  onSort: (column: string) => void;
  children: ReactNode;
  style?: CSSProperties;
};

/**
 * 클릭 시 정렬을 토글하는 테이블 헤더 셀. 활성 컬럼은 방향(▲/▼)을, 비활성 정렬 가능 컬럼은
 * 흐린 ⇅ 표시로 정렬 가능함을 알린다. 정렬 불가 컬럼은 일반 {@code <th>} 를 그대로 쓴다.
 */
export function SortableTh({ column, sortBy, sortOrder, onSort, children, style }: SortableThProps) {
  const active = sortBy === column;
  const marker = active ? (sortOrder === 'asc' ? '▲' : '▼') : '⇅';
  return (
    <th
      onClick={() => onSort(column)}
      style={{ cursor: 'pointer', userSelect: 'none', ...style }}
      aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {children}
      <span style={{ marginLeft: '4px', fontSize: '10px', opacity: active ? 1 : 0.3 }}>{marker}</span>
    </th>
  );
}
