import { uiText, uiError } from '../utils/uiI18n';
import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Icons } from "../components/icons";
import { API_BASE } from "../utils/api";
import { isAuthPersistedInLocalStorage, readAuthSession, saveAuthSession, type StoredAuthUser } from "../utils/auth";
import { useFeatureEntitlements } from "../hooks/useFeatureEntitlements";
import { FeatureLimitPanel } from "../components/system/FeatureLimitPanel";
import { DEFAULT_ACCOUNT_AVATAR } from "../utils/default-avatar";
import { DEFAULT_USER_PREFERENCES, normalizeUserPreferences, syncDarkClass } from "../utils/userPreferences";

const defaultAvatars = [
  DEFAULT_ACCOUNT_AVATAR,
  "/avatars/avatar-1.svg",
  "/avatars/avatar-2.svg",
  "/avatars/avatar-3.svg",
  "/avatars/avatar-4.svg",
  "/avatars/avatar-5.svg",
];

interface AccountPageProps {
  currentUser: StoredAuthUser;
  onProfileUpdated: (user: StoredAuthUser) => void;
}

export const AccountPage: React.FC<AccountPageProps> = ({ currentUser, onProfileUpdated }) => {
  const isStudent = currentUser.role === "student";
  const roleLabel = ({ student: "學生", teacher: "老師", admin: "管理員" } as Record<string, string>)[currentUser.role] || currentUser.role;

  const { features, refresh } = useFeatureEntitlements();
  const [fullName, setFullName] = useState(currentUser.fullName || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || defaultAvatars[0]);
  const [saving, setSaving] = useState(false);
  const [resettingUsage, setResettingUsage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ---- 安全設定狀態 ----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState("");
  const [pwError, setPwError] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  // ---- 外觀狀態 ----
  const [preferences, setPreferences] = useState(() =>
    normalizeUserPreferences(currentUser.preferences || DEFAULT_USER_PREFERENCES)
  );
  const [themeSaving, setThemeSaving] = useState(false);

  /** 共用 profile 更新：讀 session token → PUT /api/auth/profile → 回存 session + 通知 App */
  async function updateProfile(payload: Record<string, unknown>) {
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
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.user) {
      const err = new Error(data?.error || "帳戶資料更新失敗") as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    saveAuthSession({ token: session.token, user: data.user }, isAuthPersistedInLocalStorage());
    onProfileUpdated(data.user);
    return data.user as StoredAuthUser;
  }

  function formatApiError(err: unknown, fallback: string): string {
    if (err instanceof Error) {
      if (/preview-mock/i.test(err.message)) return "預覽模式未提供此功能，請在正式環境重試。";
      if (err.message && err.message !== fallback) return err.message;
    }
    return fallback;
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPwError("");
    setPwMessage("");
    if (!currentPassword) return setPwError("請輸入目前密碼");
    if (newPassword.length < 8) return setPwError("新密碼至少 8 個字元");
    if (newPassword !== confirmNewPassword) return setPwError("兩次輸入的新密碼不一致");
    setPwSaving(true);
    try {
      await updateProfile({ currentPassword: currentPassword.trim(), newPassword: newPassword.trim() });
      setPwMessage("密碼已更新");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setPwError(formatApiError(err, "密碼修改失敗"));
    } finally {
      setPwSaving(false);
    }
  }

  async function handleChangeEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError("");
    setEmailMessage("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) return setEmailError("請輸入有效的電郵地址");
    if (!emailPassword) return setEmailError("請輸入目前密碼確認");
    setEmailSaving(true);
    try {
      await updateProfile({ email: newEmail.trim().toLowerCase(), currentPassword: emailPassword.trim() });
      setEmailMessage("電郵已更新");
      setNewEmail("");
      setEmailPassword("");
    } catch (err) {
      setEmailError(formatApiError(err, "電郵更改失敗"));
    } finally {
      setEmailSaving(false);
    }
  }

  async function applyThemeMode(mode: "light" | "midnight") {
    const next = normalizeUserPreferences({
      ...preferences,
      appearance: { ...preferences.appearance, themeMode: mode },
    });
    setPreferences(next);
    syncDarkClass(next); // 立即切換視覺
    setThemeSaving(true);
    setError("");
    try {
      await updateProfile({ preferences: next });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 404) {
        // 預覽模式 fallback：把主題存進本機 session，重整後仍然生效
        const session = readAuthSession();
        if (session?.token) {
          const merged = { ...currentUser, preferences: next };
          saveAuthSession({ token: session.token, user: merged }, isAuthPersistedInLocalStorage());
          onProfileUpdated(merged);
        }
        setMessage("已套用主題（預覽模式僅保存在本機）");
      } else {
        setError(formatApiError(err, "主題設定保存失敗"));
      }
    } finally {
      setThemeSaving(false);
    }
  }

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
        throw new Error(data?.error || "帳戶資料更新失敗");
      }

      saveAuthSession({ token: session.token, user: data.user }, isAuthPersistedInLocalStorage());
      onProfileUpdated(data.user);
      setMessage("帳戶資料已更新");
    } catch (err) {
      setError(err instanceof Error ? err.message : "帳戶資料更新失敗");
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
    <div className={`mx-auto max-w-5xl px-6 py-8 lg:px-8 ${isStudent ? "min-h-screen w-full max-w-none bg-[var(--bg-app)]" : ""}`}>
      <div className="rounded-[32px] border border-[var(--border-soft)] bg-[var(--bg-card)] p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--text-main)]">{uiText("帳戶中心")}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{isStudent ? uiText("更新你的頭像、用戶名和帳戶基本資料。") : uiText("更新你的頭像、名字和帳戶基本資料。")}</p>
          </div>
          <a href="/" className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg-subtle)]">
            <Icons.back className="h-4 w-4" />{uiText("返回工作台")}</a>
          {!isStudent && (
            <a href="/pro" className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">{uiText("PRO 方案説明")}</a>
          )}
        </div>

        <form className="mt-8 grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]" onSubmit={handleSave}>
          <section className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-subtle)] p-5">
            <div className="text-sm font-bold text-[var(--text-body)]">{uiText("頭像")}</div>
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
                  className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white hover:bg-[var(--accent)]"
                >
                  {uploading ? uiText("上傳中...") : uiText("上傳照片")}
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
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{uiText("默認頭像")}</div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {defaultAvatars.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAvatarUrl(preset)}
                      className={`rounded-2xl border p-1 transition ${
                        avatarUrl === preset ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--bg-card)]"
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
                <span className="mb-2 block text-sm font-semibold text-[var(--text-body)]">{isStudent ? uiText("用戶名") : uiText("名字")}</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[var(--text-body)]">{uiText("電郵")}</span>
                <input
                  type="email"
                  value={currentUser.email}
                  disabled
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle-2)] px-4 py-3 text-sm text-[var(--text-muted)] outline-none"
                />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{uiText("角色")}</div>
                <div className="mt-2 text-lg font-bold text-[var(--text-main)]">{uiText(roleLabel)}</div>
              </div>
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{uiText("套餐")}</div>
                <div className="mt-2 text-lg font-bold text-[var(--text-main)]">{currentUser.plan || "starter"}</div>
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
                {uiError(error) || uiText(message)}
              </motion.div>
            )}

            <div className="flex justify-end">
              <div className="flex gap-3">
                {!isStudent && currentUser.email.trim().toLowerCase() === "lzm200303@gmail.com" && (
                  <button
                    type="button"
                    onClick={handleResetUsage}
                    disabled={resettingUsage}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-3 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resettingUsage ? uiText("重置中...") : uiText("重置使用次數")}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="rounded-2xl bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:bg-indigo-400"
                >
                  {saving ? uiText("儲存中...") : uiText("儲存帳戶資料")}
                </button>
              </div>
            </div>
          </section>
        </form>

        {/* ---- 安全設定 ---- */}
        <section className="mt-8 border-t border-[var(--border)] pt-8">
          <h2 className="text-2xl font-black tracking-tight text-[var(--text-main)]">{uiText("安全設定")}</h2>

          <form onSubmit={handleChangePassword} className="mt-5 rounded-[28px] border border-[var(--border)] bg-[var(--bg-subtle)] p-5">
            <div className="text-sm font-bold text-[var(--text-body)]">{uiText("修改密碼")}</div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={uiText("目前密碼")}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent-border)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={uiText("新密碼（至少 8 個字元）")}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent-border)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              />
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder={uiText("確認新密碼")}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent-border)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-muted)]">{uiText("新密碼至少 8 個字元。")}</p>
              <button type="submit" disabled={pwSaving} className="rounded-2xl bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60">
                {pwSaving ? uiText("更新中...") : uiText("更新密碼")}
              </button>
            </div>
            {pwError && <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{uiError(pwError)}</p>}
            {pwMessage && <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{uiText(pwMessage)}</p>}
          </form>

          <form onSubmit={handleChangeEmail} className="mt-5 rounded-[28px] border border-[var(--border)] bg-[var(--bg-subtle)] p-5">
            <div className="text-sm font-bold text-[var(--text-body)]">{uiText("更改郵箱")}</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={uiText("新電郵地址")}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent-border)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              />
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder={uiText("目前密碼")}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent-border)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-muted)]">{uiText("更改郵箱需要輸入目前密碼確認。")}</p>
              <button type="submit" disabled={emailSaving} className="rounded-2xl bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60">
                {emailSaving ? uiText("更新中...") : uiText("更新電郵")}
              </button>
            </div>
            {emailError && <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{uiError(emailError)}</p>}
            {emailMessage && <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{uiText(emailMessage)}</p>}
          </form>
        </section>

        {/* ---- 外觀 ---- */}
        <section className="mt-8 border-t border-[var(--border)] pt-8">
          <h2 className="text-2xl font-black tracking-tight text-[var(--text-main)]">{uiText("外觀")}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{uiText("選擇工作台的主題模式。")}</p>
          <div className="mt-4 flex max-w-xs gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle-2)] p-1">
            {(["light", "midnight"] as const).map((mode) => {
              const selected = (preferences.appearance.themeMode === "midnight") === (mode === "midnight");
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={themeSaving}
                  onClick={() => void applyThemeMode(mode)}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold transition ${
                    selected ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {mode === "light" ? uiText("明亮") : uiText("深色")}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {!isStudent && (
        <div className="mt-6">
          <FeatureLimitPanel features={features} />
        </div>
      )}

      <div className="mt-6 rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
        <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--text-main)]">{uiText("聯絡我們")}</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--text-body)]">{uiText("如果你希望提供產品意見、瞭解付費方案，或購買我們的機器人創建服務，可以直接聯絡我們。")}</p>
        <div className="mt-5">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Email</div>
            <div className="mt-2 text-base font-bold text-[var(--text-main)]">Mandy@chopreality.com</div>
          </div>
        </div>
      </div>
    </div>
  );
};
