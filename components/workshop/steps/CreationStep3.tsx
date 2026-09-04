import { uiText, uiTemplate } from '../../../utils/uiI18n';
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icons } from "../../icons";
import { BackgroundEditor } from "../editor/BackgroundEditor";
import type { FeatureEntitlement } from "../../../hooks/useFeatureEntitlements";
import { usePlatformDialog } from "../../../hooks/usePlatformDialog";
import { PlatformDialog } from "../../system/PlatformDialog";
import { API_BASE } from "../../../utils/api";

interface CreationStep3Props {
  updateConfig: (key: "avatarUrl" | "background", value: string) => void;
  botConfig: { avatarUrl: string; background: string };
  avatarAiFeature?: FeatureEntitlement;
  backgroundAiFeature?: FeatureEntitlement;
}

const presetAvatars = [
  "/avatars/avatar-1.svg",
  "/avatars/avatar-2.svg",
  "/avatars/avatar-3.svg",
  "/avatars/avatar-4.svg",
];

const mockStyles = {
  寫實風格:
    "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=800&q=80",
  手繪風格:
    "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=400&q=80",
  卡通風格:
    "https://images.unsplash.com/photo-1606112219348-204d7d8b94ee?w=600&q=80",
};

  async function saveBackground(blobUrl: any) {
    try {
      const file = await fetch(blobUrl).then(r => r.blob());
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/api/upload-image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data?.url) return data.url; // 永久 URL
      throw new Error("upload-image 無回傳 url");
    } catch (error) {
      // 上傳失敗（如預覽無後端）→ 回退本地 blob URL，保證流程可繼續
      console.warn("背景上傳失敗，改用本地預覽圖：", error);
      return blobUrl;
    }
  }


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

    // 🔥 真正上傳到後端（失敗回退本地預覽 URL，不阻斷流程）
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/api/upload-image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      console.log("🎯 Uploaded image URL:", data.url);
      onImageUploaded(data.url || previewUrl);
    } catch (error) {
      console.warn("頭像上傳失敗，改用本地預覽圖：", error);
      onImageUploaded(previewUrl);
    }
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
        <span className="text-sm text-slate-600">{uiText("點擊或拖曳圖片上傳")}</span>
        <span className="mt-1 text-xs text-slate-500 text-center">{uiText("建議使用 3D 全身角色圖片，效果會更自然。")}</span>
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </label>
    );
  };

/* -------------------------------------------
   ⭐ 主組件：CreationStep3（完整保留所有功能）
------------------------------------------- */
export const CreationStep3: React.FC<CreationStep3Props> = ({
  updateConfig,
  botConfig,
  avatarAiFeature,
  backgroundAiFeature,
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [avatarSource, setAvatarSource] =
    useState<"preset" | "upload">("preset");
  const { dialog, closeDialog, showAlert } = usePlatformDialog();

  const tabs = [
    { id: "preset", label: "預設角色" },
    { id: "upload", label: "上傳圖片" },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-[#1E293B]">{uiText("2. 形象與背景")}</h3>
        <p className="text-sm text-slate-500">{uiText("設定 AI 機器人的外觀和聊天背景，讓互動更具吸引力。")}</p>
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
            {uiText(tab.label)}
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

        </motion.div>
      </AnimatePresence>

      {/* 背景設定 */}
      <div className="pt-6">
        <h4 className="text-md font-bold text-[#1E293B] mb-3">{uiText("背景設定")}</h4>

        <div
          className="relative group cursor-pointer"
          onClick={() => {
            if (backgroundAiFeature?.locked) {
              showAlert({
                title: "背景生成已用完",
                message: backgroundAiFeature.upgradeMessage,
              });
              return;
            }
            setIsEditorOpen(true);
          }}
        >
          <img
            src={botConfig.background || "https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=2832&auto=format&fit=crop"}
            className={`w-full h-32 object-cover rounded-2xl ${backgroundAiFeature?.locked ? "grayscale opacity-70" : ""}`}
          />

          <div className={`absolute inset-0 flex items-center justify-center rounded-2xl ${backgroundAiFeature?.locked ? "bg-black/45" : "bg-black/30 group-hover:bg-black/50"}`}>
            <div className={`px-4 py-2 backdrop-blur-sm rounded-xl text-sm ${backgroundAiFeature?.locked ? "bg-white/25 text-white" : "bg-white/20 text-white"}`}>
              {backgroundAiFeature?.locked ? uiText("背景生成已用完") : uiText("編輯背景")}
            </div>
          </div>
        </div>
        {backgroundAiFeature && (
          <p className={`mt-2 text-xs ${backgroundAiFeature.locked ? "text-rose-600" : "text-slate-500"}`}>
            {backgroundAiFeature.unlimited
              ? uiTemplate("{0} 無限制", backgroundAiFeature.label)
              : `${backgroundAiFeature.label} ${backgroundAiFeature.used}/${backgroundAiFeature.limit}`}
          </p>
        )}
      </div>

      {isEditorOpen && !backgroundAiFeature?.locked && (
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
