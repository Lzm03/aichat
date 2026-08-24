'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './pages/Dashboard';
import { AssessmentPage } from './pages/AssessmentPage';
import { AiBotWorkshopPage } from './pages/AiBotWorkshopPage';
import { SharedBotChatPage } from './pages/SharedBotChatPage';
import { AuthPage } from './pages/AuthPage';
import { AccountPage } from './pages/AccountPage';
import { SettingsPage } from './pages/SettingsPage';
import { StudentHome } from './pages/StudentHome';
import { TeacherSharingPage } from './pages/TeacherSharingPage';
import { CharacterStagePage } from './pages/CharacterStagePage';
import { ProPlanPage } from './pages/ProPlanPage';
import { MobileSidebarDrawer } from './components/layout/MobileSidebarDrawer';
import { Icons } from './components/icons';
import { API_BASE } from './utils/api';
import {
  AUTH_CHANGED_EVENT,
  clearAuthSession,
  installAuthTransportBridge,
  readAuthSession,
  type StoredAuthUser,
} from './utils/auth';
import { DEFAULT_USER_PREFERENCES, getAppShellThemeClasses, normalizeUserPreferences } from './utils/userPreferences';
import { useFeatureEntitlements } from './hooks/useFeatureEntitlements';

export type Page = 'dashboard' | 'assessment' | 'workshop' | 'sharing';

const pageConfig = {
  dashboard: { title: '教學指揮艙' },
  assessment: { title: '智能評測' },
  workshop: { title: 'AI 機器人工作坊' },
  sharing: { title: '學生與 Bot 分享' },
};

const LandingPage: React.FC = () => {
  return (
    <iframe
      src="/homepage/index.html"
      title="ChopReality 首頁"
      className="block h-screen w-full border-0 bg-white"
    />
  );
};

const App: React.FC = () => {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [sharedBotId, setSharedBotId] = useState<string | null>(null);
  const [stageBotId, setStageBotId] = useState<string | null>(null);
  const [isAuthRoute, setIsAuthRoute] = useState(false);
  const [isLandingRoute, setIsLandingRoute] = useState(false);
  const [isAccountRoute, setIsAccountRoute] = useState(false);
  const [isSettingsRoute, setIsSettingsRoute] = useState(false);
  const [isProRoute, setIsProRoute] = useState(false);
  const [currentUser, setCurrentUser] = useState<StoredAuthUser | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPortraitLayout, setIsPortraitLayout] = useState(false);
  const [botSearchQuery, setBotSearchQuery] = useState('');
  const { features } = useFeatureEntitlements();

  // 在本地永远视为已准备好，不检查 window.aistudio
  const hasApiKey = true;

  const renderCurrentPage = () => {
    switch (activePage) {
      case 'assessment':
        return <AssessmentPage onNavigateToWorkshop={() => setActivePage('workshop')} />;
      case 'workshop':
        return <AiBotWorkshopPage searchQuery={botSearchQuery} />;
      case 'sharing':
        return <TeacherSharingPage />;
      default:
        return <Dashboard />;
    }
  };

  useEffect(() => {
    installAuthTransportBridge();
    const syncSession = () => {
      setCurrentUser(readAuthSession()?.user || null);
      setIsSessionReady(true);
    };
    syncSession();
    window.addEventListener(AUTH_CHANGED_EVENT, syncSession);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncSession);
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      const m = window.location.pathname.match(/^\/bot\/([^/]+)$/);
      const stageMatch = window.location.pathname.match(/^\/embed\/bots\/([^/]+)\/stage$/);
      setIsAuthRoute(window.location.pathname === "/auth");
      setIsLandingRoute(window.location.pathname === "/");
      setIsAccountRoute(window.location.pathname === "/account");
      setIsSettingsRoute(window.location.pathname === "/settings");
      setIsProRoute(window.location.pathname === "/pro");
      setSharedBotId(m ? decodeURIComponent(m[1]) : null);
      setStageBotId(stageMatch ? decodeURIComponent(stageMatch[1]) : null);
    };
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(orientation: portrait)");
    const update = () => setIsPortraitLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (activePage !== 'workshop' && botSearchQuery) {
      setBotSearchQuery('');
    }
  }, [activePage, botSearchQuery]);

  useEffect(() => {
    let cancelled = false;
    let failedCount = 0;
    const envBase = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
    const base = envBase || "";

    const checkHealth = async () => {
      try {
        const res = await fetch(`${base}/api/health`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => ({}));
        if (data?.maintenance === true) {
          failedCount = 0;
          if (!cancelled) setIsUpdating(true);
          return;
        }
        failedCount = 0;
        if (!cancelled) setIsUpdating(false);
      } catch {
        failedCount += 1;
        if (!cancelled && failedCount >= 5) {
          setIsUpdating(true);
        }
      }
    };

    void checkHealth();
    const timer = window.setInterval(() => void checkHealth(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (sharedBotId) return;
    const session = readAuthSession();
    if (!session) return;

    let cancelled = false;
    const validateSession = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setCurrentUser(data?.user || null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const isAuthFailure = /HTTP\s+(401|403)\b/.test(message);
        if (isAuthFailure) {
          clearAuthSession();
          if (!cancelled) {
            setCurrentUser(null);
          }
        }
      }
    };

    void validateSession();
    return () => {
      cancelled = true;
    };
  }, [sharedBotId]);

  const shouldShowLanding = isSessionReady && !sharedBotId && !stageBotId && !currentUser && isLandingRoute;
  const shouldShowAuth = isSessionReady && !sharedBotId && !stageBotId && (isAuthRoute || (!currentUser && !isLandingRoute));
  const userPreferences = normalizeUserPreferences(currentUser?.preferences || DEFAULT_USER_PREFERENCES);
  const shellThemeClasses = getAppShellThemeClasses(userPreferences);

  return (
    <div className={`min-h-screen ${shellThemeClasses} ${sharedBotId || stageBotId || shouldShowAuth || shouldShowLanding || isAccountRoute || isSettingsRoute || isProRoute || !isSessionReady ? "block" : "flex"}`}>
      {isUpdating && !shouldShowLanding ? (
        <div className="pointer-events-none fixed right-4 top-4 z-[9999] max-w-[360px] rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-amber-900 shadow-lg backdrop-blur-sm">
          <p className="text-sm font-black">系統連線不穩定</p>
          <p className="mt-1 text-xs font-medium leading-5 text-amber-800">部分資料可能暫時無法更新，你仍可繼續使用目前頁面；連線恢復後會自動同步。</p>
        </div>
      ) : null}
      {!isSessionReady ? (
        <div className="flex min-h-screen items-center justify-center bg-white text-sm font-semibold text-slate-500">
          正在載入…
        </div>
      ) : stageBotId ? (
        <CharacterStagePage botId={stageBotId} />
      ) : sharedBotId ? (
        <div className="w-screen min-h-screen">
          <SharedBotChatPage botId={sharedBotId} />
        </div>
      ) : shouldShowLanding ? (
        <LandingPage />
      ) : shouldShowAuth ? (
        <AuthPage />
      ) : currentUser?.role === "student" ? (
        <StudentHome currentUser={currentUser} />
      ) : isAccountRoute && currentUser ? (
        <AccountPage currentUser={currentUser} onProfileUpdated={setCurrentUser} />
      ) : isSettingsRoute && currentUser ? (
        <SettingsPage currentUser={currentUser} onProfileUpdated={setCurrentUser} />
      ) : isProRoute && currentUser ? (
        <ProPlanPage />
      ) : (
        <>
          <Sidebar activePage={activePage} setActivePage={setActivePage} forceHidden={isPortraitLayout} />
          <MobileSidebarDrawer 
            isOpen={isMobileDrawerOpen}
            setIsOpen={setIsMobileDrawerOpen}
            activePage={activePage}
            setActivePage={setActivePage}
            forceVisible={isPortraitLayout}
          />
          <div className="flex-1 flex flex-col">
            <Header 
              pageTitle={pageConfig[activePage].title} 
              onMenuClick={() => setIsMobileDrawerOpen(true)}
              forceMobileMenu={isPortraitLayout}
              currentUser={currentUser}
              searchValue={activePage === 'workshop' ? botSearchQuery : ''}
              searchPlaceholder={activePage === 'workshop' ? '搜尋 AI 機器人名稱…' : '全域搜尋...'}
              onSearchChange={activePage === 'workshop' ? setBotSearchQuery : undefined}
            />
            <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
              {renderCurrentPage()}
            </main>
          </div>
        </>
      )}
    </div>
  );
};

export default App;
