import { uiText, uiTemplate } from '../../../utils/uiI18n';
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Files, FolderInput, RefreshCcw, X } from 'lucide-react';

export type AssignmentMode =
  | { kind: "each" }
  | { kind: "merge-new" }
  | { kind: "merge-existing"; targetIndex: number }
  | { kind: "replace-active" };

type AssignmentModeDialogProps = {
  open: boolean;
  fileNames: string[];
  existingVersionNames: string[];
  /** 目前開啟嘅版本 index（replace 預覽 + merge-existing select 預設值） */
  activeVersionIndex?: number;
  /** active 版本係空——第一個檔會填充佢而唔佔新位（上限計算） */
  activeVersionEmpty?: boolean;
  /** 4 上限——會超上限嘅 mode 要置灰 */
  maxVersions: number;
  onConfirm: (mode: AssignmentMode) => void;
  onCancel: () => void;
};

const MODE_STORAGE_KEY = "workshop-assignment-mode";

const OPTION_TONE = (enabled: boolean, selected: boolean) =>
  selected
    ? "border-indigo-400 bg-indigo-50/70 ring-2 ring-indigo-200"
    : enabled
      ? "border-slate-200 bg-white hover:border-indigo-200"
      : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-55";

type DialogMode = "each" | "merge-new" | "merge-existing" | "replace-active";

/** 多檔上傳分配方式對話框（docs/knowledge-map-topic-versions.md 第 4.1 節） */
export const AssignmentModeDialog: React.FC<AssignmentModeDialogProps> = ({
  open,
  fileNames,
  existingVersionNames,
  activeVersionIndex,
  activeVersionEmpty = false,
  maxVersions,
  onConfirm,
  onCancel,
}) => {
  const count = fileNames.length;
  const singleFile = count === 1;
  const [mode, setMode] = useState<DialogMode>("each");
  const [targetIndex, setTargetIndex] = useState(0);

  // 記住上次揀嘅分配方式（docs §4.1 #4）；每次打開重置 target 去返當前版本
  useEffect(() => {
    if (!open) return;
    let saved: DialogMode | null = null;
    try {
      const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (raw === "each" || raw === "merge-new" || raw === "merge-existing" || raw === "replace-active") {
        saved = raw;
      }
    } catch {
      /* storage may be disabled */
    }
    setMode(saved ?? "each");
    setTargetIndex(activeVersionIndex ?? 0);
  }, [open, activeVersionIndex]);

  // 上限計算：active 版本空嗰陣，第一個檔會填充佢而唔使開新位
  const effectiveExisting = existingVersionNames.length - (activeVersionEmpty ? 1 : 0);
  const eachSlots = count - (activeVersionEmpty ? 1 : 0);
  const eachEnabled = effectiveExisting + count <= maxVersions;
  const mergeNewEnabled = !singleFile && effectiveExisting + (activeVersionEmpty ? 0 : 1) <= maxVersions;
  const mergeExistingEnabled = existingVersionNames.length > 0;
  const replaceEnabled = Boolean(singleFile);

  const enabledOf = (key: DialogMode) =>
    key === "each"
      ? eachEnabled
      : key === "merge-new"
        ? mergeNewEnabled
        : key === "merge-existing"
          ? mergeExistingEnabled
          : replaceEnabled;

  // 有效 mode：預設順序 each → replace（單檔）／merge-new（多檔）→ merge-existing；
  // 記住嘅上次選擇失效（唔適用／超上限）時自動回落。
  const effectiveMode: DialogMode = (() => {
    const candidates: DialogMode[] = singleFile
      ? ["each", "replace-active", "merge-existing"]
      : ["each", "merge-new", "merge-existing"];
    if (candidates.includes(mode) && enabledOf(mode)) return mode;
    return candidates.find((candidate) => enabledOf(candidate)) || candidates[0];
  })();

  const previewTabs = () => {
    const fileTab = (name: string) => name.replace(/\.[^.]+$/, "").slice(0, 8);
    if (effectiveMode === "replace-active") {
      const activeName = existingVersionNames[activeVersionIndex ?? 0] || uiText("當前版本");
      return `${activeName} ← ${uiText("新檔")}`;
    }
    const shown =
      effectiveMode === "each"
        ? [...existingVersionNames.slice(0, 2), ...fileNames.map(fileTab)]
        : effectiveMode === "merge-new"
          ? [...existingVersionNames.slice(0, 2), fileTab(fileNames[0] || "") || uiText("新版本")]
          : [...existingVersionNames.slice(0, 2), `${existingVersionNames[targetIndex] || uiText("現有版本")} ＋${count}`];
    const slots = effectiveMode === "each" ? eachSlots : effectiveMode === "merge-new" ? 1 : 0;
    const hidden = effectiveExisting + slots - shown.length;
    return [...shown, hidden > 0 ? `＋${hidden}…` : ""].filter(Boolean).join("][");
  };

  const confirm = () => {
    const next: AssignmentMode =
      effectiveMode === "each"
        ? { kind: "each" }
        : effectiveMode === "merge-new"
          ? { kind: "merge-new" }
          : effectiveMode === "merge-existing"
            ? { kind: "merge-existing", targetIndex }
            : { kind: "replace-active" };
    try {
      if (effectiveMode !== "replace-active") {
        window.localStorage.setItem(MODE_STORAGE_KEY, effectiveMode);
      }
    } catch {
      /* storage may be disabled */
    }
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
                className={`rounded-2xl border p-4 text-left transition ${OPTION_TONE(eachEnabled, effectiveMode === "each")}`}>
                <Files className="h-5 w-5 text-indigo-500" />
                <p className="mt-2 text-sm font-black text-slate-800">{singleFile ? uiText("開新版本") : uiText("各自獨立")}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{singleFile ? uiText("新開一個版本，檔名做版本名") : uiText("每檔一個版本")}</p>
                <p className="mt-1.5 text-[10px] leading-4 text-slate-400">{singleFile ? uiText("例：新主題獨立一個 tab") : uiText("例：語法課＋閱讀課分開教")}</p>
                <p className={`mt-2 text-[11px] font-black ${eachEnabled ? "text-emerald-600" : "text-rose-500"}`}>
                  {uiTemplate("佔 {0} 個位", eachSlots)}{eachEnabled ? " ✓" : ` ✕ ${uiText("超上限")}`}
                </p>
              </button>

              {singleFile ? (
                <button type="button" onClick={() => setMode("replace-active")}
                  className={`rounded-2xl border p-4 text-left transition ${OPTION_TONE(true, effectiveMode === "replace-active")}`}>
                  <RefreshCcw className="h-5 w-5 text-rose-500" />
                  <p className="mt-2 text-sm font-black text-slate-800">{uiText("覆蓋當前版本")}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{uiText("重新解析，取代目前打開嘅 tab 內容")}</p>
                  <p className="mt-1.5 text-[10px] leading-4 text-slate-400">{uiText("例：用新教材更新同一個單元")}</p>
                  <p className="mt-2 text-[11px] font-black text-emerald-600">{uiText("佔 0 個位")} ✓</p>
                </button>
              ) : (
                <button type="button" disabled={!mergeNewEnabled} onClick={() => setMode("merge-new")}
                  className={`rounded-2xl border p-4 text-left transition ${OPTION_TONE(mergeNewEnabled, effectiveMode === "merge-new")}`}>
                  <FolderInput className="h-5 w-5 text-emerald-500" />
                  <p className="mt-2 text-sm font-black text-slate-800">{uiText("合成一個新版本")}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{uiText("所有檔案一齊做一次提取")}</p>
                  <p className="mt-1.5 text-[10px] leading-4 text-slate-400">{uiText("例：5 個英語情境合成一課")}</p>
                  <p className={`mt-2 text-[11px] font-black ${mergeNewEnabled ? "text-emerald-600" : "text-rose-500"}`}>
                    {uiText("佔 1 個位")}{mergeNewEnabled ? " ✓" : ` ✕ ${uiText("超上限")}`}
                  </p>
                </button>
              )}

              <button type="button" disabled={!mergeExistingEnabled} onClick={() => setMode("merge-existing")}
                className={`rounded-2xl border p-4 text-left transition ${OPTION_TONE(mergeExistingEnabled, effectiveMode === "merge-existing")}`}>
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
              {effectiveMode === "each" && !eachEnabled ? (
                <p className="mt-2 text-[11px] font-black text-rose-500">
                  {uiTemplate("⚠ 每隻 Bot 最多 {0} 個版本——呢個揀法會超上限，請揀「合成」或減少檔案", maxVersions)}
                </p>
              ) : null}
              {effectiveMode === "replace-active" ? (
                <p className="mt-2 text-[11px] font-black text-rose-500">
                  {uiText("⚠ 當前分頁嘅原有知識點會被清走，確定先好繼續")}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                {uiText("取消")}
              </button>
              <button type="button" onClick={confirm} disabled={!enabledOf(effectiveMode)}
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
