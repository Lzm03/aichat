import React, { useMemo, useState, useEffect } from 'react';
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
import { buildChatSystemPrompt, buildStoredKnowledgeBase } from '../../utils/chat-prompt';
import { TopicManager } from './topics/TopicManager';
import { API_BASE } from '../../utils/api';

type KnowledgeTier = "basic_fact" | "deep_understanding";
type KnowledgePoint = {
  id: string;
  tier: KnowledgeTier;
  title: string;
  content: string;
  keywords: string[];
  assessmentCriteria: string;
};

const MAX_KNOWLEDGE_POINTS = 8;
const MAX_POINTS_PER_TIER = 4;

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
  const baseUrl = API_BASE;

  // -------------------------------
  // 1. 載入或初始化機器人配置
  // -------------------------------
  const loadBotConfig = () => {
    // ⭐ 沒有 botId = 新增模式 → 初始值
    if (!botId) {
      return {
        id: null,
        name: "我的 AI 機器人",
        avatarUrl: "/avatars/bot-default.svg",
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
    if (!botId) return;
    let cancelled = false;
    const fetchBot = async () => {
      setIsBotLoading(true);
      setBotLoadError("");
      try {
        const res = await fetch(`${baseUrl}/api/bots/${encodeURIComponent(botId)}`);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.id) {
          throw new Error(data?.error || "無法載入角色資料");
        }
        if (cancelled) return;
        setBotConfig({
          id: data.id,
          name: data.name || "",
          avatarUrl: data.avatarUrl || "",
          background: data.background || "",
          animation: data.animation || "",
          knowledgeBase: data.knowledgeBase || "",
          securityPrompt: data.securityPrompt || "",
          videoIdle: data.videoIdle || "",
          videoThinking: data.videoThinking || "",
          videoTalking: data.videoTalking || "",
          voiceId: data.voiceId || "",
          openingMessage: data.openingMessage || "",
        });
      } catch (error) {
        if (!cancelled) {
          setBotLoadError(error instanceof Error ? error.message : "無法載入角色資料");
        }
      } finally {
        if (!cancelled) setIsBotLoading(false);
      }
    };
    void fetchBot();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, botId]);

  const [botConfig, setBotConfig] = useState(loadBotConfig());
  const [isBotLoading, setIsBotLoading] = useState(Boolean(botId));
  const [botLoadError, setBotLoadError] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isPublishSuccessModalOpen, setIsPublishSuccessModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [videoStudioTask, setVideoStudioTask] = useState<VideoStudioTask | null>(null);
  const { dialog, closeDialog, showAlert } = usePlatformDialog();
  const featureMap = new Map(featureEntitlements.map((item) => [item.key, item]));
  const previousVideoTaskStatusRef = React.useRef<string | null>(null);

  const updateConfig = <K extends keyof typeof botConfig>(key: K, value: typeof botConfig[K]) => {
    setBotConfig((prev) => (Object.is(prev[key], value) ? prev : { ...prev, [key]: value }));
  };

  const parseKnowledgeBase = (knowledgeBase: string) => {
    const createKnowledgeTitle = (content: string, keywords: string[] = []) => {
      const cleaned = content.replace(/\s+/g, " ").trim();
      const keywordTitle = keywords.find((keyword) => keyword.length >= 2 && keyword.length <= 14);
      if (keywordTitle) return keywordTitle;
      const titleMatch = cleaned.match(/^([^：:，,。.!！?？]{2,14})[：:，,。.!！?？]/)?.[1]?.trim();
      if (titleMatch) return titleMatch;
      if (/本名|出生|現居|退休|排字|工人/.test(cleaned)) return "人物背景";
      if (/性格|親切|懷舊|語速|粵語|口語|停頓詞/.test(cleaned)) return "説話風格";
      if (/興趣|飲茶|散步|觀察|遊樂場/.test(cleaned)) return "生活興趣";
      if (/對話|邀請|茶|食個包/.test(cleaned)) return "對話示例";
      return cleaned.split(/[，,。.!！?？]/)[0]?.slice(0, 14) || "知識主題";
    };

    const trimKnowledgePoints = (points: KnowledgePoint[]) => {
      const basicFacts = points.filter((point) => point.tier === "basic_fact").slice(0, MAX_POINTS_PER_TIER);
      const deepPoints = points.filter((point) => point.tier === "deep_understanding").slice(0, MAX_POINTS_PER_TIER);
      return [...basicFacts, ...deepPoints]
        .slice(0, MAX_KNOWLEDGE_POINTS)
        .map((point, index) => ({
          ...point,
          title: point.title?.trim() || createKnowledgeTitle(point.content, point.keywords),
          id: `kp_${String(index + 1).padStart(3, "0")}`,
        }));
    };

    const normalizeKnowledgePoints = (points: KnowledgePoint[]) =>
      points.map((point, index) => ({
        ...point,
        title: point.title?.trim() || createKnowledgeTitle(point.content, point.keywords),
        id: point.id || `kp_${String(index + 1).padStart(3, "0")}`,
      }));

    const bgMatch = knowledgeBase.match(/【人物背景設定】([\s\S]*?)【人物知識庫摘要】/);
    const ksMatch = knowledgeBase.match(/【人物知識庫摘要】([\s\S]*?)(?:【知識點分級】|【角色對話策略】|請根據「人物背景設定」與「知識庫摘要」回答問題，不要捏造不存在的資訊。|$)/);
    const pointsMatch = knowledgeBase.match(/【知識點分級】([\s\S]*?)(?:【角色對話策略】|請根據「人物背景設定」與「知識庫摘要」回答問題，不要捏造不存在的資訊。|$)/);
    const personaMatch = knowledgeBase.match(/【角色對話策略】([\s\S]*?)(?:請根據「人物背景設定」與「知識庫摘要」回答問題，不要捏造不存在的資訊。|$)/);
    const personaText = personaMatch?.[1] || "";
    let knowledgePoints: KnowledgePoint[] = [];
    try {
      const raw = pointsMatch?.[1]?.trim();
      const parsed = raw ? JSON.parse(raw) : [];
      knowledgePoints = normalizeKnowledgePoints(Array.isArray(parsed)
        ? parsed
            .map((item, index) => ({
              id: String(item?.id || `kp_${String(index + 1).padStart(3, "0")}`),
              tier: (item?.tier === "deep_understanding" ? "deep_understanding" : "basic_fact") as KnowledgeTier,
              title: String(item?.title || item?.topic || "").trim(),
              content: String(item?.content || "").trim(),
              keywords: Array.isArray(item?.keywords)
                ? item.keywords.map((keyword: string) => String(keyword || "").trim()).filter(Boolean)
                : [],
              assessmentCriteria: String(item?.assessmentCriteria || item?.assessment_criteria || "").trim(),
            }))
            .filter((item) => item.content)
        : []);
    } catch {
      knowledgePoints = [];
    }
    const knowledgeSummary = ksMatch?.[1]?.trim() || "";
    if (!knowledgePoints.length && knowledgeSummary) {
      const summaryLines = knowledgeSummary
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^-+\s*/, "").trim())
        .filter((line) => !/^[\[\]\{\}",]+$/.test(line))
        .filter((line) => !/^(id|tier|content|keywords|assessmentCriteria|assessment_criteria)\s*[:：]/i.test(line))
        .filter((line) => !/^【?知識點分級】?$/.test(line));

      knowledgePoints = trimKnowledgePoints(summaryLines
        .map((line, index) => {
          const tier = /\[(深度理解|基礎事實)\]/.test(line)
            ? (line.includes("深度理解") ? "deep_understanding" : "basic_fact")
            : (index < Math.ceil(summaryLines.length / 2) ? "basic_fact" : "deep_understanding");
          const content = line
            .replace(/\[(深度理解|基礎事實)\]/g, "")
            .replace(/（.*?）/g, "")
            .trim();
          const [maybeTitle, ...contentParts] = content.split(/[：:]/);
          const parsedContent = contentParts.length ? contentParts.join("：").trim() : content;
          const keywordMatch = line.match(/關鍵詞：([^｜）]+)/);
          const assessmentMatch = line.match(/評估：([^）]+)/);
          const keywords = keywordMatch?.[1]
            ?.split(/[、，,]/)
            .map((item) => item.trim())
            .filter(Boolean) || [];
          return {
            id: `kp_${String(index + 1).padStart(3, "0")}`,
            tier: tier as KnowledgeTier,
            title: contentParts.length ? maybeTitle.trim() : createKnowledgeTitle(parsedContent, keywords),
            content: parsedContent,
            keywords,
            assessmentCriteria: assessmentMatch?.[1]?.trim() || "",
          };
        })
        .filter((item) => item.content));
    }
    const traits = (personaText.match(/【性格特質】([^\n]+)/)?.[1] || "")
      .split("、")
      .map((s) => s.trim())
      .filter(Boolean);
    const speakingStyle = (personaText.match(/【説話風格】([^\n]+)/)?.[1] || "文言文").trim();
    const answerMode = (personaText.match(/【答題策略】([^\n]+)/)?.[1] || "引導後再回答").trim();
    return {
      characterBackground: bgMatch?.[1]?.trim() || "",
      knowledgeSummary,
      knowledgePoints,
      personalityTraits: traits.length ? traits : ["耐心"],
      speakingStyle,
      answerMode,
    };
  };
  const parsedKnowledgeData = useMemo(
    () => parseKnowledgeBase(botConfig.knowledgeBase),
    [botConfig.knowledgeBase]
  );

  const parseSecurityConfig = (securityPrompt: string) => {
    const sharingMode = (securityPrompt.match(/【共享模式】([^\n]+)/)?.[1] || "link").trim();
    const filterLevel = (securityPrompt.match(/【過濾等級】([^\n]+)/)?.[1] || "standard").trim();
    const customWords = (securityPrompt.match(/【自定義詞】([^\n]*)/)?.[1] || "").trim();
    return { sharingMode, filterLevel, customWords };
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
  // 3. 渲染 Step 組件
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
          <>
            <header className="mb-8 border-b border-slate-200 pb-7">
              <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">知識與教學設定</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                先設定所有對話共用的角色基礎，再整理知識內容與各主題的專屬教學資料。
              </p>
            </header>
            <CreationStep2
              initialData={parsedKnowledgeData}
              afterKnowledgePointEditor={
                <TopicManager characterId={String(botConfig.id || botId || "").trim() || null} />
              }
              onGenerated={(data) => {
                const combined = buildStoredKnowledgeBase({
                  characterBackground: data.characterBackground,
                  knowledgeSummary: data.knowledgeSummary,
                  knowledgePoints: data.knowledgePoints,
                  personaProfile: data.personaProfile,
                });

                updateConfig("knowledgeBase", combined);
              }}
            />
          </>
        );

      case 5:
        return (
          <CreationStep4
            onSecurityChange={(prompt) => updateConfig("securityPrompt", prompt)}
            botId={botConfig.id || botId}
            initialConfig={parseSecurityConfig(botConfig.securityPrompt)}
          />
        );

      default:
        return null;
    }
  };

  // -------------------------------
  // 4. 給 ChatPreview 的完整 prompt
  // -------------------------------
const fullSystemPrompt = `
    ${buildChatSystemPrompt({
      roleName: botConfig.name,
      knowledgeBase: botConfig.knowledgeBase,
      securityPrompt: botConfig.securityPrompt,
    })}
`.trim();

const handleDeleteBot = async () => {
  if (!botId) return;

  await fetch(`${baseUrl}/api/bots/${botId}`, {
    method: "DELETE",
  });

  setIsPublishSuccessModalOpen(false);
  onBack();  // ⭐ 回到 Library
};

  if (botId && isBotLoading) {
    return (
      <div className="mx-auto flex min-h-[520px] max-w-7xl items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <p className="mt-4 text-sm font-semibold text-slate-600">正在載入角色資料…</p>
        </div>
      </div>
    );
  }

  if (botId && botLoadError) {
    return (
      <div className="mx-auto flex min-h-[520px] max-w-7xl items-center justify-center px-6">
        <div className="max-w-md rounded-[24px] border border-rose-200 bg-white p-7 text-center shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-900">無法開啟角色編輯頁</h2>
          <p className="mt-2 text-sm leading-6 text-rose-600">{botLoadError}</p>
          <button type="button" onClick={onBack} className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white">返回機器人庫</button>
        </div>
      </div>
    );
  }

  // -------------------------------
  // 5. 組件 JSX
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

        {/* 左側內容 */}
        <div className={currentStep === 4 ? "lg:col-span-1" : "lg:col-span-3"}>
          <div className={`min-h-[600px] bg-white ${
            currentStep === 4
              ? "rounded-[28px] border border-slate-200/80 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.06)] md:p-8 lg:p-10"
              : "rounded-3xl p-6 shadow md:p-8"
          }`}>
            {renderStep()}
          </div>
        </div>

        {/* 右側 ChatPreview */}
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

      {/* mobile 預覽按鈕 */}
      <div className="hidden lg:hidden fixed bottom-6 right-6 z-40">
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

      {/* 發佈成功 */}
      <PublishSuccessModal
        isOpen={isPublishSuccessModalOpen}
        onClose={handleClosePublishModal}
        botConfig={botConfig}
        onEdit={() => setIsPublishSuccessModalOpen(false)}
        onDelete={handleDeleteBot}
      />

      {/* 底部按鈕 */}
      <div className={`mt-5 flex items-center rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] ${currentStep > 1 ? 'justify-between' : 'justify-end'}`}>
        {currentStep > 1 && (
          <button
            onClick={handlePrev}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            上一步
          </button>
        )}

        {currentStep < steps.length ? (
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
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
