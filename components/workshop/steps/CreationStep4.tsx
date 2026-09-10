import { uiText, uiTemplate } from '../../../utils/uiI18n';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../../icons';
import { usePlatformDialog } from '../../../hooks/usePlatformDialog';
import { PlatformDialog } from '../../system/PlatformDialog';
import { API_BASE } from '../../../utils/api';

// -----------------------------
// Section Wrapper
// -----------------------------
const Section: React.FC<{ title: string; children: React.ReactNode; subtitle?: string }> = ({
  title,
  subtitle,
  children,
}) => (
  <div className="border border-slate-200/80 rounded-3xl p-6 space-y-4">
    <h4 className="text-lg font-bold text-slate-800">{uiText(title)}</h4>
    {subtitle && <p className="text-xs text-slate-500 -mt-3">{uiText(subtitle)}</p>}
    {children}
  </div>
);

// -----------------------------
// Permission Card
// -----------------------------
type SharingMode = 'group' | 'link';

type ShareClass = {
  id: string;
  name: string;
  studentCount: number;
};

const PermissionCard: React.FC<{
  icon: React.ElementType;
  title: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}> = ({ icon: Icon, title, description, isSelected, onClick }) => (
  <motion.div
    onClick={onClick}
    className="relative p-4 border rounded-2xl cursor-pointer transition-colors duration-200 flex items-center space-x-4"
    animate={{
      borderColor: isSelected ? '#4F46E5' : '#E2E8F0',
      backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
      borderWidth: isSelected ? '2px' : '1px',
    }}
    whileHover={{ borderColor: isSelected ? '#4F46E5' : '#CBD5E1' }}
    transition={{ duration: 0.2 }}
  >
    <div className={`p-3 rounded-lg ${isSelected ? 'bg-indigo-200' : 'bg-slate-100'}`}>
      <Icon className={`w-5 h-5 ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`} />
    </div>
    <div>
      <h5 className="font-semibold text-slate-800">{uiText(title)}</h5>
      <p className="text-xs text-slate-500">{uiText(description)}</p>
    </div>
  </motion.div>
);

// -----------------------------
// Filter Card (3 Levels Only)
// -----------------------------
type FilterLevel = 'standard' | 'strict' | 'custom';

const FilterCard: React.FC<{
  title: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}> = ({ title, description, isSelected, onClick }) => (
  <div
    onClick={onClick}
    className={`p-6 border rounded-3xl cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
      isSelected ? 'border-indigo-500 border-2 bg-indigo-50/50' : 'border-slate-200 bg-white'
    }`}
  >
    <div className="flex justify-between items-center mb-2">
      <h5 className="font-bold text-slate-800">{uiText(title)}</h5>
      {isSelected && <Icons.success className="w-6 h-6 text-indigo-600" />}
    </div>
    <p className="text-xs text-slate-500">{uiText(description)}</p>
  </div>
);

// -----------------------------
// MAIN COMPONENT
// -----------------------------
export const CreationStep4: React.FC<{
  onSecurityChange?: (securityPrompt: string) => void;
  botId?: string | null;
  initialConfig?: { sharingMode?: string; filterLevel?: string; customWords?: string; classIds?: string[] };
}> = ({ onSecurityChange, botId, initialConfig }) => {
  const [sharingMode, setSharingMode] = useState<SharingMode>((initialConfig?.sharingMode === "group" ? "group" : "link"));
  const [filterLevel, setFilterLevel] = useState<FilterLevel>(
    initialConfig?.filterLevel === "strict" || initialConfig?.filterLevel === "custom"
      ? (initialConfig.filterLevel as FilterLevel)
      : "standard"
  );
  const [customWords, setCustomWords] = useState(initialConfig?.customWords || '');
  const [isCopied, setIsCopied] = useState(false);
  const [classes, setClasses] = useState<ShareClass[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(initialConfig?.classIds || []);
  const [confirmedClassIds, setConfirmedClassIds] = useState<string[]>(initialConfig?.classIds || []);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const { dialog, closeDialog, showAlert } = usePlatformDialog();

  useEffect(() => {
    const controller = new AbortController();
    const loadAccess = async () => {
      setIsLoadingClasses(true);
      try {
        const classResponse = await fetch(`${API_BASE}/api/students`, { cache: 'no-store', signal: controller.signal });
        const classData = await classResponse.json().catch(() => ({}));
        if (!classResponse.ok) throw new Error(classData?.error || '無法載入班級');
        const nextClasses = (Array.isArray(classData.groups) ? classData.groups : []).map((group: any) => ({
          id: String(group.id),
          name: String(group.name || ''),
          studentCount: Array.isArray(group.studentIds) ? group.studentIds.length : 0,
        }));
        setClasses(nextClasses);

        if (botId) {
          const accessResponse = await fetch(`${API_BASE}/api/bots/${encodeURIComponent(botId)}/access`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          const accessData = await accessResponse.json().catch(() => ({}));
          if (!accessResponse.ok) throw new Error(accessData?.error || '無法載入分享設定');
          const nextMode: SharingMode = accessData.mode === 'group' ? 'group' : 'link';
          const nextGroupIds = Array.isArray(accessData.groupIds) ? accessData.groupIds.map(String) : [];
          setSharingMode(nextMode);
          setSelectedClassIds(nextGroupIds);
          setConfirmedClassIds(nextGroupIds);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          showAlert({ title: uiText('載入失敗'), message: (error as Error).message, tone: 'danger' });
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingClasses(false);
      }
    };
    void loadAccess();
    return () => controller.abort();
  }, [botId, showAlert]);

  const saveAccess = async (mode: SharingMode, groupIds: string[]) => {
    if (!botId) return;
    const response = await fetch(`${API_BASE}/api/bots/${encodeURIComponent(botId)}/access`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, groupIds }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || '無法儲存分享設定');
  };

  const shareableLink =
    botId && typeof window !== "undefined"
      ? `${window.location.origin}/bot/${botId}`
      : "發布後生成可分享連結";

  const handleCopy = () => {
    if (!botId) return;
    navigator.clipboard.writeText(shareableLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleLinkBoxClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const input = e.currentTarget.querySelector('input');
    if (!botId) return;
    input?.select();
    handleCopy();
  };

  // -----------------------------
  // Build Safety Prompt (3 Levels)
  // -----------------------------
  const buildSecurityPrompt = () => {
    let base = `
你正在與小學至高中學生互動，必須遵守以下安全規範：

【一、禁止回答的內容】
- 色情、性暗示、成人內容
- 暴力、武器製作、傷害方法
- 自殺、自殘、精神健康診斷
- 仇恨、歧視、霸凌
- 政治敏感立場或煽動內容
- 賭博、酒精、毒品
- 要求學生提供個人資料（電話、住址、學校、家長資料）
- 協助作弊、代做功課或代寫文章

【二、敏感話題處理方式】
- 若學生提問涉及上述內容：請「禮貌拒絕 + 提供安全替代方向」。
`;

    if (filterLevel === 'strict') {
      base += `
【模式：嚴格】
- 只要偵測到不適當內容，請立即停止回答。
- 回覆：「這個問題不適合討論，我們可以聊聊其他主題喔！」`;
    }

    if (filterLevel === 'custom' && customWords.trim()) {
      base += `
【自定義禁用詞彙】
以下詞彙不得出現在回答中，也不得提供任何相關資訊：
${customWords
  .split(',')
  .map((w) => w.trim())
  .filter((w) => w.length > 0)
  .map((w) => `- ${w}`)
  .join('\n')}
`;
    }

    base += `
【共享模式】${sharingMode}
【班級名單】${sharingMode === 'group' ? confirmedClassIds.join(',') : ''}
【過濾等級】${filterLevel}
【自定義詞】${customWords.trim()}
`;

    return base.trim();
  };

  // 回傳安全 prompt 給外層 CreationFlow
  useEffect(() => {
    if (onSecurityChange) onSecurityChange(buildSecurityPrompt());
  }, [sharingMode, filterLevel, customWords, confirmedClassIds]);

  const confirmClassSelection = async () => {
    if (selectedClassIds.length === 0) {
      showAlert({
        title: uiText("尚未選擇班級"),
        message: uiText("請至少選擇一個班級。"),
        tone: "info",
      });
      return;
    }
    setIsSavingAccess(true);
    try {
      await saveAccess('group', selectedClassIds);
      setConfirmedClassIds(selectedClassIds);
    } catch (error) {
      showAlert({ title: uiText('更新失敗'), message: (error as Error).message, tone: 'danger' });
    } finally {
      setIsSavingAccess(false);
    }
  };

  const selectLinkMode = async () => {
    const previousMode = sharingMode;
    setSharingMode('link');
    setIsSavingAccess(true);
    try {
      await saveAccess('link', []);
      setConfirmedClassIds([]);
    } catch (error) {
      setSharingMode(previousMode);
      showAlert({ title: uiText('更新失敗'), message: (error as Error).message, tone: 'danger' });
    } finally {
      setIsSavingAccess(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title */}
      <div>
        <h3 className="text-xl font-bold text-[#1E293B]">{uiText("5. 安全與權限")}</h3>
        <p className="text-sm text-slate-500">{uiText("設定機器人的使用對象與內容安全級別，保護學生安全。")}</p>
      </div>

      <Section title={uiText("權限分享模式")}>
        <div className="space-y-3">
          <PermissionCard
            icon={Icons.classes}
            title={uiText("特定班級")}
            description="僅限指定名單成員存取"
            isSelected={sharingMode === 'group'}
            onClick={() => setSharingMode('group')}
          />
          <PermissionCard
            icon={Icons.link}
            title={uiText("任何擁有連結的人")}
            description="組織內使用者可憑連結存取"
            isSelected={sharingMode === 'link'}
            onClick={() => void selectLinkMode()}
          />
        </div>

        {sharingMode === 'group' && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-slate-700">{uiText("選擇班級")}</div>
                              <span className="text-xs font-bold text-indigo-600">
                        {uiTemplate("已選 {0} / {1} 班", selectedClassIds.length, classes.length)}
                      </span>
            </div>

            <div className="mt-3 space-y-2">
              {classes.map((classItem) => {
                const selected = selectedClassIds.includes(classItem.id);
                return (
                  <button
                    key={classItem.id}
                    type="button"
                    onClick={() =>
                      setSelectedClassIds((current) =>
                        current.includes(classItem.id)
                          ? current.filter((id) => id !== classItem.id)
                          : [...current, classItem.id]
                      )
                    }
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                      selected
                        ? 'border-indigo-300 bg-indigo-50/60 shadow-[0_10px_28px_rgba(79,70,229,0.08)]'
                        : 'border-slate-200 bg-white hover:border-indigo-200'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                        selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-transparent'
                      }`}
                    >
                      {selected ? <Icons.success className="h-4 w-4" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate-900">{classItem.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{classItem.studentCount}{uiText(" 位學生")}</span>
                    </span>
                  </button>
                );
              })}
              {!isLoadingClasses && classes.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                  {uiText('暫時未有班級，請先到學生管理建立班級。')}
                </p>
              ) : null}
              {isLoadingClasses ? (
                <p className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">
                  {uiText('正在載入班級…')}
                </p>
              ) : null}
            </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={isSavingAccess || isLoadingClasses}
                  onClick={() => void confirmClassSelection()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Icons.success className="h-4 w-4" />
                  {uiText("確認班級")}
                </button>
                {confirmedClassIds.length > 0 ? (
                  <span className="text-xs font-bold text-emerald-600">
                    {uiTemplate("已確認 {0} 個班級", confirmedClassIds.length)}
                  </span>
                ) : (
                  <span className="text-xs font-bold text-slate-400">{uiText("尚未確認任何班級")}</span>
                )}
              </div>
          </motion.div>
        )}

        {sharingMode === 'link' && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center space-x-2 p-2 pl-4 bg-slate-100 rounded-xl mt-4 cursor-pointer"
            onClick={handleLinkBoxClick}
          >
            <input
              type="text"
              readOnly
              value={shareableLink}
              className="flex-1 bg-transparent text-sm text-slate-600 pointer-events-none"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              disabled={!botId}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition ${
                !botId
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : isCopied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isCopied ? <Icons.success className="w-4 h-4" /> : <Icons.copy className="w-4 h-4" />}
              <span>{isCopied ? uiText('已複製') : uiText('複製連結')}</span>
            </button>
          </motion.div>
        )}
      </Section>

      {/* Safety Filter */}
      <Section
        title={uiText("安全過濾強度")}
        subtitle="系統會自動過濾不適當內容，包括色情、暴力、歧視、自殘話題等"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FilterCard
            title={uiText("標準")}
            description="教育場景預設濾網，適度引導學生"
            isSelected={filterLevel === 'standard'}
            onClick={() => setFilterLevel('standard')}
          />
          <FilterCard
            title={uiText("嚴格")}
            description="偵測到敏感內容將停止回答"
            isSelected={filterLevel === 'strict'}
            onClick={() => setFilterLevel('strict')}
          />
          <FilterCard
            title={uiText("自定義")}
            description="輸入你額外想封鎖的詞彙"
            isSelected={filterLevel === 'custom'}
            onClick={() => setFilterLevel('custom')}
          />
        </div>

        {filterLevel === 'custom' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-3"
          >
            <textarea
              rows={4}
              maxLength={500}
              value={customWords}
              onChange={(e) => setCustomWords(e.target.value)}
              placeholder={uiText("例如：暴力, 色情, 烏煙瘴氣（使用逗號分隔）")}
              className="w-full px-4 py-3 border rounded-xl transition resize-none border-slate-300 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
            <p className="text-right text-xs text-slate-500 mt-1">
              {customWords.length} / 500
            </p>
          </motion.div>
        )}
      </Section>
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
    </div>
  );
};
