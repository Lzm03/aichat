import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// 課堂參與度分類純函數（server/lib/engagement.ts 零 import，直接 bundle 就測得到）
const result = await build({
  stdin: { contents: "export * from './server/lib/engagement';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const { parseEngagement, classifyEngagement, JUDGE_SUBSTANTIVE_MIN } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);

test('parseEngagement 解到兩個索引 array', () => {
  const verdict = parseEngagement(
    '{"demonstrated":["kp_1"],"engagement":{"meaningless":[0],"effective":[2]}}',
    3
  );
  assert.ok(verdict);
  assert.deepEqual([...verdict.meaningless], [0]);
  assert.deepEqual([...verdict.effective], [2]);
});

test('fence block 包住嘅 JSON 都解得返（同 parseDemonstrated 策略）', () => {
  const verdict = parseEngagement(
    '```json\n{"engagement":{"meaningless":[1],"effective":[]}}\n```',
    2
  );
  assert.ok(verdict);
  assert.deepEqual([...verdict.meaningless], [1]);
  assert.deepEqual([...verdict.effective], []);
});

test('index 越界／非整數 → null（caller 落 heuristic fallback，唔可以靜靜當 pass）', () => {
  assert.equal(parseEngagement('{"engagement":{"meaningless":[5],"effective":[]}}', 3), null);
  assert.equal(parseEngagement('{"engagement":{"meaningless":[-1],"effective":[]}}', 3), null);
  assert.equal(parseEngagement('{"engagement":{"meaningless":["x"],"effective":[]}}', 3), null);
  assert.equal(parseEngagement('{"engagement":{"meaningless":[1.5],"effective":[]}}', 3), null);
});

test('欄位缺失／半爛 JSON → null', () => {
  assert.equal(parseEngagement('{"demonstrated":[]}', 3), null);
  assert.equal(parseEngagement('{"engagement":{"meaningless":[0]}}', 3), null);
  assert.equal(parseEngagement('not json at all', 3), null);
  assert.equal(parseEngagement('', 3), null);
});

test('零條新訊息：兩個 array 都要空先算有效', () => {
  assert.ok(parseEngagement('{"engagement":{"meaningless":[],"effective":[]}}', 0));
  assert.equal(parseEngagement('{"engagement":{"meaningless":[0],"effective":[]}}', 0), null);
});

test('classifyEngagement llm 路徑：meaningless 優先、冇 index = substantive', () => {
  const verdict = { meaningless: new Set([0]), effective: new Set([1]) };
  const counts = classifyEngagement(
    [{ content: '哦' }, { content: '點解要學呢課？' }, { content: '我明白咗' }],
    verdict
  );
  assert.deepEqual(counts, {
    substantive: 2,
    effective: 1,
    meaningless: 1,
    judgeSource: 'llm',
  });
  // 重複 index：meaningless 贏
  const dup = { meaningless: new Set([1]), effective: new Set([1]) };
  assert.equal(classifyEngagement([{ content: 'a' }, { content: 'b' }], dup).meaningless, 1);
  assert.equal(classifyEngagement([{ content: 'a' }, { content: 'b' }], dup).effective, 0);
});

test('classifyEngagement heuristic：字數門檻、effective 恒 0（分唔出提問）', () => {
  const counts = classifyEngagement(
    [{ content: '哦' }, { content: '點解要學呢課？' }, { content: '  ' }],
    null
  );
  assert.deepEqual(counts, {
    substantive: 1,
    effective: 0,
    meaningless: 2,
    judgeSource: 'heuristic-fallback',
  });
});

test('字數門檻同 answer-judge 預濾一致（JUDGE_SUBSTANTIVE_MIN = 4）', () => {
  assert.equal(JUDGE_SUBSTANTIVE_MIN, 4);
});
