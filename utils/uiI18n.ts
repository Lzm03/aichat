import { getTeacherLang } from './teacherI18n';
import { englishUi } from './uiEnglish';

const patterns = Object.entries(englishUi).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => ({
  pattern: new RegExp('^' + key.split(/\{\d+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]*?)') + '$'),
  value,
}));

/** Translate system-owned display copy only. Never pass names, messages,
 * teaching materials, editable values, or other user-authored content here. */
export function uiText(text: string): string {
  if (getTeacherLang() !== 'en' || !text) return text;
  const key = text.trim();
  const translated = englishUi[key];
  if (translated !== undefined) return text.replace(key, () => translated);
  if (!/[\u3400-\u9fff]/.test(key)) return text;
  for (const { pattern, value } of patterns) {
    const match = key.match(pattern);
    if (match) return value.replace(/\{(\d+)\}/g, (_, index) => match[Number(index) + 1] ?? '');
  }
  return text;
}

/** Interpolated values are deliberately not translated. */
export function uiTemplate(key: string, ...values: unknown[]): string {
  return uiText(key).replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? ''));
}

export function uiLocale(): string {
  return getTeacherLang() === 'en' ? 'en-GB' : 'zh-HK';
}

/** Unknown server errors should not leak untranslated implementation details. */
export function uiError(text: string): string {
  const translated = uiText(text);
  return getTeacherLang() === 'en' && /[\u3400-\u9fff]/.test(translated)
    ? 'Something went wrong. Please try again or contact support.'
    : translated;
}
