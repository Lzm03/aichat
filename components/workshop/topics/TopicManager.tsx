import React, { useEffect, useState } from "react";
import { BookOpen, Check, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { usePlatformDialog } from "../../../hooks/usePlatformDialog";
import { PlatformDialog } from "../../system/PlatformDialog";
import {
  createCharacterTopic,
  deleteCharacterTopic,
  getCharacterTopic,
  listCharacterTopics,
  updateCharacterTopic,
} from "../../../utils/topic-api";
import type {
  CharacterTopicDetail,
  CharacterTopicInput,
  CharacterTopicSummary,
} from "../../../types/topics";

const EMPTY_TOPIC: CharacterTopicInput = {
  name: "",
  description: "",
  systemPrompt: "",
  knowledgeContent: "",
  isDefault: false,
};

const topicToForm = (topic: CharacterTopicDetail): CharacterTopicInput => ({
  name: topic.name,
  description: topic.description,
  systemPrompt: topic.systemPrompt,
  knowledgeContent: topic.knowledgeContent,
  isDefault: topic.isDefault,
});

type TopicManagerProps = {
  characterId: string | null;
};

export const TopicManager: React.FC<TopicManagerProps> = ({ characterId }) => {
  const [topics, setTopics] = useState<CharacterTopicSummary[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [form, setForm] = useState<CharacterTopicInput>(EMPTY_TOPIC);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(Boolean(characterId));
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [maxTopics, setMaxTopics] = useState(4);
  const { dialog, closeDialog, showConfirm } = usePlatformDialog();

  const loadTopics = async (preferredTopicId?: string | null) => {
    if (!characterId) return [];
    const data = await listCharacterTopics(characterId);
    setTopics(data.topics);
    setMaxTopics(data.maxTopics || 4);
    const nextId =
      (preferredTopicId && data.topics.some((topic) => topic.id === preferredTopicId)
        ? preferredTopicId
        : null) ||
      data.topics.find((topic) => topic.isDefault)?.id ||
      data.topics[0]?.id ||
      null;
    setSelectedTopicId(nextId);
    return data.topics;
  };

  useEffect(() => {
    let cancelled = false;
    setError("");
    setSavedNotice("");
    setIsCreating(false);
    setIsEditing(false);
    setForm(EMPTY_TOPIC);
    if (!characterId) {
      setTopics([]);
      setSelectedTopicId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void listCharacterTopics(characterId)
      .then((data) => {
        if (cancelled) return;
        setTopics(data.topics);
        setMaxTopics(data.maxTopics || 4);
        setSelectedTopicId(
          data.topics.find((topic) => topic.isDefault)?.id || data.topics[0]?.id || null
        );
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "無法載入主題");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  useEffect(() => {
    let cancelled = false;
    if (!characterId || !selectedTopicId || isCreating) return;
    setDetailLoading(true);
    setError("");
    void getCharacterTopic(characterId, selectedTopicId)
      .then((topic: CharacterTopicDetail) => {
        if (cancelled) return;
        setForm(topicToForm(topic));
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "無法載入主題內容");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [characterId, isCreating, selectedTopicId]);

  const selectTopic = (topicId: string) => {
    if (saving || deletingId) return;
    if (!isCreating && topicId === selectedTopicId) return;
    setIsCreating(false);
    setIsEditing(false);
    setSavedNotice("");
    setSelectedTopicId(topicId);
  };

  const startEditing = (topicId: string) => {
    if (saving || deletingId) return;
    setIsCreating(false);
    setIsEditing(true);
    setSavedNotice("");
    setSelectedTopicId(topicId);
  };

  const startCreating = () => {
    if (topics.length >= maxTopics) return;
    setIsCreating(true);
    setIsEditing(false);
    setSelectedTopicId(null);
    setSavedNotice("");
    setError("");
    setForm({ ...EMPTY_TOPIC, isDefault: topics.length === 0 });
  };

  const saveTopic = async () => {
    if (!characterId || saving || (!isCreating && !isEditing)) return;
    if (!form.name.trim()) {
      setError("請輸入主題名稱。");
      return;
    }
    setSaving(true);
    setError("");
    setSavedNotice("");
    try {
      const saved = isCreating
        ? await createCharacterTopic(characterId, form)
        : await updateCharacterTopic(characterId, selectedTopicId!, form);
      setIsCreating(false);
      setIsEditing(false);
      await loadTopics(saved.id);
      setSavedNotice(`已儲存「${saved.name}」。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = async () => {
    setIsEditing(false);
    setError("");
    if (!characterId || !selectedTopicId) return;
    setDetailLoading(true);
    try {
      const topic = await getCharacterTopic(characterId, selectedTopicId);
      setForm(topicToForm(topic));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法重新載入主題內容");
    } finally {
      setDetailLoading(false);
    }
  };

  const requestDelete = (topic: CharacterTopicSummary) => {
    if (!characterId || deletingId) return;
    showConfirm({
      title: `刪除「${topic.name}」？`,
      message: topic.isDefault
        ? "這是目前的預設主題。刪除後，系統會自動把下一個主題設為預設，相關對話也會安全轉移。"
        : "相關對話會自動轉移至其餘主題，既有訊息不會被刪除。",
      confirmText: "刪除主題",
      cancelText: "取消",
      tone: "danger",
      onConfirm: async () => {
        setDeletingId(topic.id);
        setError("");
        try {
          const result = await deleteCharacterTopic(characterId, topic.id);
          setIsCreating(false);
          setIsEditing(false);
          await loadTopics(result.defaultTopicId);
          setSavedNotice(`已刪除「${topic.name}」。`);
        } catch (deleteError) {
          setError(deleteError instanceof Error ? deleteError.message : "刪除失敗，請稍後再試。");
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  if (!characterId) {
    return (
      <section id="topic-versions" className="scroll-mt-36 border-t border-slate-200 pt-10">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">04</span>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">主題版本</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">發布角色後，可為不同教學情境建立獨立主題。</p>
          </div>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-indigo-50 px-4 py-4 text-indigo-900">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">主題版本會在角色首次發布後啟用</h3>
            <p className="mt-1 text-xs leading-5 text-indigo-700">
              目前先完成角色的基礎知識；發布後再次編輯，即可新增最多四個獨立主題。
            </p>
          </div>
        </div>
      </section>
    );
  }

  const limitReached = topics.length >= maxTopics;
  const activeSummary = topics.find((topic) => topic.id === selectedTopicId);
  const topicIsEditable = isCreating || isEditing;

  return (
    <section id="topic-versions" className="scroll-mt-36 border-t border-slate-200 pt-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">04</span>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">主題版本</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              身份與説話風格保持一致；每個主題擁有獨立提示與背景知識。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:justify-end">
          <span className="text-xs font-bold text-slate-400">{topics.length} / {maxTopics}</span>
          <button
            type="button"
            onClick={startCreating}
            disabled={limitReached || loading || saving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            <Plus className="h-4 w-4" />
            建立新主題
          </button>
        </div>
      </div>

      {limitReached ? <p className="mt-3 text-right text-xs font-semibold text-amber-600">每個角色最多可建立 4 個主題。</p> : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}
      {savedNotice ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          <Check className="h-4 w-4" /> {savedNotice}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-44 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在載入主題…
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(220px,0.72fr)_minmax(0,1.6fr)]">
          <div className="space-y-2" aria-label="角色主題列表">
            {topics.map((topic) => {
              const selected = topic.id === selectedTopicId && !isCreating;
              return (
                <motion.div
                  layout
                  key={topic.id}
                  onClick={() => selectTopic(topic.id)}
                  className={`group cursor-pointer rounded-xl border px-4 py-3.5 transition ${
                    selected
                      ? "border-indigo-300 bg-indigo-50/80 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {topic.isDefault ? <Star className="h-4 w-4 fill-current" /> : <BookOpen className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-black text-slate-900">{topic.name}</h3>
                        {topic.isDefault ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">預設</span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {topic.description || "尚未加入主題説明"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-slate-200/70 pt-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        startEditing(topic.id);
                      }}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition ${
                        selected && isEditing
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 hover:bg-white hover:text-indigo-600"
                      }`}
                    >
                      <Pencil className="h-3.5 w-3.5" /> 編輯
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        requestDelete(topic);
                      }}
                      disabled={topics.length <= 1 || deletingId === topic.id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-35"
                      title={topics.length <= 1 ? "至少需要保留一個主題" : "刪除主題"}
                    >
                      {deletingId === topic.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      刪除
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={isCreating ? "new" : selectedTopicId || "empty"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className={`min-w-0 rounded-2xl p-4 transition-colors sm:p-5 ${
                topicIsEditable ? "bg-indigo-50/45 ring-1 ring-indigo-100" : "bg-slate-100/90"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-400">
                    {isCreating ? "新增主題" : activeSummary?.isDefault ? "預設主題" : "主題設定"}
                  </div>
                  <h3 className="mt-1 text-lg font-black text-slate-900">
                    {isCreating ? "建立主題" : activeSummary?.name || "主題設定"}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {!isCreating ? (
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      isEditing ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-500"
                    }`}>
                      {isEditing ? "編輯中" : "僅供檢視"}
                    </span>
                  ) : null}
                  {detailLoading ? <Loader2 className="h-5 w-5 animate-spin text-indigo-500" /> : null}
                </div>
              </div>

              <fieldset disabled={detailLoading || saving || !topicIsEditable} className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-black text-slate-700">主題名稱 <span className="text-rose-500">*</span></span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    maxLength={80}
                    placeholder="例如：閱讀理解"
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200/70 disabled:text-slate-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black text-slate-700">主題説明</span>
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    maxLength={500}
                    rows={2}
                    placeholder="簡短説明這個主題能協助學生什麼。"
                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:resize-none disabled:border-slate-200 disabled:bg-slate-200/70 disabled:text-slate-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black text-slate-700">主題專屬提示</span>
                  <textarea
                    value={form.systemPrompt}
                    onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))}
                    maxLength={12000}
                    rows={5}
                    placeholder="描述此主題的教學目標、回答策略與限制。角色身份與基本風格會由系統保留。"
                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 font-mono text-xs leading-6 text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:resize-none disabled:border-slate-200 disabled:bg-slate-200/70 disabled:text-slate-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-black text-slate-700">主題背景知識</span>
                  <textarea
                    value={form.knowledgeContent}
                    onChange={(event) => setForm((current) => ({ ...current, knowledgeContent: event.target.value }))}
                    maxLength={100000}
                    rows={8}
                    placeholder="貼上只屬於這個主題的知識內容；切換主題後，其他主題的內容不會同時注入。"
                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:resize-none disabled:border-slate-200 disabled:bg-slate-200/70 disabled:text-slate-500"
                  />
                </label>
                <label className={`flex min-h-11 items-center justify-between gap-4 rounded-xl border border-slate-200 px-3.5 py-2.5 ${
                  topicIsEditable ? "cursor-pointer bg-white" : "cursor-not-allowed bg-slate-200/70"
                }`}>
                  <span>
                    <span className="block text-sm font-bold text-slate-800">設為預設主題</span>
                    <span className="block text-xs text-slate-500">新對話未指定主題時會自動使用</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))}
                    className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </label>
              </fieldset>

              {topicIsEditable ? (
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (isCreating) {
                        setIsCreating(false);
                        setSelectedTopicId(topics.find((topic) => topic.isDefault)?.id || topics[0]?.id || null);
                        return;
                      }
                      void cancelEditing();
                    }}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveTopic()}
                    disabled={saving || detailLoading || !form.name.trim()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {isCreating ? "建立主題" : "儲存變更"}
                  </button>
                </div>
              ) : (
                <p className="mt-5 border-t border-slate-200 pt-4 text-right text-xs font-semibold text-slate-400">
                  點擊左側「編輯」後即可修改此主題。
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      <PlatformDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        tone={dialog.tone}
        onClose={closeDialog}
        onConfirm={dialog.onConfirm || undefined}
      />
    </section>
  );
};
