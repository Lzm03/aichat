import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Send,
  Mic,
  Square,
  MessageCircle,
  MessagesSquare,
  ChevronDown,
  Camera,
  MoreHorizontal,
  Lightbulb,
  Brain,
  Rocket,
  BookOpen,
  Check,
  Loader2,
} from "lucide-react";
import { SequencePngPlayer } from "./SequencePngPlayer";
import { API_BASE } from "../../utils/api";
import {
  deleteConversation as deleteConversationRecord,
  deleteConversations as deleteConversationRecords,
  getMessages,
  listConversations,
  renameConversation as renameConversationRecord,
  sendConversationMessage,
  updateConversationTopic as updateConversationTopicRecord,
} from "../../utils/chat-api";
import { listCharacterTopics } from "../../utils/topic-api";
import { buildChatSystemPrompt } from "../../utils/chat-prompt";
import { readAuthSession } from "../../utils/auth";
import { usePlatformDialog } from "../../hooks/usePlatformDialog";
import { PlatformDialog } from "../system/PlatformDialog";
import { markTrialEndedPopupPending } from "../../utils/trial-popup";
import { ConversationHistoryDrawer } from "../chat/ConversationHistoryDrawer";
import type { ConversationMessage, ConversationSummary } from "../../types/chat";
import type { CharacterTopicSummary } from "../../types/topics";

interface PublishSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  botConfig: any;
  onEdit: () => void;
  onDelete: (botId: string) => void;
  isSharedView?: boolean;
}

type SuggestedReply = {
  tier: "L1" | "L2" | "L3";
  label: string;
  text: string;
  sendText?: string;
};

type ChatMessage = {
  role: "user" | "bot" | "event";
  content: string;
  guidedTitle?: string;
  guidedBody?: string;
  imagePreviews?: string[];
};

type ReplyLanguage = "cantonese" | "mandarin" | "english";

const REPLY_LANGUAGE_OPTIONS: Array<{
  value: ReplyLanguage;
  label: string;
  speechRecognitionLanguage: string;
  ttsLanguage: "Chinese,Yue" | "Chinese" | "English";
  guideLabels: [string, string, string];
  prompt: string;
}> = [
  {
    value: "cantonese",
    label: "粵語",
    speechRecognitionLanguage: "zh-HK",
    ttsLanguage: "Chinese,Yue",
    guideLabels: ["基礎事實", "深入思考", "價值遷移"],
    prompt: "Reply in natural Hong Kong Cantonese written with Traditional Chinese characters and everyday Cantonese wording. Do not switch to Mandarin unless the user asks.",
  },
  {
    value: "mandarin",
    label: "普通話",
    speechRecognitionLanguage: "zh-CN",
    ttsLanguage: "Chinese",
    guideLabels: ["基礎事實", "深入思考", "價值遷移"],
    prompt: "MANDATORY FINAL-OUTPUT RULE: Reply only in natural Standard Mandarin written with Traditional Chinese characters. Before sending, rewrite the entire response into standard Mandarin grammar and vocabulary. Never imitate the character's Cantonese speech style. Do not output Cantonese words or particles, including 係、嘅、喺、咗、佢、哋、唔、冇、咁、啲、喎、噃、嚇、畀、諗、睇、噉. Use 是、的、在、了、他們、不、沒有、這樣、一些、給、想、看 instead. This rule applies to every sentence, question, teaching hint, and suggested reply and overrides all persona style instructions.",
  },
  {
    value: "english",
    label: "English",
    speechRecognitionLanguage: "en-US",
    ttsLanguage: "English",
    guideLabels: ["Key fact", "Think deeper", "Apply the idea"],
    prompt: "Reply in clear, natural English. Do not switch to Chinese unless the user asks.",
  },
];

type ActiveQuizSummary = {
  id: string;
  title: string;
  botId: string;
  targetGrade?: string;
  questionCount: number;
  status: string;
};

type ActiveQuizAttempt = {
  id: string;
  status: "pending" | "deferred" | "in_progress" | "completed";
  currentIndex: number;
  score: number;
  totalPoints: number;
  result?: Record<string, any>;
};

type QuizPreviewQuestion = {
  id: string | number;
  type: string;
  cognitiveLevel: string;
  levelColor: string;
  content: string;
  options?: string[];
  answer: string;
};

const GUIDE_HINT_DELAY_MS = 1600;
const IDLE_GUIDE_DELAY_MS = 15000;

const normalizeMandarinTraditional = (text: string) =>
  String(text || "")
    .replace(/有冇/g, "有沒有")
    .replace(/呢一個/g, "這一個")
    .replace(/呢個/g, "這個")
    .replace(/嗰一個/g, "那一個")
    .replace(/嗰個/g, "那個")
    .replace(/呢度/g, "這裡")
    .replace(/嗰度/g, "那裡")
    .replace(/我哋/g, "我們")
    .replace(/你哋/g, "你們")
    .replace(/佢哋/g, "他們")
    .replace(/佢/g, "他")
    .replace(/係咪/g, "是不是")
    .replace(/唔係/g, "不是")
    .replace(/冇/g, "沒有")
    .replace(/唔/g, "不")
    .replace(/喺/g, "在")
    .replace(/畀/g, "給")
    .replace(/嚟/g, "來")
    .replace(/講/g, "説")
    .replace(/諗/g, "想")
    .replace(/睇/g, "看")
    .replace(/咁/g, "這樣")
    .replace(/啲/g, "一些")
    .replace(/咗/g, "了")
    .replace(/嘅/g, "的")
    .replace(/係/g, "是")
    .replace(/啱/g, "對")
    .replace(/噉/g, "這樣")
    .replace(/[喎噃嚇呀㗎啦囉]/g, "");

export const PublishSuccessModal: React.FC<PublishSuccessModalProps> = ({
  isOpen,
  onClose,
  botConfig,
  onEdit,
  onDelete,
  isSharedView = false,
}) => {
  if (!botConfig) return null;

  const {
    name: botName = "AI 機器人",
    avatarUrl,
    background,
    videoIdle,
    videoThinking,
    videoTalking,
    voiceId, 
    openingMessage: configuredOpeningMessage,
  } = botConfig;

  
  const lastTTS = useRef(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestedReplies, setSuggestedReplies] = useState<SuggestedReply[]>([]);
  const [guideQuestion, setGuideQuestion] = useState("");

  const [inputText, setInputText] = useState("");
  const [chatImages, setChatImages] = useState<File[]>([]);
  const [chatImagePreviews, setChatImagePreviews] = useState<string[]>([]);
  const [isChatDragActive, setIsChatDragActive] = useState(false);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bootingOverlayRef = useRef<HTMLDivElement | null>(null);
  const guideActivationTimerRef = useRef<number | null>(null);
  const idleGuideTimerRef = useRef<number | null>(null);
  const inputTextRef = useRef("");
  const suggestedRepliesRef = useRef<SuggestedReply[]>([]);
  const wasOpenRef = useRef(false);
  const [botState, setBotState] = useState<"idle" | "thinking" | "speaking">(
    "idle"
  );
  const [isStopAvailable, setIsStopAvailable] = useState(false);
  const [awaitingAudioGesture, setAwaitingAudioGesture] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [openingReady, setOpeningReady] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [isMobileClient, setIsMobileClient] = useState(false);
  const [permissionReady, setPermissionReady] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [voiceLimitMessage, setVoiceLimitMessage] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [cameraBackgroundReady, setCameraBackgroundReady] = useState(false);
  const [cameraBackgroundError, setCameraBackgroundError] = useState("");
  const [cameraBackgroundLoading, setCameraBackgroundLoading] = useState(false);
  const [characterScale, setCharacterScale] = useState(0.82);
  const [characterOffset, setCharacterOffset] = useState({ x: 0, y: 0 });
  const [isRecordingScreen, setIsRecordingScreen] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [stagePhotoError, setStagePhotoError] = useState("");
  const [isCapturingStagePhoto, setIsCapturingStagePhoto] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [availableTopics, setAvailableTopics] = useState<CharacterTopicSummary[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [isTopicSelectorOpen, setIsTopicSelectorOpen] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [isSwitchingTopic, setIsSwitchingTopic] = useState(false);
  const [topicError, setTopicError] = useState("");
  const [historyMenuConversationId, setHistoryMenuConversationId] = useState<string | null>(null);
  const [historySelectionMode, setHistorySelectionMode] = useState(false);
  const [selectedHistoryConversationIds, setSelectedHistoryConversationIds] = useState<string[]>([]);
  const [historyActionLoading, setHistoryActionLoading] = useState(false);
  const [arControlsOpen, setArControlsOpen] = useState(false);
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [guidedTotalSteps, setGuidedTotalSteps] = useState(0);
  const [modelProvider, setModelProvider] = useState<"deepseek" | "gemini">("deepseek");
  const [replyLanguage, setReplyLanguage] = useState<ReplyLanguage>(() => {
    if (typeof window === "undefined") return "cantonese";
    const saved = window.localStorage.getItem(`bot-reply-language:${botConfig.id}`);
    return REPLY_LANGUAGE_OPTIONS.some((option) => option.value === saved)
      ? (saved as ReplyLanguage)
      : "cantonese";
  });
  const [translatedOpeningMessage, setTranslatedOpeningMessage] = useState("");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuizSummary | null>(null);
  const [activeQuizAttempt, setActiveQuizAttempt] = useState<ActiveQuizAttempt | null>(null);
  const [quizUiState, setQuizUiState] = useState<"hidden" | "banner" | "prompt" | "later" | "taking" | "result">("hidden");
  const [quizQuestion, setQuizQuestion] = useState<QuizPreviewQuestion | null>(null);
  const [quizAllQuestions, setQuizAllQuestions] = useState<QuizPreviewQuestion[]>([]);
  const [quizPrefetchedQuestion, setQuizPrefetchedQuestion] = useState<QuizPreviewQuestion | null>(null);
  const [quizCurrentIndex, setQuizCurrentIndex] = useState(0);
  const [quizTotalQuestions, setQuizTotalQuestions] = useState(0);
  const [quizSelectedAnswer, setQuizSelectedAnswer] = useState("");
  const [quizTextAnswer, setQuizTextAnswer] = useState("");
  const [quizAnswerMap, setQuizAnswerMap] = useState<Record<number, string>>({});
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizStarting, setQuizStarting] = useState(false);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizBackgroundSaving, setQuizBackgroundSaving] = useState(false);
  const [quizRestarting, setQuizRestarting] = useState(false);
  const [quizResult, setQuizResult] = useState<Record<string, any> | null>(null);
  const { dialog, closeDialog, showAlert, showConfirm } = usePlatformDialog();
  const [seqIdle, setSeqIdle] = useState<any>(null);
  const [seqThinking, setSeqThinking] = useState<any>(null);
  const [seqTalking, setSeqTalking] = useState<any>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatImageInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const conversationMessagesCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const conversationLanguageCacheRef = useRef<Map<string, ReplyLanguage>>(new Map());
  const conversationPrefetchingRef = useRef<Set<string>>(new Set());
  const topicSelectorRef = useRef<HTMLDivElement | null>(null);
  const lastHistoryBotIdRef = useRef<string | null>(null);
  const stageCaptureRef = useRef<HTMLDivElement | null>(null);
  const stageBackgroundImageRef = useRef<HTMLImageElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestTokenRef = useRef(0);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenChunksRef = useRef<BlobPart[]>([]);
  const speechMeterStreamRef = useRef<MediaStream | null>(null);
  const speechMeterAudioContextRef = useRef<AudioContext | null>(null);
  const speechMeterAnalyserRef = useRef<AnalyserNode | null>(null);
  const speechMeterFrameRef = useRef<number | null>(null);
  const arStageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const requestHeaders = {
    "Content-Type": "application/json",
  };
  const pinchStateRef = useRef<{
    distance: number;
    scale: number;
    centerX: number;
    centerY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const voicePlaybackEnabledRef = useRef(Boolean(voiceId));
  const voiceLimitNoticeShownRef = useRef(false);
  const interactionRecordedRef = useRef(false);
  const ttsErrorNoticeShownRef = useRef(false);

  const selectedReplyLanguage =
    REPLY_LANGUAGE_OPTIONS.find((option) => option.value === replyLanguage) || REPLY_LANGUAGE_OPTIONS[0];
  const selectedTopic =
    availableTopics.find((topic) => topic.id === selectedTopicId) ||
    availableTopics.find((topic) => topic.isDefault) ||
    availableTopics[0] ||
    null;
  const shareableLink =
    botConfig?.id && typeof window !== "undefined"
      ? `${window.location.origin}/bot/${botConfig.id}`
      : "";
  const compiledPersonaPrompt = buildChatSystemPrompt({
    roleName: botName,
    knowledgeBase: botConfig.knowledgeBase,
    securityPrompt: botConfig.securityPrompt,
  });
  const usesClassicalChineseStyle = /【説話風格】\s*文言文|淺近文言文/.test(compiledPersonaPrompt);
  const classicalChineseFinalRule = !usesClassicalChineseStyle
    ? ""
    : replyLanguage === "english"
      ? "\n\n# Highest-priority Final Style Rule\nReply entirely in English. Render the selected Classical Chinese style as concise, dignified, aphoristic English, while remaining easy for students to understand. Never output Chinese."
      : "\n\n# Highest-priority Final Style Rule\nEvery word of the final reply must be easy-to-understand Classical Chinese in Traditional Chinese. This register rule overrides the Cantonese or Mandarin wording preference. Never output modern Cantonese words such as 係、嘅、喺、咗、佢、哋、唔、冇、咁、啲、畀、諗、睇、嚟、咪.";
  const chatSystemPrompt = `${compiledPersonaPrompt}\n\n# Required Reply Language\n${selectedReplyLanguage.prompt}${classicalChineseFinalRule}`;
  const buildDefaultOpeningMessage = React.useCallback(() => {
    if (replyLanguage === "english") return `Hi! I'm ${botName}. Let's start learning together.`;
    if (usesClassicalChineseStyle) return `吾乃${botName}。今日且與汝共學，徐徐探其理。`;
    if (replyLanguage === "mandarin") return `您好，我是${botName}。讓我們一起開始今天的學習吧。`;
    return `你好！我係${botName}，我哋一齊開始今日嘅學習啦。`;
  }, [botName, replyLanguage, usesClassicalChineseStyle]);
  const authSession = readAuthSession();
  const canUseHistory = Boolean(authSession?.user?.id);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !botConfig?.id) return;
    setTopicsLoading(true);
    setTopicError("");
    setIsTopicSelectorOpen(false);
    void listCharacterTopics(botConfig.id)
      .then((data) => {
        if (cancelled) return;
        setAvailableTopics(data.topics);
        setSelectedTopicId((current) =>
          current && data.topics.some((topic) => topic.id === current)
            ? current
            : data.topics.find((topic) => topic.isDefault)?.id || data.topics[0]?.id || null
        );
      })
      .catch((loadError) => {
        if (cancelled) return;
        setAvailableTopics([]);
        setSelectedTopicId(null);
        setTopicError(loadError instanceof Error ? loadError.message : "無法載入主題");
      })
      .finally(() => {
        if (!cancelled) setTopicsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [botConfig?.id, isOpen]);

  const buildOpeningMessage = React.useCallback(() => {
    const customOpeningMessage = String(configuredOpeningMessage || "").trim();
    if (customOpeningMessage) {
      if (replyLanguage === "cantonese") return customOpeningMessage;
      if (usesClassicalChineseStyle && replyLanguage === "mandarin") return customOpeningMessage;
      if (translatedOpeningMessage) return translatedOpeningMessage;
    }
    return buildDefaultOpeningMessage();
  }, [buildDefaultOpeningMessage, configuredOpeningMessage, replyLanguage, translatedOpeningMessage, usesClassicalChineseStyle]);

  useEffect(() => {
    const sourceText = String(configuredOpeningMessage || "").trim();
    setTranslatedOpeningMessage("");
    if (
      !sourceText ||
      replyLanguage === "cantonese" ||
      (usesClassicalChineseStyle && replyLanguage === "mandarin")
    ) return;
    const controller = new AbortController();
    void fetch(`${API_BASE}/api/ask`, {
      method: "POST",
      headers: requestHeaders,
      signal: controller.signal,
      body: JSON.stringify({
        mode: "translate_text",
        text: sourceText,
        systemPrompt: chatSystemPrompt,
        replyLanguage,
        modelProvider,
        botId: botConfig.id,
        sharedBotId: isSharedView ? botConfig.id : undefined,
        usageType: "opening_translation",
      }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const translated = String(data?.reply || "").trim();
        if (translated) setTranslatedOpeningMessage(translated);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("opening message translation skipped", error);
        }
      });
    return () => controller.abort();
  }, [botConfig.id, chatSystemPrompt, configuredOpeningMessage, isSharedView, modelProvider, replyLanguage, usesClassicalChineseStyle]);

  const handleReplyLanguageChange = React.useCallback((nextLanguage: ReplyLanguage) => {
    if (nextLanguage === replyLanguage) return;
    stopAllSpeech();
    activeRequestController.current?.abort();
    activeRequestController.current = null;
    generationIdRef.current += 1;
    setMessages([]);
    setSuggestedReplies([]);
    setGuideQuestion("");
    setGuidedMode(false);
    setGuidedStepIndex(0);
    setGuidedTotalSteps(0);
    setCurrentConversationId(null);
    setBotState("idle");
    setReplyLanguage(nextLanguage);
  }, [replyLanguage]);

  useEffect(() => {
    window.localStorage.setItem(`bot-reply-language:${botConfig.id}`, replyLanguage);
  }, [botConfig.id, replyLanguage]);

  useEffect(() => {
    if (replyLanguage !== "mandarin") return;
    setMessages((current) =>
      current.map((message) =>
        message.role === "bot"
          ? {
              ...message,
              content: normalizeMandarinTraditional(message.content),
              guidedBody: message.guidedBody
                ? normalizeMandarinTraditional(message.guidedBody)
                : message.guidedBody,
            }
          : message
      )
    );
    setGuideQuestion((current) => normalizeMandarinTraditional(current));
    setSuggestedReplies((current) =>
      current.map((item) => ({
        ...item,
        text: normalizeMandarinTraditional(item.text),
        sendText: item.sendText ? normalizeMandarinTraditional(item.sendText) : item.sendText,
      }))
    );
  }, [replyLanguage]);

  const resetConversationView = React.useCallback(
    (nextConversationId?: string | null) => {
      stopAllSpeech();
      setCurrentConversationId(nextConversationId ?? null);
      setGuidedMode(false);
      setGuidedStepIndex(0);
      setGuidedTotalSteps(0);
      setSuggestedReplies([]);
      setGuideQuestion("");
      setBotState("idle");
      setIsStopAvailable(false);
      setSelectedTopicId(
        availableTopics.find((topic) => topic.isDefault)?.id || availableTopics[0]?.id || null
      );
      setMessages([{ role: "bot", content: buildOpeningMessage() }]);
    },
    [availableTopics, buildOpeningMessage]
  );

  const syncConversationList = React.useCallback(
    (updater: (prev: ConversationSummary[]) => ConversationSummary[]) => {
      setConversations((prev) => updater(prev).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)));
    },
    []
  );

  const isEmptyConversation = React.useCallback((conversation: ConversationSummary) => {
    const preview = String(conversation.lastMessagePreview || "").trim();
    return conversation.title === "新的對話" && !preview;
  }, []);

  const mapConversationMessagesToChatMessages = React.useCallback(
    (historyMessages: ConversationMessage[]) => {
      const restoredMessages: ChatMessage[] = historyMessages.map((message) => ({
        role: message.role === "assistant" ? "bot" : message.role === "system" ? "event" : "user",
        content: message.content,
      }));
      return restoredMessages.length
        ? restoredMessages
        : ([{ role: "bot", content: buildOpeningMessage() }] as ChatMessage[]);
    },
    [buildOpeningMessage]
  );

  const detectConversationLanguage = React.useCallback(
    (historyMessages: ConversationMessage[]): ReplyLanguage => {
      const savedLanguage = [...historyMessages]
        .reverse()
        .map((message) => message.metadata?.replyLanguage)
        .find((language) =>
          language === "cantonese" || language === "mandarin" || language === "english"
        );
      if (savedLanguage) return savedLanguage as ReplyLanguage;
      const assistantText = historyMessages
        .filter((message) => message.role === "assistant")
        .map((message) => message.content)
        .join(" ");
      if (/[A-Za-z]{4,}\s+[A-Za-z]{3,}/.test(assistantText)) return "english";
      if (/[嘅係喺咗佢哋唔冇咁啲喎嚟]/.test(assistantText)) return "cantonese";
      return "mandarin";
    },
    []
  );

  const prefetchConversationMessages = React.useCallback(
    async (conversationId: string) => {
      if (
        !conversationId ||
        conversationMessagesCacheRef.current.has(conversationId) ||
        conversationPrefetchingRef.current.has(conversationId)
      ) {
        return;
      }
      conversationPrefetchingRef.current.add(conversationId);
      try {
        const historyMessages = await getMessages(conversationId);
        conversationLanguageCacheRef.current.set(
          conversationId,
          detectConversationLanguage(historyMessages)
        );
        conversationMessagesCacheRef.current.set(
          conversationId,
          mapConversationMessagesToChatMessages(historyMessages)
        );
      } catch (error) {
        console.warn("prefetch conversation messages failed", error);
      } finally {
        conversationPrefetchingRef.current.delete(conversationId);
      }
    },
    [detectConversationLanguage, mapConversationMessagesToChatMessages]
  );

  const fetchConversationHistory = React.useCallback(async (options?: { silent?: boolean }) => {
    if (!canUseHistory || !botConfig?.id) return;
    const shouldShowLoading = !options?.silent && conversations.length === 0;
    if (shouldShowLoading) setHistoryLoading(true);
    if (options?.silent && conversations.length > 0) setHistoryRefreshing(true);
    setHistoryError("");
    try {
      const rows = await listConversations(botConfig.id, conversationSearch.trim() || undefined);
      setConversations(rows);
      rows.slice(0, 6).forEach((conversation) => {
        void prefetchConversationMessages(conversation.id);
      });
    } catch (error) {
      console.error(error);
      setHistoryError("無法載入聊天紀錄，請稍後再試。");
    } finally {
      if (shouldShowLoading) setHistoryLoading(false);
      if (options?.silent && conversations.length > 0) setHistoryRefreshing(false);
    }
  }, [botConfig?.id, canUseHistory, conversationSearch, conversations.length, prefetchConversationMessages]);

  const closeHistoryDrawer = React.useCallback(() => {
    setHistoryDrawerOpen(false);
    setHistoryMenuConversationId(null);
    setHistorySelectionMode(false);
    setSelectedHistoryConversationIds([]);
  }, []);

  const restoreConversation = React.useCallback(
    async (conversation: ConversationSummary) => {
      stopAllSpeech();
      setHistoryActionLoading(true);
      setHistoryError("");
      setCurrentConversationId(conversation.id);
      setSelectedTopicId(
        conversation.topicId ||
          availableTopics.find((topic) => topic.isDefault)?.id ||
          availableTopics[0]?.id ||
          null
      );
      setChatPanelOpen(true);
      setHistoryDrawerOpen(false);
      const cachedMessages = conversationMessagesCacheRef.current.get(conversation.id);
      const cachedLanguage = conversationLanguageCacheRef.current.get(conversation.id);
      if (cachedLanguage) setReplyLanguage(cachedLanguage);
      if (cachedMessages) {
        setMessages(cachedMessages);
      }
      setGuidedMode(false);
      setGuidedStepIndex(0);
      setGuidedTotalSteps(0);
      setSuggestedReplies([]);
      setGuideQuestion("");
      setBotState("idle");
      setIsStopAvailable(false);
      try {
        const historyMessages = await getMessages(conversation.id);
        const conversationLanguage = detectConversationLanguage(historyMessages);
        conversationLanguageCacheRef.current.set(conversation.id, conversationLanguage);
        setReplyLanguage(conversationLanguage);
        const restoredMessages = mapConversationMessagesToChatMessages(historyMessages);
        conversationMessagesCacheRef.current.set(conversation.id, restoredMessages);
        setMessages(restoredMessages);
      } catch (error) {
        console.error(error);
        setHistoryError("無法載入聊天紀錄，請稍後再試。");
      } finally {
        setHistoryActionLoading(false);
      }
    },
    [availableTopics, detectConversationLanguage, mapConversationMessagesToChatMessages]
  );

  const handleCopyShareLink = async () => {
    if (!shareableLink) return;
    try {
      await navigator.clipboard.writeText(shareableLink);
      showAlert({
        title: "已複製共享連結",
        message: "現在可以直接分享給學生使用了。",
        confirmText: "知道了",
      });
    } catch {
      showAlert({
        title: "複製失敗",
        message: "目前無法自動複製連結，請稍後再試。",
        confirmText: "知道了",
      });
    }
  };

  const safeVideoIdle = videoIdle && videoIdle.trim() !== "" ? videoIdle : null;
  const safeVideoThinking =
    videoThinking && videoThinking.trim() !== "" ? videoThinking : null;
  const safeVideoTalking =
    videoTalking && videoTalking.trim() !== "" ? videoTalking : null;
  const isSeqManifest = (url?: string | null) =>
    Boolean(url && /\/manifest\.json(\?|$)/i.test(url));
  const hasAnyVideo = Boolean(safeVideoIdle || safeVideoThinking || safeVideoTalking);
  const isOpeningFrame = isOpen && !wasOpenRef.current;
  const shouldShowBooting = isOpen && (isOpeningFrame || !openingReady || !mediaReady);
  const shouldRequirePermission = Boolean(voiceId) && !voiceLimitMessage && isMobileClient;
  const shouldBlockChat = shouldShowBooting || (shouldRequirePermission && !permissionReady);
  const visualState =
    botState === "speaking"
      ? safeVideoTalking
        ? "speaking"
        : safeVideoIdle
        ? "idle"
        : "thinking"
      : botState === "thinking"
      ? safeVideoThinking
        ? "thinking"
        : safeVideoIdle
        ? "idle"
        : "speaking"
      : safeVideoIdle
      ? "idle"
      : safeVideoThinking
      ? "thinking"
      : "speaking";

  useEffect(() => {
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, botState]);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [isOpen, suggestedReplies.length, guidedMode, guideQuestion, messages.length]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!(target instanceof Node)) return;
      if ((target as HTMLElement).closest?.("[data-model-menu-root='publish-chat']")) return;
      if ((target as HTMLElement).closest?.("[data-top-menu-root='publish-preview']")) return;
      if ((target as HTMLElement).closest?.("[data-topic-selector-root='publish-chat']")) return;
      setShowModelMenu(false);
      setShowTopMenu(false);
      setIsTopicSelectorOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!inputRef.current) return;
    if (!inputText.trim()) {
      inputRef.current.style.height = "40px";
      inputRef.current.style.overflowY = "hidden";
      return;
    }
    inputRef.current.style.height = "40px";
    const fullHeight = inputRef.current.scrollHeight;
    const next = Math.min(fullHeight, 128);
    inputRef.current.style.height = `${Math.max(40, next)}px`;
    inputRef.current.style.overflowY = fullHeight > 128 ? "auto" : "hidden";
  }, [inputText]);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    suggestedRepliesRef.current = suggestedReplies;
  }, [suggestedReplies]);

  useEffect(() => {
    if (!inputText.trim() || !idleGuideTimerRef.current) return;
    window.clearTimeout(idleGuideTimerRef.current);
    idleGuideTimerRef.current = null;
  }, [inputText]);

  useEffect(() => {
    if (!isOpen || guidedMode || suggestedReplies.length > 0) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "bot") return;
    const reply = String(lastMessage.guidedBody || lastMessage.content || "").trim();
    if (!extractQuestionFromReply(reply)) return;
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
    scheduleIdleGuide({
      userMsg: String(lastUserMessage?.content || "").trim(),
      reply,
      currentGenId: generationIdRef.current,
    });
    return () => {
      if (idleGuideTimerRef.current) {
        window.clearTimeout(idleGuideTimerRef.current);
        idleGuideTimerRef.current = null;
      }
    };
  }, [isOpen, messages, guidedMode, suggestedReplies.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setIsMobileClient(Boolean(coarse || uaMobile));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const currentBotId = botConfig?.id || null;
    const botChanged = lastHistoryBotIdRef.current !== currentBotId;
    setChatPanelOpen(false);
    setHistoryDrawerOpen(false);
    setHistoryMenuConversationId(null);
    setHistorySelectionMode(false);
    setSelectedHistoryConversationIds([]);
    if (botChanged) {
      setConversations([]);
      setHistoryError("");
      setHistoryLoading(false);
      conversationMessagesCacheRef.current.clear();
      conversationPrefetchingRef.current.clear();
      lastHistoryBotIdRef.current = currentBotId;
    }
  }, [isOpen, botConfig?.id]);

  useEffect(() => {
    const visibleIds = new Set(conversations.map((conversation) => conversation.id));
    setSelectedHistoryConversationIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [conversations]);

  useEffect(() => {
    if (!currentConversationId || messages.length === 0) return;
    conversationMessagesCacheRef.current.set(currentConversationId, messages);
  }, [currentConversationId, messages]);

  useEffect(() => {
    if (!isOpen || !canUseHistory || !botConfig?.id) return;
    void fetchConversationHistory({ silent: conversations.length > 0 });
  }, [isOpen, canUseHistory, botConfig?.id, conversations.length, fetchConversationHistory]);

  useEffect(() => {
    if (!historyDrawerOpen || !canUseHistory || !botConfig?.id) return;
    const timeout = window.setTimeout(() => {
      void fetchConversationHistory({ silent: conversations.length > 0 });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [historyDrawerOpen, canUseHistory, botConfig?.id, conversationSearch, conversations.length, fetchConversationHistory]);

  useEffect(() => {
    if (!chatPanelOpen || !isMobileClient) return;
    window.requestAnimationFrame(() => {
      if (document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    });
  }, [chatPanelOpen, isMobileClient]);

  useEffect(() => {
    if (!isOpen || !botConfig?.id || interactionRecordedRef.current) return;
    interactionRecordedRef.current = true;
    const baseUrl = API_BASE;
    void fetch(`${baseUrl}/api/bots/${botConfig.id}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "chat_enter" }),
    }).catch(() => undefined);
  }, [isOpen, botConfig?.id]);

  useEffect(() => {
    if (!isOpen) {
      interactionRecordedRef.current = false;
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    voicePlaybackEnabledRef.current = Boolean(voiceId) && !voiceLimitMessage;
  }, [voiceId, voiceLimitMessage]);

  const disableVoicePlayback = React.useCallback((message?: string) => {
    const nextMessage = message?.trim() || "免費語音功能已用完，已自動切換為純文字回覆。";
    voicePlaybackEnabledRef.current = false;
    setVoiceLimitMessage(nextMessage);
    setAwaitingAudioGesture(false);
    setBotState((current) => (current === "speaking" ? "idle" : current));
    if (!voiceLimitNoticeShownRef.current) {
      voiceLimitNoticeShownRef.current = true;
      setMessages((prev) => [...prev, { role: "bot", content: nextMessage }]);
    }
  }, []);

  const resetArCharacterPose = React.useCallback(() => {
    setCharacterScale(0.82);
    setCharacterOffset({ x: 0, y: 0 });
  }, []);

  const clampCharacterScale = React.useCallback((next: number) => {
    return Math.min(1.35, Math.max(0.35, Number(next.toFixed(2))));
  }, []);

  const nudgeCharacterScale = React.useCallback(
    (delta: number) => {
      setCharacterScale((prev) => clampCharacterScale(prev + delta));
    },
    [clampCharacterScale]
  );

  const clampCharacterOffset = React.useCallback((x: number, y: number) => {
    const stageRect = arStageRef.current?.getBoundingClientRect();
    const maxX = stageRect ? stageRect.width * 0.32 : 220;
    const maxUp = stageRect ? stageRect.height * 0.55 : 260;
    const maxDown = stageRect ? stageRect.height * 0.08 : 40;

    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxUp, Math.min(maxDown, y)),
    };
  }, []);

  const handleCharacterPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!cameraBackgroundReady || isMobileClient) return;
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: characterOffset.x,
        originY: characterOffset.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [cameraBackgroundReady, characterOffset.x, characterOffset.y, isMobileClient]
  );

  const handleCharacterPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!cameraBackgroundReady || isMobileClient || !dragStateRef.current) return;
      if (dragStateRef.current.pointerId !== event.pointerId) return;

      const dx = event.clientX - dragStateRef.current.startX;
      const dy = event.clientY - dragStateRef.current.startY;
      setCharacterOffset(
        clampCharacterOffset(
          dragStateRef.current.originX + dx,
          dragStateRef.current.originY + dy
        )
      );
    },
    [cameraBackgroundReady, clampCharacterOffset, isMobileClient]
  );

  const handleCharacterPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragStateRef.current?.pointerId === event.pointerId) {
        dragStateRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
  );

  const handleCharacterTouchStart = React.useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!cameraBackgroundReady || !isMobileClient) return;
      event.preventDefault();

      if (event.touches.length === 2) {
        const [a, b] = Array.from(event.touches);
        pinchStateRef.current = {
          distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
          scale: characterScale,
          centerX: (a.clientX + b.clientX) / 2,
          centerY: (a.clientY + b.clientY) / 2,
          originX: characterOffset.x,
          originY: characterOffset.y,
        };
        dragStateRef.current = null;
        return;
      }

      if (event.touches.length === 1) {
        const touch = event.touches[0];
        dragStateRef.current = {
          pointerId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          originX: characterOffset.x,
          originY: characterOffset.y,
        };
        pinchStateRef.current = null;
      }
    },
    [cameraBackgroundReady, characterOffset.x, characterOffset.y, characterScale, isMobileClient]
  );

  const handleCharacterTouchMove = React.useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!cameraBackgroundReady || !isMobileClient) return;
      if (event.touches.length === 2 && pinchStateRef.current) {
        event.preventDefault();
        const [a, b] = Array.from(event.touches);
        const nextDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        const scaleRatio = nextDistance / Math.max(1, pinchStateRef.current.distance);
        setCharacterScale(clampCharacterScale(pinchStateRef.current.scale * scaleRatio));

        const nextCenterX = (a.clientX + b.clientX) / 2;
        const nextCenterY = (a.clientY + b.clientY) / 2;
        setCharacterOffset(
          clampCharacterOffset(
            pinchStateRef.current.originX + (nextCenterX - pinchStateRef.current.centerX),
            pinchStateRef.current.originY + (nextCenterY - pinchStateRef.current.centerY)
          )
        );
        return;
      }

      if (event.touches.length === 1 && dragStateRef.current) {
        event.preventDefault();
        const touch = event.touches[0];
        const dx = touch.clientX - dragStateRef.current.startX;
        const dy = touch.clientY - dragStateRef.current.startY;
        setCharacterOffset(
          clampCharacterOffset(
            dragStateRef.current.originX + dx,
            dragStateRef.current.originY + dy
          )
        );
      }
    },
    [cameraBackgroundReady, clampCharacterOffset, clampCharacterScale, isMobileClient]
  );

  const handleCharacterTouchEnd = React.useCallback(() => {
    dragStateRef.current = null;
    pinchStateRef.current = null;
  }, []);

  const stopCameraBackground = React.useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setCameraBackgroundReady(false);
    resetArCharacterPose();
  }, [resetArCharacterPose]);

  const cleanupScreenRecording = React.useCallback(() => {
    screenRecorderRef.current = null;
    screenChunksRef.current = [];
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setIsRecordingScreen(false);
  }, []);

  const stopScreenRecording = React.useCallback(() => {
    const recorder = screenRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    cleanupScreenRecording();
  }, [cleanupScreenRecording]);

  const startScreenRecording = React.useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      setRecordingError("當前瀏覽器不支援畫面錄製");
      return;
    }

    setRecordingError("");
    if (isRecordingScreen) {
      stopScreenRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
        },
        audio: false,
      });

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      screenStreamRef.current = stream;
      screenRecorderRef.current = recorder;
      screenChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          screenChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(screenChunksRef.current, { type: recorder.mimeType || "video/webm" });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${botName || "chat-preview"}-${Date.now()}.webm`;
          a.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        cleanupScreenRecording();
      };

      recorder.onerror = () => {
        setRecordingError("錄製失敗，請重新嘗試");
        cleanupScreenRecording();
      };

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenRecording();
        };
      }

      recorder.start(1000);
      setIsRecordingScreen(true);
    } catch (error) {
      setRecordingError(
        error instanceof Error ? error.message : "無法開始錄製畫面"
      );
      cleanupScreenRecording();
    }
  }, [botName, cleanupScreenRecording, isRecordingScreen, stopScreenRecording]);

  const captureStagePhoto = React.useCallback(async () => {
    if (isCapturingStagePhoto) return;
    const stageEl = stageCaptureRef.current;
    if (!stageEl || typeof document === "undefined") {
      setStagePhotoError("目前無法拍照");
      return;
    }

    try {
      setIsCapturingStagePhoto(true);
      setStagePhotoError("");
      const rect = stageEl.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const canvas = document.createElement("canvas");
      const scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("無法建立畫布");
      ctx.scale(scale, scale);

      const coverDraw = (
        sourceWidth: number,
        sourceHeight: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number
      ) => {
        const srcRatio = sourceWidth / sourceHeight;
        const dstRatio = dw / dh;
        let sx = 0;
        let sy = 0;
        let sw = sourceWidth;
        let sh = sourceHeight;
        if (srcRatio > dstRatio) {
          sw = sourceHeight * dstRatio;
          sx = (sourceWidth - sw) / 2;
        } else {
          sh = sourceWidth / dstRatio;
          sy = (sourceHeight - sh) / 2;
        }
        return { sx, sy, sw, sh, dx, dy, dw, dh };
      };

      const drawSourceCover = (
        source: CanvasImageSource,
        sourceWidth: number,
        sourceHeight: number
      ) => {
        const box = coverDraw(sourceWidth, sourceHeight, 0, 0, width, height);
        ctx.drawImage(
          source,
          box.sx,
          box.sy,
          box.sw,
          box.sh,
          box.dx,
          box.dy,
          box.dw,
          box.dh
        );
      };

      const getContainDrawBox = (
        sourceWidth: number,
        sourceHeight: number,
        containerX: number,
        containerY: number,
        containerWidth: number,
        containerHeight: number
      ) => {
        const srcRatio = sourceWidth / sourceHeight;
        const dstRatio = containerWidth / containerHeight;

        let drawWidth = containerWidth;
        let drawHeight = containerHeight;

        if (srcRatio > dstRatio) {
          drawHeight = containerWidth / srcRatio;
        } else {
          drawWidth = containerHeight * srcRatio;
        }

        return {
          dx: containerX + (containerWidth - drawWidth) / 2,
          dy: containerY + (containerHeight - drawHeight) / 2,
          dw: drawWidth,
          dh: drawHeight,
        };
      };

      const toCanvasSafeUrl = (rawUrl: string) => {
        try {
          const resolved = new URL(rawUrl, window.location.href);
          const isLocalBackend =
            resolved.hostname === "localhost" || resolved.hostname === "127.0.0.1";
          if (resolved.origin === window.location.origin || isLocalBackend) {
            return resolved.toString();
          }
          return `${API_BASE}/api/media-proxy?url=${encodeURIComponent(resolved.toString())}`;
        } catch {
          return rawUrl;
        }
      };

      const loadSafeImage = async (rawUrl: string) => {
        const safeUrl = toCanvasSafeUrl(rawUrl);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.src = safeUrl;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("圖片載入失敗"));
        });
        return img;
      };

      if (cameraBackgroundReady && cameraVideoRef.current) {
        const video = cameraVideoRef.current;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          if (!isMobileClient) {
            ctx.save();
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
            drawSourceCover(video, video.videoWidth, video.videoHeight);
            ctx.restore();
          } else {
            drawSourceCover(video, video.videoWidth, video.videoHeight);
          }
        }
      } else if (stageBackgroundImageRef.current) {
        const bgImg = stageBackgroundImageRef.current;
        const bgSrc = bgImg.currentSrc || bgImg.src;
        if (bgSrc) {
          const safeBgImg = await loadSafeImage(bgSrc);
          drawSourceCover(safeBgImg, safeBgImg.naturalWidth, safeBgImg.naturalHeight);
        } else if (bgImg.naturalWidth > 0 && bgImg.naturalHeight > 0) {
          drawSourceCover(bgImg, bgImg.naturalWidth, bgImg.naturalHeight);
        }
      } else {
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(0, 0, width, height);
      }

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(15,23,42,0.08)");
      gradient.addColorStop(1, "rgba(15,23,42,0.28)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const characterNode = Array.from(
        stageEl.querySelectorAll('[data-stage-character="true"]')
      ).find((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const nodeRect = node.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          nodeRect.width > 0 &&
          nodeRect.height > 0
        );
      }) as HTMLElement | undefined;
      if (characterNode) {
        const characterRect = characterNode.getBoundingClientRect();
        const containerX = characterRect.left - rect.left;
        const containerY = characterRect.top - rect.top;
        const containerWidth = characterRect.width;
        const containerHeight = characterRect.height;

        if (characterNode instanceof HTMLVideoElement) {
          if (characterNode.videoWidth > 0 && characterNode.videoHeight > 0) {
            const drawBox = getContainDrawBox(
              characterNode.videoWidth,
              characterNode.videoHeight,
              containerX,
              containerY,
              containerWidth,
              containerHeight
            );
            const safeVideoUrl = characterNode.currentSrc || characterNode.src;
            if (safeVideoUrl) {
              const tempVideo = document.createElement("video");
              tempVideo.muted = true;
              tempVideo.playsInline = true;
              tempVideo.preload = "auto";
              tempVideo.crossOrigin = "anonymous";
              tempVideo.src = toCanvasSafeUrl(safeVideoUrl);

              await new Promise<void>((resolve, reject) => {
                tempVideo.onloadeddata = () => resolve();
                tempVideo.onerror = () => reject(new Error("角色影片載入失敗"));
              });

              if (Number.isFinite(characterNode.currentTime) && characterNode.currentTime > 0) {
                try {
                  await new Promise<void>((resolve, reject) => {
                    tempVideo.onseeked = () => resolve();
                    tempVideo.onerror = () => reject(new Error("角色影片定位失敗"));
                    tempVideo.currentTime = Math.min(
                      characterNode.currentTime,
                      Math.max(0, (tempVideo.duration || characterNode.currentTime) - 0.05)
                    );
                  });
                } catch {
                  // Ignore seek failure and use the closest ready frame.
                }
              }

              if (tempVideo.videoWidth > 0 && tempVideo.videoHeight > 0) {
                ctx.drawImage(
                  tempVideo,
                  drawBox.dx,
                  drawBox.dy,
                  drawBox.dw,
                  drawBox.dh
                );
              }
            } else {
              ctx.drawImage(
                characterNode,
                drawBox.dx,
                drawBox.dy,
                drawBox.dw,
                drawBox.dh
              );
            }
          }
        } else if (characterNode instanceof HTMLImageElement) {
          const safeCharacterSrc = characterNode.currentSrc || characterNode.src;
          if (safeCharacterSrc) {
            const safeCharacterImg = await loadSafeImage(safeCharacterSrc);
            const drawBox = getContainDrawBox(
              safeCharacterImg.naturalWidth,
              safeCharacterImg.naturalHeight,
              containerX,
              containerY,
              containerWidth,
              containerHeight
            );
            ctx.drawImage(
              safeCharacterImg,
              drawBox.dx,
              drawBox.dy,
              drawBox.dw,
              drawBox.dh
            );
          } else if (characterNode.naturalWidth > 0 && characterNode.naturalHeight > 0) {
            const drawBox = getContainDrawBox(
              characterNode.naturalWidth,
              characterNode.naturalHeight,
              containerX,
              containerY,
              containerWidth,
              containerHeight
            );
            ctx.drawImage(
              characterNode,
              drawBox.dx,
              drawBox.dy,
              drawBox.dw,
              drawBox.dh
            );
          }
        }
      }

      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${botName || "stage-photo"}-${Date.now()}.png`;
      a.click();
    } catch (error) {
      console.error("Stage capture failed:", error);
      setStagePhotoError(error instanceof Error ? error.message : "拍照失敗");
    } finally {
      window.setTimeout(() => {
        setIsCapturingStagePhoto(false);
      }, 1200);
    }
  }, [botName, cameraBackgroundReady, isCapturingStagePhoto, isMobileClient]);

  const startCameraBackground = React.useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraBackgroundError("當前環境不支援相機背景");
      setCameraBackgroundReady(false);
      return;
    }

    setCameraBackgroundLoading(true);
    setCameraBackgroundError("");
    const requestToken = cameraRequestTokenRef.current + 1;
    cameraRequestTokenRef.current = requestToken;

    try {
      stopCameraBackground();
      let permissionState = "unknown";
      try {
        const perm = await navigator.permissions?.query?.({
          name: "camera" as PermissionName,
        });
        permissionState = perm?.state || "unknown";
      } catch {
        permissionState = "unsupported";
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");

      if (!videoInputs.length) {
        throw new Error("沒有找到可用攝像頭裝置");
      }

      if (permissionState === "denied") {
        throw new Error("瀏覽器已封鎖相機權限");
      }

      const preferredVideoConstraints = isMobileClient
        ? {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            deviceId: videoInputs[0]?.deviceId
              ? { ideal: videoInputs[0].deviceId }
              : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };

      const fallbackVideoConstraints = {
        deviceId: videoInputs[0]?.deviceId
          ? { ideal: videoInputs[0].deviceId }
          : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };

      const getStream = async () => {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: preferredVideoConstraints,
            audio: false,
          });
        } catch (error) {
          if (!isMobileClient) throw error;
          return await navigator.mediaDevices.getUserMedia({
            video: fallbackVideoConstraints,
            audio: false,
          });
        }
      };

      const stream = await Promise.race([
        getStream(),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("相機權限請求逾時，請檢查瀏覽器權限設定")), 8000)
        ),
      ]);

      if (cameraRequestTokenRef.current !== requestToken) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      cameraStreamRef.current = stream;

      if (!cameraVideoRef.current) {
        stopCameraBackground();
        return;
      }

      const videoEl = cameraVideoRef.current;
      videoEl.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("相機串流已取得，但畫面未成功載入"));
        }, 5000);

        const cleanup = () => {
          window.clearTimeout(timeout);
          videoEl.onloadedmetadata = null;
          videoEl.oncanplay = null;
          videoEl.onerror = null;
        };

        const markReady = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };

        videoEl.onloadedmetadata = () => {
          void videoEl.play().catch(() => undefined);
          markReady();
        };
        videoEl.oncanplay = markReady;
        videoEl.onerror = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("相機畫面初始化失敗"));
        };
      });

      setCameraBackgroundReady(true);
      setCharacterScale(0.68);
      setCharacterOffset({ x: 0, y: 0 });
      setCameraBackgroundLoading(false);
    } catch (error) {
      setCameraBackgroundReady(false);
      setCameraBackgroundLoading(false);
      setCameraBackgroundError(
        error instanceof Error ? error.message : "相機權限被拒絕或裝置不可用"
      );
      stopCameraBackground();
    }
  }, [isMobileClient, stopCameraBackground]);

  useEffect(() => {
    if (!isOpen) {
      stopCameraBackground();
      stopScreenRecording();
      setCameraBackgroundLoading(false);
      setCameraBackgroundError("");
      setRecordingError("");
      return;
    }

    return () => {
      stopCameraBackground();
      stopScreenRecording();
    };
  }, [isOpen, stopCameraBackground, stopScreenRecording]);

  useEffect(() => {
    if (!isOpen) return;
    setMediaReady(false);
    const loadManifest = async (url: string, setter: (v: any) => void) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        setter(json);
      } catch {
        // ignore
      }
    };
    if (isSeqManifest(safeVideoIdle)) void loadManifest(safeVideoIdle!, setSeqIdle);
    if (isSeqManifest(safeVideoThinking)) void loadManifest(safeVideoThinking!, setSeqThinking);
    if (isSeqManifest(safeVideoTalking)) void loadManifest(safeVideoTalking!, setSeqTalking);
  }, [isOpen, safeVideoIdle, safeVideoThinking, safeVideoTalking]);

  useEffect(() => {
    if (!isOpen) return;

    const preloadVideo = (url: string) =>
      new Promise<void>((resolve) => {
        const v = document.createElement("video");
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          v.onloadeddata = null;
          v.onerror = null;
          resolve();
        };
        v.preload = "auto";
        v.muted = true;
        v.src = url;
        v.onloadeddata = finish;
        v.onerror = finish;
        window.setTimeout(finish, 1500);
      });

    const preloadSequenceFirstFrame = async (manifestUrl: string) => {
      try {
        const res = await fetch(manifestUrl);
        if (!res.ok) return;
        const manifest = await res.json();
        const firstFrame = `${manifest.folderUrl}/${String(manifest.pattern || "frame_%04d.png").replace("%04d", "0001")}`;
        await new Promise<void>((resolve) => {
          const img = new Image();
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          img.onload = finish;
          img.onerror = finish;
          img.src = firstFrame;
          window.setTimeout(finish, 1500);
        });
      } catch {
        // ignore
      }
    };

    (async () => {
      const tasks: Promise<void>[] = [];
      [safeVideoIdle, safeVideoThinking, safeVideoTalking]
        .filter((u): u is string => Boolean(u))
        .forEach((url) => {
          if (isSeqManifest(url)) {
            tasks.push(preloadSequenceFirstFrame(url));
          } else {
            tasks.push(preloadVideo(url));
          }
        });
      await Promise.all(tasks);
      setMediaReady(true);
    })();
  }, [isOpen, safeVideoIdle, safeVideoThinking, safeVideoTalking]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    if (currentConversationId) return;
    setOpeningReady(false);
    if (shouldRequirePermission && !permissionReady) {
      // Wait for explicit user authorization before booting opening voice.
      setIsBooting(false);
      setMessages([]);
      setSuggestedReplies([]);
      setBotState("idle");
      setIsStopAvailable(false);
      setOpeningReady(true);
      return;
    }
    if (voiceId) {
      // Set loading state before first paint to avoid chat UI flashing for 1-2 frames.
      setIsBooting(true);
      setMessages([]);
      setSuggestedReplies([]);
      setBotState("thinking");
      setIsStopAvailable(false);
    } else {
      setIsBooting(false);
      setOpeningReady(true);
    }
  }, [currentConversationId, isOpen, voiceId, permissionReady, shouldRequirePermission]);

  useEffect(() => {
    if (!isOpen) return;
    if (currentConversationId) return;
    if (shouldRequirePermission && !permissionReady) {
      stopAllSpeech();
      setMessages([]);
      setSuggestedReplies([]);
      setBotState("idle");
      setIsStopAvailable(false);
      return;
    }

    ttsSessionRef.current += 1;
    ttsSeq.current = 0;
    nextPlaySeq.current = 0;
    ttsInflight.current = 0;
    ttsTextQueue.current = [];
    ttsAudioMap.current.clear();
    playing.current = false;
    setIsStopAvailable(false);

    const openingMessage = buildOpeningMessage();
    const sessionId = ttsSessionRef.current;

    if (!voicePlaybackEnabledRef.current) {
      setIsBooting(false);
      setBotState("idle");
      setMessages([
        {
          role: "bot",
          content: openingMessage,
        },
      ]);
      setOpeningReady(true);
      return;
    }

    setIsBooting(true);
    setBotState("thinking");
    setMessages([]);
    setSuggestedReplies([]);

    const openingSeq = ttsSeq.current++;
    let openingReady = false;
    requestTTSAudio(openingMessage, sessionId)
      .then((audio) => {
        if (!audio || sessionId !== ttsSessionRef.current) {
          return;
        }
        openingReady = true;
        ttsAudioMap.current.set(openingSeq, audio);
        setMessages([
          {
            role: "bot",
            content: openingMessage,
          },
        ]);
        setIsStopAvailable(true);
        setBotState("speaking");
        setIsBooting(false);
        setOpeningReady(true);
        tryPlayInOrder();
      })
      .catch((e) => {
        console.error("Opening TTS prepare error:", e);
      })
      .finally(() => {
        if (sessionId === ttsSessionRef.current && !openingReady) {
          setIsBooting(false);
          setMessages([
            {
              role: "bot",
              content: openingMessage,
            },
          ]);
          setBotState("idle");
          setOpeningReady(true);
        }
      });
  }, [botName, configuredOpeningMessage, currentConversationId, isOpen, voiceId, permissionReady, shouldRequirePermission, buildOpeningMessage]);
  
  

  const playing = useRef(false);
  const activeAudioUrl = useRef<string | null>(null);
  const ttsPlayerRef = useRef<HTMLAudioElement | null>(null);
  const activeRequestController = useRef<AbortController | null>(null);
  const ttsRequestControllers = useRef<Set<AbortController>>(new Set());
  const ttsSessionRef = useRef(0);
  const generationIdRef = useRef(0);
  const ttsSeq = useRef(0);
  const nextPlaySeq = useRef(0);
  const ttsInflight = useRef(0);
  const ttsTextQueue = useRef<{ seq: number; text: string }[]>([]);
  const ttsAudioMap = useRef<Map<number, string>>(new Map());
  const quizSubmitQueueRef = useRef<Promise<any>>(Promise.resolve());
  const maxTtsInflight = 3;
  const speechRecognitionRef = useRef<any>(null);
  const sttStartingRef = useRef(false);
  const sttWatchdogRef = useRef<number | null>(null);
  const sttSilenceTimerRef = useRef<number | null>(null);
  const sttTypingTokenRef = useRef(0);
  const sttTypingTimerRef = useRef<number | null>(null);
  const sttAutoSendTimerRef = useRef<number | null>(null);
  const audioRetryTimerRef = useRef<number | null>(null);
  const lastUserGestureRef = useRef(0);
  const isListeningRef = useRef(false);
  const botStateRef = useRef<"idle" | "thinking" | "speaking">("idle");

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    botStateRef.current = botState;
  }, [botState]);

const requestTTSAudio = async (text: string, sessionId: number) => {

  if (!voicePlaybackEnabledRef.current || !voiceId || !text.trim()) return;
  if (sessionId !== ttsSessionRef.current) return;

  const baseUrl = API_BASE;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 6000);
  ttsRequestControllers.current.add(controller);

  try {

    // ⭐ 先限流
    const now = Date.now();

    if (now - lastTTS.current < 40) {
      await new Promise(r => setTimeout(r, 40));
    }

    lastTTS.current = Date.now();

    const res = await fetch(`${baseUrl}/api/tts`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        text,
        voiceId,
        language: selectedReplyLanguage.ttsLanguage,
        usageType: "chat_voice",
        sharedBotId: isSharedView ? botConfig.id : undefined,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const message = data?.error || `TTS failed: ${res.status}`;
      if (res.status === 402) {
        disableVoicePlayback(message);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        disableVoicePlayback("語音回覆需要登入狀態，請重新登入後再試。");
        return;
      }
      throw new Error(message);
    }
    if (sessionId !== ttsSessionRef.current) return;

    const blob = await res.blob();
    if (sessionId !== ttsSessionRef.current) return;
    return URL.createObjectURL(blob);

  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    console.error("TTS error:", e);
    if (!ttsErrorNoticeShownRef.current) {
      ttsErrorNoticeShownRef.current = true;
      showAlert({
        title: "語音暫時不可用",
        message: "目前語音服務發生錯誤，系統已先以文字回覆。請稍後再試。",
      });
    }
  } finally {
    window.clearTimeout(timeoutId);
    ttsRequestControllers.current.delete(controller);
  }
};

const enqueueSpeak = (text: string) => {
  if (!voicePlaybackEnabledRef.current || !voiceId || !text.trim()) return;
  const seq = ttsSeq.current++;
  ttsTextQueue.current.push({ seq, text });
  pumpTTSRequests();
  return seq;
};

const waitForAudioReady = (seq: number, timeoutMs = 1000) =>
  new Promise<void>((resolve) => {
    if (!voicePlaybackEnabledRef.current) {
      resolve();
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      const ready = ttsAudioMap.current.has(seq) || seq < nextPlaySeq.current;
      const timeout = Date.now() - start > timeoutMs;
      if (ready || timeout) {
        clearInterval(timer);
        resolve();
      }
    }, 20);
  });

const tryPlayInOrder = () => {
  if (shouldRequirePermission && !permissionReady) return;
  if (playing.current) return;
  if (!ttsPlayerRef.current) {
    ttsPlayerRef.current = new Audio();
    ttsPlayerRef.current.preload = "auto";
  }
  const player = ttsPlayerRef.current;

  const seq = nextPlaySeq.current;
  const audioUrl = ttsAudioMap.current.get(seq);
  if (!audioUrl) {
    if (ttsInflight.current === 0 && ttsAudioMap.current.size === 0) {
      setBotState("idle");
      setIsStopAvailable(false);
    }
    return;
  }

  playing.current = true;
  activeAudioUrl.current = audioUrl;
  player.src = audioUrl;
  player.playbackRate = 1.12;
  setBotState("speaking");
  void player.play()
    .then(() => {
      ttsAudioMap.current.delete(seq);
      setAwaitingAudioGesture(false);
      if (audioRetryTimerRef.current) {
        window.clearTimeout(audioRetryTimerRef.current);
        audioRetryTimerRef.current = null;
      }
    })
    .catch((e) => {
      console.error("Audio play blocked:", e);
      playing.current = false;
      activeAudioUrl.current = null;
      setAwaitingAudioGesture(true);
      setBotState("idle");
      setIsStopAvailable(true);
      if (
        Date.now() - lastUserGestureRef.current < 5000 &&
        !audioRetryTimerRef.current
      ) {
        audioRetryTimerRef.current = window.setTimeout(() => {
          audioRetryTimerRef.current = null;
          tryPlayInOrder();
        }, 250);
      }
    });

  player.onended = () => {
    if (activeAudioUrl.current) {
      URL.revokeObjectURL(activeAudioUrl.current);
      activeAudioUrl.current = null;
    }
    playing.current = false;
    nextPlaySeq.current += 1;
    tryPlayInOrder();
  };
  player.onerror = () => {
    if (activeAudioUrl.current) {
      URL.revokeObjectURL(activeAudioUrl.current);
      activeAudioUrl.current = null;
    }
    playing.current = false;
    nextPlaySeq.current += 1;
    tryPlayInOrder();
  };
};

useEffect(() => {
  if (!isOpen) return;
  const resumeAudio = () => {
    lastUserGestureRef.current = Date.now();
    if (isListeningRef.current || sttStartingRef.current) return;
    if (!awaitingAudioGesture) return;
    tryPlayInOrder();
  };
  document.addEventListener("pointerdown", resumeAudio);
  document.addEventListener("touchstart", resumeAudio, { passive: true });
  document.addEventListener("keydown", resumeAudio);
  return () => {
    document.removeEventListener("pointerdown", resumeAudio);
    document.removeEventListener("touchstart", resumeAudio);
    document.removeEventListener("keydown", resumeAudio);
  };
}, [isOpen, awaitingAudioGesture]);

const pumpTTSRequests = () => {
  const sessionId = ttsSessionRef.current;
  while (
    ttsInflight.current < maxTtsInflight &&
    ttsTextQueue.current.length > 0
  ) {
    const item = ttsTextQueue.current.shift()!;
    ttsInflight.current += 1;

    requestTTSAudio(item.text, sessionId)
      .then((audioUrl) => {
        if (!audioUrl) return;
        if (sessionId !== ttsSessionRef.current) {
          URL.revokeObjectURL(audioUrl);
          return;
        }
        ttsAudioMap.current.set(item.seq, audioUrl);
        tryPlayInOrder();
      })
      .finally(() => {
        ttsInflight.current = Math.max(0, ttsInflight.current - 1);
        pumpTTSRequests();
      });
  }
};

const isSentenceEnd = (text: string) => {
  return /[。！？.!?]/.test(text);
};

const stopAllSpeech = () => {
  generationIdRef.current += 1;
  ttsSessionRef.current += 1;
  if (guideActivationTimerRef.current) {
    window.clearTimeout(guideActivationTimerRef.current);
    guideActivationTimerRef.current = null;
  }
  if (idleGuideTimerRef.current) {
    window.clearTimeout(idleGuideTimerRef.current);
    idleGuideTimerRef.current = null;
  }
  activeRequestController.current?.abort();
  activeRequestController.current = null;
  ttsRequestControllers.current.forEach((controller) => controller.abort());
  ttsRequestControllers.current.clear();

  if (ttsPlayerRef.current) {
    ttsPlayerRef.current.pause();
    ttsPlayerRef.current.currentTime = 0;
    ttsPlayerRef.current.onended = null;
    ttsPlayerRef.current.onerror = null;
  }
  if (activeAudioUrl.current) {
    URL.revokeObjectURL(activeAudioUrl.current);
    activeAudioUrl.current = null;
  }

  ttsAudioMap.current.forEach((audioUrl) => {
    URL.revokeObjectURL(audioUrl);
  });

  ttsTextQueue.current = [];
  ttsAudioMap.current.clear();
  ttsInflight.current = 0;
  playing.current = false;
  ttsSeq.current = 0;
  nextPlaySeq.current = 0;
  setBotState("idle");
  setIsStopAvailable(false);
  setIsBooting(false);
};

const extractQuestionFromReply = (text: string) => {
  const matches = String(text || "").match(/[^。！？!?。\n]*[？?]/g);
  return matches?.at(-1)?.trim() || "";
};

const trimReplyToSingleQuestion = (text: string) => {
  const normalized = String(text || "").replace(/\r/g, "").trim();
  if (!normalized) return "";
  const parts = normalized
    .split(/(?<=[。！？!?\n])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const questionParts = parts.filter((part) => /[？?]/.test(part));
  if (questionParts.length <= 1) return normalized;
  const lastQuestion = questionParts.at(-1) || "";
  const nonQuestionParts = parts.filter((part) => !/[？?]/.test(part));
  return [...nonQuestionParts, lastQuestion].join("\n").trim();
};

const requestDialogueEnhancement = async ({
  userMsg,
  reply,
  currentGenId,
  idleTrigger = false,
  displayDelayMs = GUIDE_HINT_DELAY_MS,
}: {
  userMsg: string;
  reply: string;
  currentGenId: number;
  idleTrigger?: boolean;
  displayDelayMs?: number;
}) => {
  if (!reply.trim()) return;
  try {
    const currentQuestion = extractQuestionFromReply(reply);
    const recentMessages = [...messages]
      .filter((message, index, list) => {
        if (message.role === "event") return false;
        const isLast = index === list.length - 1;
        const content = String(message.content || "").trim();
        return !(isLast && message.role === "bot" && content === reply.trim());
      })
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));
    const response = await fetch(`${API_BASE}/api/ask`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        mode: "dialogue_enhancement",
        systemPrompt: chatSystemPrompt,
        userPrompt: userMsg,
        reply,
        currentQuestion,
        recentMessages,
        idleTrigger,
        replyLanguage,
        modelProvider,
        botId: botConfig.id,
        topicId: selectedTopicId || undefined,
        usageType: "chat_message",
        sharedBotId: isSharedView ? botConfig.id : undefined,
        stream: false,
      }),
    });
    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    const nextSuggestedReplies = Array.isArray(data?.suggestedReplies)
      ? data.suggestedReplies
          .map((item: any, index: number) => ({
            tier: item?.tier === "L2" || item?.tier === "L3" ? item.tier : "L1",
            label: selectedReplyLanguage.guideLabels[index] || String(item?.label || "").trim(),
            text: replyLanguage === "mandarin"
              ? normalizeMandarinTraditional(String(item?.text || "").trim())
              : String(item?.text || "").trim(),
            sendText: replyLanguage === "mandarin"
              ? normalizeMandarinTraditional(String(item?.sendText || "").trim())
              : String(item?.sendText || "").trim(),
          }))
          .filter((item: SuggestedReply) => item.label && item.text)
          .slice(0, 3)
      : [];
    if (!nextSuggestedReplies.length) return;
    const followUpQuestion = String(data?.followUpQuestion || data?.dialogueState?.follow_up_question || "").trim();
    if (guideActivationTimerRef.current) {
      window.clearTimeout(guideActivationTimerRef.current);
      guideActivationTimerRef.current = null;
    }
    guideActivationTimerRef.current = window.setTimeout(() => {
      if (currentGenId !== generationIdRef.current) return;
      setGuideQuestion(followUpQuestion || extractQuestionFromReply(reply));
      setSuggestedReplies(nextSuggestedReplies);
      guideActivationTimerRef.current = null;
    }, displayDelayMs);
  } catch (error) {
    console.warn("dialogue enhancement skipped", error);
  }
};

const scheduleIdleGuide = ({
  userMsg,
  reply,
  currentGenId,
}: {
  userMsg: string;
  reply: string;
  currentGenId: number;
}) => {
  if (!extractQuestionFromReply(reply)) return;
  if (idleGuideTimerRef.current) {
    window.clearTimeout(idleGuideTimerRef.current);
    idleGuideTimerRef.current = null;
  }
  idleGuideTimerRef.current = window.setTimeout(() => {
    if (currentGenId !== generationIdRef.current) return;
    if (inputTextRef.current.trim()) return;
    if (suggestedRepliesRef.current.length > 0) return;
    void requestDialogueEnhancement({
      userMsg,
      reply,
      currentGenId,
      idleTrigger: true,
      displayDelayMs: 0,
    });
    idleGuideTimerRef.current = null;
  }, IDLE_GUIDE_DELAY_MS);
};

const sendMessage = async (
  forcedText?: string,
  visibleText?: string,
  source: "direct" | "voice" | "guided_hint" | "guided_action" = "direct"
) => {
  if (shouldBlockChat) return;
  const textToSend = (forcedText ?? inputText).trim();
  if (!textToSend && chatImages.length === 0) return;
  const queuedImages = chatImages;
  const queuedPreviews = chatImagePreviews;

  stopAllSpeech();
  setIsStopAvailable(true);
  const userMsg = (visibleText || textToSend).trim();
  setInputText("");
  setChatImages([]);
  setChatImagePreviews([]);
  setSuggestedReplies([]);
  setGuideQuestion("");

  setMessages(prev => [...prev, { role: "user", content: userMsg, imagePreviews: queuedPreviews }]);
  setBotState("thinking");

  const baseUrl = API_BASE;
  const currentGenId = generationIdRef.current;

  try {
    const controller = new AbortController();
    activeRequestController.current = controller;
      const requestPayload = {
        systemPrompt:
        chatSystemPrompt,
      userPrompt: userMsg,
      modelProvider,
      botId: botConfig.id,
      source,
      replyLanguage,
      stream:
        !guidedMode &&
        modelProvider !== "gemini" &&
        replyLanguage === "cantonese",
      teachingHint: guidedMode ? "continue" : "auto",
      usageType: "chat_message",
      sharedBotId: isSharedView ? botConfig.id : undefined,
      topicId: selectedTopicId || undefined,
    };
    const usesGeminiImages = modelProvider === "gemini" && queuedImages.length > 0;
    const { response, conversationId: responseConversationId } = await sendConversationMessage({
      ...requestPayload,
      conversationId: currentConversationId || undefined,
      images: usesGeminiImages ? queuedImages : undefined,
      signal: controller.signal,
    });
    if (responseConversationId) {
      setCurrentConversationId(responseConversationId);
    }
    activeRequestController.current = null;
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const errorMessage = data?.error || `聊天請求失敗：${response.status}`;
      if (response.status === 402 || /對話次數已用完|請升級到付費版|功能使用次數不足/.test(String(errorMessage))) {
        markTrialEndedPopupPending();
        window.location.href = "/";
        return;
      }
      throw new Error(errorMessage);
    }

    const parseGuidedCard = (text: string) => {
      const normalized = text.trim();
      const m = normalized.match(/^(Step\s+\d+(?:\/\d+)?(?:（[^）]+）)?(?:\s*評估)?)\s*[\n：:]\s*([\s\S]*)$/);
      if (!m) return { title: "", body: normalized };
      return { title: m[1].trim(), body: (m[2] || "").trim() };
    };
    const contentType = String(response.headers.get("content-type") || "");

    if (contentType.includes("application/json") || modelProvider === "gemini") {
      const data = await response.json().catch(() => null);
      const nextConversationId = String(data?.conversationId || data?.conversation?.id || responseConversationId || "").trim();
      if (nextConversationId) {
        setCurrentConversationId(nextConversationId);
      }
      if (data?.conversation) {
        if (data.conversation.topicId) {
          setSelectedTopicId(String(data.conversation.topicId));
        }
        syncConversationList((prev) => {
          const next = prev.filter((item) => item.id !== data.conversation.id);
          next.unshift(data.conversation as ConversationSummary);
          return next;
        });
      }
      const rawBaseReply = trimReplyToSingleQuestion(String(data?.reply || "").trim());
      const baseReply = replyLanguage === "mandarin"
        ? normalizeMandarinTraditional(rawBaseReply)
        : rawBaseReply;
      const followUpQuestion = String(data?.followUpQuestion || data?.dialogueState?.follow_up_question || "").trim();
      const committedReply = [baseReply, followUpQuestion].filter(Boolean).join("\n\n");
      const guidedCard = Boolean(data?.teachingMode) ? parseGuidedCard(committedReply) : { title: "", body: committedReply };
      setGuidedMode(Boolean(data?.teachingMode));
      setGuidedStepIndex(Number(data?.stepIndex || 0));
      setGuidedTotalSteps(Number(data?.totalSteps || 0));
      setMessages(prev => [...prev, { role: "bot", content: "", guidedTitle: guidedCard.title }]);

      const ttsSource = guidedCard.body || committedReply;
      const segments = ttsSource
        .split(/(?<=[。！？!?；;\n])/)
        .map((s) => s.trim())
        .filter(Boolean);
      let progressiveReply = "";
      for (const segment of segments) {
        if (voicePlaybackEnabledRef.current) {
          enqueueSpeak(segment);
        }
        if (currentGenId !== generationIdRef.current) return;
        progressiveReply += (progressiveReply ? "\n" : "") + segment;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: "bot", content: progressiveReply, guidedTitle: guidedCard.title, guidedBody: progressiveReply };
          return newMessages;
        });
      }

      if (currentGenId !== generationIdRef.current) return;
      if (guideActivationTimerRef.current) {
        window.clearTimeout(guideActivationTimerRef.current);
        guideActivationTimerRef.current = null;
      }
      setBotState((current) => (current === "thinking" ? "idle" : current));
      return;
    }

    setGuidedMode(false);
    setGuidedStepIndex(0);
    setGuidedTotalSteps(0);
    setMessages(prev => [...prev, { role: "bot", content: "" }]);

    const canUseReader =
      response.body &&
      typeof (response.body as ReadableStream<Uint8Array>).getReader === "function";
    const reader = canUseReader
      ? (response.body as ReadableStream<Uint8Array>).getReader()
      : null;
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let streamedReply = "";
    let spokenReply = "";

    if (!reader) {
      const raw = await response.text();
      const fallbackReply = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:/, ""))
        .join("")
        .trim() || raw.trim();
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = { role: "bot", content: fallbackReply };
        return newMessages;
      });
      if (voicePlaybackEnabledRef.current && fallbackReply) {
        enqueueSpeak(fallbackReply);
      }
      setBotState((current) => (current === "thinking" ? "idle" : current));
      return;
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (currentGenId !== generationIdRef.current) return;
      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split("\n\n");
      sseBuffer = events.pop() || "";

      for (const event of events) {
        const token = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.replace(/^data:/, ""))
          .join("");
        if (!token) continue;
        streamedReply += token;
        const displayedStreamedReply = replyLanguage === "mandarin"
          ? normalizeMandarinTraditional(streamedReply)
          : streamedReply;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: "bot", content: displayedStreamedReply };
          return newMessages;
        });

        const completedSegments = streamedReply
          .slice(spokenReply.length)
          .split(/(?<=[。！？!?；;\n])/)
          .map((part) => part.trim())
          .filter(Boolean);
        if (voicePlaybackEnabledRef.current && completedSegments.length > 0) {
          const speakable = completedSegments.filter((part) => /[。！？!?；;\n]$/.test(part));
          for (const segment of speakable) {
            enqueueSpeak(segment);
            spokenReply += segment;
          }
        }
      }
    }

    streamedReply += decoder.decode();
    const rawCommittedReply = trimReplyToSingleQuestion(streamedReply.trim());
    const committedReply = replyLanguage === "mandarin"
      ? normalizeMandarinTraditional(rawCommittedReply)
      : rawCommittedReply;
    if (responseConversationId) {
      syncConversationList((prev) => {
        const existing = prev.find((item) => item.id === responseConversationId);
        const now = new Date().toISOString();
        const title = existing?.title || "新的對話";
        const nextConversation: ConversationSummary = existing || {
          id: responseConversationId,
          userId: authSession?.user.id || "",
          botId: botConfig.id || null,
          topicId: selectedTopicId || null,
          title,
          type: "bot_learning",
          status: "active",
          lastMessagePreview: committedReply || userMsg,
          createdAt: now,
          updatedAt: now,
        };
        return [
          {
            ...nextConversation,
            lastMessagePreview: committedReply || userMsg,
            updatedAt: now,
            title:
              nextConversation.title === "新的對話" && userMsg.trim()
                ? userMsg.replace(/\s+/g, " ").trim().slice(0, 20)
                : nextConversation.title,
          },
          ...prev.filter((item) => item.id !== responseConversationId),
        ];
      });
    }
    if (committedReply !== streamedReply.trim()) {
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = { role: "bot", content: committedReply };
        return newMessages;
      });
    }
    if (!spokenReply && voicePlaybackEnabledRef.current && committedReply) {
      enqueueSpeak(committedReply);
    }
    setBotState((current) => (current === "thinking" ? "idle" : current));
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    console.error(err);
    setBotState("idle");
    setMessages((prev) => [
      ...prev,
      {
        role: "bot",
        content:
          err instanceof Error
            ? err.message
            : "目前無法完成回覆，請稍後再試。",
      },
    ]);
  }
};

const handleHistoryButtonClick = () => {
  if (!canUseHistory || !chatPanelOpen) return;
  setHistoryDrawerOpen((prev) => {
    const next = !prev;
    if (!next) setHistoryMenuConversationId(null);
    return next;
  });
};

const handleTopicSwitch = async (nextTopic: CharacterTopicSummary) => {
  if (isSwitchingTopic || nextTopic.id === selectedTopicId) {
    setIsTopicSelectorOpen(false);
    return;
  }
  const previousTopic = selectedTopic;
  const previousTopicId = selectedTopicId;
  const previousConversationTopicId = currentConversationId
    ? conversations.find((conversation) => conversation.id === currentConversationId)?.topicId ?? previousTopicId
    : null;

  // Update the visible selection immediately. Persistence continues in the
  // background and rolls back only if the server rejects the change.
  setIsSwitchingTopic(true);
  setTopicError("");
  setSelectedTopicId(nextTopic.id);
  setIsTopicSelectorOpen(false);
  if (currentConversationId && canUseHistory) {
    syncConversationList((current) =>
      current.map((conversation) =>
        conversation.id === currentConversationId
          ? { ...conversation, topicId: nextTopic.id }
          : conversation
      )
    );
  }

  try {
    let updatedConversation: ConversationSummary | null = null;
    if (currentConversationId && canUseHistory) {
      updatedConversation = await updateConversationTopicRecord(currentConversationId, nextTopic.id);
    }
    if (updatedConversation) {
      syncConversationList((current) =>
        current.map((conversation) =>
          conversation.id === updatedConversation!.id ? updatedConversation! : conversation
        )
      );
    }
    setMessages((current) => [
      ...current,
      {
        role: "event",
        content: previousTopic
          ? `主題已由「${previousTopic.name}」切換為「${nextTopic.name}」`
          : `目前主題：${nextTopic.name}`,
      },
    ]);
  } catch (switchError) {
    setSelectedTopicId(previousTopicId);
    if (currentConversationId && canUseHistory) {
      syncConversationList((current) =>
        current.map((conversation) =>
          conversation.id === currentConversationId
            ? { ...conversation, topicId: previousConversationTopicId }
            : conversation
        )
      );
    }
    const message = switchError instanceof Error ? switchError.message : "切換主題失敗，請稍後再試。";
    setTopicError(message);
    showAlert({ title: "切換主題失敗", message, confirmText: "知道了" });
  } finally {
    setIsSwitchingTopic(false);
  }
};

const handleChatPanelToggle = () => {
  setChatPanelOpen((prev) => {
    const next = !prev;
    if (!next) {
      closeHistoryDrawer();
    }
    return next;
  });
};

const handleCreateConversation = async () => {
  if (!canUseHistory || !botConfig?.id) return;
  setHistoryActionLoading(true);
  setHistoryError("");
  try {
    const existingEmptyConversation = conversations.find((conversation) => isEmptyConversation(conversation));
    if (existingEmptyConversation) {
      resetConversationView(existingEmptyConversation.id);
      setCurrentConversationId(existingEmptyConversation.id);
      setSelectedTopicId(
        existingEmptyConversation.topicId ||
          availableTopics.find((topic) => topic.isDefault)?.id ||
          availableTopics[0]?.id ||
          null
      );
      setChatPanelOpen(true);
      setHistoryDrawerOpen(false);
      return;
    }
    resetConversationView(null);
    setCurrentConversationId(null);
    setChatPanelOpen(true);
    setHistoryDrawerOpen(false);
  } catch (error) {
    console.error(error);
    setHistoryError("無法載入聊天紀錄，請稍後再試。");
  } finally {
    setHistoryActionLoading(false);
  }
};

const handleRenameConversation = async (conversation: ConversationSummary) => {
  const nextTitle = window.prompt("請輸入新的對話名稱", conversation.title)?.trim();
  if (!nextTitle) return;
  setHistoryActionLoading(true);
  try {
    const updated = await renameConversationRecord(conversation.id, nextTitle);
    syncConversationList((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setHistoryMenuConversationId(null);
  } catch (error) {
    console.error(error);
    showAlert({
      title: "重新命名失敗",
      message: "請稍後再試。",
      confirmText: "知道了",
    });
  } finally {
    setHistoryActionLoading(false);
  }
};

const handleDeleteConversation = async (conversation: ConversationSummary) => {
  showConfirm({
    title: "確定要刪除此對話嗎？",
    message: "刪除後，此對話將不會出現在歷史紀錄中。",
    confirmText: "刪除",
    cancelText: "取消",
    tone: "danger",
    onConfirm: async () => {
      setHistoryActionLoading(true);
      try {
        await deleteConversationRecord(conversation.id);
        syncConversationList((prev) => prev.filter((item) => item.id !== conversation.id));
        conversationMessagesCacheRef.current.delete(conversation.id);
        conversationLanguageCacheRef.current.delete(conversation.id);
        setHistoryMenuConversationId(null);
        if (currentConversationId === conversation.id) {
          resetConversationView(null);
        }
        showAlert({
          title: "對話已刪除",
          message: "此對話已從歷史紀錄中移除。",
          confirmText: "知道了",
        });
      } catch (error) {
        console.error(error);
        showAlert({
          title: "刪除失敗",
          message: "請稍後再試。",
          confirmText: "知道了",
        });
      } finally {
        setHistoryActionLoading(false);
      }
    },
  });
};

const handleHistorySelectionModeChange = (active: boolean) => {
  setHistorySelectionMode(active);
  setHistoryMenuConversationId(null);
  if (!active) setSelectedHistoryConversationIds([]);
};

const handleToggleHistoryConversationSelection = (conversationId: string) => {
  setSelectedHistoryConversationIds((current) =>
    current.includes(conversationId)
      ? current.filter((id) => id !== conversationId)
      : [...current, conversationId]
  );
};

const handleDeleteSelectedConversations = () => {
  const visibleConversationIds = new Set(conversations.map((conversation) => conversation.id));
  const conversationIds = selectedHistoryConversationIds.filter((id) => visibleConversationIds.has(id));
  if (conversationIds.length === 0) return;

  const deletingCurrentConversation = Boolean(
    currentConversationId && conversationIds.includes(currentConversationId)
  );
  showConfirm({
    title: `確定要刪除 ${conversationIds.length} 個對話嗎？`,
    message: deletingCurrentConversation
      ? "其中包含目前開啟的對話。刪除後，聊天畫面會重置，且這些對話無法復原。"
      : "刪除後，這些對話將不會出現在歷史紀錄中，且無法復原。",
    confirmText: `刪除 ${conversationIds.length} 項`,
    cancelText: "取消",
    tone: "danger",
    onConfirm: async () => {
      setHistoryActionLoading(true);
      try {
        const result = await deleteConversationRecords(conversationIds);
        const deletedIds = new Set(result.deletedIds);
        syncConversationList((current) => current.filter((conversation) => !deletedIds.has(conversation.id)));
        deletedIds.forEach((id) => {
          conversationMessagesCacheRef.current.delete(id);
          conversationLanguageCacheRef.current.delete(id);
        });
        if (currentConversationId && deletedIds.has(currentConversationId)) {
          resetConversationView(null);
        }
        setSelectedHistoryConversationIds([]);
        setHistorySelectionMode(false);
        showAlert({
          title: "對話已刪除",
          message: `已從歷史紀錄中移除 ${result.count} 個對話。`,
          confirmText: "知道了",
        });
      } catch (error) {
        console.error(error);
        showAlert({
          title: "批量刪除失敗",
          message: "對話尚未刪除，請稍後再試。",
          confirmText: "知道了",
        });
      } finally {
        setHistoryActionLoading(false);
      }
    },
  });
};

const appendChatImages = (files: FileList | File[]) => {
  const nextFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
  if (!nextFiles.length) return;
  if (chatImages.length + nextFiles.length > 4) {
    showAlert({
      title: "圖片數量已達上限",
      message: "最多隻能上傳四張圖片。",
    });
  }
  const allowed = nextFiles.slice(0, Math.max(0, 4 - chatImages.length));
  if (!allowed.length) return;
  const nextPreviews = allowed.map((file) => URL.createObjectURL(file));
  nextPreviews.forEach((url) => previewUrlsRef.current.add(url));
  setChatImages((prev) => [...prev, ...allowed]);
  setChatImagePreviews((prev) => [...prev, ...nextPreviews]);
};

const removeChatImage = (index: number) => {
  setChatImages((prev) => prev.filter((_, i) => i !== index));
  setChatImagePreviews((prev) => {
    const target = prev[index];
    if (target) {
      URL.revokeObjectURL(target);
      previewUrlsRef.current.delete(target);
    }
    return prev.filter((_, i) => i !== index);
  });
};

const renderFormattedMessage = (text: string) => {
  const normalized = text.replace(/「([^」]+)」/g, (_, content) => `**${content}**`);
  return normalized.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/);
    if (match) {
      return <strong key={`${part}-${index}`} className="font-semibold text-[#1f160d]">{match[1]}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
};

const getSuggestedReplyMeta = (tier: SuggestedReply["tier"]) => {
  if (tier === "L2") {
    return {
      icon: Brain,
      className: "border-[#F7C948] bg-white text-[#B45309] hover:bg-[#FFF8E1]",
    };
  }
  if (tier === "L3") {
    return {
      icon: Rocket,
      className: "border-[#D8C4FF] bg-white text-[#7C3AED] hover:bg-[#F7F1FF]",
    };
  }
  return {
    icon: Lightbulb,
    className: "border-[#A7C7FF] bg-white text-[#2563EB] hover:bg-[#F3F8FF]",
  };
};

const clearSuggestedReplies = () => {
  if (idleGuideTimerRef.current) {
    window.clearTimeout(idleGuideTimerRef.current);
    idleGuideTimerRef.current = null;
  }
  setSuggestedReplies([]);
  setGuideQuestion("");
};

const stopSpeechInput = (forceAbort = false) => {
  sttTypingTokenRef.current += 1;
  sttStartingRef.current = false;
  if (sttWatchdogRef.current) {
    window.clearTimeout(sttWatchdogRef.current);
    sttWatchdogRef.current = null;
  }
  if (sttSilenceTimerRef.current) {
    window.clearTimeout(sttSilenceTimerRef.current);
    sttSilenceTimerRef.current = null;
  }
  if (sttTypingTimerRef.current) {
    window.clearInterval(sttTypingTimerRef.current);
    sttTypingTimerRef.current = null;
  }
  if (sttAutoSendTimerRef.current) {
    window.clearTimeout(sttAutoSendTimerRef.current);
    sttAutoSendTimerRef.current = null;
  }
  if (speechRecognitionRef.current) {
    try {
      speechRecognitionRef.current.stop();
      if (forceAbort) {
        speechRecognitionRef.current.abort?.();
      }
    } catch {
      // ignore
    }
    speechRecognitionRef.current = null;
  }
  if (speechMeterFrameRef.current) {
    window.cancelAnimationFrame(speechMeterFrameRef.current);
    speechMeterFrameRef.current = null;
  }
  if (speechMeterStreamRef.current) {
    speechMeterStreamRef.current.getTracks().forEach((track) => track.stop());
    speechMeterStreamRef.current = null;
  }
  if (speechMeterAudioContextRef.current) {
    void speechMeterAudioContextRef.current.close().catch(() => undefined);
    speechMeterAudioContextRef.current = null;
  }
  speechMeterAnalyserRef.current = null;
  setVoiceLevel(0);
  setIsListening(false);
};

const startSpeechInput = async () => {
  if (shouldBlockChat) return;
  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SR) {
    showAlert({
      title: "不支援語音輸入",
      message: "此瀏覽器暫不支援語音輸入，建議使用 Chrome。",
    });
    return;
  }

  if (isListening) {
    // If state is stuck on mobile Chrome, force restart instead of just stopping.
    stopSpeechInput(true);
    await new Promise((r) => window.setTimeout(r, 120));
  }

  if (sttStartingRef.current) return;
  sttStartingRef.current = true;
  setAwaitingAudioGesture(false);
  if (audioRetryTimerRef.current) {
    window.clearTimeout(audioRetryTimerRef.current);
    audioRetryTimerRef.current = null;
  }

  // Chrome mobile can keep an internal stale session; hard-reset before each new start.
  if (speechRecognitionRef.current) {
    stopSpeechInput(true);
    await new Promise((r) => window.setTimeout(r, 120));
  }

  // Mic acts as an interrupt: stop current AI speech/stream first, then listen.
  stopAllSpeech();

  if (!navigator.mediaDevices?.getUserMedia) {
    showAlert({
      title: "麥克風不可用",
      message: "目前環境不支援麥克風權限請求。",
      tone: "danger",
    });
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    speechMeterStreamRef.current = stream;
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const audioContext = new AudioCtx();
      speechMeterAudioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      speechMeterAnalyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.fftSize);

      const updateLevel = () => {
        const currentAnalyser = speechMeterAnalyserRef.current;
        if (!currentAnalyser) return;
        currentAnalyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i += 1) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const boosted = Math.min(1, rms * 4.2);
        setVoiceLevel(boosted);
        speechMeterFrameRef.current = window.requestAnimationFrame(updateLevel);
      };

      speechMeterFrameRef.current = window.requestAnimationFrame(updateLevel);
    }
  } catch (e: any) {
    sttStartingRef.current = false;
    const name = e?.name || "UnknownError";
    if (name === "NotAllowedError") {
      showAlert({
        title: "麥克風權限被拒絕",
        message: "請在瀏覽器設定中允許麥克風後再試。",
        tone: "danger",
      });
      return;
    }
    showAlert({
      title: "無法使用麥克風",
      message: "請檢查系統與瀏覽器權限後再試。",
      tone: "danger",
    });
    return;
  }

  const recognition = new SR();
  speechRecognitionRef.current = recognition;
  // Match speech recognition to the currently selected reply language.
  recognition.lang = selectedReplyLanguage.speechRecognitionLanguage;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  const clearSttTimers = () => {
    if (sttWatchdogRef.current) {
      window.clearTimeout(sttWatchdogRef.current);
      sttWatchdogRef.current = null;
    }
    if (sttSilenceTimerRef.current) {
      window.clearTimeout(sttSilenceTimerRef.current);
      sttSilenceTimerRef.current = null;
    }
  };

  const bumpSilenceTimer = () => {
    if (sttSilenceTimerRef.current) {
      window.clearTimeout(sttSilenceTimerRef.current);
    }
    sttSilenceTimerRef.current = window.setTimeout(() => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    }, 2200);
  };

  recognition.onstart = () => {
    sttStartingRef.current = false;
    setIsListening(true);
    clearSttTimers();
    // Auto-stop if no result comes back, avoiding "stuck listening" state.
    sttWatchdogRef.current = window.setTimeout(() => {
      if (isListeningRef.current) {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
        setIsListening(false);
      }
    }, 10000);
    bumpSilenceTimer();
  };
  recognition.onsoundstart = bumpSilenceTimer;
  recognition.onspeechstart = bumpSilenceTimer;
  recognition.onspeechend = () => {
    try {
      recognition.stop();
    } catch {
      // ignore
    }
  };
  recognition.onerror = (event: any) => {
    sttStartingRef.current = false;
    console.error("STT error:", event?.error || event);
    setIsListening(false);
    clearSttTimers();
    if (event?.error === "not-allowed") {
      showAlert({
        title: "語音輸入權限被拒絕",
        message: "請允許麥克風後再試。",
        tone: "danger",
      });
    } else if (event?.error === "no-speech") {
      showAlert({
        title: "未偵測到語音",
        message: "請再説一次。",
      });
    } else if (event?.error === "audio-capture") {
      showAlert({
        title: "找不到麥克風",
        message: "目前找不到可用的麥克風裝置。",
        tone: "danger",
      });
    }
  };
  recognition.onend = () => {
    sttStartingRef.current = false;
    setIsListening(false);
    clearSttTimers();
    speechRecognitionRef.current = null;
  };

  recognition.onresult = (event: any) => {
    bumpSilenceTimer();
    const results = Array.from(event?.results || []);
    const latestChunk = results
      .map((r: any) => r?.[0]?.transcript || "")
      .join("")
      .trim();
    if (!latestChunk) return;

    const hasFinal = results.some((r: any) => r?.isFinal);
    if (!hasFinal) {
      setInputText(latestChunk);
      return;
    }
    clearSttTimers();
    const transcript = latestChunk;

    sttTypingTokenRef.current += 1;
    const typingToken = sttTypingTokenRef.current;
    if (sttTypingTimerRef.current) {
      window.clearInterval(sttTypingTimerRef.current);
      sttTypingTimerRef.current = null;
    }
    if (sttAutoSendTimerRef.current) {
      window.clearTimeout(sttAutoSendTimerRef.current);
      sttAutoSendTimerRef.current = null;
    }

    let i = 0;
    setInputText("");
    sttAutoSendTimerRef.current = window.setTimeout(() => {
      if (typingToken !== sttTypingTokenRef.current) return;
      sttAutoSendTimerRef.current = null;
      if (sttTypingTimerRef.current) {
        window.clearInterval(sttTypingTimerRef.current);
        sttTypingTimerRef.current = null;
      }
      setInputText(transcript);
      void sendMessage(transcript, undefined, "voice");
    }, Math.max(220, Math.min(transcript.length * 35 + 120, 900)));

    sttTypingTimerRef.current = window.setInterval(() => {
      if (typingToken !== sttTypingTokenRef.current) {
        if (sttTypingTimerRef.current) {
          window.clearInterval(sttTypingTimerRef.current);
          sttTypingTimerRef.current = null;
        }
        return;
      }

      i += 1;
      const current = transcript.slice(0, i);
      setInputText(current);

      if (i >= transcript.length) {
        if (sttTypingTimerRef.current) {
          window.clearInterval(sttTypingTimerRef.current);
          sttTypingTimerRef.current = null;
        }
        if (sttAutoSendTimerRef.current) {
          window.clearTimeout(sttAutoSendTimerRef.current);
          sttAutoSendTimerRef.current = null;
        }
        void sendMessage(transcript, undefined, "voice");
      }
    }, 35);
  };

  try {
    recognition.start();
  } catch (e) {
    sttStartingRef.current = false;
    console.error("STT start error:", e);
    // Retry once after a short cooldown for Chrome's intermittent InvalidState cases.
    try {
      await new Promise((r) => window.setTimeout(r, 180));
      recognition.start();
      return;
    } catch (retryErr) {
      console.error("STT retry start error:", retryErr);
      setIsListening(false);
      clearSttTimers();
      showAlert({
        title: "語音輸入啟動失敗",
        message: "請稍後再試。",
        tone: "danger",
      });
    }
  }
};

const unlockAudioAndMic = async () => {
  if (isUnlocking || permissionReady) return;
  setIsUnlocking(true);
  setPermissionError("");
  if (typeof window === "undefined") {
    setIsUnlocking(false);
    return;
  }
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    }
    // Enter chat immediately once mic permission is granted.
    setPermissionReady(true);
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      await ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.01);
      setTimeout(() => {
        void ctx.close();
      }, 30);
    }
    if (!ttsPlayerRef.current) {
      ttsPlayerRef.current = new Audio();
      ttsPlayerRef.current.preload = "auto";
    }
    ttsPlayerRef.current.muted = true;
    await ttsPlayerRef.current.play().catch(() => {});
    ttsPlayerRef.current.pause();
    ttsPlayerRef.current.muted = false;
  } catch (e: any) {
    const name = e?.name || "UnknownError";
    setPermissionReady(false);
    if (name === "NotAllowedError") {
      setPermissionError("你拒絕了麥克風權限，請在瀏覽器設定中允許後再試。");
    } else {
      setPermissionError("授權失敗，請檢查手機瀏覽器麥克風與音訊權限。");
    }
  } finally {
    setIsUnlocking(false);
  }
};

  useEffect(() => {
    if (isOpen) return;
    stopAllSpeech();
    setMessages([]);
    setOpeningReady(false);
    setVoiceLimitMessage("");
    setQuizBackgroundSaving(false);
    quizSubmitQueueRef.current = Promise.resolve();
    voiceLimitNoticeShownRef.current = false;
    ttsErrorNoticeShownRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!voiceId || !shouldRequirePermission) {
      setPermissionReady(true);
      setPermissionError("");
      return;
    }
    // Require one explicit tap after each open, then keep unlocked within this session.
    setPermissionReady(false);
  }, [isOpen, voiceId, shouldRequirePermission]);

  useEffect(() => {
    return () => {
      if (audioRetryTimerRef.current) {
        window.clearTimeout(audioRetryTimerRef.current);
        audioRetryTimerRef.current = null;
      }
      stopSpeechInput(true);
      stopAllSpeech();
    };
  }, []);

  const handleCloseWithInterrupt = () => {
    stopSpeechInput(true);
    stopAllSpeech();
    onClose();
  };

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete(botConfig.id);
  };

  useEffect(() => {
    if (!isOpen || !botConfig?.id) return;
    let cancelled = false;
    setQuizLoading(true);
    fetch(`${API_BASE}/api/bots/${botConfig.id}/active-quiz`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "載入測驗失敗");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.dismissed) {
          setActiveQuiz(null);
          setActiveQuizAttempt(null);
          setQuizQuestion(null);
          setQuizAllQuestions([]);
          setQuizPrefetchedQuestion(null);
          setQuizAnswerMap({});
          setQuizSelectedAnswer("");
          setQuizTextAnswer("");
          setQuizResult(null);
          setQuizUiState("hidden");
          return;
        }
        const quiz = data?.quiz || null;
        const attempt = data?.attempt || null;
        setActiveQuiz(quiz);
        setActiveQuizAttempt(attempt);
        setQuizQuestion(null);
        setQuizAllQuestions(Array.isArray(data?.allQuestions) ? data.allQuestions : []);
        setQuizPrefetchedQuestion(data?.currentQuestion || null);
        setQuizAnswerMap({});
        setQuizSelectedAnswer("");
        setQuizTextAnswer("");
        setQuizResult(attempt?.result || null);
        if (!quiz) {
          setQuizUiState("hidden");
          return;
        }
        if (attempt?.status === "completed") {
          setQuizUiState("result");
        } else {
          setQuizCurrentIndex(Number(attempt?.currentIndex || 0));
          setQuizUiState("banner");
        }
      })
      .catch(() => {
        if (!cancelled) setQuizUiState("hidden");
      })
      .finally(() => {
        if (!cancelled) setQuizLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, botConfig?.id]);

  const openQuizPrompt = () => {
    if (!activeQuiz) return;
    setQuizUiState("prompt");
  };

  const deferQuiz = async () => {
    if (!activeQuiz) return;
    setQuizSubmitting(true);
    setQuizUiState("banner");
    try {
      await fetch(`${API_BASE}/api/quizzes/${activeQuiz.id}/attempts/defer`, {
        method: "POST",
        headers: requestHeaders,
      });
    } finally {
      setQuizSubmitting(false);
    }
  };

  const startQuiz = async () => {
    if (!activeQuiz) return;
    setQuizStarting(true);
    if (quizPrefetchedQuestion && !quizRestarting) {
      const prefetchedAnswer = quizAnswerMap[Number(activeQuizAttempt?.currentIndex || 0)] || "";
      setQuizQuestion(quizPrefetchedQuestion);
      setQuizCurrentIndex(Number(activeQuizAttempt?.currentIndex || 0));
      setQuizTotalQuestions(Number(activeQuiz.questionCount || 0));
      setQuizSelectedAnswer((quizPrefetchedQuestion.options || []).length ? prefetchedAnswer : "");
      setQuizTextAnswer((quizPrefetchedQuestion.options || []).length ? "" : prefetchedAnswer);
      setQuizUiState("taking");
    }
    try {
      const res = await fetch(`${API_BASE}/api/quizzes/${activeQuiz.id}/attempts/start`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({ restart: quizRestarting }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "開始測驗失敗");
      setQuizAllQuestions(Array.isArray(data?.allQuestions) ? data.allQuestions : []);
      setActiveQuizAttempt(data?.attempt || null);
      setQuizQuestion(data?.currentQuestion || null);
      setQuizPrefetchedQuestion(data?.currentQuestion || null);
      setQuizCurrentIndex(Number(data?.attempt?.currentIndex || 0));
      setQuizTotalQuestions(Number(data?.totalQuestions || activeQuiz.questionCount || 0));
      setQuizAnswerMap({});
      setQuizSelectedAnswer("");
      setQuizTextAnswer("");
      setQuizUiState("taking");
      setQuizRestarting(false);
    } catch (error) {
      showAlert({
        title: "測驗無法開始",
        message: error instanceof Error ? error.message : "開始測驗失敗，請稍後再試。",
      });
    } finally {
      setQuizStarting(false);
    }
  };

  const submitQuizAnswer = async () => {
    const answerToSubmit = quizQuestion?.options?.length ? quizSelectedAnswer : quizTextAnswer.trim();
    if (!activeQuiz || !quizQuestion || !answerToSubmit) return;
    const isLastQuestion = quizCurrentIndex + 1 >= quizTotalQuestions;
    const submission = async () => {
      const res = await fetch(`${API_BASE}/api/quizzes/${activeQuiz.id}/attempts/answer`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          botId: botConfig.id,
          questionIndex: quizCurrentIndex,
          answer: answerToSubmit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "提交答案失敗");
      return data;
    };

    const nextAnswerMap = { ...quizAnswerMap, [quizCurrentIndex]: answerToSubmit };
    setQuizAnswerMap(nextAnswerMap);

    if (!isLastQuestion) {
      const nextIndex = quizCurrentIndex + 1;
      const nextQuestion = quizAllQuestions[nextIndex] || null;
      const nextSavedAnswer = nextAnswerMap[nextIndex] || "";
      setQuizCurrentIndex(nextIndex);
      if (nextQuestion) {
        setQuizQuestion(nextQuestion);
        setQuizSelectedAnswer((nextQuestion.options || []).length ? nextSavedAnswer : "");
        setQuizTextAnswer((nextQuestion.options || []).length ? "" : nextSavedAnswer);
      } else {
        setQuizSelectedAnswer("");
        setQuizTextAnswer("");
        setQuizQuestion({
          id: `loading-${nextIndex}`,
          type: "",
          cognitiveLevel: "",
          levelColor: "bg-slate-100 text-slate-500",
          content: "正在載入下一題...",
          options: [],
          answer: "",
        });
      }
      setQuizBackgroundSaving(true);
      quizSubmitQueueRef.current = quizSubmitQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const data = await submission();
          setQuizAllQuestions((prev) => {
            if (!data?.nextQuestion) return prev;
            const nextQuestions = [...prev];
            nextQuestions[nextIndex] = data.nextQuestion;
            return nextQuestions;
          });
        })
        .catch((error) => {
          showAlert({
            title: "答案同步失敗",
            message: error instanceof Error ? error.message : "提交答案失敗，請稍後再試。",
          });
        })
        .finally(() => {
          setQuizBackgroundSaving(false);
        });
      return;
    }

    setQuizSubmitting(true);
    try {
      await quizSubmitQueueRef.current.catch(() => undefined);
      const data = await submission();
      if (data?.status === "completed") {
        setQuizResult(data?.result || null);
        setQuizUiState("result");
        setQuizQuestion(null);
        setQuizSelectedAnswer("");
      } else {
        setQuizQuestion(data?.nextQuestion || null);
        setQuizCurrentIndex(Number(data?.currentIndex ?? quizCurrentIndex + 1));
        setQuizTotalQuestions(Number(data?.totalQuestions || quizTotalQuestions));
        setQuizSelectedAnswer("");
        setQuizTextAnswer("");
      }
    } catch (error) {
      showAlert({
        title: "提交失敗",
        message: error instanceof Error ? error.message : "提交答案失敗，請稍後再試。",
      });
    } finally {
      setQuizSubmitting(false);
    }
  };

  const goToPreviousQuizQuestion = () => {
    if (quizCurrentIndex <= 0 || !quizAllQuestions.length) return;
    const previousIndex = quizCurrentIndex - 1;
    const previousQuestion = quizAllQuestions[previousIndex];
    if (!previousQuestion) return;
    const savedAnswer = quizAnswerMap[previousIndex] || "";
    setQuizCurrentIndex(previousIndex);
    setQuizQuestion(previousQuestion);
    setQuizSelectedAnswer((previousQuestion.options || []).length ? savedAnswer : "");
    setQuizTextAnswer((previousQuestion.options || []).length ? "" : savedAnswer);
  };

  const retryQuiz = async () => {
    if (!activeQuiz) return;
    setQuizSubmitting(true);
    setQuizBackgroundSaving(false);
    setQuizRestarting(true);
    quizSubmitQueueRef.current = Promise.resolve();
    setActiveQuizAttempt(null);
    setQuizQuestion(null);
    setQuizPrefetchedQuestion(null);
    setQuizCurrentIndex(0);
    setQuizTotalQuestions(Number(activeQuiz.questionCount || 0));
    setQuizAnswerMap({});
    setQuizSelectedAnswer("");
    setQuizTextAnswer("");
    try {
      await fetch(`${API_BASE}/api/quizzes/${activeQuiz.id}/attempts/reset`, {
        method: "POST",
        headers: requestHeaders,
      });
      setQuizResult(null);
      setQuizUiState("prompt");
    } finally {
      setQuizSubmitting(false);
    }
  };

  const dismissQuizResult = async () => {
    if (!activeQuiz) {
      setQuizUiState("hidden");
      return;
    }
    const quizId = activeQuiz.id;
    setQuizUiState("hidden");
    setQuizResult(null);
    setActiveQuiz(null);
    setActiveQuizAttempt(null);
    setQuizQuestion(null);
    setQuizAllQuestions([]);
    setQuizPrefetchedQuestion(null);
    setQuizAnswerMap({});
    setQuizBackgroundSaving(false);
    quizSubmitQueueRef.current = Promise.resolve();
    try {
      await fetch(`${API_BASE}/api/quizzes/${quizId}/attempts/dismiss-result`, {
        method: "POST",
        headers: requestHeaders,
      });
    } catch {
      // Ignore dismissal errors and still return the UI to chat mode.
    }
  };

  const fillSegments = React.useMemo(() => {
    if (!quizQuestion || quizQuestion.options?.length || quizQuestion.type !== "填充題") return null;
    const matches = Array.from(String(quizQuestion.content || "").matchAll(/_{2,}|＿{2,}/g));
    if (!matches.length) return null;
    const rawAnswers = quizTextAnswer.split("|");
    let lastIndex = 0;
    return matches.map((match, index) => {
      const start = match.index || 0;
      const before = quizQuestion.content.slice(lastIndex, start);
      lastIndex = start + match[0].length;
      return {
        before,
        value: rawAnswers[index] || "",
        index,
        isLast: index === matches.length - 1,
        after: index === matches.length - 1 ? quizQuestion.content.slice(lastIndex) : "",
      };
    });
  }, [quizQuestion, quizTextAnswer]);

  const isQuizTaking = quizUiState === "taking" && Boolean(activeQuiz && quizQuestion);
  const shouldDisableRegularChat = shouldShowBooting || (shouldRequirePermission && !permissionReady) || isQuizTaking;

  if (!isOpen) return null;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-white p-4 md:bg-transparent md:p-4">
          {/* 背景 */}
          <div
            className="absolute inset-0 bg-white md:bg-black/50 md:backdrop-blur-sm"
            onClick={handleCloseWithInterrupt}
          />

          {/* 主體 */}
          <div className="relative h-[92svh] w-full max-w-[720px] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_22px_80px_rgba(15,23,42,0.16)] md:h-[92vh] md:max-w-7xl md:rounded-3xl md:border-0 md:shadow-2xl">
            <div
              className="relative h-full w-full overflow-hidden rounded-[1.5rem] bg-[#f8fafc] transition-all duration-300 md:flex md:rounded-3xl"
            >
            {/* 左側背景 + 動畫 */}
            <div
              ref={stageCaptureRef}
              className={`relative h-full w-full bg-slate-200 transition-all duration-300 ${
                chatPanelOpen ? "md:w-[56%]" : "md:w-full"
              }`}
            >
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                crossOrigin="anonymous"
                className={`absolute inset-0 w-full h-full object-cover ${
                  cameraBackgroundReady && !isMobileClient ? "scale-x-[-1]" : ""
                } ${
                  cameraBackgroundReady ? "block" : "hidden"
                }`}
              />

              {!cameraBackgroundReady && background && background.trim() !== "" ? (
                <img
                  ref={stageBackgroundImageRef}
                  src={background}
                  crossOrigin="anonymous"
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                />
              ) : (
                !cameraBackgroundReady && (
                  <div className="absolute inset-0 w-full h-full bg-slate-300 opacity-80" />
                )
              )}

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,16,0.16)_0%,rgba(8,12,16,0.05)_34%,rgba(8,12,16,0.42)_100%)]" />
              <div className="absolute left-4 top-5 z-30 hidden md:left-6 md:top-6 md:block">
                <button
                  type="button"
                  onClick={() => setArControlsOpen((prev) => !prev)}
                  className={`flex h-11 items-center gap-2 rounded-2xl px-3.5 text-xs font-semibold text-white shadow-lg backdrop-blur transition-all duration-200 ${
                    arControlsOpen
                      ? "bg-white/22 ring-2 ring-white/65 shadow-[0_8px_24px_rgba(245,158,11,0.24)]"
                      : "bg-black/45 hover:bg-black/60"
                  }`}
                  title={arControlsOpen ? "收起 AR 控制" : "打開 AR 控制"}
                >
                  <Camera size={16} />
                  <span>AR</span>
                  <ChevronDown
                    size={15}
                    className={`transition-transform duration-300 ${arControlsOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
              <div className="absolute right-4 top-5 z-30 flex flex-col items-center gap-2 md:right-6 md:top-6 md:flex-row md:gap-3">
                <button
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg backdrop-blur transition-all duration-200 ${
                    chatPanelOpen
                      ? "bg-white/22 ring-2 ring-white/65 shadow-[0_8px_24px_rgba(245,158,11,0.24)]"
                      : "bg-black/45 hover:bg-black/60"
                  }`}
                  onClick={handleChatPanelToggle}
                  title={chatPanelOpen ? "隱藏聊天框" : "顯示聊天框"}
                >
                  <MessageCircle size={20} />
                </button>
                {chatPanelOpen && canUseHistory ? (
                  <button
                    className={`flex h-11 items-center gap-2 rounded-2xl px-3.5 text-white shadow-lg backdrop-blur transition-all duration-200 ${
                      historyDrawerOpen
                        ? "bg-white/22 ring-2 ring-white/65 shadow-[0_8px_24px_rgba(245,158,11,0.24)]"
                        : "bg-black/45 hover:bg-black/60"
                    }`}
                    onClick={handleHistoryButtonClick}
                    title={historyDrawerOpen ? "關閉對話紀錄" : "打開對話紀錄"}
                  >
                    <MessagesSquare size={20} />
                    <span className="hidden text-xs font-semibold md:inline">對話紀錄</span>
                  </button>
                ) : null}
                {!isSharedView && (
                  <div className="relative" data-top-menu-root="publish-preview">
                    <button
                      className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/45 text-white shadow-lg backdrop-blur transition-all duration-200 hover:bg-black/60"
                      onClick={() => setShowTopMenu((prev) => !prev)}
                      title="更多操作"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {showTopMenu ? (
                      <div className="absolute right-0 top-14 w-40 overflow-hidden rounded-2xl border border-white/15 bg-[#18181b]/92 p-1.5 text-sm text-white shadow-2xl backdrop-blur">
                        <button
                          className="flex w-full items-center rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10"
                          onClick={() => {
                            setShowTopMenu(false);
                            onEdit();
                          }}
                        >
                          編輯機器人
                        </button>
                        <button
                          className="flex w-full items-center rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10"
                          onClick={() => {
                            setShowTopMenu(false);
                            void handleCopyShareLink();
                          }}
                        >
                          複製共享連結
                        </button>
                        <button
                          className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-red-300 transition hover:bg-red-500/10"
                          onClick={() => {
                            setShowTopMenu(false);
                            setShowDeleteConfirm(true);
                          }}
                        >
                          刪除機器人
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
                {!chatPanelOpen && (
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-slate-700 shadow-lg hover:bg-white"
                    onClick={handleCloseWithInterrupt}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              {cameraBackgroundReady && (
                <>
                  <div className="pointer-events-none absolute left-6 top-20 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-semibold tracking-[0.24em] text-white shadow-[0_0_12px_rgba(239,68,68,0.45)]">
                    REC
                  </div>
                  <div className="pointer-events-none absolute right-6 top-20 text-[10px] font-medium tracking-[0.24em] text-white/90">
                    LIVE CAMERA
                  </div>
                  <div className="pointer-events-none absolute inset-0 hidden md:block">
                    <div className="absolute left-5 top-5 h-10 w-10 rounded-tl-2xl border-l-2 border-t-2 border-white/70" />
                    <div className="absolute right-5 top-5 h-10 w-10 rounded-tr-2xl border-r-2 border-t-2 border-white/70" />
                    <div className="absolute bottom-5 left-5 h-10 w-10 rounded-bl-2xl border-b-2 border-l-2 border-white/70" />
                    <div className="absolute bottom-5 right-5 h-10 w-10 rounded-br-2xl border-b-2 border-r-2 border-white/70" />
                  </div>
                </>
              )}

              <div className="absolute left-6 top-20 z-20 hidden md:block">
                <div
                  className={`w-[320px] origin-top-left overflow-hidden rounded-[20px] border bg-slate-950/42 text-white shadow-[0_18px_52px_rgba(15,23,42,0.28)] backdrop-blur-xl transition-all duration-300 ${
                    arControlsOpen
                      ? "translate-y-0 scale-100 border-white/18 opacity-100"
                      : "pointer-events-none -translate-y-2 scale-95 border-transparent opacity-0"
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-white/12 px-4 py-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/58">
                        AR BACKGROUND
                      </div>
                      <div className="mt-0.5 text-sm font-semibold">相機背景</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          cameraBackgroundReady
                            ? "bg-emerald-400/18 text-emerald-100 ring-1 ring-emerald-300/35"
                            : cameraBackgroundLoading
                            ? "bg-amber-300/18 text-amber-100 ring-1 ring-amber-200/35"
                            : "bg-white/10 text-white/72 ring-1 ring-white/14"
                        }`}
                      >
                        {cameraBackgroundReady ? "已連接" : cameraBackgroundLoading ? "啟動中" : "未啟用"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setArControlsOpen(false)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/78 ring-1 ring-white/12 transition hover:bg-white/16"
                        title="收起 AR 控制"
                      >
                        <ChevronDown size={16} className="rotate-90" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-3.5">
                    <p className="text-xs leading-5 text-white/74">
                      {cameraBackgroundError
                        ? `相機未啟用：${cameraBackgroundError}`
                        : cameraBackgroundReady
                        ? isMobileClient
                          ? "可拖動角色位置，雙指捏合調整大小。"
                          : "可拖動角色位置，並用下方工具調整角色大小。"
                        : cameraBackgroundLoading
                        ? "正在請求相機權限..."
                        : "啟用後會以電腦相機畫面取代目前背景。"}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          void startCameraBackground();
                        }}
                        disabled={cameraBackgroundLoading}
                        className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                      >
                        <Camera size={15} />
                        {cameraBackgroundLoading
                          ? "啟動中..."
                          : cameraBackgroundReady
                          ? "重新連接"
                          : isMobileClient
                          ? "開啟手機相機"
                          : "開啟相機"}
                      </button>
                      <button
                        onClick={() => {
                          void startScreenRecording();
                        }}
                        className={`flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-semibold transition ${
                          isRecordingScreen
                            ? "bg-red-500 text-white shadow-[0_10px_24px_rgba(239,68,68,0.28)] hover:bg-red-600"
                            : "bg-white/12 text-white ring-1 ring-white/12 hover:bg-white/18"
                        }`}
                      >
                        <Square size={14} />
                        {isRecordingScreen ? "結束並下載" : "開始錄製"}
                      </button>
                    </div>

                    {cameraBackgroundReady && (
                      <div className="space-y-2 border-t border-white/12 pt-3">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={stopCameraBackground}
                            className="h-9 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white ring-1 ring-white/12 transition hover:bg-white/16"
                          >
                            關閉 AR
                          </button>
                          <button
                            onClick={resetArCharacterPose}
                            className="h-9 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white ring-1 ring-white/12 transition hover:bg-white/16"
                          >
                            重置位置
                          </button>
                        </div>

                        {!isMobileClient && (
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <button
                              onClick={() => nudgeCharacterScale(-0.08)}
                              className="h-9 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white ring-1 ring-white/12 transition hover:bg-white/16"
                            >
                              縮小
                            </button>
                            <div className="min-w-[72px] rounded-xl bg-black/20 px-3 py-2 text-center text-[11px] font-semibold text-white/82 ring-1 ring-white/10">
                              {Math.round(characterScale * 100)}%
                            </div>
                            <button
                              onClick={() => nudgeCharacterScale(0.08)}
                              className="h-9 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white ring-1 ring-white/12 transition hover:bg-white/16"
                            >
                              放大
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {recordingError ? (
                      <div className="rounded-xl bg-red-500/14 px-3 py-2 text-[11px] leading-5 text-red-50 ring-1 ring-red-300/18">
                        錄製未啟用：{recordingError}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <ConversationHistoryDrawer
                key={`conversation-history-${botConfig?.id || "unknown"}-bulk-v2`}
                open={historyDrawerOpen && chatPanelOpen}
                loading={historyLoading || historyActionLoading}
                refreshing={historyRefreshing}
                error={historyError}
                search={conversationSearch}
                selectedConversationId={currentConversationId}
                conversations={conversations}
                activeMenuConversationId={historyMenuConversationId}
                selectionMode={historySelectionMode}
                selectedConversationIds={selectedHistoryConversationIds}
                onClose={closeHistoryDrawer}
                onRefresh={() => {
                  void fetchConversationHistory({ silent: conversations.length > 0 });
                }}
                onSearchChange={(value) => {
                  setConversationSearch(value);
                  setSelectedHistoryConversationIds([]);
                }}
                onCreateConversation={() => {
                  void handleCreateConversation();
                }}
                onSelectConversation={(conversation) => {
                  void restoreConversation(conversation);
                }}
                onToggleMenu={setHistoryMenuConversationId}
                onRenameConversation={(conversation) => {
                  void handleRenameConversation(conversation);
                }}
                onDeleteConversation={(conversation) => {
                  void handleDeleteConversation(conversation);
                }}
                onSelectionModeChange={handleHistorySelectionModeChange}
                onToggleConversationSelection={handleToggleHistoryConversationSelection}
                onSetConversationSelection={setSelectedHistoryConversationIds}
                onDeleteSelectedConversations={handleDeleteSelectedConversations}
              />

              {historyDrawerOpen && chatPanelOpen ? (
                <button
                  type="button"
                  aria-label="關閉對話紀錄"
                  className="absolute inset-0 z-[35] cursor-default bg-transparent"
                  onClick={closeHistoryDrawer}
                />
              ) : null}


              {cameraBackgroundReady ? (
                <div ref={arStageRef} className="absolute inset-0 overscroll-none touch-none">
                  <motion.div
                    className="absolute left-1/2 bottom-12 h-[80%] w-full cursor-grab touch-none select-none active:cursor-grabbing md:w-[80%]"
                    transition={{ duration: 0.2 }}
                    style={{
                      transform: `translate(calc(-50% + ${characterOffset.x}px), ${characterOffset.y}px) scale(${characterScale})`,
                      transformOrigin: "center bottom",
                      touchAction: "none",
                    }}
                    onPointerDown={handleCharacterPointerDown}
                    onPointerMove={handleCharacterPointerMove}
                    onPointerUp={handleCharacterPointerUp}
                    onPointerCancel={handleCharacterPointerUp}
                    onTouchStart={handleCharacterTouchStart}
                    onTouchMove={handleCharacterTouchMove}
                    onTouchEnd={handleCharacterTouchEnd}
                    onTouchCancel={handleCharacterTouchEnd}
                  >
                    {hasAnyVideo ? (
                      <div className="relative h-full w-full">
                        {seqIdle ? (
                          <SequencePngPlayer
                            folderUrl={seqIdle.folderUrl}
                            pattern={seqIdle.pattern}
                            frameCount={seqIdle.frameCount}
                            fps={seqIdle.fps}
                            data-stage-character="true"
                            className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                              visualState === "idle" ? "block" : "hidden"
                            }`}
                            active={visualState === "idle"}
                          />
                        ) : safeVideoIdle && (
                          <video
                            data-stage-character="true"
                            src={safeVideoIdle}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            crossOrigin="anonymous"
                            className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                              visualState === "idle" ? "block" : "hidden"
                            }`}
                          />
                        )}
                        {seqThinking ? (
                          <SequencePngPlayer
                            folderUrl={seqThinking.folderUrl}
                            pattern={seqThinking.pattern}
                            frameCount={seqThinking.frameCount}
                            fps={seqThinking.fps}
                            data-stage-character="true"
                            className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                              visualState === "thinking" ? "block" : "hidden"
                            }`}
                            active={visualState === "thinking"}
                          />
                        ) : safeVideoThinking && (
                          <video
                            data-stage-character="true"
                            src={safeVideoThinking}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            crossOrigin="anonymous"
                            className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                              visualState === "thinking" ? "block" : "hidden"
                            }`}
                          />
                        )}
                        {seqTalking ? (
                          <SequencePngPlayer
                            folderUrl={seqTalking.folderUrl}
                            pattern={seqTalking.pattern}
                            frameCount={seqTalking.frameCount}
                            fps={seqTalking.fps}
                            data-stage-character="true"
                            className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                              visualState === "speaking" ? "block" : "hidden"
                            }`}
                            active={visualState === "speaking"}
                          />
                        ) : safeVideoTalking && (
                          <video
                            data-stage-character="true"
                            src={safeVideoTalking}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            crossOrigin="anonymous"
                            className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                              visualState === "speaking" ? "block" : "hidden"
                            }`}
                          />
                        )}
                      </div>
                    ) : (
                      (() => {
                        const safeAvatar =
                          avatarUrl && avatarUrl.trim() !== ""
                            ? avatarUrl
                            : "/avatars/placeholder.svg";
                        return (
                          <img
                            data-stage-character="true"
                            src={safeAvatar}
                            crossOrigin="anonymous"
                            className="h-full w-full object-contain drop-shadow-xl"
                          />
                        );
                      })()
                    )}
                  </motion.div>
                </div>
              ) : (
                <motion.div
                  className="absolute inset-0 flex items-end justify-center pb-12"
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {hasAnyVideo ? (
                    <div className="relative h-full md:h-[80%] w-full">
                      {seqIdle ? (
                        <SequencePngPlayer
                          folderUrl={seqIdle.folderUrl}
                          pattern={seqIdle.pattern}
                          frameCount={seqIdle.frameCount}
                          fps={seqIdle.fps}
                          data-stage-character="true"
                          className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                            visualState === "idle" ? "block" : "hidden"
                          }`}
                          active={visualState === "idle"}
                        />
                      ) : safeVideoIdle && (
                        <video
                          data-stage-character="true"
                          src={safeVideoIdle}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="auto"
                          crossOrigin="anonymous"
                          className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                            visualState === "idle" ? "block" : "hidden"
                          }`}
                        />
                      )}
                      {seqThinking ? (
                        <SequencePngPlayer
                          folderUrl={seqThinking.folderUrl}
                          pattern={seqThinking.pattern}
                          frameCount={seqThinking.frameCount}
                          fps={seqThinking.fps}
                          data-stage-character="true"
                          className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                            visualState === "thinking" ? "block" : "hidden"
                          }`}
                          active={visualState === "thinking"}
                        />
                      ) : safeVideoThinking && (
                        <video
                          data-stage-character="true"
                          src={safeVideoThinking}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="auto"
                          crossOrigin="anonymous"
                          className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                            visualState === "thinking" ? "block" : "hidden"
                          }`}
                        />
                      )}
                      {seqTalking ? (
                        <SequencePngPlayer
                          folderUrl={seqTalking.folderUrl}
                          pattern={seqTalking.pattern}
                          frameCount={seqTalking.frameCount}
                          fps={seqTalking.fps}
                          data-stage-character="true"
                          className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                            visualState === "speaking" ? "block" : "hidden"
                          }`}
                          active={visualState === "speaking"}
                        />
                      ) : safeVideoTalking && (
                        <video
                          data-stage-character="true"
                          src={safeVideoTalking}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="auto"
                          crossOrigin="anonymous"
                          className={`absolute inset-0 h-full w-full object-contain drop-shadow-xl ${
                            visualState === "speaking" ? "block" : "hidden"
                          }`}
                        />
                      )}
                    </div>
                  ) : (
                    (() => {
                      const safeAvatar =
                        avatarUrl && avatarUrl.trim() !== ""
                          ? avatarUrl
                          : "/avatars/placeholder.svg";
                      return (
                        <img
                          data-stage-character="true"
                          src={safeAvatar}
                          crossOrigin="anonymous"
                          className="h-[80%] object-contain drop-shadow-xl"
                        />
                      );
                    })()
                  )}
                </motion.div>
              )}
            </div>

            <div
              className={`absolute bottom-4 left-1/2 z-20 -translate-x-1/2 transition-all duration-300 ${
                chatPanelOpen ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"
              }`}
            >
              <div className="flex w-[calc(100vw-52px)] max-w-[390px] items-end justify-center gap-2.5 md:w-full md:max-w-[420px]">
                <button
                  onClick={startSpeechInput}
                  disabled={shouldBlockChat}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] border text-white backdrop-blur-md transition-all duration-200 ${
                    isListening
                      ? "bg-white/14 border-white/35 shadow-[0_10px_30px_rgba(255,255,255,0.14)]"
                      : "bg-black/45 border-white/15 hover:bg-black/60"
                  } disabled:opacity-40`}
                  title={isListening ? "點擊停止語音輸入" : "語音輸入（廣東話）"}
                >
                  <Mic size={18} />
                </button>
                <div className="flex h-12 min-w-[118px] max-w-[168px] items-center justify-center rounded-[22px] bg-black/45 px-4 text-white/80 backdrop-blur-md">
                  {botState === "thinking" ? (
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <span
                          key={idx}
                          className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce"
                          style={{ animationDelay: `${idx * 0.16}s` }}
                        />
                      ))}
                    </div>
                  ) : isListening ? (
                    <div className="flex h-5 items-center gap-[3px]">
                      {Array.from({ length: 11 }).map((_, idx) => {
                        const mid = Math.abs(5 - idx);
                        const baseHeight = Math.max(6, 14 - mid * 1.4);
                        const lift = Math.max(0, voiceLevel * (10 - mid * 0.9));
                        return (
                          <span
                            key={idx}
                            className="w-[3px] rounded-full bg-white/90 transition-[height] duration-75"
                            style={{
                              height: `${Math.max(4, Math.round(baseHeight + lift))}px`,
                            }}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: 9 }).map((_, idx) => (
                        <span key={idx} className="h-1 w-1 rounded-full bg-white/85" />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    void captureStagePhoto();
                  }}
                  disabled={isCapturingStagePhoto}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-900 shadow-lg transition-all ${
                    isCapturingStagePhoto
                      ? "cursor-not-allowed bg-white/70 opacity-70"
                      : "bg-white hover:bg-slate-100"
                  }`}
                  title={isCapturingStagePhoto ? "圖片保存中..." : "拍攝當前舞台"}
                >
                  <Camera size={18} />
                </button>
                {isStopAvailable ? (
                  <button
                    onClick={stopAllSpeech}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-black/45 text-white backdrop-blur-md hover:bg-black/60"
                    title="停止回覆與語音"
                  >
                    <ChevronDown size={18} />
                  </button>
                ) : null}
              </div>
              {stagePhotoError ? (
                <div className="pointer-events-auto mt-2 text-center text-xs text-red-200">
                  {stagePhotoError}
                </div>
              ) : null}
            </div>

            {/* 右側聊天 */}
            <div
              className={`absolute inset-x-3 bottom-3 top-[54%] z-30 overflow-hidden rounded-[2rem] border border-white/18 bg-[#f7f1e6]/95 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-all duration-300 md:relative md:inset-auto md:h-full md:rounded-none md:border-l md:border-r-0 md:border-t-0 md:border-b-0 md:border-slate-200 md:bg-slate-50 md:shadow-none md:backdrop-blur-0 ${
                chatPanelOpen
                  ? "translate-y-0 opacity-100 md:w-[44%]"
                  : "pointer-events-none translate-y-8 opacity-0 md:pointer-events-auto md:w-0 md:translate-y-0"
              }`}
            >
              <div className={`flex h-full min-w-0 flex-col ${chatPanelOpen ? "" : "md:pointer-events-none"}`}>
              {/* header */}
              <div className="flex items-center justify-between gap-3 border-b border-[#decfb9] bg-[#fffaf1]/86 p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-bold leading-tight text-[#241b12]">{botName}</div>
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      已發佈上線
                    </div>
                    {availableTopics.length > 0 ? (
                      <div
                        ref={topicSelectorRef}
                        className="relative min-w-0"
                        data-topic-selector-root="publish-chat"
                      >
                        <button
                          type="button"
                          onClick={() => setIsTopicSelectorOpen((current) => !current)}
                          disabled={topicsLoading || isSwitchingTopic}
                          className="flex min-h-8 max-w-[11.5rem] items-center gap-1.5 rounded-lg border border-[#d9c8ae] bg-white/80 px-2.5 text-[11px] font-black text-[#6c4b22] shadow-sm transition hover:bg-white disabled:cursor-wait disabled:opacity-65"
                          aria-haspopup="listbox"
                          aria-expanded={isTopicSelectorOpen}
                          title={selectedTopic?.name || "選擇主題"}
                        >
                          <BookOpen className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{selectedTopic?.name || "選擇主題"}</span>
                          {isSwitchingTopic ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : (
                            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${isTopicSelectorOpen ? "rotate-180" : ""}`} />
                          )}
                        </button>

                        <AnimatePresence>
                          {isTopicSelectorOpen ? (
                            <motion.div
                              initial={{ opacity: 0, y: -6, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              transition={{ duration: 0.14 }}
                              className="absolute left-0 top-full z-[70] mt-2 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-[#ddcfba] bg-[#fffdf8] shadow-[0_20px_50px_rgba(69,52,31,0.24)]"
                              role="listbox"
                              aria-label="選擇對話主題"
                            >
                              <div className="border-b border-[#eee3d3] px-3.5 py-3">
                                <div className="text-xs font-black text-[#2f251a]">選擇主題</div>
                                <div className="mt-0.5 text-[10px] leading-4 text-[#8b7a64]">切換後，下一則回覆會使用新提示與知識。</div>
                              </div>
                              <div className="custom-scroll max-h-64 overflow-y-auto p-1.5">
                                {availableTopics.map((topic) => {
                                  const active = topic.id === selectedTopicId;
                                  return (
                                    <button
                                      key={topic.id}
                                      type="button"
                                      role="option"
                                      aria-selected={active}
                                      onClick={() => void handleTopicSwitch(topic)}
                                      disabled={isSwitchingTopic}
                                      className={`flex min-h-14 w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                                        active ? "bg-[#efe2cf]" : "hover:bg-[#f7f0e5]"
                                      }`}
                                    >
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${active ? "bg-[#7c4d18] text-white" : "border border-[#d9c9b2] text-transparent"}`}>
                                        <Check className="h-3 w-3" />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5 text-xs font-black text-[#30261b]">
                                          <span className="truncate">{topic.name}</span>
                                          {topic.isDefault ? <span className="shrink-0 text-[9px] font-black text-amber-700">預設</span> : null}
                                        </span>
                                        <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-[#7e6d58]">
                                          {topic.description || "此主題尚未加入説明"}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    ) : topicsLoading ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#8b7a64]">
                        <Loader2 className="h-3 w-3 animate-spin" /> 載入主題
                      </span>
                    ) : null}
                  </div>
                  {topicError ? <div className="mt-1 truncate text-[10px] font-semibold text-rose-600">{topicError}</div> : null}
                </div>

                <div
                  className="flex shrink-0 rounded-xl bg-[#eadfce]/80 p-1"
                  role="radiogroup"
                  aria-label="AI 回覆語言"
                >
                  {REPLY_LANGUAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={replyLanguage === option.value}
                      onClick={() => handleReplyLanguageChange(option.value)}
                      className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all duration-200 md:px-2.5 ${
                        replyLanguage === option.value
                          ? "bg-white text-[#7c4d18] shadow-sm"
                          : "text-[#786851] hover:text-[#3f3325]"
                      }`}
                      title={`切換 AI 回覆至${option.label}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <button
                  className="ml-2 rounded-full p-2 text-[#6f604c] hover:bg-[#eadfce]"
                  onClick={() => {
                    setChatPanelOpen(false);
                    closeHistoryDrawer();
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {activeQuiz && quizUiState === "banner" ? (
                <div className="border-b border-[#ebe5db] bg-white px-0 py-0">
                  <div className="flex min-h-[40px] items-center justify-between gap-3 bg-[linear-gradient(90deg,#4f46e5_0%,#5b43ea_42%,#5638e7_100%)] px-4 py-1.5 text-white shadow-[0_10px_22px_rgba(79,70,229,0.18)]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-[21px] leading-none text-[#ffd84d]">⚡</span>
                      <div className="truncate text-[12px] font-black tracking-[0.01em]">你有一個待完成的知識測試</div>
                    </div>
                    <button
                      type="button"
                      onClick={openQuizPrompt}
                      className="shrink-0 rounded-full bg-white/18 px-3.5 py-1.5 text-[11px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-white/10 backdrop-blur transition hover:bg-white/24"
                    >
                      點擊開展測試 →
                    </button>
                  </div>
                </div>
              ) : null}

              {/* messages */}
                  <div
                    ref={messagesRef}
                    className={`custom-scroll flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,250,241,0.6),rgba(247,241,230,0.92))] p-3.5 ${
                      suggestedReplies.length > 0 || guidedMode ? "pb-44 md:pb-52" : "pb-3.5"
                    }`}
                  >
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : m.role === "event" ? "justify-center" : "justify-start"
                    }`}
                  >
                    {m.role === "event" ? (
                      <div className="max-w-[92%] rounded-full border border-[#dfd1bc] bg-[#f2e8d9]/85 px-3 py-1.5 text-center text-[10px] font-bold text-[#806d54]">
                        {m.content}
                      </div>
                    ) : m.role === "bot" && m.guidedTitle ? (
                      <div className="max-w-[88%]">
                        <div className="mb-1 text-xs font-semibold text-[#7c6a54]">{m.guidedTitle}</div>
                        <div className="rounded-2xl rounded-bl-sm border border-[#e5d8c3] bg-white/88 p-3 text-sm leading-relaxed text-[#2b241b] shadow-sm whitespace-pre-wrap">
                          {(m.guidedBody || m.content).split("\n").map((line, idx) => {
                            const trimmed = line.trim();
                            const isHeading =
                              trimmed === "做得好" || trimmed === "可改進" || trimmed === "下一步";
                            return (
                              <div key={idx} className={isHeading ? "font-semibold text-slate-900" : ""}>
                                {line}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`max-w-[88%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
                          m.role === "user"
                            ? m.imagePreviews?.length
                              ? "rounded-br-sm border border-[#e5d8c3] bg-white/88 text-[#2b241b]"
                              : "rounded-br-sm bg-[#2e2418] text-white"
                            : "rounded-bl-sm border border-[#e5d8c3] bg-white/88 text-[#2b241b]"
                        }`}
                      >
                        {m.imagePreviews?.length ? (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {m.imagePreviews.map((src, index) => (
                              <button
                                key={`${src}-${index}`}
                                type="button"
                                onClick={() => setSelectedPreviewImage(src)}
                                className="overflow-hidden rounded-xl"
                              >
                                <img
                                  src={src}
                                  className="h-20 w-20 rounded-xl object-cover transition-transform hover:scale-[1.03]"
                                />
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="whitespace-pre-wrap">{renderFormattedMessage(m.content)}</div>
                      </div>
                    )}
                  </div>
                ))}

                    {activeQuiz && quizUiState === "prompt" ? (
                      <div className="mb-3 rounded-[20px] border border-indigo-100 bg-[#EEF2FF] p-4 shadow-[0_10px_24px_rgba(99,102,241,0.08)]">
                        <div className="flex items-center gap-2 text-indigo-900">
                          <span className="text-lg">⚡</span>
                          <span className="text-base font-black">{activeQuiz.title}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold leading-7 text-indigo-900">我們現在開始測試。準備好了嗎？請回答我接下來的問題！</p>
                        <div className="mt-4 flex flex-wrap gap-2.5">
                          <button type="button" onClick={() => void startQuiz()} disabled={quizStarting || quizSubmitting} className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-black text-white shadow-[0_8px_18px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700 disabled:opacity-60">{quizStarting ? "載入題目..." : "準備答題"}</button>
                          <button type="button" onClick={() => void deferQuiz()} disabled={quizStarting || quizSubmitting} className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">稍後作答</button>
                        </div>
                      </div>
                    ) : null}

                    {activeQuiz && quizUiState === "taking" && quizQuestion ? (
                      <div className="mb-4 rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-all" style={{ width: `${Math.max(8, ((quizCurrentIndex + 1) / Math.max(1, quizTotalQuestions)) * 100)}%` }} />
                        </div>
                        <div className="rounded-[16px] border border-indigo-100 bg-[#EEF2FF] p-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-lg font-black text-white">{quizCurrentIndex + 1}</div>
                            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${quizQuestion.levelColor}`}>{quizQuestion.cognitiveLevel}</span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500">{quizQuestion.type}</span>
                          </div>
                          <div className="mt-3 text-[15px] font-black leading-8 text-slate-800">{quizQuestion.content}</div>
                        </div>
                        <div className="mt-3 space-y-2.5">
                          {(quizQuestion.options || []).length ? (
                            (quizQuestion.options || []).map((option) => {
                              const selected = quizSelectedAnswer === option;
                              return (
                                <button key={option} type="button" onClick={() => setQuizSelectedAnswer(option)} className={`flex w-full items-center gap-3 rounded-[16px] border px-4 py-3.5 text-left text-sm font-bold transition ${selected ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-[0_8px_18px_rgba(99,102,241,0.10)]" : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/40"}`}>
                                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-indigo-500 bg-white" : "border-slate-300 bg-white"}`}>
                                    {selected ? <span className="h-3.5 w-3.5 rounded-full bg-indigo-600" /> : null}
                                  </span>
                                  <span>{option}</span>
                                </button>
                              );
                            })
                          ) : fillSegments ? (
                            <div className="rounded-[18px] border border-slate-200 bg-[#fcfdff] px-5 py-4 text-[15px] font-black leading-10 text-slate-800">
                              {fillSegments.map((segment) => (
                                <React.Fragment key={segment.index}>
                                  <span>{segment.before}</span>
                                  <input
                                    value={segment.value}
                                    onChange={(event) => {
                                      const raw = quizTextAnswer.split("|");
                                      raw[segment.index] = event.target.value;
                                      setQuizTextAnswer(raw.join("|"));
                                    }}
                                    className="mx-2 inline-block min-w-[96px] border-0 border-b-4 border-indigo-500 bg-indigo-50 px-2 py-1 text-center text-base font-black text-indigo-700 outline-none"
                                  />
                                  {segment.isLast ? <span>{segment.after}</span> : null}
                                </React.Fragment>
                              ))}
                            </div>
                          ) : (
                            <textarea
                              value={quizTextAnswer}
                              onChange={(event) => setQuizTextAnswer(event.target.value)}
                              placeholder="請輸入你的答案..."
                              className="min-h-[160px] w-full resize-none rounded-[18px] border border-slate-200 bg-white px-5 py-4 text-sm font-medium leading-7 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100/60"
                            />
                          )}
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                          <button type="button" onClick={goToPreviousQuizQuestion} disabled={quizCurrentIndex === 0} className="rounded-full px-5 py-2 text-sm font-black text-slate-500 transition hover:bg-slate-50 disabled:text-slate-300">
                            上一題
                          </button>
                          <button type="button" onClick={() => void submitQuizAnswer()} disabled={(!(quizQuestion.options || []).length ? !quizTextAnswer.trim() : !quizSelectedAnswer) || quizSubmitting} className="rounded-full bg-indigo-600 px-7 py-2.5 text-sm font-black text-white shadow-[0_8px_20px_rgba(79,70,229,0.20)] transition hover:bg-indigo-700 disabled:opacity-50">
                            {quizSubmitting && quizCurrentIndex + 1 >= quizTotalQuestions ? "計分中..." : quizCurrentIndex + 1 >= quizTotalQuestions ? "完成作答" : "下一題"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {activeQuiz && quizUiState === "result" && quizResult ? (
                      <div className="mb-4 space-y-5">
                        <div className="inline-flex max-w-[80%] items-start gap-2.5 rounded-[22px] border border-indigo-100 bg-[#EEF2FF] px-5 py-4 shadow-sm">
                          <span className="mt-0.5 text-lg">⚡</span>
                          <div>
                            <div className="text-base font-black text-indigo-900">{quizResult.title || activeQuiz.title}</div>
                            <div className="mt-1.5 text-[16px] font-black leading-7 text-indigo-900">測驗已結束。以下是你的結算報告。</div>
                          </div>
                        </div>
                        <div className="rounded-[22px] border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <div>
                              <div className="text-sm font-black text-slate-500">測驗結果結算</div>
                              <div className="mt-1 line-clamp-1 text-lg font-black text-slate-900">{quizResult.title}</div>
                            </div>
                            <div className="flex items-end gap-1 text-indigo-600">
                              <div className="text-5xl font-black leading-none">{quizResult.score}</div>
                              <div className="mb-1 text-base font-black">分</div>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-4">
                            <div className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-[28px] bg-[linear-gradient(180deg,rgba(226,233,244,0.92),rgba(204,214,230,0.72))] text-[46px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_16px_28px_rgba(148,163,184,0.18)] ring-1 ring-white/60">
                              <div className="absolute inset-0 rounded-[28px] border border-white/40" />
                              {quizResult.grade}
                              <span className="absolute -bottom-1.5 right-[-4px] flex h-[30px] min-w-[50px] items-center justify-center rounded-full bg-white px-2.5 text-[12px] font-black text-slate-700 shadow-[0_10px_20px_rgba(148,163,184,0.22)] ring-1 ring-slate-200/80">
                                等級
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-xl font-black leading-tight text-slate-900">{quizResult.grade === "A" ? "表現出色" : quizResult.grade === "B" ? "掌握不錯" : quizResult.grade === "C" ? "持續前進" : "打穩基礎"}</div>
                              <div className="mt-1.5 text-sm font-semibold leading-6 text-slate-500">{quizResult.message}</div>
                            </div>
                          </div>
                          <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
                            <button type="button" onClick={() => { if (typeof window !== "undefined") { window.dispatchEvent(new CustomEvent("quiz-pending-changed", { detail: { botId: botConfig.id, hasPendingQuiz: true } })); } void retryQuiz(); }} disabled={quizSubmitting} className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">再測一次</button>
                            <button type="button" onClick={() => { if (typeof window !== "undefined") { window.dispatchEvent(new CustomEvent("quiz-pending-changed", { detail: { botId: botConfig.id, hasPendingQuiz: false } })); } void dismissQuizResult(); }} className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-black text-white transition hover:bg-indigo-700">完成結算</button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                {/* thinking bubble */}
                {botState === "thinking" && !voiceLimitMessage && (
                  <div className="flex">
                    <div className="flex gap-1 rounded-2xl border border-[#e5d8c3] bg-white/88 p-3">
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"></span>
                      <span
                        className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></span>
                      <span
                        className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                      ></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* input */}
              <div className="border-t border-[#decfb9] bg-[#fffaf1] p-2">
                {suggestedReplies.length > 0 ? (
                  <div className="mb-1.5 rounded-[20px] border border-[#ecdba8] bg-[#fffaf1]/96 px-1.5 py-1.5 shadow-[0_6px_14px_rgba(218,184,100,0.07)]">
                    <div className="mb-1.5 flex items-center justify-between gap-1.5 px-1">
                      <div className="flex items-center gap-1 text-[10px] font-black text-[#C77B09]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#F6B51E]" />
                        引導模式進行中
                      </div>
                      <button
                        type="button"
                        onClick={clearSuggestedReplies}
                        className="rounded-full border border-rose-100 bg-white/92 px-2 py-0.5 text-[9px] font-black text-rose-500 shadow-sm transition hover:bg-rose-50"
                      >
                        退出引導
                      </button>
                    </div>
                    <div className="space-y-1">
                      {suggestedReplies.map((reply) => {
                        const meta = getSuggestedReplyMeta(reply.tier);
                        const Icon = meta.icon;
                        return (
                          <button
                            key={`${reply.tier}-${reply.text}`}
                            type="button"
                            onClick={() => void sendMessage(reply.sendText || reply.text, reply.text, "guided_hint")}
                            className={`flex min-h-[34px] w-full items-center gap-1.5 rounded-full border px-3 py-1 text-left text-[10px] font-black shadow-[0_2px_6px_rgba(148,163,184,0.06)] transition active:scale-[0.99] ${meta.className}`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="shrink-0">{reply.label}</span>
                            <span className="min-w-0 truncate text-[10px] font-bold text-[#475569]">{reply.text}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : guidedMode ? (
                  <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-2">
                    <div className="mb-2 text-xs text-amber-800">
                      引導模式進行中 {guidedStepIndex > 0 && guidedTotalSteps > 0 ? `(Step ${guidedStepIndex}/${guidedTotalSteps})` : ""}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void sendMessage("下一步", undefined, "guided_action")} className="rounded-lg bg-white px-3 py-1 text-xs text-amber-800 border border-amber-200">下一步</button>
                      <button onClick={() => void sendMessage("重複這一步", undefined, "guided_action")} className="rounded-lg bg-white px-3 py-1 text-xs text-amber-800 border border-amber-200">重複這一步</button>
                      <button onClick={() => void sendMessage("給我示例", undefined, "guided_action")} className="rounded-lg bg-white px-3 py-1 text-xs text-amber-800 border border-amber-200">給我示例</button>
                      <button onClick={() => void sendMessage("退出引導", undefined, "guided_action")} className="rounded-lg bg-white px-3 py-1 text-xs text-rose-700 border border-rose-200">退出引導</button>
                    </div>
                  </div>
                ) : null}
                {awaitingAudioGesture && (
                  <div className="mb-2 text-xs text-amber-600">
                    已收到回覆語音，請點一下畫面以恢復播放。
                  </div>
                )}
                {voiceLimitMessage && (
                  <div className="mb-2 text-xs text-amber-700">
                    {voiceLimitMessage}
                  </div>
                )}
                <div className="mb-2 flex items-center">
                  <div className="relative" data-model-menu-root="publish-chat">
                  <button
                    type="button"
                    onClick={() => setShowModelMenu((prev) => !prev)}
                    disabled={shouldDisableRegularChat}
                    className="flex items-center gap-2 rounded-full border border-[#e1d4bf] bg-white/92 px-3 py-1.5 text-xs font-medium text-[#4b3f31] shadow-sm transition hover:bg-[#fffaf1] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                      <span>{modelProvider === "deepseek" ? "DeepSeek" : "Gemini"}</span>
                      <ChevronDown size={14} className={`transition-transform ${showModelMenu ? "rotate-180" : ""}`} />
                    </button>
                    {showModelMenu ? (
                      <div className="absolute bottom-full left-0 z-20 mb-2 min-w-[116px] overflow-hidden rounded-2xl border border-[#e5d8c3] bg-[#fffaf1] shadow-[0_14px_28px_rgba(36,27,18,0.12)]">
                        {(["deepseek", "gemini"] as const).map((option) => {
                          const active = modelProvider === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setModelProvider(option);
                                setShowModelMenu(false);
                              }}
                              className={`flex w-full items-center px-3 py-2 text-left text-sm transition ${
                                active
                                  ? "bg-[#f4e7d3] font-semibold text-[#2d2115]"
                                  : "text-[#5f5141] hover:bg-[#f9efe1]"
                              }`}
                            >
                              <span>{option === "deepseek" ? "DeepSeek" : "Gemini"}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
                {chatImagePreviews.length ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {chatImagePreviews.map((src, index) => (
                      <div key={`${src}-${index}`} className="relative">
                        <button
                          type="button"
                          onClick={() => setSelectedPreviewImage(src)}
                          className="overflow-hidden rounded-xl"
                        >
                          <img src={src} className="h-16 w-16 rounded-xl object-cover transition-transform hover:scale-[1.03]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeChatImage(index)}
                          className="absolute -right-1 -top-1 rounded-full bg-black/70 p-1 text-white"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-end rounded-[1.35rem] border border-[#e1d4bf] bg-[#ede2cf] p-2">
                  {modelProvider === "gemini" ? (
                    <>
                      <input
                        ref={chatImageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          appendChatImages(event.target.files || []);
                          event.currentTarget.value = "";
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => chatImageInputRef.current?.click()}
                        disabled={shouldDisableRegularChat || chatImages.length >= 4}
                        className="mr-2 flex h-10 w-10 items-center justify-center rounded-full border border-[#e1d4bf] bg-white text-lg leading-none text-[#6f604c] hover:bg-[#fffaf1] disabled:opacity-40"
                        title="上傳圖片"
                      >
                        +
                      </button>
                    </>
                  ) : null}
                  <button
                    onClick={startSpeechInput}
                    disabled={shouldDisableRegularChat}
                    className={`p-3 mr-2 rounded-full border ${
                      isListening
                        ? "bg-red-50 border-red-300 text-red-600"
                        : "bg-white border-[#e1d4bf] text-[#6f604c] hover:bg-[#fffaf1]"
                    } disabled:opacity-40`}
                    title={isListening ? "點擊停止語音輸入" : "語音輸入（廣東話）"}
                  >
                    <Mic size={16} />
                  </button>
                  <textarea
                    ref={inputRef}
                    className={`flex-1 min-w-0 rounded-xl bg-transparent px-3 py-2 text-sm outline-none resize-none max-h-32 overflow-y-hidden leading-6 ${
                      isChatDragActive ? "bg-[#f6ead7] ring-2 ring-[#e7cda8]" : ""
                    } disabled:text-slate-400 disabled:placeholder:text-slate-300`}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage(undefined, undefined, "direct");
                      }
                    }}
                    disabled={shouldDisableRegularChat}
                    placeholder="輸入訊息，或按麥克風説話..."
                    rows={1}
                    style={{ height: "40px" }}
                    onDragOver={(event) => {
                      if (modelProvider !== "gemini") return;
                      event.preventDefault();
                      setIsChatDragActive(true);
                    }}
                    onDragLeave={(event) => {
                      if (modelProvider !== "gemini") return;
                      event.preventDefault();
                      setIsChatDragActive(false);
                    }}
                    onDrop={(event) => {
                      if (modelProvider !== "gemini") return;
                      event.preventDefault();
                      setIsChatDragActive(false);
                      appendChatImages(event.dataTransfer.files);
                    }}
                  />
                  <button
                    onClick={stopAllSpeech}
                    disabled={!isStopAvailable || shouldDisableRegularChat}
                    className="p-3 mr-2 text-[#6f604c] bg-white rounded-full hover:bg-[#fffaf1] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="停止回覆與語音"
                  >
                    <Square size={16} />
                  </button>
                  <button
                    onClick={() => {
                      void sendMessage(undefined, undefined, "direct");
                    }}
                    disabled={shouldDisableRegularChat || (!inputText.trim() && chatImages.length === 0)}
                    className="p-3 bg-[#2e2418] text-white rounded-full hover:bg-[#463727] disabled:opacity-40"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
            </div>
            </div>

            {shouldShowBooting && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/10 backdrop-blur-[1px]">
                <div className="flex items-center gap-3 rounded-2xl bg-white/92 px-5 py-3.5 shadow-xl ring-1 ring-slate-200/80 backdrop-blur">
                  <div className="h-6 w-6 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin" />
                  <div className="text-sm font-semibold text-slate-700">正在載入聊天與語音...</div>
                </div>
              </div>
            )}
            {!shouldShowBooting && shouldRequirePermission && !permissionReady && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/95 px-6 text-center">
                <div className="text-xl font-semibold text-slate-800">開始體驗前需要一次授權</div>
                <div className="text-sm text-slate-600">
                  點一次即可啟用麥克風與語音播放，之後同一會話可自動語音回覆。
                </div>
                <button
                  onClick={() => {
                    void unlockAudioAndMic();
                  }}
                  disabled={isUnlocking}
                  className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {isUnlocking ? "授權中..." : "開始體驗並授權"}
                </button>
                {permissionError && (
                  <div className="max-w-md text-xs text-red-600">{permissionError}</div>
                )}
              </div>
            )}
            {selectedPreviewImage ? (
              <div
                className="fixed inset-0 z-[120] flex items-center justify-center bg-black/72 p-6"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSelectedPreviewImage(null);
                }}
              >
                <img
                  src={selectedPreviewImage}
                  className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                />
              </div>
            ) : null}
          </div>

          {showDeleteConfirm && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45">
              <div className="w-[92%] max-w-sm rounded-2xl bg-white p-5 shadow-xl">
                <div className="text-base font-semibold text-slate-800">確認刪除這個聊天？</div>
                <div className="mt-2 text-sm text-slate-500">
                  刪除後將無法復原，分享連結也會失效。
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    取消
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    onClick={handleConfirmDelete}
                  >
                    確認刪除
                  </button>
                </div>
              </div>
            </div>
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
      )}
    </>
  );
};
