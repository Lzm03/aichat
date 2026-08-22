import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Icons } from "../components/icons";
import { API_BASE } from "../utils/api";
import { isAuthPersistedInLocalStorage, readAuthSession, saveAuthSession, type StoredAuthUser } from "../utils/auth";
import { useFeatureEntitlements } from "../hooks/useFeatureEntitlements";
import { FeatureLimitPanel } from "../components/system/FeatureLimitPanel";
import { DEFAULT_ACCOUNT_AVATAR } from "../utils/default-avatar";

const defaultAvatars = [
  DEFAULT_ACCOUNT_AVATAR,
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Kai",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Nova",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Milo",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Jade",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Iris",
];

interface AccountPageProps {
  currentUser: StoredAuthUser;
  onProfileUpdated: (user: StoredAuthUser) => void;
}

export const AccountPage: React.FC<AccountPageProps> = ({ currentUser, onProfileUpdated }) => {
  const { features, refresh } = useFeatureEntitlements();
  const [fullName, setFullName] = useState(currentUser.fullName || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || defaultAvatars[0]);
  const [saving, setSaving] = useState(false);
  const [resettingUsage, setResettingUsage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function uploadAvatar(file: File) {
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/api/upload-image`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || "頭像上傳失敗");
      }
      setAvatarUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "頭像上傳失敗");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const session = readAuthSession();
      if (!session?.token) {
        throw new Error("登入狀態已失效，請重新登入");
      }

      const response = await fetch(`${API_BASE}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          avatarUrl: avatarUrl.trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.user) {
        throw new Error(data?.error || "帳户資料更新失敗");
      }

      saveAuthSession({ token: session.token, user: data.user }, isAuthPersistedInLocalStorage());
      onProfileUpdated(data.user);
      setMessage("帳户資料已更新");
    } catch (err) {
      setError(err instanceof Error ? err.message : "帳户資料更新失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetUsage() {
    const session = readAuthSession();
    if (!session?.token) {
      setError("登入狀態已失效，請重新登入");
      return;
    }

    setResettingUsage(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/auth/features/reset`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "重置使用次數失敗");
      }
      await refresh();
      setMessage("免費功能使用次數已重置");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置使用次數失敗");
    } finally {
      setResettingUsage(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
      <div className="rounded-[32px] border border-slate-200/80 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">帳户中心</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">更新你的頭像、名字和帳户基本資料。</p>
          </div>
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <Icons.back className="h-4 w-4" />
            返回工作台
          </a>
          <a href="/pro" className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">PRO 方案説明</a>
        </div>

        <form className="mt-8 grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]" onSubmit={handleSave}>
          <section className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
            <div className="text-sm font-bold text-slate-700">頭像</div>
            <div className="mt-5 flex flex-col items-center gap-4">
              <img
                src={avatarUrl || defaultAvatars[0]}
                alt="Account Avatar"
                className="h-28 w-28 rounded-full border-4 border-white object-cover shadow-lg"
              />
              <div className="grid w-full gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700"
                >
                  {uploading ? "上傳中..." : "上傳照片"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAvatar(file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <div className="w-full">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">默認頭像</div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {defaultAvatars.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAvatarUrl(preset)}
                      className={`rounded-2xl border p-1 transition ${
                        avatarUrl === preset ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"
                      }`}
                    >
                      <img src={preset} alt="Preset Avatar" className="h-16 w-16 rounded-xl object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">名字</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">電郵</span>
                <input
                  type="email"
                  value={currentUser.email}
                  disabled
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-500 outline-none"
                />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">角色</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{currentUser.role}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">套餐</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{currentUser.plan || "starter"}</div>
              </div>
            </div>

            {(error || message) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {error || message}
              </motion.div>
            )}

            <div className="flex justify-end">
              <div className="flex gap-3">
                {currentUser.email.trim().toLowerCase() === "lzm200303@gmail.com" && (
                  <button
                    type="button"
                    onClick={handleResetUsage}
                    disabled={resettingUsage}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-3 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resettingUsage ? "重置中..." : "重置使用次數"}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
                >
                  {saving ? "儲存中..." : "儲存帳户資料"}
                </button>
              </div>
            </div>
          </section>
        </form>
      </div>

      <div className="mt-6">
        <FeatureLimitPanel features={features} />
      </div>

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">聯絡我們</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          如果你希望提供產品意見、瞭解付費方案，或購買我們的機器人創建服務，可以直接聯絡我們。
        </p>
        <div className="mt-5">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</div>
            <div className="mt-2 text-base font-bold text-slate-900">Mandy@chopreality.com</div>
          </div>
        </div>
      </div>
    </div>
  );
};
