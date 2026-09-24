import { useEffect, useState } from "react";
import { loadTeacherData } from "../utils/teacher-data-cache";

// 異常對話待處理數：15 秒輪詢（同 TTL），focus 即時刷新，非 visible 唔發
// request（照 pages/AssessmentPage.tsx 輪詢慣例）。Sidebar、MobileSidebarDrawer、
// FlaggedChatSummaryCard 共用 — teacher-data-cache 嘅 in-flight 去重保證每 tick
// 只有一個 request。mock 唔支援呢個 route，失敗時歸零隱藏 badge。
export function useFlaggedChatCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      loadTeacherData<{ count: number }>("/api/flagged-chat/count", 15_000)
        .then((data) => setCount(Number(data?.count) || 0))
        .catch(() => setCount(0));
    };
    refresh();
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return count;
}
