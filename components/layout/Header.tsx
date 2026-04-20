import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../icons';
import { TokenUsageMonitor } from '../system/TokenUsageMonitor';
import { TokenDetailModal, ProviderUsage } from '../system/TokenDetailModal';
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
}

export const Header: React.FC<HeaderProps> = ({ pageTitle, onMenuClick, forceMobileMenu = false, currentUser = null }) => {
  const { features } = useFeatureEntitlements();
  const primaryFeatures = features.filter((feature) => feature.key === "bot_publish" || feature.key === "chat_messages");
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isFeatureMenuOpen, setIsFeatureMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  
  const tokenTriggerRef = useRef<HTMLDivElement>(null);
  const featureMenuTriggerRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tokenTriggerRef.current && !tokenTriggerRef.current.contains(event.target as Node)) {
        setIsTokenModalOpen(false);
      }
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
  const lockedCount = primaryFeatures.filter((feature) => feature.locked).length;
  const canViewProviderUsage = currentUser?.email?.trim().toLowerCase() === "lzm200303@gmail.com";

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/80 px-6 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center space-x-4">
        <button 
          onClick={onMenuClick}
          className={`${forceMobileMenu ? "inline-flex" : "lg:hidden"} p-2 -ml-2 text-slate-600 hover:text-indigo-600 active:bg-slate-100 rounded-lg`}
        >
          <Icons.menu className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-sm text-slate-500">早安, {currentUser?.fullName || '老師'}!</h2>
          <p className="text-2xl font-bold text-[#1E293B]">{pageTitle}</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {primaryFeatures.length ? (
          <div className="relative hidden xl:block" ref={featureMenuTriggerRef}>
            <button
              onClick={() => setIsFeatureMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"
            >
              <span>使用次數</span>
              <span className={`rounded-full px-2 py-0.5 ${lockedCount > 0 ? "bg-rose-100 text-rose-700" : "bg-white text-indigo-700"}`}>
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
                  className="absolute right-0 top-full mt-2 z-30"
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
            type="text"
            placeholder="全域搜尋..."
            className="bg-slate-100 border border-transparent focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 transition-all duration-300 rounded-xl pl-10 pr-4 py-2.5 text-sm w-64"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 font-sans">
            ⌘K
          </div>
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
    </header>
  );
};
