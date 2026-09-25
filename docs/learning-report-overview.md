# 學習報告總覽設計（Overview Tab Design）

版本：v1（2026-09-25）
｜適用：學習報告頁「總覽」tab、Sidebar「學習報告」紅點契約

## 目的

老師入嚟學習報告嘅第一眼要答到三條問題：

1. **呢班學生而家點**（行為：有冇實質互動、邊啲人要跟進）
2. **最近有咩新動態**（能力追蹤更新、新嘅測驗質量報告）
3. **有咩要即刻處理**（異常對話，同 Sidebar 紅點同源）

**刻意唔做**（2026-09-24／09-25 用戶拍板）：**唔重複智能評測頁嘅測驗 KPI**
（已發佈／待批改／已完成批改嗰組）。總覽聚焦**學生行為**，唔係測驗行政管理。

## 現狀（2026-09-25 核實）

- 總覽只有 4 張快速入口卡（2×2），零數字
- 頁面級時間範圍選擇器（30／90／全期）**只喺「學生能力」tab 出現**
- Sidebar「學習報告」紅點**已經存在**：`hooks/useFlaggedChatCount.ts` 每 15 秒輪詢
  `GET /api/flagged-chat/count`（只計 `status='open'`），resolve／dismiss 後最遲
  15 秒自動滅——但**唔係即時**（處理完要等下一 tick）
- 課堂參與度後端已上線（`GET /api/teachers/me/participation`，
  `docs/class-participation.md`），總覽 KPI 有真數據可用
- 注意：`/api/teachers/me/ability-report` 係 frontend-only（真後端未實作）——
  **總覽唔可以依賴佢**，能力動態要讀 `bot_student_progress`（真後端有）

## 設計

### 1. KPI 行（跟頁面時間範圍選擇器）

4 個數字卡，一行四個。數據全部由**一條新 route** 攞（見「後端改動」），
跟頁面 selector 嘅 30／90／全期：

| 卡 | 定義 | 撳入去 |
| --- | --- | --- |
| 有實質互動學生 | 期內 ≥1 條實質訊息嘅學生數（全 roster 加總） | 課堂參與 tab |
| 需要你跟進學生 | 期內 0 條實質訊息嘅學生數 | 課堂參與 tab（未有互動名單） |
| 無意義訊息比例 | 期內全部班嘅 meaningless ÷ 訊息總數（百分比） | 課堂參與 tab |
| 待處理異常對話 | `status='open'` 數（**同 Sidebar 紅點同一個數**） | 對話紀錄 tab |

- 待處理異常 > 0 時，數字用警示色；撳卡跳去對應 tab
- 無意義訊息比例係**班級層級**百分比（界線：班級出數字、學生出狀態，見
  `docs/class-participation.md` 界線第 4 條）
- 冇排名：四張卡平排，唔按數值排班／排學生

### 2. 亮點區（規則推導，零 LLM）

用戶拍板（2026-09-25）：亮點用**規則推導**，唔用 AI 生成。分兩組：

**A. 最近動態**（時效語義；分「今日」同「最近 7 日」兩個固定窗口，唔跟頁面
selector——「新動態」係時效，唔係期內統計）：

- 「今日生成咗 **N 份**能力追蹤報告」——老師發佈嘅 Bot 有學生用咗、**今日真正
  新增**嘅報告數。系統報告係即場計算、冇報告檔案，對應嘅持久單位係
  `bot_student_progress`（學生×Bot×話題）每條紀錄 = 一份報告：
  `COUNT(DISTINCT bot_id, user_id) WHERE created_at ≥ 今日 HKT 開始`。
  `bot_student_progress` 加 `created_at` 欄（舊數據 NULL，唔當今日新增）
- 「今日 **N 位**學生嘅知識點掌握有新進展」——同上，`COUNT(DISTINCT user_id)`
- 「今日有 **N 位**學生有實質互動，**M 位**需要你跟進」——今日快照，按
  `bot_conversation_participation_windows.judged_at` ≥ 今日 HKT 開始
  （HKT 日界有先例：`server/api/student-tasks.ts:325`）
- 「最近 7 日生成咗 **N 份**測驗質量報告」——`quizzes.grading_completed_at`
  ≥ 7 日（測驗唔係日日有，7 日窗口先有訊號）

**B. 需要你跟進**（最多 3 條，平實文案，唔用開發詞／機制詞）：

- 班級提醒：「**3B班有 2 位學生未有互動**」——期內 `noInteractionStudents > 0`
  嘅班（最多 3 班）
- 情緒困擾提醒：「有 **1 條**情緒困擾訊息待處理」——wellbeing 類別 open 數 > 0 時出
- 全部正常時出「暫時冇需要跟進嘅事項」（唔用「全部正常」——平淡事實）

亮點文案規則（同 `memory/copy-plain-language-for-new-teachers`）：
每句過「未用過嘅老師明唔明」測試；唔出「參與度低」標籤、唔出百分比排名、
唔點名學生（班級提醒只講人數，名單喺課堂參與 tab 睇）。

### 3. Sidebar 紅點契約

- **維持現有**：15 秒輪詢 + focus 即時刷新 + mock 唔支援時歸零隱藏
- **新增**：老師喺對話紀錄 tab 處理（resolve／dismiss）完畢後，
  **即時清除紅點**——唔等 15 秒 tick。做法：`FlaggedChatSummaryCard` 嘅 PATCH
  成功 handler 加 `invalidateTeacherData('/api/flagged-chat/count')` ＋ 觸發一次
  即時 refresh（`useFlaggedChatCount` 開一個可外部觸發嘅 refresh，或經
  `teacher-data-cache` 嘅 invalidate 令下一個 fetch 繞過 TTL）
- 15 秒輪詢保留做安全網（多 tab／多裝置下最終一致）

### 4. 時間範圍選擇器

- selector 顯示條件由「只喺學生能力 tab」改為「總覽＋學生能力」（課堂參與接駁後
  再加參與 tab）——總覽 KPI 跟佢，唔係每張卡各自一個

## 後端改動

**新 route** `GET /api/teachers/me/learning-overview?period=30d|90d|all`
（`server/api/participation.ts` 或新檔；**唔改 participation route 契約**——
peer 已對接）：

```jsonc
{
  "period": "30d",
  "participation": {
    "activeStudents": 12,
    "noInteractionStudents": 3,
    "meaninglessMessages": 20,
    "studentMessageTotal": 87
  },
  "classAlerts": [                       // noInteraction > 0 嘅班，按人數多至少排，最多 3 條
    { "classId": "class-3b", "className": "3B班", "noInteractionStudents": 2 }
  ],
  "wellbeingOpen": 1,                    // 情緒困擾待處理（提醒用）
  "anomalyOpen": 4,                      // 全部待處理（= 紅點數）
  "updates": {
    "abilityReportsToday": 3,            // 今日新增報告 = bot_student_progress 新 row（DISTINCT bot×student）
    "knowledgeStudentsToday": 2,         // 今日有新掌握進度嘅學生數（DISTINCT student）
    "quizReportsGraded7d": 2             // quizzes.grading_completed_at ≥ 7 日
  },
  "today": {                             // HKT 今日快照（同一批窗口數據）
    "activeStudents": 6,
    "noInteractionStudents": 1
  }
}
```

- 數據源全部係真後端已有嘅表：participation 窗口表、`bot_student_progress`
  （**加 `created_at` 欄**——舊數據 NULL，唔當今日新增；`mergeStudentProgress`
  INSERT 開始寫 NOW()）、`quizzes.grading_completed_at`、`flagged_chat_messages`
  （category×status COUNT）
- `today` 同 participation 總數都用 `aggregateParticipation`（class 維度）——
  `today` 傳 HKT 今日開始做 periodStart，同一套口徑
- 401／403／500 慣例跟 `participation` route

## 前端改動（接駁者：學習報告 branch）

- `pages/LearningReportPage.tsx` 總覽 tab：KPI 行 → 亮點區 → 快速入口卡（保留）
- 新 hook `useLearningOverview(period)`（跟 `teacher-data-cache` 慣例；
  `preloadTeacherWorkspace` 加 preload）
- `FlaggedChatSummaryCard`：PATCH handler 加 count invalidate（紅點即滅）
- i18n key（全部經 `uiText`，`utils/uiEnglish.ts` 同步）：
  - 有實質互動學生／需要你跟進學生／無意義訊息比例／待處理異常對話
  - 最近 7 日，{0} 位學生的能力追蹤報告有更新／生成咗 {0} 份新的測驗質量報告
  - 今日有 {0} 位學生有實質互動，{1} 位需要你跟進
  - {0} 有 {1} 位學生未有互動／有 {0} 條情緒困擾訊息待處理／暫時冇需要跟進嘅事項

## 界線（沿用，唔鬆綁）

- 唔出學生排名、唔用「參與度低」標籤、唔顯示個別學生嘅無意義比例
- 班級提醒只講事實人數，唔排序唔評分
- 只做群體聚合，處理權喺老師（同 `docs/class-participation.md` 合規依據）

## 分期

- **第一期（本設計）**：KPI 行＋亮點區＋紅點即時清除＋overview route＋mock 罐頭
  ——**2026-09-25 已實作**（`doris/class-participation`：route `server/api/learning-overview.ts`、
  總覽 UI、`bot_student_progress.created_at`、紅點 event 即時清除；整合測試 7 條＋
  mock 罐頭＋playwright 真撳 20 項＋紅點 E2E 4 項）
- 之後可選：AI 生成洞察（用戶今次揀咗規則推導；若日後要，另開 LLM route＋評測）

## 驗證

- 整合測試：overview route（roster 範圍隔離、7 日窗口、today HKT、wellbeing split、
  401/403）
- mock 補 `GET /api/teachers/me/learning-overview`（罐頭數據）
- playwright 真撳：總覽 KPI 顯示、切 period 數字變、撳 KPI 卡跳 tab、
  **處理異常對話後紅點 1 秒內滅**（唔等 15s tick）、英文模式零中文殘留
