import { uiText, uiTemplate } from '../utils/uiI18n';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
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
import { API_BASE } from '../utils/api';
import { runChunkedBatches } from '../utils/student-batches';
import {
  MAX_ROSTER_FILE_BYTES,
  MAX_ROSTER_ROWS,
  downloadRosterTemplate,
  formatRosterRowsAsText,
  parseRosterText,
  parseRosterWorkbook,
  type RosterParseResult,
  type RosterSkipReason,
  type RosterSkippedRow,
  type RosterStudent,
} from '../utils/student-roster';
import { invalidateTeacherData, loadTeacherData, peekTeacherData } from '../utils/teacher-data-cache';

type StudentFormState = {
  fullName: string;
  email: string;
};

type GroupFormState = {
  name: string;
};

type AssignStudentState = {
  // 一位學生（撳行身入）或者一批（未分組區批量加入）。單人時長度 1。
  studentIds: string[];
  selectedGroupIds: string[];
};

/** 匯入結果摘要入面，server 回報嘅班級。 */
type ImportedClassSummary = {
  id: string;
  name: string;
  created: boolean;
  /** 匯入之後全班有幾多人（唔係今次加咗幾個）。 */
  studentCount: number;
};

const acceptedImportExtensions = ['.csv', '.tsv', '.txt', '.xlsx', '.pdf'];

async function readApiResponse(response: Response, fallbackMessage: string) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error || fallbackMessage));
  return data;
}

export const StudentManagementPage: React.FC = () => {
  const cachedRoster = peekTeacherData<{ students?: PermissionStudent[]; groups?: PermissionGroup[] }>('/api/students');
  const [students, setStudents] = useState<PermissionStudent[]>(cachedRoster?.students || []);
  const [groups, setGroups] = useState<PermissionGroup[]>(cachedRoster?.groups || []);
  const [isLoading, setIsLoading] = useState(!cachedRoster);
  const [isSaving, setIsSaving] = useState(false);
  const [studentForm, setStudentForm] = useState<StudentFormState>({ fullName: '', email: '' });
  const [groupForm, setGroupForm] = useState<GroupFormState>({ name: '' });
  const [studentQuery, setStudentQuery] = useState('');
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [assignStudent, setAssignStudent] = useState<AssignStudentState>({ studentIds: [], selectedGroupIds: [] });
  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState<string[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [bulkRows, setBulkRows] = useState<RosterStudent[]>([]);
  const [bulkSkipped, setBulkSkipped] = useState<RosterSkippedRow[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showAllAssignedStudentsModal, setShowAllAssignedStudentsModal] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const { dialog, closeDialog, showAlert, showConfirm } = usePlatformDialog();

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const data = await loadTeacherData<{ students?: PermissionStudent[]; groups?: PermissionGroup[] }>('/api/students');
        setStudents(Array.isArray(data.students) ? data.students : []);
        setGroups(Array.isArray(data.groups) ? data.groups : []);
      } catch (error) {
        showAlert({ title: uiText('載入失敗'), message: (error as Error).message, tone: 'danger' });
      } finally {
        setIsLoading(false);
      }
    };
    void loadStudents();
  }, [showAlert]);

  const assignedStudents = useMemo(
    () => students.filter((student) => (student.groupIds || []).length > 0).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [students]
  );
  const unassignedStudents = useMemo(
    () => students.filter((student) => !student.groupIds?.length).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [students]
  );
  // 未分組區嘅剔選。刻意唔另外存一份「已經剔咗而且仲喺未分組」嘅 state ——
  // 即時由 unassignedStudents 推導，學生一被分組或者移除就自動跌出剔選，
  // stale id 冇機會混入下一個 request。
  const effectiveSelectedIds = useMemo(
    () => selectedUnassignedIds.filter((id) => unassignedStudents.some((student) => student.id === id)),
    [selectedUnassignedIds, unassignedStudents]
  );
  const allUnassignedSelected =
    unassignedStudents.length > 0 && effectiveSelectedIds.length === unassignedStudents.length;

  const visibleAssignedStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return q
      ? assignedStudents.filter((student) => `${student.fullName} ${student.email}`.toLowerCase().includes(q))
      : assignedStudents;
  }, [assignedStudents, studentQuery]);

  const assignedPreviewLimit = 5;
  const assignedPreviewStudents = visibleAssignedStudents.slice(0, assignedPreviewLimit);
  const assignedExtraStudentCount = Math.max(0, visibleAssignedStudents.length - assignedPreviewLimit);

  const studentById = (id: string) =>
    students.find((student) => student.id === id) || null;

  const addStudent = async () => {
    if (!studentForm.fullName.trim() || !studentForm.email.trim()) {
      showAlert({ title: uiText('請輸入完整資料'), message: uiText('姓名和電郵都必須填寫。'), tone: 'info' });
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentForm),
      });
      const data = await readApiResponse(response, '無法建立學生帳戶');
      invalidateTeacherData('/api/students');
      setStudents((current) => current.some((student) => student.id === data.student.id)
        ? current
        : [...current, data.student]);
      setStudentForm({ fullName: '', email: '' });
      showAlert({
        title: uiText(data.created ? '學生帳戶已建立' : '學生已加入'),
        message: data.created
          ? `${uiText('請將臨時密碼交給學生：')} ${data.temporaryPassword}`
          : uiText('現有學生帳戶已加入你的學生名單。'),
        tone: 'info',
      });
    } catch (error) {
      showAlert({ title: uiText('建立失敗'), message: (error as Error).message, tone: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  const removeStudent = (studentId: string) => {
    showConfirm({
      title: uiText('移除學生？'),
      message: uiText('移除學生後，佢所屬嘅班級以及 Bot 嘅分享名單都會同步清除。'),
      confirmText: uiText('移除'),
      cancelText: uiText('取消'),
      tone: 'danger',
      onConfirm: () => {
        void (async () => {
          try {
            const response = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
            await readApiResponse(response, '無法移除學生');
            invalidateTeacherData('/api/students');
            setStudents((current) => current.filter((student) => student.id !== studentId));
            setGroups((current) =>
              current.map((group) => ({ ...group, studentIds: group.studentIds.filter((id) => id !== studentId) }))
            );
          } catch (error) {
            showAlert({ title: uiText('移除失敗'), message: (error as Error).message, tone: 'danger' });
          }
        })();
      },
    });
  };

  // 批量移除：同單人一樣只係由老師名單解除關聯，學生帳戶保留（可再用電郵加入返）。
  // 「全選」之後可能幾百人，但 DELETE /api/students 一次最多收 100 個 id，
  // 所以交俾 runChunkedBatches 切批；以前一炮交晒，server 回一句英文原始錯誤。
  const removeSelectedUnassigned = () => {
    const studentIds = effectiveSelectedIds;
    if (!studentIds.length) return;
    showConfirm({
      title: uiTemplate('移除 {0} 位學生？', studentIds.length),
      message: uiText('移除呢啲學生後，佢哋所屬嘅班級以及 Bot 嘅分享名單都會同步清除。'),
      confirmText: uiText('移除'),
      cancelText: uiText('取消'),
      tone: 'danger',
      onConfirm: () => {
        void (async () => {
          try {
            const { done, batchCount, error } = await runChunkedBatches(studentIds, async (batch) => {
              const response = await fetch(`${API_BASE}/api/students`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentIds: batch }),
              });
              await readApiResponse(response, '無法移除學生');
              invalidateTeacherData('/api/students');
              const idSet = new Set(batch);
              setStudents((current) => current.filter((student) => !idSet.has(student.id)));
              setGroups((current) =>
                current.map((group) => ({ ...group, studentIds: group.studentIds.filter((id) => !idSet.has(id)) }))
              );
            });
            // 只清走真正移除咗嗰批：中途失敗嘅人留住剔選，老師可以即刻再試。
            const doneSet = new Set(done);
            setSelectedUnassignedIds((current) => current.filter((id) => !doneSet.has(id)));
            if (error && !done.length) {
              showAlert({ title: uiText('移除失敗'), message: error.message, tone: 'danger' });
            } else if (error) {
              showAlert({
                title: uiText('部分學生未能移除'),
                message: uiTemplate('已移除 {0} 位學生，其餘 {1} 位未能處理，請再試一次。', done.length, studentIds.length - done.length),
                details: [error.message],
                tone: 'danger',
              });
            } else if (batchCount > 1) {
              showAlert({
                title: uiText('已移除學生'),
                message: uiTemplate('已移除 {0} 位學生。', done.length),
                tone: 'info',
              });
            }
          } catch (error) {
            showAlert({ title: uiText('移除失敗'), message: (error as Error).message, tone: 'danger' });
          }
        })();
      },
    });
  };

  const addGroup = async () => {
    if (!groupForm.name.trim()) {
      showAlert({ title: uiText('請輸入名稱'), message: uiText('請填寫班級名稱。'), tone: 'info' });
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/students/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupForm.name.trim() }),
      });
      const data = await readApiResponse(response, '無法建立班級');
      invalidateTeacherData('/api/students');
      setGroups((current) => [...current, data.group]);
      setGroupForm({ name: '' });
      setShowGroupForm(false);
    } catch (error) {
      showAlert({ title: uiText('建立失敗'), message: (error as Error).message, tone: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  const removeGroup = (groupId: string) => {
    showConfirm({
      title: uiText('刪除班級？'),
      message: uiText('刪除後，原本分配到呢個班級嘅 Bot 都會失去呢個班級權限。'),
      confirmText: uiText('刪除'),
      cancelText: uiText('取消'),
      tone: 'danger',
      onConfirm: () => {
        void (async () => {
          try {
            const response = await fetch(`${API_BASE}/api/students/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
            await readApiResponse(response, '無法刪除班級');
            invalidateTeacherData('/api/students');
            setGroups((current) => current.filter((group) => group.id !== groupId));
            setStudents((current) =>
              current.map((student) => ({
                ...student,
                groupIds: (student.groupIds || []).filter((id) => id !== groupId),
              }))
            );
          } catch (error) {
            showAlert({ title: uiText('刪除失敗'), message: (error as Error).message, tone: 'danger' });
          }
        })();
      },
    });
  };

  // 單人同批量行兩個唔同 endpoint（語義唔同：單人唔存在 → 404，批量名單有問題 → 400），
  // 但樂觀更新係同一份 —— 呢段一旦有兩份，就會出現「批量加咗但班級卡數目冇加」呢類走散。
  const applyGroupAssignment = (studentIds: string[], groupIds: string[]) => {
    const idSet = new Set(studentIds);
    setStudents((current) =>
      current.map((student) => idSet.has(student.id) ? { ...student, groupIds } : student)
    );
    setGroups((current) => current.map((group) => ({
      ...group,
      studentIds: groupIds.includes(group.id)
        ? Array.from(new Set([...group.studentIds, ...studentIds]))
        : group.studentIds.filter((id) => !idSet.has(id)),
    })));
  };

  const updateStudentGroups = async (studentId: string, groupIds: string[]) => {
    const response = await fetch(`${API_BASE}/api/students/${encodeURIComponent(studentId)}/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds }),
    });
    await readApiResponse(response, '無法更新學生班級');
    invalidateTeacherData('/api/students');
    applyGroupAssignment([studentId], groupIds);
  };

  const updateStudentsGroups = async (studentIds: string[], groupIds: string[]) => {
    const response = await fetch(`${API_BASE}/api/students/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds, groupIds }),
    });
    await readApiResponse(response, '無法更新學生班級');
    invalidateTeacherData('/api/students');
    applyGroupAssignment(studentIds, groupIds);
  };

  const removeStudentFromGroup = (groupId: string, studentId: string) => {
    const student = studentById(studentId);
    if (!student) return;
    void updateStudentGroups(studentId, (student.groupIds || []).filter((id) => id !== groupId)).catch((error) => {
      showAlert({ title: uiText('更新失敗'), message: (error as Error).message, tone: 'danger' });
    });
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  };

  const openAssignStudent = (studentId: string) => {
    const student = studentById(studentId);
    setAssignStudent({
      studentIds: [studentId],
      selectedGroupIds: student?.groupIds || [],
    });
  };

  // 批量加入班級：唔預先剔任何班級。呢個係 replace 唔係 add，幾位學生原本嘅班級
  // 可以唔同，預先剔邊個都係靠估 —— 由空白開始俾老師自己揀。
  // 亦唔會清走 selection：老師撳「取消」返出嚟，原本剔好嘅人仲喺度。
  const openBatchAssign = () => {
    if (!effectiveSelectedIds.length) return;
    setAssignStudent({ studentIds: effectiveSelectedIds, selectedGroupIds: [] });
  };

  const toggleUnassignedSelected = (studentId: string) => {
    setSelectedUnassignedIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  };

  const toggleSelectAllUnassigned = () => {
    setSelectedUnassignedIds(allUnassignedSelected ? [] : unassignedStudents.map((student) => student.id));
  };

  const toggleAssignGroup = (groupId: string) => {
    setAssignStudent((current) => ({
      ...current,
      selectedGroupIds: current.selectedGroupIds.includes(groupId)
        ? current.selectedGroupIds.filter((id) => id !== groupId)
        : [...current.selectedGroupIds, groupId],
    }));
  };

  const saveAssignStudent = async () => {
    const { studentIds, selectedGroupIds } = assignStudent;
    if (!studentIds.length) return;
    setIsSaving(true);
    try {
      if (studentIds.length === 1) {
        await updateStudentGroups(studentIds[0], selectedGroupIds);
        // 只清走今次真正分咗組嘅人，唔係一炮清空：老師可能仲想處理剔剩嗰啲。
        setSelectedUnassignedIds((current) => current.filter((id) => id !== studentIds[0]));
      } else {
        // 「全選」可能幾百人，但 PUT /api/students/groups 一次最多收 100 個 id，
        // 所以前端自己切批送；一批搞掂就照舊靜靜雞完成，真係切過批先報數。
        const { done, batchCount, error } = await runChunkedBatches(studentIds, (batch) =>
          updateStudentsGroups(batch, selectedGroupIds)
        );
        // 同上：只清走真正分咗組嘅人，中途失敗嗰啲留住剔選俾老師即刻再試。
        const doneSet = new Set(done);
        setSelectedUnassignedIds((current) => current.filter((id) => !doneSet.has(id)));
        if (error && !done.length) {
          showAlert({ title: uiText('更新失敗'), message: error.message, tone: 'danger' });
        } else if (error) {
          showAlert({
            title: uiText('部分學生未能加入班級'),
            message: uiTemplate('已將 {0} 位學生加入班級，其餘 {1} 位未能處理，請再試一次。', done.length, studentIds.length - done.length),
            details: [error.message],
            tone: 'danger',
          });
        } else if (batchCount > 1 && selectedGroupIds.length) {
          // 冇揀班級就送出＝原封不動（未分組學生本來就冇班級），唔可以報「已加入班級」。
          showAlert({
            title: uiText('已加入班級'),
            message: uiTemplate('已將 {0} 位學生加入班級。', done.length),
            tone: 'info',
          });
        }
      }
      setAssignStudent({ studentIds: [], selectedGroupIds: [] });
    } catch (error) {
      showAlert({ title: uiText('更新失敗'), message: (error as Error).message, tone: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  // 一定要喺 component 入面砌：uiText 係睇當下語言，擺喺 module scope 會凍結語言。
  const skippedReasonText: Record<RosterSkipReason, string> = {
    'invalid-email': uiText('電郵格式唔正確'),
    'duplicate-email': uiText('電郵同上面嘅行重複'),
  };

  const applyParsedRoster = (parsed: RosterParseResult) => {
    setBulkRows(parsed.rows);
    setBulkSkipped(parsed.skipped);
  };

  const handleImportFile = async (file: File) => {
    const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
    if (!acceptedImportExtensions.includes(extension)) {
      showAlert({
        title: uiText('格式不支援'),
        message: uiText('請選擇 Excel（.xlsx）、CSV、TSV 或 TXT 檔案。'),
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

    if (file.size > MAX_ROSTER_FILE_BYTES) {
      showAlert({
        title: uiText('檔案太大'),
        message: uiTemplate('名單檔案唔可以大過 {0} MB。', Math.round(MAX_ROSTER_FILE_BYTES / 1024 / 1024)),
        tone: 'info',
      });
      return;
    }

    if (extension === '.xlsx') {
      try {
        applyParsedRoster(await parseRosterWorkbook(await file.arrayBuffer()));
      } catch (error) {
        showAlert({ title: uiText('讀取不到 Excel 檔案'), message: (error as Error).message, tone: 'danger' });
        return;
      }
      // 檔案同文字框二選一：唔清走舊文字，老師會以為兩份名單都匯咗。
      setBulkText('');
      return;
    }

    const text = await file.text();
    setBulkText(text);
    applyParsedRoster(parseRosterText(text));
  };

  const handleDropFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    await handleImportFile(file);
  };

  const removeBulkRow = (email: string) => {
    const nextRows = bulkRows.filter((row) => row.email !== email);
    setBulkRows(nextRows);
    setBulkText(formatRosterRowsAsText(nextRows));
  };

  const applyBulkStudents = async () => {
    setIsSaving(true);
    const skipped = bulkSkipped;
    try {
      const response = await fetch(`${API_BASE}/api/students/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 冇班級嘅行送 className: ''，server 會當「唔分班」——同唔送係一樣。
        body: JSON.stringify({ students: bulkRows }),
      });
      const data = await readApiResponse(response, '無法匯入學生');
      invalidateTeacherData('/api/students');
      // 一定要重新載入，唔可以自己砌：新開嘅班級淨係喺 server 度有 id，
      // 而班級卡嘅成員係由 group.studentIds 推導出嚟，唔重載就見唔到新班。
      try {
        const refreshed = await loadTeacherData<{ students?: PermissionStudent[]; groups?: PermissionGroup[] }>('/api/students');
        setStudents(Array.isArray(refreshed.students) ? refreshed.students : []);
        setGroups(Array.isArray(refreshed.groups) ? refreshed.groups : []);
      } catch {
        // 匯入已經成功，重新載入失敗唔應該報成匯入失敗。cache 已經清咗，下次入頁會再載。
      }
      setBulkText('');
      setBulkRows([]);
      setBulkSkipped([]);
      setShowBulkModal(false);

      const created = data.students.filter((student: any) => student.created && student.temporaryPassword);
      const total = data.students.length;
      const importedClasses: ImportedClassSummary[] = Array.isArray(data.groups) ? data.groups : [];
      const lines = [uiTemplate('共 {0} 位學生已加入，其中 {1} 位為新帳戶，{2} 位之前已在名單。', total, created.length, total - created.length)];
      if (importedClasses.length) {
        const newClasses = importedClasses.filter((group) => group.created).length;
        lines.push(
          newClasses
            ? uiTemplate('已分班：{0} 個班級，其中 {1} 個係新開嘅。', importedClasses.length, newClasses)
            : uiTemplate('已分班：{0} 個班級。', importedClasses.length)
        );
        lines.push(...importedClasses.map((group) => uiTemplate('班級 {0}：{1} 位學生', group.name, group.studentCount)));
      }
      if (skipped.length) lines.push(uiTemplate('另外有 {0} 行冇匯入，請睇下面嘅原因。', skipped.length));
      if (created.length) lines.push(uiText('請將以下臨時密碼交給學生。'));

      showAlert({
        title: uiText('匯入完成'),
        // 名單長短都要睇得到按鈕：摘要只出統計，逐行嘅臨時密碼同失敗原因交俾
        // details 用可捲動列表顯示（彈窗自己會收埋長名單）。
        message: lines.join('\n'),
        details: [
          ...skipped.map((row) => uiTemplate('第 {0} 行：{1}', row.line, skippedReasonText[row.reason])),
          ...created.map((student: any) => `${student.email}: ${student.temporaryPassword}`),
        ],
        tone: 'info',
      });
    } catch (error) {
      showAlert({ title: uiText('匯入失敗'), message: (error as Error).message, tone: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">{uiText('學生管理')}</h1>
          <p className="mt-2 text-sm text-slate-500">{uiText('管理學生帳戶與班級。')}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm font-bold text-indigo-600">
          {uiText('正在從資料庫載入學生與班級…')}
        </div>
      ) : null}

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
              disabled={isSaving}
              onClick={() => void addStudent()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-slate-400">
                    {unassignedStudents.length}{uiText(' 位學生')}
                  </span>
                  <button
                    type="button"
                    onClick={toggleSelectAllUnassigned}
                    className="inline-flex items-center gap-2 text-xs font-black text-slate-500 transition hover:text-indigo-600"
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${allUnassignedSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {allUnassignedSelected ? uiText('取消全選') : uiText('全選')}
                  </button>
                </div>

                {effectiveSelectedIds.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/60 px-3 py-2">
                    <span className="text-xs font-black text-indigo-700">
                      {uiTemplate('已選 {0} 位學生', effectiveSelectedIds.length)}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={openBatchAssign}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {uiText('加入班級')}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={removeSelectedUnassigned}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-black text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {uiText('移除')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedUnassignedIds([])}
                        title={uiText('清除')}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* 一行拆三個兄弟 button（唔可以將剔號塞入原本嗰個 button 度 —— button 包 button
                    係無效 HTML）。三個都係獨立撳得，所以唔使 stopPropagation。 */}
                {unassignedStudents.map((student) => {
                  const selected = selectedUnassignedIds.includes(student.id);
                  return (
                    <div
                      key={student.id}
                      className={`flex items-center gap-2 rounded-2xl border bg-white py-2.5 pl-3 pr-2 transition ${selected ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 hover:border-indigo-200'}`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        aria-label={student.fullName}
                        onClick={() => toggleUnassignedSelected(student.id)}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-transparent hover:border-indigo-300'}`}
                      >
                        {selected ? <Check className="h-4 w-4" /> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAssignStudent(student.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition hover:bg-indigo-50/40"
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
                      <button
                        type="button"
                        onClick={() => removeStudent(student.id)}
                        title={uiText('移除')}
                        className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </>
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
              assignedPreviewStudents.map((student) => {
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
            {assignedExtraStudentCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllAssignedStudentsModal(true)}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-3 text-sm font-black text-indigo-600 transition hover:bg-indigo-50"
              >
                {uiTemplate('查看全部 {0} 位學生', visibleAssignedStudents.length)}
                <ChevronDown className="h-4 w-4" />
              </button>
            ) : null}
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
                disabled={isSaving}
                onClick={() => void addGroup()}
                className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
                        <p className="py-2 text-sm text-slate-400">{uiText('此班級暫無學生')}</p>
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
          <div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto relative flex max-h-[90vh] w-[min(720px,100%)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)]"
            >
              {/* 中間名單要用 flex 撐，唔可以靠 max-h-[calc(90vh-132px)] 估高度：
                  header + footer 實際高過 132px，內容就會高出卡片，俾
                  overflow-hidden 剪咗底部——「取消」同「匯入」兩粒掣會俾切一半。
                  表頭同底部固定，只有中間嗰格捲。 */}
              <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <h3 className="text-xl font-black text-slate-900">{uiText('匯入學生名單')}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {uiText('上傳 Excel / CSV 檔案，或直接貼上名單，每行一個學生。')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkText('');
                    setBulkRows([]);
                    setBulkSkipped([]);
                  }}
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".xlsx,.csv,.tsv,.txt,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,text/csv,text/tab-separated-values,text/plain"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImportFile(file);
                    // 同一個檔案揀兩次都要再觸發 onChange，否則老師改完個 Excel 再上傳會冇反應。
                    event.target.value = '';
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
                    <span className="mt-2 text-sm font-black text-indigo-700">{uiText('拖放 Excel / CSV 檔')}</span>
                    <span className="mt-1 text-xs text-slate-500">{uiText('或點擊選擇檔案')}</span>
                  </button>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                    {uiText('格式說明')}
                    <div className="mt-1 text-slate-600">
                      {uiText('每行格式')}
                      <br />
                      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-700">{uiText('姓名, 班級, email')}</code>
                    </div>
                    <div className="mt-2 text-slate-600">
                      {uiText('班級填 3A、5B 就自動分班；冇填就只開帳號。')}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void downloadRosterTemplate({
                          fileName: uiText('學生名單範本'),
                          sheetName: uiText('學生名單'),
                        })
                      }
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-black text-indigo-600 transition hover:bg-indigo-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {uiText('下載 Excel 範本')}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm font-black text-slate-700">{uiText('貼上名單')}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkText('');
                      setBulkRows([]);
                      setBulkSkipped([]);
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
                    applyParsedRoster(parseRosterText(event.target.value));
                  }}
                  rows={6}
                  placeholder={'姓名, 班級, email\n陳小明, 3A, student1@school.hk\n李美玲, 5B, student2@school.hk'}
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
                          <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-black text-indigo-600">
                            {row.className || uiText('不分班')}
                          </span>
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
                    {bulkRows.length > MAX_ROSTER_ROWS ? (
                      <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
                        {uiTemplate('一次最多匯入 {0} 位學生，請分開幾次上傳。', MAX_ROSTER_ROWS)}
                      </p>
                    ) : null}
                  </div>
                ) : bulkText.trim() ? (
                  <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
                    {uiText('未偵測到有效學生資料。請確認每行至少包含姓名和電郵，且電郵應包含 @。')}
                  </p>
                ) : null}

                {bulkSkipped.length ? (
                  <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                    <div className="text-sm font-black text-amber-700">
                      {uiTemplate('有 {0} 行冇匯入', bulkSkipped.length)}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                      {bulkSkipped.map((row) => (
                        <li key={`${row.line}-${row.reason}`}>
                          {uiTemplate('第 {0} 行：{1}', row.line, skippedReasonText[row.reason])}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkText('');
                    setBulkRows([]);
                    setBulkSkipped([]);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  {uiText('取消')}
                </button>
                <button
                  type="button"
                  disabled={bulkRows.length === 0 || bulkRows.length > MAX_ROSTER_ROWS || isSaving}
                  onClick={() => void applyBulkStudents()}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {uiTemplate('匯入 {0} 位學生', bulkRows.length)}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
        {showAllAssignedStudentsModal ? (
          <div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto relative max-h-[90vh] w-[min(720px,100%)] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)]"
            >
              <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <h3 className="text-xl font-black text-slate-900">{uiText('我的學生')}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {uiTemplate('顯示 {0} 位已加入班級嘅學生', visibleAssignedStudents.length)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllAssignedStudentsModal(false)}
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[calc(90vh-132px)] space-y-2 overflow-y-auto px-6 py-5">
                {visibleAssignedStudents.map((student) => {
                  const groupsNames = groups
                    .filter((group) => student.groupIds?.includes(group.id))
                    .map((group) => group.name);
                  return (
                    <div
                      key={student.id}
                      onClick={() => {
                        setShowAllAssignedStudentsModal(false);
                        openAssignStudent(student.id);
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                    >
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
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowAllAssignedStudentsModal(false);
                          openAssignStudent(student.id);
                        }}
                        className="rounded-lg p-2 text-indigo-400 transition hover:bg-indigo-50 hover:text-indigo-700"
                        title={uiText('編輯班級')}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        ) : null}
        {assignStudent.studentIds.length > 0 ? (
          <div className="fixed inset-0 z-[95]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAssignStudent({ studentIds: [], selectedGroupIds: [] })}
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
                      {assignStudent.studentIds.length === 1
                        ? uiTemplate('為 {0} 選擇所屬班級', studentById(assignStudent.studentIds[0])?.fullName || '')
                        : uiTemplate('為 {0} 位學生選擇班級', assignStudent.studentIds.length)}
                    </p>
                  </div>
                  <button type="button" onClick={() => setAssignStudent({ studentIds: [], selectedGroupIds: [] })} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
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
                    disabled={isSaving}
                    onClick={() => void saveAssignStudent()}
                    className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {assignStudent.studentIds.length === 1
                      ? uiText('儲存')
                      : uiTemplate('加入 {0} 位學生', assignStudent.studentIds.length)}
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
        details={dialog.details}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        tone={dialog.tone}
        onClose={closeDialog}
        onConfirm={dialog.onConfirm || undefined}
      />
    </div>
  );
};
