import { getTeacherLang } from "./teacherI18n";

export const TRIAL_ENDED_POPUP_TITLE = "感謝您試用我們的機器人平台！";
export const TRIAL_ENDED_POPUP_MESSAGE =
  "我們的開發團隊十分想聽到您的意見，如果有需要請聯絡我們提供意見﹑購買我們的機器人創建服務";

/** 依當前語言回傳試用結束彈窗文案（教師端 i18n） */
export function getTrialEndedPopupCopy(): { title: string; message: string } {
  if (getTeacherLang() === "en") {
    return {
      title: "Thank you for trying our bot platform!",
      message: "Our team would love to hear your feedback. Contact us to share comments or upgrade for more features.",
    };
  }
  return { title: TRIAL_ENDED_POPUP_TITLE, message: TRIAL_ENDED_POPUP_MESSAGE };
}

export const TRIAL_ENDED_POPUP_STORAGE_KEY = "chopreality_trial_ended_popup";

export function markTrialEndedPopupPending() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(TRIAL_ENDED_POPUP_STORAGE_KEY, "1");
}

export function consumeTrialEndedPopupPending() {
  if (typeof window === "undefined") return false;
  const pending = window.sessionStorage.getItem(TRIAL_ENDED_POPUP_STORAGE_KEY) === "1";
  if (pending) {
    window.sessionStorage.removeItem(TRIAL_ENDED_POPUP_STORAGE_KEY);
  }
  return pending;
}
