import React, { useEffect, useMemo, useRef, useState } from "react";
import { PlatformDialog } from "../components/system/PlatformDialog";
import { usePlatformDialog } from "../hooks/usePlatformDialog";
import { API_BASE } from "../utils/api";
import {
  isAuthPersistedInLocalStorage,
  readAuthSession,
  saveAuthSession,
  type StoredAuthUser,
} from "../utils/auth";
import {
  DEFAULT_USER_PREFERENCES,
  normalizeUserPreferences,
  type BackgroundStyle,
  type CardStyle,
  type ThemeMode,
  type UserPreferences,
} from "../utils/userPreferences";

type ManagedFeature = {
  key: string;
  label: string;
  limit: number;
  used: number;
  remaining: number | null;
  locked: boolean;
  unlimited?: boolean;
  countUnit: string;
};

type ManagedAccount = {
  user: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string;
    role: string;
    plan?: string;
  };
  features: ManagedFeature[];
};

const backgroundChoices: Array<{ value: BackgroundStyle; label: string; hint: string }> = [
  { value: "sky", label: "天空藍", hint: "乾淨、明亮、偏產品感" },
  { value: "paper", label: "米紙白", hint: "柔和、通用、閱讀友好" },
  { value: "forest", label: "森林綠", hint: "穩定、自然、偏教育感" },
  { value: "sunset", label: "暖日落", hint: "更有溫度、偏品牌感" },
  { value: "slate", label: "霧灰", hint: "低調、專業、偏工作台" },
];

const themeChoices: Array<{ value: ThemeMode; label: string }> = [
  { value: "light", label: "明亮" },
  { value: "warm", label: "暖色" },
  { value: "midnight", label: "深夜" },
];

const cardChoices: Array<{ value: CardStyle; label: string }> = [
  { value: "soft", label: "柔和卡片" },
  { value: "glass", label: "玻璃感" },
];

interface SettingsPageProps {
  currentUser: StoredAuthUser;
  onProfileUpdated: (user: StoredAuthUser) => void;
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{desc}</div>
    </div>
  );
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ currentUser, onProfileUpdated }) => {
  const { dialog, closeDialog, showConfirm } = usePlatformDialog();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fullName, setFullName] = useState(currentUser.fullName || "");
  const [email, setEmail] = useState(currentUser.email || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || "");
  const [preferences, setPreferences] = useState<UserPreferences>(
    normalizeUserPreferences(currentUser.preferences || DEFAULT_USER_PREFERENCES)
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [featureDrafts, setFeatureDrafts] = useState<Record<string, { used: string; limit: string }>>({});
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState("");
  const [newAccountFullName, setNewAccountFullName] = useState("");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [newAccountRole, setNewAccountRole] = useState<"teacher" | "student" | "admin">("teacher");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isDeveloperAccount = currentUser.email.trim().toLowerCase() === "lzm200303@gmail.com";

  useEffect(() => {
    setFullName(currentUser.fullName || "");
    setEmail(currentUser.email || "");
    setAvatarUrl(currentUser.avatarUrl || "");
    setPreferences(normalizeUserPreferences(currentUser.preferences || DEFAULT_USER_PREFERENCES));
  }, [currentUser]);

  async function loadAccounts() {
    const session = readAuthSession();
    if (!session?.token || !isDeveloperAccount) return;
    setLoadingAccounts(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin/accounts`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "載入帳戶失敗");
      const next = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(next);
      if (!selectedUserId && next[0]?.user?.id) setSelectedUserId(next[0].user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入帳戶失敗");
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    if (isDeveloperAccount) {
      void loadAccounts();
    }
  }, [isDeveloperAccount]);

  const selectedAccount = useMemo(
    () => accounts.find((item) => item.user.id === selectedUserId) || null,
    [accounts, selectedUserId]
  );

  useEffect(() => {
    if (!selectedAccount) {
      setFeatureDrafts({});
      return;
    }

    const nextDrafts: Record<string, { used: string; limit: string }> = {};
    for (const feature of selectedAccount.features) {
      nextDrafts[feature.key] = {
        used: String(feature.used),
        limit: String(feature.limit),
      };
    }
    setFeatureDrafts(nextDrafts);
  }, [selectedAccount]);

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
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
      setMessage("頭像已更新，記得按儲存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "頭像上傳失敗");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveAll() {
    const session = readAuthSession();
    if (!session?.token) {
      setError("登入狀態已失效，請重新登入");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError("新密碼與確認密碼不一致");
      return;
    }

    setSavingProfile(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          avatarUrl: avatarUrl.trim(),
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
          preferences,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.user) {
        throw new Error(data?.error || "設定更新失敗");
      }

      saveAuthSession({ token: session.token, user: data.user }, isAuthPersistedInLocalStorage());
      onProfileUpdated(data.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("設定已更新");
    } catch (err) {
      setError(err instanceof Error ? err.message : "設定更新失敗");
    } finally {
      setSavingProfile(false);
    }
  }

  async function resetFeatures(userId: string) {
    const session = readAuthSession();
    if (!session?.token) return;
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin/accounts/${userId}/reset-features`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "重置失敗");
      setAccounts((prev) => prev.map((item) => (item.user.id === userId ? { ...item, features: data.features } : item)));
      setMessage("已重置該帳戶的使用次數");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失敗");
    }
  }

  async function updateFeature(userId: string, featureKey: string, used: number, limit: number) {
    const session = readAuthSession();
    if (!session?.token) return;
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin/accounts/${userId}/features/${featureKey}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ used }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "更新失敗");
      setAccounts((prev) => prev.map((item) => (item.user.id === userId ? { ...item, features: data.features } : item)));
      setMessage(`已更新 ${featureKey} 使用次數（上限 ${limit}）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    }
  }

  async function updateFeatureLimit(userId: string, featureKey: string, limit: number) {
    const session = readAuthSession();
    if (!session?.token) return;
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin/accounts/${userId}/features/${featureKey}/limit`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ limit }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "更新上限失敗");
      setAccounts((prev) => prev.map((item) => (item.user.id === userId ? { ...item, features: data.features } : item)));
      setMessage(`已更新 ${featureKey} 上限`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新上限失敗");
    }
  }

  async function saveFeatureDraft(userId: string, feature: ManagedFeature) {
    const draft = featureDrafts[feature.key];
    if (!draft || feature.unlimited) return;

    const nextLimit = Math.max(0, Number(draft.limit || 0));
    const nextUsed = Math.max(0, Math.min(nextLimit, Number(draft.used || 0)));

    if (nextLimit !== feature.limit) {
      await updateFeatureLimit(userId, feature.key, nextLimit);
    }

    const latestAccount = accounts.find((item) => item.user.id === userId);
    const latestFeature = latestAccount?.features.find((item) => item.key === feature.key);
    const compareUsed = latestFeature?.limit === nextLimit ? latestFeature.used : feature.used;

    if (nextUsed !== compareUsed || nextLimit !== feature.limit) {
      await updateFeature(userId, feature.key, nextUsed, nextLimit);
    }
  }

  async function createManagedAccount() {
    const session = readAuthSession();
    if (!session?.token) {
      setError("登入狀態已失效，請重新登入");
      return;
    }
    if (!newAccountFullName.trim() || !newAccountEmail.trim() || !newAccountPassword) {
      setError("請填寫完整的新帳戶資料");
      return;
    }
    if (newAccountPassword.length < 8) {
      setError("新帳戶密碼至少需要 8 個字元");
      return;
    }

    setCreatingAccount(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          fullName: newAccountFullName.trim(),
          email: newAccountEmail.trim().toLowerCase(),
          password: newAccountPassword,
          role: newAccountRole,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "建立帳戶失敗");

      setNewAccountFullName("");
      setNewAccountEmail("");
      setNewAccountPassword("");
      setNewAccountRole("teacher");
      setMessage("已建立新帳戶");
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立帳戶失敗");
    } finally {
      setCreatingAccount(false);
    }
  }

  async function deleteManagedAccount(userId: string) {
    const session = readAuthSession();
    if (!session?.token) {
      setError("登入狀態已失效，請重新登入");
      return;
    }
    if (userId === currentUser.id) {
      setError("不能刪除目前登入中的管理員帳戶");
      return;
    }
    showConfirm({
      title: "刪除帳戶",
      message: "確定要刪除此帳戶嗎？此操作無法撤銷。",
      confirmText: "確認刪除",
      cancelText: "取消",
      tone: "danger",
      onConfirm: () => {
        void (async () => {
          setDeletingAccountId(userId);
          setError("");
          setMessage("");
          try {
            const res = await fetch(`${API_BASE}/api/auth/admin/accounts/${userId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${session.token}` },
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || "刪除帳戶失敗");
            setMessage("帳戶已刪除");
            setSelectedUserId("");
            await loadAccounts();
          } catch (err) {
            setError(err instanceof Error ? err.message : "刪除帳戶失敗");
          } finally {
            setDeletingAccountId("");
          }
        })();
      },
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
      <div className="rounded-[32px] border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur md:p-8">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">帳戶與系統設定</h1>
            <p className="mt-2 text-sm text-slate-500">修改常見帳戶設定，包括電郵、密碼、網頁外觀、通知與使用偏好。</p>
          </div>
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            返回工作台
          </a>
        </div>

        {(message || error) && (
          <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error || message}
          </div>
        )}

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
              <SectionTitle title="個人資料" desc="這些是其他網站最常見的帳戶基本資料設定。" />
              <div className="mt-5 grid gap-5 md:grid-cols-[160px_minmax(0,1fr)]">
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={avatarUrl || "https://api.dicebear.com/9.x/adventurer/svg?seed=Chopreality"}
                    alt="avatar"
                    className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-md"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {uploadingAvatar ? "上傳中..." : "更換頭像"}
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
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">名字</span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">電郵</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    />
                    <div className="mt-2 text-xs text-slate-500">修改電郵時需要輸入目前密碼確認。</div>
                  </label>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
              <SectionTitle title="安全設定" desc="常见站点都会提供的基础安全项：修改密码与邮箱验证口令。" />
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">目前密碼</span>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">新密碼</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">確認新密碼</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
              <SectionTitle title="外觀" desc="調整整個工作台的主背景與視覺風格。" />
              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <div>
                  <div className="mb-3 text-sm font-semibold text-slate-700">主題模式</div>
                  <div className="grid gap-3">
                    {themeChoices.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          setPreferences((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, themeMode: item.value },
                          }))
                        }
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${
                          preferences.appearance.themeMode === item.value
                            ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <div className="mb-3 text-sm font-semibold text-slate-700">背景風格</div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {backgroundChoices.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          setPreferences((prev) => ({
                            ...prev,
                            appearance: { ...prev.appearance, backgroundStyle: item.value },
                          }))
                        }
                        className={`rounded-2xl border px-4 py-4 text-left ${
                          preferences.appearance.backgroundStyle === item.value
                            ? "border-indigo-400 bg-indigo-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="text-sm font-bold text-slate-900">{item.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 text-sm font-semibold text-slate-700">卡片樣式</div>
                <div className="flex flex-wrap gap-3">
                  {cardChoices.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        setPreferences((prev) => ({
                          ...prev,
                          appearance: { ...prev.appearance, cardStyle: item.value },
                        }))
                      }
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                        preferences.appearance.cardStyle === item.value
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
              <SectionTitle title="使用偏好" desc="這些選項在大多數平台都屬於常見個人化設定。" />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-slate-900">產品更新通知</div>
                      <div className="mt-1 text-xs text-slate-500">接收新功能與更新電郵</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.notifications.productUpdates}
                      onChange={(event) =>
                        setPreferences((prev) => ({
                          ...prev,
                          notifications: { ...prev.notifications, productUpdates: event.target.checked },
                        }))
                      }
                    />
                  </div>
                </label>
                <label className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-slate-900">每週摘要</div>
                      <div className="mt-1 text-xs text-slate-500">每週收到功能使用與更新摘要</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.notifications.weeklySummary}
                      onChange={(event) =>
                        setPreferences((prev) => ({
                          ...prev,
                          notifications: { ...prev.notifications, weeklySummary: event.target.checked },
                        }))
                      }
                    />
                  </div>
                </label>
                <label className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-slate-900">安全通知</div>
                      <div className="mt-1 text-xs text-slate-500">登入與帳戶異常變更提醒</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.notifications.securityEmail}
                      onChange={(event) =>
                        setPreferences((prev) => ({
                          ...prev,
                          notifications: { ...prev.notifications, securityEmail: event.target.checked },
                        }))
                      }
                    />
                  </div>
                </label>
                <label className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-slate-900">自動播放語音</div>
                      <div className="mt-1 text-xs text-slate-500">聊天語音生成後自動播放</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.experience.autoPlayVoice}
                      onChange={(event) =>
                        setPreferences((prev) => ({
                          ...prev,
                          experience: { ...prev.experience, autoPlayVoice: event.target.checked },
                        }))
                      }
                    />
                  </div>
                </label>
                <label className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-slate-900">Enter 直接送出</div>
                      <div className="mt-1 text-xs text-slate-500">關閉後改成 Enter 換行、按鈕送出</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.experience.enterToSend}
                      onChange={(event) =>
                        setPreferences((prev) => ({
                          ...prev,
                          experience: { ...prev.experience, enterToSend: event.target.checked },
                        }))
                      }
                    />
                  </div>
                </label>
                <label className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-slate-900">減少動畫</div>
                      <div className="mt-1 text-xs text-slate-500">降低界面過場與動態效果</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.experience.reduceMotion}
                      onChange={(event) =>
                        setPreferences((prev) => ({
                          ...prev,
                          experience: { ...prev.experience, reduceMotion: event.target.checked },
                        }))
                      }
                    />
                  </div>
                </label>
              </div>

              <div className="mt-5 max-w-xs">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">語言</span>
                  <select
                    value={preferences.experience.language}
                    onChange={(event) =>
                      setPreferences((prev) => ({
                        ...prev,
                        experience: { ...prev.experience, language: event.target.value as UserPreferences["experience"]["language"] },
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                  >
                    <option value="zh-HK">繁體中文（香港）</option>
                    <option value="zh-CN">简体中文</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSaveAll()}
                disabled={savingProfile || uploadingAvatar}
                className="rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
              >
                {savingProfile ? "儲存中..." : "儲存所有設定"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Account Summary</div>
              <div className="mt-4 flex items-center gap-4">
                <img
                  src={avatarUrl || "https://api.dicebear.com/9.x/adventurer/svg?seed=Chopreality"}
                  alt="avatar"
                  className="h-16 w-16 rounded-full border border-slate-200 object-cover"
                />
                <div>
                  <div className="text-lg font-bold text-slate-900">{fullName || currentUser.fullName}</div>
                  <div className="mt-1 text-sm text-slate-500">{email || currentUser.email}</div>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">角色</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{currentUser.role}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">方案</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{currentUser.plan || "starter"}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">背景</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    {backgroundChoices.find((item) => item.value === preferences.appearance.backgroundStyle)?.label}
                  </div>
                </div>
              </div>
            </section>

            {isDeveloperAccount && (
              <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="mt-2 text-lg font-bold text-slate-900">帳戶使用次數管理</div>
                    <div className="mt-1 text-sm text-slate-500">只給開發者帳戶使用，可重置與修改其他帳戶使用次數。</div>
                  </div>
                  <button
                    onClick={() => void loadAccounts()}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {loadingAccounts ? "刷新中..." : "刷新"}
                  </button>
                </div>

                <div className="mt-5 grid gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-bold text-slate-900">新增帳戶（僅管理員）</div>
                    <div className="mt-1 text-xs text-slate-500">新使用者只能由管理員建立，前台不提供自助註冊。</div>
                    <div className="mt-3 grid gap-3">
                      <input
                        type="text"
                        value={newAccountFullName}
                        onChange={(event) => setNewAccountFullName(event.target.value)}
                        placeholder="姓名"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="email"
                        value={newAccountEmail}
                        onChange={(event) => setNewAccountEmail(event.target.value)}
                        placeholder="email@example.com"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="password"
                        value={newAccountPassword}
                        onChange={(event) => setNewAccountPassword(event.target.value)}
                        placeholder="初始密碼（至少8位）"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <select
                        value={newAccountRole}
                        onChange={(event) => setNewAccountRole(event.target.value as "teacher" | "student" | "admin")}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="teacher">教師</option>
                        <option value="student">學生</option>
                        <option value="admin">管理員</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void createManagedAccount()}
                        disabled={creatingAccount}
                        className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
                      >
                        {creatingAccount ? "建立中..." : "建立帳戶"}
                      </button>
                    </div>
                  </div>

                  <select
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                  >
                    {accounts.map((account) => (
                      <option key={account.user.id} value={account.user.id}>
                        {account.user.fullName} ({account.user.email})
                      </option>
                    ))}
                  </select>

                  {selectedAccount ? (
                    <div className="space-y-3">
                      <button
                        onClick={() => void deleteManagedAccount(selectedAccount.user.id)}
                        disabled={deletingAccountId === selectedAccount.user.id || selectedAccount.user.id === currentUser.id}
                        className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingAccountId === selectedAccount.user.id ? "刪除中..." : "刪除此帳戶"}
                      </button>
                      <button
                        onClick={() => void resetFeatures(selectedAccount.user.id)}
                        className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        重置此帳戶次數
                      </button>

                      {selectedAccount.features.map((feature) => (
                        <div key={feature.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm font-bold text-slate-900">{feature.label}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {feature.unlimited ? "此帳戶無限制" : `已用 ${feature.used} / ${feature.limit} ${feature.countUnit}`}
                          </div>
                          {!feature.unlimited && (
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <label className="block">
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  已用
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  max={feature.limit}
                                  value={featureDrafts[feature.key]?.used ?? String(feature.used)}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                  onChange={(event) =>
                                    setFeatureDrafts((prev) => ({
                                      ...prev,
                                      [feature.key]: {
                                        used: event.target.value,
                                        limit: prev[feature.key]?.limit ?? String(feature.limit),
                                      },
                                    }))
                                  }
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                  上限
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  value={featureDrafts[feature.key]?.limit ?? String(feature.limit)}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                  onChange={(event) =>
                                    setFeatureDrafts((prev) => ({
                                      ...prev,
                                      [feature.key]: {
                                        used: prev[feature.key]?.used ?? String(feature.used),
                                        limit: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          )}
                          {!feature.unlimited && (
                            <button
                              type="button"
                              onClick={() => void saveFeatureDraft(selectedAccount.user.id, feature)}
                              className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                              確認修改
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                      暫無帳戶資料
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
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
