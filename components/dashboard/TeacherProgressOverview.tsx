import { uiText, uiTemplate } from '../../utils/uiI18n';
import React, { useEffect, useState } from 'react';
import { Target, Users } from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { SafeAvatarImage } from '../shared/SafeAvatarImage';
import { loadTeacherData, peekTeacherData } from '../../utils/teacher-data-cache';

type PointProgress = {
  id: string;
  tier: 'basic_fact' | 'deep_understanding';
  title: string;
  /** 話題維度（audit #1）：進度按話題分桶，報表按話題分組顯示 */
  topicId: string;
  topicName: string;
  coveredCount: number;
  skippedCount: number;
};

type BotProgress = {
  id: string;
  name: string;
  avatarUrl: string;
  studentsWithProgress: number;
  points: PointProgress[];
};

/** 知識點按主題分節。Server 已按 default 桶先行排好，呢度只做保序分組。 */
const groupPointsByTopic = (points: PointProgress[]) => {
  const sections = new Map<string, { topicId: string; topicName: string; points: PointProgress[] }>();
  for (const point of points) {
    const existing = sections.get(point.topicId);
    if (existing) existing.points.push(point);
    else sections.set(point.topicId, { topicId: point.topicId, topicName: point.topicName, points: [point] });
  }
  return Array.from(sections.values()).map((section) => ({
    ...section,
    // 班級層面：有一位學生覆蓋過，就當呢個知識點已經有人掌握
    masteredPoints: section.points.filter((point) => point.coveredCount > 0).length,
    skippedTotal: section.points.reduce((sum, point) => sum + point.skippedCount, 0),
  }));
};

export const TeacherProgressOverview: React.FC = () => {
  const cachedProgress = peekTeacherData<any>('/api/bots/teacher/progress-overview');
  const [bots, setBots] = useState<BotProgress[]>(cachedProgress?.bots || []);
  const [loading, setLoading] = useState(!cachedProgress);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(!peekTeacherData('/api/bots/teacher/progress-overview'));
    setError('');
    loadTeacherData<any>('/api/bots/teacher/progress-overview')
      .then((data) => {
        if (cancelled) return;
        setBots(Array.isArray(data?.bots) ? data.bots : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-[24px] border border-slate-100 bg-white p-3.5 shadow-card md:p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 md:text-base">
        <Target className="h-5 w-5 text-indigo-500" />{uiText("知識點掌握概覽")}
      </h3>
      <p className="mt-0.5 text-xs text-slate-400">{uiText("由學生實際對話累積的知識點掌握統計。")}</p>

      {loading ? (
        <p className="py-8 text-center text-xs font-semibold text-slate-400">{uiText("正在載入…")}</p>
      ) : error ? (
        <p className="py-8 text-center text-xs font-semibold text-slate-400">{uiText("暫時無法載入，請稍後再試。")}</p>
      ) : !bots.length ? (
        <p className="py-8 text-center text-xs font-semibold text-slate-400">{uiText("尚未有學生對話累積數據。")}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {bots.map((bot) => (
            <div key={bot.id} className="rounded-2xl border border-slate-100 p-3">
              <div className="flex items-center gap-2">
                <SafeAvatarImage src={bot.avatarUrl} alt={bot.name} className="h-8 w-8 rounded-full" />
                <span className="text-sm font-black text-slate-800">{bot.name}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  <Users className="h-3 w-3" />{bot.studentsWithProgress}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {bot.points.length ? groupPointsByTopic(bot.points).map((section) => (
                  <div key={section.topicId} className="rounded-2xl bg-slate-50/70 p-2.5">
                    <div className="flex items-center justify-between gap-2 px-1">
                      {section.topicName ? (
                        <span className="truncate text-[10px] font-black text-indigo-500">{section.topicName}</span>
                      ) : (
                        <span />
                      )}
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500">
                          {uiTemplate("已掌握 {0}/{1} 個知識點", section.masteredPoints, section.points.length)}
                        </span>
                        {section.skippedTotal > 0 ? (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                            {uiTemplate("跳過 {0} 次", section.skippedTotal)}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {section.points.map((point) => {
                        const pct = bot.studentsWithProgress > 0
                          ? Math.round((point.coveredCount / bot.studentsWithProgress) * 100)
                          : 0;
                        const untouched = point.coveredCount === 0;
                        return (
                          <div key={point.id} className="flex items-center gap-3">
                            <span
                              className={`w-32 shrink-0 truncate text-xs font-semibold ${untouched ? 'text-rose-500' : 'text-slate-700'}`}
                              title={point.title}
                            >
                              {point.title}
                            </span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${point.tier === 'basic_fact' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`w-10 shrink-0 text-right text-xs font-black ${untouched ? 'text-rose-500' : 'text-slate-600'}`}>
                              {point.coveredCount}
                            </span>
                            {point.skippedCount > 0 ? (
                              <span
                                className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700"
                                title={uiText("此知識點曾多次推唔動而被跳過")}
                              >
                                {uiText("跳過")} {point.skippedCount}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )) : (
                  <p className="text-xs font-semibold text-slate-400">{uiText("此 Bot 尚未設定知識點。")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
