import { useMemo } from 'react';
import { groupRegionsByParent } from '../api/regions';
import type { RegionSummary } from '../api/regions';

// 지역 필터 값 — 상위(서울) 선택 시 parentRegionId, 하위(양천) 선택 시 regionId.
// 둘 다 없으면 전체. 서버는 parentRegionId 를 받으면 산하 하위 지역 전체로 확장 조회한다.
export type RegionFilterValue = { regionId?: number; parentRegionId?: number };

interface RegionFilterSelectProps {
  regions: RegionSummary[];
  value: RegionFilterValue;
  onChange: (value: RegionFilterValue) => void;
}

// select 문자열 값 인코딩: 상위 = "p:ID", 하위 = "r:ID", 전체 = "".
function encode(value: RegionFilterValue): string {
  if (value.parentRegionId != null) return `p:${value.parentRegionId}`;
  if (value.regionId != null) return `r:${value.regionId}`;
  return '';
}

function decode(raw: string): RegionFilterValue {
  if (raw.startsWith('p:')) return { parentRegionId: Number(raw.slice(2)) };
  if (raw.startsWith('r:')) return { regionId: Number(raw.slice(2)) };
  return {};
}

const SELECT_STYLE: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontWeight: 'inherit',
  outline: 'none',
  cursor: 'pointer',
};

/**
 * 참여자관리·문자내역 공용 지역 필터.
 * 상위 지역(서울)은 "○○ 전체"로 선택 가능(=산하 회차 전체), 하위 지역(양천)은 개별 선택.
 */
export function RegionFilterSelect({ regions, value, onChange }: RegionFilterSelectProps) {
  const groups = useMemo(() => groupRegionsByParent(regions), [regions]);

  return (
    <div className="select">
      <span className="ico">지역</span>
      <select
        value={encode(value)}
        onChange={(e) => onChange(decode(e.target.value))}
        style={SELECT_STYLE}
      >
        <option value="">전체 ▾</option>
        {groups.map((g) => (
          <optgroup key={g.parent.regionId} label={g.parent.regionName}>
            <option value={`p:${g.parent.regionId}`}>{g.parent.regionName} 전체</option>
            {g.children.map((c) => (
              <option key={c.regionId} value={`r:${c.regionId}`}>
                {c.regionName}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
