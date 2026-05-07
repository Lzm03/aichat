import React, { useState } from "react";
import { motion } from "framer-motion";
import { API_BASE } from "../utils/api";
import { saveAuthSession } from "../utils/auth";
import { DemoNotice } from "../components/system/DemoNotice";

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

export const AuthPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("請輸入電郵。");
      return;
    }
    if (!password) {
      setErrorMessage("請輸入密碼。");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      const data = (await response.json().catch(() => null)) as AuthResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(data && "error" in data && data.error ? data.error : "登入服務暫時不可用。");
      }
      if (!data || !("token" in data) || !data.token || !data.user) {
        throw new Error("登入服務回傳格式異常。");
      }

      saveAuthSession(data, rememberMe);
      setSuccessMessage("登入成功，正在進入工作台...");

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
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-800">
      <DemoNotice />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <a href="/" className="flex items-center gap-3">
          <img src="/choprealitylogo.png" alt="Logo" className="h-12 w-12 object-contain" />
          <div className="text-xl font-bold text-[#1E293B] font-sans">CHOPREALITY</div>
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
          <div className="mt-6">
            <div className="text-2xl font-black tracking-tight text-slate-900">歡迎回來</div>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
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

            <div className="flex items-center justify-between pt-1 text-sm">
              <label className="flex items-center gap-2 text-slate-500">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>記住我</span>
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
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {loading ? "提交中..." : "登入 Chopreality"}
            </button>
          </form>
        </motion.section>
      </main>
    </div>
  );
};
