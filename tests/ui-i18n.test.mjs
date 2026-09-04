import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { build } from 'esbuild';

const result = await build({
  stdin: { contents: "export * from './utils/uiI18n'; export * from './utils/teacherI18n'; export * from './utils/uiEnglish';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const { uiText, uiTemplate, uiError, uiLocale, setTeacherLang, getTeacherLang, englishUi } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const storage = new Map();
globalThis.window = Object.assign(new EventTarget(), {
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
});
globalThis.document = { documentElement: { lang: '' } };

test('English system text, dates, and language persistence', () => {
  setTeacherLang('en');
  assert.equal(getTeacherLang(), 'en');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(uiText('今日任務'), "Today's Tasks");
  assert.equal(uiText('聲音與動畫'), 'Voice and Animation');
  assert.equal(uiText(' 語言 '), ' Language ');
  assert.equal(uiLocale(), 'en-GB');
});

test('interpolation preserves user names even when they match a translation key', () => {
  setTeacherLang('en');
  assert.equal(uiTemplate('嗨，{0}！', '天空藍'), 'Hi, 天空藍!');
  assert.equal(uiTemplate('「{0}」有新測試「{1}」等你挑戰！', '天空藍', '數學'), '天空藍 has a new quiz, “數學”, for you!');
  assert.equal(uiText('已儲存「天空藍」。'), 'Saved “天空藍”.');
  assert.equal(uiText('用戶自己輸入的內容'), '用戶自己輸入的內容');
});

test('switching back restores Chinese and emits a shared update', () => {
  let count = 0;
  const listener = () => count++;
  window.addEventListener('chopreality-ui-lang-changed', listener);
  setTeacherLang('zh-HK');
  assert.equal(uiText('今日任務'), '今日任務');
  assert.equal(uiTemplate('嗨，{0}！', '天空藍'), '嗨，天空藍！');
  assert.equal(document.documentElement.lang, 'zh-Hant');
  assert.equal(count, 1);
  window.removeEventListener('chopreality-ui-lang-changed', listener);
});

test('all catalog values are English and all explicit copy calls have translations', () => {
  for (const [key, value] of Object.entries(englishUi)) assert.ok(!/[\u3400-\u9fff]/.test(value), `${key}: ${value}`);
  const files = ['App.tsx', ...['pages', 'components'].flatMap(dir => fs.readdirSync(dir, { recursive: true }).filter(file => file.endsWith('.tsx')).map(file => `${dir}/${file}`))];
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), 99, true, 4);
    function visit(node) {
      if (ts.isCallExpression(node) && ['uiText','uiTemplate'].includes(node.expression.getText(source))) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg) && /[\u3400-\u9fff]/.test(arg.text)) assert.ok(Object.hasOwn(englishUi, arg.text.trim()), `${file}: ${arg.text}`);
        if (arg) assert.ok(!/^(?:bot|companion|botConfig|topic|student)\.(?:name|content|description)$/.test(arg.getText(source)), `User content must stay unchanged: ${file}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test('unknown server errors use a localized fallback without changing content translation', () => {
  setTeacherLang('en');
  assert.equal(uiError('載入失敗'), 'Could not load');
  assert.equal(uiError('後端新增的未知錯誤'), 'Something went wrong. Please try again or contact support.');
  assert.equal(uiText('後端新增的未知錯誤'), '後端新增的未知錯誤');
});
