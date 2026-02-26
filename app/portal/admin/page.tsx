import React from 'react';
import { Icons } from '@/components/icons';

export default function AdminPortalPage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
      <div className="text-center p-8 bg-white rounded-3xl shadow-soft-tech">
        <Icons.shieldCheck className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-[#1E293B]">管理員門戶</h2>
        <p className="text-slate-500 mt-2">此頁面正在建設中，敬請期待！</p>
      </div>
    </div>
  );
}
