import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Icons } from "../components/icons";
import { API_BASE } from "../utils/api";
import { saveAuthSession } from "../utils/auth";

type AuthMode = "login" | "register";
type AppRole = "teacher" | "student" | "admin";

type AuthResponse = {
  token: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: AppRole;
    avatarUrl?: string;
    createdAt: string;
    plan?: string;
    quota?: {
      monthlyLimit: number;
      used: number;
      remaining: number;
    };
  };
};

const authModes: Array<{ id: AuthMode; label: string; helper: string }> = [
  { id: "login", label: "登入", helper: "" },
  { id: "register", label: "註冊", helper: "" },
];

const defaultAvatars = [
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Luna",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Kai",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Nova",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Milo",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Jade",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Iris",
];

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("teacher");
  const [avatarUrl, setAvatarUrl] = useState(defaultAvatars[0]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function resetFeedback() {
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    setErrorMessage("");
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "頭像上傳失敗");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("請輸入電郵。");
      return;
    }
    if (!password) {
      setErrorMessage("請輸入密碼。");
      return;
    }

    if (mode === "register") {
      if (!fullName.trim()) {
        setErrorMessage("請輸入名字。");
        return;
      }
      if (password.length < 8) {
        setErrorMessage("密碼至少需要 8 個字元。");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage("兩次輸入的密碼不一致。");
        return;
      }
      if (!acceptedTerms) {
        setErrorMessage("請先同意服務條款與隱私政策。");
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { email: normalizedEmail, password }
          : { fullName: fullName.trim(), email: normalizedEmail, password, role, avatarUrl };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as AuthResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(data && "error" in data && data.error ? data.error : "登入服務暫時不可用。");
      }
      if (!data || !("token" in data) || !data.token || !data.user) {
        throw new Error("登入服務回傳格式異常。");
      }

      saveAuthSession(data, mode === "register" ? true : rememberMe);
      setSuccessMessage(mode === "login" ? "登入成功，正在進入工作台..." : "註冊成功，正在進入工作台...");

      window.setTimeout(() => {
        window.location.href = "/";
      }, 500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "登入服務暫時不可用。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-800">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_34%)]" />
      <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <a href="/" className="flex items-center gap-3">
          <img src="/choprealitylogo.png" alt="Logo" className="h-12 w-12 object-contain" />
          <div className="text-xl font-bold text-[#1E293B] font-sans">CHOPREALITY</div>
        </a>

        <a
          href="/"
          className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white"
        >
          返回首頁
        </a>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] max-w-6xl flex-col justify-center gap-10 px-6 py-10 md:px-10 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="max-w-xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight text-slate-900 md:text-6xl">
              專為學習而設
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-600 md:text-lg">
              Chopreality 是一個無需編程的AI 藝術創作平台，讓師生在零基礎下也能輕鬆一站式創作不同AI作品，製作出用於教學或展示的互動作品。
            </p>
          </motion.div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="rounded-[2rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur md:p-7"
        >
          <div className="flex rounded-2xl bg-slate-100 p-1">
            {authModes.map((item) => (
              <button
                key={item.id}
                onClick={() => setMode(item.id)}
                className={`flex-1 rounded-[1rem] px-4 py-3 text-sm font-bold transition ${
                  mode === item.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <div className="text-2xl font-black tracking-tight text-slate-900">
              {mode === "login" ? "歡迎回來" : "建立你的帳戶"}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{authModes.find((item) => item.id === mode)?.helper}</p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            {mode === "register" && (
              <div className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center gap-4">
                  <img
                    src={avatarUrl || defaultAvatars[0]}
                    alt="Register Avatar"
                    className="h-16 w-16 rounded-full border-4 border-white object-cover shadow-sm"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-700">註冊頭像</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {uploadingAvatar ? "上傳中..." : "上傳照片"}
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
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {defaultAvatars.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAvatarUrl(preset)}
                      className={`rounded-2xl border p-1 transition ${
                        avatarUrl === preset ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"
                      }`}
                    >
                      <img src={preset} alt="Preset Avatar" className="h-14 w-14 rounded-xl object-cover" />
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">名字</span>
                    <input
                      type="text"
                      placeholder="陳老師"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">身份</span>
                    <select
                      value={role}
                      onChange={(event) => setRole(event.target.value as AppRole)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    >
                      <option value="teacher">教師</option>
                      <option value="student">學生</option>
                      <option value="admin">管理員</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">電郵</span>
              <input
                type="email"
                placeholder="hello@chopreality.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">密碼</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
              />
            </label>

            {mode === "register" && (
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">確認密碼</span>
                <input
                  type="password"
                  placeholder="再次輸入密碼"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                />
              </label>
            )}

            <div className="flex items-center justify-between pt-1 text-sm">
              <label className="flex items-center gap-2 text-slate-500">
                <input
                  type="checkbox"
                  checked={mode === "login" ? rememberMe : acceptedTerms}
                  onChange={(event) =>
                    mode === "login" ? setRememberMe(event.target.checked) : setAcceptedTerms(event.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{mode === "login" ? "記住我" : "我同意服務條款與隱私政策"}</span>
              </label>
            </div>

            {(errorMessage || successMessage) && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  errorMessage
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {errorMessage || successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || uploadingAvatar}
              className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {loading ? "提交中..." : mode === "login" ? "登入 Chopreality" : "建立帳戶"}
            </button>
          </form>
        </motion.section>
      </main>
    </div>
  );
};
