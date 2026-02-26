'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './pages/Dashboard';
import { AiBotWorkshopPage } from './pages/AiBotWorkshopPage';
import { TaskCenter } from './pages/TaskCenter';
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

  // 在本地永远视为已准备好，不检查 window.aistudio
  const hasApiKey = true;

  const CurrentPage = () => pageConfig[activePage].component;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex text-slate-800">
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