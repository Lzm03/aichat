# 課堂參與度分析規格（Class Participation Spec）

版本：v1（2026-09-24；同日修訂：加 Bot／話題維度、刪「5 條訊息」門檻、改用 `conversation_messages`）
｜適用：學習報告頁 tab 架構、班級參與度分析、LLM 參與度判斷

## 目的

教師課堂實測後反映：學生對話紀錄入面有大量無實質意義嘅訊息（「哦」「test」「亂打字」），
反映實際參與程度，但老師要**逐條翻閱**先睇得出邊班、邊個時段有問題。

本規格定義一個**班級層級**嘅參與度分析，令老師一眼掌握整體，唔使逐條翻。

來源：0923 平台問題回報 問題 6.4（教師後台對話紀錄可作為課堂表現參考）。

**同問題 5 嘅關係**：問題 5（`chat-anomaly-detection.md`）已經上線，兩者**唔共用資料**——
問題 5 只存命中規則嘅訊息（`flagged_chat_messages`），參與度要睇**全部**學生訊息（`bot_chat_messages`）。
可以共用嘅係**模式**：卡片收合扼要、Sidebar 紅點、就地歸納、唔自動處分。

## 界線（唔做乜）

**本節係硬性約束，唔係建議。** 呢個功能量度學生行為，一旦變成排行榜就會由「幫老師」變成「標籤學生」。

1. **唔出學生排名。** 唔可以按參與度排序學生。
2. **唔用「參與度低」標籤。** 用「未有互動」「需要關注」。
3. **唔自動處分。** 系統只呈現，判斷權喺老師（同 `chat-anomaly-detection.md` 一致）。
4. **唔顯示個別學生嘅無意義比例。** 班級層級先出百分比；個別學生只出「有／未有實質互動」，
   唔出數字。呢個係刻意嘅不對稱——班級數字幫老師備課，學生數字會變成標籤。

四條喺 2026-09-24 經用戶逐條確認，係定稿約束，唔係待議項。

## 指標定義

| 指標 | 粒度 | 定義 |
| --- | --- | --- |
| 有效提問次數 | 群體 | LLM 判斷為「學生主動提出、同學習內容相關」嘅訊息數 |
| 無意義訊息比例 | 群體 | LLM 判斷為無實質內容嘅訊息 ÷ 期內學生訊息總數 |
| 活躍學生數 | 群體 | 期內有 ≥1 條實質訊息嘅學生數 |
| 未有互動學生數 | 群體 | 期內 0 條實質訊息嘅學生數（**最需要跟進嘅一組**） |

「群體」＝班級／單一 Bot／單一話題，三者係同一批數字嘅唔同切法（見下節）。
四個指標**全部唔會出個人數字**——呢點見「界線」第 4 條。

**「無意義」唔由零定義**：`server/lib/answer-judge.ts` 已有 `JUDGE_SUBSTANTIVE_MIN = 4`
（「學生『實質輸入』最短字數：低過即敷衍回覆（哦／唔知／係），唔值得判斷」）。
參與度判斷擴展呢個定義，唔另立一套。

### 分析維度

三個維度由**同一個資料集**切出嚟，唔各自計一次：

| 維度 | 來源 | 點解要 |
| --- | --- | --- |
| 班級 | `student_group_members` → `student_groups`（`type='class'`） | 老師第一句問嘅係「呢班而家點」 |
| 每個 Bot | `bot_id` | 同一班唔同 Bot 嘅參與度可以差好遠 |
| 每個話題 | `conversations.topic_id` | 分得出係邊份教材／邊個話題令學生走神 |

**班級係默認視圖，Bot／話題係細分。**（2026-09-24 用戶拍板：要拆到每個 Bot／每個話題。）
唔拆嘅話老師只知「呢班麻麻」，唔知係邊個環節出事，跟進唔到。

### 資料來源

⚠️ **唔可以讀 `bot_chat_messages`。** 佢係教師對話紀錄用嘅表，冇 `conversation_id`、
冇 `topic_id`（`server/lib/platform-auth.ts:365`），**切唔出「每個話題」**。

參與度讀 **`conversation_messages` JOIN `conversations`**——`conversations` 帶 `bot_id` 同
`topic_id`（`server/lib/conversations.ts:82`），維度齊。過濾條件：

- `role = 'user'`（只算學生講嘅）
- `message_type = 'normal'`——撇除 `quiz_question`／`quiz_answer`／`quiz_result`，
  否則測驗作答會當成對話訊息，測驗多嘅班會無端端「高參與」
- `created_at` 喺所選時間範圍內

判斷結果按 **`conversation_id` 存一條摘要**（有效提問數／無意義數／實質訊息數／學生訊息總數），
唔存逐條訊息標籤。`bot_id`、`topic_id`、`user_id`、閒置時間全部由 conversation 帶落嚟，
將來加維度唔使改 schema。

## 判斷機制（LLM）

### 搭現有 judge 順風車，唔另開 call

`conversation-state.ts` 喺 strict coverage 模式下已經每 `JUDGE_INTERVAL_TURNS`（=3）輪
call 一次 `judgeStudentAnswers`，同一個對話、同一份 context。

**做法**：喺同一次 call 加問參與度維度（`isEffectiveQuestion`／`isSubstantive`）。
另開一個 judge = 同一段對話跑兩次 LLM，成本翻倍，冇理由。

**明確唔係「每次都 call」。** 成本上限：

| | LLM call 數 |
| --- | --- |
| 現狀 | 每 3 輪 1 次 judge |
| 加參與度 | **一樣**——同一 prompt 加兩個 output field，唔另開 call |
| 閒置補漏 | 每個對話**最多多 1 次**（見下） |

額外成本淨係 output token 長咗少少，加每段對話最多一次補跑。總數大約由
`⌈輪數 ÷ 3⌉` 變成 `⌈輪數 ÷ 3⌉ + 1`。

### 觸發條件

兩條路徑，**兩條都唔設最低訊息數**：

1. **常規**：搭現有每 3 輪嘅 judge 週期，零額外 call
2. **補漏**：對話閒置 10 分鐘（`bot_conversation_states.updated_at`）而仲有未判斷嘅訊息
   → 補跑一次

**點解唔設「5 條訊息」門檻**（2026-09-24 用戶拍板刪）：參與度分析最想捉嘅就係「講一兩句就走」
嘅學生。硬性要 5 條先判斷，佢哋**永遠唔入統計**——班級參與度會睇落好好，而實際最需要跟進
嘅個案被靜靜雞濾走。呢個係 survivorship bias，係呢個功能最危險嘅失敗模式。

**點解唔用「學生關閉 Bot」**：呢個係網頁 app，冇可靠嘅關閉事件。閂 tab、跳頁、手機鎖屏、
斷網全部唔會觸發，`beforeunload` 喺手機（尤其 iOS Safari）唔可信；而且學生根本冇
「關閉 Bot」呢個動作。閒置超時係唯一可靠嘅 session 結束訊號。

**「未判斷」嘅定義**：`bot_conversation_states.turns_since_judge > 0`。補跑完必須清零，
掃描要 idempotent——否則每個週期重複燒 call。

### Fallback

跟現有慣例（`judged ?? computeStudentEvidence(...)`）：LLM 判斷唔到**唔可以靜靜當 pass**。
用 `judgeSource` 標明來源（`llm` ／ `heuristic-fallback`），heuristic fallback 用
`JUDGE_SUBSTANTIVE_MIN` 字數門檻，統計頁要分得開兩者。

### 非同步

**唔可以阻塞對話**。跟 `server/lib/conversation-track-queue.ts` 嘅 per-conversation FIFO
promise 鏈（fire-and-forget，read-your-writes）。判斷幾時完成唔影響學生體驗。

## 時間範圍

**30 日 / 90 日 / 全期**，頁面層級一個選擇器控制全部 tab。

**唔用學期**：全倉庫冇任何學期／學年概念，引入要綁死校曆（每間學校唔同），
而且「9–1 月／2–6 月」係假設，維護成本高過收益。滾動窗口冇呢個問題。

2026-09-24 已上線：`AbilityTrackingReport` 自帶嘅 `30d`／`all` 切換已刪，時間範圍收歸
`LearningReportPage` 擁有（受控 `period` prop），避免兩個選擇器講唔同嘢。

**現階段只有學生能力 tab 出呢個選擇器**：其餘 tab 嘅資料源（`assessment-report`、
`progress-overview`、異常對話、測驗質量）都冇時間參數，出咗都撳完冇反應。等數據源支援先擴展。

⚠️ **`period=90d` 真後端未支援**：`/api/teachers/me/ability-report` 本身未喺 repo 實作
（frontend-only，preview mock 實現；mock 已補 90 日）。屬既存 gap，唔喺今期修。

## 教師端 UX

學習報告頁改為 **tab 架構**，跟智能評測頁（`pages/AssessmentPage.tsx` 嘅 `TOP_TABS` +
`QUICK_LINKS`）嘅既有模式：

| Tab | 內容 |
| --- | --- |
| 總覽 | 快速入口卡（`QUICK_LINKS` 模式），一眼睇晒 |
| 課堂參與 | 本規格新增：班級指標（可切「按 Bot」／「按話題」）＋ 未有互動學生名單。**第一期只出「準備中」說明**——判斷後端未上線，唔放假數字 |
| 學生能力 | `StudentLearningReportCard`（含課堂對話記錄 drawer）＋ `TeacherProgressOverview` 並排，`AbilityTrackingReport`（Bloom 六層級）全闊放下面 |
| 對話紀錄 | `FlaggedChatSummaryCard`（問題 5） |
| 測驗質量 | `AssessmentQualityList` |

**學生能力 tab 點解唔豎排三張**（2026-09-24 用戶指出會擁擠）：`StudentLearningReportCard` 同
`TeacherProgressOverview` 都係列表形，並排最自然；`AbilityTrackingReport` 有雷達圖同學生輪廓，
需要闊度，所以全闊放下面。三張豎排會又長又逼。

**總覽唔重複智能評測已有嘅 KPI**（2026-09-24 用戶決定）：已發佈測驗／待批改作答／已完成批改
喺智能評測頁總覽已有，待處理異常紀錄亦有 Sidebar 紅點。所以總覽只出快速入口卡；班級級 KPI
（活躍學生數、未有互動學生數）等課堂參與數據上線先加——嗰時先真係答到「呢班而家點」。

**總覽亦唔出「新建測驗」入口**（2026-09-24 用戶決定）：Dashboard 同智能評測頁已經有建立入口，
學習報告頁係「睇報告」嘅地方，唔應該搶一個建立動作。快速入口因此由 5 張變 4 張，
排 `md:grid-cols-2`（2×2），並移除咗原本突出嘅 accent 卡樣式。

**點解要總覽 tab**：老師嘅問題係「呢班而家點」。報告原文寫「幫助教師**快速**掌握整體班級表現」
——「快速」即係唔應該要撳入去先睇到。總覽 tab 就係嗰一眼。

**課堂參與 tab 嘅 drill-down**：班級數字 → 「未有互動學生」名單 → 撳學生開
`StudentLearningReportCard` 現有嘅課堂對話記錄 drawer 逐條睇（`StudentLearningReportCard.tsx`
嘅 `isChatRecordsOpen`）。呢個路徑**係現成嘅**，唔使新建。對應報告講嘅
「快速掌握整體，而非逐條翻閱」——由整體發現問題，先落去翻。

**維度切換**：課堂參與 tab 頂部一個「班級／按 Bot／按話題」切換，同時間範圍選擇器並排。
默認班級——老師入嚟第一眼要係「呢班點」；細分係第二眼，用嚟定位問題喺邊個 Bot／話題。
兩個選擇器一齊控制成個 tab，唔好每張卡各自一個。

## 累積資料嘅歸納

問題 4 原文建議「可考慮改為**封存**而非直接刪除，保留歷史數據」——2026-09-24 已補做
（見「分期」）。列表隨時間增長嘅處理原則：

1. **就地歸納，唔開「歷史資料」倉庫板塊。** 倉庫冇人撳，內容會變成無人理嘅墳場；
   而且會將「而家」同「以前」拆去兩個地方，老師要跳頁先拼得返個圖。詳見下節。
2. **跟返現有兩種模式**（唔使發明新嘅）：
   - `GradingWorkspaceHome`：「已歸納（批改完成）」默認收起、撳開先展開
   - `AssessmentQualityList`：顯示 10 條（`MAX_VISIBLE_QUIZZES`）＋「看更多」
3. **時間範圍選擇器係第一道閘**：30 日以外嘅嘢默認唔撳出嚟。
   （2026-09-24：頁面級選擇器已上線，惟現階段只有學生能力 tab 消費佢——見「時間範圍」。）
4. **學生能力兩張卡內所有會增長嘅列表封頂 10 個**（2026-09-24 用戶要求「唔可以無限延展」）：
   收成共用元件 `components/shared/ShowMoreList.tsx`（`limit` 預設 10，就地
   「看更多（還有 N 個）／收起」，唔開下拉選單）。適用：能力追蹤報告嘅 AI 夥伴列表、
   班級知識覆蓋地圖每個主題嘅知識點格、知識點掌握概覽嘅 Bot 列表同每節知識點。
   **唔封頂嘅**：學習狀態分佈矩陣（固定高度散點圖，本來唔會長）、學生排行榜／全班評估
   明細表／對話記錄（都喺可滾動嘅 modal／drawer 內，唔屬「卡片無限延展」）。
   撳「查看報告」進入嘅明細檢視同樣受封頂約束——佢係卡片內容，唔係獨立頁。
5. **測驗封存**：`quizzes.archived_at`（NULL = 未封存）而非刪除，補返問題 4 漏咗嘅一項。
   已封存嘅測驗唔計入智能評測總覽 KPI，但作答、成績同異常標記全部保留。
   已封存嘅喺列表出**緊湊單行**（標題＋題數／日期），唔再出完整卡片——收起咗嘅嘢唔應該
   同進行中嘅爭視覺重量；但仍然撳得入 Drawer，因為「紀錄保留」要攞得返先算數。

## 分期

**第一期**：班級指標（30/90/全期）＋ 學習報告頁 tab 架構 ＋ 總覽快速入口。
判斷機制搭現有 judge。**唔包含**學生層級數字。

2026-09-24 進度：tab 架構（總覽／課堂參與／學生能力／對話紀錄／測驗質量）＋ 總覽快速入口 ＋
頁面級時間範圍**已完成**；課堂參與 tab 出「準備中」說明——班級指標本身未做，judge 加參與度
維度、`conversation_messages` 聚合、閒置掃描三件都喺後端，未開始。
同日調整：總覽移除「新建測驗」入口（改為 4 張卡 2×2）；學生能力兩張卡嘅列表封頂 10 個
（`ShowMoreList`）。

**第二期**：測驗封存（問題 4 補做）**已完成**——老師可將已發佈測驗封存／還原，
作答、成績同異常標記全部保留，`archived_at` 為 NULL 就係未封存；跟住係閒置判斷嘅調校、
未有互動學生嘅跟進流程。

## 待確認

- 閒置門檻 10 分鐘係估算，要喺真課堂驗（一節課幾長、學生實際節奏）
- 「有效提問」同「無意義」喺同一次 judge call 加兩個 output field，要核 Gemini 回應
  長度同 parse 穩定性（`server/lib/answer-judge.ts` 嘅 `parseDemonstrated` 有先例）
- 閒置補漏要一個 server 內定時掃描。**後端行多過一個 instance 就會同時掃到同一條對話**——
  要 idempotent（`turns_since_judge` 清零當鎖）或者 `SELECT … FOR UPDATE SKIP LOCKED`
- `period=90d` 要後端配合：`/api/teachers/me/ability-report` 未喺 repo（frontend-only），
  上線前要連 90 日窗口一齊做，否則真後端環境攞唔到 90 日數據
- 話題層面嘅版面：一個話題橫跨好多個 conversation（每位學生一個），
  係每個話題一行，定係揀一個話題先睇入面？
- 上線前要對一次 `conversation_messages`（`role='user'`）同 `bot_chat_messages` 嘅數量差——
  若果有學生訊息只落喺後者，嗰批會計唔到

## 合規依據

同 `anomaly-detection-spec.md` ／ `chat-anomaly-detection.md` 錨定同一套：

1. [PCPD《AI：個人資料保障模範框架》](https://www.pcpd.org.hk/tc_chi/artificial_intelligence/)：
   目的限制、資料最少化、**人為監督**——只做群體聚合（班級／Bot／話題都係聚合，
   唔係個人畫像）；處理權喺老師。
2. [教育局《學校行政手冊》](https://www.edb.gov.hk/attachment/tc/sch-admin/regulations/sch-admin-guide/sag_c.pdf)：
   本功能**唔用於**評分或紀律，只作課堂教學參考。
3. 不對稱呈現原則：班級出數字、學生出狀態（見「界線」第 4 點）。

**本系統對應設計**：LLM 判斷（非同步）→ 班級聚合 → 老師喺總覽／課堂參與 tab 睇 →
老師決定跟進邊個學生，**全程無自動處分、無學生排名**。
