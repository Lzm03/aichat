import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, ChevronRight, FileText, Image, LoaderCircle, Plus, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { API_BASE } from '../utils/api';

const SUBJECTS = [
  '中國語文', '英國語文', '數學', '常識／跨學科', '科學／STEM',
  '中國歷史／歷史', '公民與社會發展', 'SEN／社交情緒', '校園導覽／升學',
];

const VISUAL_STYLES = [
  { id: '3d', title: '立體動畫風格', description: '生動、有親和力，適合跨學科及低年級。' },
  { id: 'storybook', title: '溫暖繪本風格', description: '柔和、易接近，適合小學及 SEN 共融。' },
  { id: 'classic', title: '國風水墨／經典寫實', description: '適合歷史人物、中華文化及語文學習。' },
  { id: 'mascot', title: '校本吉祥物／既有角色', description: '按校徽、吉祥物或既有角色參考圖客製。' },
];

type RoleDraft = {
  key: string;
  name: string;
  subjects: string[];
  customSubject: string;
  visualStyles: string[];
  referenceFiles: File[];
  materialFiles: File[];
  materialText: string;
  notes: string;
};

const newRole = (): RoleDraft => ({
  key: crypto.randomUUID(),
  name: '',
  subjects: [],
  customSubject: '',
  visualStyles: [],
  referenceFiles: [],
  materialFiles: [],
  materialText: '',
  notes: '',
});

const FieldLabel: React.FC<{ children: React.ReactNode; required?: boolean }> = ({ children, required }) => (
  <span className="mb-2 block text-sm font-bold text-slate-700">
    {children}{required ? <span className="ml-1 text-[#e63946]">*</span> : null}
  </span>
);

const textInputClass = 'w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1b365d] focus:bg-white focus:ring-4 focus:ring-blue-100';

const FileList: React.FC<{ files: File[] }> = ({ files }) => files.length ? (
  <div className="mt-3 flex flex-wrap gap-2">
    {files.map((file, index) => (
      <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{file.name}</span>
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
  const [roles, setRoles] = useState<RoleDraft[]>([newRole()]);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');

  const requiredComplete = useMemo(
    () => Boolean(schoolName.trim() && teacherName.trim() && phone.trim() && /^\S+@\S+\.\S+$/.test(email.trim()) && roles.every((role) => role.name.trim()) && consent),
    [schoolName, teacherName, phone, email, roles, consent]
  );

  const updateRole = (key: string, patch: Partial<RoleDraft>) => {
    setRoles((current) => current.map((role) => role.key === key ? { ...role, ...patch } : role));
  };

  const toggleRoleValue = (role: RoleDraft, field: 'subjects' | 'visualStyles', value: string) => {
    const current = role[field];
    updateRole(role.key, { [field]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requiredComplete || submitting) return;
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
        name: role.name.trim(),
        subjects: role.subjects,
        customSubject: role.customSubject.trim(),
        visualStyles: role.visualStyles,
        materialText: role.materialText.trim(),
        notes: role.notes.trim(),
      }))));
      roles.forEach((role, index) => {
        role.referenceFiles.forEach((file) => form.append(`reference-${index}`, file));
        role.materialFiles.forEach((file) => form.append(`material-${index}`, file));
      });

      const response = await fetch(`${API_BASE}/api/school-avatar-requests`, { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || '暫時未能提交，請稍後再試。');
      setReference(data.reference || '已收到');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '暫時未能提交，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  if (reference) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-5 py-12 sm:py-20">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl overflow-hidden rounded-[32px] border border-emerald-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.10)]">
          <div className="h-2 bg-emerald-500" />
          <div className="p-8 text-center sm:p-12">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-8 w-8" /></span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-[#1b365d]">已收到貴校的客製化需求</h1>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-7 text-slate-600">ChopReality 團隊會整理角色設定同教材，並透過你提供嘅聯絡方式跟進。</p>
            <div className="mx-auto mt-7 max-w-sm rounded-2xl bg-slate-50 px-5 py-4 text-sm text-slate-500">
              參考編號 <strong className="ml-2 text-[#1b365d]">{reference}</strong>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> 返回首頁</a>
              <button onClick={() => { setReference(''); setRoles([newRole()]); }} className="rounded-full bg-[#1b365d] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#142a49]">提交另一批</button>
            </div>
          </div>
        </motion.section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <header className="relative overflow-hidden bg-[#102744] text-white">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_84%_20%,#ffb703_0,transparent_24%),radial-gradient(circle_at_72%_110%,#e63946_0,transparent_30%)]" />
        <div className="relative mx-auto max-w-5xl px-5 pb-12 pt-6 sm:px-8 sm:pb-16 sm:pt-8">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-white/75 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> ChopReality</a>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mt-10 max-w-3xl">
            <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-5xl">學校專屬 AI 數字人<br className="hidden sm:block" />客製化配置通道</h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-blue-100 sm:text-base">揀選角色方向並上載教材，ChopReality 團隊會協助配置角色人設、對話邏輯同專屬知識庫。</p>
          </motion.div>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-white/80">
            {['約 8–12 分鐘完成', '可一次提交多個角色', '教材只供專案配置使用'].map((item) => <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#ffb703]" />{item}</span>)}
          </div>
        </div>
      </header>

      <form onSubmit={submit} className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <motion.section initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)] sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1b365d] text-sm font-black text-white">01</span>
            <div><h2 className="text-xl font-black text-[#1b365d]">學校與聯絡資料</h2><p className="mt-1 text-sm text-slate-500">方便團隊確認需求同安排跟進。</p></div>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <label><FieldLabel required>學校名稱</FieldLabel><input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className={textInputClass} placeholder="請輸入學校全名" required /></label>
            <label><FieldLabel required>聯絡老師姓名</FieldLabel><input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} className={textInputClass} placeholder="請輸入姓名" required /></label>
            <label><FieldLabel required>聯絡電話／WhatsApp</FieldLabel><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={textInputClass} placeholder="例如：9123 4567" required /></label>
            <label><FieldLabel required>聯絡電郵</FieldLabel><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={textInputClass} placeholder="name@school.edu.hk" required /></label>
            <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          </div>
        </motion.section>

        <div className="mt-7 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-black text-[#1b365d]">角色需求</h2>
          <span className="text-sm font-bold text-slate-400">共 {roles.length} 個角色</span>
        </div>

        <AnimatePresence initial={false}>
          {roles.map((role, roleIndex) => (
            <motion.section key={role.key} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="mt-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)] sm:p-8">
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="flex items-center gap-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-sm font-black text-[#e63946]">{String(roleIndex + 1).padStart(2, '0')}</span><h3 className="text-lg font-black text-[#1b365d]">角色 {roleIndex + 1}</h3></div>
                {roles.length > 1 ? <button type="button" onClick={() => setRoles((current) => current.filter((item) => item.key !== role.key))} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"><Trash2 className="h-4 w-4" /> 移除</button> : null}
              </div>

              <div className="mt-6">
                <label><FieldLabel required>數字人名稱／角色主題</FieldLabel><input value={role.name} onChange={(e) => updateRole(role.key, { name: e.target.value })} className={textInputClass} placeholder="例如：蘇軾、英文對話大使 Sophie、校園吉祥物" required /></label>
              </div>

              <div className="mt-7">
                <FieldLabel>應用學科（可多選）</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {SUBJECTS.map((subject) => {
                    const active = role.subjects.includes(subject);
                    return <button key={subject} type="button" aria-pressed={active} onClick={() => toggleRoleValue(role, 'subjects', subject)} className={`rounded-full border px-4 py-2 text-sm font-bold transition ${active ? 'border-blue-300 bg-blue-50 text-[#1b365d] shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}>{active ? '✓ ' : ''}{subject}</button>;
                  })}
                </div>
                <input value={role.customSubject} onChange={(e) => updateRole(role.key, { customSubject: e.target.value })} className={`${textInputClass} mt-3 sm:max-w-md`} placeholder="其他自訂學科／用途" />
              </div>

              <div className="mt-7">
                <FieldLabel>角色視覺方向（可多選）</FieldLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  {VISUAL_STYLES.map((style) => {
                    const active = role.visualStyles.includes(style.title);
                    return <button key={style.id} type="button" aria-pressed={active} onClick={() => toggleRoleValue(role, 'visualStyles', style.title)} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${active ? 'border-blue-300 bg-blue-50/70 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-[#1b365d] bg-[#1b365d] text-white' : 'border-slate-300'}`}>{active ? <Check className="h-3 w-3" /> : null}</span><span><strong className="block text-sm text-slate-800">{style.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{style.description}</span></span></button>;
                  })}
                </div>
              </div>

              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <label className="group flex cursor-pointer flex-col justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 transition hover:border-[#1b365d] hover:bg-blue-50/50">
                  <input type="file" accept=".png,.jpg,.jpeg,.webp" multiple className="hidden" onChange={(e) => updateRole(role.key, { referenceFiles: Array.from(e.target.files || []) })} />
                  <span className="flex items-center gap-3"><span className="rounded-xl bg-white p-2.5 text-[#1b365d] shadow-sm"><Image className="h-5 w-5" /></span><span><strong className="block text-sm text-slate-800">角色／吉祥物參考圖</strong><span className="mt-1 block text-xs text-slate-500">PNG、JPG 或 WebP</span></span></span>
                  <FileList files={role.referenceFiles} />
                </label>
                <label className="group flex cursor-pointer flex-col justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 transition hover:border-[#1b365d] hover:bg-blue-50/50">
                  <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" multiple className="hidden" onChange={(e) => updateRole(role.key, { materialFiles: Array.from(e.target.files || []) })} />
                  <span className="flex items-center gap-3"><span className="rounded-xl bg-white p-2.5 text-[#1b365d] shadow-sm"><UploadCloud className="h-5 w-5" /></span><span><strong className="block text-sm text-slate-800">教材／單元文檔</strong><span className="mt-1 block text-xs text-slate-500">PDF、Word、PPT 或 TXT</span></span></span>
                  <FileList files={role.materialFiles} />
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-400">單一檔案上限 20MB，所有檔案合計上限 60MB。</p>

              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <label><FieldLabel>教材文字（選填）</FieldLabel><textarea rows={5} value={role.materialText} onChange={(e) => updateRole(role.key, { materialText: e.target.value })} className={`${textInputClass} resize-y`} placeholder="可直接貼上課文、知識點或教學內容…" /></label>
                <label><FieldLabel>補充需求（選填）</FieldLabel><textarea rows={5} value={role.notes} onChange={(e) => updateRole(role.key, { notes: e.target.value })} className={`${textInputClass} resize-y`} placeholder="例如：希望以廣東話反問句引導思考、半身視角…" /></label>
              </div>
            </motion.section>
          ))}
        </AnimatePresence>

        {roles.length < 10 ? <button type="button" onClick={() => setRoles((current) => [...current, newRole()])} className="mt-5 flex w-full items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-blue-200 bg-blue-50/40 px-5 py-4 text-sm font-black text-[#1b365d] transition hover:border-blue-300 hover:bg-blue-50"><Plus className="h-5 w-5" /> 新增下一個角色</button> : null}

        <section className="mt-8 rounded-[28px] bg-[#102744] p-6 text-white sm:p-8">
          <div className="flex items-start gap-4"><ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#ffb703]" /><div><h2 className="font-black">提交前確認</h2><p className="mt-2 text-sm leading-6 text-blue-100">上載內容只供 ChopReality 團隊處理本次數字人配置。請勿上載學生個人資料、成績或未獲授權嘅受版權保護內容。</p></div></div>
          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/10 p-4 text-sm leading-6 text-blue-50"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[#ffb703]" /><span>我確認有權提供以上教材及圖片，並同意 ChopReality 團隊為處理本次申請而使用。</span></label>
          {error ? <div role="alert" className="mt-5 rounded-2xl border border-red-300/30 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100">{error}</div> : null}
          <div className="mt-6 flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
            <p className="text-xs leading-5 text-blue-200">提交後會收到參考編號，團隊將按聯絡資料跟進。</p>
            <button type="submit" disabled={!requiredComplete || submitting} className="inline-flex min-w-44 items-center justify-center gap-2 rounded-full bg-[#e63946] px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-red-950/20 transition enabled:hover:-translate-y-0.5 enabled:hover:bg-[#d92f3c] disabled:cursor-not-allowed disabled:opacity-45">{submitting ? <><LoaderCircle className="h-4 w-4 animate-spin" /> 正在提交…</> : <>提交需求 <ChevronRight className="h-4 w-4" /></>}</button>
          </div>
        </section>
      </form>
    </main>
  );
};

export default SchoolAvatarRequestPage;
