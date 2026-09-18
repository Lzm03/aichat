import { uiText } from '../../../utils/uiI18n';
import { MAX_CUSTOM_CATEGORY_LABELS, TOPIC_CATEGORY_PRESETS, topicCategoryTone } from '../../../utils/topic-categories';
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, GripVertical, Plus, Star, X } from 'lucide-react';

export type TopicVersionMeta = {
  id: string | null;
  name: string;
  category: string;
  isDefault: boolean;
};

type TopicVersionTabsProps = {
  versions: TopicVersionMeta[];
  activeIndex: number;
  /** 上限（server maxTopics，預設 4） */
  maxVersions: number;
  customLabels: string[];
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onRename: (index: number, name: string) => void;
  onCategoryChange: (index: number, category: string) => void;
  onReorder: (from: number, to: number) => void;
  onAddCustomLabel: (label: string) => void;
  onSetDefault: (index: number) => void;
};

/** 知識地圖主題版本 Tab 列（docs/knowledge-map-topic-versions.md 第 1-2 節） */
export const TopicVersionTabs: React.FC<TopicVersionTabsProps> = ({
  versions,
  activeIndex,
  maxVersions,
  customLabels,
  onSelect,
  onAdd,
  onRemove,
  onRename,
  onCategoryChange,
  onReorder,
  onAddCustomLabel,
  onSetDefault,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const canAdd = versions.length < maxVersions;

  useEffect(() => {
    if (menuIndex === null) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuIndex(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuIndex]);

  const commitRename = () => {
    if (editingIndex === null) return;
    const name = editName.trim();
    if (name) onRename(editingIndex, name);
    setEditingIndex(null);
  };

  const submitCustomLabel = () => {
    const label = customInput.trim();
    if (label) onAddCustomLabel(label);
    setCustomInput("");
  };

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 pb-3">
      {versions.map((version, index) => {
        const selected = index === activeIndex;
        return (
          <div
            key={version.id ?? `local-${index}`}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => {
              if (dragIndex === null || dragIndex === index) return;
              event.preventDefault();
            }}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            onClick={() => selected || onSelect(index)}
            className={`group relative flex cursor-pointer select-none items-center gap-2 rounded-xl border px-3 py-2 transition ${
              selected
                ? "border-indigo-300 bg-white shadow-sm"
                : dragIndex === index
                  ? "border-slate-200 bg-slate-50 opacity-60"
                  : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300" />
            {editingIndex === index ? (
              <input
                autoFocus
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") setEditingIndex(null);
                }}
                onClick={(event) => event.stopPropagation()}
                className="w-28 rounded-md border border-indigo-300 px-2 py-0.5 text-xs font-bold text-slate-800 outline-none"
              />
            ) : (
              <span
                className={`max-w-[9rem] truncate text-xs font-black ${selected ? "text-indigo-700" : "text-slate-700"}`}
                title={uiText("雙擊改名")}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setEditingIndex(index);
                  setEditName(version.name);
                }}
              >
                {version.name}
              </span>
            )}

            <span className="relative" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                onClick={() => setMenuIndex(menuIndex === index ? null : index)}
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black transition ${topicCategoryTone(version.category)}`}
              >
                {version.category || uiText("未分類")}
                <ChevronDown className="h-3 w-3" />
              </button>
              {menuIndex === index ? (
                <div
                  ref={menuRef}
                  className="absolute left-0 top-full z-30 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
                >
                  {TOPIC_CATEGORY_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        onCategoryChange(index, preset);
                        setMenuIndex(null);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {preset}
                      {version.category === preset ? <Check className="h-3.5 w-3.5 text-indigo-500" /> : null}
                    </button>
                  ))}
                  {customLabels.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        onCategoryChange(index, label);
                        setMenuIndex(null);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {label}
                      {version.category === label ? <Check className="h-3.5 w-3.5 text-indigo-500" /> : null}
                    </button>
                  ))}
                  <div className="my-1 border-t border-slate-100" />
                  {customLabels.length < MAX_CUSTOM_CATEGORY_LABELS ? (
                    <div className="px-1.5 pb-1">
                      <input
                        value={customInput}
                        onChange={(event) => setCustomInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            const label = customInput.trim();
                            if (label) {
                              onAddCustomLabel(label);
                              onCategoryChange(index, label);
                              setMenuIndex(null);
                            }
                            setCustomInput("");
                          }
                        }}
                        placeholder={uiText("＋ 自訂標籤…")}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-300"
                        maxLength={12}
                      />
                    </div>
                  ) : (
                    <p className="px-2 py-1 text-[10px] font-bold text-slate-400" title={uiText("最多 10 個自訂標籤，可先刪除唔再用嘅")}>
                      {uiText("自訂標籤已滿（最多 10 個）")}
                    </p>
                  )}
                </div>
              ) : null}
            </span>

            <button
              type="button"
              title={uiText("設為默認版本")}
              onClick={(event) => {
                event.stopPropagation();
                onSetDefault(index);
              }}
              className={`rounded p-0.5 transition ${version.isDefault ? "text-amber-400" : "text-slate-200 hover:text-amber-300"}`}
            >
              <Star className={`h-3.5 w-3.5 ${version.isDefault ? "fill-current" : ""}`} />
            </button>
            {versions.length > 1 ? (
              <button
                type="button"
                title={uiText("刪除版本")}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(index);
                }}
                className="rounded p-0.5 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        disabled={!canAdd}
        title={canAdd ? uiText("新增主題版本") : uiText("每隻 Bot 最多 4 個主題版本")}
        className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        {uiText("新增版本")}
      </button>
    </div>
  );
};
