import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({
  stdin: { contents: "export * from './utils/chat-prompt';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const { assignStableKnowledgePointIds, nextKnowledgePointId } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);

const point = (id, title) => ({ id, tier: 'basic_fact', title, content: `${title} 內容`, keywords: [] });

test('重新提取時 title 無變嘅知識點保留舊 id（LLM 號碼唔同都認）', () => {
  const previous = [point('kp_001', '秦朝統一六國'), point('kp_002', '萬里長城')];
  const incoming = [point('kp_003', '秦朝統一六國'), point('kp_009', '萬里長城')];
  assert.deepEqual(
    assignStableKnowledgePointIds(incoming, previous).map((item) => item.id),
    ['kp_001', 'kp_002']
  );
});

test('title 對唔上嘅點派新 id，喺所有出現過嘅號之上', () => {
  const previous = [point('kp_001', '秦朝統一六國'), point('kp_002', '萬里長城')];
  const incoming = [point('kp_001', '秦朝統一六國'), point('kp_002', '漢匈戰爭')];
  assert.deepEqual(
    assignStableKnowledgePointIds(incoming, previous).map((item) => item.id),
    ['kp_001', 'kp_003']
  );
});

test('位置性 id 唔會被當成有效 id 保留', () => {
  // 舊版行為：照位重編，令 kp_001 由「秦朝統一六國」變成「漢匈戰爭」，
  // 學生嗰個 ✓ 就對錯知識點。呢個係整個修正嘅核心回歸測試。
  const previous = [point('kp_001', '秦朝統一六國')];
  const incoming = [point('kp_001', '漢匈戰爭')];
  assert.notEqual(assignStableKnowledgePointIds(incoming, previous)[0].id, 'kp_001');
});

test('同一批入面 title 重複都會派唔同 id', () => {
  const incoming = [point('kp_001', '萬里長城'), point('kp_002', '萬里長城')];
  const ids = assignStableKnowledgePointIds(incoming, []).map((item) => item.id);
  assert.equal(new Set(ids).size, 2);
});

test('title 前後空白唔影響配對', () => {
  const previous = [point('kp_005', '  萬里長城  ')];
  const incoming = [point('kp_001', '萬里長城')];
  assert.equal(assignStableKnowledgePointIds(incoming, previous)[0].id, 'kp_005');
});

test('nextKnowledgePointId 用 max+1，刪咗中間點都唔會撞', () => {
  // kp_002 已刪，用 length+1 會派返 kp_003 撞到現有嗰點
  assert.equal(nextKnowledgePointId([point('kp_001', 'A'), point('kp_003', 'C')]), 'kp_004');
  assert.equal(nextKnowledgePointId([]), 'kp_001');
});

test('冇舊知識點時（首次提取）全部派新 id', () => {
  const incoming = [point('kp_001', 'A'), point('kp_002', 'B')];
  assert.deepEqual(
    assignStableKnowledgePointIds(incoming, []).map((item) => item.id),
    ['kp_001', 'kp_002']
  );
});

test('新主題避開同一 Bot 其他主題已使用嘅 id', () => {
  const otherTopic = [point('kp_001', '舊主題 A'), point('kp_006', '舊主題 B')];
  const incoming = [point('kp_001', '新主題 A'), point('kp_002', '新主題 B')];
  assert.deepEqual(
    assignStableKnowledgePointIds(incoming, [], otherTopic).map((item) => item.id),
    ['kp_007', 'kp_008']
  );
});
