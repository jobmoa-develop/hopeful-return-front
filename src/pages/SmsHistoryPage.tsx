import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounceSearch } from '../hooks/useDebounceSearch';
import { useRole } from '../context/RoleContext';
import { getRegions, groupRegionsByParent } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { RegionSelect } from '../components/RegionSelect';
import type { RegionFilterValue } from '../components/RegionSelect';
import { buildRoundParams, roundInputPlaceholder } from '../utils/roundFilter';
import {
  getSmsHistoryPage,
  getParticipantSmsDetail,
  refreshParticipantSmsStatus,
  getReservationCancelPreview,
  cancelSmsReservation,
} from '../api/participantSms';
import type {
  SmsHistoryPageItem,
  ParticipantSmsDetailItem,
  SmsHistoryParams,
  ReservationCancelPreview,
} from '../api/participantSms';
import { getCourseStaffSmsHistoryPage } from '../api/courseStaffSms';
import type {
  CourseStaffSmsHistoryPageItem,
  CourseStaffSmsHistoryParams,
} from '../api/courseStaffSms';
import { apiErrorMessage } from '../api/apiError';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const EXPORT_PAGE_SIZE = 100;

// 상단 탭: 참여자에게 보낸 문자 / 담당자에게 보낸 안내 문자
type HistoryTarget = 'PARTICIPANT' | 'STAFF';

// 발송 상태 라벨/칩
const STATUS_LABELS: Record<string, string> = {
  SUCCESS: '성공',
  FAIL: '실패',
  PENDING: '대기',
  RESERVED: '예약중',
  CANCELED: '취소됨',
};
function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
function statusChip(status: string): string {
  if (status === 'SUCCESS') return 'ok';
  if (status === 'FAIL') return 'warn';
  if (status === 'RESERVED') return 'info';
  return 'neutral';
}
// 표시 일시: 발송건은 sentAt, 예약(미발송)건은 reserveTime 기준.
function whenLabel(item: { sentAt: string | null; reserveTime: string | null; sendStatus: string }): string {
  if (item.sendStatus === 'RESERVED') {
    return item.reserveTime ? `${fmtDateTime(item.reserveTime)} (예약)` : '예약';
  }
  return fmtDateTime(item.sentAt ?? item.reserveTime);
}
function formatChip(format: string): string {
  if (format === 'MMS') return 'ok';
  if (format === 'LMS') return 'warn';
  return 'info';
}
function fmtDateTime(iso: string | null): string {
  return iso ? iso.replace('T', ' ').slice(0, 16) : '—';
}
function roundLabel(item: SmsHistoryPageItem): string {
  const region = item.regionName ?? '';
  const round = item.courseNumber != null ? `${item.courseNumber}회차` : (item.courseName ?? '');
  return `${region} · ${round}`.replace(/^ · /, '').replace(/ · $/, '') || '—';
}

// 담당자 발송내역용 — 알림 종류 라벨/칩
const STAFF_NOTIFY_TYPE_LABELS: Record<string, string> = {
  STATUS_CHANGE: '상태 변경',
  SCHEDULE_CHANGE: '일정/장소 변경',
  ASSIGN_NEW: '배정',
  ASSIGN_CHANGED: '배정 변동',
  ASSIGN_REMOVED: '배정 제외',
};
function staffNotifyTypeLabel(notifyType?: string): string {
  return notifyType ? STAFF_NOTIFY_TYPE_LABELS[notifyType] ?? notifyType : '-';
}
const STAFF_STATUS_LABELS: Record<string, string> = {
  SUCCESS: '성공',
  FAIL: '실패',
};
function staffStatusLabel(sendStatus?: string): string {
  return sendStatus ? STAFF_STATUS_LABELS[sendStatus] ?? sendStatus : '-';
}
function staffStatusChip(sendStatus?: string): string {
  if (sendStatus === 'SUCCESS') return 'ok';
  if (sendStatus === 'FAIL') return 'warn';
  return 'neutral';
}
function staffRoundLabel(item: CourseStaffSmsHistoryPageItem): string {
  const region = item.regionName ?? '';
  const round = item.courseNumber != null ? `${item.courseNumber}회차` : (item.courseName ?? '');
  return `${region} · ${round}`.replace(/^ · /, '').replace(/ · $/, '') || '—';
}

// CSV 셀 이스케이프(큰따옴표 이중화 + 감싸기)
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export default function SmsHistoryPage() {
  const { roleConfig } = useRole();
  const isAllScope = roleConfig.roles.some((r) => r === 'ADMIN' || r === 'HEAD_OFFICE');

  // 상단 탭: 참여자 / 담당자
  const [target, setTarget] = useState<HistoryTarget>('PARTICIPANT');

  return (
    <section className="view active" id="view-sms-history">
      <div className="perm-bar" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span className="pb-ic">✉</span>
        <span>
          {isAllScope
            ? '전체 발송내역 조회 중 (관리자 / 본사 권한)'
            : '내 발송내역만 조회 중 (지정 권한)'}
        </span>
        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
          <button
            type="button"
            className={`chip ${target === 'PARTICIPANT' ? 'info' : 'neutral'}`}
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => setTarget('PARTICIPANT')}
          >
            참여자에게 보낸 문자
          </button>
          <button
            type="button"
            className={`chip ${target === 'STAFF' ? 'info' : 'neutral'}`}
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => setTarget('STAFF')}
          >
            담당자에게 보낸 안내 문자
          </button>
        </div>
      </div>

      {target === 'PARTICIPANT' ? <ParticipantSmsHistorySection /> : <StaffSmsHistorySection />}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// 참여자에게 보낸 문자 발송내역 — 기존 UI/로직 그대로(변경 없음)
// ────────────────────────────────────────────────────────────
function ParticipantSmsHistorySection() {
  const [items, setItems] = useState<SmsHistoryPageItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keywordInput = useDebounceSearch('', SEARCH_DEBOUNCE_MS);
  const keyword = keywordInput.debouncedValue.trim();
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const regionGroups = useMemo(() => groupRegionsByParent(regions), [regions]);
  // 지역 필터 — 상위(서울)=parentRegionId, 하위(양천)=regionId, 전체={}.
  const [regionFilter, setRegionFilter] = useState<RegionFilterValue>({});
  const [courseNumberQuery, setCourseNumberQuery] = useState('');
  const [courseNumber, setCourseNumber] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState(''); // '' = 전체
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [detail, setDetail] = useState<ParticipantSmsDetailItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 예약 취소 확인 모달 — reserveId 단위 취소라 "함께 취소될 인원"을 먼저 보여준다.
  const [cancelPreview, setCancelPreview] = useState<ReservationCancelPreview | null>(null);
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState(false);
  const [canceling, setCanceling] = useState(false);

  // 현재 필터 조건(페이지 제외) — 목록·CSV 공통
  const buildParams = useCallback(
    (): Omit<SmsHistoryParams, 'page' | 'size'> => ({
      keyword: keyword || undefined,
      sendStatus: statusFilter || undefined,
      regionId: regionFilter.regionId,
      parentRegionId: regionFilter.parentRegionId,
      ...buildRoundParams(regionFilter, courseNumber),
      sentDateFrom: dateFrom || undefined,
      sentDateTo: dateTo || undefined,
    }),
    [
      keyword,
      statusFilter,
      regionFilter.regionId,
      regionFilter.parentRegionId,
      courseNumber,
      dateFrom,
      dateTo,
    ],
  );

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    getSmsHistoryPage({ ...buildParams(), page, size: PAGE_SIZE })
      .then((res) => {
        const data = res.data.data;
        setItems(data?.content ?? []);
        setTotalElements(data?.totalElements ?? 0);
        setTotalPages(data?.totalPages ?? 0);
      })
      .catch((err) => setError(apiErrorMessage(err, '문자 발송 내역을 불러오지 못했습니다.')))
      .finally(() => setLoading(false));
  }, [buildParams, page]);

  // 페이지를 리셋시켜야 하는 필터들을 하나의 키로 묶어서 API 중복 호출 방지
  const filterKey = useMemo(
    () =>
      JSON.stringify([
        keyword,
        statusFilter,
        regionFilter.regionId,
        regionFilter.parentRegionId,
        courseNumber,
        dateFrom,
        dateTo,
      ]),
    [keyword, statusFilter, regionFilter.regionId, regionFilter.parentRegionId, courseNumber, dateFrom, dateTo],
  );
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      if (page !== 0) {
        setPage(0);
        return; // page 변경으로 이 effect가 다시 실행되며 fetchList가 호출됨 (중복 방지)
      }
    }
    fetchList();
  }, [filterKey, page, fetchList]);

  useEffect(() => {
    getRegions()
      .then((res) => setRegions(res.data.data ?? []))
      .catch(() => setRegions([]));
  }, []);

  // 회차번호 디바운스 (page 리셋은 위 filterKey effect가 처리)
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = courseNumberQuery.trim();
      setCourseNumber(trimmed === '' ? '' : Number(trimmed));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [courseNumberQuery]);

  const openDetail = (smsId: number) => {
    setDetailLoading(true);
    setDetail(null);
    getParticipantSmsDetail(smsId)
      .then((res) => setDetail(res.data.data))
      .catch((err) => alert(apiErrorMessage(err, '상세를 불러오지 못했습니다.')))
      .finally(() => setDetailLoading(false));
  };

  // 발송결과 재조회(수동) — SENS 결과조회로 상태·messageId·결과를 갱신하고 목록도 새로고침
  const refreshDetail = async (smsId: number) => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await refreshParticipantSmsStatus(smsId);
      setDetail(res.data.data);
      fetchList();
    } catch (err) {
      alert(apiErrorMessage(err, '발송결과 재조회에 실패했습니다.'));
    } finally {
      setRefreshing(false);
    }
  };

  // 예약 취소 — reserveId 단위. 먼저 프리뷰로 함께 취소될 인원을 확인시킨 뒤 실행.
  const openCancelPreview = (reserveId: string) => {
    setCancelPreviewLoading(true);
    setCancelPreview(null);
    getReservationCancelPreview(reserveId)
      .then((res) => setCancelPreview(res.data.data))
      .catch((err) => alert(apiErrorMessage(err, '예약 취소 대상을 불러오지 못했습니다.')))
      .finally(() => setCancelPreviewLoading(false));
  };

  const confirmCancelReservation = async () => {
    if (!cancelPreview || canceling) return;
    setCanceling(true);
    try {
      const res = await cancelSmsReservation(cancelPreview.reserveId);
      alert(`예약 ${res.data.data ?? 0}건을 취소했습니다.`);
      setCancelPreview(null);
      setDetail(null);
      fetchList();
    } catch (err) {
      alert(apiErrorMessage(err, '예약 취소에 실패했습니다.'));
    } finally {
      setCanceling(false);
    }
  };

  // CSV 내보내기 — 현재 필터로 전 페이지 순회 수집 후 다운로드(UTF-8 BOM)
  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = buildParams();
      const rows: SmsHistoryPageItem[] = [];
      let p = 0;
      let pages = 1;
      do {
        const res = await getSmsHistoryPage({ ...params, page: p, size: EXPORT_PAGE_SIZE });
        const data = res.data.data;
        rows.push(...(data?.content ?? []));
        pages = data?.totalPages ?? 1;
        p += 1;
      } while (p < pages);

      const header = [
        '발송일시', '수신자', '전화', '지역', '회차', '형식', '제목', '본문', '상태', '발송자',
        '메시지ID', '결과코드', '실패사유', '완료시각',
      ];
      const lines = [header.map(csvCell).join(',')];
      for (const r of rows) {
        lines.push(
          [
            fmtDateTime(r.sentAt ?? r.reserveTime),
            r.participantName ?? '',
            r.phone ?? '',
            r.regionName ?? '',
            r.courseNumber ?? '',
            r.messageFormat,
            r.title ?? '',
            r.content ?? '',
            statusLabel(r.sendStatus),
            r.senderName ?? '',
            r.messageId ?? '',
            r.resultCode ?? '',
            r.resultMessage ?? '',
            r.completeTime ? fmtDateTime(r.completeTime) : '',
          ]
            .map(csvCell)
            .join(','),
        );
      }
      const csv = '﻿' + lines.join('\r\n'); // BOM: 엑셀 한글 깨짐 방지
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `문자발송내역_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(apiErrorMessage(err, 'CSV 내보내기에 실패했습니다.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <RegionSelect
            groups={regionGroups}
            value={regionFilter}
            onChange={(v) => {
              setRegionFilter(v);
            }}
            allowParentSelect
            allLabel="전체 지역"
          />
          <div className="searchbox" style={{ width: '110px', padding: '4px 10px' }}>
            <input
              type="number"
              min={1}
              placeholder={roundInputPlaceholder(regionFilter)}
              value={courseNumberQuery}
              onChange={(e) => setCourseNumberQuery(e.target.value)}
              style={{ fontSize: '12px' }}
            />
          </div>
          <div className="select">
            <span className="ico">상태</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
              }}
              style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">전체 ▾</option>
              <option value="SUCCESS">성공</option>
              <option value="FAIL">실패</option>
              <option value="PENDING">대기</option>
              <option value="RESERVED">예약중</option>
              <option value="CANCELED">취소됨</option>
            </select>
          </div>
          <div className="searchbox" style={{ width: '180px', padding: '4px 10px' }}>
            <input
              type="text"
              placeholder="수신자 이름/전화 검색..."
              {...keywordInput.inputProps}
              style={{ fontSize: '12px' }}
            />
          </div>
          <div className="select" title="발송일 기준">
            <span className="ico">발송일</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
              }}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px' }}
            />
            <span className="muted" style={{ fontSize: '12px' }}>
              ~
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
              }}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px' }}
            />
          </div>
        </div>

        <span className="count">
          총 {totalElements}건{loading ? ' · 불러오는 중…' : ''}
        </span>
        <button
          className="btn"
          onClick={exportCsv}
          disabled={exporting || totalElements === 0}
          style={{ marginLeft: '10px' }}
        >
          {exporting ? '내보내는 중…' : '⬇ CSV 내보내기'}
        </button>
      </div>

      {error && (
        <div className="card" style={{ padding: '14px', marginBottom: '12px', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="card">
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>발송일시</th>
                <th>수신자</th>
                <th>지역 / 회차</th>
                <th>형식</th>
                <th>제목 / 본문</th>
                <th>상태</th>
                <th>발송자</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.smsId} onClick={() => openDetail(r.smsId)} style={{ cursor: 'pointer' }}>
                  <td className="tnum" style={{ fontSize: '12px' }}>
                    {whenLabel(r)}
                  </td>
                  <td>
                    <div className="pname">{r.participantName ?? '—'}</div>
                    <div className="cell-sub">{r.phone ?? ''}</div>
                  </td>
                  <td>{roundLabel(r)}</td>
                  <td>
                    <span className={`chip ${formatChip(r.messageFormat)}`}>{r.messageFormat}</span>
                  </td>
                  <td style={{ maxWidth: '360px' }}>
                    {r.title && <div className="pname">{r.title}</div>}
                    <div
                      className="cell-sub"
                      title={r.content}
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '360px' }}
                    >
                      {r.content}
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${statusChip(r.sendStatus)}`}>{statusLabel(r.sendStatus)}</span>
                  </td>
                  <td>{r.senderName ?? '—'}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                    조건에 일치하는 발송 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
          <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            이전
          </button>
          <span className="muted" style={{ fontSize: '12px' }}>
            {page + 1} / {totalPages}
          </span>
          <button className="btn" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            다음
          </button>
        </div>
      )}

      <p className="note">행을 클릭하면 발송 상세(본문·이미지)를 확인할 수 있습니다.</p>

      {(detail || detailLoading) && (
        <div
          className="modal-overlay open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="modal" style={{ width: 'min(560px, 100%)' }}>
            <div className="modal-h">
              <h3>문자 발송 상세</h3>
              <button className="x" onClick={() => setDetail(null)}>
                ✕
              </button>
            </div>
            <div className="modal-b">
              {detailLoading && <p className="muted">불러오는 중…</p>}
              {detail && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`chip ${formatChip(detail.messageFormat)}`}>{detail.messageFormat}</span>
                    <span className={`chip ${statusChip(detail.sendStatus)}`}>{statusLabel(detail.sendStatus)}</span>
                    <span className="muted" style={{ fontSize: '12px' }}>
                      {whenLabel(detail)} · {detail.senderName ?? '—'}
                    </span>
                  </div>
                  {detail.title && (
                    <div>
                      <div className="cell-sub">제목</div>
                      <div className="pname">{detail.title}</div>
                    </div>
                  )}
                  <div>
                    <div className="cell-sub">본문</div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.5 }}>{detail.content}</div>
                  </div>
                  {detail.imageUrls.length > 0 && (
                    <div>
                      <div className="cell-sub">첨부 이미지(MMS · {detail.imageUrls.length}건)</div>
                      <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '12px', color: 'var(--muted)' }}>
                        {detail.imageUrls.map((id, i) => (
                          <li key={i}>{id}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {/* 발송결과(#93): PENDING 은 전달 확인 중, 값이 있을 때만 노출 */}
                  {detail.sendStatus === 'PENDING' && (
                    <p className="muted" style={{ fontSize: '12px' }}>
                      실제 전달 결과 확인 중입니다. ‘재조회’로 최신 상태를 가져올 수 있습니다.
                    </p>
                  )}
                  {detail.messageId && (
                    <div>
                      <div className="cell-sub">메시지 ID</div>
                      <div style={{ fontSize: '12px', wordBreak: 'break-all' }}>{detail.messageId}</div>
                    </div>
                  )}
                  {(detail.resultCode || detail.resultMessage) && (
                    <div>
                      <div className="cell-sub">전달 결과</div>
                      <div style={{ fontSize: '13px', color: detail.sendStatus === 'FAIL' ? 'var(--danger)' : undefined }}>
                        {detail.resultCode ? `[${detail.resultCode}] ` : ''}
                        {detail.resultMessage ?? ''}
                      </div>
                    </div>
                  )}
                  {detail.completeTime && (
                    <div>
                      <div className="cell-sub">완료 시각</div>
                      <div style={{ fontSize: '13px' }}>{fmtDateTime(detail.completeTime)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-f">
              {detail && detail.sendStatus === 'PENDING' && (
                <button className="btn" disabled={refreshing} onClick={() => refreshDetail(detail.smsId)}>
                  {refreshing ? '재조회 중…' : '재조회'}
                </button>
              )}
              {detail && detail.sendStatus === 'RESERVED' && detail.reserveId && (
                <button
                  className="btn danger-btn"
                  disabled={cancelPreviewLoading}
                  onClick={() => openCancelPreview(detail.reserveId as string)}
                >
                  {cancelPreviewLoading ? '확인 중…' : '예약 취소'}
                </button>
              )}
              <button className="btn" onClick={() => setDetail(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelPreview && (
        <div
          className="modal-overlay open"
          onClick={(e) => {
            if (e.target === e.currentTarget && !canceling) setCancelPreview(null);
          }}
        >
          <div className="modal" style={{ width: 'min(460px, 100%)' }}>
            <div className="modal-h">
              <h3>예약 발송 취소</h3>
              <button className="x" onClick={() => !canceling && setCancelPreview(null)}>
                ✕
              </button>
            </div>
            <div className="modal-b">
              <p style={{ fontSize: '14px', lineHeight: 1.6 }}>
                이 예약은 <b>{fmtDateTime(cancelPreview.reserveTime)}</b> 발송 예정입니다.
                <br />
                예약 취소는 <b>예약 묶음(batch) 단위</b>로 이루어져,{' '}
                <b style={{ color: 'var(--danger)' }}>함께 예약된 {cancelPreview.targetCount}명 전원의 발송이 취소</b>됩니다.
              </p>
              {cancelPreview.recipientNames.length > 0 && (
                <div>
                  <div className="cell-sub">함께 취소될 대상</div>
                  <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                    {cancelPreview.recipientNames.join(', ')}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-f">
              <button className="btn" disabled={canceling} onClick={() => setCancelPreview(null)}>
                돌아가기
              </button>
              <button className="btn danger-btn" disabled={canceling} onClick={confirmCancelReservation}>
                {canceling ? '취소 중…' : `${cancelPreview.targetCount}명 예약 취소`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// 담당자(강좌 staff)에게 보낸 안내 문자 발송내역 — 신규
// ────────────────────────────────────────────────────────────
function StaffSmsHistorySection() {
  const [items, setItems] = useState<CourseStaffSmsHistoryPageItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keywordInput = useDebounceSearch('', SEARCH_DEBOUNCE_MS);
  const keyword = keywordInput.debouncedValue.trim();
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const regionGroups = useMemo(() => groupRegionsByParent(regions), [regions]);
  const [regionFilter, setRegionFilter] = useState<RegionFilterValue>({});
  const [courseNumberQuery, setCourseNumberQuery] = useState('');
  const [courseNumber, setCourseNumber] = useState<number | ''>('');
  const [notifyTypeFilter, setNotifyTypeFilter] = useState(''); // '' = 전체
  const [statusFilter, setStatusFilter] = useState(''); // '' = 전체
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  // 행 클릭 상세(참여자 발송내역처럼 상태·본문 확인). 목록 항목이 전 필드를 가져 추가 조회 불필요.
  const [detail, setDetail] = useState<CourseStaffSmsHistoryPageItem | null>(null);

  const buildParams = useCallback(
    (): Omit<CourseStaffSmsHistoryParams, 'page' | 'size'> => ({
      keyword: keyword || undefined,
      notifyType: notifyTypeFilter || undefined,
      sendStatus: statusFilter || undefined,
      regionId: regionFilter.regionId,
      parentRegionId: regionFilter.parentRegionId,
      ...buildRoundParams(regionFilter, courseNumber),
      sentDateFrom: dateFrom || undefined,
      sentDateTo: dateTo || undefined,
    }),
    [
      keyword,
      notifyTypeFilter,
      statusFilter,
      regionFilter.regionId,
      regionFilter.parentRegionId,
      courseNumber,
      dateFrom,
      dateTo,
    ],
  );

  const fetchList = useCallback(() => {
    setLoading(true);
    setError(null);
    getCourseStaffSmsHistoryPage({ ...buildParams(), page, size: PAGE_SIZE })
      .then((res) => {
        const data = res.data.data;
        setItems(data?.content ?? []);
        setTotalElements(data?.totalElements ?? 0);
        setTotalPages(data?.totalPages ?? 0);
      })
      .catch((err) => setError(apiErrorMessage(err, '담당자 발송 내역을 불러오지 못했습니다.')))
      .finally(() => setLoading(false));
  }, [buildParams, page]);

  const filterKey = useMemo(
    () =>
      JSON.stringify([
        keyword,
        notifyTypeFilter,
        statusFilter,
        regionFilter.regionId,
        regionFilter.parentRegionId,
        courseNumber,
        dateFrom,
        dateTo,
      ]),
    [
      keyword,
      notifyTypeFilter,
      statusFilter,
      regionFilter.regionId,
      regionFilter.parentRegionId,
      courseNumber,
      dateFrom,
      dateTo,
    ],
  );
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      if (page !== 0) {
        setPage(0);
        return;
      }
    }
    fetchList();
  }, [filterKey, page, fetchList]);

  useEffect(() => {
    getRegions()
      .then((res) => setRegions(res.data.data ?? []))
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = courseNumberQuery.trim();
      setCourseNumber(trimmed === '' ? '' : Number(trimmed));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [courseNumberQuery]);

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = buildParams();
      const rows: CourseStaffSmsHistoryPageItem[] = [];
      let p = 0;
      let pages = 1;
      do {
        const res = await getCourseStaffSmsHistoryPage({ ...params, page: p, size: EXPORT_PAGE_SIZE });
        const data = res.data.data;
        rows.push(...(data?.content ?? []));
        pages = data?.totalPages ?? 1;
        p += 1;
      } while (p < pages);

      const header = ['발송일시', '수신담당자', '전화', '지역', '회차', '종류', '내용', '상태', '발송자'];
      const lines = [header.map(csvCell).join(',')];
      for (const r of rows) {
        lines.push(
          [
            fmtDateTime(r.sentAt ?? null),
            r.userName ?? '',
            r.userPhone ?? '',
            r.regionName ?? '',
            r.courseNumber ?? '',
            staffNotifyTypeLabel(r.notifyType),
            r.content ?? '',
            staffStatusLabel(r.sendStatus),
            r.sentByName ?? (r.sentBy ? `#${r.sentBy}` : '시스템'),
          ]
            .map(csvCell)
            .join(','),
        );
      }
      const csv = '﻿' + lines.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `담당자문자발송내역_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(apiErrorMessage(err, 'CSV 내보내기에 실패했습니다.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <RegionSelect
            groups={regionGroups}
            value={regionFilter}
            onChange={(v) => setRegionFilter(v)}
            allowParentSelect
            allLabel="전체 지역"
          />
          <div className="searchbox" style={{ width: '110px', padding: '4px 10px' }}>
            <input
              type="number"
              min={1}
              placeholder={roundInputPlaceholder(regionFilter)}
              value={courseNumberQuery}
              onChange={(e) => setCourseNumberQuery(e.target.value)}
              style={{ fontSize: '12px' }}
            />
          </div>
          <div className="select">
            <span className="ico">종류</span>
            <select
              value={notifyTypeFilter}
              onChange={(e) => setNotifyTypeFilter(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">전체 ▾</option>
              <option value="ASSIGN_NEW">배정</option>
              <option value="ASSIGN_CHANGED">배정 변동</option>
              <option value="ASSIGN_REMOVED">배정 제외</option>
              <option value="STATUS_CHANGE">상태 변경</option>
              <option value="SCHEDULE_CHANGE">일정/장소 변경</option>
            </select>
          </div>
          <div className="select">
            <span className="ico">상태</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">전체 ▾</option>
              <option value="SUCCESS">성공</option>
              <option value="FAIL">실패</option>
            </select>
          </div>
          <div className="searchbox" style={{ width: '180px', padding: '4px 10px' }}>
            <input
              type="text"
              placeholder="담당자 이름/전화 검색..."
              {...keywordInput.inputProps}
              style={{ fontSize: '12px' }}
            />
          </div>
          <div className="select" title="발송일 기준">
            <span className="ico">발송일</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px' }}
            />
            <span className="muted" style={{ fontSize: '12px' }}>
              ~
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px' }}
            />
          </div>
        </div>

        <span className="count">
          총 {totalElements}건{loading ? ' · 불러오는 중…' : ''}
        </span>
        <button
          className="btn"
          onClick={exportCsv}
          disabled={exporting || totalElements === 0}
          style={{ marginLeft: '10px' }}
        >
          {exporting ? '내보내는 중…' : '⬇ CSV 내보내기'}
        </button>
      </div>

      {error && (
        <div className="card" style={{ padding: '14px', marginBottom: '12px', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="card">
        <div className="tbl-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>발송일시</th>
                <th>수신 담당자</th>
                <th>지역 / 회차</th>
                <th>종류</th>
                <th>내용</th>
                <th>상태</th>
                <th>발송자</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.courseStaffSmsId} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}>
                  <td className="tnum" style={{ fontSize: '12px' }}>
                    {fmtDateTime(r.sentAt ?? null)}
                  </td>
                  <td>
                    <div className="pname">{r.userName ?? `담당자 #${r.userId}`}</div>
                    <div className="cell-sub">{r.userPhone ?? ''}</div>
                  </td>
                  <td>{staffRoundLabel(r)}</td>
                  <td>
                    <span className="chip info">{staffNotifyTypeLabel(r.notifyType)}</span>
                  </td>
                  <td style={{ maxWidth: '360px' }}>
                    <div
                      className="cell-sub"
                      title={r.content}
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '360px' }}
                    >
                      {r.content}
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${staffStatusChip(r.sendStatus)}`}>{staffStatusLabel(r.sendStatus)}</span>
                  </td>
                  <td>{r.sentByName ?? (r.sentBy ? `#${r.sentBy}` : '시스템')}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                    조건에 일치하는 발송 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
          <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            이전
          </button>
          <span className="muted" style={{ fontSize: '12px' }}>
            {page + 1} / {totalPages}
          </span>
          <button className="btn" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            다음
          </button>
        </div>
      )}

      <p className="note">
        행을 클릭하면 발송 상세(내용·상태)를 확인할 수 있습니다. 인력 배정/변동/제외 및 강좌 상태·일정 변경 시 담당자에게 보낸 안내 문자 내역입니다.
      </p>

      {detail && (
        <div
          className="modal-overlay open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="modal" style={{ width: 'min(520px, 100%)' }}>
            <div className="modal-h">
              <h3>담당자 문자 발송 상세</h3>
              <button className="x" onClick={() => setDetail(null)}>
                ✕
              </button>
            </div>
            <div className="modal-b">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="chip info">{staffNotifyTypeLabel(detail.notifyType)}</span>
                  <span className={`chip ${staffStatusChip(detail.sendStatus)}`}>
                    {staffStatusLabel(detail.sendStatus)}
                  </span>
                  <span className="muted" style={{ fontSize: '12px' }}>
                    {fmtDateTime(detail.sentAt ?? null)} ·{' '}
                    {detail.sentByName ?? (detail.sentBy ? `#${detail.sentBy}` : '시스템')}
                  </span>
                </div>
                <div>
                  <div className="cell-sub">수신 담당자</div>
                  <div className="pname">{detail.userName ?? `담당자 #${detail.userId}`}</div>
                  <div className="cell-sub">{detail.userPhone ?? ''}</div>
                </div>
                <div>
                  <div className="cell-sub">지역 / 회차</div>
                  <div style={{ fontSize: '13px' }}>{staffRoundLabel(detail)}</div>
                </div>
                <div>
                  <div className="cell-sub">본문</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.5 }}>
                    {detail.content}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-f">
              <button className="btn" onClick={() => setDetail(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}