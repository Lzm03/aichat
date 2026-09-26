import React from 'react';
import { Info, AlertTriangle } from 'lucide-react';
import { uiText, uiTemplate } from '../../utils/uiI18n';

export interface QuizTopicOption {
  id: string;
  name: string;
  isDefault?: boolean;
  category?: string;
}

export interface QuizPublishBotOption {
  id: string;
  name: string;
  subject?: string;
  isVisible?: boolean;
  isShared?: boolean;
  /** 該 Bot 嘅主題版本（「不分主題」唔會出現喺呢個陣列，佢係下拉最底嗰項）。 */
  topics?: QuizTopicOption[];
}

/** 出題（Step 1）同改主題（Step 3／詳情 Drawer）兩處都打同一個 API，所以 map 一次共用。 */
export function mapQuizPublishBots(payload: unknown): QuizPublishBotOption[] {
  const bots = (payload as { bots?: unknown })?.bots;
  if (!Array.isArray(bots)) return [];
  return bots
    .map((item: any) => ({
      id: String(item?.id || ''),
      name: String(item?.name || uiText('未命名 Bot')),
      subject: item?.subject ? String(item.subject) : '',
      isVisible: true,
      isShared: Boolean(item?.isShared),
      topics: Array.isArray(item?.topics)
        ? item.topics
            .map((topic: any) => ({
              id: String(topic?.id || ''),
              name: String(topic?.name || ''),
              isDefault: Boolean(topic?.isDefault),
              category: String(topic?.category || ''),
            }))
            .filter((topic: QuizTopicOption) => topic.id)
        : [],
    }))
    .filter((item: QuizPublishBotOption) => item.id);
}

/**
 * 「呢份測驗邊個主題嘅學生會見到」嘅一句話——揀選器同「會發佈到」列共用同一份文字，
 * 兩處唔會走樣。空字串 ＝ 未有 Bot 資料，唔顯示。
 */
export function quizTopicHintText(bot: QuizPublishBotOption | undefined, topicId: string): string {
  if (!bot) return '';
  const topics = bot.topics || [];
  if (topics.length === 0) return uiText('呢隻 Bot 仲未有主題，想分主題就去知識地圖加返。');
  const selected = topics.find((topic) => topic.id === topicId);
  if (selected) return uiTemplate('學生喺「{0}」傾偈時會見到呢份測驗。', selected.name);
  return uiText('學生喺未有自己測驗嘅主題傾偈時，會見到呢份測驗。');
}

interface QuizTopicPickerProps {
  bots: QuizPublishBotOption[];
  botId: string;
  /** 空字串 ＝「不分主題」。 */
  topicId: string;
  onTopicChange: (topicId: string) => void;
  /** 冇傳 ＝ Bot 鎖死（只顯示已選 Bot 嘅主題），Step 3 同詳情 Drawer 用。 */
  onBotChange?: (botId: string) => void;
  loading?: boolean;
  showMultiTopicHint?: boolean;
  onDuplicateHintClick?: () => void;
}

const selectClass =
  'w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3 pr-10 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-medium disabled:opacity-60';

const Caret = () => (
  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
    </svg>
  </div>
);

/**
 * 測驗發佈目的地揀選器：Bot（可選）＋主題（必顯示）。
 *
 * 「不分主題」嘅說明一定要講 **fallback**：呢份測驗只會喺「該主題冇自己測驗」嘅時候先出。
 * 唔可以寫「任何主題都見到」——嗰句係對老師講錯後果（見 docs/quiz-topic-publishing.md）。
 */
export const QuizTopicPicker: React.FC<QuizTopicPickerProps> = ({
  bots,
  botId,
  topicId,
  onTopicChange,
  onBotChange,
  loading = false,
  showMultiTopicHint = false,
  onDuplicateHintClick,
}) => {
  const selectedBot = bots.find((bot) => bot.id === botId);
  const topics = selectedBot?.topics || [];
  const selectedTopic = topics.find((topic) => topic.id === topicId);
  // 主題中途被刪（另一個 tab／老師）：唔好靜靜雞當「不分主題」，明確叫佢再揀。
  const topicMissing = Boolean(topicId) && !selectedTopic;

  const description = quizTopicHintText(selectedBot, topicId);

  return (
    <div className="space-y-3">
      {onBotChange ? (
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700">{uiText('發佈到 Bot')}</label>
          <div className="relative">
            <select
              value={botId}
              onChange={(event) => onBotChange(event.target.value)}
              className={selectClass}
              disabled={loading || bots.length === 0}
            >
              {loading && <option value="">{uiText('載入 Bot 中...')}</option>}
              {!loading && bots.length === 0 && <option value="">{uiText('暫無可用 Bot')}</option>}
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                  {bot.subject ? ` · ${bot.subject}` : ''}
                  {bot.isShared ? uiText(' · 已分享') : ''}
                </option>
              ))}
            </select>
            <Caret />
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm font-bold text-slate-700">{uiText('主題')}</label>
        <div className="relative">
          <select
            value={selectedTopic ? topicId : ''}
            onChange={(event) => onTopicChange(event.target.value)}
            className={selectClass}
            disabled={loading || !selectedBot}
          >
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.isDefault ? uiTemplate('{0}（預設）', topic.name) : topic.name}
              </option>
            ))}
            <option value="">{uiText('不分主題')}</option>
          </select>
          <Caret />
        </div>

        {topicMissing ? (
          <p className="flex items-start gap-1.5 text-xs font-medium leading-5 text-rose-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{uiText('呢個主題已經冇咗，請重新揀。')}</span>
          </p>
        ) : null}

        {description ? (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{description}</span>
          </p>
        ) : null}

        {showMultiTopicHint ? (
          <p className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            <span>{uiText('想同一份測驗俾多個主題？')}</span>
            {onDuplicateHintClick ? (
              <button
                type="button"
                onClick={onDuplicateHintClick}
                className="font-bold text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-700"
              >
                {uiText('複製為草稿')}
              </button>
            ) : null}
            <span>{uiText('再改主題就得。')}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
};
