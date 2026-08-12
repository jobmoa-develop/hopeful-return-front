import { useState } from 'react';

export type SortOrder = 'asc' | 'desc';

/**
 * 리스트 페이지의 서버사이드 컬럼 정렬 상태를 관리하는 공용 훅.
 *
 * - `toggle(column)`: 다른 컬럼이면 오름차순으로 새로 지정, 같은 컬럼이면 asc↔desc 토글.
 * - `params`: 서버 전달용 `{ sortBy, sortOrder }`. 정렬 미지정 시 빈 객체라 쿼리 파라미터가 생략된다.
 *
 * 정렬 변경 시 page 0 리셋은 각 페이지에서 `sortBy`/`sortOrder` 를 filterKey(또는 재조회 핸들러)에
 * 포함해 처리한다(기존 중복호출 방지 패턴 재사용).
 */
export function useTableSort(defaultBy = '', defaultOrder: SortOrder = 'asc') {
  const [sortBy, setSortBy] = useState(defaultBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultOrder);

  const toggle = (column: string) => {
    if (sortBy !== column) {
      setSortBy(column);
      setSortOrder('asc');
    } else {
      setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
    }
  };

  const params: { sortBy?: string; sortOrder?: SortOrder } = sortBy ? { sortBy, sortOrder } : {};

  return { sortBy, sortOrder, toggle, params };
}
