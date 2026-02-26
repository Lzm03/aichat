import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import type { Page } from '../../App';

interface MobileSidebarDrawerProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    activePage: Page;
    setActivePage: (page: Page) => void;
}

export const MobileSidebarDrawer: React.FC<MobileSidebarDrawerProps> = ({ isOpen, setIsOpen, activePage, setActivePage }) => {
  
  const menuItems: { id: Page; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: '教學指揮艙', icon: Icons.dashboard },
    { id: 'workshop', label: 'AI 機器人工作坊', icon: Icons.bot },
    { id: 'tasks', label: '任務中心', icon: Icons.tasks },
  ];

  return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] lg:hidden"
            />

            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-[280px] bg-white z-[70] shadow-2xl rounded-r-[32px] flex flex-col lg:hidden"
            >
              <div className="p-6 flex items-center justify-between border-b border-slate-100">
                <div className="flex items-center gap-3">
                   <div className="bg-indigo-600 p-2 rounded-lg shadow-md shadow-indigo-500/20">
                    <Icons.sparkles className="text-white w-5 h-5" />
                  </div>
                  <span className="font-bold text-slate-800 text-lg">SmartEdu HK</span>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <Icons.close size={20} className="text-slate-400" />
                </button>
              </div>

              <nav className="flex-1 p-4 space-y-2">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActivePage(item.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all ${
                      activePage === item.id 
                        ? 'bg-indigo-50 text-indigo-600 font-semibold' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-sm">{item.label}</span>
                  </button>
                ))}
              </nav>
              
              <div className="p-6 border-t border-slate-100">
                <button className="flex items-center gap-3 text-sm text-slate-500 hover:text-indigo-600 w-full p-2 rounded-lg hover:bg-slate-50">
                  <Icons.languages className="w-5 h-5" />
                  <span>繁體中文 / EN</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
  );
};