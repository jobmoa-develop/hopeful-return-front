import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { logout as requestLogout } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';

const PAGE_META = [
  { match: (path: string) => path === '/', crumb: '운영', title: '대시보드' },
  { match: (path: string) => path === '/participants', crumb: '운영', title: '참여자 관리' },
  { match: (path: string) => path.startsWith('/participants/'), crumb: '운영 · 참여자', title: '참여자 상세' },
  { match: (path: string) => path === '/rounds', crumb: '운영', title: '회차 · 일정' },
  { match: (path: string) => path.startsWith('/rounds/'), crumb: '운영 · 회차', title: '회차 상세' },
  { match: (path: string) => path === '/calendar', crumb: '운영', title: '강의 일정' },
  { match: (path: string) => path === '/assign', crumb: '단계 관리', title: '인력 배정' },
  { match: (path: string) => path === '/consulting', crumb: '단계 관리', title: '사전상담' },
  { match: (path: string) => path === '/attendance', crumb: '단계 관리', title: '출결 · 현장' },
];

export default function Layout() {
  const { logout } = useAuth();
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
    if (view === 'participants' && path.startsWith('/participants')) return true;
    if (view === 'rounds' && path.startsWith('/rounds')) return true;
    if (view === 'calendar' && path === '/calendar') return true;
    if (view === 'assign' && path === '/assign') return true;
    if (view === 'consulting' && path === '/consulting') return true;
    if (view === 'attendance' && path === '/attendance') return true;
    return false;
  };

  const showOperationGroup = ['dashboard', 'participants', 'rounds', 'calendar'].some((menu) => roleConfig.menu.includes(menu));
  const showStepGroup = ['assign', 'consulting', 'attendance'].some((menu) => roleConfig.menu.includes(menu));
  const showAdminGroup = ['followUp', 'userManagement'].some((menu) => roleConfig.menu.includes(menu));
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
              <path d="M5 14a7 7 0 1 1 2.5 5.3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M5 9v5h5" stroke="#9ec3e6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
            <Link to="/" className={`nav-item ${isNavActive('dashboard') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
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
          {roleConfig.menu.includes('rounds') && (
            <Link to="/rounds" className={`nav-item ${isNavActive('rounds') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
              <span className="ic">📅</span>회차 · 일정
            </Link>
          )}
          {roleConfig.menu.includes('calendar') && (
            <Link to="/calendar" className={`nav-item ${isNavActive('calendar') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
              <span className="ic">🗓️</span>강의 일정
            </Link>
          )}

          {showStepGroup && <div className="nav-group">단계 관리</div>}
          {roleConfig.menu.includes('assign') && (
            <Link to="/assign" className={`nav-item ${isNavActive('assign') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
              <span className="ic">🧩</span>인력 배정
            </Link>
          )}
          {roleConfig.menu.includes('consulting') && (
            <Link
              to="/consulting"
              className={`nav-item ${isNavActive('consulting') ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span className="ic">💬</span>사전상담
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
            <div className="nav-item soon">
              <span className="ic">🔄</span>사후관리<span className="tag">준비중</span>
            </div>
          )}
          {roleConfig.menu.includes('userManagement') && (
            <div className="nav-item soon">
              <span className="ic">👥</span>사용자 관리<span className="tag">준비중</span>
            </div>
          )}
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

          <div className="user">
            <div className="avatar" id="u-avatar">
              {userInitial}
            </div>
            <div>
              <div className="u-name" id="u-name">
                {roleConfig.nm}
              </div>
              <div className="u-role" id="u-role">
                {roleConfig.role}
              </div>
            </div>
          </div>
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