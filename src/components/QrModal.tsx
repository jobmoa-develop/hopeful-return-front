import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: number;
  courseName?: string;
  regionName?: string;
}

// 회차별 공개 입·퇴실 QR을 표시하고 PNG로 내려받는 경량 모달.
// 저장 액션이 없으므로 BaseModal(저장/취소 푸터 고정) 대신 modal CSS 클래스만 재사용한다.
export default function QrModal({
  isOpen,
  onClose,
  courseId,
  courseName,
  regionName,
}: QrModalProps) {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // 배포된 FE origin 기준으로 인코딩 — RoundsPage가 열린 origin이 곧 참여자 접속 origin이다.
  const qrValue = `${window.location.origin}/qr/${courseId}`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      setCopied(false);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownload = () => {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qr-course-${courseId}.png`;
    link.click();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(qrValue);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: '360px' }}>
        <div className="modal-h">
          <h3>입·퇴실 QR</h3>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-b" style={{ textAlign: 'center' }}>
          {(courseName || regionName) && (
            <p className="muted" style={{ fontSize: '13px', marginBottom: '14px' }}>
              {[regionName, courseName].filter(Boolean).join(' · ')}
            </p>
          )}
          <div
            ref={canvasWrapRef}
            style={{
              display: 'inline-flex',
              padding: '12px',
              background: '#fff',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <QRCodeCanvas value={qrValue} size={220} level="M" marginSize={2} />
          </div>
          <p
            className="muted"
            style={{ fontSize: '12px', marginTop: '12px', wordBreak: 'break-all' }}
          >
            {qrValue}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
            <button className="btn" type="button" onClick={handleCopyLink}>
              {copied ? '복사됨 ✓' : '링크 복사'}
            </button>
            <button className="btn primary" type="button" onClick={handleDownload}>
              이미지 다운로드
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
