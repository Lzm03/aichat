import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

type InfoTipModalProps = {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
};

export const InfoTipModal: React.FC<InfoTipModalProps> = ({ open, title, body, onClose }) => (
  <AnimatePresence>
    {open ? (
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="info-tip-title"
          className="relative w-full max-w-[380px] rounded-[24px] bg-white p-[26px] shadow-[0_30px_80px_rgba(15,23,42,0.3)]"
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="關閉"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="mb-3.5 h-1 w-9 rounded-full bg-indigo-500" />
          <h4 id="info-tip-title" className="text-[17px] font-extrabold text-slate-950">{title}</h4>
          <p className="mt-2.5 whitespace-pre-line text-sm leading-[1.8] text-slate-600">{body}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-[18px] w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            瞭解
          </button>
        </motion.div>
      </motion.div>
    ) : null}
  </AnimatePresence>
);
