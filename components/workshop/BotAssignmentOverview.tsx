import { uiText } from '../../utils/uiI18n';
import React from 'react';
import type { AiBot } from '../../types';
import { ChevronRight, UsersRound } from 'lucide-react';
import type { PermissionGroup } from './permissions/BotPermissionDrawer';

export type BotClassShare = {
  groupIds: string[];
  excludedStudentIds: string[];
};

type AssignmentViewProps = {
  bots: AiBot[];
  classes: PermissionGroup[];
  botClassMap: Record<string, BotClassShare>;
  onManage: (botId: string) => void;
};

export const BotAssignmentOverview: React.FC<AssignmentViewProps> = ({ bots, classes, botClassMap, onManage }) => {
  const classById = (id: string) => classes.find((item) => item.id === id);

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-black text-slate-900">{uiText('班級分配總覽')}</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {uiText('快速查看每個 Bot 目前已分配給哪些班級。')}
        </p>

        <div className="mt-5 space-y-3">
          {bots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
              <p className="text-sm font-bold text-slate-600">{uiText('尚未有已發布 Bot')}</p>
              <p className="mt-1 text-xs text-slate-400">{uiText('發布後就可以喺呢度管理班級分配。')}</p>
            </div>
          ) : (
            bots.map((bot) => {
              const assignedClassIds = botClassMap[bot.id]?.groupIds || [];
              const assignedClasses = assignedClassIds
                .map(classById)
                .filter(Boolean) as PermissionGroup[];

              return (
                <div
                  key={bot.id}
                  className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/30"
                >
                  <img
                    src={bot.avatarUrl || '/avatars/bot-default.svg'}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full bg-slate-100 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-900">{bot.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {assignedClasses.length > 0 ? (
                        assignedClasses.map((cls) => (
                          <span
                            key={cls.id}
                            className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-600"
                          >
                            {cls.name}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-400">
                          {uiText('未分配班級')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onManage(bot.id)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    {uiText('編輯班級')}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
