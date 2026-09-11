import { uiText } from '../../utils/uiI18n';
import React from 'react';

export type LibraryQuestion = {
  id: string | number;
  type: string;
  cognitiveLevel: string;
  levelColor: string;
  content: string;
  options?: string[];
  answer: string;
};

export const QuestionCard = ({ q, index }: { q: LibraryQuestion; index: number }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
    <div className="flex gap-2 mb-4">
      <span className={`px-3 py-1 rounded-full text-xs font-bold ${q.levelColor || 'bg-slate-100 text-slate-700'}`}>
        {uiText(q.cognitiveLevel)}
      </span>
      <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
        {uiText(q.type)}
      </span>
    </div>

    <p className="text-slate-800 font-medium mb-4 text-lg leading-relaxed">
      <span className="text-slate-400 mr-2">{index + 1}.</span>
      {q.content}
    </p>

    {q.options?.length ? (
      <div className="space-y-2 mb-6 ml-6">
        {q.options.map((opt: string) => (
          <div key={opt} className="px-4 py-2.5 bg-slate-50 rounded-xl text-sm text-slate-700 border border-slate-100">
            {opt}
          </div>
        ))}
      </div>
    ) : null}

    <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 border border-slate-100">
      <span className="font-bold text-slate-700 mr-2">{uiText("參考答案：")}</span>
      {q.answer}
    </div>
  </div>
);
