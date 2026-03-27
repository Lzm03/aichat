"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Icons } from "../../icons";
import { motion } from "framer-motion";

type UploadMethod = "file" | "url" | "text";

interface CreationStep2Props {
  onGenerated: (data: {
    characterBackground: string;
    knowledgeSummary: string;
  }) => void;
}

export const CreationStep2: React.FC<CreationStep2Props> = ({ onGenerated }) => {
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>("file");
  const [file, setFile] = useState<File | null>(null);
  const [inputValue, setInputValue] = useState("");

  const [status, setStatus] = useState<"idle" | "processing" | "complete">(
    "idle"
  );

  const [characterBackground, setCharacterBackground] = useState("");
  const [knowledgeSummary, setKnowledgeSummary] = useState("");
  const [progress, setProgress] = useState(0);

  const baseUrl = import.meta.env.VITE_API_URL;

  // --------------------------
  // ⭐ 系統提示詞（深度分析 PDF）
  // --------------------------
  const systemPrompt = `
你是一個擅長分析 PDF / 文本資料的 AI，負責幫用戶將內容拆分為兩個部分：

【1】人物背景設定（Character Background）
- 用第一人稱寫（例如：我係 / 我平時會…）
- 3～6 句
- 自然、有角色感，不要逐字抄文件
- 像「可用於 AI 機器人」的人格描述

【2】人物知識庫摘要（Knowledge Summary）
- 用 4～10 條 bullet points
- 整理 PDF 中的：
  - 教學內容
  - 技能知識
  - 背景資料
  - 問答內容
  - 規則流程
  - 口語示例

⚠️ 請務必用以下格式輸出：

【人物背景設定】
<3～6 句>

【人物知識庫摘要】
- <重點 1>
- <重點 2>
- ...
`;

  const resetState = () => {
    setFile(null);
    setInputValue("");
    setCharacterBackground("");
    setKnowledgeSummary("");
    setStatus("idle");
    setProgress(0);
  };

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
  const handleFileDrop = useCallback((files: FileList | null) => {
    if (files && files.length > 0) {
      setFile(files[0]);
    }
  }, []);

  // --------------------------
  // 🔥 文件 → /api/ask-file
  // --------------------------
  const processFile = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("systemPrompt", systemPrompt);

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
    const bgMatch = reply.match(/【人物背景設定】([\s\S]*?)【人物知識庫摘要】/);
    const ksMatch = reply.match(/【人物知識庫摘要】([\s\S]*)/);

    let bg = bgMatch?.[1]?.trim() ?? "";
    let ks = ksMatch?.[1]?.trim() ?? "";

    // 容錯：模型沒完全按格式回覆時，仍然產生可用內容
    if (!bg && reply.trim()) {
      const firstBlock = reply.split("\n\n")[0]?.trim() || "";
      bg = firstBlock || "我會根據你提供的資料進行回答與整理。";
    }
    if (!ks && reply.trim()) {
      const lines = reply
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((l) => (l.startsWith("-") ? l : `- ${l}`));
      ks = lines.join("\n");
    }

    return { bg, ks };
  };

  // --------------------------
  // 🔥 主解析流程
  // --------------------------
  const handleProcess = async () => {
    if (uploadMethod === "file" && !file) return;
    if (uploadMethod !== "file" && !inputValue.trim()) return;

    setStatus("processing");
    setProgress(12);

    try {
      let result;
      if (uploadMethod === "file" && file) {
        result = await processFile(file);
      } else if (uploadMethod === "url") {
        result = await processUrl(inputValue.trim());
      } else {
        result = await processText(inputValue.trim());
      }

      const reply = result.reply || "";
      const { bg, ks } = parseKnowledgeReply(reply);

      setCharacterBackground(bg);
      setKnowledgeSummary(ks);
      onGenerated({ characterBackground: bg, knowledgeSummary: ks });
      setProgress(100);
      setStatus("complete");
    } catch (error) {
      console.error("知識解析失敗:", error);
      setCharacterBackground("解析失敗，請重試。");
      setKnowledgeSummary("- 目前未能整理內容\n- 請檢查 API 設定或稍後重試");
      setProgress(100);
      setStatus("complete");
    }
  };

  // --------------------------
  // 🔥 自動觸發 PDF 解析
  // --------------------------
  useEffect(() => {
    if (uploadMethod === "file" && file && status === "idle") {
      handleProcess();
    }
  }, [file]);

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
              className="hidden"
              onChange={(e) => handleFileDrop(e.target.files)}
            />
          </label>
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
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
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
          className="w-full py-2 bg-indigo-600 text-white rounded-lg"
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
      const summaryLines = knowledgeSummary
        .split("\n")
        .map((l) => l.replace(/^-+\s*/, "").trim())
        .filter(Boolean);
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

      const mindmapBranches = [
        { title: "人物名字", value: nameMatch?.[1] || "未明確命名" },
        { title: "人物性格", value: traitLine },
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
            <p className="mt-2 text-sm text-slate-600">
              來源：{uploadMethod === "file" ? file?.name : uploadMethod === "url" ? "網址內容" : "貼上文字"}
            </p>
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

          <div className="rounded-2xl border bg-white p-4">
            <h4 className="font-bold text-slate-800 mb-3">知識提取關聯圖</h4>
            <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-[#f8fbff] to-white p-4">
              <div className="hidden md:block pb-2 overflow-x-auto">
                <div className="relative h-[300px] w-[860px] min-w-[860px] rounded-xl mx-auto">
                  <svg
                    className="absolute inset-0 h-full w-full pointer-events-none"
                    viewBox="0 0 860 280"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="knowledgeFlowLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#93c5fd" />
                        <stop offset="100%" stopColor="#60a5fa" />
                      </linearGradient>
                      <linearGradient id="knowledgeFlowRight" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#818cf8" />
                      </linearGradient>
                    </defs>
                    <path d="M 388 140 C 332 140, 292 66, 210 66" stroke="url(#knowledgeFlowLeft)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    <path d="M 388 140 C 332 140, 292 214, 210 214" stroke="url(#knowledgeFlowLeft)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    <path d="M 472 140 C 536 140, 576 54, 650 54" stroke="url(#knowledgeFlowRight)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    <path d="M 472 140 C 536 140, 586 132, 650 132" stroke="url(#knowledgeFlowRight)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    <path d="M 472 140 C 536 140, 576 226, 650 226" stroke="url(#knowledgeFlowRight)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  </svg>

                  <div className="absolute left-[24px] top-[18px] w-[186px] min-h-[72px] rounded-xl border border-blue-100 bg-white p-2.5 shadow-sm">
                    <p className="text-xs font-semibold text-blue-700">{mindmapBranches[0].title}</p>
                    <p className="text-[13px] text-slate-700 leading-5 max-h-[84px] overflow-y-auto break-words whitespace-pre-wrap pr-1">
                      {mindmapBranches[0].value}
                    </p>
                  </div>

                  <div className="absolute left-[24px] top-[188px] w-[186px] min-h-[72px] rounded-xl border border-blue-100 bg-white p-2.5 shadow-sm">
                    <p className="text-xs font-semibold text-blue-700">{mindmapBranches[1].title}</p>
                    <p className="text-[13px] text-slate-700 leading-5 max-h-[84px] overflow-y-auto break-words whitespace-pre-wrap pr-1">
                      {mindmapBranches[1].value}
                    </p>
                  </div>

                  <div className="absolute left-1/2 top-1/2 w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white border-2 border-blue-300 shadow-lg px-2 py-3 text-center">
                    <p className="text-xs text-slate-500">中心主題</p>
                    <p className="text-base font-extrabold text-slate-800 leading-5">人物知識庫</p>
                    <p className="text-xs text-blue-600 mt-1 font-semibold">提取完成</p>
                  </div>

                  <div className="absolute right-[24px] top-[6px] w-[186px] min-h-[72px] rounded-xl border border-indigo-100 bg-white p-2.5 shadow-sm">
                    <p className="text-xs font-semibold text-indigo-700">{mindmapBranches[2].title}</p>
                    <p className="text-[13px] text-slate-700 leading-5 max-h-[84px] overflow-y-auto break-words whitespace-pre-wrap pr-1">
                      {mindmapBranches[2].value}
                    </p>
                  </div>

                  <div className="absolute right-[24px] top-[116px] w-[186px] min-h-[58px] rounded-xl border border-indigo-100 bg-white p-2.5 shadow-sm">
                    <p className="text-xs font-semibold text-indigo-700">{mindmapBranches[3].title}</p>
                    <p className="text-[13px] text-slate-700 leading-5 max-h-[64px] overflow-y-auto break-words whitespace-pre-wrap pr-1">
                      {mindmapBranches[3].value}
                    </p>
                  </div>

                  <div className="absolute right-[24px] top-[216px] w-[186px] min-h-[72px] rounded-xl border border-indigo-100 bg-white p-2.5 shadow-sm">
                    <p className="text-xs font-semibold text-indigo-700">{mindmapBranches[4].title}</p>
                    <p className="text-[13px] text-slate-700 leading-5 max-h-[84px] overflow-y-auto break-words whitespace-pre-wrap pr-1">
                      {mindmapBranches[4].value}
                    </p>
                  </div>
                </div>
              </div>

              <div className="md:hidden space-y-2.5">
                <div className="rounded-xl border-2 border-blue-300 bg-white px-3 py-2 text-center">
                  <p className="text-[11px] text-slate-500">中心主題</p>
                  <p className="text-sm font-bold text-slate-800">人物知識庫</p>
                </div>
                {mindmapBranches.map((b) => (
                  <div key={b.title} className="rounded-xl border border-slate-200 bg-white p-2.5">
                    <p className="text-[11px] font-semibold text-blue-700">{b.title}</p>
                    <p className="text-xs text-slate-600 leading-5">{b.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">
              系統已從知識庫自動篩選關鍵欄位，可直接用於聊天回覆。
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border">
            <h4 className="font-bold text-slate-800 mb-2">Preview & Activate</h4>
            <p className="text-sm text-slate-600">
              已完成知識提取，下一步可進入互動預覽並啟用對話。
            </p>
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
      <p className="text-sm text-slate-500">
        上傳文件、網址或內容，AI 將自動整理人物背景設定 + 知識庫摘要。
      </p>

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
    </div>
  );
};
