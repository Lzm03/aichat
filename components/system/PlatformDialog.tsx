import { uiText } from '../../utils/uiI18n';
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { Icons } from "../icons";

/** Above this many rows the list starts collapsed behind a toggle, so a long
 * import result shows a one-line summary instead of a wall of text. */
const DETAILS_AUTO_EXPAND_LIMIT = 20;

type PlatformDialogProps = {
  open: boolean;
  title: string;
  message: string;
  /** One entry per row; rendered as a scrollable list under the message. */
  details?: string[];
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
  details,
  confirmText = "知道了",
  cancelText,
  tone = "info",
  onClose,
  onConfirm,
}) => {
  const isConfirm = typeof onConfirm === "function";
  const [showDetails, setShowDetails] = useState(false);

  const detailLines = details ?? [];
  const detailsExpanded = detailLines.length <= DETAILS_AUTO_EXPAND_LIMIT || showDetails;

  useBodyScrollLock(open);

  // Every new message starts collapsed, so the toggle never carries over.
  useEffect(() => {
    if (open) setShowDetails(false);
  }, [open, title, message, details]);

  // The X button is not enough on its own: a dialog that fills the screen still
  // needs a way out that does not depend on hitting a small target.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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
            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)]"
          >
            {/* min-h-0 + flex-1 keeps this row the only growable part, so the
                card stops at 90vh and the footer below always stays on screen.
                The scrolling box is sized by flex (not by a percentage height,
                which does not resolve against an auto-height ancestor), so a
                long message scrolls instead of being clipped. */}
            <div className="flex min-h-0 flex-1 gap-4 p-6">
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
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <h3 className="shrink-0 text-lg font-bold text-slate-900">{uiText(title)}</h3>
                <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                  <p className="whitespace-pre-line text-sm leading-6 text-slate-600">
                    {uiText(message)}
                  </p>
                  {detailLines.length ? (
                    <div className="mt-3">
                      {detailLines.length > DETAILS_AUTO_EXPAND_LIMIT ? (
                        <button
                          type="button"
                          onClick={() => setShowDetails((current) => !current)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          {detailsExpanded ? uiText('收起詳細名單') : uiText('查看詳細名單')}
                          <Icons.down
                            className={`h-3.5 w-3.5 transition ${detailsExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      ) : null}
                      {detailsExpanded ? (
                        <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                          {detailLines.map((line, index) => (
                            <p
                              key={`${index}-${line}`}
                              className="select-text break-all font-mono text-xs leading-5 text-slate-700"
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 self-start rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <Icons.close className="h-4 w-4" />
              </button>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 px-6 py-4">
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
