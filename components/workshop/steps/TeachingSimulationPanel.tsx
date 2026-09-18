import { uiText } from '../../../utils/uiI18n';
import React, { useState } from 'react';
import { Loader2, Play, TriangleAlert } from 'lucide-react';
import { API_BASE } from '../../../utils/api';
import { buildChatSystemPrompt } from '../../../utils/chat-prompt';
import {
  SIMULATION_SCENARIOS,
  buildStudentTurns,
  corePointsOf,
  evaluateSimulation,
  pickSimulationTarget,
  type SimulationResult,
  type SimulationScenarioId,
  type SimulationTurn,
} from '../../../utils/teaching-simulation';

async function askBotReply(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt,
      userPrompt,
      stream: false,
      modelProvider: 'gemini',
    }),
  });
  const raw = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    const reply = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:/, ''))
      .join('')
      .trim();
    data = { reply };
  }
  if (!response.ok) {
    throw new Error(data?.error || `${uiText('模擬請求失敗：')}${response.status}`);
  }
  return String(data?.reply || '');
}

const ResultRow: React.FC<{ label: string; value?: string; ok?: boolean }> = ({
  label,
  value,
  ok,
}) => (
  <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
    <span className="font-semibold text-slate-500">{label}</span>
    {typeof ok === 'boolean' ? (
      <span className={`font-black ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
        {ok ? `✓ ${uiText('是')}` : `○ ${uiText('否')}`}
      </span>
    ) : (
      <span className="min-w-0 truncate font-black text-slate-800">{value}</span>
    )}
  </div>
);

type TeachingSimulationPanelProps = {
  knowledgeBase: string;
  securityPrompt?: string;
  botName?: string;
};

/**
 * 教學模擬預覽：三個學生場景 + 即時教學判斷。
 * 只讀目前設定、呼 API 攞 Bot 回覆；結果唔會寫入任何學生進度。
 */
export const TeachingSimulationPanel: React.FC<TeachingSimulationPanelProps> = ({
  knowledgeBase,
  securityPrompt,
  botName,
}) => {
  const [scenarioId, setScenarioId] = useState<SimulationScenarioId>('already_familiar');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SimulationResult | null>(null);

  const runSimulation = async () => {
    if (running) return;
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const points = corePointsOf(knowledgeBase);
      if (!points.length) {
        setError(uiText('尚未有教學目標知識點，請先到「教材來源」完成知識抽取。'));
        return;
      }
      const target = pickSimulationTarget(points);
      const studentTurns = buildStudentTurns(scenarioId, target);
      const systemPrompt = buildChatSystemPrompt({
        roleName: botName,
        knowledgeBase,
        securityPrompt,
      });
      const turns: SimulationTurn[] = [];
      for (const studentText of studentTurns) {
        turns.push({ role: 'student', content: studentText });
        const reply = await askBotReply(systemPrompt, studentText);
        turns.push({ role: 'bot', content: reply || '（未收到回覆）' });
      }
      const evaluation = evaluateSimulation({ knowledgeBase, scenarioId, turns });
      if (!evaluation) {
        setError(uiText('未能評估模擬結果。'));
        return;
      }
      setResult(evaluation);
    } catch (e) {
      setError(e instanceof Error ? e.message : uiText('模擬失敗，請稍後再試。'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Play className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-800">{uiText('預覽教學')}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{uiText('用三種學生場景模擬對話，檢查 Bot 的教學判斷。模擬不會寫入學生進度。')}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        {SIMULATION_SCENARIOS.map((scenario) => {
          const active = scenarioId === scenario.id;
          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => setScenarioId(scenario.id)}
              aria-pressed={active}
              className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                active
                  ? 'border-indigo-600 bg-indigo-50/60 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
              }`}
            >
              <span className="text-xs font-black text-slate-900">{uiText(scenario.title)}</span>
              <span className="text-[11px] leading-5 text-slate-500">{uiText(scenario.description)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void runSimulation()}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? uiText('模擬中…') : uiText('開始模擬')}
        </button>
        <span className="text-[11px] text-slate-400">{uiText('模擬約需數秒，會即時顯示判斷結果。')}</span>
      </div>

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
            <p className="mb-2 text-xs font-black text-slate-700">{uiText('對話記錄')}</p>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {result.turns.map((turn, index) => (
                <div
                  key={`${turn.role}-${index}`}
                  className={`flex ${turn.role === 'student' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-5 shadow-sm ${
                      turn.role === 'student'
                        ? 'rounded-br-md bg-indigo-600 text-white'
                        : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <span className="mb-0.5 block text-[9px] font-black opacity-70">
                      {turn.role === 'student' ? uiText('學生') : botName || uiText('Bot')}
                    </span>
                    {turn.content}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-black text-slate-700">{uiText('模擬結果')}</p>
            <div className="space-y-2 text-[11px]">
              <ResultRow label={uiText('教學目標')} value={result.target?.title || uiText('無')} />
              <ResultRow label={uiText('Bot 是否已講解')} ok={result.botTaughtTarget} />
              <ResultRow label={uiText('學生是否答到')} ok={result.studentAnsweredTarget} />
              <ResultRow label={uiText('是否已覆蓋')} ok={result.coveredTarget} />
              <ResultRow label={uiText('下一步目標')} value={result.nextPointTitle || uiText('無')} />
              <ResultRow
                label={uiText('被跳過的知識點')}
                value={result.skippedPointIds.length ? result.skippedPointIds.join('、') : uiText('無')}
              />
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500">
                {result.strictCoverage ? uiText('學生答到才記錄') : uiText('Bot 講解過即記錄')}
              </div>
              <p className="px-1 text-[10px] text-slate-400">{uiText('模擬結果只作預覽，不會寫入學生進度。')}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
