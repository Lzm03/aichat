'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Icons } from '@/components/icons';
import { TokenUsageMonitor } from '@/components/system/TokenUsageMonitor';

const PortalHeader = () => (
  <header className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center">
    <div className="flex items-center space-x-3">
      <div className="bg-indigo-600 p-2 rounded-lg shadow-md shadow-indigo-500/20">
        <Icons.sparkles className="text-white w-6 h-6" />
      </div>
      <h1 className="text-xl font-bold text-[#1E293B]">SmartEdu HK</h1>
    </div>
    <TokenUsageMonitor used={3.8} total={5.0} resetDate="3月1日" />
  </header>
);

interface IdentityCardProps {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  color: 'indigo' | 'emerald' | 'amber';
}

const cardColors = {
  indigo: {
    bg: 'hover:bg-indigo-50',
    iconBg: 'bg-indigo-100',
    iconText: 'text-indigo-600',
    border: 'hover:border-indigo-300',
  },
  emerald: {
    bg: 'hover:bg-emerald-50',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-600',
    border: 'hover:border-emerald-300',
  },
  amber: {
    bg: 'hover:bg-amber-50',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
    border: 'hover:border-amber-300',
  },
};

const IdentityCard: React.FC<IdentityCardProps> = ({ href, icon: Icon, title, description, color }) => {
  const colors = cardColors[color];
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div variants={cardVariants}>
      <Link href={href} className="block h-full">
        <div className={`group h-full p-8 rounded-3xl bg-white border border-slate-200/80 shadow-soft-tech transition-all duration-300 ease-in-out cursor-pointer hover:scale-105 hover:shadow-xl active:scale-100 ${colors.bg} ${colors.border}`}>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${colors.iconBg} transition-colors`}>
            <Icon className={`w-8 h-8 ${colors.iconText} transition-colors`} />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-slate-800">{title}</h2>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
      </Link>
    </motion.div>
  );
};

export default function PortalSelectionPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30"></div>
      <PortalHeader />
      <main className="text-center z-10">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-5xl font-black text-slate-800 tracking-tight">歡迎來到 SmartEdu HK</motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">請選擇您的身份，開啟個人化的 AI 賦能教育之旅。</motion.p>
      </main>
      <motion.div
        className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl z-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <IdentityCard
          href="/portal/teacher"
          icon={Icons.bot}
          title="教師門戶"
          description="教學管理、AI 機器人工作坊、任務分發。"
          color="indigo"
        />
        <IdentityCard
          href="/portal/student"
          icon={Icons.dashboard}
          title="學生門戶"
          description="星際冒險地圖、創意實驗室、成就博物館。"
          color="emerald"
        />
        <IdentityCard
          href="/portal/admin"
          icon={Icons.shieldCheck}
          title="管理員門戶"
          description="校園算力監控、安全防護、行政治理。"
          color="amber"
        />
      </motion.div>
    </div>
  );
}
