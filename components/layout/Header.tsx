import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { TokenUsageMonitor } from '../system/TokenUsageMonitor';
import { TokenDetailModal } from '../system/TokenDetailModal';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  pageTitle: string;
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ pageTitle, onMenuClick }) => {
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  const tokenTriggerRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tokenTriggerRef.current && !tokenTriggerRef.current.contains(event.target as Node)) {
        setIsTokenModalOpen(false);
      }
      if (userMenuTriggerRef.current && !userMenuTriggerRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/80 px-6 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center space-x-4">
        <button 
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-indigo-600 active:bg-slate-100 rounded-lg"
        >
          <Icons.menu className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-sm text-slate-500">早安, 陳老師!</h2>
          <p className="text-2xl font-bold text-[#1E293B]">{pageTitle}</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <div className="relative hidden md:block">
          <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="全域搜尋..."
            className="bg-slate-100 border border-transparent focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 transition-all duration-300 rounded-xl pl-10 pr-4 py-2.5 text-sm w-64"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 font-sans">
            ⌘K
          </div>
        </div>
        
        <div className="relative" ref={tokenTriggerRef}>
            <motion.div 
                whileTap={{ scale: 0.95 }}
                className="cursor-pointer"
                onClick={() => setIsTokenModalOpen(prev => !prev)}
            >
                <TokenUsageMonitor used={3.8} total={5.0} resetDate="3月1日" />
            </motion.div>
            <AnimatePresence>
                {isTokenModalOpen && <TokenDetailModal />}
            </AnimatePresence>
        </div>

        <div className="relative hidden sm:block">
           <button className="h-11 px-3 flex items-center space-x-2 rounded-xl hover:bg-slate-100 transition-colors">
            <Icons.language className="w-5 h-5 text-slate-500" />
            <span className="text-sm font-medium text-slate-600">中</span>
            <Icons.down className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <button className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
          <Icons.bell className="w-6 h-6 text-slate-500" />
        </button>

        <div className="relative" ref={userMenuTriggerRef}>
          <motion.button
            onClick={() => setIsUserMenuOpen(prev => !prev)}
            whileTap={{ scale: 0.9 }}
            className="w-11 h-11 rounded-full border-2 border-transparent hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2 transition-all"
          >
            <img
              src="https://i.pravatar.cc/150?u=teacher_chen"
              alt="User Avatar"
              className="w-full h-full rounded-full"
            />
          </motion.button>
          <AnimatePresence>
            {isUserMenuOpen && <UserMenu />}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};