import { uiText, uiLocale, uiError } from '../utils/uiI18n';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, CheckCircle2, ChevronRight, Download, FileText, Inbox, LoaderCircle, Mail, Phone, RefreshCw, School, UserRound } from 'lucide-react';
import { API_BASE } from '../utils/api';

type RequestSummary = {
  id: string;
  reference_code: string;
  school_name: string;
  teacher_name: string;
  email: string;
  status: 'new' | 'reviewing' | 'completed';
  role_count: number;
  file_count: number;
  created_at: string;
};

type RequestRole = {
  id: string;
  role_index: number;
  name: string;
  subjects: string[];
  custom_subject: string;
  visual_styles: string[];
  material_text: string;
  notes: string;
};

type RequestFile = {
  id: string;
  role_index: number;
  kind: 'reference' | 'material';
  original_name: string;
  mime_type: string;
  size_bytes: number;
};

type RequestDetail = {
  request: RequestSummary & { phone: string; updated_at: string };
  roles: RequestRole[];
  files: RequestFile[];
};

const STATUS_META = {
  new: { label: '新申請', className: 'bg-red-50 text-red-700 border-red-100' },
  reviewing: { label: '處理中', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  completed: { label: '已完成', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
};

const formatDate = (value: string) => new Intl.DateTimeFormat(uiLocale(), {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

const formatBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const StatusBadge: React.FC<{ status: RequestSummary['status'] }> = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.new;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${meta.className}`}>{uiText(meta.label)}</span>;
};

export const SchoolAvatarRequestsAdminPage: React.FC = () => {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [filter, setFilter] = useState<'all' | RequestSummary['status']>('all');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/school-avatar-requests`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || '未能載入申請。');
      const list = (data.requests || []) as RequestSummary[];
      setRequests(list);
      setSelectedId((current) => current || list[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '未能載入申請。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`${API_BASE}/api/school-avatar-requests/${selectedId}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || '未能載入申請詳情。');
        if (!cancelled) setDetail(data as RequestDetail);
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '未能載入申請詳情。'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const filtered = useMemo(() => filter === 'all' ? requests : requests.filter((request) => request.status === filter), [filter, requests]);
  const newCount = requests.filter((request) => request.status === 'new').length;

  const updateStatus = async (status: RequestSummary['status']) => {
    if (!detail) return;
    try {
      const response = await fetch(`${API_BASE}/api/school-avatar-requests/${detail.request.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || '未能更新狀態。');
      setDetail((current) => current ? { ...current, request: { ...current.request, status } } : current);
      setRequests((current) => current.map((item) => item.id === detail.request.id ? { ...item, status } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '未能更新狀態。');
    }
  };

  const downloadFile = async (file: RequestFile) => {
    if (!detail || downloadingId) return;
    setDownloadingId(file.id);
    try {
      const response = await fetch(`${API_BASE}/api/school-avatar-requests/${detail.request.id}/files/${file.id}`);
      if (!response.ok) throw new Error('未能下載檔案。');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.original_name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '未能下載檔案。');
    } finally {
      setDownloadingId('');
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] text-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3"><h1 className="text-2xl font-black tracking-tight text-slate-900">{uiText("學校客製化申請")}</h1>{newCount > 0 ? <span className="rounded-full bg-[#e63946] px-2.5 py-1 text-xs font-black text-white">{newCount}{uiText(" 新")}</span> : null}</div>
          <p className="mt-2 text-sm text-slate-500">{uiText("查看教師提交的角色需求、教材及跟進狀態。")}</p>
        </div>
        <button onClick={() => void loadRequests()} className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{uiText(" 重新整理")}</button>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {([['all', '全部'], ['new', '新申請'], ['reviewing', '處理中'], ['completed', '已完成']] as const).map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black transition ${filter === value ? 'bg-[#1b365d] text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>{uiText(label)}</button>
        ))}
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{uiError(error)}</div> : null}

      <div className="mt-5 grid min-h-[640px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          {loading ? <div className="flex h-48 items-center justify-center text-slate-400"><LoaderCircle className="h-6 w-6 animate-spin" /></div> : filtered.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center px-8 text-center"><Inbox className="h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-600">{uiText("暫時沒有申請")}</p><p className="mt-1 text-xs text-slate-400">{uiText("新提交的申請將顯示於此。")}</p></div>
          ) : <div className="max-h-[640px] overflow-y-auto">
            {filtered.map((request) => (
              <button key={request.id} onClick={() => setSelectedId(request.id)} className={`group flex w-full items-start gap-3 border-b border-slate-200/80 px-5 py-5 text-left transition ${selectedId === request.id ? 'bg-white shadow-[inset_3px_0_0_#1b365d]' : 'hover:bg-white/80'}`}>
                <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1b365d]"><School className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-slate-800">{request.school_name}</strong><StatusBadge status={request.status} /></span><span className="mt-1 block truncate text-xs text-slate-500">{request.teacher_name} · {request.role_count}{uiText(" 個角色")}</span><span className="mt-2 block text-[11px] font-semibold text-slate-400">{formatDate(request.created_at)}</span></span>
                <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>}
        </aside>

        <section className="min-w-0 p-5 sm:p-7 lg:max-h-[640px] lg:overflow-y-auto">
          {detailLoading ? <div className="flex h-64 items-center justify-center text-slate-400"><LoaderCircle className="h-7 w-7 animate-spin" /></div> : !detail ? (
            <div className="flex h-64 flex-col items-center justify-center text-center"><Inbox className="h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">{uiText("請選擇一份申請")}</p></div>
          ) : <AnimatePresence mode="wait"><motion.div key={detail.request.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-black text-slate-900">{detail.request.school_name}</h2><StatusBadge status={detail.request.status} /></div><p className="mt-2 font-mono text-xs font-bold text-slate-400">{detail.request.reference_code}</p></div>
              <select value={detail.request.status} onChange={(event) => void updateStatus(event.target.value as RequestSummary['status'])} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-[#1b365d]">
                <option value="new">{uiText("新申請")}</option><option value="reviewing">{uiText("處理中")}</option><option value="completed">{uiText("已完成")}</option>
              </select>
            </div>

            <div className="grid gap-x-8 gap-y-4 border-b border-slate-200 py-6 sm:grid-cols-2">
              <div className="flex items-start gap-3"><UserRound className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold text-slate-400">{uiText("聯絡老師")}</p><p className="mt-1 text-sm font-bold text-slate-700">{detail.request.teacher_name}</p></div></div>
              <a href={`tel:${detail.request.phone}`} className="flex items-start gap-3"><Phone className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold text-slate-400">{uiText("電話／WhatsApp")}</p><p className="mt-1 text-sm font-bold text-[#1b365d]">{detail.request.phone}</p></div></a>
              <a href={`mailto:${detail.request.email}`} className="flex items-start gap-3"><Mail className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold text-slate-400">{uiText("電郵")}</p><p className="mt-1 break-all text-sm font-bold text-[#1b365d]">{detail.request.email}</p></div></a>
              <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold text-slate-400">{uiText("提交時間")}</p><p className="mt-1 text-sm font-bold text-slate-700">{formatDate(detail.request.created_at)}</p></div></div>
            </div>

            <div className="py-6"><h3 className="text-sm font-black text-slate-900">{uiText("角色需求 · ")}{detail.roles.length}</h3><div className="mt-4 space-y-5">
              {detail.roles.map((role) => {
                const files = detail.files.filter((file) => file.role_index === role.role_index);
                const tags = [...(role.subjects || []), role.custom_subject, ...(role.visual_styles || [])].filter(Boolean);
                return <div key={role.id} className="border-l-2 border-blue-100 pl-4 sm:pl-5"><div className="flex items-center gap-3"><span className="text-xs font-black text-[#e63946]">{String(role.role_index + 1).padStart(2, '0')}</span><h4 className="font-black text-slate-800">{role.name}</h4></div>{tags.length ? <div className="mt-3 flex flex-wrap gap-2">{tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{uiText(tag)}</span>)}</div> : null}{role.material_text ? <div className="mt-4"><p className="text-xs font-bold text-slate-400">{uiText("教材文字")}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{role.material_text}</p></div> : null}{role.notes ? <div className="mt-4"><p className="text-xs font-bold text-slate-400">{uiText("補充需求")}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{role.notes}</p></div> : null}{files.length ? <div className="mt-4 space-y-2">{files.map((file) => <button key={file.id} onClick={() => void downloadFile(file)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40"><FileText className="h-4 w-4 shrink-0 text-[#1b365d]" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-700">{file.original_name}</strong><span className="text-xs text-slate-400">{file.kind === 'reference' ? uiText('角色參考圖') : uiText('教材')} · {formatBytes(file.size_bytes)}</span></span>{downloadingId === file.id ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" /> : <Download className="h-4 w-4 text-slate-400" />}</button>)}</div> : null}</div>;
              })}
            </div></div>

            {detail.request.status === 'completed' ? <div className="flex items-center gap-2 border-t border-slate-200 pt-5 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" />{uiText(" 此申請已標記為完成")}</div> : null}
          </motion.div></AnimatePresence>}
        </section>
      </div>
    </div>
  );
};

export default SchoolAvatarRequestsAdminPage;
