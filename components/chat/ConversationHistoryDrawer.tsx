import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LoaderCircle, MessageCircleMore, Plus, RefreshCw, Search, X } from "lucide-react";
import type { ConversationSummary } from "../../types/chat";
import { ConversationListItem } from "./ConversationListItem";

type ConversationGroup = {
  label: string;
  items: ConversationSummary[];
};

type ConversationHistoryDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string;
  search: string;
  refreshing?: boolean;
  selectedConversationId: string | null;
  conversations: ConversationSummary[];
  activeMenuConversationId: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onCreateConversation: () => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onToggleMenu: (conversationId: string | null) => void;
  onRenameConversation: (conversation: ConversationSummary) => void;
  onDeleteConversation: (conversation: ConversationSummary) => void;
};

function getDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupConversations(conversations: ConversationSummary[]): ConversationGroup[] {
  const now = new Date();
  const todayStart = getDayStart(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000;

  const groups: ConversationGroup[] = [
    { label: "今日", items: [] },
    { label: "昨日", items: [] },
    { label: "過去 7 天", items: [] },
    { label: "更早", items: [] },
  ];

  conversations.forEach((conversation) => {
    const time = new Date(conversation.updatedAt).getTime();
    if (time >= todayStart) {
      groups[0].items.push(conversation);
    } else if (time >= yesterdayStart) {
      groups[1].items.push(conversation);
    } else if (time >= sevenDaysAgo) {
      groups[2].items.push(conversation);
    } else {
      groups[3].items.push(conversation);
    }
  });

  return groups.filter((group) => group.items.length > 0);
}

export const ConversationHistoryDrawer: React.FC<ConversationHistoryDrawerProps> = ({
  open,
  loading,
  error,
  search,
  refreshing = false,
  selectedConversationId,
  conversations,
  activeMenuConversationId,
  onClose,
  onRefresh,
  onSearchChange,
  onCreateConversation,
  onSelectConversation,
  onToggleMenu,
  onRenameConversation,
  onDeleteConversation,
}) => {
  const groups = groupConversations(conversations);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-y-4 right-4 z-40 w-[min(88vw,360px)] overflow-hidden rounded-[28px] border border-[#E8D8BF] bg-[linear-gradient(180deg,#FFFDF8_0%,#FBF4E8_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-[#EEDFC7] px-5 py-4">
              <div className="flex items-center gap-2 text-slate-800">
                <MessageCircleMore size={18} />
                <span className="text-base font-semibold">對話紀錄</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onRefresh}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/80 hover:text-slate-800"
                  title="重新整理對話紀錄"
                >
                  {refreshing ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/80 hover:text-slate-800"
                  title="關閉對話紀錄"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-3 px-5 py-4">
              <button
                type="button"
                onClick={onCreateConversation}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F59E0B] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(245,158,11,0.3)] transition hover:bg-[#E89009]"
              >
                <Plus size={16} />
                新增對話
              </button>

              <div className="flex items-center gap-2 rounded-2xl border border-[#EADDC8] bg-white/90 px-3 py-2.5">
                <Search size={16} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="搜尋對話"
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {loading ? <div className="pt-4 text-sm text-slate-500">正在載入對話...</div> : null}
              {!loading && error ? <div className="pt-4 text-sm text-red-500">{error}</div> : null}
              {!loading && !error && conversations.length === 0 ? (
                <div className="pt-4 text-sm text-slate-500">目前沒有聊天紀錄</div>
              ) : null}
              {!loading && !error ? (
                <div className="space-y-5">
                  {groups.map((group) => (
                    <div key={group.label}>
                      <div className="mb-2 text-xs font-semibold tracking-[0.18em] text-slate-400">{group.label}</div>
                      <div className="space-y-2">
                        {group.items.map((conversation) => (
                          <ConversationListItem
                            key={conversation.id}
                            conversation={conversation}
                            selected={selectedConversationId === conversation.id}
                            menuOpen={activeMenuConversationId === conversation.id}
                            onSelect={() => onSelectConversation(conversation)}
                            onToggleMenu={() =>
                              onToggleMenu(activeMenuConversationId === conversation.id ? null : conversation.id)
                            }
                            onRename={() => onRenameConversation(conversation)}
                            onDelete={() => onDeleteConversation(conversation)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
