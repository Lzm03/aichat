import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { Icons } from '../icons';
import { FeatureLimitPanel } from '../system/FeatureLimitPanel';
import { UserMenu } from './UserMenu';
import type { StoredAuthUser } from '../../utils/auth';
import { useFeatureEntitlements } from '../../hooks/useFeatureEntitlements';
import { DEFAULT_ACCOUNT_AVATAR } from '../../utils/default-avatar';
import { setTeacherLang, useTeacherLang, type TeacherLang } from '../../utils/teacherI18n';

interface HeaderProps {
  pageTitle: string;
  onMenuClick: () => void;
  forceMobileMenu?: boolean;
  currentUser?: StoredAuthUser | null;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
}

const GREETINGS: Record<TeacherLang, string[]> = {
  "zh-HK": ["早安", "午安", "下午好", "晚上好", "夜深了"],
  en: ["Good morning", "Good afternoon", "Good afternoon", "Good evening", "Good evening"],
};

function getTimeGreeting(date = new Date(), lang: TeacherLang = "zh-HK") {
  const hour = date.getHours();
  const index =
    hour >= 5 && hour < 11 ? 0
    : hour >= 11 && hour < 14 ? 1
    : hour >= 14 && hour < 18 ? 2
    : hour >= 18 && hour < 24 ? 3
    : 4;
  return GREETINGS[lang][index];
}

const HEADER_T = {
  "zh-HK": { planUsage: "方案用量", switchLanguage: "切換語言", clearSearch: "清除搜尋" },
  en: { planUsage: "Plan Usage", switchLanguage: "Switch language", clearSearch: "Clear search" },
} as const;

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
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  // 語言：與學生端共用 localStorage key（chopreality_ui_lang）
  const lang = useTeacherLang();
  const th = HEADER_T[lang];

  const featureMenuTriggerRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLDivElement>(null);
  const langMenuTriggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const switchLang = (next: TeacherLang) => setTeacherLang(next);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (featureMenuTriggerRef.current && !featureMenuTriggerRef.current.contains(event.target as Node)) {
        setIsFeatureMenuOpen(false);
      }
      if (userMenuTriggerRef.current && !userMenuTriggerRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (langMenuTriggerRef.current && !langMenuTriggerRef.current.contains(event.target as Node)) {
        setIsLangMenuOpen(false);
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
          <h2 className="truncate text-xs leading-snug text-slate-500 sm:text-sm">{getTimeGreeting(new Date(), lang)}, {currentUser?.fullName || '老師'}</h2>
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
              <span className="hidden xl:inline">{th.planUsage}</span>
              {lockedCount > 0 && (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-700 sm:px-2">
                  {lang === "en" ? "Limit reached" : `${lockedCount} 已用完`}
                </span>
              )}
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
        {/* 全域搜尋：僅 AI 工作坊頁渲染（App.tsx 只對 workshop 傳 onSearchChange） */}
        {onSearchChange ? (
          <div className="relative hidden md:block">
            <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && searchValue) {
                  event.preventDefault();
                  onSearchChange("");
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-10 w-64 rounded-full border border-transparent bg-slate-100 pl-10 pr-12 text-sm transition-all duration-300 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-200"
            />
            {searchValue ? (
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  searchInputRef.current?.focus();
                }}
                aria-label={th.clearSearch}
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
        ) : null}

        {/* 語言切換：中 / EN（普通話與粵語同屬中文，選項只設「中」） */}
        <div className="relative hidden sm:block" ref={langMenuTriggerRef}>
          <button
            type="button"
            onClick={() => setIsLangMenuOpen((prev) => !prev)}
            aria-label={th.switchLanguage}
            className="flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
          >
            <Icons.language className="h-4 w-4 text-slate-400" />
            {lang === "en" ? "EN" : "中"}
            <Icons.down className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isLangMenuOpen ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {isLangMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -6 }}
                transition={{ type: "spring", damping: 20, stiffness: 280 }}
                className="absolute right-0 top-full z-30 mt-2 w-36 rounded-[14px] border border-slate-200 bg-white p-1.5 shadow-lg"
              >
                {([["zh-HK", "中"], ["en", "EN"]] as const).map(([value, label]) => {
                  const active = lang === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        switchLang(value);
                        setIsLangMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-sm font-semibold transition ${
                        active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                      {active && <Check className="h-4 w-4" />}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
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
        <h2 className="truncate whitespace-nowrap text-xs leading-snug text-slate-500 sm:text-sm">{getTimeGreeting(new Date(), lang)}, {currentUser?.fullName || '老師'}</h2>
        <p className="truncate whitespace-nowrap text-2xl font-black leading-tight text-[#1E293B] sm:text-3xl">{pageTitle}</p>
      </div>
    </header>
  );
};
