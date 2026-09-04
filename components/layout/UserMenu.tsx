import { uiText } from '../../utils/uiI18n';
import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../icons';
import { clearAuthSession, type StoredAuthUser } from '../../utils/auth';
import { useTeacherLang, type TeacherLang } from '../../utils/teacherI18n';

const UM_T: Record<TeacherLang, Record<string, string>> = {
  "zh-HK": {
    account: "帳戶中心",
    login: "登入 / 註冊",
    settings: "設定",
    help: "幫助",
    helpCenter: "幫助中心",
    logout: "登出",
    notLoggedIn: "未登入",
    pleaseSignIn: "請先登入帳戶",
  },
  en: {
    account: "Account Center",
    login: "Sign in / Register",
    settings: "Settings",
    help: "Help",
    helpCenter: "Help Center",
    logout: "Log out",
    notLoggedIn: "Not signed in",
    pleaseSignIn: "Please sign in first",
  },
};

interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  href?: string;
  isDanger?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon: Icon, label, onClick, href, isDanger = false }) => {
  const className = `w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-sm font-medium transition-colors ${
    isDanger
      ? 'text-rose-500 hover:bg-rose-50'
      : 'text-[var(--text-body)] hover:bg-[var(--bg-subtle)]'
  }`;

  if (href) {
    return (
      <a href={href} className={className}>
        <Icon className={`w-5 h-5 ${isDanger ? 'text-rose-500' : 'text-[var(--text-faint)]'}`} />
        <span>{uiText(label)}</span>
      </a>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      <Icon className={`w-5 h-5 ${isDanger ? 'text-rose-500' : 'text-[var(--text-faint)]'}`} />
      <span>{uiText(label)}</span>
    </button>
  );
};

interface UserMenuProps {
  currentUser?: StoredAuthUser | null;
  /** "student" = 學生版選單（帳戶中心/幫助中心/登出）；預設 "teacher" 行為不變 */
  variant?: "teacher" | "student";
}

export const UserMenu: React.FC<UserMenuProps> = ({ currentUser = null, variant = "teacher" }) => {
  const isStudent = variant === "student";
  const um = UM_T[useTeacherLang()];
  const handleLogout = () => {
    clearAuthSession();
    window.location.href = '/auth';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="absolute top-full right-0 mt-2 w-56 bg-[var(--bg-card)] backdrop-blur-md rounded-[20px] shadow-lg border border-[var(--border-soft)] z-30 p-2 origin-top-right"
    >
      <div className="p-2 border-b border-[var(--border-soft)] mb-2">
         <p className="text-sm font-semibold text-[var(--text-main)]">{currentUser?.fullName || um.notLoggedIn}</p>
         <p className="text-xs text-[var(--text-muted)]">{currentUser?.email || um.pleaseSignIn}</p>
      </div>
      <MenuItem icon={Icons.userCog} label={currentUser ? um.account : um.login} href={currentUser ? "/account" : "/auth"} />
      {currentUser && !isStudent && <MenuItem icon={Icons.settings} label={um.settings} href="/settings" />}
      <MenuItem icon={Icons.helpCircle} label={isStudent ? um.helpCenter : um.help} href="/help" />
      <div className="my-2 h-px bg-[var(--border-soft)]" />
      <MenuItem icon={Icons.logOut} label={um.logout} isDanger onClick={handleLogout} />
    </motion.div>
  );
};
