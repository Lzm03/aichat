import React from "react";
import { Check, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import type { ConversationSummary } from "../../types/chat";

function formatUpdatedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ConversationListItemProps = {
  conversation: ConversationSummary;
  selected: boolean;
  menuOpen: boolean;
  selectionMode?: boolean;
  checked?: boolean;
  onSelect: () => void;
  onToggleSelected?: () => void;
  onToggleMenu: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export const ConversationListItem: React.FC<ConversationListItemProps> = ({
  conversation,
  selected,
  menuOpen,
  selectionMode = false,
  checked = false,
  onSelect,
  onToggleSelected,
  onToggleMenu,
  onRename,
  onDelete,
}) => {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={selectionMode ? onToggleSelected : onSelect}
        aria-pressed={selectionMode ? checked : undefined}
        className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${
          selectionMode && checked
            ? "border-[#E8B86D] bg-[#FFF8ED] shadow-[0_10px_24px_rgba(148,101,29,0.1)]"
            : selected
            ? "border-[#E8B86D] bg-[#FFF8ED] shadow-[0_10px_24px_rgba(148,101,29,0.12)]"
            : "border-[#EEE2CF] bg-white/90 hover:bg-[#FFFDF8]"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{conversation.title}</div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
              {conversation.lastMessagePreview || "尚未開始對話"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400">{formatUpdatedTime(conversation.updatedAt)}</span>
            {selectionMode ? (
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 items-center justify-center rounded-lg border transition ${
                  checked
                    ? "border-[#D99A3E] bg-[#E1A04B] text-white"
                    : "border-[#D8C9B1] bg-white text-transparent"
                }`}
              >
                <Check size={14} strokeWidth={3} />
              </span>
            ) : (
              <span
                role="button"
                tabIndex={0}
                aria-label={`開啟「${conversation.title}」選單`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleMenu();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleMenu();
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-[#F7EEDC] hover:text-slate-700"
              >
                <MoreHorizontal size={16} />
              </span>
            )}
          </div>
        </div>
      </button>
      {!selectionMode && menuOpen ? (
        <div className="absolute right-3 top-12 z-20 w-32 rounded-2xl border border-[#EADAC0] bg-[#FFFDF8] p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
          <button
            type="button"
            onClick={onRename}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-[#F7EEDC]"
          >
            <Pencil size={14} />
            重新命名
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500 transition hover:bg-[#FFF1EB]"
          >
            <Trash2 size={14} />
            刪除
          </button>
        </div>
      ) : null}
    </div>
  );
};
