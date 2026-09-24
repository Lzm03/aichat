# 異常對話偵測規格（Chat Anomaly Detection Spec）

版本：v2（2026-09-24 加入類別×動作模型）｜適用：`server/lib/chat-anomaly-rules.ts` 嘅偵測規則、`server/api/ask.ts` 嘅攔截鉤子、`server/api/flagged-chat.ts` 嘅紀錄 API 與教師端「異常對話記錄」卡（學習報告頁）

## 目的

學生與 Bot 對話時，訊息一經偵測命中規則即按**類別**決定動作，同時留一條審計紀錄供老師覆核。

**唔係所有異常都係「不當」**——學生可能發出情緒困擾訊號，或者唔小心泄露個人資料。兩者老師都要即刻知，但處理方式完全唔同，所以系統分開三類：

| 類別 | 動作 | 學生見到 | 老師見到 |
| --- | --- | --- | --- |
| 不當用語 `inappropriate` | `block` 完全攔截 | 提示語，訊息冇送出，可改字重發 | 紀錄（含完整原文） |
| 個人私隱 `privacy` | `block` 完全攔截 | 提示語，訊息冇送出，可改字重發 | 紀錄（含完整原文） |
| 情緒困擾 `wellbeing` | `flag` 放行＋通知 | **正常收到回覆**，唔會被打斷 | 紀錄，置頂優先處理 |

**為咩情緒困擾唔攔截**：攔截等於靜音學生嘅求救訊號，而且佢會以為系統壞咗、可能唔再講。呢個係最壞嘅失敗模式——正正喺最需要人回應嗰刻切斷佢。所以情緒困擾一律放行，只留紀錄畀老師跟進。

**`block` 語義**：訊息唔到 model、唔扣 credits、唔入任何對話史（`bot_chat_messages`／`conversation_messages`／`conversations`）。`flagged_chat_messages` 係唯一記錄。

同測驗嘅[異常偵測規則](anomaly-detection-spec.md)分工：測驗警示係 **advisory**（照出分、照記錄），對話嘅 `block` 係 **enforcement**（訊息根本唔送出）——所以 `block` 類詞表嘅 FP 容忍度更嚴。兩套規則獨立運作、各自有 ruleId，唔共用詞表（見「同測驗警示嘅關係」）。

## 偵測原則

1. **只篩學生訊息**：`usageType === "chat_message"` 且登入者 role 為 `student`。老師 preview 自己個 Bot、訪客（未登入）同 Modo 整合流量都唔查（`shouldScreenChatMessage`）。
2. **規則順序＝優先級，首個 match 勝出**：`block` 類規則排前面。一條訊息同時含私隱同困擾訊號時，私隱贏——個人資料唔可以因為句子讀落似困擾就照送出去。（完整原文照樣入紀錄，老師睇得到困擾部分。）
3. **摘錄（excerpt）上限 40 字**（同測驗警示慣例）。
4. **ruleId 係持久化資料，永不改名**：已寫入 `flagged_chat_messages.rule_id`。關鍵字微調（語義不變）沿用同一 ID；語義變更先開新 ID，舊 ID 保留喺 `FlaggedChatSummaryCard` 嘅 `REASON_LABELS`。
5. **冇老師可通知就只攔截、唔留紀錄**：Bot 冇 owner（`default`）或係學生自建 Bot 時，`getBotOwnerId` 回傳 null 或學生自己——冇老師可收，留紀錄只會產生孤兒行。
6. **status 生命週期**：`open` → `resolved`（標記已處理）／`dismissed`（確認無礙），單向不可逆；badge 統計只數 `open`。
7. **`detected_by` 預留 AI 層**：日後加「regex 唔中但含變體訊號」（遮字符號、拼音、同音字）嘅 AI 判定，同表加行，唔使改 schema。

## 規則總表

FP 風險：極低＝正常對話幾乎唔會出現；低＝少見；中＝需情境判斷；高＝常見正常用法，須謹慎。**`block` 係強制動作**——每次 FP 都食咗學生打咗嘅字兼造假紀錄，所以「中-高」一律唔入 `block` 詞表。`flag` 只係叫老師睇一眼，容忍度高得多，所以情緒困擾詞表可以闊。

### 1. 不當用語 `inappropriate` — ruleId `inappropriate-chat-offensive-terms`（`block`，不分大小寫）

| 關鍵字 | FP | 採用 |
|---|---|---|
| 冚家鏟／仆街（經典粗口） | 低 | ✅ |
| 屌你／屌（單字粗口；regex 排最長先令 excerpt 出足詞） | 低 | ✅ |
| 柒頭（辱罵） | 低 | ✅ |
| 阿差／黑鬼（種族貶稱，同測驗警示共用來源） | 低 | ✅ |
| 死肥／樣衰（譏笑身材樣貌） | 低-中 | ✅ |
| 收皮／食屎（辱罵） | 中 | ✅（學生對話語境，正常學習內容罕見） |
| 去死（叫人去死；regex 係 `(?<![我想])去死(?!亡)`） | 低-中 | ✅ |
| fuck／shit／bitch／asshole／damn／wtf（英文粗口／縮寫，`i` flag） | 低-中 | ✅ |
| 白痴／低能／弱智（能力貶損） | 中-高 | ❌（共融課／自嘲／課程內容會中；測驗警示採咗因為佢只係 advisory） |
| 蠢／垃圾（輕蔑詞） | 高 | ❌（「垃圾分類」係常態話題；同上） |
| 排擠／欺凌（行為描述詞） | 中-高 | ❌（欺凌議題課堂討論常見） |

**`去死` 嘅兩個守門**：`(?!亡)` 豁免「死亡谷」等地名；`(?<![我想])` 令「你去死」照攔，但「我想去死」跌落下一個規則變情緒困擾——同一個詞，第二人稱係攻擊、第一人稱係求救。

判斷依據：訊息包含攻擊性或不適宜詞彙。

### 2. 個人私隱 `privacy` — ruleId `privacy-chat-personal-info`（`block`，不分大小寫）

| 格式 | 採用 |
|---|---|
| 聯絡詞 + 8 位數字（`電話｜手机｜手機｜whatsapp｜ws｜微信｜wechat｜tel` 後 0-8 字內 8 位數） | ✅ |
| 香港身份證格式 `A123456(3)` | ✅ |
| 電郵地址 | ✅ |
| 單獨一串 8 位數字（冇聯絡詞） | ❌（數學題答案、學號、年份都會中） |
| 「住在」「地址」（**唔靠呢啲詞判斷**） | ❌（普通功課太常見；要靠真格式先算） |

判斷依據：訊息包含疑似個人資料，已攔截未送出。

### 3. 情緒困擾 `wellbeing` — ruleId `wellbeing-chat-distress-terms`（`flag`）

| 關鍵字 | 採用 |
|---|---|
| 自殺／自杀／輕生／轻生／自殘／自残 | ✅ |
| 想死／想去死（`(?!亡)` 豁免地名）／唔想活／不想活／活唔落去 | ✅ |
| 生無可戀／生无可恋／想消失 | ✅ |
| 都係因我而起／都是因我而起／我唔喺度會好啲／我不在會更好（自責、覺得自己係負累） | ✅ |
| 人生冇(咩/乜)意義／人生沒有(甚麼/什麼)意義／活著好像沒什麼意義 | ✅ |
| 唔使再醒／不用再醒 | ✅ |

詞彙同測驗嘅 `wellbeing-distress-terms`（`server/api/quizzes.ts`）共用來源。呢個表係 advisory，寬少少只係老師睇多一眼，唔會罰到學生。

判斷依據：訊息包含情緒困擾或負面訊號，建議優先了解。

### 來源

[教育局《學校行政手冊》§3.7.6 欺凌定義](https://www.edb.gov.hk/attachment/tc/sch-admin/regulations/sch-admin-guide/sag_c.pdf)（言語欺凌：惡意中傷、言語侮辱、譏笑身材樣貌）、[平機會《種族歧視條例》第602章](https://www.eoc.org.hk/zh-hk/discrimination-laws/race-discrimination)（中傷＝煽動仇恨、嚴重鄙視或強烈嘲諷）、[PCPD《AI：個人資料保障模範框架》](https://www.pcpd.org.hk/tc_chi/artificial_intelligence/)（目的限制、資料最少化、人為監督）。

## 資料結構

```sql
flagged_chat_messages (
  id TEXT PRIMARY KEY,
  bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,   -- 審計軌跡：刪 Bot 唔刪紀錄
  student_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,        -- 完整訊息（老師要睇「邊句」）
  excerpt TEXT NOT NULL,        -- 命中片段（≤40 字）
  rule_id TEXT NOT NULL,        -- ruleId，永不改名
  category TEXT NOT NULL DEFAULT 'inappropriate' CHECK (category IN ('inappropriate','wellbeing','privacy')),
  action TEXT NOT NULL DEFAULT 'block' CHECK (action IN ('block','flag')),
  detected_by TEXT NOT NULL DEFAULT 'keyword' CHECK (detected_by IN ('keyword','ai')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  teacher_comment TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

- `category`／`action` 係後加欄，用 `ALTER TABLE ADD COLUMN IF NOT EXISTS` ＋ guarded `DO $$ ... EXCEPTION WHEN duplicate_object` 令新舊 schema 收斂（開機自癒，唔使 migration 檔）。**`action` 寫入紀錄而唔係讀 rule 表推導**：規則表日後改動唔應該改寫歷史——紀錄要反映當時實際做咗乜。
- **唔設 class snapshot 欄**：班級名係 read-time JOIN `student_group_members`／`student_groups` 攞，roster 重組唔會變 stale。
- **`block` 嘅訊息唔入 `bot_chat_messages`**（嗰個表係「Bot 有份參與嘅對話」log，入咗會變冇人答嘅鬼訊息）**亦唔入 `conversation_messages`**（入咗就要先建 conversation，正是要避免嘅副作用）。`flag` 嘅訊息照行正常路徑，所以照入。

## API

| 端點 | 權限 | 用途 |
| --- | --- | --- |
| `GET /api/flagged-chat/count` | 老師/admin | open 數，餵 Sidebar「學習報告」badge 同異常對話記錄卡扼要（15 秒輪詢） |
| `GET /api/flagged-chat?status=open\|resolved\|dismissed\|archived\|all&limit&offset` | 老師/admin | 列表（學生名、班級、Bot 名、時間、完整訊息＋高亮 excerpt、類別、判斷依據）；回 `statusCounts` 餵 tab 數。「已歸檔」tab 用 `status=archived`（resolved＋dismissed 合併）。**排序：`(category='wellbeing' AND status='open') DESC, created_at DESC`**——情緒困擾置頂，就算唔係最新 |
| `PATCH /api/flagged-chat/:id` | 老師/admin | `{ status: "resolved"\|"dismissed", teacherComment? ≤500 }`；只可由 `open` 轉；`FOR UPDATE` 加 `teacher_id` 校驗（他人紀錄 404） |

鉤子：`POST /api/ask` normalize 之後、任何 DB 寫入同 `consumeUserCredits` 之前。命中 `block` 回 `422`，前端憑 `code` 辨識：

| code | 學生文案 |
| --- | --- |
| `inappropriate_language` | 請使用合適的用語，此紀錄已通知老師 |
| `personal_data_detected` | 訊息含個人資料，已提醒老師 |

命中 `flag`（情緒困擾）**唔回錯誤**，請求照行落去，只係多寫一條紀錄。

## 學生端 UX

`block` 命中後：移除該 optimistic 訊息 bubble、輸入框還原原字（學生可改字再send）、彈提示（標題「訊息未能送出」＋按 code 揀文案）。語音、引導提示、引導動作全部經同一 `sendMessage` 路徑，覆蓋一致。

`flag` 命中後：**學生完全唔覺**——回覆正常出現，唔會彈任何提示。呢個係刻意嘅：干擾反而會令學生收口。

## 教師端 UX

入口喺**學習報告頁**（唔係 Sidebar 獨立頁）：

1. **紅點**：Sidebar「學習報告」item 掛紅色 open 數 badge（15 秒輪詢；mock 唔支援時隱藏）。
2. **異常對話記錄卡**：學習報告頁上排同「能力追蹤報告」兩大卡並排。卡片**收合時只顯示扼要**——待處理數＋最有需要跟進嗰條嘅時間，唔係操作工作檯。有情緒困擾待處理時，扼要多一個紫色「建議優先處理：情緒困擾」提示。
3. **撳開先展開**：按後端排序（情緒困擾置頂，其餘時間倒序）顯示紀錄；分兩個 tab——「待處理」（open）同「已歸檔」（resolved＋dismissed 合併）。
4. **每條紀錄嘅資訊**：學生名＋班級＋角色＋**類別 pill**（不當用語／情緒困擾／個人私隱）＋狀態 pill；訊息全文（命中片段高亮）；判斷依據；**一句講清楚系統做咗乜**——「訊息已攔截，未有送出。」或「訊息已照常送出，學生已收到回覆。」
5. **歸檔＝已處理**：老師「標記已處理」（可加備註）或「確認無礙」後，紀錄自動由待處理移入歸檔 tab（status 單向不可逆）；處理完 badge 減一。
6. **頁面唔會無限延展**：每 tab 分頁 20 條＋「載入更多」掣；舊紀錄留喺歸檔 tab 分頁內，唔會一次過攤開。

## 合規依據（整體）

同測驗警示 spec 一樣錨定：

1. [教育局《學校行政手冊》§3.7.6](https://www.edb.gov.hk/attachment/tc/sch-admin/regulations/sch-admin-guide/sag_c.pdf) 言語欺凌定義——`block` 對象（種族貶稱、身材譏笑、辱罵）有官方依據。
2. [PCPD《AI：個人資料保障模範框架》](https://www.pcpd.org.hk/tc_chi/artificial_intelligence/)：目的限制、資料最少化、**人為監督**——系統只存命中嘅訊息本身（數據最小化），處理權喺老師（resolve／dismiss），**唔存在自動處分**。
3. 學生知悉原則：`block` 當下即被告知「已通知老師」（透明度）。`flag` 唔通知學生係刻意——告知反而會令佢收口，而呢類個案嘅價值喺於老師主動關心。

**本系統對應設計**：偵測 → （`block`：學生知悉／`flag`：靜默）→ 老師喺異常對話記錄卡覆核 → 老師決定後續，全程無自動處分。

## 同測驗警示嘅關係

- 兩套系統**獨立**：測驗 `inappropriate-offensive-terms`（advisory、容忍高 FP）同對話 `inappropriate-chat-offensive-terms`（enforcement、詞表更嚴）係唔同 ruleId、唔同詞表，互不遷移。
- 共用嘅嘢：excerpt 上限、ruleId 不可變、status 生命週期、`wellbeing` 詞彙來源、判斷依據文案風格、合規原則。
- 測驗嘅身心安全警示一樣係置頂優先處理——同一套價值觀。

## 擴充 Checklist（加關鍵字／新規則必做）

1. `server/lib/chat-anomaly-rules.ts` 嘅 `CHAT_ANOMALY_RULES` 加詞／加規則；**關鍵字微調沿用舊 ruleId，新語義先開新 ruleId**。新規則要同時決定 `category` 同 `action`——**情緒困擾類永遠係 `flag`**。
2. `components/dashboard/FlaggedChatSummaryCard.tsx` 嘅 `REASON_LABELS` 加判斷依據中文；新 `category` 要加 `CATEGORY_CONFIG` pill。
3. `utils/uiEnglish.ts` 加英文（`npm run test:i18n` 強制）
4. 更新本 spec 規則總表＋FP 風險＋來源
5. 無 DB migration（`ensureFlaggedChatTables` 開機自癒）；改表結構先改 DDL 同 `ALTER TABLE ADD COLUMN IF NOT EXISTS`
6. 加詞後 `cd server && npm run test:chat-anomaly-rules` 加負例／正例；改鉤子／API 行為跑 `npm run test:flagged-chat`（要 `DATABASE_URL` 指住 `students_test` DB，否則靜靜雞全 skip）
