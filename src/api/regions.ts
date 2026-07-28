import { apiClient } from './client';
import type { ApiResponse } from './courses';

// 백엔드 RegionEntity.level(enum): METROPOLITAN -> "LEVEL1", OPERATION -> "LEVEL2"
export type RegionLevel = 'LEVEL1' | 'LEVEL2' | string;

// GET /api/regions 응답 항목 - RegionListResponse(regionId, regionName, level, parentRegionId)와 동일
export type RegionSummary = {
    regionId: number;
    regionName: string;
    level: RegionLevel;
    parentRegionId: number | null;
};

// GET /api/regions/{regionId} 응답 - RegionDetailResponse와 동일
export type RegionDetail = RegionSummary & {
    parentRegionName: string | null;
    createdAt: string;
    updatedAt: string;
};

// GET /api/regions - 권한: ADMIN, HEAD_OFFICE, REGIONAL_MANAGER, OPERATOR
export function getRegions() {
    return apiClient.get<ApiResponse<RegionSummary[]>>('/api/regions');
}

// GET /api/regions/{regionId} - 권한: ADMIN, HEAD_OFFICE
export function getRegion(regionId: number) {
    return apiClient.get<ApiResponse<RegionDetail>>(`/api/regions/${regionId}`);
}

// ── 지역 계층 그룹핑(프론트 전용) ──────────────────────────────────────────
// course/course_participant 는 항상 하위(LEVEL2, OPERATION) 지역에만 직접 연결되고
// 상위(LEVEL1, METROPOLITAN) 지역에는 데이터가 붙지 않는다(집계는 백엔드 미지원 범위).
// 그래서 드롭다운에서 상위 지역은 <optgroup> 라벨(선택 불가)로만 보여주고,
// 실제로 선택 가능한 값은 하위 지역만 노출한다.
export type RegionGroup = {
    parent: RegionSummary;
    children: RegionSummary[];
};

export function groupRegionsByParent(regions: RegionSummary[]): RegionGroup[] {
    const parents = regions.filter((r) => r.parentRegionId == null);
    const childrenByParent = new Map<number, RegionSummary[]>();
    regions
        .filter((r) => r.parentRegionId != null)
        .forEach((r) => {
            const key = r.parentRegionId as number;
            const list = childrenByParent.get(key) ?? [];
            list.push(r);
            childrenByParent.set(key, list);
        });
    return parents
        .map((parent) => ({
            parent,
            children: childrenByParent.get(parent.regionId) ?? [],
        }))
        // 하위 지역이 없는 상위 지역은 선택할 항목이 없으므로 드롭다운에서 제외
        .filter((group) => group.children.length > 0);
}