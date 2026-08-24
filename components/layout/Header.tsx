import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { TokenUsageMonitor } from '../system/TokenUsageMonitor';
import { TokenDetailModal, ProviderUsage } from '../system/TokenDetailModal';
import { UserMenu } from './UserMenu';
import type { StoredAuthUser } from '../../utils/auth';
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
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  
  const tokenTriggerRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    const envBase = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
    const candidateBases = Array.from(new Set([envBase, ""].filter(Boolean)));

    const fetchUsage = async () => {
      setTokenLoading(true);
      setTokenError(null);
      try {
        let lastErr = "No available endpoint";
        for (const base of candidateBases) {
          try {
            const res = await fetch(`${base}/api/token-usage`);
            if (!res.ok) {
              lastErr = `HTTP ${res.status} @ ${base || "same-origin"}`;
              continue;
            }
            const data = await res.json();
            if (cancelled) return;
            setProviders(Array.isArray(data?.providers) ? data.providers : []);
            setTokenError(null);
            return;
          } catch (err) {
            lastErr =
              err instanceof Error ? err.message : `Fetch failed @ ${base || "same-origin"}`;
          }
        }
        throw new Error(lastErr);
      } catch (err) {
        if (cancelled) return;
        setProviders([]);
        setTokenError(err instanceof Error ? err.message : "Fetch failed");
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    };

    void fetchUsage();
    const timer = window.setInterval(() => {
      void fetchUsage();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const okCount = providers.filter((p) => p.status === "ok").length;
  const totalCount = providers.length || 1;
  const canViewProviderUsage = currentUser?.email?.trim().toLowerCase() === "lzm200303@gmail.com";

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
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-auto">
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
            className="w-64 rounded-xl border border-transparent bg-slate-100 py-2.5 pl-10 pr-12 text-sm transition-all duration-300 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
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
        
        {canViewProviderUsage ? (
          <div className="relative" ref={tokenTriggerRef}>
              <motion.div 
                  whileTap={{ scale: 0.95 }}
                  className="cursor-pointer"
                  onClick={() => setIsTokenModalOpen(prev => !prev)}
              >
                  <TokenUsageMonitor used={okCount} total={totalCount} resetDate="即時更新" />
              </motion.div>
              <AnimatePresence>
                  {isTokenModalOpen && <TokenDetailModal providers={providers} loading={tokenLoading} error={tokenError} />}
              </AnimatePresence>
          </div>
        ) : null}

        <div className="relative hidden sm:block">
           <button className="h-11 px-3 flex items-center space-x-2 rounded-xl hover:bg-slate-100 transition-colors">
            <Icons.language className="w-5 h-5 text-slate-500" />
            <span className="text-sm font-medium text-slate-600">中</span>
            <Icons.down className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="relative" ref={userMenuTriggerRef}>
          <motion.button
            onClick={() => setIsUserMenuOpen(prev => !prev)}
            whileTap={{ scale: 0.9 }}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 border-transparent hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2 transition-all"
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
