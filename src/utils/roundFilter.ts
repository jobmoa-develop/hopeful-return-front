import type { RegionFilterValue } from '../components/RegionSelect';

// 회차 번호 입력의 의미를 지역 선택 상태에 연동한다.
// - 전체 지역(regionId·parentRegionId 모두 없음) → 전체회차(courseNumber, 기수)로 검색
// - 상위지역 '전체'(parentRegionId) 또는 하위지역(regionId) 선택 → 지역회차(localCourseNumber)로 검색
// FE 는 상황에 맞는 한쪽만 전송하고, BE 는 전달된 값만 exact match 로 적용한다.
export type RoundFilterParams = { courseNumber?: number; localCourseNumber?: number };

export function isRegionSelected(region: RegionFilterValue): boolean {
  return region.regionId != null || region.parentRegionId != null;
}

/**
 * 지역 선택 상태에 따라 회차 입력값을 전체회차/지역회차 파라미터로 분기한다.
 * 빈 입력·숫자 아님이면 회차 필터 없음({})을 반환한다.
 */
export function buildRoundParams(
  region: RegionFilterValue,
  roundInput: number | string,
): RoundFilterParams {
  const raw = typeof roundInput === 'string' ? roundInput.trim() : roundInput;
  if (raw === '' || raw == null) {
    return {};
  }
  const value = Number(raw);
  // 회차 번호는 1 이상의 정수만 유효 — 0·음수·NaN 은 필터 미적용 처리.
  if (!Number.isInteger(value) || value < 1) {
    return {};
  }
  return isRegionSelected(region) ? { localCourseNumber: value } : { courseNumber: value };
}

/** 회차 입력 placeholder/label — 지역 선택 시 '지역회차', 미선택 시 '전체회차'. */
export function roundInputPlaceholder(region: RegionFilterValue): string {
  return isRegionSelected(region) ? '지역회차' : '전체회차';
}
