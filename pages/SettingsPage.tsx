import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
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

type ManagedBotRecord = {
  id: string;
  name: string;
  createdAt?: string;
  ownerId?: string;
  ownerEmail?: string;
  ownerName?: string;
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
    <div className="border-b border-slate-100 pb-4">
      <div className="text-base font-extrabold text-slate-950">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{desc}</div>
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
  const [accountSearch, setAccountSearch] = useState("");
  const [featureDrafts, setFeatureDrafts] = useState<Record<string, { used: string; limit: string }>>({});
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState("");
  const [loadingManagedBots, setLoadingManagedBots] = useState(false);
  const [managedBots, setManagedBots] = useState<ManagedBotRecord[]>([]);
  const [selectedManagedBotId, setSelectedManagedBotId] = useState("");
  const [targetOwnerId, setTargetOwnerId] = useState("");
  const [transferringBotId, setTransferringBotId] = useState("");
  const [newAccountFullName, setNewAccountFullName] = useState("");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [newAccountRole, setNewAccountRole] = useState<"teacher" | "student" | "admin">("teacher");
  const [activeSettingsTab, setActiveSettingsTab] = useState<"personal" | "admin">(() =>
    typeof window !== "undefined" && window.location.hash === "#admin-settings" ? "admin" : "personal"
  );
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [accountPage, setAccountPage] = useState(0);
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
      void loadManagedBots();
    }
  }, [isDeveloperAccount]);

  const selectedAccount = useMemo(
    () => accounts.find((item) => item.user.id === selectedUserId) || null,
    [accounts, selectedUserId]
  );

  const filteredAccounts = useMemo(() => {
    const keyword = accountSearch.trim().toLowerCase();
    if (!keyword) return accounts;
    return accounts.filter((account) => {
      const fullName = String(account.user.fullName || "").toLowerCase();
      const email = String(account.user.email || "").toLowerCase();
      return fullName.includes(keyword) || email.includes(keyword);
    });
  }, [accounts, accountSearch]);

  const accountPageSize = 8;
  const accountPageCount = Math.max(1, Math.ceil(filteredAccounts.length / accountPageSize));
  const visibleAccounts = filteredAccounts.slice(
    accountPage * accountPageSize,
    (accountPage + 1) * accountPageSize
  );

  useEffect(() => {
    setAccountPage(0);
  }, [accountSearch]);

  useEffect(() => {
    setAccountPage((page) => Math.min(page, accountPageCount - 1));
  }, [accountPageCount]);

  useEffect(() => {
    if (!accountSearch.trim()) return;
    if (!filteredAccounts.length) return;
    if (filteredAccounts.some((account) => account.user.id === selectedUserId)) return;
    setSelectedUserId(filteredAccounts[0].user.id);
  }, [accountSearch, filteredAccounts, selectedUserId]);

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

  async function loadManagedBots() {
    const session = readAuthSession();
    if (!session?.token || !isDeveloperAccount) return;
    setLoadingManagedBots(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/bots/admin/all`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "載入 Bot 清單失敗");
      const next = Array.isArray(data) ? data : [];
      setManagedBots(next);
      if (!selectedManagedBotId && next[0]?.id) {
        setSelectedManagedBotId(next[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入 Bot 清單失敗");
    } finally {
      setLoadingManagedBots(false);
    }
  }

  const selectedManagedBot = useMemo(
    () => managedBots.find((item) => item.id === selectedManagedBotId) || null,
    [managedBots, selectedManagedBotId]
  );

  async function transferBotOwner() {
    const session = readAuthSession();
    if (!session?.token) {
      setError("登入狀態已失效，請重新登入");
      return;
    }
    if (!selectedManagedBotId || !targetOwnerId) {
      setError("請先選擇 Bot 與目標帳戶");
      return;
    }
    setTransferringBotId(selectedManagedBotId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/bots/admin/${selectedManagedBotId}/owner`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ ownerId: targetOwnerId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Bot 歸屬轉移失敗");
      setMessage("Bot 歸屬已更新");
      await loadManagedBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bot 歸屬轉移失敗");
    } finally {
      setTransferringBotId("");
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
    <div className="min-h-screen bg-[#f4f7fc] text-slate-800">
      <div className="mx-auto min-h-screen max-w-[1520px] border-x border-slate-200/80 bg-white">

        <main className="min-w-0 bg-[#f7f9fd]">
          <div className="border-b border-slate-200 bg-white px-5 pt-7 md:px-8 lg:px-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">帳戶與系統設定</h1>
                <p className="mt-1 text-sm text-slate-500">管理帳戶資料、個人偏好與平台設定。</p>
              </div>
              <div className="flex items-center gap-3 self-start">
                <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-600">
                  <ArrowLeft className="h-4 w-4" />返回工作台
          </a>
              </div>
            </div>
            <div className="mt-7 flex gap-7 overflow-x-auto text-sm font-bold text-slate-400">
              <a href="#profile-settings" onClick={() => setActiveSettingsTab("personal")} className={`px-1 pb-4 transition ${activeSettingsTab === "personal" ? "border-b-2 border-indigo-600 text-indigo-600" : "hover:text-slate-700"}`}>個人帳戶</a>
              <a href="#appearance-settings" onClick={() => setActiveSettingsTab("personal")} className={`px-1 pb-4 transition ${activeSettingsTab === "personal" ? "hover:text-slate-700" : ""}`}>介面與偏好</a>
              {isDeveloperAccount && <a href="#admin-settings" onClick={() => setActiveSettingsTab("admin")} className={`px-1 pb-4 transition ${activeSettingsTab === "admin" ? "border-b-2 border-indigo-600 text-indigo-600" : "hover:text-slate-700"}`}>平台管理</a>}
            </div>
        </div>

          <div className="px-5 py-6 md:px-8 lg:px-10">

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "目前角色", value: currentUser.role || "teacher", hint: "帳戶權限", tone: "bg-white" },
                { label: "使用方案", value: currentUser.plan || "starter", hint: "目前訂閱方案", tone: "border-indigo-200 bg-indigo-50/70" },
                { label: "帳戶總數", value: isDeveloperAccount ? String(accounts.length) : "1", hint: isDeveloperAccount ? "平台已建立帳戶" : "個人帳戶", tone: "bg-white" },
                { label: "Bot 數量", value: isDeveloperAccount ? String(managedBots.length) : "—", hint: isDeveloperAccount ? "可管理的 AI Bot" : "僅管理員可查看", tone: "border-amber-200 bg-amber-50/70" },
              ].map((metric) => (
                <div key={metric.label} className={`rounded-2xl border border-slate-200 p-5 shadow-sm ${metric.tone}`}>
                  <div className="text-xs font-bold text-slate-400">{metric.label}</div>
                  <div className="mt-3 text-2xl font-black capitalize text-slate-950">{metric.value}</div>
                  <div className="mt-1 text-xs text-slate-500">{metric.hint}</div>
                </div>
              ))}
            </div>

        {(message || error) && (
              <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error || message}
          </div>
        )}

            <div className="mt-6">
          <div className={activeSettingsTab === "admin" ? "hidden" : "space-y-6"}>
                <section id="profile-settings" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
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

                <section id="security-settings" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <SectionTitle title="安全設定" desc="管理密碼與電郵驗證，保護帳戶登入安全。" />
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

                <section id="appearance-settings" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
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

                <section id="preference-settings" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
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

                <div className="sticky bottom-4 z-10 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSaveAll()}
                disabled={savingProfile || uploadingAvatar}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
              >
                    <Save className="h-4 w-4" />
                {savingProfile ? "儲存中..." : "儲存所有設定"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {isDeveloperAccount && activeSettingsTab === "admin" && (
              <>
              <section id="admin-settings" className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
                  <div>
                    <h2 className="text-lg font-black text-slate-950">使用者帳號</h2>
                    <p className="mt-1 text-sm text-slate-500">管理平台成員、方案及功能用量。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void loadAccounts()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                      <RefreshCw className={`h-4 w-4 ${loadingAccounts ? "animate-spin" : ""}`} />
                      {loadingAccounts ? "刷新中" : "刷新"}
                    </button>
                    <button type="button" onClick={() => setShowCreateAccount((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700">
                      <Plus className="h-4 w-4" />邀請成員
                    </button>
                  </div>
                </div>

                {showCreateAccount && (
                  <div className="border-b border-indigo-100 bg-indigo-50/60 px-5 py-5 md:px-6">
                    <div className="mb-3 text-sm font-extrabold text-slate-900">建立新帳戶</div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr_180px_auto]">
                      <input type="text" value={newAccountFullName} onChange={(event) => setNewAccountFullName(event.target.value)} placeholder="姓名" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                      <input type="email" value={newAccountEmail} onChange={(event) => setNewAccountEmail(event.target.value)} placeholder="email@example.com" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                      <input type="password" value={newAccountPassword} onChange={(event) => setNewAccountPassword(event.target.value)} placeholder="初始密碼（至少8位）" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                      <select value={newAccountRole} onChange={(event) => setNewAccountRole(event.target.value as "teacher" | "student" | "admin")} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                        <option value="teacher">教師</option><option value="student">學生</option><option value="admin">管理員</option>
                      </select>
                      <button type="button" onClick={() => void createManagedAccount()} disabled={creatingAccount} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-indigo-300">
                        {creatingAccount ? "建立中..." : "建立帳戶"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
                  <label className="relative block w-full max-w-md">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="搜尋姓名或電子郵件" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:bg-white" />
                  </label>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="rounded-lg bg-indigo-50 px-3 py-2 text-indigo-700">全部 {filteredAccounts.length}</span>
                    <span className="rounded-lg px-3 py-2">每頁 {accountPageSize} 位</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="grid grid-cols-[minmax(260px,1.5fr)_140px_140px_minmax(240px,1fr)_96px] gap-4 bg-slate-50 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    <span>成員</span><span>角色</span><span>方案</span><span>本月用量</span><span className="text-right">操作</span>
                  </div>
                  {visibleAccounts.map((account) => {
                    const usage = account.features.find((feature) => !feature.unlimited && feature.limit > 0);
                    const usageRate = usage ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
                    const selected = account.user.id === selectedUserId;
                    const initials = (account.user.fullName || account.user.email || "?").trim().slice(0, 1).toUpperCase();
                    return (
                      <button key={account.user.id} type="button" onClick={() => setSelectedUserId(account.user.id)} className={`grid w-full grid-cols-[minmax(260px,1.5fr)_140px_140px_minmax(240px,1fr)_96px] items-center gap-4 border-t border-slate-100 px-6 py-4 text-left transition ${selected ? "bg-indigo-50/70" : "hover:bg-slate-50"}`}>
                        <span className="flex min-w-0 items-center gap-3">
                          {account.user.avatarUrl ? <img src={account.user.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-black text-white">{initials}</span>}
                          <span className="min-w-0"><span className="block truncate text-sm font-extrabold text-slate-900">{account.user.fullName || "未命名帳戶"}</span><span className="mt-0.5 block truncate text-xs text-slate-400">{account.user.email}</span></span>
                        </span>
                        <span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold capitalize text-slate-600">{account.user.role}</span></span>
                        <span><span className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${account.user.plan === "starter" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{account.user.plan || "starter"}</span></span>
                        <span>
                          <span className="flex items-center justify-between text-[11px] font-bold text-slate-500"><span>{usage?.label || "不限用量"}</span><span>{usage ? `${usage.used} / ${usage.limit}` : "無限制"}</span></span>
                          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full rounded-full ${usageRate >= 80 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${usageRate}%` }} /></span>
                        </span>
                        <span className="text-right text-xs font-extrabold text-indigo-600">{selected ? "已選取" : "詳情"}</span>
                      </button>
                    );
                  })}
                  {visibleAccounts.length === 0 && <div className="px-6 py-14 text-center text-sm text-slate-500">找不到符合條件的帳戶。</div>}
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-xs text-slate-500 md:px-6">
                  <span>顯示 {filteredAccounts.length ? accountPage * accountPageSize + 1 : 0} - {Math.min((accountPage + 1) * accountPageSize, filteredAccounts.length)}，共 {filteredAccounts.length} 個帳戶</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={accountPage === 0} onClick={() => setAccountPage((page) => Math.max(0, page - 1))} className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-slate-700 disabled:opacity-40">上一頁</button>
                    <button type="button" disabled={accountPage >= accountPageCount - 1} onClick={() => setAccountPage((page) => Math.min(accountPageCount - 1, page + 1))} className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-slate-700 disabled:opacity-40">下一頁</button>
                  </div>
                </div>
              </section>

              {selectedAccount && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
                    <div><h3 className="text-lg font-black text-slate-950">{selectedAccount.user.fullName}</h3><p className="mt-1 text-sm text-slate-500">{selectedAccount.user.email}</p></div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void resetFeatures(selectedAccount.user.id)} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-700 hover:bg-amber-100"><RotateCcw className="h-4 w-4" />重置用量</button>
                      <button type="button" onClick={() => void deleteManagedAccount(selectedAccount.user.id)} disabled={deletingAccountId === selectedAccount.user.id || selectedAccount.user.id === currentUser.id} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40"><Trash2 className="h-4 w-4" />{deletingAccountId === selectedAccount.user.id ? "刪除中" : "刪除帳戶"}</button>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {selectedAccount.features.filter((feature) => feature.key !== "avatar_ai_generate" && feature.key !== "background_ai_generate").map((feature) => (
                      <div key={feature.key} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3"><span className="text-sm font-extrabold text-slate-900">{feature.label}</span><span className="text-xs font-bold text-slate-400">{feature.unlimited ? "無限制" : `${feature.used}/${feature.limit}`}</span></div>
                        {feature.unlimited ? <div className="mt-4 h-1.5 rounded-full bg-emerald-400" /> : <><div className="mt-3 grid grid-cols-2 gap-2"><input type="number" min={0} max={feature.limit} value={featureDrafts[feature.key]?.used ?? String(feature.used)} onChange={(event) => setFeatureDrafts((prev) => ({ ...prev, [feature.key]: { used: event.target.value, limit: prev[feature.key]?.limit ?? String(feature.limit) } }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label={`${feature.label} 已用`} /><input type="number" min={0} value={featureDrafts[feature.key]?.limit ?? String(feature.limit)} onChange={(event) => setFeatureDrafts((prev) => ({ ...prev, [feature.key]: { used: prev[feature.key]?.used ?? String(feature.used), limit: event.target.value } }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label={`${feature.label} 上限`} /></div><button type="button" onClick={() => void saveFeatureDraft(selectedAccount.user.id, feature)} className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-600">儲存修改</button></>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="flex items-center justify-between gap-4"><div><h3 className="text-base font-black text-slate-950">Bot 歸屬整理</h3><p className="mt-1 text-sm text-slate-500">把現有 Bot 轉移至正確帳戶。</p></div><button type="button" onClick={() => void loadManagedBots()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><RefreshCw className={`h-3.5 w-3.5 ${loadingManagedBots ? "animate-spin" : ""}`} />刷新 Bot</button></div>
                <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_1fr_auto]">
                  <select value={selectedManagedBotId} onChange={(event) => { setSelectedManagedBotId(event.target.value); setTargetOwnerId(""); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">{managedBots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name || "未命名 Bot"} ({bot.ownerEmail || "未分配帳戶"})</option>)}</select>
                  <select value={targetOwnerId} onChange={(event) => setTargetOwnerId(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm"><option value="">選擇目標帳戶</option>{accounts.map((account) => <option key={account.user.id} value={account.user.id}>{account.user.fullName} ({account.user.email})</option>)}</select>
                  <button type="button" onClick={() => void transferBotOwner()} disabled={!selectedManagedBotId || !targetOwnerId || transferringBotId === selectedManagedBotId} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-indigo-300">{transferringBotId === selectedManagedBotId ? "轉移中..." : "轉移歸屬"}</button>
                </div>
                {selectedManagedBot && <div className="mt-3 text-xs text-slate-500">目前歸屬：{selectedManagedBot.ownerName || "未知"} {selectedManagedBot.ownerEmail ? `(${selectedManagedBot.ownerEmail})` : ""}</div>}
              </section>
              </>
            )}
          </div>
        </div>
          </div>
        </main>
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
