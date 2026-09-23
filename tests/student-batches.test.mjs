import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

const result = await build({
  stdin: { contents: "export * from './utils/student-batches';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const { STUDENT_BATCH_SIZE, chunkIds, runChunkedBatches } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);

const ids = (count, prefix = 'stu') => Array.from({ length: count }, (_, index) => `${prefix}_${index}`);

test('切批唔會漏、唔會亂序', () => {
  const all = ids(235);
  const batches = chunkIds(all);
  assert.deepEqual(batches.map((batch) => batch.length), [100, 100, 35]);
  assert.deepEqual(batches.flat(), all);
});

test('邊界：100 唔切、101 切兩批、空陣列唔切出空批', () => {
  assert.equal(chunkIds(ids(100)).length, 1);
  assert.equal(chunkIds(ids(101)).length, 2);
  assert.equal(chunkIds(ids(200)).length, 2);
  assert.deepEqual(chunkIds([]), []);
  assert.throws(() => chunkIds(ids(10), 0), /batch size/);
});

test('切批大小同 server 上限一致', () => {
  const source = fs.readFileSync('server/lib/student-ops.ts', 'utf8');
  const serverCap = Number(source.match(/MAX_BATCH_STUDENTS\s*=\s*(\d+)/)?.[1]);
  assert.equal(serverCap, STUDENT_BATCH_SIZE, '前端切批大小同 server 上限走散，又會再出現 400');
});

test('逐批依序執行，中途失敗即停，唔會當全部成功', async () => {
  const seen = [];
  const run = await runChunkedBatches(ids(235), async (batch) => {
    seen.push(batch.length);
    if (seen.length === 2) throw new Error('boom');
  });
  assert.deepEqual(seen, [100, 100], '失敗之後唔應該再發下一批');
  assert.equal(run.batchCount, 3);
  assert.equal(run.done.length, 100, 'done 只可以包含真正成功咗嘅人');
  assert.equal(run.error?.message, 'boom');
});

test('全部成功時 done 就係原陣列；冇切過嘅 batchCount 係 1', async () => {
  const all = ids(235);
  const run = await runChunkedBatches(all, async () => {});
  assert.deepEqual(run.done, all);
  assert.equal(run.batchCount, 3);
  assert.equal(run.error, null);

  const single = await runChunkedBatches(ids(30), async () => {});
  assert.equal(single.batchCount, 1);
  assert.deepEqual(single.done, ids(30));
});
