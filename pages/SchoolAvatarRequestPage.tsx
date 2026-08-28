'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, CheckCircle2, ChevronDown, FileText, ImagePlus, LoaderCircle, Pencil, Plus, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import { API_BASE } from '../utils/api';

const SUBJECTS = [
  '中國語文', '中國歷史 · 歷史科', '英國語文 (English Language)', '數學科 · 邏輯思維',
  '小學常識科 · 跨學科', '科學 · STEM · 創科教育', '公民與社會發展科 (CS) · 德育及公民教育',
  'SEN 特殊教育 · 社交與情緒共融', '校園導覽 · 圖書館 · 升學規劃',
];

const STYLE_META = [
  { id: 'pixar', title: 'Pixar 3D 立體風格', description: '生動具科技感，學生最喜愛', image: '/avatar-intake/style-pixar.png', recommended: true },
  { id: 'storybook', title: '迪士尼／繪本插畫風格', description: '親切溫暖，特別適合小學及 SEN 共融', image: '/avatar-intake/style-storybook.png' },
  { id: 'ink', title: '國風水墨／經典寫實風格', description: '典雅莊重，適合歷史人物與中華文化', image: '/avatar-intake/style-ink.png' },
  { id: 'mascot', title: '校內專屬吉祥物／既有角色客製', description: '依校徽、吉祥物或既有角色參考圖客製', image: '/avatar-intake/style-mascot.png' },
];

type RoleStatus = 'editing' | 'generating' | 'proposal' | 'confirmed';
type RoleDraft = {
  id: string;
  name: string;
  classInfo: string;
  studentCount: string;
  usageTiming: 'during' | 'after' | 'both';
  subjects: string[];
  customSubject: string;
  styles: string[];
  referenceFiles: File[];
  materialFiles: File[];
  materialText: string;
  background: string;
  notes: string;
  status: RoleStatus;
  proposalText: string;
};

const createRole = (): RoleDraft => ({
  id: crypto.randomUUID(), name: '', classInfo: '', studentCount: '', usageTiming: 'during', subjects: [],
  customSubject: '', styles: [], referenceFiles: [], materialFiles: [], materialText: '', background: '', notes: '',
  status: 'editing', proposalText: '',
});

const timingLabel = (value: RoleDraft['usageTiming']) => ({ during: '課堂中使用', after: '課後／自主學習', both: '課堂中與課後皆使用' }[value]);

const buildProposal = (role: RoleDraft) => {
  const subjectText = [...role.subjects, role.customSubject].filter(Boolean).join('、') || '跨學科教學';
  const styleText = role.styles.length
    ? role.styles.map((id) => STYLE_META.find((item) => item.id === id)?.title).filter(Boolean).join('、')
    : '由製作團隊按角色定位建議';
  return `角色定位\n${role.name} 將作為 ${role.classInfo} 的 AI 教學夥伴，預計服務約 ${role.studentCount} 位學生，主要在「${timingLabel(role.usageTiming)}」情境出現。\n\n性格與語氣\n以清楚、鼓勵及具引導性的方式互動。角色背景以「${role.background.trim()}」為核心，回應時先理解學生想法，再透過提問、例子與提示逐步建立答案。\n\n教學範圍\n主要支援：${subjectText}。回答將以老師提供的教材和知識點為優先依據，避免超出課程程度。\n\n視覺設定\n${styleText}。保留適合校園使用的親和感、清晰輪廓及一致角色識別。${role.notes.trim() ? `\n\n補充製作要求\n${role.notes.trim()}` : ''}`;
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

const FieldLabel: React.FC<{ children: React.ReactNode; required?: boolean; optional?: boolean }> = ({ children, required, optional }) => (
  <span className="mb-2 block text-xs font-bold text-slate-600">
    {children}{required ? <span className="ml-1 text-rose-500">*</span> : null}{optional ? <span className="ml-1 font-medium text-slate-400">（選填）</span> : null}
  </span>
);

const FileChips: React.FC<{ files: File[]; onRemove: (index: number) => void }> = ({ files, onRemove }) => files.length ? (
  <div className="mt-3 flex flex-wrap gap-2">
    {files.map((file, index) => (
      <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 py-1.5 pl-3 pr-1.5 text-xs font-bold text-slate-600">
        <FileText className="h-3.5 w-3.5 shrink-0" /><span className="max-w-52 truncate">{file.name}</span>
        <button type="button" onClick={() => onRemove(index)} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-rose-500" aria-label={`移除 ${file.name}`}><X className="h-3 w-3" /></button>
      </span>
    ))}
  </div>
) : null;

export const SchoolAvatarRequestPage: React.FC = () => {
  const [schoolName, setSchoolName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [quota, setQuota] = useState({ total: 5, used: 1, fetched: false, loading: false });
  const [roles, setRoles] = useState<RoleDraft[]>([createRole()]);
  const [submittedRoles, setSubmittedRoles] = useState<RoleDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');

  const remaining = Math.max(0, quota.total - quota.used);
  const allConfirmed = roles.length > 0 && roles.every((role) => role.status === 'confirmed');
  const contactComplete = Boolean(schoolName.trim() && teacherName.trim() && phone.trim() && /^\S+@\S+\.\S+$/.test(email.trim()));

  const updateRole = (id: string, patch: Partial<RoleDraft>) => setRoles((current) => current.map((role) => role.id === id ? { ...role, ...patch } : role));
  const toggleValue = (role: RoleDraft, field: 'subjects' | 'styles', value: string) => {
    const values = role[field];
    updateRole(role.id, { [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] });
  };
  const roleReady = (role: RoleDraft) => Boolean(role.name.trim() && role.classInfo.trim() && role.studentCount.trim() && role.background.trim());

  const lookupQuota = () => {
    if (!schoolName.trim()) return;
    setQuota((current) => ({ ...current, loading: true }));
    window.setTimeout(() => setQuota({ total: 5, used: 1, fetched: true, loading: false }), 520);
  };

  const generateProposal = (role: RoleDraft) => {
    if (!roleReady(role)) return;
    updateRole(role.id, { status: 'generating' });
    window.setTimeout(() => updateRole(role.id, { status: 'proposal', proposalText: buildProposal(role) }), 780);
  };

  const submit = async () => {
    if (!allConfirmed || !contactComplete || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('schoolName', schoolName.trim());
      form.append('teacherName', teacherName.trim());
      form.append('phone', phone.trim());
      form.append('email', email.trim());
      form.append('website', website);
      form.append('roles', JSON.stringify(roles.map((role) => ({
        name: role.name.trim(), subjects: role.subjects, customSubject: role.customSubject.trim(),
        visualStyles: role.styles.map((id) => STYLE_META.find((style) => style.id === id)?.title || id),
        materialText: role.materialText.trim(),
        notes: [`班級：${role.classInfo}`, `學生人數：約 ${role.studentCount} 人`, `使用時段：${timingLabel(role.usageTiming)}`, `角色背景：${role.background}`, role.notes && `補充需求：${role.notes}`, `已確認角色草案：\n${role.proposalText}`].filter(Boolean).join('\n'),
      }))));
      roles.forEach((role, index) => {
        role.referenceFiles.forEach((file) => form.append(`reference-${index}`, file));
        role.materialFiles.forEach((file) => form.append(`material-${index}`, file));
      });
      const response = await fetch(`${API_BASE}/api/school-avatar-requests`, { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || '暫時未能提交，請稍後再試。');
      setReference(data.reference || '已收到');
      setSubmittedRoles((current) => [...current, ...roles]);
      setQuota((current) => ({ ...current, used: current.used + roles.length }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '暫時未能提交，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  const startAnother = () => {
    setReference('');
    setRoles([createRole()]);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[928px] px-5 py-6 sm:px-8 sm:py-7">
          <a href="/" className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-slate-400 transition hover:text-indigo-600"><ArrowLeft className="h-4 w-4" /> 返回 ChopReality</a>
          <div className="flex items-start justify-between gap-6">
            <div>
              <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-black tracking-tight text-slate-950 sm:text-[28px]">學校專屬 · AI 數字人客製化配置通道</motion.h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">填寫使用情境與背景資料後，AI 會先生成詳細角色設定草案。老師確認後，ChopReality 團隊才會正式開始製作。</p>
            </div>
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 sm:flex"><Sparkles className="h-6 w-6" /></div>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-slate-400">
            {['填寫需求', 'AI 生成草案', '確認並提交'].map((step, index) => <React.Fragment key={step}><span className={index === 0 ? 'text-indigo-600' : ''}>{index + 1}. {step}</span>{index < 2 ? <span className="h-px w-5 bg-slate-200" /> : null}</React.Fragment>)}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[928px] px-5 py-6 sm:px-8 sm:py-8">
        <AnimatePresence mode="wait">
          {reference ? (
            <motion.section key="success" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-7 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-5 w-5" /></span><div><h2 className="text-lg font-black text-emerald-900">已收到貴校的需求</h2><p className="mt-1 text-sm leading-6 text-emerald-800">參考編號 {reference}。目前已使用 {quota.used} 個額度，剩餘 {Math.max(0, quota.total - quota.used)} 個額度。</p></div></div>
                <button type="button" onClick={startAnother} className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700">繼續提交下一批</button>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        {submittedRoles.length ? (
          <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
            <div className="flex items-center justify-between"><div><h2 className="text-base font-black text-slate-900">本次已提交角色</h2><p className="mt-1 text-xs text-slate-400">團隊會以老師確認的設定草案為製作依據。</p></div><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div>
            <div className="mt-5 divide-y divide-slate-100">
              {submittedRoles.map((role) => <div key={role.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"><div><p className="text-sm font-black text-slate-800">{role.name}</p><div className="mt-2 flex flex-wrap gap-1.5">{[...role.subjects.slice(0, 2), timingLabel(role.usageTiming)].map((tag) => <span key={tag} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-600">{tag}</span>)}</div></div><span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400"><Pencil className="h-3.5 w-3.5" /> 已提交</span></div>)}
            </div>
          </section>
        ) : null}

        {!reference ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
              <SectionTitle number="1" title="學校與聯絡資料" subtitle="先查詢學校可用額度，再開始配置角色。" />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><FieldLabel required>學校名稱</FieldLabel><div className="flex flex-col gap-2 sm:flex-row"><input value={schoolName} onChange={(event) => { setSchoolName(event.target.value); setQuota((current) => ({ ...current, fetched: false })); }} className={inputClass} placeholder="請輸入學校全名" /><button type="button" onClick={lookupQuota} disabled={!schoolName.trim() || quota.loading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">{quota.loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{quota.loading ? '查詢中' : '查詢額度'}</button></div></label>
                <label><FieldLabel required>聯絡老師</FieldLabel><input value={teacherName} onChange={(event) => setTeacherName(event.target.value)} className={inputClass} placeholder="老師姓名" /></label>
                <label><FieldLabel required>電話／WhatsApp</FieldLabel><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} placeholder="例如：9123 4567" /></label>
                <label className="sm:col-span-2"><FieldLabel required>聯絡電郵</FieldLabel><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="name@school.edu.hk" /></label>
                <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
              </div>
              <AnimatePresence>{quota.fetched ? <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-5 overflow-hidden"><div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4"><div className="flex items-center justify-between text-sm"><span className="font-bold text-indigo-950">本學年客製化額度</span><span className="font-black text-indigo-700">剩餘 {remaining}／{quota.total}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100"><motion.div initial={{ width: 0 }} animate={{ width: `${(quota.used / quota.total) * 100}%` }} className="h-full rounded-full bg-indigo-500" /></div><p className="mt-2 text-xs text-indigo-500">已使用 {quota.used} 個額度，本批最多可提交 {remaining} 個角色。</p></div></motion.div> : null}</AnimatePresence>
            </section>

            <div className="mt-7 flex items-end justify-between"><div><h2 className="text-xl font-black text-slate-900">2. 角色需求</h2><p className="mt-1 text-xs text-slate-400">每個角色均需生成並確認一份設定草案。</p></div><span className="text-xs font-black text-slate-400">{roles.length}／{quota.fetched ? remaining : '—'} 個</span></div>
            <AnimatePresence initial={false}>{roles.map((role, index) => <RoleEditor key={role.id} role={role} index={index} removable={roles.length > 1} updateRole={updateRole} toggleValue={toggleValue} ready={roleReady(role)} onGenerate={() => generateProposal(role)} onRemove={() => setRoles((current) => current.filter((item) => item.id !== role.id))} />)}</AnimatePresence>

            {quota.fetched && roles.length < remaining ? <button type="button" onClick={() => setRoles((current) => [...current, createRole()])} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-5 py-4 text-sm font-black text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50"><Plus className="h-4 w-4" /> 新增下一個角色</button> : quota.fetched && roles.length >= remaining ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-800">已達本次可用額度上限。如需更多角色，請聯絡 ChopReality 團隊。</div> : null}

            <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" /><div><h2 className="text-sm font-black text-slate-900">提交本次需求</h2><p className="mt-1 text-xs leading-5 text-slate-500">上傳內容只供本次數字人配置使用，請勿包含學生個人資料或未獲授權內容。</p></div></div>
              {error ? <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}
              <button type="button" onClick={submit} disabled={!allConfirmed || !contactComplete || submitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-sm font-black text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,.5)] transition enabled:hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-[#c7cbe0]">{submitting ? <><LoaderCircle className="h-4 w-4 animate-spin" /> 正在提交…</> : '提交本次需求'}</button>
              {!allConfirmed ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-800">請先為每個角色生成 AI 設定草案，並完成確認後再提交。</div> : !contactComplete ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-800">請先填妥學校及聯絡資料。</div> : null}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
};

const SectionTitle: React.FC<{ number: string; title: string; subtitle: string }> = ({ number, title, subtitle }) => (
  <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white">{number}</span><div><h2 className="text-base font-black text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-400">{subtitle}</p></div></div>
);

type RoleEditorProps = {
  role: RoleDraft; index: number; removable: boolean; ready: boolean;
  updateRole: (id: string, patch: Partial<RoleDraft>) => void;
  toggleValue: (role: RoleDraft, field: 'subjects' | 'styles', value: string) => void;
  onGenerate: () => void; onRemove: () => void;
};

const RoleEditor: React.FC<RoleEditorProps> = ({ role, index, removable, ready, updateRole, toggleValue, onGenerate, onRemove }) => {
  const locked = role.status !== 'editing';
  return (
    <motion.section layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 sm:px-7">
        <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-xs font-black text-indigo-600">{String(index + 1).padStart(2, '0')}</span><div><div className="flex items-center gap-2"><h3 className="text-sm font-black text-slate-900">{role.name || `角色 ${index + 1}`}</h3>{role.status === 'confirmed' ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700"><Check className="h-3 w-3" /> 已確認設定</span> : null}</div><p className="mt-0.5 text-[11px] text-slate-400">{locked ? '欄位已鎖定，返回修改後可再次編輯。' : '填妥必填欄位後生成 AI 草案。'}</p></div></div>
        {removable && !locked ? <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /> 移除</button> : null}
      </div>

      <fieldset disabled={locked} className="p-6 sm:p-7">
        <label><FieldLabel required>數字人名稱／角色主題</FieldLabel><input value={role.name} onChange={(event) => updateRole(role.id, { name: event.target.value })} className={inputClass} placeholder="例如：蘇軾／英文對話大使 Sophie／校園吉祥物" /></label>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_1.25fr]">
          <label><FieldLabel required>預計使用班級</FieldLabel><input value={role.classInfo} onChange={(event) => updateRole(role.id, { classInfo: event.target.value })} className={inputClass} placeholder="例如：4A、4B" /></label>
          <label><FieldLabel required>學生人數（約數）</FieldLabel><input inputMode="numeric" value={role.studentCount} onChange={(event) => updateRole(role.id, { studentCount: event.target.value })} className={inputClass} placeholder="例如：60" /></label>
          <label><FieldLabel>使用時段</FieldLabel><div className="relative"><select value={role.usageTiming} onChange={(event) => updateRole(role.id, { usageTiming: event.target.value as RoleDraft['usageTiming'] })} className={`${inputClass} appearance-none pr-9 font-bold`}><option value="during">課堂中使用</option><option value="after">課後／自主學習使用</option><option value="both">課堂中與課後皆使用</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div></label>
        </div>

        <div className="mt-6"><FieldLabel>應用學科（可多選）</FieldLabel><div className="flex flex-wrap gap-2">{SUBJECTS.map((subject) => { const active = role.subjects.includes(subject); return <button key={subject} type="button" onClick={() => toggleValue(role, 'subjects', subject)} className={`rounded-full border px-3 py-2 text-xs font-bold transition ${active ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>{active ? '✓ ' : ''}{subject}</button>; })}</div><input value={role.customSubject} onChange={(event) => updateRole(role.id, { customSubject: event.target.value })} className={`${inputClass} mt-3 max-w-sm`} placeholder="其他自訂學科" /></div>

        <div className="mt-6"><FieldLabel>角色視覺風格偏好（可多選）</FieldLabel><div className="grid gap-3 sm:grid-cols-2">{STYLE_META.map((style) => { const active = role.styles.includes(style.id); return <button key={style.id} type="button" onClick={() => toggleValue(role, 'styles', style.id)} className={`group flex items-start gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-200'}`}><div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl bg-slate-100"><img src={style.image} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />{active ? <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white"><Check className="h-3 w-3" /></span> : null}</div><span className="min-w-0 pt-0.5"><span className="flex flex-wrap items-center gap-1.5"><strong className="text-xs leading-5 text-slate-800">{style.title}</strong>{style.recommended ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">推薦</span> : null}</span><span className="mt-1 block text-[11px] leading-5 text-slate-400">{style.description}</span></span></button>; })}</div></div>

        <AnimatePresence>{role.styles.includes('mascot') ? <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="mt-4"><FieldLabel>上傳吉祥物／校徽圖片</FieldLabel><label className="flex h-36 w-full max-w-sm cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 text-center"><input type="file" accept=".png,.jpg,.jpeg,.webp" multiple className="hidden" onChange={(event) => updateRole(role.id, { referenceFiles: Array.from(event.target.files || []) })} /><ImagePlus className="h-5 w-5 text-indigo-500" /><span className="mt-2 text-xs font-bold text-indigo-600">點擊上傳 JPG／PNG</span></label><FileChips files={role.referenceFiles} onRemove={(fileIndex) => updateRole(role.id, { referenceFiles: role.referenceFiles.filter((_, index) => index !== fileIndex) })} /></div></motion.div> : null}</AnimatePresence>

        <div className="mt-6"><FieldLabel optional>教學文檔／單元教材</FieldLabel><label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/30 px-5 py-6 text-center transition hover:bg-indigo-50"><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" multiple className="hidden" onChange={(event) => updateRole(role.id, { materialFiles: Array.from(event.target.files || []) })} /><UploadCloud className="h-5 w-5 text-indigo-500" /><span className="mt-2 text-xs font-black text-indigo-600">點擊或拖入教材</span><span className="mt-1 max-w-lg text-[11px] leading-5 text-slate-400">支援 PDF、Word、PPT；單一檔案上限 20MB，全部檔案合計上限 60MB。</span></label><FileChips files={role.materialFiles} onRemove={(fileIndex) => updateRole(role.id, { materialFiles: role.materialFiles.filter((_, index) => index !== fileIndex) })} /><textarea rows={3} value={role.materialText} onChange={(event) => updateRole(role.id, { materialText: event.target.value })} className={`${inputClass} mt-3 resize-y`} placeholder="或直接貼上課文、單元內容或知識點文字…" /></div>

        <label className="mt-6 block"><FieldLabel required>角色背景資料</FieldLabel><textarea rows={4} value={role.background} onChange={(event) => updateRole(role.id, { background: event.target.value })} className={`${inputClass} resize-y`} placeholder="請簡述角色身份、背景故事、性格取向或需參考的人設資料" /></label>
        <label className="mt-5 block"><FieldLabel optional>補充需求</FieldLabel><textarea rows={3} value={role.notes} onChange={(event) => updateRole(role.id, { notes: event.target.value })} className={`${inputClass} resize-y`} placeholder="例如：希望多用廣東話反問句引導思考、採用半身視角…" /></label>
      </fieldset>

      <div className="border-t border-slate-100 px-6 py-5 sm:px-7">
        {role.status === 'editing' ? <button type="button" onClick={onGenerate} disabled={!ready} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-[#c7cbe0]"><Sparkles className="h-4 w-4" /> AI 生成詳細角色設定</button> : null}
        {role.status === 'generating' ? <div className="flex items-center justify-center gap-3 rounded-2xl bg-violet-50 px-5 py-4 text-sm font-black text-violet-700"><LoaderCircle className="h-4 w-4 animate-spin" /> AI 正在整理角色定位、語氣與教學範圍…</div> : null}
        {(role.status === 'proposal' || role.status === 'confirmed') ? <div className="rounded-2xl border border-violet-200 bg-[#faf9ff] p-5"><div className="flex items-center gap-2 text-sm font-black text-violet-700"><Sparkles className="h-4 w-4" /> AI 角色設定草案</div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-indigo-900">{role.proposalText}</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{role.status === 'proposal' ? <><button type="button" onClick={() => updateRole(role.id, { status: 'editing' })} className="rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-xs font-black text-violet-700 hover:bg-violet-50">返回修改</button><button type="button" onClick={() => updateRole(role.id, { status: 'confirmed' })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700"><Check className="h-4 w-4" /> 確認角色設定</button></> : <button type="button" onClick={() => updateRole(role.id, { status: 'editing', proposalText: '' })} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50">重新編輯設定</button>}</div></div> : null}
        {role.status === 'editing' && !ready ? <p className="mt-2 text-center text-[11px] font-semibold text-slate-400">請先填寫角色名稱、班級、學生人數及背景資料。</p> : null}
      </div>
    </motion.section>
  );
};

export default SchoolAvatarRequestPage;
