# 主題層受眾（Bot × 主題）— 設計

產品決定（2026-09-26）：受眾由 **Bot 層**縮窄到 **Bot × 主題層** —— 老師可以指定
「4A 只可以用第一課、4B 只可以用第二課」。狀態：設計已定，**未實作**。

測驗側嘅產品設計見 [quiz-topic-publishing.md](quiz-topic-publishing.md)。

## 0. 一句話講完

每個學生對每隻 Bot 都有一個**可用主題集合**；所有「學生而家喺邊個主題」嘅判斷
都經**同一個函數**；測驗、任務、成就、進度全部錨定喺嗰個已解析嘅主題之上。
所以縮窄受眾係**一個模組**嘅事（判斷只此一處），唔係散落改成五個地方。

## 1. 兩個軸，唔好撈埋

| | 軸 A：授權 | 軸 B：內容 |
| --- | --- | --- |
| 答乜 | 學生**入得**邊個主題 | 入到之後**見到**邊份測驗／邊啲任務 |
| 由乜決定 | 分享（直接／班級）＋ 主題限定 − 排除名單 | 當前主題（軸 A 嘅輸出）＋ 已發佈測驗 |
| 輸出 | 一個集合（可能係空） | 最多一份測驗 |

**鐵律：軸 B 只喺軸 A 批准嘅主題上面跑，軸 B 永遠唔會擴闊軸 A。**

呢兩件事撈埋寫就會不停加例外規則 —— 「未分配主題點算」同時係授權問題（入唔入得）
同顯示問題（見唔見到），分開之後，第 2 節一個函數就答晒兩邊。

### 軸 A：可用主題

一個分享 ＝ (班級 或 學生) × Bot，帶兩個**獨立**事實：

| `topic_scoped` | 指定主題 | 可用範圍 |
| --- | --- | --- |
| FALSE（預設，＝所有現有分享） | 無關 | **全部**主題（今日行為） |
| TRUE | ≥1 個 | 就係嗰 N 個 |
| TRUE | 0 個 | **空**（用唔到） |

- **為何 flag 要獨立記錄，唔可以「有 row 就當限定」**：後者嘅話，主題被刪 → row 冇咗 →
  如果佢係最後一個，學生會由「只准第一課」**靜靜雞變成可以用全部主題**。
  呢個 fail-open 方向不可接受
- **入「空」有三條路**：老師刻意一個都唔剔、老師刪咗最後一個指定主題、指定嘅主題全部被刪。
  三條路**同一個狀態、同一句學生文案**（「等候老師安排」），唔使分開處理
- **老師（owner）／連結模式（`bots.is_visible`）**：冇「指派對象」可言 → 一律全部主題
- 排除名單維持 Bot 層，唔加主題維度（第一版）

### 軸 B：內容解析（按當前主題）

1. 該主題有已發佈測驗 → **最新嗰份**
2. 冇 → **「不分主題」**最新已發佈嗰份
3. 兩者都冇 → 唔出

第 2 條就係「舊測驗照做得到」嘅原因：舊測驗全部係「不分主題」，而學生任何時候都企喺
一個可用主題之上，所以佢一定撞到嗰份 fallback。

## 2. 兩個軸嘅接口：一個解析函數

```ts
resolveStudentTopic(botId, studentId, requested): Topic | null
```

| 情況 | 結果 |
| --- | --- |
| `requested` 屬於此 Bot **且**在可用範圍內 | `requested` |
| `requested` 屬於此 Bot但**唔在**可用範圍內 | 當「冇指定」，行下面條鏈（**唔 403**） |
| `requested` **唔屬於**此 Bot | 403 `TOPIC_CHARACTER_MISMATCH`（打錯／越權，維持不變） |
| 冇指定（或上面第 2 行） | ① 可用範圍內 `is_default` → ② 可用範圍內 `sort_order` 第一個 → ③ `null` |

三個要點：

1. **「未做過限定」唔使特判** —— 佢係第 1 行嘅自然結果：可用範圍＝全部，所以此 Bot
   任何主題都通過。今日行為 100% 保留，唔係靠一條例外規則
2. **「未分配主題」唔懲罰** —— 撞到嘅三個來源（前端記住嘅上次選擇、深連結 `&topic=`、
   老師中途收窄之前開咗嘅對話）**都唔係越權企圖**，課堂中彈 403 學生亦冇嘢可以做。
   當「冇指定」處理，安全上等價（一樣入唔到嗰個主題）
3. **③ `null` 只有一個出口**：可用範圍空。呢個就係「等候老師安排」

⚠️ **Fallback 目標一定要係「可用範圍內」嘅默認，唔係 Bot 層默認。**
默認主題（`is_default`）同班級分配係兩件獨立嘅事：Bot 嘅默認主題好可能正正就係呢個
學生冇被分配嗰個。照落 Bot 層默認 → 一係即刻再彈走（等於冇 fallback），
一係穿咗個窿（等於冇縮窄）。

**收斂**：解析結果同 `conversations.topic_id` 唔同時，更新該欄並喺 transcript 寫一行
主題邊界（唔可以靜靜雞換咗課）。之後就穩定，唔會每句都寫。

## 3. 一個模組，唔准自己判

新增 `server/lib/topic-access.ts`：

| 函數 | 用喺邊 | 有冇 fallback |
| --- | --- | --- |
| `listAccessibleTopics(botId, studentId)` | 主題揀選器、老師預覽、成就統計 | — |
| `listAccessibleTopicsSql(botId, studentId)` | 列表／feed 查詢嘅 SQL 片段（任務 feed、Bot 卡計數） | — |
| `resolveStudentTopic(...)` | 所有「而家喺邊個主題」：對話、`active-quiz`、深連結 | 有 |
| `isTopicAccessible(botId, studentId, topicId)` | **由 id 指到嘅學生資源**（交測驗、拉作答紀錄） | 冇 |

`isTopicAccessible` 點解要獨立存在：一份**已經有 id** 嘅資源冇得「fallback 去第二份」——
你唔可以將「交第二課嘅測驗」偷偷變成「交第一課」。呢啲路徑要老實拒絕。
`topic_id IS NULL`（不分主題）嘅測驗，只要學生入得到隻 Bot 就入得到。

**組合唔留俾 caller 記**：學生要「主題 → 內容」兩層解析。與其喺文件寫「記得先解析主題」，
不如令佢砌唔錯 —— 測驗側出 `resolveStudentActiveQuiz(botId, studentId, requestedTopicId)`
（`server/lib/quiz-topic.ts`），內部先叫 `resolveStudentTopic()` 再揀測驗。
**冇任何 route 會拿到一個未經解析嘅 `topicId` 去查內容**，繞過縮窄嘅寫法根本寫唔出。

## 4. 現況：改乜、唔改乜

| 位置 | 而家 | 改動 |
| --- | --- | --- |
| `getAccessibleBot()` | Bot 層閘門（`is_visible`／owner／分享） | **唔改** —— 呢個答「入唔入得隻 Bot」，同主題無關 |
| `quizAudienceSql()` | Bot 層受眾 SQL | **唔改** —— 見下面「為何唔使加主題條件」 |
| `resolveCharacterTopic()` | 冇指定 → Bot 預設主題 | → 改叫 `resolveStudentTopic()` |
| `GET /api/bots/:id/topics` | 學生見到全部主題 | 學生視角 → `listAccessibleTopics()`；老師／owner 全部 |
| `/shared/with-me` 嘅 `hasPendingQuiz` | Bot 層 boolean | 每個 Bot 先解析當前主題再計；順手將內聯副本收歸 `quizAudienceSql()` |
| 交測驗／拉作答紀錄（id 指到） | 只驗 Bot 分享 | 加 `isTopicAccessible()` |

**為何 `quizAudienceSql()` 唔使加主題條件**：學生**永遠企喺一個可用主題**上面
（第 2 節嘅函數保證），而測驗查詢本身就係「當前主題 ＋ 不分主題」。條件已經隱含咗。
列表／feed 查詢就用 `listAccessibleTopicsSql()` 明確寫出嚟。
呢個就係「一個判斷，一個來源」嘅實際意思：唔係到處加同一句 SQL，
而係**得一個地方決定學生企喺邊**，其他全部跟。

### 維護細節（好重要）

- `quizAudienceSql()` **唔改簽名、唔改字面寫法**：`server/tests/quiz-audience.integration.test.ts`
  係由源碼切 `"${quizAudienceSql('q.bot_id', 'u.id')}"` 呢個字串出嚟驗，
  所以 `quizzes.ts` 嗰兩處要保留原寫法，新條件**擺喺後面**
- **計數要 distinct 測驗**：一份「不分主題」測驗喺 4 個可用主題都出得，但佢係 **1 份**。
  Bot 卡「N 份測驗」、任務 feed 一律 `COUNT(DISTINCT quiz_id)`，
  唔可以逐個主題加埋（否則同一個 Bot 會由 1 變 4）

## 5. 資料模型

```sql
ALTER TABLE bot_group_shares   ADD COLUMN IF NOT EXISTS topic_scoped BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bot_student_shares ADD COLUMN IF NOT EXISTS topic_scoped BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS bot_group_topic_shares (
  bot_id     TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id   TEXT NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
  topic_id   TEXT NOT NULL REFERENCES character_topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bot_id, group_id, topic_id)
);
-- bot_student_topic_shares 同形（student_id 代替 group_id）
```

- ⚠️ 唔可以將 `topic_id` 塞入現有 share 表做 PK：PG 嘅 primary key 欄位唔可以 NULL，
  用空字串做「全部」嘅 sentinel 就要放棄 FK，資料完整性即刻變差
- `ON DELETE CASCADE` 對 topic：主題一刪，授權 row 自動消失（配合 fail closed）
- 舊資料零 backfill：`topic_scoped=FALSE` 就係「全部主題」

## 6. 老師端 UX

三個入口都要跟：`LibraryView.tsx`「班級分配」tab、`BotAssignmentOverview.tsx`、
`permissions/BotPermissionDrawer.tsx`。

```text
┌─ 班級分配：英語小助手 ─────────────────────────────────┐
│ ☑ 4A 班（32 人）      主題：[指定 ▾]                    │
│     └ ☑ 英語語法第一課  ☐ 英語閱讀第一課                  │
│       ☐ 英語聽力第一課  ☐ 未命名                        │
│ ☑ 4B 班（30 人）      主題：[全部 ▾]                    │
│ ☐ 4C 班（28 人）      未分配                            │
│ ⓘ 「全部」＝可以用所有主題（包括將來新加嘅）              │
└───────────────────────────────────────────────────────┘
```

- 一個班一行主題控制：`全部`（預設）／`指定`（出 checkbox）
- 儲存：**新 route** `PUT /api/bots/:botId/topic-scopes`，body
  `{ groupScopes: [{groupId, topicIds|null}], studentScopes: [{studentId, topicIds|null}] }`
  （`null` ＝ 全部）。**唔塞入現有 `PUT /:id/group-shares`** —— 嗰條係 full-replace，
  舊 client 唔知有主題呢回事，一 save 就會清空老師嘅主題限定
- 揀「指定」但一個都唔剔 → **唔攔截**（「暫時收起呢班」係合理需求），但即時出
  「呢個班會暫時用唔到呢隻 Bot，學生會見到『等候老師安排』」
- 刪主題時：若該主題有班級／學生限定，警告框要講埋「有 N 個班級只可以用呢個主題，
  刪咗佢哋會冇主題可用」（同 [quiz-topic-publishing.md](quiz-topic-publishing.md)
  嘅測驗數警告一齊出）
- 總覽同 Drawer 顯示同一件事：班級 chip 後加主題摘要（`全部主題`／`第一課`／`第一課 +2`）
- 一個主題未分配俾任何班級 → 提示「呢個主題未有班級用到」（唔係錯誤）

## 7. 學生端 UX

1. **主題揀選器**（`PublishSuccessModal` 嘅 `availableTopics`）＝ `listAccessibleTopics()`
   - **未做過限定** → 全部主題照出，自由切換（同今日一樣）
   - 得一個可用 → 唔出揀選器，直接鎖定（唔好出一個一選項嘅下拉）
   - **未分配嘅主題唔顯示**（唔灰掉、唔列出）—— 縮窄就係學生唔應該知／揀嗰課；
     灰掉只會引嚟「點解撳唔到」，加埋 fallback 更會變成「撳咗但靜靜雞去咗第二度」
   - 零個可用 → 入唔到對話（見邊界情況）
2. **對話**：`resolveStudentTopic()` 決定當前主題；撞到已失效主題唔中斷上課，
   落 fallback 鏈並喺 transcript 寫主題邊界
3. **測驗 banner**：按當前主題（軸 B）。學生唔會見到自己冇得用嘅主題嘅測驗
4. **今日任務**：任務行只出可用主題嘅測驗；深連結 `&topic=` 由 `StudentHome` 一處解析
5. **Bot 卡**：可存取主題數、待做測驗數跟可用範圍（計數見維護細節）

## 8. 邊界情況

| 情況 | 行為 |
| --- | --- |
| 現有分享（`topic_scoped=FALSE`） | 全部主題；學生端**完全冇改變**，自由切換 |
| 連結模式（`is_visible=TRUE`） | 全部主題（冇指派對象可言） |
| 老師自己（owner）／老師預覽 | 全部主題 |
| 學生帶住一個未分配嘅主題（舊選擇／深連結／中途收窄） | 當「冇指定」→ fallback 鏈；唔 403、唔彈錯，安全上等價 |
| 學生傳一個唔屬於呢個 Bot 嘅 `topicId` | 403（現有 `TOPIC_CHARACTER_MISMATCH`） |
| 可用範圍空（刻意清空／被刪光） | 零主題：Bot 卡照出但寫「等候老師安排」，對話入唔到，老師端分配頁出提示 |
| 交一份自己冇得用嘅主題嘅測驗（id 指到） | `isTopicAccessible()` 拒；**冇得 fallback**，因為資源係由 id 指到 |
| 對話綁住一個已被收窄走嘅主題 | 下次發問落 fallback 鏈，更新 `conversations.topic_id`，transcript 寫主題邊界 |
| 中途收窄（本來全部 → 改成只第一課） | 即時生效；未完成嘅對話照上面一行 |
| 排除名單 | 維持 Bot 層；「排除某學生某主題」唔做（第一版） |

## 9. 分階段實作

1. **資料模型 ＋ 模組**：兩張表、兩個 flag、`server/lib/topic-access.ts` 四個函數、
   `/shared/with-me` 收歸 `quizAudienceSql()`。呢步**唔改行為**（全部人＝全部主題），
   可以獨立上線
2. **解析換手**：`resolveCharacterTopic` → `resolveStudentTopic`；`GET /topics` 按學生過濾；
   `active-quiz`／`ask` 跟當前主題；`isTopicAccessible` 落 id 指到嘅路徑
3. **教師端分配 UI**：`PUT /topic-scopes` ＋ 三個入口加主題控制
4. **測驗側接上**：配合 [quiz-topic-publishing.md](quiz-topic-publishing.md) 嘅 `quizzes.topic_id`
5. **統計／feed**：成就 `available_topics`／`covered_topics`、`/api/student/tasks`、
   進度聚合（`loadTopicBuckets`／`loadProgressByTopic`，`server/api/bots.ts`）跟可用範圍

## 10. 已拍板（2026-09-26）

| 決策 | 決定 |
| --- | --- |
| 「不分主題」嘅測驗，喺主題限定咗嘅學生度出唔出？ | **出**（軸 B 第 2 條） |
| 學生可唔可以自己切換去未分配嘅主題？ | **唔可以**（揀選器唔出）。未做過限定嘅分享照舊自由切換 |
| 學生帶住一個未分配嘅主題點算？ | **當「冇指定」**，落可用範圍內嘅默認（唔喺就取第一個）；唔出錯、唔中斷 |
| 一個班級可唔可以「零主題」而保留 Bot？ | **可以**（要兼容舊 Bot）。分清：未做過限定 → 全部；做過限定但清空／被刪光 → 零主題＝用唔到 |
| 要唔要「複製某班級嘅主題設定去另一班」？ | **唔做** |
| 直接分享嘅學生要唔要一樣限定？ | **要**（否則同一班兩類學生見到唔同主題，更難解釋） |
| 未分配嘅主題喺揀選器要唔要灰掉？ | **唔顯示** |
| 零可用主題時學生見到乜？ | Bot 卡照出、寫「等候老師安排」、對話入唔到 |

## 相關文件

- [測驗發佈跟 Bot + 主題 — UX/UI 設計](quiz-topic-publishing.md)
- [測驗跟 Bot + 主題：實作與維護](quiz-topic-implementation.md)
- [知識地圖多主題版本（Tab 架構）](knowledge-map-topic-versions.md)
- [學生管理與名單匯入](student-management.md) — 班級／群組嘅既有規則
