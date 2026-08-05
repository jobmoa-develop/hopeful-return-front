import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import { logout as requestLogout } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';

// 한국시간(KST) 실시간 시계 — 1초마다 갱신
function KstClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const text = now.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return (
    <div
      className="kst-clock"
      title="한국시간(KST)"
      style={{
        fontSize: '12.5px',
        color: 'var(--muted)',
        fontVariantNumeric: 'tabular-nums',
        marginRight: '12px',
        whiteSpace: 'nowrap',
      }}
    >
      🕒 {text} (KST)
    </div>
  );
}

const PAGE_META = [
  { match: (path: string) => path === '/', crumb: '운영', title: '대시보드' },
  { match: (path: string) => path === '/participants', crumb: '운영', title: '참여자 관리' },
  { match: (path: string) => path === '/mypage', crumb: '내 계정', title: '마이페이지' },
  {
    match: (path: string) => path === '/participants/sms-history',
    crumb: '운영 · 참여자',
    title: '문자 발송 내역',
  },
  {
    match: (path: string) => path.startsWith('/participants/'),
    crumb: '운영 · 참여자',
    title: '참여자 상세',
  },
  { match: (path: string) => path === '/rounds', crumb: '운영', title: '회차 · 일정' },
  {
    match: (path: string) => path.startsWith('/rounds/'),
    crumb: '운영 · 회차',
    title: '회차 상세',
  },
  { match: (path: string) => path === '/calendar', crumb: '운영', title: '강의 일정' },
  { match: (path: string) => path === '/assign', crumb: '단계 관리', title: '인력 배정' },
  { match: (path: string) => path === '/consulting', crumb: '단계 관리', title: '상담 관리' },
  { match: (path: string) => path === '/attendance', crumb: '단계 관리', title: '출결 · 현장' },
  { match: (path: string) => path === '/follow-up', crumb: '관리', title: '사후관리' },
  { match: (path: string) => path === '/users', crumb: '관리', title: '직원 관리' },
  { match: (path: string) => path === '/users/sms-permission', crumb: '관리', title: '문자 권한 관리' },
];

export default function Layout() {
  const { logout, user } = useAuth();
  const { roleConfig } = useRole();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const getPageTitleAndCrumb = () => {
    return PAGE_META.find((meta) => meta.match(location.pathname)) ?? PAGE_META[0];
  };

  const { crumb, title } = getPageTitleAndCrumb();

  const isNavActive = (view: string) => {
    const path = location.pathname;
    if (view === 'dashboard' && path === '/') return true;
    if (view === 'participants' && path.startsWith('/participants') && path !== '/participants/sms-history')
      return true;
    if (view === 'smsHistory' && path === '/participants/sms-history') return true;
    if (view === 'rounds' && path.startsWith('/rounds')) return true;
    if (view === 'calendar' && path === '/calendar') return true;
    if (view === 'assign' && path === '/assign') return true;
    if (view === 'consulting' && path === '/consulting') return true;
    if (view === 'counselingSchedule' && path === '/counseling-schedule') return true;
    if (view === 'attendance' && path === '/attendance') return true;
    if (view === 'followUp' && path.startsWith('/follow-up')) return true;
    if (view === 'userManagement' && path === '/users') return true;
    if (view === 'smsPermission' && path === '/users/sms-permission') return true;
    if (view === 'mypage' && path === '/mypage') return true;
    return false;
  };

  const showOperationGroup = ['dashboard', 'participants', 'rounds', 'calendar'].some((menu) =>
    roleConfig.menu.includes(menu),
  );
  const showStepGroup = ['assign', 'consulting', 'counselingSchedule', 'attendance'].some((menu) =>
    roleConfig.menu.includes(menu),
  );
  const showAdminGroup = ['followUp', 'userManagement'].some((menu) =>
    roleConfig.menu.includes(menu),
  ) || roleConfig.roles.some((r) => r === 'ADMIN' || r === 'HEAD_OFFICE');
  const userInitial = roleConfig.nm.charAt(0) || roleConfig.role.charAt(0);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await requestLogout();
    } catch {
      // Server logout can fail, but the client must always leave the session.
    } finally {
      logout();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="app">
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`} id="sidebar">
        <div className="brand">
          <div className="mark">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 14a7 7 0 1 1 2.5 5.3"
                stroke="#fff"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d="M5 9v5h5"
                stroke="#9ec3e6"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div className="name">희망리턴패키지</div>
            <div className="sub">통합관리시스템</div>
          </div>
        </div>

        <nav className="nav">
          {showOperationGroup && <div className="nav-group">운영</div>}
          {roleConfig.menu.includes('dashboard') && (
            <Link
              to="/"
              className={`nav-item ${isNavActive('dashboard') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">📊</span>대시보드
            </Link>
          )}
          {roleConfig.menu.includes('participants') && (
            <Link
              to="/participants"
              className={`nav-item ${isNavActive('participants') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">👤</span>참여자 관리
            </Link>
          )}
          {roleConfig.menu.includes('participants')
            && (user?.canSendSms || roleConfig.roles.includes('ADMIN')) && (
            <Link
              to="/participants/sms-history"
              className={`nav-item ${isNavActive('smsHistory') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">✉</span>문자 발송 내역
            </Link>
          )}
          {roleConfig.menu.includes('rounds') && (
            <Link
              to="/rounds"
              className={`nav-item ${isNavActive('rounds') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">📅</span>회차 · 일정
            </Link>
          )}
          {roleConfig.menu.includes('calendar') && (
            <Link
              to="/calendar"
              className={`nav-item ${isNavActive('calendar') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">🗓️</span>강의 일정
            </Link>
          )}

          {showStepGroup && <div className="nav-group">단계 관리</div>}
          {roleConfig.menu.includes('assign') && (
            <Link
              to="/assign"
              className={`nav-item ${isNavActive('assign') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">🧩</span>인력 배정
            </Link>
          )}
          {roleConfig.menu.includes('consulting') && (
            <Link
              to="/consulting"
              className={`nav-item ${isNavActive('consulting') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">💬</span>상담 관리
            </Link>
          )}
          {roleConfig.menu.includes('counselingSchedule') && (
            <Link
              to="/counseling-schedule"
              className={`nav-item ${isNavActive('counselingSchedule') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">🗓️</span>상담사 캘린더
            </Link>
          )}
          {roleConfig.menu.includes('attendance') && (
            <Link
              to="/attendance"
              className={`nav-item ${isNavActive('attendance') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">✅</span>출결 · 현장
            </Link>
          )}

          {showAdminGroup && <div className="nav-group">관리</div>}
          {roleConfig.menu.includes('followUp') && (
            <Link
              to="/follow-up"
              className={`nav-item ${isNavActive('followUp') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">🔄</span>사후관리
            </Link>
          )}
          {roleConfig.menu.includes('userManagement') && (
            <Link
              to="/users"
              className={`nav-item ${isNavActive('userManagement') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">👥</span>사용자 관리
            </Link>
          )}
          {roleConfig.roles.some((r) => r === 'ADMIN' || r === 'HEAD_OFFICE') && (
            <Link
              to="/users/sms-permission"
              className={`nav-item ${isNavActive('smsPermission') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">💬</span>문자 권한 관리
            </Link>
          )}

          <div className="nav-group">내 계정</div>
          <Link
            to="/mypage"
            className={`nav-item ${isNavActive('mypage') ? 'active' : ''}`}
            onClick={() => setIsSidebarOpen(false)}
          >
            <span className="ic">🙍</span>마이페이지
          </Link>
        </nav>

        <div className="sidebar-foot">디자인 시안 v0.2 · 데이터 가상</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            ☰
          </button>
          <div>
            <div className="crumb" id="crumb">
              {crumb}
            </div>
            <h1 id="page-title">{title}</h1>
          </div>
          <div className="spacer"></div>

          <KstClock />

          <Link to="/mypage" className="user" style={{ cursor: 'pointer' }}>
            <div className="avatar" id="u-avatar">
              {userInitial}
            </div>
            <div>
              <div className="u-name" id="u-name">
                {roleConfig.nm}
              </div>
              <div className="u-role" id="u-role">
                {roleConfig.roles.join(' · ')}
              </div>
            </div>
          </Link>
          <button className="btn" type="button" onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
          </button>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}