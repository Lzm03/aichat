import { uiText, uiTemplate } from '../../../utils/uiI18n';
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Files, FolderInput, X } from 'lucide-react';

export type AssignmentMode =
  | { kind: "each" }
  | { kind: "merge-new" }
  | { kind: "merge-existing"; targetIndex: number };

type AssignmentModeDialogProps = {
  open: boolean;
  fileNames: string[];
  existingVersionNames: string[];
  /** 4 上限——會超上限嘅 mode 要置灰 */
  maxVersions: number;
  onConfirm: (mode: AssignmentMode) => void;
  onCancel: () => void;
};

const OPTION_TONE = (enabled: boolean, selected: boolean) =>
  selected
    ? "border-indigo-400 bg-indigo-50/70 ring-2 ring-indigo-200"
    : enabled
      ? "border-slate-200 bg-white hover:border-indigo-200"
      : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-55";

/** 多檔上傳分配方式對話框（docs/knowledge-map-topic-versions.md 第 4.1 節） */
export const AssignmentModeDialog: React.FC<AssignmentModeDialogProps> = ({
  open,
  fileNames,
  existingVersionNames,
  maxVersions,
  onConfirm,
  onCancel,
}) => {
  const [mode, setMode] = useState<"each" | "merge-new" | "merge-existing">("each");
  const [targetIndex, setTargetIndex] = useState(0);

  const count = fileNames.length;
  const eachEnabled = existingVersionNames.length + count <= maxVersions;
  const mergeNewEnabled = existingVersionNames.length + 1 <= maxVersions;
  const mergeExistingEnabled = existingVersionNames.length > 0;
  const defaultMode = eachEnabled ? "each" : mergeNewEnabled ? "merge-new" : "merge-existing";
  const active = eachEnabled || mergeNewEnabled || mergeExistingEnabled ? (eachEnabled && mode === "each" ? "each" : !eachEnabled && mergeNewEnabled && mode === "each" ? defaultMode : mode) : "merge-new";

  const previewTabs = () => {
    const shown = active === "each"
      ? [...existingVersionNames.slice(0, 2), ...fileNames.map((name) => name.replace(/\.[^.]+$/, "").slice(0, 8))]
      : active === "merge-new"
        ? [...existingVersionNames.slice(0, 2), fileNames[0]?.replace(/\.[^.]+$/, "").slice(0, 8) || "新版本"]
        : [...existingVersionNames.slice(0, 2), `${existingVersionNames[targetIndex] || "現有版本"} ＋${count}`];
    const hidden = existingVersionNames.length + fileNames.length - shown.length;
    return [...shown, hidden > 0 ? `＋${hidden}…` : ""].filter(Boolean).join("][");
  };

  const confirm = () => {
    const next: AssignmentMode =
      active === "each" ? { kind: "each" }
        : active === "merge-new" ? { kind: "merge-new" }
          : { kind: "merge-existing", targetIndex };
    onConfirm(next);
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/30" onClick={onCancel} aria-hidden="true" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">{uiTemplate("開始解析前：呢 {0} 個檔案想點整理？", count)}</h3>
                <p className="mt-1 text-xs text-slate-500">{uiText("唔同主題建議分開；同一主題嘅多個檔案可以合成一個版本")}</p>
              </div>
              <button type="button" onClick={onCancel} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <button type="button" disabled={!eachEnabled} onClick={() => setMode("each")}
                className={`rounded-2xl border p-4 text-left transition ${OPTION_TONE(eachEnabled, active === "each")}`}>
                <Files className="h-5 w-5 text-indigo-500" />
                <p className="mt-2 text-sm font-black text-slate-800">{uiText("各自獨立")}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{uiText("每檔一個版本")}</p>
                <p className="mt-1.5 text-[10px] leading-4 text-slate-400">{uiText("例：語法課＋閱讀課分開教")}</p>
                <p className={`mt-2 text-[11px] font-black ${eachEnabled ? "text-emerald-600" : "text-rose-500"}`}>
                  {uiTemplate("佔 {0} 個位", count)}{eachEnabled ? " ✓" : ` ✕ ${uiText("超上限")}`}
                </p>
              </button>

              <button type="button" disabled={!mergeNewEnabled} onClick={() => setMode("merge-new")}
                className={`rounded-2xl border p-4 text-left transition ${OPTION_TONE(mergeNewEnabled, active === "merge-new")}`}>
                <FolderInput className="h-5 w-5 text-emerald-500" />
                <p className="mt-2 text-sm font-black text-slate-800">{uiText("合成一個新版本")}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{uiText("所有檔案一齊做一次提取")}</p>
                <p className="mt-1.5 text-[10px] leading-4 text-slate-400">{uiText("例：5 個英語情境合成一課")}</p>
                <p className={`mt-2 text-[11px] font-black ${mergeNewEnabled ? "text-emerald-600" : "text-rose-500"}`}>
                  {uiText("佔 1 個位")}{mergeNewEnabled ? " ✓" : ` ✕ ${uiText("超上限")}`}
                </p>
              </button>

              <button type="button" disabled={!mergeExistingEnabled} onClick={() => setMode("merge-existing")}
                className={`rounded-2xl border p-4 text-left transition ${OPTION_TONE(mergeExistingEnabled, active === "merge-existing")}`}>
                <FileText className="h-5 w-5 text-amber-500" />
                <p className="mt-2 text-sm font-black text-slate-800">{uiText("加進現有版本")}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{uiText("補充材料入已有 tab")}</p>
                <div className="mt-2" onClick={(event) => event.stopPropagation()}>
                  <select
                    value={targetIndex}
                    onChange={(event) => setTargetIndex(Number(event.target.value))}
                    disabled={!mergeExistingEnabled}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-300"
                  >
                    {existingVersionNames.map((name, index) => (
                      <option key={name} value={index}>{name}</option>
                    ))}
                  </select>
                </div>
                <p className={`mt-2 text-[11px] font-black ${mergeExistingEnabled ? "text-emerald-600" : "text-slate-400"}`}>
                  {uiText("佔 0 個位")}{mergeExistingEnabled ? " ✓" : ""}
                </p>
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold text-slate-400">{uiText("結果預覽（跟住上面揀咗嘅即時變）")}</p>
              <p className="mt-1.5 flex flex-wrap gap-1 text-[11px] font-black text-slate-700">
                {previewTabs().split("][").map((tab, index) => (
                  <span key={index} className="rounded-lg border border-slate-200 bg-white px-2 py-1">{tab.replace(/^\[|\]$/g, "")}</span>
                ))}
              </p>
              {active === "each" && !eachEnabled ? (
                <p className="mt-2 text-[11px] font-black text-rose-500">
                  {uiTemplate("⚠ 每隻 Bot 最多 {0} 個版本——呢個揀法會超上限，請揀「合成」或減少檔案", maxVersions)}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                {uiText("取消")}
              </button>
              <button type="button" onClick={confirm} disabled={!eachEnabled && !mergeNewEnabled && !mergeExistingEnabled}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">
                {uiText("開始解析")}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
