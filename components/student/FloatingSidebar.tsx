'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from '../icons';

const navItems = [
  { href: '/portal/student', icon: Icons.dashboard, label: '星際地圖' },
  { href: '/portal/student/lab', icon: Icons.wand, label: '創意實驗室' },
  { href: '/portal/student/achievements', icon: Icons.shieldCheck, label: '成就博物館' },
];

export const FloatingSidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="fixed left-4 top-1/2 -translate-y-1/2 z-50">
      <div className="bg-white/40 backdrop-blur-xl border border-white/30 p-2 rounded-full shadow-lg flex flex-col space-y-2">
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link href={item.href} key={item.href} title={item.label} className="group relative">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isActive ? 'bg-indigo-600 text-white shadow-md' : 'bg-white/50 hover:bg-white'
              }`}>
                <item.icon className="w-7 h-7" />
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
};
