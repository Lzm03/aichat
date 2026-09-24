import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// platform 一定要係 browser：xlsx 嘅 browser 欄位會將 fs/stream/crypto 換成空殼，
// 打包出嚟先可以喺 data: URL 度跑。node 平台會留低 require('stream')，一 import 就爆。
const result = await build({
  stdin: { contents: "export * from './utils/student-roster';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'browser', write: false,
});
const {
  ROSTER_TEMPLATE_HEADERS,
  buildRosterTemplateBuffer,
  formatRosterRowsAsText,
  mergeGradeClass,
  parseRosterText,
  parseRosterWorkbook,
} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('中文表頭：姓名、班級、年級、email 各自歸位', () => {
  const { rows, skipped } = parseRosterText(
    '姓名,班級,年級,email\n陳小明,3A,P3,student1@school.hk\n李美玲,B,P3,student2@school.hk'
  );
  assert.deepEqual(skipped, []);
  assert.deepEqual(rows, [
    { fullName: '陳小明', email: 'student1@school.hk', className: '3A' },
    { fullName: '李美玲', email: 'student2@school.hk', className: '3B' },
  ]);
});

test('班級本身有數字就原封不動，唔會被年級污染', () => {
  assert.equal(mergeGradeClass('S3', 'S3A'), 'S3A', '「S3A」唔可以變成「3S3A」');
  assert.equal(mergeGradeClass('P3', '3A'), '3A');
  assert.equal(mergeGradeClass('', '5B'), '5B');
  assert.equal(mergeGradeClass('P3', 'A'), '3A');
  assert.equal(mergeGradeClass('3年級', 'B'), '3B');
  assert.equal(mergeGradeClass('中一', 'B'), '中一B');
});

test('冇班級就唔分班；年級單獨存在唔會變班名', () => {
  assert.equal(mergeGradeClass('P3', ''), '', '得年級唔可以開出一個叫「3」嘅班');
  assert.equal(mergeGradeClass('P3', '   '), '');
  const { rows } = parseRosterText('姓名,email\n陳小明,student1@school.hk');
  assert.equal(rows[0].className, '');
});

test('英文表頭、tab 分隔、欄位次序任執', () => {
  const { rows, skipped } = parseRosterText('email\tClass\tName\nstudent1@school.hk\t3A\t陳小明');
  assert.deepEqual(skipped, []);
  assert.deepEqual(rows[0], { fullName: '陳小明', email: 'student1@school.hk', className: '3A' });
});

test('表頭上面有標題行都認得', () => {
  const { rows, skipped } = parseRosterText(
    ['2026-09 年度中一級學生名單', '姓名,班級,email', '陳小明,3A,student1@school.hk'].join('\n')
  );
  assert.deepEqual(skipped, [], '標題行唔應該當成失敗');
  assert.deepEqual(rows, [{ fullName: '陳小明', email: 'student1@school.hk', className: '3A' }]);
});

test('冇表頭就沿用舊格式：最後一格係電郵、前面當姓名', () => {
  const { rows, skipped } = parseRosterText('陳小明, student1@school.hk\n王小明\tstudent2@school.hk');
  assert.deepEqual(skipped, []);
  assert.deepEqual(rows, [
    { fullName: '陳小明', email: 'student1@school.hk', className: '' },
    { fullName: '王小明', email: 'student2@school.hk', className: '' },
  ]);
});

test('失敗行要有行號同事由，老師先追得返係邊行出事', () => {
  const { rows, skipped } = parseRosterText(
    [
      '姓名,班級,email', // 1
      '陳小明,3A,student1@school.hk', // 2
      '冇電郵,3A,', // 3
      '格式錯,3A,student2@school', // 4
      '重複,3B,STUDENT1@SCHOOL.HK', // 5
      '', // 6
    ].join('\n')
  );
  assert.deepEqual(rows.map((row) => row.email), ['student1@school.hk'], '電郵要轉細寫再比對重複');
  assert.deepEqual(skipped, [
    { line: 3, reason: 'invalid-email' },
    { line: 4, reason: 'invalid-email' },
    { line: 5, reason: 'duplicate-email' },
  ], '空行唔算失敗');
});

test('全形逗號、多餘空白都食得住', () => {
  const { rows } = parseRosterText('姓名，班級，email\n 陳小明 ， 3A ， student1@school.hk ');
  assert.deepEqual(rows, [{ fullName: '陳小明', email: 'student1@school.hk', className: '3A' }]);
});

test('刪行之後砌返嘅文字仍然帶表頭，班級唔會跌返落姓名度', () => {
  const { rows } = parseRosterText('姓名,班級,email\n陳小明,3A,student1@school.hk\n王小明,5B,student2@school.hk');
  const text = formatRosterRowsAsText([rows[0]]);
  assert.deepEqual(parseRosterText(text), {
    rows: [{ fullName: '陳小明', email: 'student1@school.hk', className: '3A' }],
    skipped: [],
  });
  // 有逗號嘅姓名要 quote 得住，唔可以切錯欄
  const quoted = formatRosterRowsAsText([{ fullName: '陳,小明', email: 'a@b.hk', className: '3A' }]);
  assert.deepEqual(parseRosterText(quoted).rows[0], { fullName: '陳,小明', email: 'a@b.hk', className: '3A' });
});

test('範本檔讀返出嚟即刻可以匯入', async () => {
  const buffer = await buildRosterTemplateBuffer();
  const { rows, skipped } = await parseRosterWorkbook(buffer);
  assert.deepEqual(ROSTER_TEMPLATE_HEADERS, ['姓名', '班級', '年級', 'email'], '範本表頭一定要同解析器夾得埋');
  assert.deepEqual(skipped, []);
  assert.deepEqual(rows, [
    { fullName: '陳小明', email: 'student1@school.hk', className: '3A' },
    { fullName: '李美玲', email: 'student2@school.hk', className: '3A' },
    { fullName: '王小明', email: 'student3@school.hk', className: '5B' },
  ]);
});
