import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import type { RoleKey } from '../context/RoleContext';

export default function Layout() {
  const { roleKey, roleConfig, setRoleKey } = useRole();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Check if current route is allowed for the active role.
  // Redirect to dashboard (/) if not.
  useEffect(() => {
    const path = location.pathname;
    let requiredMenu: string | null = null;
    
    if (path === '/') requiredMenu = 'dashboard';
    else if (path.startsWith('/participants')) requiredMenu = 'participants';
    else if (path.startsWith('/rounds')) requiredMenu = 'rounds';
    else if (path.startsWith('/assign')) requiredMenu = 'assign';
    else if (path.startsWith('/consulting')) requiredMenu = 'consulting';
    else if (path.startsWith('/attendance')) requiredMenu = 'attendance';

    if (requiredMenu && !roleConfig.menu.includes(requiredMenu)) {
      navigate('/');
    }
  }, [roleKey, location.pathname, roleConfig.menu, navigate]);

  // Determine Title & Breadcrumb based on URL path
  const getPageTitleAndCrumb = () => {
    const path = location.pathname;
    if (path === '/') return { crumb: "운영", title: "대시보드" };
    if (path === '/participants') return { crumb: "운영", title: "참여자 관리" };
    if (path.startsWith('/participants/')) return { crumb: "운영 › 참여자", title: "참여자 상세" };
    if (path === '/rounds') return { crumb: "운영", title: "회차 · 일정" };
    if (path.startsWith('/rounds/')) return { crumb: "운영 › 회차", title: "회차 상세" };
    if (path === '/assign') return { crumb: "단계 관리", title: "인력 배정" };
    if (path === '/consulting') return { crumb: "단계 관리", title: "사전상담" };
    if (path === '/attendance') return { crumb: "단계 관리", title: "출결 · 현장" };
    return { crumb: "운영", title: "대시보드" };
  };

  const { crumb, title } = getPageTitleAndCrumb();

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRoleKey(e.target.value as RoleKey);
  };

  // Helper to determine if a nav menu item should be active
  const isNavActive = (view: string) => {
    const path = location.pathname;
    if (view === 'dashboard' && path === '/') return true;
    if (view === 'participants' && path.startsWith('/participants')) return true;
    if (view === 'rounds' && path.startsWith('/rounds')) return true;
    if (view === 'assign' && path === '/assign') return true;
    if (view === 'consulting' && path === '/consulting') return true;
    if (view === 'attendance' && path === '/attendance') return true;
    return false;
  };

  // Determine visibility of groups
  const showGroup1 = ['dashboard', 'participants', 'rounds'].some(m => roleConfig.menu.includes(m));
  const showGroup2 = ['assign', 'consulting', 'attendance'].some(m => roleConfig.menu.includes(m));
  const showGroup3 = roleConfig.mode === 'admin'; // admin only has 사후관리 soon tag

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`} id="sidebar">
        <div className="brand">
          <div className="mark">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5 14a7 7 0 1 1 2.5 5.3" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
              <path d="M5 9v5h5" stroke="#9ec3e6" stroke-width="2.2" stroke-linecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="name">희망리턴패키지</div>
            <div className="sub">통합관리시스템</div>
          </div>
        </div>
        
        <nav className="nav">
          {showGroup1 && <div className="nav-group">운영</div>}
          {roleConfig.menu.includes('dashboard') && (
            <Link to="/" className={`nav-item ${isNavActive('dashboard') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
              <span className="ic">📊</span>대시보드
            </Link>
          )}
          {roleConfig.menu.includes('participants') && (
            <Link to="/participants" className={`nav-item ${isNavActive('participants') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
              <span className="ic">👤</span>참여자 관리
            </Link>
          )}
          {roleConfig.menu.includes('rounds') && (
            <Link to="/rounds" className={`nav-item ${isNavActive('rounds') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
              <span className="ic">📅</span>회차 · 일정
            </Link>
          )}

          {showGroup2 && <div className="nav-group">단계 관리</div>}
          {roleConfig.menu.includes('assign') && (
            <Link to="/assign" className={`nav-item ${isNavActive('assign') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
              <span className="ic">🧩</span>인력 배정
            </Link>
          )}
          {roleConfig.menu.includes('consulting') && (
            <Link to="/consulting" className={`nav-item ${isNavActive('consulting') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
              <span className="ic">💬</span>사전상담
            </Link>
          )}
          {roleConfig.menu.includes('attendance') && (
            <Link to="/attendance" className={`nav-item ${isNavActive('attendance') ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
              <span className="ic">✅</span>출결 · 현장
            </Link>
          )}
          {roleConfig.mode === 'admin' && (
            <div className="nav-item soon hide-on-field">
              <span className="ic">💳</span>수료 · 수당 · 예산<span className="tag">2차</span>
            </div>
          )}

          {showGroup3 && (
            <>
              <div className="nav-group">사후</div>
              <div className="nav-item soon">
                <span className="ic">🔄</span>사후관리 · 국취<span className="tag">3차</span>
              </div>
            </>
          )}
        </nav>
        
        <div className="sidebar-foot">디자인 시안 v0.2 · 데이터 가상</div>
      </aside>

      {/* Main Container */}
      <div className="main">
        {/* Topbar */}
        <header className="topbar">
          <button className="menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>☰</button>
          <div>
            <div className="crumb" id="crumb">{crumb}</div>
            <h1 id="page-title">{title}</h1>
          </div>
          <div className="spacer"></div>
          
          <div className="role-switch">
            <label>화면 미리보기</label>
            <select id="role-switch" value={roleKey} onChange={handleRoleChange}>
              <option value="pl">PL (이인철)</option>
              <option value="region">지역담당자 (이빛나라)</option>
              <option value="han">한준희 주임</option>
              <option value="counselor">상담사 (김상담)</option>
              <option value="facil">진행자 (이진행)</option>
              <option value="teacher">강사 (심영수)</option>
            </select>
            <span className={`mode-badge ${roleConfig.mode}`}>
              {roleConfig.mode === 'admin' ? '관리자 모드' : '현장 모드'}
            </span>
          </div>

          <div className="user">
            <div className="avatar" id="u-avatar">
              {roleConfig.nm.charAt(0)}
            </div>
            <div>
              <div className="u-name" id="u-name">{roleConfig.nm}</div>
              <div className="u-role" id="u-role">{roleConfig.role}</div>
            </div>
          </div>
        </header>

        {/* Content Outlet */}
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
