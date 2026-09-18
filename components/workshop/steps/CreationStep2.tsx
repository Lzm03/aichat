"use client";

import { uiText, uiTemplate } from '../../../utils/uiI18n';
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Icons } from "../../icons";
import { motion } from "framer-motion";
import { usePlatformDialog } from "../../../hooks/usePlatformDialog";
import { PlatformDialog } from "../../system/PlatformDialog";
import { SUBJECT_OPTIONS } from "../../../utils/subjects";
import { GRADE_BANDS } from "../../../utils/grades";
import { assignStableKnowledgePointIds, buildStoredKnowledgeBase, nextKnowledgePointId, parsePromptSource } from "../../../utils/chat-prompt";
import { TeachingSimulationPanel } from "./TeachingSimulationPanel";
import { TopicVersionTabs, type TopicVersionMeta } from "../topics/TopicVersionTabs";
import { AssignmentModeDialog, type AssignmentMode } from "../topics/AssignmentModeDialog";
import {
  createCharacterTopic,
  deleteCharacterTopic,
  getCharacterTopic,
  listCharacterTopics,
  listTopicCategoryLabels,
  saveTopicCategoryLabels,
  updateCharacterTopic,
} from "../../../utils/topic-api";
import { MAX_CUSTOM_CATEGORY_LABELS } from "../../../utils/topic-categories";

type UploadMethod = "file" | "url" | "text";
type KnowledgeTier = "basic_fact" | "deep_understanding";

type KnowledgePoint = {
  id: string;
  tier: KnowledgeTier;
  title: string;
  content: string;
  keywords: string[];
  assessmentCriteria: string;
  /** 教學目標（必達）：驅動覆蓋追蹤／next_point／進度。預設 true。 */
  core: boolean;
};

const MAX_KNOWLEDGE_POINTS = 20;
const MAX_POINTS_PER_TIER = 10;

const SECTION_TABS = [
  { id: "source", label: "教材來源" },
  { id: "map", label: "知識地圖" },
  { id: "teaching", label: "教學方式" },
] as const;

type SectionTabId = (typeof SECTION_TABS)[number]["id"];

/** 三種回答模式：名稱沿用現有答案值，不改 storage contract */
const ANSWER_MODE_OPTIONS = [
  {
    mode: "直接給答案",
    description: "適合快速認識大量知識點",
    detail: "Bot 會先完整講解答案，學生不需要先回答。",
    coverage: "Bot 講解過即記錄",
  },
  {
    mode: "引導後再回答",
    description: "Bot 先提示，學生回答後再補充",
    detail: "Bot 會先提供線索，再讓學生嘗試回答。",
    coverage: "學生答到才記錄",
  },
  {
    mode: "不直接給答案",
    description: "適合深度思考與討論",
    detail: "Bot 只提供問題和提示，不直接公布答案。",
    coverage: "學生自行表達理解才記錄",
  },
] as const;

interface CreationStep2Props {
  onGenerated: (data: {
    characterBackground: string;
    knowledgeSummary: string;
    personaProfile: string;
    knowledgePoints: KnowledgePoint[];
  }) => void;
  initialData?: {
    characterBackground?: string;
    knowledgeSummary?: string;
    knowledgePoints?: KnowledgePoint[];
    personalityTraits?: string[];
    speakingStyle?: string;
    answerMode?: string;
  };
  afterKnowledgePointEditor?: React.ReactNode;
  /** 學科分類（角色基礎必選）；CreationFlow 的 botConfig.subject 驅動 */
  subject?: string;
  onSubjectChange?: (subject: string) => void;
  /** 年級帶（選填）；留空 = 沿用預設回覆難度 */
  grade?: string;
  onGradeChange?: (grade: string) => void;
  /** Bot 名稱（教學模擬預覽用；唔影響儲存） */
  botName?: string;
  /** 安全提示詞（教學模擬預覽用；唔影響儲存） */
  securityPrompt?: string;
  /** 已發佈 Bot 嘅 id（編輯模式）；null = 新建模式（版本存本地，發布時先落庫） */
  characterId?: string | null;
  /** 版本列表 + 每版本知識點（供 CreationFlow 發布時建立話題） */
  onVersionsChange?: (versions: Array<TopicVersionMeta & { points: KnowledgePoint[] }>) => void;
}

export const CreationStep2: React.FC<CreationStep2Props> = ({ onGenerated, initialData, afterKnowledgePointEditor, subject = "", onSubjectChange, grade = "", onGradeChange, botName = "", securityPrompt = "", characterId = null, onVersionsChange }) => {
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>("file");
  const modelProvider = "gemini";
  const [files, setFiles] = useState<File[]>([]);
  const [inputValue, setInputValue] = useState("");

  const [status, setStatus] = useState<"idle" | "processing" | "complete">(
    "idle"
  );
  const [activeTab, setActiveTab] = useState<SectionTabId>("source");
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");

  const [characterBackground, setCharacterBackground] = useState(initialData?.characterBackground || "");
  const [knowledgeSummary, setKnowledgeSummary] = useState(initialData?.knowledgeSummary || "");
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>(initialData?.knowledgePoints || []);
  const [sourceLabel, setSourceLabel] = useState("");
  const [personalityTraits, setPersonalityTraits] = useState<string[]>(initialData?.personalityTraits || ["耐心"]);
  const [speakingStyle, setSpeakingStyle] = useState(initialData?.speakingStyle || "文言文");
  const [answerMode, setAnswerMode] = useState(initialData?.answerMode || "引導後再回答");
  const [progress, setProgress] = useState(0);
  const [newPointTitle, setNewPointTitle] = useState("");
  const [newPointContent, setNewPointContent] = useState("");
  const [newPointKeywords, setNewPointKeywords] = useState("");
  const [newPointAssessment, setNewPointAssessment] = useState("");
  const [newPointTier, setNewPointTier] = useState<KnowledgeTier>("basic_fact");
  const [graphMode, setGraphMode] = useState<"select" | "pan">("select");
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const graphViewportRef = useRef<HTMLDivElement | null>(null);
  const { dialog, closeDialog, showAlert, showConfirm } = usePlatformDialog();

  // --------------------------
  // 🔥 主題版本（知識地圖 Tab 架構；docs/knowledge-map-topic-versions.md）
  // --------------------------
  const [versions, setVersions] = useState<TopicVersionMeta[]>([
    { id: null, name: "版本一", category: "", isDefault: true },
  ]);
  const [activeVersionIndex, setActiveVersionIndex] = useState(0);
  const [maxVersions, setMaxVersions] = useState(4);
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentFileNames, setAssignmentFileNames] = useState<string[]>([]);
  const assignmentResolveRef = useRef<((mode: AssignmentMode | null) => void) | null>(null);
  /** 每個版本嘅知識點（active 版本嘅權威來源係 knowledgePoints state） */
  const pointsByVersionRef = useRef<Record<number, KnowledgePoint[]>>({});

  const pointsOfVersion = (index: number) => pointsByVersionRef.current[index] ?? [];

  // 完成反饋：新建立／變更嘅版本 tab 短暫高亮 + toast 指住 tab 列（docs §4.1 #6）
  const [highlightIndexes, setHighlightIndexes] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const fileInputLabelRef = useRef<HTMLLabelElement | null>(null);

  const showCompletionFeedback = (indexes: number[], message: string) => {
    setHighlightIndexes(indexes);
    setToastMessage(message);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      setHighlightIndexes([]);
      setToastMessage(null);
      feedbackTimerRef.current = null;
    }, 2500);
  };

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const buildVersionKnowledgeContent = (points: KnowledgePoint[]) =>
    `【知識點分級】\n${JSON.stringify(points, null, 2)}`;

  useEffect(() => {
    pointsByVersionRef.current[activeVersionIndex] = knowledgePoints;
  }, [knowledgePoints, activeVersionIndex]);

  useEffect(() => {
    onVersionsChange?.(
      versions.map((version, index) => ({
        ...version,
        points: index === activeVersionIndex ? knowledgePoints : pointsOfVersion(index),
      }))
    );
  }, [versions, knowledgePoints, activeVersionIndex]);

  const baseUrl = import.meta.env.VITE_API_URL;

  // 知識提取 prompt 已搬去 server 端（server/lib/knowledge-extraction.ts），
  // 前端唔再持有呢段 IP，亦唔會經 network 傳出去。

  const buildKnowledgeSummary = (points: KnowledgePoint[]) =>
    points
      .map((point) => {
        const tierLabel = point.tier === "basic_fact" ? "基礎事實" : "深度理解";
        const keywords = point.keywords.filter(Boolean).join("、");
        const assessment = point.assessmentCriteria.trim();
        const suffix = [keywords ? `關鍵詞：${keywords}` : "", assessment ? `評估：${assessment}` : ""]
          .filter(Boolean)
          .join("｜");
        return `- [${tierLabel}] ${point.title.trim()}：${point.content.trim()}${suffix ? `（${suffix}）` : ""}`;
      })
      .join("\n");

  const createKnowledgeTitle = (content: string, keywords: string[] = []) => {
    const cleaned = content
      .replace(/^[\s「『"']+|[\s」』"']+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const keywordTitle = keywords.find((keyword) => keyword.length >= 2 && keyword.length <= 14);
    if (keywordTitle) return keywordTitle;
    const colonTitle = cleaned.match(/^([^：:，,。.!！?？]{2,14})[：:，,。.!！?？]/)?.[1]?.trim();
    if (colonTitle) return colonTitle;
    const nameFact = cleaned.match(/^([^，,。]{2,8})(?:本名|出生|現居|退休|性格|興趣|口頭禪|語速)/)?.[1];
    if (/本名|出生|現居|退休|排字|工人/.test(cleaned)) return nameFact ? `${nameFact}背景` : "人物背景";
    if (/性格|親切|懷舊|語速|粵語|口語|停頓詞/.test(cleaned)) return "説話風格";
    if (/興趣|飲茶|散步|觀察|遊樂場/.test(cleaned)) return "生活興趣";
    if (/對話|邀請|茶|食個包/.test(cleaned)) return "對話示例";
    return cleaned.split(/[，,。.!！?？]/)[0]?.slice(0, 14) || "知識主題";
  };

  const trimKnowledgePoints = (points: KnowledgePoint[]) => {
    const basicFacts = points.filter((point) => point.tier === "basic_fact").slice(0, MAX_POINTS_PER_TIER);
    const deepPoints = points.filter((point) => point.tier === "deep_understanding").slice(0, MAX_POINTS_PER_TIER);
    const combined = [...basicFacts, ...deepPoints].slice(0, MAX_KNOWLEDGE_POINTS);
    // 唔喺呢度重編 id：交俾 assignStableKnowledgePointIds 保留舊 id，
    // 否則重新提取會令學生既有嘅覆蓋進度對錯知識點。
    return combined.map((point) => ({
      ...point,
      title: point.title?.trim() || createKnowledgeTitle(point.content, point.keywords),
    }));
  };

  const normalizeKnowledgePoints = (points: KnowledgePoint[]) =>
    points.map((point, index) => ({
      ...point,
      title: point.title?.trim() || createKnowledgeTitle(point.content, point.keywords),
      id: point.id || `kp_${String(index + 1).padStart(3, "0")}`,
      core: point.core !== false,
    }));

  const normalizeKnowledgePoint = (point: any, index: number): KnowledgePoint | null => {
    const content = String(point?.content || "").trim();
    if (!content) return null;
    const tier: KnowledgeTier =
      point?.tier === "deep_understanding" ? "deep_understanding" : "basic_fact";
    const keywords = Array.isArray(point?.keywords)
      ? point.keywords.map((item: any) => String(item || "").trim()).filter(Boolean).slice(0, 5)
      : [];
    const title = String(point?.title || point?.topic || "").trim() || createKnowledgeTitle(content, keywords);
    return {
      id: String(point?.id || `kp_${String(index + 1).padStart(3, "0")}`),
      tier,
      title,
      content,
      keywords,
      assessmentCriteria: String(point?.assessment_criteria || point?.assessmentCriteria || "").trim(),
      core: point?.core !== false,
    };
  };

  // 重新提取時用嚟配對舊 id 嘅「上一次知識點」。resetState 會清空
  // knowledgePoints，所以要另外存一份，唔係重新提取就冇嘢可以配對。
  const previousPointsRef = useRef<KnowledgePoint[]>(initialData?.knowledgePoints || []);
  useEffect(() => {
    if (knowledgePoints.length) previousPointsRef.current = knowledgePoints;
  }, [knowledgePoints]);

  const resetState = () => {
    setFiles([]);
    setInputValue("");
    setCharacterBackground("");
    setKnowledgeSummary("");
    setKnowledgePoints([]);
    setStatus("idle");
    setProgress(0);
    setSourceLabel("");
  };

  // 只喺第一次載入到已有知識內容時自動跳去「知識地圖」；
  // 之後老師改任何設定（性格／說話風格／回答模式等）都會觸發 initialData
  // 重跑，冇呢個 guard 就會被強制跳走。
  const didAutoOpenMapRef = useRef(false);

  useEffect(() => {
    setCharacterBackground(initialData?.characterBackground || "");
    setKnowledgeSummary(initialData?.knowledgeSummary || "");
    setKnowledgePoints(normalizeKnowledgePoints(initialData?.knowledgePoints || []));
    if ((initialData?.characterBackground || initialData?.knowledgeSummary) && !didAutoOpenMapRef.current) {
      didAutoOpenMapRef.current = true;
      setStatus("complete");
      setProgress(100);
      // 已有知識內容（編輯舊 Bot）→ 直接開知識地圖，唔使再由教材來源行一次
      setActiveTab("map");
    }
  }, [initialData?.characterBackground, initialData?.knowledgeSummary, initialData?.knowledgePoints]);

  // 編輯模式：由話題 API 載入主題版本；新建模式：本地「版本一」。
  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;
    (async () => {
      try {
        const { topics, maxTopics } = await listCharacterTopics(characterId);
        if (cancelled) return;
        setMaxVersions(maxTopics);
        const loaded: TopicVersionMeta[] = topics
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((topic) => ({
            id: topic.id,
            name: topic.name,
            category: topic.category || "",
            isDefault: topic.isDefault,
          }));
        if (!loaded.length) return;
        setVersions(loaded);
        const details = await Promise.all(
          topics.map((topic) => getCharacterTopic(characterId, topic.id).catch(() => null))
        );
        if (cancelled) return;
        details.forEach((detail, index) => {
          if (detail) {
            pointsByVersionRef.current[index] = parsePromptSource({
              knowledgeBase: detail.knowledgeContent,
            }).knowledgePoints as unknown as KnowledgePoint[];
          }
        });
        const defaultIndex = loaded.findIndex((version) => version.isDefault);
        const firstIndex = defaultIndex >= 0 ? defaultIndex : 0;
        setActiveVersionIndex(firstIndex);
        const firstPoints = pointsOfVersion(firstIndex);
        setKnowledgePoints(firstPoints);
        setKnowledgeSummary(buildKnowledgeSummary(firstPoints));
      } catch (error) {
        console.warn("載入主題版本失敗：", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  // 帳戶層自訂分類標籤（跨 Bot 共用）
  useEffect(() => {
    let cancelled = false;
    listTopicCategoryLabels()
      .then((data) => {
        if (!cancelled) setCustomLabels(data.labels || []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!characterBackground.trim() && !knowledgeSummary.trim()) return;
    // 主知識庫跟「默認版本」同步（覆蓋追蹤／無話題對話用默認版本）
    const defaultIndex = versions.findIndex((version) => version.isDefault);
    const effectivePoints =
      defaultIndex >= 0
        ? defaultIndex === activeVersionIndex
          ? knowledgePoints
          : pointsOfVersion(defaultIndex)
        : knowledgePoints;
    const personaProfile = [
      `【性格特質】${personalityTraits.join("、") || "未設定"}`,
      `【説話風格】${speakingStyle}`,
      `【答題策略】${answerMode}`,
    ].join("\n");
    onGenerated({
      characterBackground,
      knowledgeSummary: buildKnowledgeSummary(effectivePoints),
      personaProfile,
      knowledgePoints: effectivePoints,
    });
  }, [personalityTraits, speakingStyle, answerMode, characterBackground, knowledgePoints, versions, activeVersionIndex]);

  useEffect(() => {
    if (status !== "processing") return;
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 92) return p;
        return p + (p < 60 ? 6 : 2);
      });
    }, 500);
    return () => clearInterval(timer);
  }, [status]);

  // --------------------------
  // 🔥 處理文件拖拽
  // --------------------------
  const handleFileDrop = useCallback((nextFiles: FileList | null) => {
    if (!nextFiles || nextFiles.length === 0) return;
    setFiles((currentFiles) => {
      const merged = [...currentFiles];
      const knownFiles = new Set(
        currentFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      );
      Array.from(nextFiles).forEach((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!knownFiles.has(key)) {
          knownFiles.add(key);
          merged.push(file);
        }
      });
      return merged;
    });
  }, []);

  const removeFile = (indexToRemove: number) => {
    setFiles((currentFiles) => currentFiles.filter((_, index) => index !== indexToRemove));
  };

  // --------------------------
  // 🔥 文件 → /api/ask-file
  // --------------------------
  const processFiles = async (nextFiles: File[]) => {
    const form = new FormData();
    nextFiles.forEach((file) => {
      form.append("file", file);
    });
    form.append("modelProvider", modelProvider);

    const res = await fetch(`${baseUrl}/api/ask-file`, {
      method: "POST",
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "文件解析失敗");
    return data;
  };

  /** 單檔提取（「各自獨立」／「加進現有版本」模式用） */
  const processSingleFile = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("modelProvider", modelProvider);
    const res = await fetch(`${baseUrl}/api/ask-file`, {
      method: "POST",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "文件解析失敗");
    return data;
  };

  // --------------------------
  // 🔥 URL / 文字 → /api/ask
  // --------------------------
  const processText = async (content: string) => {
    const res = await fetch(`${baseUrl}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userPrompt: content,
        stream: false,
        modelProvider,
        usageType: "knowledge_extraction",
      }),
    });

    const raw = await res.text();

    try {
      return JSON.parse(raw);
    } catch {
      // 容錯：若後端仍返回 SSE（data:...），手動拼接成 reply
      const reply = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:/, ""))
        .join("")
        .trim();
      return { reply };
    }
  };

  const processUrl = async (url: string) => {
    const res = await fetch(`${baseUrl}/api/ask-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        modelProvider,
      }),
    });

    const raw = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(raw);
    } catch {
      data = { reply: raw };
    }

    if (!res.ok) {
      throw new Error(data?.error || "網址解析失敗");
    }

    return data;
  };

  const parseKnowledgeReply = (reply: string, previousPoints: KnowledgePoint[] = []) => {
    let parsed: any = null;
    try {
      parsed = JSON.parse(reply);
    } catch {
      const jsonBlock = reply.match(/\{[\s\S]*\}/)?.[0];
      if (jsonBlock) {
        try {
          parsed = JSON.parse(jsonBlock);
        } catch {
          parsed = null;
        }
      }
    }

    if (parsed && Array.isArray(parsed.knowledge_points)) {
      const points = assignStableKnowledgePointIds(
        trimKnowledgePoints(parsed.knowledge_points
          .map((point: any, index: number) => normalizeKnowledgePoint(point, index))
          .filter(Boolean) as KnowledgePoint[]),
        previousPoints
      );
      const bg = String(parsed.character_background || parsed.characterBackground || "").trim()
        || "我會根據你提供的資料進行回答與整理。";
      return { bg, ks: buildKnowledgeSummary(points), points };
    }

    const lines = trimKnowledgePoints(reply
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, MAX_KNOWLEDGE_POINTS)
      .map((content, index) =>
        normalizeKnowledgePoint(
          {
            id: `kp_${String(index + 1).padStart(3, "0")}`,
            tier: index < 5 ? "basic_fact" : "deep_understanding",
            content: content.replace(/^-+\s*/, ""),
            keywords: [],
            assessment_criteria: "",
          },
          index
        )
      )
      .filter(Boolean) as KnowledgePoint[]);

    const cleanedLines = lines.filter((point) => {
      const content = point.content.trim();
      return (
        content.length > 1 &&
        !/^[\[\]\{\}",]+$/.test(content) &&
        !/^(id|tier|content|keywords|assessmentCriteria|assessment_criteria)\s*[:：]/i.test(content)
      );
    });

    return {
      bg: reply.split("\n\n")[0]?.trim() || "我會根據你提供的資料進行回答與整理。",
      ks: buildKnowledgeSummary(cleanedLines),
      points: assignStableKnowledgePointIds(cleanedLines, previousPoints),
    };
  };

  // --------------------------
  // 🔥 主題版本操作
  // --------------------------
  const persistVersionPatch = async (version: TopicVersionMeta, patch: Record<string, unknown>) => {
    if (!characterId || !version.id) return;
    try {
      await updateCharacterTopic(characterId, version.id, patch as any);
    } catch (error) {
      console.warn("版本儲存失敗：", error);
      showAlert({ title: uiText("儲存失敗"), message: (error as Error)?.message || uiText("版本儲存失敗，請稍後再試") });
    }
  };

  const handleSelectVersion = async (index: number) => {
    if (index === activeVersionIndex) return;
    const current = versions[activeVersionIndex];
    if (current?.id) {
      await persistVersionPatch(current, { knowledgeContent: buildVersionKnowledgeContent(knowledgePoints) });
    }
    pointsByVersionRef.current[activeVersionIndex] = knowledgePoints;
    setActiveVersionIndex(index);
    const nextPoints = pointsOfVersion(index);
    setKnowledgePoints(nextPoints);
    setKnowledgeSummary(buildKnowledgeSummary(nextPoints));
  };

  const handleAddVersion = async () => {
    if (versions.length >= maxVersions) return;
    // 切走前先儲存現時 active 版本（之前會靜靜雞丟咗未 persist 嘅知識點）
    const current = versions[activeVersionIndex];
    if (current?.id) {
      await persistVersionPatch(current, { knowledgeContent: buildVersionKnowledgeContent(knowledgePoints) });
    }
    pointsByVersionRef.current[activeVersionIndex] = knowledgePoints;
    if (characterId) {
      try {
        const topic = await createCharacterTopic(characterId, {
          name: `版本${versions.length + 1}`,
          description: "",
          systemPrompt: "",
          knowledgeContent: "",
          category: "單元課本",
          isDefault: false,
        });
        const next = [...versions, { id: topic.id, name: topic.name, category: topic.category || "", isDefault: topic.isDefault }];
        setVersions(next);
        setActiveVersionIndex(next.length - 1);
        setKnowledgePoints([]);
        setKnowledgeSummary("");
      } catch (error) {
        showAlert({ title: uiText("無法新增版本"), message: (error as Error)?.message || uiText("每隻 Bot 最多 4 個主題版本") });
      }
      return;
    }
    const next = [...versions, { id: null, name: `版本${versions.length + 1}`, category: "", isDefault: false }];
    setVersions(next);
    setActiveVersionIndex(next.length - 1);
    setKnowledgePoints([]);
    setKnowledgeSummary("");
  };

  const handleRemoveVersion = async (index: number) => {
    if (versions.length <= 1) return;
    const version = versions[index];
    const doRemove = async () => {
      if (characterId && version.id) {
        try {
          const result = await deleteCharacterTopic(characterId, version.id);
          const next = versions
            .filter((_, itemIndex) => itemIndex !== index)
            .map((item) => ({ ...item, isDefault: item.id === result.defaultTopicId }));
          setVersions(next);
        } catch (error) {
          showAlert({ title: uiText("無法刪除版本"), message: (error as Error)?.message || uiText("刪除版本失敗，請稍後再試") });
          return;
        }
      } else {
        const removedDefault = version.isDefault;
        const next = versions.filter((_, itemIndex) => itemIndex !== index);
        if (removedDefault && next.length) next[0] = { ...next[0], isDefault: true };
        setVersions(next);
      }
      // 清走被刪版本嘅知識點緩存，重新對位
      const remaining = versions.filter((_, itemIndex) => itemIndex !== index);
      const newPointsMap: Record<number, KnowledgePoint[]> = {};
      remaining.forEach((item, itemIndex) => {
        newPointsMap[itemIndex] = pointsByVersionRef.current[itemIndex >= index ? itemIndex + 1 : itemIndex] ?? [];
      });
      pointsByVersionRef.current = newPointsMap;
      const nextIndex = Math.min(index, remaining.length - 1);
      setActiveVersionIndex(nextIndex);
      setKnowledgePoints(pointsOfVersion(nextIndex));
      setKnowledgeSummary(buildKnowledgeSummary(pointsOfVersion(nextIndex)));
    };
    showConfirm({
      title: uiText("刪除主題版本"),
      message: uiText("刪除後呢個版本嘅知識點同學生覆蓋進度會一併移除，確定？"),
      confirmText: uiText("刪除"),
      onConfirm: doRemove,
    });
  };

  const handleRenameVersion = async (index: number, name: string) => {
    const next = versions.map((version, itemIndex) => (itemIndex === index ? { ...version, name } : version));
    setVersions(next);
    await persistVersionPatch(next[index], { name });
  };

  /** Tab 列「上傳」捷徑：跳去教材來源並直接開 file picker */
  const handleUploadMore = () => {
    setActiveTab("source");
    window.setTimeout(() => fileInputLabelRef.current?.click(), 0);
  };

  const handleCategoryChange = async (index: number, category: string) => {
    const next = versions.map((version, itemIndex) => (itemIndex === index ? { ...version, category } : version));
    setVersions(next);
    await persistVersionPatch(next[index], { category });
  };

  const handleAddCustomLabel = async (label: string) => {
    if (!label || customLabels.includes(label)) return;
    if (customLabels.length >= MAX_CUSTOM_CATEGORY_LABELS) {
      showAlert({ title: uiText("自訂標籤已滿"), message: uiText("最多 10 個自訂標籤，可先刪除唔再用嘅") });
      return;
    }
    const next = [...customLabels, label];
    setCustomLabels(next);
    try {
      await saveTopicCategoryLabels(next);
    } catch (error) {
      console.warn("自訂標籤儲存失敗：", error);
    }
  };

  const handleSetDefault = async (index: number) => {
    const next = versions.map((version, itemIndex) => ({ ...version, isDefault: itemIndex === index }));
    setVersions(next);
    await persistVersionPatch(next[index], { isDefault: true });
  };

  const handleReorder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...versions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setVersions(next);
    // 同步知識點緩存順序
    const fromPoints = pointsByVersionRef.current[from] ?? [];
    const newMap: Record<number, KnowledgePoint[]> = {};
    next.forEach((_, itemIndex) => {
      if (itemIndex < Math.min(from, to) || itemIndex > Math.max(from, to)) {
        newMap[itemIndex] = pointsByVersionRef.current[itemIndex] ?? [];
      } else if (itemIndex === to) {
        newMap[itemIndex] = fromPoints;
      } else {
        newMap[itemIndex] = pointsByVersionRef.current[from < to ? itemIndex + 1 : itemIndex - 1] ?? [];
      }
    });
    pointsByVersionRef.current = newMap;
    setActiveVersionIndex(to);
    if (characterId) {
      next.forEach((version, itemIndex) => {
        if (version.id) void persistVersionPatch(version, { sortOrder: itemIndex });
      });
    }
  };

  const mergeKnowledgePoints = (existing: KnowledgePoint[], incoming: KnowledgePoint[]) => {
    const byTitle = new Map(existing.map((point) => [point.title.trim(), point]));
    for (const point of incoming) {
      const key = point.title.trim();
      const current = byTitle.get(key);
      if (current) {
        byTitle.set(key, {
          ...current,
          content: point.content || current.content,
          keywords: point.keywords.length ? point.keywords : current.keywords,
          assessmentCriteria: point.assessmentCriteria || current.assessmentCriteria,
        });
      } else {
        byTitle.set(key, point);
      }
    }
    return Array.from(byTitle.values());
  };

  // --------------------------
  // 🔥 主解析流程
  // --------------------------
  const handleProcess = async () => {
    if (files.length === 0 && uploadMethod === "file") return;
    if (files.length === 0 && uploadMethod !== "file" && !inputValue.trim()) return;
    // complete 狀態嘅拖拽區可能喺 uploadMethod 係 url/text 嗰陣再上傳——有檔就照檔處理
    const usingFiles = files.length > 0;

    setStatus("processing");
    setProgress(12);

    try {
      const nextSourceLabel =
        usingFiles
          ? `文件：${files.map((file) => file.name).join("、") || "未命名文件"}`
          : uploadMethod === "url"
          ? `Web URL：${inputValue.trim()}`
          : "Text";
      setSourceLabel(nextSourceLabel);

      const applySingle = (parsed: { bg: string; ks: string; points: KnowledgePoint[] }, name?: string) => {
        const target = versions[activeVersionIndex];
        setCharacterBackground(parsed.bg);
        setKnowledgeSummary(parsed.ks);
        setKnowledgePoints(parsed.points);
        pointsByVersionRef.current[activeVersionIndex] = parsed.points;
        // 空嘅「版本N」自動改用檔名
        if (name && target?.name.startsWith("版本")) {
          void handleRenameVersion(activeVersionIndex, name);
        }
        // 編輯模式即刻寫庫（之前要等切 tab 先 persist，容易丟失）
        if (target?.id) {
          void persistVersionPatch(target, { knowledgeContent: buildVersionKnowledgeContent(parsed.points) });
        }
        setFiles([]);
        setInputValue("");
        setProgress(100);
        setStatus("complete");
        setActiveTab("map");
      };

      const appendVersions = async (results: Array<{ bg: string; ks: string; points: KnowledgePoint[]; name: string }>) => {
        // 第一個結果填 active（空嘅話），其餘開新版本
        const created: number[] = [];
        const activeEmpty = pointsOfVersion(activeVersionIndex).length === 0 && !knowledgeSummary.trim();
        const first = results[0];
        let lastIndex = activeVersionIndex;
        if (activeEmpty) {
          applySingle({ bg: first.bg, ks: first.ks, points: first.points }, first.name);
          created.push(activeVersionIndex);
        } else {
          lastIndex = await openNewVersionWith(first);
          created.push(lastIndex);
        }
        for (const extra of results.slice(1)) {
          lastIndex = await openNewVersionWith(extra);
          created.push(lastIndex);
        }
        setActiveVersionIndex(lastIndex);
        setProgress(100);
        setStatus("complete");
        setActiveTab("map");
        return created;
      };

      const openNewVersionWith = async (entry: { bg: string; ks: string; points: KnowledgePoint[]; name: string }) => {
        if (versions.length >= maxVersions) {
          throw new Error(uiText("每隻 Bot 最多 4 個主題版本"));
        }
        if (characterId) {
          const topic = await createCharacterTopic(characterId, {
            name: entry.name || `版本${versions.length + 1}`,
            description: "",
            systemPrompt: "",
            knowledgeContent: buildVersionKnowledgeContent(entry.points),
            category: "單元課本",
            isDefault: false,
          });
          const next = [...versions, { id: topic.id, name: topic.name, category: topic.category || "", isDefault: topic.isDefault }];
          setVersions(next);
          pointsByVersionRef.current[next.length - 1] = entry.points;
          return next.length - 1;
        }
        const next = [...versions, { id: null, name: entry.name || `版本${versions.length + 1}`, category: "", isDefault: false }];
        setVersions(next);
        pointsByVersionRef.current[next.length - 1] = entry.points;
        return next.length - 1;
      };

      if (usingFiles) {
        const activeEmpty = pointsOfVersion(activeVersionIndex).length === 0 && !knowledgeSummary.trim();
        // 多檔必問；單檔喺 active 已有內容時都要問（開新版本／覆蓋當前／加進現有），
        // 第一次上傳（active 空）照舊直接解析唔煩。
        if (files.length >= 2 || (files.length === 1 && !activeEmpty)) {
          // 分配方式對話框（提取開始前，唔燒 API）
          const mode = await new Promise<AssignmentMode | null>((resolve) => {
            assignmentResolveRef.current = resolve;
            setAssignmentFileNames(files.map((file) => file.name));
            setAssignmentOpen(true);
          });
          if (!mode) {
            setStatus("idle");
            setProgress(0);
            return;
          }
          if (mode.kind === "each") {
            const results = [];
            for (const file of files) {
              const result = await processSingleFile(file);
              const parsed = parseKnowledgeReply(result.reply || "", previousPointsRef.current);
              results.push({ ...parsed, name: file.name.replace(/\.[^.]+$/, "") });
            }
            const created = await appendVersions(results);
            showCompletionFeedback(created, uiTemplate("已建立 {0} 個主題分頁", created.length));
            return;
          }
          if (mode.kind === "merge-new") {
            const entryName = files[0].name.replace(/\.[^.]+$/, "");
            const result = await processFiles(files);
            const parsed = parseKnowledgeReply(result.reply || "", previousPointsRef.current);
            const created = await appendVersions([{ ...parsed, name: entryName }]);
            showCompletionFeedback(created, uiTemplate("已合併成新版本「{0}」", entryName || versions[activeVersionIndex]?.name || ""));
            return;
          }
          if (mode.kind === "replace-active") {
            const baseName = files[0].name.replace(/\.[^.]+$/, "");
            const wasPlaceholder = versions[activeVersionIndex]?.name.startsWith("版本");
            const result = await processFiles(files);
            const parsed = parseKnowledgeReply(result.reply || "", previousPointsRef.current);
            applySingle(parsed, baseName);
            const resultName = wasPlaceholder ? baseName : versions[activeVersionIndex]?.name || baseName;
            showCompletionFeedback([activeVersionIndex], uiTemplate("已更新「{0}」", resultName));
            return;
          }
          // merge-existing：逐檔提取 → 合併入揀咗嗰個版本
          const targetIndex = mode.targetIndex;
          let merged: KnowledgePoint[] = [...pointsOfVersion(targetIndex)];
          for (const file of files) {
            const result = await processSingleFile(file);
            const parsed = parseKnowledgeReply(result.reply || "", merged);
            merged = trimKnowledgePoints(mergeKnowledgePoints(merged, parsed.points));
          }
          pointsByVersionRef.current[targetIndex] = merged;
          const target = versions[targetIndex];
          if (target?.id) {
            await persistVersionPatch(target, { knowledgeContent: buildVersionKnowledgeContent(merged) });
          }
          setActiveVersionIndex(targetIndex);
          setKnowledgePoints(merged);
          setKnowledgeSummary(buildKnowledgeSummary(merged));
          setFiles([]);
          setProgress(100);
          setStatus("complete");
          setActiveTab("map");
          showCompletionFeedback([targetIndex], uiTemplate("已合併入「{0}」", target?.name || uiText("現有版本")));
          return;
        }
        const baseName = files[0].name.replace(/\.[^.]+$/, "");
        const wasPlaceholder = versions[activeVersionIndex]?.name.startsWith("版本");
        const result = await processFiles(files);
        const parsed = parseKnowledgeReply(result.reply || "", previousPointsRef.current);
        applySingle(parsed, baseName);
        showCompletionFeedback([activeVersionIndex], uiTemplate("已填入「{0}」", wasPlaceholder ? baseName : versions[activeVersionIndex]?.name || baseName));
        return;
      }

      let result;
      if (uploadMethod === "url") {
        result = await processUrl(inputValue.trim());
      } else {
        result = await processText(inputValue.trim());
      }
      const reply = result.reply || "";
      const parsed = parseKnowledgeReply(reply, previousPointsRef.current);
      const activeName = versions[activeVersionIndex]?.name || "版本一";
      applySingle(parsed);
      showCompletionFeedback([activeVersionIndex], uiTemplate("已填入「{0}」", activeName));
    } catch (error) {
      console.error("知識解析失敗:", error);
      setCharacterBackground("解析失敗，請重試。");
      setKnowledgeSummary("- 目前未能整理內容\n- 請檢查 API 設定或稍後重試");
      setKnowledgePoints([]);
      setProgress(100);
      setStatus("complete");
    }
  };

  const updateKnowledgePoint = (id: string, field: keyof KnowledgePoint, value: string | string[]) => {
    setKnowledgePoints((prev) => {
      const next = prev.map((point) =>
        point.id === id
          ? {
              ...point,
              [field]: value,
            }
          : point
      );
      setKnowledgeSummary(buildKnowledgeSummary(next));
      return next;
    });
  };

  const toggleKnowledgeTier = (id: string) => {
    setKnowledgePoints((prev) => {
      const next = prev.map((point) =>
        point.id === id
          ? {
              ...point,
              tier: (point.tier === "basic_fact" ? "deep_understanding" : "basic_fact") as KnowledgeTier,
            }
          : point
      );
      setKnowledgeSummary(buildKnowledgeSummary(next));
      return next;
    });
  };

  const removeKnowledgePoint = (id: string) => {
    setKnowledgePoints((prev) => {
      const next = prev.filter((point) => point.id !== id);
      setKnowledgeSummary(buildKnowledgeSummary(next));
      return next;
    });
  };

  const toggleKnowledgeCore = (id: string) => {
    setKnowledgePoints((prev) => {
      const next = prev.map((point) =>
        point.id === id ? { ...point, core: !point.core } : point
      );
      setKnowledgeSummary(buildKnowledgeSummary(next));
      return next;
    });
  };

  const handleAddKnowledgePoint = () => {
    const content = newPointContent.trim();
    if (!content) {
      showAlert({ title: "缺少內容", message: "請先輸入知識點內容。" });
      return;
    }
    const keywords = newPointKeywords
      .split(/[，,、]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);
    const nextPoint: KnowledgePoint = {
      // max+1 而唔係 length+1：刪咗中間嘅點之後 length 會細過最大號，會撞 id
      id: nextKnowledgePointId(knowledgePoints),
      tier: newPointTier,
      title: newPointTitle.trim() || createKnowledgeTitle(content, keywords),
      content,
      keywords,
      assessmentCriteria: newPointAssessment.trim(),
      core: true,
    };
    const nextPoints = normalizeKnowledgePoints([...knowledgePoints, nextPoint]);
    setKnowledgePoints(nextPoints);
    setKnowledgeSummary(buildKnowledgeSummary(nextPoints));
    setNewPointTitle("");
    setNewPointContent("");
    setNewPointKeywords("");
    setNewPointAssessment("");
  };

  const dottedBgStyle = {
    backgroundImage: "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.28) 1px, transparent 0)",
    backgroundSize: "18px 18px",
    backgroundPosition: "center",
  } as const;

  const startGraphPan = (event: React.MouseEvent<HTMLDivElement>) => {
    if (graphMode !== "pan") return;
    event.preventDefault();
    setDragState({
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: graphPan.x,
      originY: graphPan.y,
    });
  };

  const moveGraphPan = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.active || graphMode !== "pan") return;
    setGraphPan({
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY,
    });
  };

  const endGraphPan = () => {
    setDragState((prev) => ({ ...prev, active: false }));
  };

  const scrollGraphPan = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setGraphPan((prev) => ({
      x: prev.x - event.deltaX,
      y: prev.y - event.deltaY,
    }));
  };

  useEffect(() => {
    const viewport = graphViewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setGraphPan((prev) => ({
        x: prev.x - event.deltaX,
        y: prev.y - event.deltaY,
      }));
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [status, viewMode]);

  // --------------------------
  // 🔧 UI：輸入區域
  // --------------------------
  const renderFileDropzone = () => (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFileDrop(e.dataTransfer.files);
      }}
      className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl bg-slate-50"
    >
      <Icons.upload className="w-12 h-12 mb-4 text-slate-400" />
      <p className="font-semibold text-slate-600">{uiText("拖拽文件到此處")}</p>
      <label ref={fileInputLabelRef} className="mt-2 px-4 py-2 border rounded-lg bg-white cursor-pointer">{uiText("選擇文件")}<input
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFileDrop(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </label>
      <p className="mt-3 text-xs text-slate-500">{uiText("支援 PDF、DOC、DOCX；多個檔案可各自開分頁或合成一個（每隻 Bot 最多 4 個分頁）")}</p>
      {files.length > 0 ? (
        <div className="mt-4 w-full max-w-xl rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-700">{uiText("已選擇 ")}{files.length}{uiText(" 個文件")}</p>
          <div className="mt-2 space-y-2">
            {files.map((file, index) => (
              <div key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`${uiText("移除文件")} ${file.name}`}
                >
                  {uiText("移除")}
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleProcess}
            className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-bold text-white transition hover:bg-indigo-700"
          >
            {uiText("開始解析 ")}{files.length}{uiText(" 個文件")}
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderInputArea = () => {
    if (uploadMethod === "file") {
      return renderFileDropzone();
    }

    if (uploadMethod === "url") {
      return (
        <div className="flex items-center space-x-2">
           <input
              type="url"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            placeholder="https://example.com/knowledge-source"
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button
            onClick={handleProcess}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white"
          >{uiText("解析")}</button>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <textarea
          rows={5}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={uiText("貼上需要解析的內容…")}
          className="w-full p-4 border rounded-lg"
        />
        <button
          onClick={handleProcess}
          className="w-full py-2 rounded-lg bg-indigo-600 text-white"
        >{uiText("解析")}</button>
      </div>
    );
  };

  // --------------------------
  // 🔧 UI：AI 解析狀態
  // --------------------------
  const renderStatus = () => {
    if (status === "processing") {
      const steps = [
        { label: "資料解析", pct: 30 },
        { label: "重點抽取", pct: 60 },
        { label: "索引建立", pct: 85 },
        { label: "入庫完成", pct: 100 },
      ];
      const isDone = (pct: number) => progress >= pct;
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-gradient-to-br from-slate-50 to-blue-50 p-5">
            <h4 className="text-lg font-bold text-slate-800 mb-4">{uiText("正在為您提取知識庫內容...")}</h4>
            <div className="grid gap-4 md:grid-cols-[1fr_260px]">
              <div className="rounded-xl bg-white p-4 border shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-700">{uiText("系統處理進度")}</p>
                  <span className="text-sm font-bold text-blue-600">{progress}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
                <div className="mt-4 space-y-2">
                  {steps.map((s) => (
                    <div key={s.label} className="flex items-center justify-between text-sm">
                      <span className={`${isDone(s.pct) ? "text-emerald-700" : "text-slate-600"}`}>
                        {isDone(s.pct) ? "✓" : "•"} {uiText(s.label)}
                      </span>
                      <span className={`${isDone(s.pct) ? "text-emerald-700" : "text-slate-400"}`}>
                        {isDone(s.pct) ? uiText("已完成") : uiText("處理中")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-white p-4 border shadow-sm">
                <p className="text-sm font-semibold text-slate-700 mb-2">{uiText("實時處理日誌")}</p>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <p>{uiText("• 內容載入中...")}</p>
                  <p>{uiText("• 正在解析段落結構...")}</p>
                  <p>{uiText("• 正在抽取知識重點...")}</p>
                  <p>• 1-2 mins remaining</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (status === "complete") {
      const summaryLines = knowledgePoints.map((point) => point.content).filter(Boolean);
      const bgText = characterBackground.replace(/\s+/g, " ").trim();
      const nameMatch = bgText.match(/我(?:是|叫|係)\s*([^\s，。,.!！?？]{1,20})/);
      const traitLine =
        summaryLines.find((l) => /性格|特質|風格|個性|語氣/.test(l)) ||
        bgText.split(/[。.!！?？]/).find((l) => /性格|習慣|風格|個性|喜歡|擅長/.test(l || "")) ||
        "友善、專業、可互動";
      const abilityLine =
        summaryLines.find((l) => /擅長|能力|技能|會|可/.test(l)) ||
        "可根據知識庫進行對話回答";
      const knowledgeLine =
        summaryLines[0] || "已完成知識點抽取";
      const scenarioLine =
        summaryLines.find((l) => /適用|場景|應用|教學|客服|銷售/.test(l)) ||
        "聊天互動、教學解説、問答輔助";
      const basicFacts = knowledgePoints.filter((point) => point.tier === "basic_fact");
      const deepPoints = knowledgePoints.filter((point) => point.tier === "deep_understanding");

      const mindmapBranches = [
        { title: "人物名字", value: nameMatch?.[1] || "未明確命名" },
        { title: "人物性格", value: traitLine.replace(/【性格特質】/g, "").trim() },
        { title: "核心能力", value: abilityLine },
        { title: "關鍵知識", value: knowledgeLine },
        { title: "應用場景", value: scenarioLine },
      ];

      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-0">
          <section id="knowledge-content" className="scroll-mt-36 border-t border-slate-200 pt-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">02</span>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-950">{uiText("知識內容")}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{uiText("確認角色背景與摘要，再從關聯圖檢查知識結構。")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />{uiText("已完成提取")}</span>
                <button
                  type="button"
                  onClick={resetState}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  aria-label={uiText("清除並重新提取知識")}
                  title={uiText("重新提取")}
                >
                  <Icons.delete className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="mt-5 border-l-2 border-emerald-400 pl-3 text-xs font-semibold text-slate-500">{uiText("來源：")}{sourceLabel || uiText("未知來源")}
            </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-800">{uiText("人物背景設定")}</h3>
                <button
                  type="button"
                  onClick={() => setCharacterBackground("")}
                  disabled={!characterBackground.trim()}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {uiText("清除")}
                </button>
              </div>
              <textarea
                rows={6}
                value={characterBackground}
                onChange={(event) => setCharacterBackground(event.target.value)}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="mt-2 text-xs text-slate-400">{uiText("可直接修改，內容會自動保存到角色 Prompt。")}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-800">{uiText("知識庫摘要")}</h3>
                <button
                  type="button"
                  onClick={() => setKnowledgeSummary("")}
                  disabled={!knowledgeSummary.trim()}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {uiText("清除")}
                </button>
              </div>
              <textarea
                rows={6}
                value={knowledgeSummary}
                onChange={(event) => setKnowledgeSummary(event.target.value)}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="mt-2 text-xs text-slate-400">{uiText("可直接修改，內容會自動保存到知識庫 Prompt。")}</p>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black tracking-tight text-slate-950">{uiText("知識庫架構")}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{uiText("切換視圖檢查知識點分類；列表視圖可調整層級或刪除項目。")}</p>
              </div>
              <div className="flex items-center rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode("graph")}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 transition ${viewMode === "graph" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  <Icons.task className="h-4 w-4" />{uiText("關聯圖")}</button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 transition ${viewMode === "list" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  <Icons.clipboardList className="h-4 w-4" />{uiText("列表視圖")}</button>
              </div>
            </div>
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50/70 p-3 md:p-4">
              {viewMode === "graph" ? (
              <>
              <div className="hidden md:block overflow-hidden">
                <div
                  ref={graphViewportRef}
                  className={`relative h-[400px] w-full overflow-hidden overscroll-contain rounded-[24px] border border-slate-100 bg-white/80 px-10 py-8 ${
                    graphMode === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                  }`}
                  style={dottedBgStyle}
                  onMouseDown={startGraphPan}
                  onMouseMove={moveGraphPan}
                  onMouseUp={endGraphPan}
                  onMouseLeave={endGraphPan}
                  onWheel={scrollGraphPan}
                >
                  <div
                    className="absolute inset-0"
                    style={{ transform: `translate(${graphPan.x}px, ${graphPan.y}px)` }}
                  >
                  <svg
                    className="absolute inset-0 h-full w-full pointer-events-none"
                    viewBox="0 0 980 400"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="knowledgeFlowLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#93c5fd" />
                        <stop offset="100%" stopColor="#60a5fa" />
                      </linearGradient>
                      <linearGradient id="knowledgeFlowRight" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#d8b4fe" />
                        <stop offset="100%" stopColor="#a78bfa" />
                      </linearGradient>
                    </defs>
                    {basicFacts.slice(0, 5).map((point, index) => {
                      const y = 54 + index * 72;
                      return (
                        <path
                          key={`left-line-${point.id}`}
                          d={`M 462 200 C 406 200, 360 ${y}, 272 ${y}`}
                          stroke="url(#knowledgeFlowLeft)"
                          strokeWidth="3"
                          strokeDasharray="8 8"
                          fill="none"
                          strokeLinecap="round"
                        />
                      );
                    })}
                    {deepPoints.slice(0, 5).map((point, index) => {
                      const y = 54 + index * 72;
                      return (
                        <path
                          key={`right-line-${point.id}`}
                          d={`M 518 200 C 574 200, 620 ${y}, 706 ${y}`}
                          stroke="url(#knowledgeFlowRight)"
                          strokeWidth="3"
                          strokeDasharray="8 8"
                          fill="none"
                          strokeLinecap="round"
                        />
                      );
                    })}
                  </svg>

                  {basicFacts.slice(0, 5).map((point, index) => (
                    <div
                      key={point.id}
                      className="absolute left-[44px] w-[206px] rounded-[18px] border border-blue-100 bg-white px-4 py-3 shadow-[0_10px_24px_rgba(96,165,250,0.08)]"
                      style={{ top: `${22 + index * 72}px` }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(96,165,250,0.14)]" />
                        <div className="min-w-0">
                          <p className="text-[14px] font-black tracking-tight text-slate-900 line-clamp-1">{point.title}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="absolute left-1/2 top-1/2 flex h-[112px] w-[126px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[24px] border-2 border-indigo-300 bg-white px-3 text-center shadow-[0_12px_24px_rgba(99,102,241,0.14)]">
                    <Icons.brain className="h-7 w-7 text-indigo-500" />
                    <p className="mt-2 text-[9px] font-semibold tracking-[0.22em] text-slate-400">{uiText("中心節點")}</p>
                    <p className="mt-1 text-[13px] font-black leading-4 text-slate-900">{nameMatch?.[1] || uiText("人物")}</p>
                    <p className="text-[11px] font-bold text-slate-700">{uiText("（人物知識庫）")}</p>
                  </div>

                  {deepPoints.slice(0, 5).map((point, index) => (
                    <div
                      key={point.id}
                      className="absolute right-[44px] w-[206px] rounded-[18px] border border-violet-100 bg-white px-4 py-3 shadow-[0_10px_24px_rgba(167,139,250,0.1)]"
                      style={{ top: `${22 + index * 72}px` }}
                    >
                      <div className="flex items-start gap-3">
                        <Icons.lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                        <div className="min-w-0">
                          <p className="text-[14px] font-black tracking-tight text-slate-900 line-clamp-1">{point.title}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                  <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center rounded-full border border-slate-200 bg-white p-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
                    <button
                      type="button"
                      onClick={() => setGraphMode("select")}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                        graphMode === "select" ? "bg-indigo-100 text-indigo-600" : "text-slate-500 hover:bg-slate-100"
                      }`}
                      aria-label={uiText("選取模式")}
                    >
                      <Icons.pointer className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setGraphMode("pan")}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                        graphMode === "pan" ? "bg-indigo-100 text-indigo-600" : "text-slate-500 hover:bg-slate-100"
                      }`}
                      aria-label={uiText("拖動畫布")}
                    >
                      <Icons.hand className="h-5 w-5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGraphPan({ x: 0, y: 0 })}
                    className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-slate-50 hover:text-indigo-600"
                    aria-label={uiText("回正圖譜")}
                    title={uiText("回正圖譜")}
                  >
                    <Icons.rotate className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                <div className="rounded-[22px] border-2 border-indigo-200 bg-white px-4 py-4 text-center shadow-sm">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400">{uiText("中心節點")}</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{nameMatch?.[1] || uiText("人物")}</p>
                  <p className="text-sm font-semibold text-slate-600">{uiText("人物知識庫")}</p>
                </div>
                <div className="rounded-[20px] border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-sm font-black text-blue-900">{uiText("基礎事實")}</p>
                  <div className="mt-3 space-y-2">
                    {basicFacts.map((point) => (
                      <div key={point.id} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                        {point.title}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-violet-100 bg-violet-50/70 p-4">
                  <p className="text-sm font-black text-violet-900">{uiText("深度理解")}</p>
                  <div className="mt-3 space-y-2">
                    {deepPoints.map((point) => (
                      <div key={point.id} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                        {point.title}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </>
              ) : (
                <div className="space-y-8">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-blue-500" />
                      <h5 className="text-base font-black tracking-tight text-slate-900">{uiText("基礎事實 (")}{basicFacts.length}{uiText("個)")}</h5>
                    </div>
                    <div className="space-y-2.5">
                      {basicFacts.map((point) => (
                        <div key={point.id} className="relative rounded-[18px] border border-slate-200 bg-white px-4 py-3 pr-28 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                          <span className="absolute right-4 top-3 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{uiText("基礎事實")}</span>
                          <div className="flex items-start gap-3">
                            <div className="flex pt-1 text-slate-300">
                              <Icons.grip className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div>
                                <div>
                                  <p className="text-[15px] font-black tracking-tight text-slate-900">{point.title}</p>
                                  <p className="mt-0.5 text-[13px] text-slate-500">{point.content || point.assessmentCriteria || point.keywords.join("、") || uiText("尚未補充説明")}</p>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => toggleKnowledgeCore(point.id)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${point.core ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>{uiText("教學目標")}{point.core ? " ✓" : ""}</button>
                                <button type="button" onClick={() => toggleKnowledgeTier(point.id)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">{uiText("切換為深度理解")}</button>
                                <button type="button" onClick={() => removeKnowledgePoint(point.id)} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600">{uiText("刪除")}</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-violet-400" />
                      <h5 className="text-base font-black tracking-tight text-slate-900">{uiText("深度理解 (")}{deepPoints.length}{uiText("個)")}</h5>
                    </div>
                    <div className="space-y-2.5">
                      {deepPoints.map((point) => (
                        <div key={point.id} className="relative rounded-[18px] border border-violet-200 bg-white px-4 py-3 pr-28 shadow-[0_8px_20px_rgba(167,139,250,0.06)]">
                          <span className="absolute right-4 top-3 rounded-lg bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-600">{uiText("深度理解")}</span>
                          <div className="flex items-start gap-3">
                            <div className="flex pt-1 text-violet-300">
                              <Icons.grip className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[15px] font-black tracking-tight text-slate-900">{point.title}</p>
                                    <Icons.helpCircle className="h-3.5 w-3.5 text-violet-400" />
                                  </div>
                                  <p className="mt-0.5 text-[13px] text-slate-500">{point.content || point.assessmentCriteria || point.keywords.join("、") || uiText("尚未補充説明")}</p>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => toggleKnowledgeCore(point.id)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${point.core ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>{uiText("教學目標")}{point.core ? " ✓" : ""}</button>
                                <button type="button" onClick={() => toggleKnowledgeTier(point.id)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">{uiText("切換為基礎知識")}</button>
                                <button type="button" onClick={() => removeKnowledgePoint(point.id)} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600">{uiText("刪除")}</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          </section>

          <section id="add-knowledge-point" className="scroll-mt-36 border-t border-slate-200 pt-10">
            <div className="flex items-start gap-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">03</span>
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-950">{uiText("新增知識點")}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">{uiText("直接補充單一知識；新增後會立即出現在上方知識架構。")}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-5 rounded-2xl bg-slate-50/80 p-4 sm:p-5 md:grid-cols-12">
              <label className="block md:col-span-8">
                <span className="text-xs font-bold text-slate-700">{uiText("知識主題")}</span>
                <input
                  value={newPointTitle}
                  onChange={(e) => setNewPointTitle(e.target.value)}
                  placeholder={uiText("例如：人物背景")}
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </label>
              <fieldset className="md:col-span-4">
                <legend className="text-xs font-bold text-slate-700">{uiText("知識層級")}</legend>
                <div className="mt-2 flex min-h-11 gap-2">
                {([
                  { value: "basic_fact", label: "基礎事實" },
                  { value: "deep_understanding", label: "深度理解" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setNewPointTier(option.value)}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${newPointTier === option.value ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {uiText(option.label)}
                  </button>
                ))}
                </div>
              </fieldset>
              <label className="block md:col-span-12">
                <span className="text-xs font-bold text-slate-700">{uiText("關鍵詞")}</span>
                <input
                  value={newPointKeywords}
                  onChange={(e) => setNewPointKeywords(e.target.value)}
                  placeholder={uiText("以「、」或「,」分隔，3-5 個有辨識度的詞，例如：榫卯、凹凸")}
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
                <p className="mt-1 text-[11px] text-slate-400">{uiText("關鍵詞幫系統追蹤學生有冇學識（建議 3-5 個，留空都可以）")}</p>
              </label>
              <label className="block md:col-span-12">
                <span className="text-xs font-bold text-slate-700">{uiText("知識內容")}</span>
                <textarea
                  value={newPointContent}
                  onChange={(e) => setNewPointContent(e.target.value)}
                  rows={4}
                  placeholder={uiText("輸入完整説明，讓角色能準確理解並回答。")}
                  className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white p-3.5 text-sm leading-6 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </label>
              <label className="block md:col-span-12">
                <span className="text-xs font-bold text-slate-700">{uiText("評估準則")}<span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{uiText("選填")}</span></span>
                <textarea
                  value={newPointAssessment}
                  onChange={(e) => setNewPointAssessment(e.target.value)}
                  rows={2}
                  placeholder={uiText("例如：學生能正確指出三種榫卯結構嘅分別")}
                  className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white p-3.5 text-sm leading-6 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </label>
              <button type="button" onClick={handleAddKnowledgePoint} className="min-h-11 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white transition hover:bg-indigo-700 md:col-start-10 md:col-span-3">{uiText("新增知識點")}</button>
            </div>
          </section>

          {afterKnowledgePointEditor}

        </motion.div>
      );
    }

    return renderInputArea();
  };

  // --------------------------
  // 🔧 教學模擬預覽：用目前畫面設定即時砌知識庫（只讀，唔會儲存）
  // --------------------------
  const simulationKnowledgeBase = buildStoredKnowledgeBase({
    characterBackground,
    knowledgeSummary,
    knowledgePoints,
    personaProfile: [
      `【性格特質】${personalityTraits.join("、") || "未設定"}`,
      `【説話風格】${speakingStyle}`,
      `【答題策略】${answerMode}`,
    ].join("\n"),
  });

  // --------------------------
  // 🔧 Final Render
  // --------------------------
  return (
    <div className="space-y-8 animate-fade-in">
      {/* 內部三段導覽：教材來源／知識地圖／教學方式 */}
      <div className="flex w-fit rounded-2xl border border-slate-200 bg-slate-100 p-1">
        {SECTION_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-black transition ${
                active ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {uiText(tab.label)}
              {tab.id === "map" && knowledgePoints.length > 0 ? (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-indigo-100 text-indigo-600" : "bg-slate-200 text-slate-500"}`}>
                  {knowledgePoints.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === "teaching" && (
      <section id="character-foundation" className="scroll-mt-36">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">01</span>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">{uiText("角色基礎")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">{uiText("這些設定會套用到所有主題，維持角色個性與回答方式一致。")}</p>
          </div>
        </div>
        <div className="mt-6 border-t border-slate-200 pt-6">
          {/* 學科分類（必選 enum）：對接文件「學科分類建議」層 1 */}
          <p className="mb-3 text-xs font-bold text-slate-700">{uiText("學科分類 ")}<span className="ml-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">{uiText("必選")}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_OPTIONS.map((option) => {
              const active = subject === option.label || subject === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSubjectChange?.(option.label)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${active ? "bg-white" : ""}`}
                    // 色點由 utils/subjects.ts 派生；active 時整粒 pill 變實心 indigo（見上），色點轉白
                    style={active ? undefined : { backgroundColor: option.color }}
                  />
                  {uiText(option.label)}
                </button>
              );
            })}
          </div>
          {!subject && (
            <p className="mt-2 text-xs font-semibold text-amber-600">{uiText("請選擇學科分類，未選擇將無法完成設定")}</p>
          )}

          {/* 年級帶（選填）：只調難度（句長／詞彙／標點），不改變回覆語言 */}
          <p className="mb-3 mt-6 text-xs font-bold text-slate-700">{uiText("年級")}<span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{uiText("選填")}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {GRADE_BANDS.map((band) => {
              const active = grade === band.value;
              return (
                <button
                  key={band.value}
                  type="button"
                  onClick={() => onGradeChange?.(active ? "" : band.value)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {uiText(band.label)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {uiText("設定年級後，AI 會自動調整句子長度與用字難度，適用於粵語、普通話及英語回覆。留空則保留預設回覆風格。")}
          </p>

          <p className="mb-3 mt-6 text-xs font-bold text-slate-700">{uiText("角色性格（可多選）")}</p>
          <div className="flex flex-wrap gap-2">
            {["耐心", "嚴謹", "幽默", "温柔", "直接", "理性", "熱情", "活潑"].map((trait) => (
              <button
                key={trait}
                type="button"
                onClick={() =>
                  setPersonalityTraits((prev) =>
                    prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]
                  )
                }
                className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                  personalityTraits.includes(trait)
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {uiText(trait)}
              </button>
            ))}
          </div>
        <div className="mt-6">
          <p className="mb-3 text-xs font-bold text-slate-700">{uiText("説話風格")}</p>
          <div className="flex flex-wrap gap-2">
            {["文言文", "西洋", "口語", "引導式", "正式", "親切對話", "簡潔"].map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setSpeakingStyle(style)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  speakingStyle === style
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {uiText(style)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-1 text-xs font-bold text-slate-700">{uiText("回答模式")}</p>
          <p className="mb-3 text-xs leading-5 text-slate-500">{uiText("回答模式決定 Bot 怎樣教，亦決定幾時記錄學習進度。")}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {ANSWER_MODE_OPTIONS.map((option) => {
              const active = answerMode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => setAnswerMode(option.mode)}
                  aria-pressed={active}
                  className={`flex h-full flex-col items-start gap-2 rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-indigo-600 bg-indigo-50/60 shadow-sm ring-2 ring-indigo-100"
                      : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ${
                      active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-transparent"
                    }`}>✓</span>
                    <span className="text-sm font-black text-slate-900">{uiText(option.mode)}</span>
                  </span>
                  <span className="text-xs font-bold text-slate-600">{uiText(option.description)}</span>
                  <span className="text-[11px] leading-5 text-slate-500">{uiText(option.detail)}</span>
                  <span className={`mt-auto rounded-md px-2 py-1 text-[10px] font-bold ${
                    active ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                  }`}>{uiText(option.coverage)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <TeachingSimulationPanel
          knowledgeBase={simulationKnowledgeBase}
          securityPrompt={securityPrompt}
          botName={botName}
        />
        </div>
      </section>
      )}

      {activeTab === "source" && (
        <div className="space-y-8">
      {status === "idle" && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-sm font-bold text-slate-800">{uiText("知識提取模型")}</p>
            <p className="mt-1 text-xs text-slate-500">{uiText("提取前可先選擇要使用的模型")}</p>
          </div>
          <div className="rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
            Gemini
          </div>
        </div>
      )}

      {/* Upload method tabs */}
      {status === "idle" && (
        <div className="bg-slate-100 p-1 rounded-xl flex items-center">
          {["file", "url", "text"].map((m) => (
            <button
              key={m}
              onClick={() => setUploadMethod(m as UploadMethod)}
              className={`w-full py-2 px-4 text-sm rounded-lg font-semibold ${
                uploadMethod === m ? "bg-white shadow text-indigo-600" : "text-slate-500"
              }`}
            >
              {m === "file" ? uiText("上傳文件") : m === "url" ? uiText("導入網址") : uiText("貼上文字")}
            </button>
          ))}
        </div>
      )}

      {status === "complete" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-center">
            <p className="text-sm font-bold text-emerald-800">{uiText("知識點已抽取完成")}</p>
            <p className="mt-1 text-xs text-emerald-700">{uiText("可以到「知識地圖」檢查知識點及調整教學目標。")}</p>
            <button type="button" onClick={() => setActiveTab("map")} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700">{uiText("前往知識地圖")}</button>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-slate-600">{uiText("再上傳更多教材")}</p>
            {renderFileDropzone()}
          </div>
        </div>
      ) : (
        <div className="min-h-[180px]">{renderStatus()}</div>
      )}
        </div>
      )}

      {activeTab === "map" && (
        <div className="space-y-8">
          {toastMessage ? (
            <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 shadow-sm">
              <span>✓</span>{toastMessage}
            </div>
          ) : null}
          <TopicVersionTabs
            versions={versions}
            activeIndex={activeVersionIndex}
            maxVersions={maxVersions}
            customLabels={customLabels}
            highlightIndexes={highlightIndexes}
            onUploadMore={handleUploadMore}
            onSelect={(index) => void handleSelectVersion(index)}
            onAdd={() => void handleAddVersion()}
            onRemove={(index) => void handleRemoveVersion(index)}
            onRename={(index, name) => void handleRenameVersion(index, name)}
            onCategoryChange={(index, category) => void handleCategoryChange(index, category)}
            onReorder={handleReorder}
            onAddCustomLabel={(label) => void handleAddCustomLabel(label)}
            onSetDefault={(index) => void handleSetDefault(index)}
          />
          {status === "complete" ? renderStatus() : (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-14 text-center">
              <p className="text-sm font-black text-slate-700">{uiText("尚未抽取知識點")}</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{uiText("請先到「教材來源」上傳教材並開始解析，抽取完成後知識點會顯示在這裡。")}</p>
              <button type="button" onClick={() => setActiveTab("source")} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700">{uiText("前往教材來源")}</button>
            </div>
          )}
        </div>
      )}

      <AssignmentModeDialog
        open={assignmentOpen}
        fileNames={assignmentFileNames}
        existingVersionNames={versions.map((version) => version.name)}
        activeVersionIndex={activeVersionIndex}
        activeVersionEmpty={pointsOfVersion(activeVersionIndex).length === 0 && !knowledgeSummary.trim()}
        maxVersions={maxVersions}
        onConfirm={(mode) => {
          setAssignmentOpen(false);
          assignmentResolveRef.current?.(mode);
          assignmentResolveRef.current = null;
        }}
        onCancel={() => {
          setAssignmentOpen(false);
          assignmentResolveRef.current?.(null);
          assignmentResolveRef.current = null;
        }}
      />

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
