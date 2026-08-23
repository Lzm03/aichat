import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { FeatureLimitPanel } from '../system/FeatureLimitPanel';
import { UserMenu } from './UserMenu';
import type { StoredAuthUser } from '../../utils/auth';
import { useFeatureEntitlements } from '../../hooks/useFeatureEntitlements';
import { DEFAULT_ACCOUNT_AVATAR } from '../../utils/default-avatar';

interface HeaderProps {
  pageTitle: string;
  onMenuClick: () => void;
  forceMobileMenu?: boolean;
  currentUser?: StoredAuthUser | null;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
}

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "早安";
  if (hour >= 11 && hour < 14) return "午安";
  if (hour >= 14 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 24) return "晚上好";
  return "夜深了";
}

export const Header: React.FC<HeaderProps> = ({
  pageTitle,
  onMenuClick,
  forceMobileMenu = false,
  currentUser = null,
  searchValue = "",
  searchPlaceholder = "全域搜尋...",
  onSearchChange,
}) => {
  const { features } = useFeatureEntitlements();
  const primaryFeatures = features.filter((feature) => feature.key === "bot_publish" || feature.key === "chat_messages");
  const [isFeatureMenuOpen, setIsFeatureMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const featureMenuTriggerRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (featureMenuTriggerRef.current && !featureMenuTriggerRef.current.contains(event.target as Node)) {
        setIsFeatureMenuOpen(false);
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

  useEffect(() => {
    if (!onSearchChange) return;
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [onSearchChange]);

  const lockedCount = primaryFeatures.filter((feature) => feature.locked).length;

  return (
    <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-slate-200/80 bg-white/80 px-3 py-3 backdrop-blur-sm sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:gap-2 lg:px-8 lg:py-4">
      <div className="flex min-w-0 items-center justify-between gap-2 lg:flex-1 lg:justify-start sm:gap-4">
        <button 
          onClick={onMenuClick}
          className={`${forceMobileMenu ? "inline-flex" : "lg:hidden"} shrink-0 p-2 -ml-2 text-slate-600 hover:text-indigo-600 active:bg-slate-100 rounded-lg`}
        >
          <Icons.menu className="w-6 h-6" />
        </button>
        <div className="hidden min-w-0 lg:block">
          <h2 className="truncate text-xs leading-snug text-slate-500 sm:text-sm">{getTimeGreeting()}, {currentUser?.fullName || '老師'}</h2>
          <p className="truncate text-2xl font-bold leading-tight text-[#1E293B]">{pageTitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
        {primaryFeatures.length ? (
          <div className="relative" ref={featureMenuTriggerRef}>
            <button
              onClick={() => setIsFeatureMenuOpen((prev) => !prev)}
              className="flex h-10 items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-3.5 text-xs font-semibold text-indigo-700"
            >
              <Icons.cpu className="h-4 w-4 xl:hidden" />
              <span className="hidden xl:inline">使用次數</span>
              <span className={`rounded-full px-1.5 py-0.5 sm:px-2 ${lockedCount > 0 ? "bg-rose-100 text-rose-700" : "bg-white text-indigo-700"}`}>
                {lockedCount > 0 ? `${lockedCount} 已用完` : "查看"}
              </span>
              <Icons.down className={`h-4 w-4 transition-transform ${isFeatureMenuOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {isFeatureMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -10 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 280 }}
                  className="fixed left-3 right-3 top-[74px] z-30 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2"
                >
                  <FeatureLimitPanel features={primaryFeatures} dropdown />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : null}
        <div className="relative hidden md:block">
          <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && searchValue) {
                event.preventDefault();
                onSearchChange?.("");
              }
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            disabled={!onSearchChange}
            className="h-10 w-64 rounded-full border border-transparent bg-slate-100 pl-10 pr-12 text-sm transition-all duration-300 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {searchValue && onSearchChange ? (
            <button
              type="button"
              onClick={() => {
                onSearchChange("");
                searchInputRef.current?.focus();
              }}
              aria-label="清除搜尋"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            >
              <Icons.close className="h-4 w-4" />
            </button>
          ) : (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-xs text-slate-500">
              ⌘K
            </div>
          )}
        </div>

        <div className="relative" ref={userMenuTriggerRef}>
          <motion.button
            onClick={() => setIsUserMenuOpen(prev => !prev)}
            whileTap={{ scale: 0.9 }}
            className="h-10 w-10 rounded-full border-2 border-transparent hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2 transition-all"
          >
            <img
              src={currentUser?.avatarUrl || DEFAULT_ACCOUNT_AVATAR}
              alt="User Avatar"
              className="w-full h-full rounded-full"
            />
          </motion.button>
          <AnimatePresence>
            {isUserMenuOpen && <UserMenu currentUser={currentUser} />}
          </AnimatePresence>
        </div>
      </div>
      </div>
      <div className="min-w-0 pl-10 lg:hidden">
        <h2 className="truncate whitespace-nowrap text-xs leading-snug text-slate-500 sm:text-sm">{getTimeGreeting()}, {currentUser?.fullName || '老師'}</h2>
        <p className="truncate whitespace-nowrap text-2xl font-black leading-tight text-[#1E293B] sm:text-3xl">{pageTitle}</p>
      </div>
    </header>
  );
};
