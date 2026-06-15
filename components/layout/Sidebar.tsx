import React from 'react';
import { Icons } from '../icons';
import type { Page } from '../../App';

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

// FIX: Explicitly type NavItem as a React.FC to correctly handle React's special `key` prop.
const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, active = false, disabled = false, onClick }) => (
  <li className="px-2">
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        onClick();
      }}
      className={`flex flex-col items-center justify-center px-2 py-4 rounded-xl transition-all duration-200 ${
        disabled
          ? 'bg-slate-100 text-slate-400 cursor-not-allowed pointer-events-none'
          : active
          ? 'bg-indigo-50 text-indigo-600 font-bold shadow-sm'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
      title={label}
      aria-disabled={disabled}
    >
      <Icon className={`w-6 h-6 mb-1 ${disabled ? 'text-slate-400' : active ? 'text-indigo-500' : ''}`} />
      <span className="text-[10px] text-center leading-tight">{label}</span>
    </a>
  </li>
);

interface SidebarProps {
  activePage: Page;
  setActivePage: (page: Page) => void;
  forceHidden?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, setActivePage, forceHidden = false }) => {
  const navItems: { id: Page; label: string; icon: React.ElementType; disabled?: boolean }[] = [
    { id: 'dashboard', label: '指揮倉', icon: Icons.dashboard },
    { id: 'assessment', label: '智能評測', icon: Icons.assessment },
    { id: 'workshop', label: 'AI工作坊', icon: Icons.bot },
    { id: 'sharing', label: '學生與分享', icon: Icons.classes },
    { id: 'tasks', label: '任務中心', icon: Icons.tasks, disabled: true },
  ];

  return (
    <aside className={`w-28 bg-white border-r border-slate-200/80 flex-col justify-between transition-all duration-300 ${forceHidden ? "hidden" : "hidden lg:flex"}`}>
      <div>
        <div className="flex items-center justify-center mt-8 mb-16">
          <div className="w-20 h-20 rounded-[24px] bg-white transition-all duration-300 flex items-center justify-center">
            <img src="/choprealitylogo.png" alt="Logo" className="w-12 h-12 object-contain" />
          </div>
        </div>
        <nav>
          <ul className="space-y-4 px-2">
            {navItems.map((item) => (
              <NavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activePage === item.id}
                disabled={item.disabled}
                onClick={() => setActivePage(item.id)}
              />
            ))}
          </ul>
        </nav>
      </div>
      <div className="p-2 mb-4">
        <NavItem icon={Icons.settings} label="設定" onClick={() => { window.location.href = "/settings"; }} />
      </div>
    </aside>
  );
};
