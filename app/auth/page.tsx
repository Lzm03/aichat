'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Icons } from '@/components/icons';

type AuthMode = 'login' | 'register';
type AppRole = 'teacher' | 'student' | 'admin';

type AuthResponse = {
  token: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: AppRole;
    createdAt: string;
  };
};

const authModes: Array<{ id: AuthMode; label: string; helper: string }> = [
  { id: 'login', label: '登入', helper: '回到你的教學工作台與 AI 機器人。' },
  { id: 'register', label: '註冊', helper: '建立新帳戶，開始你的 Chopreality 工作流。' },
];

const AUTH_TOKEN_KEY = 'chopreality_auth_token';
const AUTH_USER_KEY = 'chopreality_auth_user';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AppRole>('teacher');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const apiBase = useMemo(() => {
    const envBase = process.env.NEXT_PUBLIC_API_URL?.trim();
    return (envBase && envBase.length > 0 ? envBase : 'http://localhost:4000').replace(/\/$/, '');
  }, []);

  function resetFeedback() {
    setErrorMessage('');
    setSuccessMessage('');
  }

  function persistAuth(auth: AuthResponse) {
    const storage = mode === 'login' && !rememberMe ? window.sessionStorage : window.localStorage;
    const otherStorage = storage === window.localStorage ? window.sessionStorage : window.localStorage;

    otherStorage.removeItem(AUTH_TOKEN_KEY);
    otherStorage.removeItem(AUTH_USER_KEY);
    storage.setItem(AUTH_TOKEN_KEY, auth.token);
    storage.setItem(AUTH_USER_KEY, JSON.stringify(auth.user));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage('請輸入電郵。');
      return;
    }
    if (!password) {
      setErrorMessage('請輸入密碼。');
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        setErrorMessage('請輸入名字。');
        return;
      }
      if (password.length < 8) {
        setErrorMessage('密碼至少需要 8 個字元。');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('兩次輸入的密碼不一致。');
        return;
      }
      if (!acceptedTerms) {
        setErrorMessage('請先同意服務條款與隱私政策。');
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email: normalizedEmail, password }
          : { fullName: fullName.trim(), email: normalizedEmail, password, role };

      const response = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as AuthResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(data && 'error' in data && data.error ? data.error : '登入服務暫時不可用。');
      }
      if (!data || !('token' in data) || !data.token || !data.user) {
        throw new Error('登入服務回傳格式異常。');
      }

      persistAuth(data);
      setSuccessMessage(mode === 'login' ? '登入成功，正在進入工作台...' : '註冊成功，正在進入工作台...');

      window.setTimeout(() => {
        router.push('/');
      }, 500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '登入服務暫時不可用。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-800">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_34%)]" />
      <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <Link href="/" className="flex items-center gap-3">
          <img src="/choprealitylogo.png" alt="Logo" className="h-12 w-12 object-contain" />
          <div className="text-xl font-bold text-[#1E293B] font-sans">CHOPREALITY</div>
        </Link>

        <Link
          href="/"
          className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white"
        >
          返回首頁
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] max-w-6xl flex-col justify-center gap-10 px-6 py-10 md:px-10 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              校園 AI 操作入口
            </div>

            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight text-slate-900 md:text-6xl">
              專為學習而設
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-600 md:text-lg">
              Chopreality 是一個無需編程的AI 藝術創作平台，讓師生在零基礎下也能輕鬆一站式創作不同AI作品，製作出用於教學或展示的互動作品。
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="mt-10 grid gap-4 sm:grid-cols-3"
          >
            {[
              { title: '教師', text: '課堂管理、AI 機器人工作坊、任務指派。', tone: 'indigo' },
              { title: '學生', text: '學習冒險、創意實驗、互動成就追蹤。', tone: 'emerald' },
              { title: '管理員', text: '校園治理、安全監控與權限維護。', tone: 'amber' },
            ].map((item) => (
              <div
                key={item.title}
                className={`rounded-3xl border bg-white/82 p-4 shadow-sm backdrop-blur ${
                  item.tone === 'indigo'
                    ? 'border-indigo-100'
                    : item.tone === 'emerald'
                    ? 'border-emerald-100'
                    : 'border-amber-100'
                }`}
              >
                <div className="text-sm font-extrabold text-slate-900">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p>
              </div>
            ))}
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
                  mode === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <div className="text-2xl font-black tracking-tight text-slate-900">
              {mode === 'login' ? '歡迎回來' : '建立你的帳戶'}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {authModes.find((item) => item.id === mode)?.helper}
            </p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">名字</span>
                  <input
                    type="text"
                    placeholder="陳老師"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">身份</span>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as AppRole)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                  >
                    <option value="teacher">教師</option>
                    <option value="student">學生</option>
                    <option value="admin">管理員</option>
                  </select>
                </label>
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

            {mode === 'register' && (
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
                  checked={mode === 'login' ? rememberMe : acceptedTerms}
                  onChange={(event) =>
                    mode === 'login' ? setRememberMe(event.target.checked) : setAcceptedTerms(event.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{mode === 'login' ? '記住我' : '我同意服務條款與隱私政策'}</span>
              </label>
              {mode === 'login' && (
                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-700">
                  忘記密碼？
                </button>
              )}
            </div>

            {(errorMessage || successMessage) && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  errorMessage
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
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
              {loading ? '提交中...' : mode === 'login' ? '登入 Chopreality' : '建立帳戶'}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              使用 Google
            </button>
            <button
              type="button"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              使用學校 SSO
            </button>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
