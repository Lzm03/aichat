import React from 'react';
import { Icons } from '../icons';
import type { Page } from '../../App';

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}

// FIX: Explicitly type NavItem as a React.FC to correctly handle React's special `key` prop.
const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, active = false, onClick }) => (
  <li className="px-2">
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex items-center px-4 py-3 rounded-xl transition-all duration-200 ${
        active
          ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      <Icon className={`w-5 h-5 mr-4 ${active ? 'text-indigo-500' : ''}`} />
      <span className="text-sm">{label}</span>
    </a>
  </li>
);

interface SidebarProps {
  activePage: Page;
  setActivePage: (page: Page) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, setActivePage }) => {
  const navItems: { id: Page; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: '教學指揮艙', icon: Icons.dashboard },
    { id: 'workshop', label: 'AI 機器人工作坊', icon: Icons.bot },
    { id: 'tasks', label: '任務中心', icon: Icons.tasks },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 p-4 flex-col justify-between hidden lg:flex">
      <div>
        <div className="flex items-center space-x-3 p-4 mb-6">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-md shadow-indigo-500/20">
            <Icons.sparkles className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-[#1E293B]">Chopreality</h1>
        </div>
        <nav>
          <ul className="space-y-2">
            {navItems.map((item) => (
              <NavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activePage === item.id}
                onClick={() => setActivePage(item.id)}
              />
            ))}
          </ul>
        </nav>
      </div>
      <div className="p-2">
        <NavItem icon={Icons.settings} label="設定" onClick={() => {}} />
      </div>
    </aside>
  );
};