import React from "react";
import { AnimatePresence, motion } from "framer-motion";

type FeedbackPromptModalProps = {
  open: boolean;
  onClose: () => void;
};

export const FeedbackPromptModal: React.FC<FeedbackPromptModalProps> = ({
  open,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]"
          >
            <div className="bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_34%)] px-7 py-7">
              <div className="inline-flex rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700">
                感謝試用
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
                感謝您試用我們的機器人平台！
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                我們的開發團隊十分想聽到您的意見。如果你想提供意見，或瞭解和購買我們的機器人創建服務，歡迎直接聯絡我們。
              </p>
            </div>

            <div className="grid gap-4 px-7 py-6">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</div>
                <div className="mt-2 text-lg font-bold text-slate-900">Mandy@chopreality.com</div>
                <p className="mt-2 text-sm text-slate-500">歡迎提交產品意見、合作需求或購買方案查詢。</p>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 px-7 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
              >
                我知道了
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
