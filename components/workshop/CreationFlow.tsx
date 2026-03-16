import React, { useState, useEffect } from 'react';
import { Stepper } from './Stepper';
import { Icons } from '../icons';
import { CreationStep1 } from './steps/CreationStep1';
import { CreationStep2 } from './steps/CreationStep2';
import { CreationStep3 } from './steps/CreationStep3';
import { CreationStep4 } from './steps/CreationStep4';
import { CreationStepSoundAnimation } from './steps/CreationStepSoundAnimation';
import { ChatPreview } from './ChatPreview';
import { motion, AnimatePresence } from 'framer-motion';
import { PublishSuccessModal } from './PublishSuccessModal';


interface CreationFlowProps {
  onBack: () => void;
  botId: string | null;
}

const steps = ["基礎設定", "形象與人格", "聲音與動畫", "知識餵養", "安全與權限"];

export const CreationFlow: React.FC<CreationFlowProps> = ({ onBack, botId }) => {
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

  // -------------------------------
  // 1. 载入或初始化机器人配置
  // -------------------------------
  const loadBotConfig = () => {
    // ⭐ 沒有 botId = 新增模式 → 初始值
    if (!botId) {
      return {
        id: null,
        name: "我的 AI 機器人",
        avatarUrl: "https://api.dicebear.com/8.x/bottts/svg?seed=new_bot",
        background: "",
        animation: "點頭回應",

        knowledgeBase: "",
        securityPrompt: "",

        videoIdle: "",
        videoThinking: "",
        videoTalking: "",

        voiceId: "",
      };
    }

    // ⭐ 編輯模式 → 初始狀態為 placeholder，後面用 API 覆蓋
    return {
      name: "",
      avatarUrl: "",
      background: "",
      animation: "",
      knowledgeBase: "",
      securityPrompt: "",
      videoIdle: "",
      videoThinking: "",
      videoTalking: "",
      voiceId: "",
    };
  };

  useEffect(() => {
  const fetchBot = async () => {
    if (!botId) return;

    const res = await fetch(`${baseUrl}/api/bots/${botId}`);
    const data = await res.json();

    setBotConfig({
      id: data.id,
      name: data.name,
      avatarUrl: data.avatarUrl,
      background: data.background,
      animation: data.animation,

      knowledgeBase: data.knowledgeBase,
      securityPrompt: data.securityPrompt,

      videoIdle: data.videoIdle,
      videoThinking: data.videoThinking,
      videoTalking: data.videoTalking,
      voiceId: data.voiceId,
    });
  };

  fetchBot();
}, [botId]);

  const [botConfig, setBotConfig] = useState(loadBotConfig());
  const [currentStep, setCurrentStep] = useState(1);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isPublishSuccessModalOpen, setIsPublishSuccessModalOpen] = useState(false);
  const [isInitialPreviewOpen, setIsInitialPreviewOpen] = useState(!!botId);
  const [isPublishing, setIsPublishing] = useState(false);
  const [actionError, setActionError] = useState("");

  const updateConfig = <K extends keyof typeof botConfig>(key: K, value: typeof botConfig[K]) => {
    setBotConfig((prev) => ({ ...prev, [key]: value }));
  };

  const stepValidationRules = [
    {
      isValid: botConfig.name.trim().length > 0,
      reason: "請先輸入機器人名稱。",
    },
    {
      isValid: botConfig.avatarUrl.trim().length > 0 && botConfig.background.trim().length > 0,
      reason: "請先完成頭像與背景設定。",
    },
    {
      isValid:
        botConfig.voiceId.trim().length > 0 &&
        botConfig.videoIdle.trim().length > 0 &&
        botConfig.videoThinking.trim().length > 0 &&
        botConfig.videoTalking.trim().length > 0,
      reason: "請先完成音色與三段動畫影片。",
    },
    {
      isValid: botConfig.knowledgeBase.trim().length > 0,
      reason: "請先完成知識餵養內容整理。",
    },
    {
      isValid: botConfig.securityPrompt.trim().length > 0,
      reason: "請先完成安全與權限設定。",
    },
  ];

  const firstInvalidStepIndex = stepValidationRules.findIndex((rule) => !rule.isValid);
  const firstInvalidStep = firstInvalidStepIndex === -1 ? steps.length + 1 : firstInvalidStepIndex + 1;
  const maxReachableStep = Math.min(steps.length, firstInvalidStep);
  const currentStepRule = stepValidationRules[currentStep - 1];
  const canProceed = Boolean(currentStepRule?.isValid);
  const isAllStepsValid = firstInvalidStepIndex === -1;

  const handlePublish = async () => {
    if (!isAllStepsValid || isPublishing) return;
    setActionError("");
    setIsPublishing(true);
    try {
      const newBot = {
        id: botId || Date.now().toString(),
        name: botConfig.name,
        subject: "未分類",
        subjectColor: "indigo",
        avatarUrl: botConfig.avatarUrl,
        interactions: 0,
        accuracy: 0,
        isVisible: true,

        background: botConfig.background,
        animation: botConfig.animation,

        knowledgeBase: botConfig.knowledgeBase,
        securityPrompt: botConfig.securityPrompt,

        videoIdle: botConfig.videoIdle,
        videoThinking: botConfig.videoThinking,
        videoTalking: botConfig.videoTalking,
        voiceId: botConfig.voiceId,
      };

      const apiUrl = botId
        ? `${baseUrl}/api/bots/${botId}`
        : `${baseUrl}/api/bots`;

      const response = await fetch(apiUrl, {
        method: botId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBot),
      });
      if (!response.ok) {
        throw new Error("發布失敗，請稍後再試。");
      }

      const savedBot = await response.json();
      setBotConfig((prev) => ({
        ...prev,
        id: savedBot?.id || newBot.id,
      }));

      setIsPublishSuccessModalOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "發布失敗，請稍後再試。";
      setActionError(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleClosePublishModal = () => {
    setIsPublishSuccessModalOpen(false);
    setCurrentStep(1);
    onBack();
  };

  const handleCloseInitialPreview = () => {
    setIsInitialPreviewOpen(false);
    onBack();
  };

  const handleNext = () => {
    if (!canProceed) return;
    setActionError("");
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };
  const handlePrev = () => currentStep > 1 && setCurrentStep(currentStep - 1);
  const handleStepClick = (targetStep: number) => {
    if (targetStep <= maxReachableStep) {
      setCurrentStep(targetStep);
    }
  };

  // -------------------------------
  // 3. 渲染 Step 组件
  // -------------------------------
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <CreationStep1 updateConfig={updateConfig} botName={botConfig.name} />;

      case 2:
        return <CreationStep3 updateConfig={updateConfig} botConfig={botConfig} />;

      case 3:
        return (
          <CreationStepSoundAnimation
            updateConfig={updateConfig}
            avatarUrl={botConfig.avatarUrl}
            animation={botConfig.animation}
            videoIdle={botConfig.videoIdle}
            videoThinking={botConfig.videoThinking}
            videoTalking={botConfig.videoTalking}
            voiceId={botConfig.voiceId}
          />
        );

      case 4:
        return (
          <CreationStep2
            onGenerated={(data) => {
              const combined = `
【人物背景設定】
${data.characterBackground}

【人物知識庫摘要】
${data.knowledgeSummary}

請根據「人物背景設定」與「知識庫摘要」回答問題，不要捏造不存在的資訊。
              `.trim();

              updateConfig("knowledgeBase", combined);
            }}
          />
        );

      case 5:
        return (
          <CreationStep4
            onSecurityChange={(prompt) => updateConfig("securityPrompt", prompt)}
            botId={botConfig.id || botId}
          />
        );

      default:
        return null;
    }
  };

  // -------------------------------
  // 4. 给 ChatPreview 的完整 prompt
  // -------------------------------
const fullSystemPrompt = `
    你是一名 AI 助教，具備以下資訊：

    ${botConfig.knowledgeBase}

    【安全規則】
    ${botConfig.securityPrompt}

    【對話方式】
    每次新對話先主動提出 2~3 個澄清問題，再根據使用者回答提供建議。
    若資訊不足，優先追問，不要直接假設。

    【回覆格式規則（強制）】
    1) 禁止輸出舞台描述或動作描寫，例如「（微笑）」「（拱手）」「*點頭*」。
    2) 非用戶明確要求角色扮演時，不要使用文言/古風自稱（如「老夫」「在下」）。
    3) 每次回覆控制在 1~3 句，優先短句；除非用戶要求詳細版，否則不超過 120 字。
    4) 不要長段落鋪陳，直接回答重點。

    請嚴格遵守以上所有規則。
`.trim();

const handleDeleteBot = async () => {
  if (!botId) return;

  await fetch(`${baseUrl}/api/bots/${botId}`, {
    method: "DELETE",
  });

  setIsInitialPreviewOpen(false);
  setIsPublishSuccessModalOpen(false);
  onBack();  // ⭐ 回到 Library
};

  // -------------------------------
  // 5. 组件 JSX
  // -------------------------------
  return (
    <div className="max-w-7xl mx-auto">

      {/* 返回 */}
      <button
        onClick={onBack}
        className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 mb-6"
      >
        <Icons.back className="w-4 h-4 mr-2" />
        返回我的機器人庫
      </button>

      {/* Stepper */}
      <Stepper
        steps={steps}
        currentStep={currentStep}
        onStepClick={handleStepClick}
        maxReachableStep={maxReachableStep}
      />

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

        {/* 左侧内容 */}
        <div className="lg:col-span-3">
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow min-h-[600px]">
            {renderStep()}
          </div>
        </div>

        {/* 右侧 ChatPreview */}
        <div className="hidden lg:block lg:col-span-2 lg:sticky top-28">
          <ChatPreview
            currentStep={currentStep}
            botConfig={{
              ...botConfig,
              knowledgeBase: fullSystemPrompt,
            }}
            isEditing={!!botId}
          />
        </div>
      </div>

      {/* mobile 预览按钮 */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsPreviewModalOpen(true)}
          className="w-16 h-16 bg-white/40 backdrop-blur-md border border-white/20 text-slate-800 rounded-full shadow-lg flex items-center justify-center"
        >
          <Icons.visible className="w-8 h-8" />
        </motion.button>
      </div>

      {/* mobile modal */}
      <AnimatePresence>
        {isPreviewModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg h-[85vh] max-h-[700px]"
            >
              <ChatPreview
                currentStep={currentStep}
                botConfig={{
                  ...botConfig,
                  knowledgeBase: fullSystemPrompt,
                }}
                isEditing={!!botId}
              />

              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="absolute top-4 right-4 bg-black/20 rounded-full w-8 h-8"
              >
                <Icons.close className="w-5 h-5 text-white" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 初始编辑预览 */}
      <PublishSuccessModal
        isOpen={isInitialPreviewOpen}
        onClose={handleCloseInitialPreview}
        botConfig={botConfig}
        onEdit={() => setIsInitialPreviewOpen(false)}
        onDelete={handleDeleteBot}
      />

      {/* 发布成功 */}
      <PublishSuccessModal
        isOpen={isPublishSuccessModalOpen}
        onClose={handleClosePublishModal}
        botConfig={botConfig}
        onEdit={() => {}}
        onDelete={handleDeleteBot}
      />

      {/* 底部按钮 */}
      <div className={`mt-8 flex items-center ${currentStep > 1 ? 'justify-between' : 'justify-end'}`}>
        {currentStep > 1 && (
          <button
            onClick={handlePrev}
            className="px-6 py-3 rounded-xl text-sm font-semibold bg-white border border-slate-300"
          >
            上一步
          </button>
        )}

        {currentStep < steps.length ? (
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              下一步
            </button>
            {!canProceed && (
              <p className="text-xs text-amber-600">{currentStepRule?.reason}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handlePublish}
              disabled={!isAllStepsValid || isPublishing}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-emerald-600 text-white disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              {isPublishing ? "發布中..." : botId ? '更新機器人' : '完成並發布'}
            </button>
            {!isAllStepsValid && (
              <p className="text-xs text-amber-600">
                尚有未完成步驟，請先完成第 {firstInvalidStep} 步。
              </p>
            )}
          </div>
        )}
      </div>
      {actionError && (
        <p className="mt-3 text-sm text-rose-600">{actionError}</p>
      )}
    </div>
  );
};
