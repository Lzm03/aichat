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
import { HelpCenterPage } from './pages/HelpCenterPage';
import { StudentAchievementsPage } from './pages/StudentAchievementsPage';
import { StudentTasksPage } from './pages/StudentTasksPage';
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
import { DEFAULT_USER_PREFERENCES, getAppShellThemeClasses, normalizeUserPreferences, syncDarkClass } from './utils/userPreferences';
import { useFeatureEntitlements } from './hooks/useFeatureEntitlements';
import { useTeacherLang, type TeacherLang } from './utils/teacherI18n';

export type Page = 'dashboard' | 'assessment' | 'workshop' | 'sharing';

const PAGE_TITLES: Record<Page, Record<TeacherLang, string>> = {
  dashboard: { "zh-HK": '教學指揮艙', en: 'Command Center' },
  assessment: { "zh-HK": '智能評測', en: 'Smart Assessment' },
  workshop: { "zh-HK": 'AI 機器人工作坊', en: 'AI Bot Workshop' },
  sharing: { "zh-HK": '學生與 Bot 分享', en: 'Share with Students' },
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
  const [isHelpRoute, setIsHelpRoute] = useState(false);
  const [isAchievementsRoute, setIsAchievementsRoute] = useState(false);
  const [isTasksRoute, setIsTasksRoute] = useState(false);
  const [currentUser, setCurrentUser] = useState<StoredAuthUser | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  // 網路不穩（連續失敗達閾值）→ 非阻擋細條提示；維護模式才用全屏遮罩
  const [isOffline, setIsOffline] = useState(false);
  const [isPortraitLayout, setIsPortraitLayout] = useState(false);
  const [botSearchQuery, setBotSearchQuery] = useState('');
  const { features } = useFeatureEntitlements();
  const teacherLang = useTeacherLang();

  // 在本地永遠視為已準備好，不檢查 window.aistudio
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
      setIsHelpRoute(window.location.pathname === "/help");
      setIsAchievementsRoute(window.location.pathname === "/achievements");
      setIsTasksRoute(window.location.pathname === "/tasks");
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
          // 後端明確回報維護中 → 全屏遮罩（真實維護，保留）
          failedCount = 0;
          if (!cancelled) {
            setIsOffline(false);
            setIsUpdating(true);
          }
          return;
        }
        failedCount = 0;
        if (!cancelled) {
          setIsOffline(false);
          setIsUpdating(false);
        }
      } catch {
        // 網路失敗：連續 4 次（約 20 秒）才提示，且只顯示非阻擋細條
        failedCount += 1;
        if (!cancelled && failedCount >= 4) {
          setIsOffline(true);
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
  const themeMode = userPreferences.appearance.themeMode;

  useEffect(() => {
    syncDarkClass(userPreferences);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMode]);

  return (
    <div className={`min-h-screen ${shellThemeClasses} ${sharedBotId || stageBotId || shouldShowAuth || shouldShowLanding || isAccountRoute || isSettingsRoute || isProRoute || isHelpRoute || isAchievementsRoute || isTasksRoute || !isSessionReady ? "block" : "flex"}`}>
      {isUpdating && !shouldShowLanding ? (
        <div className="fixed inset-0 z-[9999] bg-white/95 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin" />
            <p className="mt-4 text-lg font-semibold text-slate-800">系統更新中</p>
            <p className="mt-1 text-sm text-slate-500">新版本部署完成後將自動恢復</p>
          </div>
        </div>
      ) : null}
      {isOffline && !isUpdating ? (
        <div className="fixed right-4 top-4 z-[90] flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/95 px-4 py-2 shadow-lg backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          <p className="text-xs font-bold text-amber-700">
            {teacherLang === "en" ? "Network unstable, reconnecting…" : "網路連線不穩，正在重新連線…"}
          </p>
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
        isAccountRoute ? (
          <AccountPage currentUser={currentUser} onProfileUpdated={setCurrentUser} />
        ) : isHelpRoute ? (
          <HelpCenterPage variant="student" />
        ) : isTasksRoute ? (
          <StudentTasksPage />
        ) : isAchievementsRoute ? (
          <StudentAchievementsPage />
        ) : (
          <StudentHome currentUser={currentUser} />
        )
      ) : isAccountRoute && currentUser ? (
        <AccountPage currentUser={currentUser} onProfileUpdated={setCurrentUser} />
      ) : isSettingsRoute && currentUser ? (
        <SettingsPage currentUser={currentUser} onProfileUpdated={setCurrentUser} />
      ) : isProRoute && currentUser ? (
        <ProPlanPage />
      ) : isHelpRoute && currentUser ? (
        <HelpCenterPage variant="teacher" />
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
              pageTitle={PAGE_TITLES[activePage][teacherLang]}
              onMenuClick={() => setIsMobileDrawerOpen(true)}
              forceMobileMenu={isPortraitLayout}
              currentUser={currentUser}
              searchValue={activePage === 'workshop' ? botSearchQuery : ''}
              searchPlaceholder={activePage === 'workshop' ? (teacherLang === "en" ? 'Search AI bot name…' : '搜尋 AI 機器人名稱…') : (teacherLang === "en" ? 'Search…' : '全域搜尋...')}
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
