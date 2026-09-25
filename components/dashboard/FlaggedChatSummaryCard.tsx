import { uiText, uiTemplate } from '../../utils/uiI18n';
import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { Icons } from '../icons';
import { invalidateTeacherData } from '../../utils/teacher-data-cache';
import { useFlaggedChatCount } from '../../hooks/useFlaggedChatCount';

type FlagStatus = 'open' | 'resolved' | 'dismissed';
type FlagTab = 'open' | 'archived';
type FlagCategory = 'inappropriate' | 'wellbeing' | 'privacy';
type FlagAction = 'block' | 'flag';

type FlaggedChatFlag = {
  id: string;
  botId: string | null;
  botName: string | null;
  studentUserId: string | null;
  studentName: string | null;
  groupNames: string[];
  content: string;
  excerpt: string;
  ruleId: string;
  category: FlagCategory;
  action: FlagAction;
  detectedBy: 'keyword' | 'ai';
  status: FlagStatus;
  teacherComment: string;
  resolvedAt: string | null;
  createdAt: string;
};

const STATUS_CONFIG: Record<FlagStatus, { label: string; pill: string }> = {
  open: { label: '待處理', pill: 'bg-amber-100 text-amber-700' },
  resolved: { label: '已處理', pill: 'bg-emerald-100 text-emerald-700' },
  dismissed: { label: '已排除', pill: 'bg-slate-200 text-slate-600' },
};

// 類別 pill：老師一眼分得出係「罵人」「情緒困擾」定「泄露私隱」——
// 三者跟進方式完全唔同。
const CATEGORY_CONFIG: Record<FlagCategory, { label: string; pill: string }> = {
  inappropriate: { label: '不當用語', pill: 'bg-rose-100 text-rose-700' },
  wellbeing: { label: '情緒困擾', pill: 'bg-violet-100 text-violet-700' },
  privacy: { label: '個人私隱', pill: 'bg-amber-100 text-amber-700' },
};

// key 用 ruleId（同 quiz 異常警示嘅 REASON_LABELS 慣例）；日後 AI 審查層
// 有新 ruleId 就喺度加條目。
const REASON_LABELS: Record<string, string> = {
  'inappropriate-chat-offensive-terms': "訊息包含攻擊性或不適宜詞彙。",
  'wellbeing-chat-distress-terms': "訊息包含情緒困擾或負面訊號，建議優先了解。",
  'privacy-chat-personal-info': "訊息包含疑似個人資料，已攔截未送出。",
};

const PAGE_SIZE = 20;

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 異常對話記錄摘要卡（學習報告頁）：收合時只顯示扼要（待處理數＋最有需要
 * 跟進嗰條嘅時間），撳開先按時間倒序展開；分「待處理／已歸檔」兩個 tab，
 * 每 tab 分頁（PAGE_SIZE 條），處理咗嘅紀錄自動入歸檔——頁面唔會無限延展。
 * 三個類別（不當用語／情緒困擾／個人私隱）各有 pill，情緒困擾排最前。
 */
export const FlaggedChatSummaryCard: React.FC = () => {
  const openCount = useFlaggedChatCount();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<FlagTab>('open');
  const [flags, setFlags] = useState<FlaggedChatFlag[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<FlagStatus, number>>({ open: 0, resolved: 0, dismissed: 0 });
  const [latest, setLatest] = useState<{ createdAt: string; category: FlagCategory } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [patchingKey, setPatchingKey] = useState<string | null>(null);
  const [resolveCommentFor, setResolveCommentFor] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // 收合狀態嘅扼要：最有需要跟進嗰條（後端已按情緒困擾優先排序）嘅時間同類別。
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/flagged-chat?status=open&limit=1&offset=0`)
      .then((response) => response.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        const first = data?.flags?.[0];
        setLatest(first ? { createdAt: first.createdAt, category: first.category } : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [openCount, expanded]);

  const load = async (targetTab: FlagTab, offset: number, replace: boolean) => {
    replace ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/flagged-chat?status=${targetTab}&limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(uiText("無法載入異常對話記錄"));
      setFlags((prev) => (replace ? data.flags : [...prev, ...data.flags]));
      setTotal(Number(data.total) || 0);
      setStatusCounts({
        open: Number(data.statusCounts?.open) || 0,
        resolved: Number(data.statusCounts?.resolved) || 0,
        dismissed: Number(data.statusCounts?.dismissed) || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : uiText("無法載入異常對話記錄"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const switchTab = (targetTab: FlagTab) => {
    setTab(targetTab);
    setResolveCommentFor(null);
    void load(targetTab, 0, true);
  };

  const openExpanded = () => {
    setExpanded(true);
    void load(tab, 0, true);
  };

  const patchFlag = async (flag: FlaggedChatFlag, status: 'resolved' | 'dismissed', teacherComment = '') => {
    const original = flags;
    setPatchingKey(flag.id);
    setError('');
    // optimistic：移出待處理列表，計數即時遞減；失敗還原
    setFlags((prev) => prev.filter((item) => item.id !== flag.id));
    setStatusCounts((prev) => ({
      ...prev,
      open: Math.max(0, prev.open - 1),
      [status]: prev[status] + 1,
    }));
    setTotal((prev) => Math.max(0, prev - 1));
    try {
      const response = await fetch(`${API_BASE}/api/flagged-chat/${flag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, teacherComment }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(uiText("更新異常對話記錄失敗，請稍後再試。"));
      setResolveCommentFor(null);
      setCommentDrafts((prev) => {
        const rest = { ...prev };
        delete rest[flag.id];
        return rest;
      });
      // 處理完即時反映：清列表 cache + 清紅點 count cache + 觸發 Sidebar badge 即時 refresh
      // （唔使等 15 秒輪詢 tick；useFlaggedChatCount 聽 chopreality:flagged-count-refresh）
      invalidateTeacherData('/api/flagged-chat');
      invalidateTeacherData('/api/flagged-chat/count');
      window.dispatchEvent(new CustomEvent('chopreality:flagged-count-refresh'));
    } catch (err) {
      setFlags(original);
      setStatusCounts((prev) => ({
        ...prev,
        open: prev.open + 1,
        [status]: Math.max(0, prev[status] - 1),
      }));
      setTotal((prev) => prev + 1);
      setError(err instanceof Error ? err.message : uiText("更新異常對話記錄失敗，請稍後再試。"));
    } finally {
      setPatchingKey(null);
    }
  };

  const renderContent = (flag: FlaggedChatFlag) => {
    const excerpt = (flag.excerpt || '').trim();
    const content = flag.content || '';
    if (!excerpt) return <span className="line-clamp-3">{content}</span>;
    const idx = content.indexOf(excerpt);
    const lowerIdx = idx >= 0 ? idx : content.toLowerCase().indexOf(excerpt.toLowerCase());
    if (lowerIdx < 0) return <span className="line-clamp-3">{content}</span>;
    return (
      <span>
        {content.slice(0, lowerIdx)}
        <mark className="rounded bg-rose-100 px-0.5 font-semibold text-rose-700">
          {content.slice(lowerIdx, lowerIdx + excerpt.length)}
        </mark>
        {content.slice(lowerIdx + excerpt.length)}
      </span>
    );
  };

  const archivedCount = statusCounts.resolved + statusCounts.dismissed;

  const cardShell = 'bg-white p-3.5 md:p-4 rounded-[24px] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100';

  const renderRecord = (flag: FlaggedChatFlag) => {
    const statusConfig = STATUS_CONFIG[flag.status];
    const categoryConfig = CATEGORY_CONFIG[flag.category];
    const isPatching = patchingKey === flag.id;
    const isResolving = resolveCommentFor === flag.id;
    // 情緒困擾照樣送出咗（action=flag），老師見到嗰句就係學生真係收到嘅回覆；
    // 其餘兩類係攔截，學生根本冇送出去。
    const isDelivered = flag.action === 'flag';
    return (
      <div
        key={flag.id}
        className={`rounded-2xl border bg-white p-3.5 shadow-sm transition-all duration-300 ${
          flag.status === 'open'
            ? flag.category === 'wellbeing'
              ? 'border-violet-100 border-l-4 border-l-violet-400'
              : 'border-rose-100 border-l-4 border-l-rose-300'
            : 'border-slate-100'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-slate-800">{flag.studentName || uiText("學生")}</span>
            {flag.groupNames.map((groupName) => (
              <span key={groupName} className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-600">
                {groupName}
              </span>
            ))}
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              {uiText("角色")}：{flag.botName || uiText("已刪除角色")}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${categoryConfig.pill}`}>
              {uiText(categoryConfig.label)}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${statusConfig.pill}`}>
              {uiText(statusConfig.label)}
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400">{formatTime(flag.createdAt)}</span>
        </div>

        <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">{uiText("學生訊息")}</span>
          {renderContent(flag)}
        </div>

        <p className="mt-2 text-xs text-slate-500">
          <span className="font-bold text-slate-600">{uiText("判斷依據")}：</span>
          {uiText(REASON_LABELS[flag.ruleId] || flag.ruleId)}
        </p>

        <p className="mt-1 text-xs text-slate-400">
          {isDelivered ? uiText("訊息已照常送出，學生已收到回覆。") : uiText("訊息已攔截，未有送出。")}
        </p>

        {flag.status !== 'open' && (
          <div className="mt-2 space-y-1 text-xs text-slate-500">
            {flag.teacherComment ? (
              <p><span className="font-bold text-slate-600">{uiText("教師備註")}：</span>{flag.teacherComment}</p>
            ) : null}
            {flag.resolvedAt ? (
              <p><span className="font-bold text-slate-600">{uiText("處理時間")}：</span>{formatTime(flag.resolvedAt)}</p>
            ) : null}
          </div>
        )}

        {flag.status === 'open' && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            {isResolving ? (
              <div className="space-y-2">
                <textarea
                  value={commentDrafts[flag.id] || ''}
                  onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [flag.id]: event.target.value }))}
                  placeholder={uiText("教師備註（選填）")}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none transition focus:border-indigo-400"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPatching}
                    onClick={() => void patchFlag(flag, 'resolved', commentDrafts[flag.id] || '')}
                    className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isPatching ? uiText("處理中") : uiText("確認")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolveCommentFor(null)}
                    className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
                  >
                    {uiText("取消")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isPatching}
                  onClick={() => setResolveCommentFor(isResolving ? null : flag.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />{uiText("標記已處理")}
                </button>
                <button
                  type="button"
                  disabled={isPatching}
                  onClick={() => void patchFlag(flag, 'dismissed')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />{uiText("確認無礙")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={openExpanded}
        className={`${cardShell} group flex h-full w-full flex-col text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(244,63,94,0.08)]`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
              <Icons.messageSquareWarning className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-[#1E293B] md:text-base">{uiText("異常對話記錄")}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{uiText("此紀錄由系統自動偵測，僅供老師覆核。")}</p>
            </div>
          </div>
          {openCount > 0 && (
            <span className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-rose-500 px-2 text-sm font-black text-white">
              {openCount > 99 ? '99+' : openCount}
            </span>
          )}
        </div>

        <div className="mt-4 flex-1 rounded-2xl bg-rose-50/60 p-4">
          <p className={`text-lg font-black ${openCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
            {openCount > 0 ? uiTemplate("有 {0} 條待處理紀錄", openCount) : uiText("暫無待處理紀錄")}
          </p>
          {openCount > 0 && latest?.category === 'wellbeing' ? (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
              {uiText("建議優先處理：情緒困擾")}
            </p>
          ) : null}
          {latest ? (
            <p className="mt-1.5 text-xs font-bold text-slate-500">
              {uiTemplate("最近紀錄：{0}", formatTime(latest.createdAt))}
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-center gap-1 text-xs font-bold text-indigo-500 transition-colors group-hover:text-indigo-600">
          {uiText("按一下查看最新紀錄")}
          <ChevronDown className="h-4 w-4" />
        </div>
      </button>
    );
  }

  return (
    <div className={cardShell}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
            <Icons.messageSquareWarning className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[#1E293B] md:text-base">{uiText("異常對話記錄")}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{uiText("此紀錄由系統自動偵測，僅供老師覆核。")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
        >
          {uiText("收起")}
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {([
          { key: 'open' as FlagTab, label: uiText("待處理"), count: openCount },
          { key: 'archived' as FlagTab, label: uiText("已歸檔"), count: archivedCount },
        ]).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            className={`rounded-full border px-4 py-2 text-sm font-bold transition-all duration-200 ${
              tab === key
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-xs font-bold text-rose-500">{error}</p> : null}

      {loading ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">
          {uiText("正在載入異常對話記錄...")}
        </div>
      ) : flags.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <Icons.messageSquareWarning className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">
            {tab === 'open' ? uiText("暫無待處理紀錄") : uiText("暫無已歸檔紀錄")}
          </p>
          <p className="mt-1 text-xs text-slate-400">{uiText("此紀錄由系統自動偵測，僅供老師覆核。")}</p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {flags.map(renderRecord)}

          {flags.length < total ? (
            <div className="pt-1 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load(tab, flags.length, false)}
                className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore ? uiText("處理中") : uiText("載入更多")}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
