"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Icons } from "../../icons";
import { motion } from "framer-motion";
import { usePlatformDialog } from "../../../hooks/usePlatformDialog";
import { PlatformDialog } from "../../system/PlatformDialog";

type UploadMethod = "file" | "url" | "text";
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
}

export const CreationStep2: React.FC<CreationStep2Props> = ({ onGenerated, initialData }) => {
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>("file");
  const [modelProvider, setModelProvider] = useState<"deepseek" | "gemini">("deepseek");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [inputValue, setInputValue] = useState("");

  const [status, setStatus] = useState<"idle" | "processing" | "complete">(
    "idle"
  );
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
  const { dialog, closeDialog, showAlert } = usePlatformDialog();

  const baseUrl = import.meta.env.VITE_API_URL;

  // --------------------------
  // ⭐ 系統提示詞（深度分析 PDF）
  // --------------------------
  const systemPrompt = `
你是一個專業的教育內容結構化專家。你要閱讀用戶提供的文本、網址或文件內容，為一個可對話的教學角色抽取知識，並按認知層級分級。

【任務要求】
1. 先生成「人物背景設定」：
- 用第一人稱書寫
- 3 到 6 句
- 要自然、有角色感，不逐字照抄原文

2. 再生成最多 8 個核心知識點，並分成兩個層級：
- 盡量保持 "basic_fact" 4 個、"deep_understanding" 4 個
- "basic_fact"：客觀事實、時間、地點、定義、名稱，偏向記憶與識別
- "deep_understanding"：動機、因果、背景、影響、評價，偏向分析與解釋

3. 每個知識點都要包含：
- id：kp_001 這類遞增編號
- tier：只能是 "basic_fact" 或 "deep_understanding"
- title：8 到 14 個字的知識主題，不要直接複製完整長句
- content：知識點內容
- keywords：2 到 5 個關鍵詞
- assessment_criteria：一句可用於判斷學生是否掌握的標準

【輸出要求】
只能輸出合法 JSON，不能輸出 Markdown，不能輸出解釋。
JSON 必須符合以下結構：
{
  "character_name": "角色名",
  "character_background": "第一人稱背景設定",
  "knowledge_points": [
    {
      "id": "kp_001",
      "tier": "basic_fact",
      "title": "知識主題",
      "content": "知識點內容",
      "keywords": ["關鍵詞1", "關鍵詞2"],
      "assessment_criteria": "評估標準"
    }
  ]
}
`;

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
    if (/性格|親切|懷舊|語速|粵語|口語|停頓詞/.test(cleaned)) return "說話風格";
    if (/興趣|飲茶|散步|觀察|遊樂場/.test(cleaned)) return "生活興趣";
    if (/對話|邀請|茶|食個包/.test(cleaned)) return "對話示例";
    return cleaned.split(/[，,。.!！?？]/)[0]?.slice(0, 14) || "知識主題";
  };

  const trimKnowledgePoints = (points: KnowledgePoint[]) => {
    const basicFacts = points.filter((point) => point.tier === "basic_fact").slice(0, MAX_POINTS_PER_TIER);
    const deepPoints = points.filter((point) => point.tier === "deep_understanding").slice(0, MAX_POINTS_PER_TIER);
    const combined = [...basicFacts, ...deepPoints].slice(0, MAX_KNOWLEDGE_POINTS);
    return combined.map((point, index) => ({
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
    };
  };

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

  useEffect(() => {
    setCharacterBackground(initialData?.characterBackground || "");
    setKnowledgeSummary(initialData?.knowledgeSummary || "");
    setKnowledgePoints(normalizeKnowledgePoints(initialData?.knowledgePoints || []));
    if (initialData?.characterBackground || initialData?.knowledgeSummary) {
      setStatus("complete");
      setProgress(100);
    }
  }, [initialData?.characterBackground, initialData?.knowledgeSummary, initialData?.knowledgePoints]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!(target instanceof Node)) return;
      if ((target as HTMLElement).closest?.("[data-model-menu-root='knowledge-feed']")) return;
      setShowModelMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!characterBackground.trim() && !knowledgeSummary.trim()) return;
    const personaProfile = [
      `【性格特質】${personalityTraits.join("、") || "未設定"}`,
      `【說話風格】${speakingStyle}`,
      `【答題策略】${answerMode}`,
    ].join("\n");
    onGenerated({ characterBackground, knowledgeSummary, personaProfile, knowledgePoints });
  }, [personalityTraits, speakingStyle, answerMode, characterBackground, knowledgeSummary, knowledgePoints]);

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
    setFiles(Array.from(nextFiles));
  }, []);

  // --------------------------
  // 🔥 文件 → /api/ask-file
  // --------------------------
  const processFiles = async (nextFiles: File[]) => {
    const form = new FormData();
    nextFiles.forEach((file) => {
      form.append("file", file);
    });
    form.append("systemPrompt", systemPrompt);
    form.append("modelProvider", modelProvider);

    const res = await fetch(`${baseUrl}/api/ask-file`, {
      method: "POST",
      body: form,
    });

    return await res.json();
  };

  // --------------------------
  // 🔥 URL / 文字 → /api/ask
  // --------------------------
  const processText = async (content: string) => {
    const res = await fetch(`${baseUrl}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemPrompt,
        userPrompt: content,
        stream: false,
        modelProvider,
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
        systemPrompt,
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

  const parseKnowledgeReply = (reply: string) => {
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
      const points = trimKnowledgePoints(parsed.knowledge_points
        .map((point: any, index: number) => normalizeKnowledgePoint(point, index))
        .filter(Boolean) as KnowledgePoint[]);
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
      points: cleanedLines,
    };
  };

  // --------------------------
  // 🔥 主解析流程
  // --------------------------
  const handleProcess = async () => {
    if (uploadMethod === "file" && files.length === 0) return;
    if (uploadMethod !== "file" && !inputValue.trim()) return;

    setStatus("processing");
    setProgress(12);

    try {
      const nextSourceLabel =
        uploadMethod === "file"
          ? `文件：${files.map((file) => file.name).join("、") || "未命名文件"}`
          : uploadMethod === "url"
          ? `Web URL：${inputValue.trim()}`
          : "Text";
      setSourceLabel(nextSourceLabel);

      let result;
      if (uploadMethod === "file" && files.length > 0) {
        result = await processFiles(files);
      } else if (uploadMethod === "url") {
        result = await processUrl(inputValue.trim());
      } else {
        result = await processText(inputValue.trim());
      }

      const reply = result.reply || "";
      const { bg, ks, points } = parseKnowledgeReply(reply);

      setCharacterBackground(bg);
      setKnowledgeSummary(ks);
      setKnowledgePoints(points);
      const personaProfile = [
        `【性格特質】${personalityTraits.join("、") || "未設定"}`,
        `【說話風格】${speakingStyle}`,
        `【答題策略】${answerMode}`,
      ].join("\n");
      onGenerated({ characterBackground: bg, knowledgeSummary: ks, personaProfile, knowledgePoints: points });
      setProgress(100);
      setStatus("complete");
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
      id: `kp_${String(knowledgePoints.length + 1).padStart(3, "0")}`,
      tier: newPointTier,
      title: newPointTitle.trim() || createKnowledgeTitle(content, keywords),
      content,
      keywords,
      assessmentCriteria: newPointAssessment.trim(),
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
  // 🔥 自動觸發文件解析
  // --------------------------
  useEffect(() => {
    if (uploadMethod === "file" && files.length > 0 && status === "idle") {
      handleProcess();
    }
  }, [files]);

  // --------------------------
  // 🔧 UI：輸入區域
  // --------------------------
  const renderInputArea = () => {
    if (uploadMethod === "file") {
      return (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFileDrop(e.dataTransfer.files);
          }}
          className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl bg-slate-50"
        >
          <Icons.upload className="w-12 h-12 mb-4 text-slate-400" />
          <p className="font-semibold text-slate-600">拖拽文件到此處</p>
          <label className="mt-2 px-4 py-2 border rounded-lg bg-white cursor-pointer">
            選擇文件
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              className="hidden"
              onChange={(e) => handleFileDrop(e.target.files)}
            />
          </label>
          <p className="mt-3 text-xs text-slate-500">支援 PDF、DOC、DOCX，可一次上傳多個文件</p>
          {files.length > 0 ? (
            <div className="mt-4 w-full max-w-xl rounded-xl bg-white/70 p-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-700">已選擇 {files.length} 個文件</p>
              <p className="mt-1 break-words">{files.map((file) => file.name).join("、")}</p>
            </div>
          ) : null}
        </div>
      );
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
          >
            解析
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <textarea
          rows={5}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="貼上需要解析的內容…"
          className="w-full p-4 border rounded-lg"
        />
        <button
          onClick={handleProcess}
          className="w-full py-2 rounded-lg bg-indigo-600 text-white"
        >
          解析
        </button>
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
            <h4 className="text-lg font-bold text-slate-800 mb-4">
              正在為您提取知識庫內容...
            </h4>
            <div className="grid gap-4 md:grid-cols-[1fr_260px]">
              <div className="rounded-xl bg-white p-4 border shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-700">系統處理進度</p>
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
                        {isDone(s.pct) ? "✓" : "•"} {s.label}
                      </span>
                      <span className={`${isDone(s.pct) ? "text-emerald-700" : "text-slate-400"}`}>
                        {isDone(s.pct) ? "已完成" : "處理中"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-white p-4 border shadow-sm">
                <p className="text-sm font-semibold text-slate-700 mb-2">實時處理日誌</p>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <p>• 內容載入中...</p>
                  <p>• 正在解析段落結構...</p>
                  <p>• 正在抽取知識重點...</p>
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
        "聊天互動、教學解說、問答輔助";
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-bold text-slate-800">提取成功</h4>
              <button onClick={resetState}>
                <Icons.delete className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">{sourceLabel || "未知來源"}</p>
            <div className="mt-3 h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full w-full bg-emerald-500" />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-emerald-50 p-4 rounded-xl border">
              <h4 className="font-bold text-emerald-800 mb-2">人物背景設定</h4>
              <textarea
                readOnly
                rows={8}
                value={characterBackground}
                className="w-full bg-white/70 p-3 rounded-lg border border-emerald-100"
              />
            </div>
            <div className="bg-blue-50 p-4 rounded-xl border">
              <h4 className="font-bold text-blue-800 mb-2">知識庫摘要</h4>
              <textarea
                readOnly
                rows={8}
                value={knowledgeSummary}
                className="w-full bg-white/70 p-3 rounded-lg border border-blue-100"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Knowledge Map</p>
                <h4 className="mt-1 text-[34px] leading-none font-black tracking-tight text-slate-900 md:text-[28px]">知識庫架構</h4>
              </div>
              <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1.5 text-sm font-semibold shadow-inner">
                <button
                  type="button"
                  onClick={() => setViewMode("graph")}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 ${viewMode === "graph" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                >
                  <Icons.task className="h-4 w-4" />
                  關聯圖
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 ${viewMode === "list" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                >
                  <Icons.clipboardList className="h-4 w-4" />
                  列表視圖
                </button>
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-gradient-to-b from-[#fbfcff] via-white to-[#f8fbff] p-4 md:p-6">
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
                    <p className="mt-2 text-[9px] font-semibold tracking-[0.22em] text-slate-400">中心節點</p>
                    <p className="mt-1 text-[13px] font-black leading-4 text-slate-900">{nameMatch?.[1] || "人物"}</p>
                    <p className="text-[11px] font-bold text-slate-700">（人物知識庫）</p>
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
                      aria-label="選取模式"
                    >
                      <Icons.pointer className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setGraphMode("pan")}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                        graphMode === "pan" ? "bg-indigo-100 text-indigo-600" : "text-slate-500 hover:bg-slate-100"
                      }`}
                      aria-label="拖動畫布"
                    >
                      <Icons.hand className="h-5 w-5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGraphPan({ x: 0, y: 0 })}
                    className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-slate-50 hover:text-indigo-600"
                    aria-label="回正圖譜"
                    title="回正圖譜"
                  >
                    <Icons.rotate className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                <div className="rounded-[22px] border-2 border-indigo-200 bg-white px-4 py-4 text-center shadow-sm">
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400">中心節點</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{nameMatch?.[1] || "人物"}</p>
                  <p className="text-sm font-semibold text-slate-600">人物知識庫</p>
                </div>
                <div className="rounded-[20px] border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-sm font-black text-blue-900">基礎事實</p>
                  <div className="mt-3 space-y-2">
                    {basicFacts.map((point) => (
                      <div key={point.id} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                        {point.title}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-violet-100 bg-violet-50/70 p-4">
                  <p className="text-sm font-black text-violet-900">深度理解</p>
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
                      <h5 className="text-base font-black tracking-tight text-slate-900">基礎事實 ({basicFacts.length}個)</h5>
                    </div>
                    <div className="space-y-2.5">
                      {basicFacts.map((point) => (
                        <div key={point.id} className="relative rounded-[18px] border border-slate-200 bg-white px-4 py-3 pr-28 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                          <span className="absolute right-4 top-3 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">基礎事實</span>
                          <div className="flex items-start gap-3">
                            <div className="flex pt-1 text-slate-300">
                              <Icons.grip className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div>
                                <div>
                                  <p className="text-[15px] font-black tracking-tight text-slate-900">{point.title}</p>
                                  <p className="mt-0.5 text-[13px] text-slate-500">{point.content || point.assessmentCriteria || point.keywords.join("、") || "尚未補充說明"}</p>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => toggleKnowledgeTier(point.id)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">切換為深度理解</button>
                                <button type="button" onClick={() => removeKnowledgePoint(point.id)} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600">刪除</button>
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
                      <h5 className="text-base font-black tracking-tight text-slate-900">深度理解 ({deepPoints.length}個)</h5>
                    </div>
                    <div className="space-y-2.5">
                      {deepPoints.map((point) => (
                        <div key={point.id} className="relative rounded-[18px] border border-violet-200 bg-white px-4 py-3 pr-28 shadow-[0_8px_20px_rgba(167,139,250,0.06)]">
                          <span className="absolute right-4 top-3 rounded-lg bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-600">深度理解</span>
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
                                  <p className="mt-0.5 text-[13px] text-slate-500">{point.content || point.assessmentCriteria || point.keywords.join("、") || "尚未補充說明"}</p>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => toggleKnowledgeTier(point.id)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">切換為基礎知識</button>
                                <button type="button" onClick={() => removeKnowledgePoint(point.id)} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600">刪除</button>
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

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="font-bold text-slate-800">手動新增知識點</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input
                value={newPointTitle}
                onChange={(e) => setNewPointTitle(e.target.value)}
                placeholder="知識主題，例如：人物背景"
                className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"
              />
              <div className="md:col-span-2">
                <textarea value={newPointContent} onChange={(e) => setNewPointContent(e.target.value)} rows={3} placeholder="補充說明，輸入完整知識點內容" className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" />
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: "basic_fact", label: "基礎事實" },
                  { value: "deep_understanding", label: "深度理解" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setNewPointTier(option.value)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${newPointTier === option.value ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={handleAddKnowledgePoint} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                新增知識點
              </button>
            </div>
          </div>

        </motion.div>
      );
    }

    return renderInputArea();
  };

  // --------------------------
  // 🔧 Final Render
  // --------------------------
  return (
    <div className="space-y-6 animate-fade-in">
      <h3 className="text-xl font-bold">4. 知識餵養</h3>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-bold text-slate-800">性格特質</h4>
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">角色性格（可多選）</p>
          <div className="flex flex-wrap gap-2">
            {["耐心", "嚴謹", "幽默", "溫柔", "直接", "理性", "熱情", "活潑"].map((trait) => (
              <button
                key={trait}
                type="button"
                onClick={() =>
                  setPersonalityTraits((prev) =>
                    prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  personalityTraits.includes(trait)
                    ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {trait}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-700">說話風格</p>
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
              {["文言文", "西洋", "口語", "引導式", "正式", "親切對話", "簡潔"].map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setSpeakingStyle(style)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    speakingStyle === style
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-700">回答模式</p>
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
              {["直接給答案", "引導後再回答", "不直接給答案"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAnswerMode(mode)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    answerMode === mode
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {status === "idle" && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-sm font-bold text-slate-800">知識提取模型</p>
            <p className="mt-1 text-xs text-slate-500">提取前可先選擇要使用的模型</p>
          </div>
          <div className="relative" data-model-menu-root="knowledge-feed">
            <button
              type="button"
              onClick={() => setShowModelMenu((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
            >
              <span>{modelProvider === "deepseek" ? "DeepSeek" : "Gemini"}</span>
              <span className={`transition-transform ${showModelMenu ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {showModelMenu ? (
              <div className="absolute right-0 top-full z-20 mt-2 min-w-[128px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
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
                      className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                        active ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"
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
              {m === "file" ? "上傳文件" : m === "url" ? "導入網址" : "貼上文字"}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-[180px]">{renderStatus()}</div>
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
