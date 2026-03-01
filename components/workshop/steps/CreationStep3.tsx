import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icons } from "../../icons";
import { BackgroundEditor } from "../editor/BackgroundEditor";

interface CreationStep3Props {
  updateConfig: (key: "avatarUrl" | "background", value: string) => void;
  botConfig: { avatarUrl: string; background: string };
}

const presetAvatars = [
  "https://api.dicebear.com/8.x/bottts/svg?seed=avatar1",
  "https://api.dicebear.com/8.x/bottts/svg?seed=avatar2",
  "https://api.dicebear.com/8.x/bottts/svg?seed=avatar3",
  "https://api.dicebear.com/8.x/bottts/svg?seed=avatar4",
];

const mockStyles = {
  寫實風格:
    "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=800&q=80",
  手繪風格:
    "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=400&q=80",
  卡通風格:
    "https://images.unsplash.com/photo-1606112219348-204d7d8b94ee?w=600&q=80",
};

  async function saveBackground(blobUrl:any) {
    const file = await fetch(blobUrl).then(r => r.blob());
    const formData = new FormData();
    formData.append("file", file);

    const baseUrl = import.meta.env.VITE_API_URL;
    const res = await fetch(`${baseUrl}/api/upload-image`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    return data.url;  // 永久 URL
  }

/* -------------------------------------------
   ⭐ Avatar Generator (AI 生成)
------------------------------------------- */
const AvatarGenerator: React.FC<{ onAvatarGenerated: (url: string) => void }> = ({
  onAvatarGenerated,
}) => {
  const [selectedStyle, setSelectedStyle] = useState("寫實風格");
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setPreviewImage(null);

    try {
      const fullPrompt = `${selectedStyle}: ${prompt}`;
      const baseUrl = import.meta.env.VITE_API_URL;

      const res = await fetch(`${baseUrl}/api/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt }),
      });

      const data = await res.json();

      if (!res.ok || !data.image) {
        console.error("Image generation API error:", data);
        return;
      }

      setPreviewImage(data.image);
      onAvatarGenerated(data.image);
    } catch (err) {
      console.error("Generation failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
      {(isGenerating || previewImage) && (
        <div className="relative w-full h-48 bg-slate-200 rounded-xl overflow-hidden flex items-center justify-center">
          {previewImage && (
            <img src={previewImage} className="w-full h-full object-cover" />
          )}

          {isGenerating && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center">
              <Icons.loading className="w-8 h-8 text-white animate-spin" />
              <p className="text-white text-sm mt-2">AI 形象生成中...</p>
            </div>
          )}
        </div>
      )}

      {/* 风格 */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">1. 風格選擇</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(mockStyles).map(([name, url]) => (
            <div
              key={name}
              onClick={() => setSelectedStyle(name)}
              className={`relative rounded-xl cursor-pointer ring-2 ${
                selectedStyle === name ? "ring-indigo-500" : "ring-transparent"
              }`}
            >
              <img src={url} className="w-full h-16 object-cover rounded-lg" />
              <div className="absolute inset-0 bg-black/30 rounded-lg"></div>
              <p className="absolute bottom-1 left-2 text-xs text-white font-bold">
                {name}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 提示詞 */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">2. 提示詞助手</p>
        <div className="relative">
          <Icons.wand className="absolute top-1/2 left-3 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：戴著眼鏡的學者"
            className="w-full pl-9 pr-3 py-2.5 bg-white rounded-lg text-sm border border-slate-300 focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 flex items-center justify-center space-x-2"
      >
        <Icons.sparkles className="w-4 h-4" />
        <span>{isGenerating ? "生成中..." : "開始生成"}</span>
      </button>
    </div>
  );
};

/* -------------------------------------------
   ⭐ Avatar Uploader（本地 + 實際 URL）
------------------------------------------- */
const AvatarUploader: React.FC<{ onImageUploaded: (url: string) => void }> = ({
  onImageUploaded,
}) => {
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.[0]) return;

    const file = event.target.files[0];

    // 🔥 前端預覽（可用）
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);

    // 🔥 真正上傳到後端
    const formData = new FormData();
    formData.append("file", file);

    const baseUrl = import.meta.env.VITE_API_URL;
    const res = await fetch(`${baseUrl}/api/upload-image`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    console.log("🎯 Uploaded image URL:", data.url);

    // 🔥 回傳後端可永久使用的 URL
    onImageUploaded(data.url);
  };

  return preview ? (
      <div className="relative w-48 h-48 mx-auto group">
        <img src={preview} className="w-full h-full object-cover rounded-full shadow-lg" />

        <button
          onClick={() => setPreview(null)}
          className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
        >
          <Icons.delete className="w-8 h-8 text-white" />
        </button>
      </div>
    ) : (
      <label className="w-full h-48 p-4 bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100">
        <Icons.upload className="w-8 h-8 text-slate-400" />
        <span className="text-sm text-slate-600">點擊或拖曳圖片上傳</span>
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </label>
    );
  };

/* -------------------------------------------
   ⭐ 主组件：CreationStep3（完整保留所有功能）
------------------------------------------- */
export const CreationStep3: React.FC<CreationStep3Props> = ({
  updateConfig,
  botConfig,
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [avatarSource, setAvatarSource] =
    useState<"preset" | "upload" | "generate">("preset");

  const tabs = [
    { id: "preset", label: "預設角色" },
    { id: "upload", label: "上傳圖片" },
    { id: "generate", label: "AI 生成" },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-[#1E293B]">2. 形象與背景</h3>
        <p className="text-sm text-slate-500">
          設定 AI 機器人的外觀和聊天背景，讓互動更具吸引力。
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-slate-100 p-1 rounded-xl flex items-center mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setAvatarSource(tab.id)}
            className={`w-full py-2 px-4 rounded-lg text-sm font-semibold ${
              avatarSource === tab.id
                ? "bg-white shadow-sm text-indigo-600"
                : "text-slate-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ⭐ 頭像預覽（正確使用 avatarUrl） */}
      <div className="flex justify-center mb-4">
        <img
          src={botConfig.avatarUrl}
          className="w-24 h-24 rounded-full shadow-lg border-2 border-white object-cover"
        />
      </div>

      {/* ⭐ 內容切換 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={avatarSource}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {avatarSource === "preset" && (
            <div className="grid grid-cols-4 gap-4">
              {presetAvatars.map((avatar) => (
                <img
                  key={avatar}
                  src={avatar}
                  className="w-24 h-24 rounded-full cursor-pointer hover:ring-4 hover:ring-indigo-300 transition-all p-2 bg-slate-100"
                  onClick={() => updateConfig("avatarUrl", avatar)}
                />
              ))}
            </div>
          )}

          {avatarSource === "upload" && (
            <AvatarUploader
              onImageUploaded={(url) => updateConfig("avatarUrl", url)}
            />
          )}

          {avatarSource === "generate" && (
            <AvatarGenerator
              onAvatarGenerated={(url) => updateConfig("avatarUrl", url)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* 背景設定 */}
      <div className="pt-6">
        <h4 className="text-md font-bold text-[#1E293B] mb-3">背景設定</h4>

        <div
          className="relative group cursor-pointer"
          onClick={() => setIsEditorOpen(true)}
        >
          <img
            src={botConfig.background || "https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=2832&auto=format&fit=crop"}
            className="w-full h-32 object-cover rounded-2xl"
          />

          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 flex items-center justify-center rounded-2xl">
            <div className="px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-xl text-sm">
              編輯背景
            </div>
          </div>
        </div>
      </div>

      {isEditorOpen && (
        <BackgroundEditor
          currentBackground={botConfig.background}
          onApply={async (localBlobUrl) => {
            const realUrl = await saveBackground(localBlobUrl);
            updateConfig("background", realUrl);
            setIsEditorOpen(false);
          }}
          onCancel={() => setIsEditorOpen(false)}
        />
      )}
    </div>
  );
};