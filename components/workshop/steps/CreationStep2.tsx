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
  };

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
      }),
    });

    return await res.json();
  };

  // --------------------------
  // 🔥 主解析流程
  // --------------------------
  const handleProcess = async () => {
    if (uploadMethod === "file" && !file) return;
    if (uploadMethod !== "file" && !inputValue.trim()) return;

    setStatus("processing");

    let result;
    if (uploadMethod === "file" && file) {
      result = await processFile(file);
    } else {
      result = await processText(inputValue.trim());
    }

    const reply = result.reply || "";

    // --------------------------
    // 🔍 自動解析 block
    // --------------------------
    const bgMatch = reply.match(/【人物背景設定】([\s\S]*?)【人物知識庫摘要】/);
    const ksMatch = reply.match(/【人物知識庫摘要】([\s\S]*)/);

    const bg = bgMatch?.[1]?.trim() ?? "";
    const ks = ksMatch?.[1]?.trim() ?? "";

    setCharacterBackground(bg);
    setKnowledgeSummary(ks);

    onGenerated({ characterBackground: bg, knowledgeSummary: ks });

    setStatus("complete");
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
      return (
        <div className="p-8 bg-indigo-50 rounded-2xl text-center border">
          <Icons.brain className="w-10 h-10 mx-auto text-indigo-600 animate-pulse" />
          <p className="mt-3 font-semibold text-indigo-700">
            AI 正在分析內容…
          </p>
        </div>
      );
    }

    if (status === "complete") {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Source block */}
          <div className="bg-slate-50 p-4 rounded-xl flex justify-between border">
            <p className="text-sm font-medium text-slate-700">
              來源：{uploadMethod === "file" ? file?.name : "內容"}
            </p>
            <button onClick={resetState}>
              <Icons.delete className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Background */}
          <div className="bg-emerald-50 p-4 rounded-xl border">
            <h4 className="font-bold text-emerald-800 mb-2">✨ 人物背景設定</h4>
            <textarea
              readOnly
              rows={4}
              value={characterBackground}
              className="w-full bg-white/60 p-2 rounded-lg"
            />
          </div>

          {/* Knowledge Summary */}
          <div className="bg-blue-50 p-4 rounded-xl border">
            <h4 className="font-bold text-blue-800 mb-2">📚 知識庫摘要</h4>
            <textarea
              readOnly
              rows={6}
              value={knowledgeSummary}
              className="w-full bg-white/60 p-2 rounded-lg"
            />
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