'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './pages/Dashboard';
import { AiBotWorkshopPage } from './pages/AiBotWorkshopPage';
import { TaskCenter } from './pages/TaskCenter';
import { SharedBotChatPage } from './pages/SharedBotChatPage';
import { MobileSidebarDrawer } from './components/layout/MobileSidebarDrawer';
import { Icons } from './components/icons';

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
  const [isUpdating, setIsUpdating] = useState(false);

  // 在本地永远视为已准备好，不检查 window.aistudio
  const hasApiKey = true;

  const CurrentPage = () => pageConfig[activePage].component;

  useEffect(() => {
    const syncRoute = () => {
      const m = window.location.pathname.match(/^\/bot\/([^/]+)$/);
      setSharedBotId(m ? decodeURIComponent(m[1]) : null);
    };
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
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

  if (sharedBotId) {
    return <SharedBotChatPage botId={sharedBotId} />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-800">
      {isUpdating ? (
        <div className="fixed inset-0 z-[9999] bg-white/95 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin" />
            <p className="mt-4 text-lg font-semibold text-slate-800">系统更新中</p>
            <p className="mt-1 text-sm text-slate-500">新版本部署完成后将自动恢复</p>
          </div>
        </div>
      ) : null}
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <MobileSidebarDrawer 
        isOpen={isMobileDrawerOpen}
        setIsOpen={setIsMobileDrawerOpen}
        activePage={activePage}
        setActivePage={setActivePage}
      />
      <div className="flex-1 flex flex-col">
        <Header 
          pageTitle={pageConfig[activePage].title} 
          onMenuClick={() => setIsMobileDrawerOpen(true)}
        />
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <CurrentPage />
        </main>
      </div>
    </div>
  );
};

export default App;
