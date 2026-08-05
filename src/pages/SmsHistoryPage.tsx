import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRole } from '../context/RoleContext';
import { getRegions, groupRegionsByParent } from '../api/regions';
import type { RegionSummary } from '../api/regions';
import { RegionSelect } from '../components/RegionSelect';
import type { RegionFilterValue } from '../components/RegionSelect';
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
import { apiErrorMessage } from '../api/apiError';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const EXPORT_PAGE_SIZE = 100;

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

// CSV 셀 이스케이프(큰따옴표 이중화 + 감싸기)
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export default function SmsHistoryPage() {
  const { roleConfig } = useRole();
  const isAllScope = roleConfig.roles.some((r) => r === 'ADMIN' || r === 'HEAD_OFFICE');

  const [items, setItems] = useState<SmsHistoryPageItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [keyword, setKeyword] = useState('');
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
      courseNumber: courseNumber === '' ? undefined : courseNumber,
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

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    getRegions()
      .then((res) => setRegions(res.data.data ?? []))
      .catch(() => setRegions([]));
  }, []);

  // 검색어 디바운스
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(searchQuery.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 회차번호 디바운스
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = courseNumberQuery.trim();
      setCourseNumber(trimmed === '' ? '' : Number(trimmed));
      setPage(0);
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
    <section className="view active" id="view-sms-history">
      <div className="perm-bar">
        <span className="pb-ic">✉</span>
        <span>
          {isAllScope
            ? '전체 발송내역 조회 중 (관리자 / 본사 권한)'
            : '내 발송내역만 조회 중 (지정 권한)'}
        </span>
      </div>

      <div className="filters">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <RegionSelect
            groups={regionGroups}
            value={regionFilter}
            onChange={(v) => {
              setRegionFilter(v);
              setPage(0);
            }}
            allowParentSelect
            allLabel="전체 지역"
          />
          <div className="searchbox" style={{ width: '110px', padding: '4px 10px' }}>
            <input
              type="number"
              min={1}
              placeholder="회차번호"
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
                setPage(0);
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
                setPage(0);
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
                setPage(0);
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
    </section>
  );
}
