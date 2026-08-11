import { useEffect, useState } from 'react';
import { getCourseStaffs } from '../api/courses';
import type { CourseStaff } from '../api/courses';

interface CourseChangeNotifyModalProps {
    isOpen: boolean;
    courseId: number;
    onClose: () => void;
    // 저장만 하고 문자는 보내지 않을 때
    onSaveOnly: () => void;
    // 선택된 담당자(userId 목록)에게 문자까지 보내며 저장할 때
    onSaveAndNotify: (userIds: number[]) => void;
    submitting: boolean;
}

// 강좌 수정(교육일·교육시간·휴게시간·교육장 변경) 시, 저장 전에 안내 문자를 보낼지 확인하는 팝업.
// 담당자 목록은 PM(PROJECT_MANAGER)을 자동 제외하고 보여준다.
export function CourseChangeNotifyModal({
    isOpen,
    courseId,
    onClose,
    onSaveOnly,
    onSaveAndNotify,
    submitting,
}: CourseChangeNotifyModalProps) {
    const [staffs, setStaffs] = useState<CourseStaff[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        getCourseStaffs(courseId)
            .then((res) => {
                const list = (res.data.data?.staffs ?? []).filter((s) => s.staffRole !== 'PROJECT_MANAGER');
                setStaffs(list);
                // 기본값: PM을 제외한 담당자 전원 선택
                setSelectedIds(
                    new Set(list.map((s) => s.userId).filter((id): id is number => id != null)),
                );
            })
            .catch(() => {
                setStaffs([]);
                setSelectedIds(new Set());
            })
            .finally(() => setLoading(false));
    }, [isOpen, courseId]);

    if (!isOpen) return null;

    const toggle = (userId: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    return (
        <div
            className="modal-overlay open"
            onClick={(e) => {
                if (e.target === e.currentTarget && !submitting) onClose();
            }}
        >
            <div className="modal">
                <div className="modal-h">
                    <h3>일정/장소 변경 안내 문자 발송</h3>
                    {!submitting && (
                        <button className="x" onClick={onClose}>
                            ✕
                        </button>
                    )}
                </div>
                <div className="modal-b">
                    <p className="muted" style={{ marginBottom: 12 }}>
                        교육일·교육시간·휴게시간·교육장 중 하나 이상이 변경되었습니다. 저장과 함께 담당자에게
                        변경 안내 문자를 보낼지 선택하세요. (PM은 발송 대상에서 자동 제외됩니다)
                    </p>
                    {loading ? (
                        <p className="muted">담당자 목록을 불러오는 중...</p>
                    ) : staffs.length === 0 ? (
                        <p className="muted">문자를 받을 담당자가 없습니다(PM 제외 시 대상 없음).</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {staffs.map((s) => (
                                <label
                                    key={s.userId ?? s.courseStaffId}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={s.userId != null && selectedIds.has(s.userId)}
                                        disabled={s.userId == null}
                                        onChange={() => s.userId != null && toggle(s.userId)}
                                    />
                                    <span>{s.name ?? `담당자 #${s.userId}`}</span>
                                    <span className="muted" style={{ fontSize: 12 }}>
                                        {s.staffRole}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                <div className="modal-f">
                    <button className="btn" onClick={onSaveOnly} disabled={submitting}>
                        저장만 하기 (문자 미발송)
                    </button>
                    <button
                        className="btn primary"
                        onClick={() => onSaveAndNotify(Array.from(selectedIds))}
                        disabled={submitting || selectedIds.size === 0}
                    >
                        {submitting ? '처리 중...' : `저장 + 문자 발송 (${selectedIds.size}명)`}
                    </button>
                </div>
            </div>
        </div>
    );
}