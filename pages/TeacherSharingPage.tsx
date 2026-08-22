import React, { useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronRight, Filter, LoaderCircle, Plus, Search, UserRound, Users } from "lucide-react";
import { API_BASE } from "../utils/api";

type Student = { id: string; fullName: string; email: string };
type SharedBot = { id: string; name: string; subject?: string; avatarUrl?: string };
type Assignment = { botId: string; studentId: string };

export const TeacherSharingPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [bots, setBots] = useState<SharedBot[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [studentEmail, setStudentEmail] = useState("");
  const [savingBotId, setSavingBotId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedBotId, setSelectedBotId] = useState("");
  const [studentQuery, setStudentQuery] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const responses = await Promise.all([
        fetch(`${API_BASE}/api/bots/sharing/students`),
        fetch(`${API_BASE}/api/bots`),
        fetch(`${API_BASE}/api/bots/sharing/assignments`),
      ]);
      const [studentData, botData, assignmentData] = await Promise.all(responses.map((res) => res.json()));
      if (!responses[0].ok) throw new Error(studentData?.error || "載入學生失敗");
      setStudents(Array.isArray(studentData?.students) ? studentData.students : []);
      setBots(Array.isArray(botData) ? botData : []);
      setAssignments(Array.isArray(assignmentData?.assignments) ? assignmentData.assignments : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入分享資料失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    if (!selectedBotId && bots.length) {
      setSelectedBotId(bots[0].id);
    }
  }, [bots, selectedBotId]);

  const assignmentsByBot = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    assignments.forEach(({ botId, studentId }) => (map[botId] ||= new Set()).add(studentId));
    return map;
  }, [assignments]);

  const selectedBot = useMemo(() => bots.find((bot) => bot.id === selectedBotId) || bots[0] || null, [bots, selectedBotId]);
  const selectedStudentIds = useMemo(() => assignmentsByBot[selectedBot?.id || ""] || new Set<string>(), [assignmentsByBot, selectedBot]);
  const visibleStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((student) => `${student.fullName} ${student.email}`.toLowerCase().includes(q));
  }, [students, studentQuery]);

  const addStudent = async () => {
    if (!studentEmail.trim()) return;
    setMessage(""); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/bots/sharing/students`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: studentEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "加入學生失敗");
      setStudentEmail(""); setMessage(`已加入學生 ${data.student.fullName}`);
      await loadData();
    } catch (err) { setError(err instanceof Error ? err.message : "加入學生失敗"); }
  };

  const toggleStudent = (botId: string, studentId: string) => setAssignments((prev) => {
    const exists = prev.some((item) => item.botId === botId && item.studentId === studentId);
    return exists ? prev.filter((item) => !(item.botId === botId && item.studentId === studentId)) : [...prev, { botId, studentId }];
  });

  const saveShares = async (botId: string) => {
    setSavingBotId(botId); setMessage(""); setError("");
    try {
      const studentIds = assignments.filter((item) => item.botId === botId).map((item) => item.studentId);
      const res = await fetch(`${API_BASE}/api/bots/${botId}/shares`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "保存分享設定失敗");
      setMessage("分享設定已保存");
    } catch (err) { setError(err instanceof Error ? err.message : "保存分享設定失敗"); }
    finally { setSavingBotId(""); }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-black tracking-tight text-slate-900">學生與 Bot 分享</h1>
      <p className="mt-2 text-sm text-slate-500">先加入學生帳户，再選擇要分享給每位學生的 AI Bot。</p>
      {(message || error) && <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || message}</div>}

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5 text-indigo-600" />我的學生</div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addStudent(); }} placeholder="輸入學生帳户電郵" className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100" />
          <button onClick={() => void addStudent()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />加入學生</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {students.map((student) => <div key={student.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{student.fullName} <span className="text-slate-400">· {student.email}</span></div>)}
          {!loading && !students.length ? <p className="text-sm text-slate-400">尚未加入學生。</p> : null}
        </div>
      </section>

      <section className="mt-6 rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-black text-slate-700">
            <Bot className="h-4.5 w-4.5 text-indigo-600" />
            選擇 Bot 與學生
          </div>
          <p className="mt-1 text-[11px] text-slate-500">先選 Bot，再在右側快速配置可共享的學生名單。</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">
            <LoaderCircle className="h-7 w-7 animate-spin" />
          </div>
        ) : (
          <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="border-b border-slate-100 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Bots</div>
                <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">{bots.length} 個</div>
              </div>
              <div className="space-y-2">
                {bots.map((bot) => {
                  const active = bot.id === selectedBot?.id;
                  const count = assignmentsByBot[bot.id]?.size || 0;
                  return (
                    <button
                      key={bot.id}
                      type="button"
                      onClick={() => setSelectedBotId(bot.id)}
                      className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                        active
                          ? "border-indigo-300 bg-white shadow-[0_10px_30px_rgba(79,70,229,0.12)]"
                          : "border-transparent bg-white/70 hover:border-slate-200 hover:bg-white"
                      }`}
                    >
                      <img
                        src={bot.avatarUrl || "/avatars/bot-default.svg"}
                        alt=""
                        className="h-11 w-11 rounded-2xl bg-indigo-50 object-cover ring-1 ring-slate-100"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-slate-900">{bot.name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{bot.subject || "未分類"}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{count} 位學生</span>
                        <ChevronRight className={`h-4 w-4 transition ${active ? "text-indigo-600" : "text-slate-300 group-hover:text-slate-500"}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 p-4 sm:p-5">
              {selectedBot ? (
                <div className="flex h-full min-h-[520px] flex-col rounded-[26px] border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={selectedBot.avatarUrl || "/avatars/bot-default.svg"}
                        alt=""
                        className="h-12 w-12 rounded-2xl bg-indigo-50 object-cover ring-1 ring-slate-100"
                      />
                      <div>
                        <div className="text-base font-black text-slate-900">{selectedBot.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{selectedBot.subject || "未分類"} · 已選 {selectedStudentIds.size} 位學生</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-slate-500 shadow-sm ring-1 ring-slate-200">
                        <UserRound className="mr-1 inline h-3.5 w-3.5" />
                        點選學生卡片切換
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={studentQuery}
                      onChange={(e) => setStudentQuery(e.target.value)}
                      placeholder="搜尋學生姓名或電郵"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                    {studentQuery ? (
                      <button type="button" onClick={() => setStudentQuery("")} className="text-xs font-bold text-slate-400 hover:text-slate-700">
                        清除
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[11px] font-black text-slate-500">
                    <div className="inline-flex items-center gap-1.5">
                      <Filter className="h-3.5 w-3.5" />
                      學生名單
                    </div>
                    <div className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-600">
                      {visibleStudents.length} 位
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleStudents.map((student) => {
                      const checked = selectedStudentIds.has(student.id);
                      return (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => toggleStudent(selectedBot.id, student.id)}
                          className={`group flex min-h-[74px] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                            checked
                              ? "border-indigo-300 bg-indigo-50/60 shadow-[0_10px_30px_rgba(79,70,229,0.10)]"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                          }`}
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-black transition ${
                            checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-300 group-hover:border-slate-300"
                          }`}>
                            {checked ? <Check className="h-4 w-4" /> : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-black text-slate-900">{student.fullName}</div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">{student.email}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-auto border-t border-slate-100 pt-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[11px] text-slate-500">
                        已選學生數：<span className="font-black text-slate-900">{selectedStudentIds.size}</span>
                      </div>
                      <button
                        disabled={savingBotId === selectedBot.id}
                        onClick={() => void saveShares(selectedBot.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {savingBotId === selectedBot.id ? "保存中..." : "保存分享設定"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[520px] items-center justify-center rounded-[26px] border border-dashed border-slate-200 bg-white text-sm text-slate-400">
                  尚未選擇 Bot。
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
