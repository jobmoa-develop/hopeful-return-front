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