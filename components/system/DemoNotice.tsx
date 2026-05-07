'use client';

import React from 'react';

export function DemoNotice() {
  const [visible, setVisible] = React.useState(true);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [closing]);

  if (!visible) return null;

  return (
    <div className="fixed right-6 bottom-6 z-[999] w-[320px] rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-amber-700">測試版 / Demo 版</p>
          <p className="mt-1 text-xs text-slate-600">
            目前為功能測試階段，內容與體驗可能隨時調整，感謝你的試用與回饋。
          </p>
        </div>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setClosing(true);
          }}
          className="text-slate-400 hover:text-slate-600 text-sm"
          aria-label="關閉提示"
        >
          ×
        </button>
      </div>
    </div>
  );
}
