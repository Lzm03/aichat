import React from 'react';
import { Tag } from 'lucide-react';
import { uiText } from '../../utils/uiI18n';

/**
 * 測驗主題標籤（唯讀）——老師端六個列表共用同一個寫法。
 * 「不分主題」（`topicName` 為空）一律用淺灰字，唔搶眼，亦唔另開 marker 欄位
 * 去分「新揀嘅不分主題」同「舊嘅無主題測驗」：兩者資料上、行為上都係同一個狀態。
 */
export const QuizTopicTag: React.FC<{ topicName?: string; className?: string }> = ({
  topicName,
  className = '',
}) => {
  const name = String(topicName || '').trim();
  if (!name) {
    return <span className={`text-xs font-medium text-slate-400 ${className}`}>{uiText('不分主題')}</span>;
  }
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 ${className}`}
    >
      <Tag className="h-3 w-3 shrink-0 text-slate-400" />
      <span className="truncate">{name}</span>
    </span>
  );
};

/** 純文字版本（篩選 pill、警告句等唔放 chip 嘅位）。 */
export function quizTopicName(topicName?: string): string {
  const name = String(topicName || '').trim();
  return name || uiText('不分主題');
}
