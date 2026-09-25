# 學習報告總覽設計（Overview Tab Design）

版本：v2（2026-09-25；v1 上線後按用戶 review 修訂：刪「最近動態」、跟進項可撳、
KPI 卡固定定義小字、異常卡紅點、對話紀錄入口漸變、課堂參與 tab 接駁）
｜適用：學習報告頁「總覽」tab、「課堂參與」tab、Sidebar「學習報告」紅點契約

## 目的

老師入嚟學習報告嘅第一眼要答到：

1. **呢班學生而家點**（行為：有冇實質互動、邊啲人要跟進）
2. **有咩要即刻處理**（異常對話，同 Sidebar 紅點同源）

**刻意唔做**（2026-09-24／09-25 用戶拍板）：**唔重複智能評測頁嘅測驗 KPI**
（已發佈／待批改／已完成批改嗰組）；**唔出「最近動態」類亮點**（同「需要你跟進」
信息重複，2026-09-25 用戶要求刪）。

## 總覽版面

### 1. KPI 行（4 卡，跟頁面時間範圍選擇器）

| 卡 | 定義（卡上固定小字，新手老師唔使 hover） | 撳入去 |
| --- | --- | --- |
| 有實質互動學生 | 期內有實質對話的學生數（所有 Bot、話題合計） | 課堂參與 tab |
| 需要你跟進學生 | 期內沒有實質對話的學生數 | 課堂參與 tab |
| 無意義訊息比例 | 全部對話中簡短回應（如「哦」「唔知」）所佔比例 | 課堂參與 tab |
| 待處理異常對話 | 待處理的異常對話數，與左側紅點一致 | 對話紀錄 tab |

- 待處理異常 > 0 時數值用警示色＋**小紅點**（同 Sidebar badge 同源）
- 分母 0（期內冇訊息）時無意義比例出「—」，唔出 0%（0% 會誤導成「全班都實質」）
- 冇排名：四張卡平排，唔按數值排班／排學生

**指標定義（用戶問「=？」嘅答案，寫喺卡上）**：

- **有實質互動學生**＝期內喺**任何 Bot、任何話題**有 ≥1 條「實質訊息」嘅學生。
  來源：`conversation_messages`（`role='user'`＋`message_type='normal'`）經 LLM judge
  （每 3 輪搭順風車；失敗用 ≥4 字 heuristic fallback）分類。**歸納喺學生層面**：
  老師一日發佈 2 個 bot × 6 個話題，全部對話合併計、一位學生只計一次；
  要睇每個 Bot／每個話題嘅拆解 → 課堂參與 tab 維度切換
- **需要你跟進學生**＝期內 0 條實質訊息。跟進原因得一個：**冇實質參與**（binary）。
  **同異常對話唔重合**：異常（`flagged_chat_messages`）係安全／情緒困擾／私隱命中，
  數據源同機制完全唔同；同一位學生可以同時喺兩邊出現，兩條數唔互相包含
- **無意義訊息比例**＝所選時間範圍內**全部**學生、全部 Bot、全部話題嘅 user normal
  訊息中，被 judge（或字數 fallback）標為無意義嘅比例——唔係最新一個 Bot 某個版本

### 2. 需要你跟進（全闊單卡，可撳）

- 每項係一個 button，撳咗跳對應位置：班級提醒 → 課堂參與 tab；情緒困擾提醒 → 對話紀錄 tab
- **容量**：班級提醒最多 3 條（後端按需要跟進人數多至少排）＋情緒困擾最多 1 條＝
  最多 4 項；超過 3 班時出「仲有 N 班有學生未有互動」行（撳入課堂參與 tab 睇晒，
  後端 `classAlertsTotal` 俾全數）
- 全部正常時出「暫時冇需要跟進嘅事項」（平淡事實，唔用「全部正常」）
- 文案規則（同 `memory/copy-plain-language-for-new-teachers`）：平實、唔出
  「參與度低」標籤、唔點名（名單喺課堂參與 tab 睇）

### 3. 數據時效（2026-09-25 用戶問「幾時更新」）

- **唔係淨登入先更新**：每次入總覽 tab／切 period 即攞（60s TTL cache）＋
  **開住總覽時每 15 秒輪詢**（同紅點同一節奏，repo 慣例）+ focus 刷新
- **跟進後實時消失**：對話紀錄 tab 處理完異常（PATCH 成功）→ invalidate overview
  cache＋dispatch `chopreality:flagged-count-refresh` → 返總覽即見冇咗（開住總覽
  亦喺下一個 tick ≤15s 內冇）；班級提醒等學生有實質訊息後、judge 窗口幾秒內
  更新，下個 tick 消失

### 4. 快速入口

4 張卡保留；**「對話紀錄」卡用玫瑰漸變實色背景**突出（異常係老師最要即刻睇嘅嘢，
2026-09-25 用戶要求），其餘 3 張白底。

## 課堂參與 tab（2026-09-25 接駁，placeholder → 真數據）

- 頂部維度切換：班級／按 Bot／按話題（`dimension` param 打 participation route）
- 每組一行：組名＋訊息總數、有效提問、無意義比例、活躍學生（唔排名、唔排序）
- **組名 null 因維度而異**：topic 嘅 `''`＝「主知識庫」；class／bot 嘅 null＝「未分組」
- class 維度先有「未有互動」chip＋學生名單：**純統計**（用戶決定：未有互動嘅學生
  根本冇對話可睇，開 drawer 會係空白）。撳名 → popover 顯示**姓名＋班級**，
  唔出個人數字（界線）。有價值嘅「撳名即睇對話」drill-down 已由異常對話卡片提供
- 時間 selector 喺總覽／課堂參與／學生能力三個 tab 都出並消費

## Sidebar 紅點契約

- `useFlaggedChatCount` 15 秒輪詢＋focus 即時刷新＋mock 唔支援時歸零隱藏
- 處理（resolve／dismiss）後**即時滅**：PATCH 成功 handler 會 invalidate
  `/api/flagged-chat/count` 並 dispatch `chopreality:flagged-count-refresh`，
  hook 聽 event 即時 refresh——唔等 15 秒 tick

## 後端契約

`GET /api/teachers/me/learning-overview?period=30d|90d|all`（`server/api/learning-overview.ts`）：

```jsonc
{
  "period": "30d",
  "participation": {
    "activeStudents": 12,
    "noInteractionStudents": 3,
    "meaninglessMessages": 20,
    "studentMessageTotal": 87
  },
  "classAlerts": [                       // 按人數多至少排、cap 3 條
    { "classId": "class-3b", "className": "3B班", "noInteractionStudents": 2 }
  ],
  "classAlertsTotal": 4,                 // 全部未有互動嘅班數（超出 3 時前端出「仲有 N 班」）
  "wellbeingOpen": 1,
  "anomalyOpen": 4                       // = 紅點數
}
```

- participation 總數由 `aggregateParticipation`（class 維度）加總，一套口徑
- `bot_student_progress.created_at` 欄保留（2026-09-25 為「今日新增報告」亮點加；
  亮點已按用戶要求刪，欄位留做數據模型，日後可即插）
- 401／403／500 慣例跟 participation route

## 界線（沿用，唔鬆綁）

- 唔出學生排名、唔用「參與度低」標籤、唔顯示個別學生嘅無意義比例
- 班級提醒只講事實人數，唔排序唔評分
- 只做群體聚合，處理權喺老師（同 `docs/class-participation.md` 合規依據）

## 分期

- **已完成（2026-09-25）**：KPI 行＋定義小字＋紅點、需要你跟進（可撳＋封頂＋
  15s 輪詢＋處理即消失）、快速入口漸變卡、課堂參與 tab 接駁、Sidebar 紅點即時清除、
  overview route＋`classAlertsTotal`、mock 罐頭、整合測試 6 條＋playwright 31 項
- 之後可選：AI 生成洞察（用戶揀咗規則推導；日後要另開 LLM route＋評測）

## 驗證

- 整合測試：overview route（KPI 加總、period、異常數字、classAlerts 封頂＋total、
  老師隔離、401/403）
- mock：overview／participation（class/bot/topic）罐頭
- playwright 真撳 31 項：KPI 定義小字、紅點、跟進項跳 tab、仲有 N 班、漸變卡、
  課堂參與三維度切換＋指標＋名單 popover、英文模式零中文
