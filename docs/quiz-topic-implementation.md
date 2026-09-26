# 測驗跟 Bot + 主題：實作與維護

產品決定（問題清單、UX 版式、文案、邊界情況）見
[quiz-topic-publishing.md](quiz-topic-publishing.md)；呢份只講**點做**同**點樣唔會腐爛**。

## 維護性設計（先睇呢節）

1. **一個判斷，一個函數**：「（Bot, 主題）→ 邊份進行中測驗」只可以有一個實作 ——
   新增 `server/lib/quiz-topic.ts` 嘅 `resolveActiveQuizForBotTopic(botId, topicId)`。
   而家同一個判斷散落喺三個入口（`/bots/:id/active-quiz`、`bots.ts` 嘅 Bot 卡查詢、
   `student-tasks`），第四個入口都只准叫呢個函數。
   **唔准喺 route 入面自己寫 `ORDER BY updated_at DESC LIMIT 1`。**
1a. **學生路徑唔准自己砌兩步**：學生要「主題 ＋ 測驗」兩層解析，順序係
   先 `resolveStudentTopic()`（受眾）再 `resolveActiveQuizForBotTopic()`（內容）。
   呢個組合**唔留俾 caller 記** —— `quiz-topic.ts` 出一個
   `resolveStudentActiveQuiz(botId, studentId, requestedTopicId)`，
   內部照上面兩步做。**唔准將未經解析嘅 `topicId` 直接傳俾測驗函數**：
   咁樣就係繞過受眾縮窄（學生傳第二課就攞到第二課嘅測驗），
   而且係一個睇 code 睇唔出嘅窿。老師端路徑冇 studentId，直接用單層版本。
2. **一條 SQL 片段，一處維護**：主題欄位嘅 join／select 片段做成 export 常數
   （`QUIZ_TOPIC_SELECT_SQL`），跟 `server/lib/quiz-audience.ts` 嘅既有做法
   （佢就係一條 export 出去嘅 SQL 字串，全 app 共用）。列表要多一欄，改一處。
3. **前端三件共用件，唔准各處重寫**：
   - `components/assessment/QuizTopicPicker.tsx`（新）— Step 1／Step 2／詳情 Drawer 三處共用
   - `components/assessment/QuizTopicTag.tsx`（新）— 6 個列表位共用；
     「不分主題」嘅顯示方式只有一個實作
   - 主題清單由 `available-quiz-bots` 一個 response 帶落嚟，唔另開 API、唔逐個 Bot 查
4. **DB 層保證，唔靠應用層記憶**：FK `ON DELETE SET NULL` 令主題一刪測驗自動降級
   （唔會變孤兒、唔會唔見），index 令 `active-quiz` 唔會全表掃。
   應用層只負責「講清楚後果」，唔負責清理資料。
5. **文案只可以寫喺 `pages/`／`components/` 嘅字面量 `uiText(...)`**：
   `test:i18n` 只掃字面量、只掃 `App.tsx`／`pages/`／`components/` ——
   寫喺 `utils/` 或者由陣列／常數驅動就永遠驗唔到。新文案**兩個檔都要加**
   （`utils/uiI18n.ts` ＋ `utils/uiEnglish.ts`）。
6. **新邏輯要有測試 ＋ npm script**：`server/tests/*.ts` 冇 script 就冇人跑、會靜靜雞腐爛。
   主題解析值得一套（建議 `npm run test:quiz-topic`），最少驗三樣：
   同主題揀最新一份、該主題冇 → 落「不分主題」、主題唔屬於該 Bot → 拒。
7. **「唔支援」要明文寫落文件**（一份測驗多主題、題庫跟主題、班級×主題分配）：
   唔寫明，將來一定有人「順手加」。
8. **文件單一住處**：產品決定喺 `quiz-topic-publishing.md`，實作同維護喺呢份。
   架構層有變（新 lib 檔、新測試套）就同步 `architecture.md` 嘅目錄地圖，唔好喺度重抄。

## DB

照 `conversations.topic_id` 嘅既有做法（`server/migrations/20260717_character_topics.sql`）：

```sql
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS topic_id TEXT;
ALTER TABLE quizzes
  ADD CONSTRAINT quizzes_topic_id_fkey
  FOREIGN KEY (topic_id) REFERENCES character_topics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS quizzes_bot_topic_status_idx
  ON quizzes(bot_id, topic_id, status, updated_at DESC);
```

- Migration 檔做歷史記錄；**同時**喺 `server/api/quizzes.ts` 嘅 `initializeQuizTables()`
  加 idempotent 版本（現有 ALTER 段落一齊），佢已經被 `withSchemaLock()` 包住
  （`server/lib/schema-lock.ts`），所以照加就安全
- 舊資料唔使 backfill：`topic_id IS NULL` ＝「不分主題」＝今日行為
- 唔改 `quizzes.bot_id`（仍然係 NOT NULL 且係受眾依據）

## API

| 改動 | 說明 |
| --- | --- |
| `GET /api/bots/:botId/active-quiz?topicId=` | 新 query param；有 `topicId` → 先揀該主題最新已發佈，冇先落「不分主題」嗰份。**冇傳 `topicId` 嘅呼叫者行為完全不變**（向後兼容嘅關鍵） |
| 學生路徑（`active-quiz`、任務 feed、Bot 卡計數） | **唔使逐條加受眾條件**：學生路徑一律先經 `resolveStudentTopic()`，攞到嘅當前主題已經係可用主題（見 [topic-scoped-audience.md](topic-scoped-audience.md) 第 4 節）。只有**由 quiz id 指到**嘅路徑（交測驗、拉作答紀錄）要 `isTopicAccessible()` —— 嗰啲冇得 fallback |
| `POST /api/quizzes/generate` | 收 `topicId`；驗證主題屬於該 Bot（重用現有 `TOPIC_CHARACTER_MISMATCH`，唔好另開錯誤碼） |
| `PATCH /api/quizzes/:id/topic`（新） | 老師本人；同樣驗主題屬於該測驗嘅 Bot；回更新後嘅 quiz summary |
| `GET /quizzes/published`、`/quizzes/drafts` | 回 `topicId`／`topicName`（用 `QUIZ_TOPIC_SELECT_SQL`） |
| `GET /teachers/me/grading-summary` | 同上；`PublishedQuizSummary` 加兩欄，`AssessmentPage.toPublishedQuizSummary()` 跟手補 |
| `GET /teachers/me/available-quiz-bots` | 每個 Bot 附 `topics: [{id, name, isDefault, category}]` |
| `GET /api/student/tasks` | 測驗事件帶 `topicId`／`topicName` |
| `GET /api/bots/shared/with-me` | 加待做測驗數（Bot 卡 badge 用）；老師 Bot 列表同樣 |
| `GET /api/bots/:id/topics` | 回 `quizCounts: { [topicId]: number }`（刪主題警告用） |

## 前端

| 檔案 | 改乜 |
| --- | --- |
| `components/assessment/QuizTopicPicker.tsx`（新） | Bot ＋ 主題兩個下拉；`botId`／`topicId`／`onChange`／`bots`（含 topics） |
| `components/assessment/QuizTopicTag.tsx`（新） | 顯示主題名或「不分主題」（淺灰）；6 個位共用 |
| `steps/Step1TextAndGrade.tsx` | 加主題下拉；`generate` payload 帶 `topicId` |
| `steps/Step3PreviewAndPublish.tsx` | 發佈設定列 ＋「更改」；成功文案帶目的地 |
| `MyQuizzesView.tsx` | 卡片主題行；條件式篩選 pill |
| `PublishedQuizDetailDrawer.tsx` | header 主題 ＋「更改」→ `PATCH` |
| `GradingWorkspaceHome.tsx`、`AssessmentQualityList.tsx`、`AssessmentQualityCard.tsx`、`AnomalyAlertsOverview.tsx` | 唯讀主題標籤（QualityList 一改，學習報告 tab 自動跟） |
| `components/workshop/PublishSuccessModal.tsx` | 拉測驗 effect 跟 `selectedTopicId`；banner 加測驗標題 |
| `pages/StudentTasksPage.tsx` | 任務行主題 chip；深連結 `&topic=` |
| `pages/StudentHome.tsx`、`components/workshop/BotCard.tsx` | badge 改帶數量（兩個檔要一齊改，見維護原則 3） |
| `components/workshop/topics/TopicVersionTabs.tsx`、`TopicManager.tsx` | 刪除確認框加測驗數同後果 |

## i18n

- 新文案**兩個檔都要加**（`utils/uiI18n.ts` ＋ `utils/uiEnglish.ts`），
  喺 `pages/`／`components/` 寫**字面量** `uiText("…")`
- 主題名／Bot 名係資料，唔入 i18n；「不分主題」係 UI 文案，要入
- 交收前跑 `npm run test:i18n`；**記得佢兩個盲區**（見維護原則 5），
  由陣列驅動嘅文案要自己核

## 測試

| 測試 | 驗乜 |
| --- | --- |
| `server/tests/quiz-topic.test.ts`（新，建議 `npm run test:quiz-topic`） | 主題解析三條規則；要 DB 就照其他 suite 用關鍵字 guard |
| `test:quiz-audience`（既有） | 佢係由源碼切 SQL 字串出嚟驗（見 `architecture.md` 測試表）——改 `/quizzes/published`、`/teachers/me/grading-summary` 嘅查詢後要跑 |
| `npm run test:i18n` | 缺失條目／英文值含中文 |
| 新增測試檔 | 要同時加 `.gitignore` negation ＋ `package.json` script，否則唔入版控亦冇人跑 |

## Mock

預覽 mock 喺 repo 外（`../aichat-preview-mock`），要跟住支援 `active-quiz?topicId=`
同 `available-quiz-bots` 嘅 `topics`，否則預覽睇唔到呢個功能。
**改 mock，唔改主專案**（AGENTS.md）。

## 實作階段建議

1. DB：migration ＋ `initializeQuizTables()` ALTER ＋ `server/lib/quiz-topic.ts`（唔改任何現有查詢）
2. API：`generate` 收 `topicId`、`active-quiz?topicId=`、`PATCH /:id/topic`、
   各列表回主題欄位、`available-quiz-bots` 回 topics、topics 回 `quizCounts`
3. 出題流程：`QuizTopicPicker` ＋ Step 1 → Step 2 發佈設定列 → 成功文案
4. 列表同 Drawer：`QuizTopicTag` 落 6 個位 ＋ Drawer 改主題
5. 學生端：banner 跟主題 ＋ 標題、任務列 chip ＋ 深連結 `&topic=`、Bot 卡 badge 數量
6. 主題刪除警告
7. `docs/` 同步（產品面改咗就改 `quiz-topic-publishing.md`；新 lib／測試套入 `architecture.md`）

## 驗證清單

- [ ] `npm run lint`（要先 `cd server && npm install`）、`npm run test:i18n`、`npm run build`
- [ ] `cd server && npm run test:quiz-topic`（新）＋ `test:quiz-audience`（既有）
- [ ] 真後端：同一個 Bot 兩個主題各發一份 → 學生切主題見到對應嗰份；切去冇測驗嘅主題 banner 收起
- [ ] 冇傳 `topicId` 嘅舊呼叫行為不變（向後兼容）
- [ ] 刪主題 → 測驗變「不分主題」，作答紀錄仍在
- [ ] 互動位用 Playwright **真撳一次**（切主題、Drawer 改主題、發佈設定列）——
      撳唔到先睇 `document.elementFromPoint` 落喺邊個 element
- [ ] 文案逐句過「未用過嘅老師明唔明」（唔准出現機制／開發字眼）

## 相關文件

- [測驗發佈跟 Bot + 主題 — UX/UI 設計](quiz-topic-publishing.md)
- [架構總覽](architecture.md)
