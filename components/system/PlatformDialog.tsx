import { uiText } from '../../utils/uiI18n';
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icons } from "../icons";

type PlatformDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "info" | "danger";
  onClose: () => void;
  onConfirm?: () => void;
};

export const PlatformDialog: React.FC<PlatformDialogProps> = ({
  open,
  title,
  message,
  confirmText = "知道了",
  cancelText,
  tone = "info",
  onClose,
  onConfirm,
}) => {
  const isConfirm = typeof onConfirm === "function";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)]"
          >
            <div className="flex items-start gap-4 p-6">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  tone === "danger"
                    ? "bg-rose-100 text-rose-600"
                    : "bg-indigo-100 text-indigo-600"
                }`}
              >
                {tone === "danger" ? (
                  <Icons.delete className="h-5 w-5" />
                ) : (
                  <Icons.helpCircle className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-900">{uiText(title)}</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                  {uiText(message)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <Icons.close className="h-4 w-4" />
              </button>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
              {isConfirm && cancelText ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  {uiText(cancelText)}
                </button>
              ) : null}
              <button
                type="button"
                onClick={isConfirm ? onConfirm : onClose}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
                  tone === "danger"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {uiText(confirmText)}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
