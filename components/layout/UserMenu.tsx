import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../icons';
import { clearAuthSession, type StoredAuthUser } from '../../utils/auth';

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
      : 'text-slate-600 hover:bg-[#F8FAFC]'
  }`;

  if (href) {
    return (
      <a href={href} className={className}>
        <Icon className={`w-5 h-5 ${isDanger ? 'text-rose-500' : 'text-slate-400'}`} />
        <span>{label}</span>
      </a>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      <Icon className={`w-5 h-5 ${isDanger ? 'text-rose-500' : 'text-slate-400'}`} />
      <span>{label}</span>
    </button>
  );
};

interface UserMenuProps {
  currentUser?: StoredAuthUser | null;
}

export const UserMenu: React.FC<UserMenuProps> = ({ currentUser = null }) => {
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
      className="absolute top-full right-0 mt-2 w-56 bg-white/80 backdrop-blur-md rounded-[20px] shadow-lg border border-slate-200/80 z-30 p-2 origin-top-right"
    >
      <div className="p-2 border-b border-slate-200/80 mb-2">
         <p className="text-sm font-semibold text-slate-800">{currentUser?.fullName || '未登入'}</p>
         <p className="text-xs text-slate-500">{currentUser?.email || '請先登入帳戶'}</p>
      </div>
      <MenuItem icon={Icons.userCog} label={currentUser ? "帳戶中心" : "登入 / 註冊"} href={currentUser ? "/account" : "/auth"} />
      {currentUser && <MenuItem icon={Icons.settings} label="設定" href="/settings" />}
      <MenuItem icon={Icons.helpCircle} label="幫助" />
      <div className="my-2 h-px bg-slate-200/80" />
      <MenuItem icon={Icons.logOut} label="登出" isDanger onClick={handleLogout} />
    </motion.div>
  );
};
