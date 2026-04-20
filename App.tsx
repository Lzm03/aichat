'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './pages/Dashboard';
import { AiBotWorkshopPage } from './pages/AiBotWorkshopPage';
import { TaskCenter } from './pages/TaskCenter';
import { SharedBotChatPage } from './pages/SharedBotChatPage';
import { AuthPage } from './pages/AuthPage';
import { AccountPage } from './pages/AccountPage';
import { SettingsPage } from './pages/SettingsPage';
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

export type Page = 'dashboard' | 'workshop' | 'tasks';

const pageConfig = {
  dashboard: { title: '教學指揮艙', component: <Dashboard /> },
  workshop: { title: 'AI 機器人工作坊', component: <AiBotWorkshopPage /> },
  tasks: { title: '任務中心', component: <TaskCenter /> },
};

const App: React.FC = () => {
  const [activePage, setActivePage] = useState<Page>('workshop');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [sharedBotId, setSharedBotId] = useState<string | null>(null);
  const [isAuthRoute, setIsAuthRoute] = useState(false);
  const [isAccountRoute, setIsAccountRoute] = useState(false);
  const [isSettingsRoute, setIsSettingsRoute] = useState(false);
  const [currentUser, setCurrentUser] = useState<StoredAuthUser | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPortraitLayout, setIsPortraitLayout] = useState(false);
  const { features } = useFeatureEntitlements();

  // 在本地永远视为已准备好，不检查 window.aistudio
  const hasApiKey = true;

  const CurrentPage = () => pageConfig[activePage].component;

  useEffect(() => {
    installAuthTransportBridge();
    const syncSession = () => {
      setCurrentUser(readAuthSession()?.user || null);
    };
    syncSession();
    window.addEventListener(AUTH_CHANGED_EVENT, syncSession);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncSession);
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      const m = window.location.pathname.match(/^\/bot\/([^/]+)$/);
      setIsAuthRoute(window.location.pathname === "/auth");
      setIsAccountRoute(window.location.pathname === "/account");
      setIsSettingsRoute(window.location.pathname === "/settings");
      setSharedBotId(m ? decodeURIComponent(m[1]) : null);
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
        if (!cancelled && failedCount >= 2) {
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

  const shouldShowAuth = !sharedBotId && (!currentUser || isAuthRoute);
  const userPreferences = normalizeUserPreferences(currentUser?.preferences || DEFAULT_USER_PREFERENCES);
  const shellThemeClasses = getAppShellThemeClasses(userPreferences);

  return (
    <div className={`min-h-screen ${shellThemeClasses} ${sharedBotId || shouldShowAuth ? "block" : "flex"}`}>
      {isUpdating ? (
        <div className="fixed inset-0 z-[9999] bg-white/95 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin" />
            <p className="mt-4 text-lg font-semibold text-slate-800">系统更新中</p>
            <p className="mt-1 text-sm text-slate-500">新版本部署完成后将自动恢复</p>
          </div>
        </div>
      ) : null}
      {sharedBotId ? (
        <div className="w-screen min-h-screen">
          <SharedBotChatPage botId={sharedBotId} />
        </div>
      ) : shouldShowAuth ? (
        <AuthPage />
      ) : isAccountRoute && currentUser ? (
        <AccountPage currentUser={currentUser} onProfileUpdated={setCurrentUser} />
      ) : isSettingsRoute && currentUser ? (
        <SettingsPage currentUser={currentUser} onProfileUpdated={setCurrentUser} />
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
            />
            <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
              <CurrentPage />
            </main>
          </div>
        </>
      )}
    </div>
  );
};

export default App;
