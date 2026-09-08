import { uiText, uiTemplate } from '../utils/uiI18n';
import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { usePlatformDialog } from '../hooks/usePlatformDialog';
import { PlatformDialog } from '../components/system/PlatformDialog';
import type { PermissionGroup, PermissionStudent } from '../components/workshop/permissions/BotPermissionDrawer';

type StudentFormState = {
  fullName: string;
  email: string;
};

type GroupFormState = {
  name: string;
};

type AssignStudentState = {
  studentId: string | null;
  selectedGroupIds: string[];
};

const initialStudents: PermissionStudent[] = [
  { id: 'student-1', fullName: '陳小明', email: 'student1@school.hk', groupIds: ['group-3a'] },
  { id: 'student-2', fullName: '李美玲', email: 'student2@school.hk', groupIds: ['group-3a'] },
  { id: 'student-3', fullName: '張俊傑', email: 'student3@school.hk', groupIds: ['group-5c'] },
  { id: 'student-4', fullName: '黃思敏', email: 'student4@school.hk', groupIds: ['group-5c'] },
  { id: 'student-5', fullName: '林志文', email: 'student5@school.hk', groupIds: [] },
  { id: 'student-6', fullName: '周嘉怡', email: 'student6@school.hk', groupIds: ['group-3a'] },
  { id: 'student-7', fullName: '鄭浩然', email: 'student7@school.hk', groupIds: [] },
  { id: 'student-8', fullName: '梁曉彤', email: 'student8@school.hk', groupIds: ['group-5c'] },
];

const initialGroups: PermissionGroup[] = [
  { id: 'group-3a', name: '3A班', type: 'class', studentIds: ['student-1', 'student-2'] },
  { id: 'group-5c', name: '5C班', type: 'class', studentIds: ['student-3', 'student-4'] },
];

type ParsedStudent = {
  fullName: string;
  email: string;
};

const acceptedImportExtensions = ['.csv', '.tsv', '.txt', '.pdf'];

export const StudentManagementPage: React.FC = () => {
  const [students, setStudents] = useState<PermissionStudent[]>(initialStudents);
  const [groups, setGroups] = useState<PermissionGroup[]>(initialGroups);
  const [studentForm, setStudentForm] = useState<StudentFormState>({ fullName: '', email: '' });
  const [groupForm, setGroupForm] = useState<GroupFormState>({ name: '' });
  const [studentQuery, setStudentQuery] = useState('');
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [assignStudent, setAssignStudent] = useState<AssignStudentState>({ studentId: null, selectedGroupIds: [] });
  const [bulkText, setBulkText] = useState('');
  const [bulkRows, setBulkRows] = useState<ParsedStudent[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const { dialog, closeDialog, showAlert, showConfirm } = usePlatformDialog();

  const assignedStudents = useMemo(
    () => students.filter((student) => (student.groupIds || []).length > 0).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [students]
  );
  const unassignedStudents = useMemo(
    () => students.filter((student) => !student.groupIds?.length).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [students]
  );

  const visibleAssignedStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return q
      ? assignedStudents.filter((student) => `${student.fullName} ${student.email}`.toLowerCase().includes(q))
      : assignedStudents;
  }, [assignedStudents, studentQuery]);

  const studentById = (id: string) =>
    students.find((student) => student.id === id) || null;

  const addStudent = () => {
    if (!studentForm.fullName.trim() || !studentForm.email.trim()) {
      showAlert({ title: uiText('請輸入完整資料'), message: uiText('姓名和電郵都必須填寫。'), tone: 'info' });
      return;
    }
    const nextStudent: PermissionStudent = {
      id: `student-${Date.now()}`,
      fullName: studentForm.fullName.trim(),
      email: studentForm.email.trim().toLowerCase(),
      groupIds: [],
    };
    setStudents((current) => [...current, nextStudent]);
    setStudentForm({ fullName: '', email: '' });
  };

  const removeStudent = (studentId: string) => {
    showConfirm({
      title: uiText('移除學生？'),
      message: uiText('移除學生後，佢所屬嘅班級以及 Bot 嘅分享名單都會同步清除。'),
      confirmText: uiText('移除'),
      cancelText: uiText('取消'),
      tone: 'danger',
      onConfirm: () => {
        setStudents((current) => current.filter((student) => student.id !== studentId));
        setGroups((current) =>
          current.map((group) => ({ ...group, studentIds: group.studentIds.filter((id) => id !== studentId) }))
        );
      },
    });
  };

  const addGroup = () => {
    if (!groupForm.name.trim()) {
      showAlert({ title: uiText('請輸入名稱'), message: uiText('請填寫班級名稱。'), tone: 'info' });
      return;
    }
    const nextGroup: PermissionGroup = {
      id: `group-${Date.now()}`,
      name: groupForm.name.trim(),
      type: 'class',
      studentIds: [],
    };
    setGroups((current) => [...current, nextGroup]);
    setGroupForm({ name: '' });
    setShowGroupForm(false);
  };

  const removeGroup = (groupId: string) => {
    showConfirm({
      title: uiText('刪除班級？'),
      message: uiText('刪除後，原本分配到呢個班級嘅 Bot 都會失去呢個班級權限。'),
      confirmText: uiText('刪除'),
      cancelText: uiText('取消'),
      tone: 'danger',
      onConfirm: () => {
        setGroups((current) => current.filter((group) => group.id !== groupId));
        setStudents((current) =>
          current.map((student) => ({
            ...student,
            groupIds: (student.groupIds || []).filter((id) => id !== groupId),
          }))
        );
      },
    });
  };

  const removeStudentFromGroup = (groupId: string, studentId: string) => {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, studentIds: group.studentIds.filter((id) => id !== studentId) }
          : group
      )
    );
    setStudents((current) =>
      current.map((student) =>
        student.id === studentId
          ? { ...student, groupIds: (student.groupIds || []).filter((id) => id !== groupId) }
          : student
      )
    );
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  };

  const openAssignStudent = (studentId: string) => {
    const student = studentById(studentId);
    setAssignStudent({
      studentId,
      selectedGroupIds: student?.groupIds || [],
    });
  };

  const toggleAssignGroup = (groupId: string) => {
    setAssignStudent((current) => ({
      ...current,
      selectedGroupIds: current.selectedGroupIds.includes(groupId)
        ? current.selectedGroupIds.filter((id) => id !== groupId)
        : [...current.selectedGroupIds, groupId],
    }));
  };

  const saveAssignStudent = () => {
    const targetId = assignStudent.studentId;
    if (!targetId) return;
    const nextGroupIds = assignStudent.selectedGroupIds;
    setStudents((current) =>
      current.map((student) => (student.id === targetId ? { ...student, groupIds: nextGroupIds } : student))
    );
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        studentIds: nextGroupIds.includes(group.id) && !group.studentIds.includes(targetId)
          ? [...group.studentIds, targetId]
          : !nextGroupIds.includes(group.id)
            ? group.studentIds.filter((id) => id !== targetId)
            : group.studentIds,
      }))
    );
    setAssignStudent({ studentId: null, selectedGroupIds: [] });
  };

  const parseBulkText = (text: string): ParsedStudent[] => {
    const seenEmails = new Set<string>();
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => Boolean(line) && !/^(姓名|名字|學生|student|name)/i.test(line))
      .map((line) => {
        const parts = line.split(/[\t,，]/).map((part) => part.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        const fullName = parts.slice(0, -1).join(' ') || parts[0];
        const email = parts[parts.length - 1]?.toLowerCase();
        if (!email.includes('@')) return null;
        if (seenEmails.has(email)) return null;
        seenEmails.add(email);
        return { fullName: fullName || email, email };
      })
    .filter((item): item is ParsedStudent => Boolean(item));
  };

  const handleImportFile = async (file: File) => {
    const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
    if (!acceptedImportExtensions.includes(extension)) {
      showAlert({
        title: uiText('格式不支援'),
        message: uiText('請選擇 PDF、CSV、TSV 或 TXT 檔案。'),
        tone: 'info',
      });
      return;
    }

    if (file.type === 'application/pdf' || extension === '.pdf') {
      showAlert({
        title: uiText('PDF 預覽模式'),
        message: uiText('純前端預覽尚未接上 PDF 解析。正式版本會由後端解析文件內容。'),
        tone: 'info',
      });
      return;
    }

    const text = await file.text();
    setBulkText(text);
    setBulkRows(parseBulkText(text));
  };

  const handleDropFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    await handleImportFile(file);
  };

  const removeBulkRow = (email: string) => {
    const nextRows = bulkRows.filter((row) => row.email !== email);
    setBulkRows(nextRows);
    setBulkText(nextRows.map((row) => `${row.fullName}, ${row.email}`).join('\n'));
  };

  const applyBulkStudents = () => {
    const nextStudents = bulkRows.map((row, index) => ({
      id: `student-bulk-${Date.now()}-${index}`,
      fullName: row.fullName,
      email: row.email,
      groupIds: [],
    }));
    setStudents((current) => [...current, ...nextStudents]);
    setBulkText('');
    setBulkRows([]);
    setShowBulkModal(false);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">{uiText('學生管理')}</h1>
          <p className="mt-2 text-sm text-slate-500">{uiText('管理學生帳戶與班級。')}</p>
        </div>
      </div>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-lg font-black text-slate-900">
          <ClipboardList className="h-5 w-5 text-indigo-600" />
          {uiText('手動加入學生帳戶')}
        </div>
        <p className="mt-1 text-sm text-slate-500">{uiText('手動建立新學生帳戶，或貼上／上傳名單。')}</p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={studentForm.fullName}
            onChange={(event) => setStudentForm((current) => ({ ...current, fullName: event.target.value }))}
            placeholder={uiText('學生姓名')}
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
          />
          <input
            value={studentForm.email}
            onChange={(event) => setStudentForm((current) => ({ ...current, email: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addStudent();
            }}
            placeholder={uiText('學生電郵')}
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addStudent}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              {uiText('手動建立學生帳號')}
            </button>
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50/40"
            >
              <ClipboardList className="h-4 w-4" />
              {uiText('匯入學生名單')}
            </button>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/60 p-5">
          <div className="flex items-center gap-2 text-lg font-black text-slate-900">
            <UsersRound className="h-5 w-5 text-amber-500" />
            {uiText('未分組學生')}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {uiText('已註冊但尚未加入班級嘅學生會自動顯示喺呢度。')}
          </p>
          <div className="mt-4 space-y-2">
            {unassignedStudents.length > 0 ? (
              unassignedStudents.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => openAssignStudent(student.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-900">{student.fullName}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">{student.email}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
                {uiText('冇未分組學生。')}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-black text-slate-900">
            <UserRound className="h-5 w-5 text-indigo-600" />
            {uiText('我的學生')}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {uiText('已加入班級嘅學生會喺呢度管理。')}
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={studentQuery}
              onChange={(event) => setStudentQuery(event.target.value)}
              placeholder={uiText('搜尋學生姓名或電郵')}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="mt-3 space-y-2">
            {visibleAssignedStudents.length > 0 ? (
              visibleAssignedStudents.map((student) => {
                const groupsNames = groups
                  .filter((group) => student.groupIds?.includes(group.id))
                  .map((group) => group.name);
                return (
                  <div key={student.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-slate-900">{student.fullName}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">{student.email}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {groupsNames.map((name) => (
                          <span key={name} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">{name}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAssignStudent(student.id)}
                      className="rounded-lg p-2 text-indigo-400 transition hover:bg-indigo-50 hover:text-indigo-700"
                      title={uiText('編輯班級')}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStudent(student.id)}
                      className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-sm text-slate-400">
                {uiText('未有已分組學生。新加入嘅學生會先放到未分組學生。')}
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-lg font-black text-slate-900">
              <UsersRound className="h-5 w-5 text-indigo-600" />
              {uiText('班級管理')}
            </div>
            <p className="mt-1 text-sm text-slate-500">{uiText('建立班級，方便一次過分配學生。')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowGroupForm((current) => !current)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50/40"
          >
            {showGroupForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showGroupForm ? uiText('關閉') : uiText('新增班級')}
          </button>
        </div>

        {showGroupForm ? (
          <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={groupForm.name}
                onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={uiText('例如：3A班、5C班')}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={addGroup}
                className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700"
              >
                {uiText('建立')}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 p-5 sm:p-6">
          {groups.length > 0 ? (
            groups.map((group) => {
              const expanded = expandedGroupIds.includes(group.id);
              const groupStudents = students.filter((student) => group.studentIds.includes(student.id));
              return (
                <div key={group.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
                  <div className="flex items-center gap-3 p-4">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpand(group.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <UsersRound className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-black text-slate-900">{group.name}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                            {uiText('班級')}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">{group.studentIds.length}{uiText(' 位學生')}</div>
                      </div>
                    </button>
                    {expanded ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                    <button
                      type="button"
                      onClick={() => removeGroup(group.id)}
                      className="rounded-xl p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {expanded ? (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                      {groupStudents.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {groupStudents.map((student) => (
                            <div key={student.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-black text-slate-900">{student.fullName}</div>
                                <div className="mt-0.5 truncate text-xs text-slate-500">{student.email}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeStudentFromGroup(group.id, student.id)}
                                className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-2 text-sm text-slate-400">{uiText('呢個班級未有學生')}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
              <p className="text-sm font-semibold text-slate-600">{uiText('暫時未有班級')}</p>
              <p className="mt-1 text-xs text-slate-400">{uiText('點擊「新增班級」開始建立。')}</p>
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {showBulkModal ? (
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.18 }}
                              className="max-h-[90vh] w-[min(720px,100%)] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)]"
            >
              <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <h3 className="text-xl font-black text-slate-900">{uiText('匯入學生名單')}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {uiText('上傳 CSV / TSV 或直接貼上名單，每行一個學生。')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkText('');
                    setBulkRows([]);
                  }}
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[calc(90vh-132px)] overflow-y-auto px-6 py-5">
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.pdf,application/pdf,text/csv,text/tab-separated-values,text/plain"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImportFile(file);
                  }}
                  className="hidden"
                />

                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => importFileRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      void handleDropFiles(event.dataTransfer.files);
                    }}
                    className="group flex min-h-[96px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-4 text-center transition hover:border-indigo-300 hover:bg-indigo-50/70"
                  >
                    <Upload className="h-5 w-5 text-indigo-500" />
                    <span className="mt-2 text-sm font-black text-indigo-700">{uiText('拖放 CSV / TSV 檔')}</span>
                    <span className="mt-1 text-xs text-slate-500">{uiText('或點擊選擇檔案')}</span>
                  </button>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                    {uiText('格式說明')}
                    <div className="mt-1 text-slate-600">
                      {uiText('每行格式')}
                      <br />
                      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-700">姓名, email</code>
                    </div>
                    <div className="mt-2 text-slate-600">
                      {uiText('可接受')}
                      <br />
                      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-700">, tab 空格</code>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm font-black text-slate-700">{uiText('貼上名單')}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkText('');
                      setBulkRows([]);
                    }}
                    className="text-xs font-bold text-slate-400 transition hover:text-slate-600"
                  >
                    {uiText('清除')}
                  </button>
                </div>
                <textarea
                  value={bulkText}
                  onChange={(event) => {
                    setBulkText(event.target.value);
                    setBulkRows(parseBulkText(event.target.value));
                  }}
                  rows={6}
                  placeholder={'陳小明, student1@school.hk\n李美玲, student2@school.hk\n王小明\tstudent3@school.hk'}
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                />

                {bulkRows.length > 0 ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                        {uiText('解析預覽')}{' '}
                        <span className="text-emerald-600">{bulkRows.length}{uiText(' 位學生')}</span>
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      {bulkRows.map((row, index) => (
                        <div key={`${row.email}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <Check className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{row.fullName}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{row.email}</span>
                          <button
                            type="button"
                            onClick={() => removeBulkRow(row.email)}
                            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : bulkText.trim() ? (
                  <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
                    {uiText('未偵測到有效學生資料。請確認每行至少包含姓名和電郵，且電郵應包含 @。')}
                  </p>
                ) : null}
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkText('');
                    setBulkRows([]);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  {uiText('取消')}
                </button>
                <button
                  type="button"
                  disabled={bulkRows.length === 0}
                  onClick={applyBulkStudents}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {uiText('加入未分組' )} {`(${bulkRows.length})`}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
        {assignStudent.studentId ? (
          <div className="fixed inset-0 z-[95]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAssignStudent({ studentId: null, selectedGroupIds: [] })}
              className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 240 }}
              className="absolute right-0 top-0 h-full w-[min(440px,100vw)] border-l border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between border-b border-slate-100 px-5 py-5">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{uiText('加入班級')}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {studentById(assignStudent.studentId)
                        ? uiTemplate('為 {0} 選擇所屬班級', studentById(assignStudent.studentId)?.fullName || '')
                        : ''}
                    </p>
                  </div>
                  <button type="button" onClick={() => setAssignStudent({ studentId: null, selectedGroupIds: [] })} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{uiText('可選班級')}</div>
                  <div className="mt-2 space-y-2">
                    {groups.map((group) => {
                      const selected = assignStudent.selectedGroupIds.includes(group.id);
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => toggleAssignGroup(group.id)}
                          className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                            selected
                              ? 'border-indigo-300 bg-indigo-50/60'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-transparent'}`}>
                            {selected ? <Check className="h-4 w-4" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-slate-900">{group.name}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {uiText('班級')} · {group.studentIds.length}{uiText(' 位學生')}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {groups.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                        {uiText('暫時未有班級，請先建立。')}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-slate-100 px-5 py-4">
                  <button
                    type="button"
                    onClick={saveAssignStudent}
                    className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700"
                  >
                    {uiText('儲存')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

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
