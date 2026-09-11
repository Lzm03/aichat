import { uiText, uiTemplate } from "../../../utils/uiI18n";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, Link, Search, ShieldCheck, UsersRound, X } from "lucide-react";
import type { AiBot } from "../../../types";

export type BotAccessMode = "link" | "group";

export type PermissionStudent = {
  id: string;
  fullName: string;
  email: string;
  groupIds?: string[];
};

export type PermissionGroup = {
  id: string;
  name: string;
  type: "class";
  studentIds: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  bots: AiBot[];
  groups: PermissionGroup[];
  students: PermissionStudent[];
  initialSelectedBotId?: string | null;
  // 單 Bot 編輯模式（班級分配總覽「編輯班級」）：隱藏 bot 切換同存取模式，直接改授權
  singleBotId?: string | null;
  initialGroupIds?: string[];
  initialExcludedStudentIds?: string[];
  onSave?: (payload: { groupIds: string[]; excludedStudentIds: string[] }) => void;
  saving?: boolean;
  saveError?: string;
  // 空狀態跳去學生管理（in-app 導航；冇提供時 fallback 到 /student-management 連結）
  onGoStudentManagement?: () => void;
};

type Selection = {
  mode: BotAccessMode;
  groupIds: string[];
  studentIds: string[];
};

const DEFAULT_SELECTION: Selection = {
  mode: "group",
  groupIds: [],
  studentIds: [],
};

export const BotPermissionDrawer: React.FC<Props> = ({
  open,
  onClose,
  bots,
  groups,
  students,
  initialSelectedBotId,
  singleBotId = null,
  initialGroupIds = [],
  initialExcludedStudentIds = [],
  onSave,
  saving = false,
  saveError = "",
  onGoStudentManagement,
}) => {
  const publishedBots = useMemo(
    () => bots.filter((bot) => bot.isVisible !== false),
    [bots]
  );

  const isSingleBotMode = Boolean(singleBotId);

  const [selectedBotId, setSelectedBotId] = useState(initialSelectedBotId || publishedBots[0]?.id || "");
  const [mode, setMode] = useState<BotAccessMode>("group");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");

  // 單 Bot 模式：開 Drawer 後等資料就緒，預載現有授權（只做一次）
  const prefillDone = useRef(false);
  useEffect(() => {
    if (!open) {
      prefillDone.current = false;
      return;
    }
    if (!isSingleBotMode || prefillDone.current) return;
    if (!students.length || !groups.length) return;
    prefillDone.current = true;
    const groupIds = (initialGroupIds || []).filter((id) => groups.some((group) => group.id === id));
    setSelectedGroupIds(groupIds);
    const excluded = new Set(initialExcludedStudentIds || []);
    const included = students
      .filter((student) => student.groupIds?.some((groupId) => groupIds.includes(groupId)))
      .map((student) => student.id)
      .filter((id) => !excluded.has(id));
    setSelectedStudentIds(included);
  }, [open, isSingleBotMode, initialGroupIds, initialExcludedStudentIds, students, groups]);

  const selectedGroupStudentIds = useMemo(() => {
    const idSet = new Set<string>();
    groups.filter((group) => selectedGroupIds.includes(group.id)).forEach((group) => group.studentIds.forEach((id) => idSet.add(id)));
    return idSet;
  }, [groups, selectedGroupIds]);

  const explicitlyExcludedStudentIds = useMemo(
    () => Array.from(selectedGroupStudentIds).filter((id) => !selectedStudentIds.includes(id)),
    [selectedGroupStudentIds, selectedStudentIds]
  );

  const finalSelectedStudentIds = useMemo(
    () => new Set([...selectedStudentIds]),
    [selectedStudentIds]
  );

  const visibleStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    // 單 Bot 模式：排除名單只顯示已勾選班級內嘅學生
    const scoped = isSingleBotMode
      ? students.filter((student) => student.groupIds?.some((groupId) => selectedGroupIds.includes(groupId)))
      : students;
    const sorted = [...scoped].sort((a, b) => a.fullName.localeCompare(b.fullName));
    return q
      ? sorted.filter((student) => `${student.fullName} ${student.email}`.toLowerCase().includes(q))
      : sorted;
  }, [studentQuery, students, isSingleBotMode, selectedGroupIds]);

  const selectedBot = publishedBots.find((bot) => bot.id === selectedBotId) || publishedBots[0] || null;

  const hasGroupSelection = selectedGroupIds.length > 1 || (selectedGroupIds.length === 1 && explicitlyExcludedStudentIds.length > 0);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  };

  const resetSelection = () => {
    setMode("group");
    setSelectedGroupIds([]);
    setSelectedStudentIds([]);
    setStudentQuery("");
  };

  const handleBotChange = (botId: string) => {
    setSelectedBotId(botId);
    resetSelection();
  };

  const saveButtonDisabled = isSingleBotMode
    ? saving
    : mode === "group" && !finalSelectedStudentIds.size;

  const applySelection = () => {
    if (saveButtonDisabled) return;
    if (isSingleBotMode && onSave) {
      onSave({ groupIds: selectedGroupIds, excludedStudentIds: explicitlyExcludedStudentIds });
      return;
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="pointer-events-none fixed inset-0 z-[95]">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            className="pointer-events-auto absolute right-0 top-0 h-full w-[min(480px,100vw)] border-l border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between border-b border-slate-100 px-5 py-5">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" />
                    {isSingleBotMode ? uiText("班級授權") : uiText("Bot 權限管理")}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {isSingleBotMode
                      ? uiText("管理此 Bot 可存取的班級與學生。")
                      : uiText("管理已發佈 Bot 可分配的班級與學生。")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {!isSingleBotMode && (
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    {uiText("選擇已發佈 Bot")}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {publishedBots.map((bot) => {
                      const active = bot.id === selectedBot?.id;
                      return (
                        <button
                          key={bot.id}
                          type="button"
                          onClick={() => handleBotChange(bot.id)}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition ${
                            active
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/40"
                          }`}
                        >
                          <img
                            src={bot.avatarUrl || "/avatars/bot-default.svg"}
                            alt=""
                            className="h-6 w-6 rounded-full bg-slate-100 object-cover"
                          />
                          <span className="truncate">{bot.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                )}

                {!isSingleBotMode && (
                <div className="mt-7">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    {uiText("存取模式")}
                  </div>
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => setMode("group")}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                        mode === "group"
                          ? "border-indigo-300 bg-indigo-50/60 shadow-[0_10px_28px_rgba(79,70,229,0.08)]"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${mode === "group" ? "bg-indigo-200 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                        <UsersRound className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-black text-slate-900">{uiText("特定班級")}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{uiText("僅限指定名單成員存取")}</span>
                      </span>
                      <Check className={`ml-auto h-4 w-4 ${mode === "group" ? "text-indigo-600" : "text-transparent"}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMode("link");
                        setSelectedGroupIds([]);
                        setSelectedStudentIds([]);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                        mode === "link"
                          ? "border-indigo-300 bg-indigo-50/60 shadow-[0_10px_28px_rgba(79,70,229,0.08)]"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${mode === "link" ? "bg-indigo-200 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                        <Link className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-black text-slate-900">{uiText("任何擁有連結的人")}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{uiText("組織內使用者可憑連結存取")}</span>
                      </span>
                      <Check className={`ml-auto h-4 w-4 ${mode === "link" ? "text-indigo-600" : "text-transparent"}`} />
                    </button>
                  </div>
                </div>
                )}

                {mode === "group" && (
                  <div className="mt-7">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                      {uiText("班級")}
                    </div>

                    {groups.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {groups.map((group) => {
                          const selected = selectedGroupIds.includes(group.id);
                          const expanded = expandedGroupIds.includes(group.id);
                          return (
                            <div key={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  onClick={() => toggleGroup(group.id)}
                                  className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3.5 text-left"
                                >
                                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-transparent"}`}>
                                    {selected ? <Check className="h-4 w-4" /> : null}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-black text-slate-900">{group.name}</span>
                                    <span className="mt-0.5 block text-xs text-slate-500">
                                      {uiText("班級")} · {group.studentIds.length}{uiText(" 位學生")}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleGroupExpand(group.id)}
                                  className="p-3.5 text-slate-400 hover:text-slate-700"
                                >
                                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                              </div>
                              {expanded ? (
                                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                                  {group.studentIds.length > 0 ? (
                                    <div className="space-y-2">
                                      {students.filter((student) => group.studentIds.includes(student.id)).map((student) => (
                                        <StudentPermissionRow
                                          key={student.id}
                                          student={student}
                                          selected={finalSelectedStudentIds.has(student.id)}
                                          onToggle={() => toggleStudent(student.id)}
                                          onShowDetail={() => {
                                            setSelectedGroupIds([group.id]);
                                            setSelectedStudentIds((current) => current.includes(student.id) ? current : [...current, student.id]);
                                          }}
                                        />
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="py-2 text-sm text-slate-400">{uiText("此班級暫無學生")}</p>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
                        <p className="text-sm font-semibold text-slate-600">{uiText("暫時未有班級")}</p>
                        {onGoStudentManagement ? (
                          <button type="button" onClick={onGoStudentManagement} className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:underline">
                            {uiText("前往學生管理加入學生並建立班級")}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <a href="/student-management" className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:underline">
                            {uiText("前往學生管理加入學生並建立班級")}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {mode === "group" && students.length > 0 && (!isSingleBotMode || selectedGroupIds.length > 0) && (
                  <div className="mt-7">
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                      {isSingleBotMode ? uiText("排除學生") : uiText("未分組學生")}
                    </div>
                    <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input
                        value={studentQuery}
                        onChange={(event) => setStudentQuery(event.target.value)}
                        placeholder={uiText("搜尋學生姓名或電郵")}
                        className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div className="mt-2 space-y-2">
                      {visibleStudents.map((student) => (
                        <StudentPermissionRow key={student.id} student={student} selected={finalSelectedStudentIds.has(student.id)} onToggle={() => toggleStudent(student.id)} />
                      ))}
                      {visibleStudents.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-400">{uiText("沒有符合條件的學生")}</p>
                      ) : null}
                    </div>
                  </div>
                )}

                {mode === "group" && students.length === 0 ? (
                  <div className="mt-7 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
                    <p className="text-sm font-semibold text-slate-600">{uiText("尚未加入學生")}</p>
                    <p className="mt-1 text-xs text-slate-400">{uiText("前往學生管理加入學生後，方可為 Bot 分配權限。")}</p>
                    {onGoStudentManagement ? (
                      <button type="button" onClick={onGoStudentManagement} className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:underline">
                        {uiText("前往學生管理")}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <a href="/student-management" className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:underline">
                        {uiText("前往學生管理")}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-slate-100 px-5 py-4">
                {mode === "group" && (
                  <div className="mb-3 text-xs text-slate-500">
                    {uiText("已選 ")}<span className="font-black text-slate-900">{finalSelectedStudentIds.size}</span>{uiText(" 位學生")}
                  </div>
                )}
                {isSingleBotMode && saveError ? (
                  <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{saveError}</p>
                ) : null}
                <button
                  type="button"
                  onClick={applySelection}
                  disabled={saveButtonDisabled}
                  className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {isSingleBotMode
                    ? saving
                      ? uiText("儲存中...")
                      : uiText("儲存變更")
                    : mode === "link"
                    ? uiText("完成設定")
                    : uiText("儲存分享設定")}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

const StudentPermissionRow: React.FC<{
  student: PermissionStudent;
  selected: boolean;
  onToggle: () => void;
  onShowDetail?: () => void;
}> = ({ student, selected, onToggle, onShowDetail }) => {
  return (
    <button
      type="button"
      onClick={onShowDetail || onToggle}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        selected
          ? "border-indigo-200 bg-indigo-50/70"
          : "border-slate-100 bg-white hover:border-slate-200"
      }`}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-transparent"}`}>
        {selected ? <Check className="h-4 w-4" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-slate-900">{student.fullName}</span>
        <span className="block truncate text-xs text-slate-500">{student.email}</span>
      </span>
    </button>
  );
};
