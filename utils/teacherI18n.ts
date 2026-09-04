import { useEffect, useState } from "react";

// 教師端語言機制：與學生端共用 localStorage key（chopreality_ui_lang）。
// 各教師元件用 useTeacherLang() 取當前語言；切換時 Header 派發事件即時更新全站。

export type TeacherLang = "zh-HK" | "en";

export const TEACHER_LANG_CHANGED_EVENT = "chopreality-ui-lang-changed";
let memoryLanguage: TeacherLang = 'zh-HK';

export function getTeacherLang(): TeacherLang {
  if (typeof window === "undefined") return "zh-HK";
  try {
    return window.localStorage.getItem("chopreality_ui_lang") === "en" ? "en" : "zh-HK";
  } catch { return memoryLanguage; }
}

export function setTeacherLang(lang: TeacherLang) {
  memoryLanguage = lang;
  try { window.localStorage.setItem("chopreality_ui_lang", lang); } catch { /* Storage may be disabled. */ }
  document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
  window.dispatchEvent(new CustomEvent(TEACHER_LANG_CHANGED_EVENT));
}

export function useTeacherLang(): TeacherLang {
  const [lang, setLang] = useState<TeacherLang>(getTeacherLang);

  useEffect(() => {
    const handler = () => {
      const next = getTeacherLang();
      document.documentElement.lang = next === "en" ? "en" : "zh-Hant";
      setLang(next);
    };
    handler();
    window.addEventListener(TEACHER_LANG_CHANGED_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(TEACHER_LANG_CHANGED_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return lang;
}
