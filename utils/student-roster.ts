// 學生名單匯入的前端解析層：文字（CSV/TSV）同 Excel（.xlsx）都收斂成同一組
// 學生資料，再交去 POST /api/students/import。
//
// 分兩層係故意的：rowsToRoster 只做「一格一格嘅字串 → 學生」，唔碰瀏覽器 API，
// 所以可以直接寫單元測試；xlsx 嘅讀寫留喺下面嘅 async 函數，用 dynamic import
// 令 SheetJS 只喺老師真係拖 Excel 入嚟嗰下先下載。
//
// 注意：呢個檔唔會俾 tests/ui-i18n.test.mjs 掃到（佢只掃 App.tsx、pages/、components/），
// 所以呢度唔可以出現會顯示俾老師睇嘅中文——訊息一律由 page 傳入或者用 reason code。

export type RosterStudent = {
  fullName: string;
  email: string;
  /** 班級名（已併入年級）；冇班級資料就係空字串＝匯入時唔分班。 */
  className: string;
};

export type RosterSkipReason = 'invalid-email' | 'duplicate-email';

export type RosterSkippedRow = {
  /** 原檔嘅行號（文字檔＝第幾行，Excel＝工作表第幾列），由 1 起。 */
  line: number;
  reason: RosterSkipReason;
};

export type RosterParseResult = {
  rows: RosterStudent[];
  /** 睇得到、講得出邊行出事嘅失敗行，唔係淨係一個數。 */
  skipped: RosterSkippedRow[];
};

// 同 server 嘅 normalizeStudentInput 用同一個規則。前端先擋一次係必要的：
// /import 係 all-or-nothing，一行格式錯就會令成批匯入失敗。
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 名單檔案上限；再大就唔似係一份名單，讀落去只會卡住老師部機。 */
export const MAX_ROSTER_FILE_BYTES = 5 * 1024 * 1024;

/** server POST /import 嘅硬上限，超過就要分批。 */
export const MAX_ROSTER_ROWS = 500;

type ColumnKey = 'fullName' | 'email' | 'className' | 'grade';

/** 表頭別名。比對前會去掉空白同轉細寫，所以中文英文都食。 */
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  fullName: ['姓名', '名字', '學生姓名', '學生', 'name', 'full name', 'student name', 'student'],
  email: ['email', 'e-mail', '電郵地址', '電郵', '電子郵件', '郵箱', '信箱', 'mail'],
  className: ['班級', '班別', '班', 'class', 'class name'],
  grade: ['年級', '級別', 'grade', 'year', 'level'],
};

// 長 alias 優先：'email' 一定要贏 'mail'、'學生姓名' 一定要贏 '學生'，
// 否則「Student Email」會被當成姓名欄。
const SORTED_ALIASES: Array<[string, ColumnKey]> = Object.entries(COLUMN_ALIASES)
  .flatMap(([key, aliases]) => aliases.map((alias) => [alias.toLowerCase(), key as ColumnKey] as [string, ColumnKey]))
  .sort((a, b) => b[0].length - a[0].length);

function matchColumn(value: string): ColumnKey | null {
  const cell = String(value || '').replace(/[\s:：]/g, '').toLowerCase();
  if (!cell) return null;
  for (const [alias, key] of SORTED_ALIASES) {
    if (cell === alias) return key;
  }
  for (const [alias, key] of SORTED_ALIASES) {
    if (cell.includes(alias)) return key;
  }
  return null;
}

type ColumnMap = Partial<Record<ColumnKey, number>>;

/** 喺頭幾行搵表頭，容忍上面嘅標題行。 */
const HEADER_SCAN_LIMIT = 5;

/** 認得出表頭就回欄位位置；認唔到（例如第一行已經係資料）回 null。 */
function detectHeader(row: string[]): ColumnMap | null {
  const map: ColumnMap = {};
  row.forEach((cell, index) => {
    const key = matchColumn(cell);
    if (key && map[key] === undefined) map[key] = index;
  });
  // 冇姓名或者冇電郵欄，就當呢行唔係表頭，唔可以靠佢定位。
  if (map.fullName === undefined || map.email === undefined) return null;
  return map;
}

function cellAt(row: string[], index: number | undefined): string {
  if (index === undefined) return '';
  return String(row[index] ?? '').trim();
}

/**
 * 年級併入班級名。
 *
 * 老師慣例係直接寫「3A」「5B」，所以班級本身有數字就原封不動用（連「S3A」都唔會
 * 被年級「S3」污染）；淨係得字母（「A」「B」）先會攞年級嘅數字拼埋一齊。
 * 冇班級就當唔分班——年級單獨存在唔會變班名，免得開出「3」呢種垃圾班。
 */
export function mergeGradeClass(grade: string, className: string): string {
  const klass = String(className || '').trim();
  if (!klass) return '';
  if (/\d/.test(klass)) return klass;
  const token = gradeToken(grade);
  return token ? `${token}${klass}` : klass;
}

/** 「P3」→「3」、「3年級」→「3」、「Grade 4」→「4」；冇數字就淨低文字（「中一」）。 */
function gradeToken(grade: string): string {
  const text = String(grade || '').trim();
  if (!text) return '';
  const digits = text.match(/\d+/);
  if (digits) return digits[0];
  return text.replace(/[年級级别班\s]/g, '');
}

/**
 * 由一格一格嘅字串砌出名單。CSV 同 Excel 都行呢條路。
 * 冇表頭就退回舊行為：最後一格係電郵，前面全部當姓名（唔會有班級）。
 */
export function rowsToRoster(rows: string[][]): RosterParseResult {
  const clean = rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : []));
  const firstIndex = clean.findIndex((row) => row.some(Boolean));
  if (firstIndex === -1) return { rows: [], skipped: [] };

  // 表頭未必係第一行：學校出嘅名單好常有「2026-09 中一級名單」呢類標題行壓喺頂，
  // 所以喺頭幾行搵一次真表頭，搵唔到先當係冇表頭嘅舊格式。
  let header: ColumnMap | null = null;
  let bodyStart = firstIndex;
  for (let index = firstIndex; index < Math.min(clean.length, firstIndex + HEADER_SCAN_LIMIT); index += 1) {
    const candidate = detectHeader(clean[index]);
    if (candidate) {
      header = candidate;
      bodyStart = index + 1;
      break;
    }
  }

  const output: RosterStudent[] = [];
  const skipped: RosterSkippedRow[] = [];
  const seenEmails = new Set<string>();

  for (let index = bodyStart; index < clean.length; index += 1) {
    const row = clean[index];
    const line = index + 1;
    if (!row.some(Boolean)) continue; // 全空行唔算失敗
    // 冇表頭時得一格嘅行當係標題或者雜項（一行根本冇可能同時有姓名同電郵），
    // 同舊版一樣靜靜地唔理，唔計入失敗數。
    if (!header && row.filter(Boolean).length < 2) continue;

    if (header) {
      const email = cellAt(row, header.email).toLowerCase();
      if (!EMAIL_PATTERN.test(email)) {
        skipped.push({ line, reason: 'invalid-email' });
        continue;
      }
      if (seenEmails.has(email)) {
        skipped.push({ line, reason: 'duplicate-email' });
        continue;
      }
      seenEmails.add(email);
      const fullName = cellAt(row, header.fullName);
      output.push({
        fullName: fullName || email,
        email,
        className: mergeGradeClass(cellAt(row, header.grade), cellAt(row, header.className)),
      });
      continue;
    }

    const cells = row.filter(Boolean);
    const email = cells[cells.length - 1].toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      skipped.push({ line, reason: 'invalid-email' });
      continue;
    }
    if (seenEmails.has(email)) {
      skipped.push({ line, reason: 'duplicate-email' });
      continue;
    }
    seenEmails.add(email);
    const fullName = cells.slice(0, -1).join(' ').trim();
    output.push({ fullName: fullName || email, email, className: '' });
  }

  return { rows: output, skipped };
}

/**
 * 切一格一行。逗號、全角逗號、tab 都當分隔符，另外認得 "..." 包住嘅分隔符——
 * formatRosterRowsAsText 會 quote 有逗號嘅姓名，切唔啱就會整個名單歪一格。
 * 引號只會喺一格嘅開頭先當係引號，中間嘅「"」係人名一部分。
 */
function splitDelimitedLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' && !current) {
      inQuotes = true;
      continue;
    }
    if (char === ',' || char === '，' || char === '\t') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** 貼上或者上傳 CSV／TSV：逗號、全角逗號、tab 都當分隔符。 */
export function parseRosterText(text: string): RosterParseResult {
  const rows = String(text || '')
    .split(/\r?\n/)
    .map((line) => splitDelimitedLine(line));
  return rowsToRoster(rows);
}

/**
 * 刪走預覽入面一行之後，要砌返文字出嚟俾 textarea。連表頭一齊出，否則下一次
 * 再解析會跌返落「冇表頭」嗰條路，班級就會俾人當成姓名嘅一部分。
 */
export function formatRosterRowsAsText(rows: RosterStudent[]): string {
  return [
    ROSTER_TEMPLATE_HEADERS.join(', '),
    ...rows.map((row) => [row.fullName, row.className, '', row.email].map(quoteCsvCell).join(', ')),
  ].join('\n');
}

function quoteCsvCell(value: string): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 只讀第一個工作表——老師嘅名單範本只有一張表。 */
export async function parseRosterWorkbook(data: ArrayBuffer): Promise<RosterParseResult> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(data, { type: 'array', dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], skipped: [] };
  const sheet = workbook.Sheets[sheetName];
  // raw: false 好緊要：班級填「3」呢類數字格，唔轉字串就會變 numeric cell。
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown as string[][];
  return rowsToRoster(rows);
}

export const ROSTER_TEMPLATE_HEADERS = ['姓名', '班級', '年級', 'email'];

// 年級同班級分開填都食得（B ＋ P3 → 3B），但最緊要係電郵一定要有。
const ROSTER_TEMPLATE_SAMPLES = [
  ['陳小明', '3A', 'P3', 'student1@school.hk'],
  ['李美玲', '3A', 'P3', 'student2@school.hk'],
  ['王小明', '5B', 'P5', 'student3@school.hk'],
];

/** 範本檔嘅內容。工作表名同檔名都由 page 傳入（要翻譯）。 */
export async function buildRosterTemplateBuffer(sheetName = 'Sheet1'): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([ROSTER_TEMPLATE_HEADERS, ...ROSTER_TEMPLATE_SAMPLES]);
  sheet['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 26 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

/**
 * 同 utils/assessment-csv.ts 一樣嘅下載手法：Blob + 隱藏 anchor，唔加依賴。
 * 檔名同工作表名由 page 傳入，因為呢個檔唔可以出中文字（見檔頭註解）。
 */
export async function downloadRosterTemplate(options: { fileName: string; sheetName: string }): Promise<void> {
  const buffer = await buildRosterTemplateBuffer(options.sheetName);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.fileName.endsWith('.xlsx') ? options.fileName : `${options.fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
