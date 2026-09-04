'use client';

import { uiText } from '../../utils/uiI18n';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { readAuthSession } from '../../utils/auth';

// Demo 用戶識別：user.plan === 'demo'（後端在登入/me 回傳；見對接文件 #12）
// 一次性提示：關閉後寫 localStorage，之後不再顯示
const DEMO_NOTICE_KEY = 'chopreality_demo_notice_dismissed';

export function DemoNotice() {
  const [dismissed, setDismissed] = React.useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(DEMO_NOTICE_KEY) === '1'
  );
  const isDemoUser = readAuthSession()?.user?.plan?.trim().toLowerCase() === 'demo';

  const close = () => {
    setDismissed(true);
    window.localStorage.setItem(DEMO_NOTICE_KEY, '1');
  };

  return (
    <AnimatePresence initial={false}>
      {isDemoUser && !dismissed ? (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div>
              <p className="text-sm font-bold text-amber-700">{uiText("測試版 / Demo 版")}</p>
              <p className="mt-1 text-xs leading-5 text-amber-800/80">{uiText("目前為功能測試階段，內容與體驗可能隨時調整，感謝你的試用與回饋。")}</p>
            </div>
            <button
              type="button"
              onClick={close}
              className="shrink-0 text-base leading-none text-amber-400 transition hover:text-amber-700"
              aria-label={uiText("關閉提示")}
            >
              ×
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
