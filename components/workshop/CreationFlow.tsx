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
import type { FeatureEntitlement } from '../../hooks/useFeatureEntitlements';
import { usePlatformDialog } from '../../hooks/usePlatformDialog';
import { PlatformDialog } from '../system/PlatformDialog';

type VideoStudioTask = {
  id: string;
  status: "pending" | "generating" | "remove_bg_done" | "ready" | "failed";
  slots?: {
    idle?: { status?: string; resultUrl?: string | null };
    speaking?: { status?: string; resultUrl?: string | null };
    thinking?: { status?: string; resultUrl?: string | null };
  };
};

interface CreationFlowProps {
  onBack: () => void;
  botId: string | null;
  featureEntitlements: FeatureEntitlement[];
  refreshFeatureEntitlements: () => Promise<any>;
  consumeFeature: (key: string, amount?: number, meta?: Record<string, unknown>) => Promise<any>;
}

const steps = ["基礎設定", "形象與人格", "聲音與動畫", "知識餵養", "安全與權限"];

export const CreationFlow: React.FC<CreationFlowProps> = ({
  onBack,
  botId,
  featureEntitlements,
  refreshFeatureEntitlements,
  consumeFeature,
}) => {
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
        openingMessage: "",
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
      openingMessage: "",
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
      openingMessage: data.openingMessage || "",
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
  const [videoStudioTask, setVideoStudioTask] = useState<VideoStudioTask | null>(null);
  const { dialog, closeDialog, showAlert } = usePlatformDialog();
  const featureMap = new Map(featureEntitlements.map((item) => [item.key, item]));
  const previousVideoTaskStatusRef = React.useRef<string | null>(null);

  const updateConfig = <K extends keyof typeof botConfig>(key: K, value: typeof botConfig[K]) => {
    setBotConfig((prev) => ({ ...prev, [key]: value }));
  };

  const parseKnowledgeBase = (knowledgeBase: string) => {
    const bgMatch = knowledgeBase.match(/【人物背景設定】([\s\S]*?)【人物知識庫摘要】/);
    const ksMatch = knowledgeBase.match(/【人物知識庫摘要】([\s\S]*?)(?:請根據「人物背景設定」與「知識庫摘要」回答問題，不要捏造不存在的資訊。)?$/);
    return {
      characterBackground: bgMatch?.[1]?.trim() || "",
      knowledgeSummary: ksMatch?.[1]?.trim() || "",
    };
  };

  useEffect(() => {
    if (!videoStudioTask) return;
    const idleUrl = videoStudioTask.slots?.idle?.resultUrl || "";
    const thinkingUrl = videoStudioTask.slots?.thinking?.resultUrl || "";
    const talkingUrl = videoStudioTask.slots?.speaking?.resultUrl || "";

    if (idleUrl && idleUrl !== botConfig.videoIdle) updateConfig("videoIdle", idleUrl);
    if (thinkingUrl && thinkingUrl !== botConfig.videoThinking) updateConfig("videoThinking", thinkingUrl);
    if (talkingUrl && talkingUrl !== botConfig.videoTalking) updateConfig("videoTalking", talkingUrl);
  }, [videoStudioTask]);

  useEffect(() => {
    if (!videoStudioTask?.id) return;
    if (videoStudioTask.status === "ready" || videoStudioTask.status === "failed") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/video/studio-task/${videoStudioTask.id}`);
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.task) {
          setVideoStudioTask(data.task);
        }
      } catch {
        // ignore polling failure
      }
    };

    void poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [baseUrl, videoStudioTask?.id, videoStudioTask?.status]);

  useEffect(() => {
    const previousStatus = previousVideoTaskStatusRef.current;
    const currentStatus = videoStudioTask?.status || null;
    if (currentStatus === "ready" && previousStatus && previousStatus !== "ready") {
      showAlert({
        title: "影片生成完成",
        message: "三段動畫已全部完成，現在可以發布了。",
      });
    }
    previousVideoTaskStatusRef.current = currentStatus;
  }, [videoStudioTask?.status, showAlert]);

  const videosReady =
    botConfig.videoIdle.trim().length > 0 &&
    botConfig.videoThinking.trim().length > 0 &&
    botConfig.videoTalking.trim().length > 0;
  const videoTaskInProgress =
    Boolean(videoStudioTask?.id) &&
    videoStudioTask?.status !== "ready" &&
    videoStudioTask?.status !== "failed";

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
        (videosReady || videoTaskInProgress),
      reason: videoTaskInProgress
        ? "動畫正在背景生成中，你可以先繼續下一步。"
        : "請先完成音色與三段動畫影片。",
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
  const canPublish = isAllStepsValid && videosReady;

  const handlePublish = async () => {
    if (!canPublish || isPublishing) return;
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
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "發布失敗，請稍後再試。");
      }

      const savedBot = await response.json();
      await refreshFeatureEntitlements();
      setBotConfig((prev) => ({
        ...prev,
        id: savedBot?.id || newBot.id,
        openingMessage: savedBot?.openingMessage || prev.openingMessage || "",
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
        return (
          <CreationStep1
            updateConfig={updateConfig}
            botName={botConfig.name}
          />
        );

      case 2:
        return (
          <CreationStep3
            updateConfig={updateConfig}
            botConfig={botConfig}
            avatarAiFeature={featureMap.get("avatar_ai_generate")}
            backgroundAiFeature={featureMap.get("background_ai_generate")}
          />
        );

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
            videoStudioTask={videoStudioTask}
            onVideoStudioTaskChange={setVideoStudioTask}
            voicePreviewFeature={featureMap.get("voice_audition_preview")}
            videoStudioFeature={featureMap.get("video_studio_generate")}
            consumeFeature={consumeFeature}
            onFeatureRefresh={refreshFeatureEntitlements}
          />
        );

      case 4:
        return (
          <CreationStep2
            initialData={parseKnowledgeBase(botConfig.knowledgeBase)}
            onGenerated={(data) => {
              const combined = `
【人物背景設定】
${data.characterBackground}

【人物知識庫摘要】
${data.knowledgeSummary}

【角色對話策略】
${data.personaProfile}

請根據「人物背景設定」與「知識庫摘要」回答問題，不要捏造不存在的資訊。
              `.trim();

              updateConfig("knowledgeBase", combined);
            }}
            knowledgeFeature={featureMap.get("knowledge_points")}
          />
        );

      case 5:
        return (
          <CreationStep4
            onSecurityChange={(prompt) => updateConfig("securityPrompt", prompt)}
            botId={botConfig.id || botId}
            securityFeature={featureMap.get("security_points")}
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

      <div
        className={`mt-8 grid grid-cols-1 gap-8 items-start ${
          currentStep === 4 ? "lg:grid-cols-1" : "lg:grid-cols-5"
        }`}
      >

        {/* 左侧内容 */}
        <div className={currentStep === 4 ? "lg:col-span-1" : "lg:col-span-3"}>
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow min-h-[600px]">
            {renderStep()}
          </div>
        </div>

        {/* 右侧 ChatPreview */}
        <div
          className={`hidden lg:block lg:col-span-2 lg:sticky top-28 ${
            currentStep === 4 ? "lg:hidden" : ""
          }`}
        >
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
                className="absolute z-20 top-4 right-4 bg-black/30 backdrop-blur rounded-full w-10 h-10 flex items-center justify-center"
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
        onEdit={() => setIsPublishSuccessModalOpen(false)}
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
              onClick={() => {
                if (!botId && featureMap.get("bot_publish")?.locked) {
                  showAlert({
                    title: "創建角色已用完",
                    message: featureMap.get("bot_publish")!.upgradeMessage,
                  });
                  return;
                }
                void handlePublish();
              }}
              disabled={!canPublish || isPublishing}
              className={`px-6 py-3 rounded-xl text-sm font-semibold disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed ${
                !botId && featureMap.get("bot_publish")?.locked
                  ? "bg-slate-200 text-slate-500"
                  : "bg-emerald-600 text-white"
              }`}
            >
              {isPublishing ? "發布中..." : botId ? '更新機器人' : '完成並發布'}
            </button>
            {!botId && featureMap.get("bot_publish") && (
              <p className={`text-xs ${featureMap.get("bot_publish")?.locked ? "text-rose-600" : "text-slate-500"}`}>
                創建角色 {featureMap.get("bot_publish")?.used}/{featureMap.get("bot_publish")?.limit}
              </p>
            )}
            {!canPublish && (
              <p className="text-xs text-amber-600">
                {videoTaskInProgress
                  ? "三段動畫仍在背景生成中，完成後才可發布。"
                  : `尚有未完成步驟，請先完成第 ${firstInvalidStep} 步。`}
              </p>
            )}
          </div>
        )}
      </div>
      {actionError && (
        <p className="mt-3 text-sm text-rose-600">{actionError}</p>
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
    </div>
  );
};
