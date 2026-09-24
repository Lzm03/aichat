# 架構總覽

ChopReality 的主前端與 API 服務。介面語言以繁體中文（香港用語）為主，教師端另支援英文。

## 三個層

```text
瀏覽器
  │
  ▼
前端 SPA（Vite dev server :3000；production build 部署 Vercel）
  │  fetch —— 一律經 utils/api.ts 的 API_BASE
  ▼
後端 Express（server/，port 由 server/.env 決定；部署 Railway）
  │  pg
  ▼
PostgreSQL
```

本機開發時中間那層可以換成**預覽 mock**（在 repo 外，不入版控），不需要 PostgreSQL 就能跑起前端。

## 前端

- **單一 React SPA**：Vite 6 + React 19 + TypeScript + Tailwind CSS v3
- **頁面切換由 `App.tsx` 的 state 驅動，不是 router**。專案沒有 react-router；新增一個頁面 =
  在 `pages/` 加檔 + 在 `App.tsx` 加分支
- **API 呼叫一律用 `utils/api.ts` 的 `API_BASE`**，不要自行拼 origin。既有少數檔案自行讀
  `VITE_API_URL`，遇到時順手統一
- **樣式**：Tailwind utility 為主；全域 CSS 變數與動畫集中在 `globals.css`。
  色彩、字體、圓角、動效見 [design-system.md](design-system.md)
- `app/` 是 Next App Router 遺留結構，**不要再擴大**；新頁面一律寫在 `pages/`

## 後端

`server/` 是 Express + PostgreSQL，內含 API routes、DB migrations、scripts。

- `api/` — REST API：auth / bots / ask / chat / conversations / quizzes / student-tasks / uploads…
- `lib/` — 後端邏輯：Gemini、影片任務、平台登入、主題、會話狀態
  - `conversation-track-queue.ts`：每段對話的狀態寫入走 FIFO 隊列，保證 read-your-writes。
    隊列是 **per-process** 的——多 instance 部署時跨進程序列化不成立（顯示側有 5 秒輪詢兜底）
- `config/` — 帳號覆寫、方案功能限額
- `migrations/` — SQL migration
- `scripts/` — 主題 migration、Google Sheet 用戶註冊、bot-prompt 回歸場景（`server/` 內 `npm run test:bot-prompt`）
- `handoff-*.txt` — 交付文件。慣例是**交付後凍結**，要更新就開新日期檔，不改舊檔

**鐵則：AI key 只存在 server 端環境變數（`server/.env`），禁止進前端 bundle 或 repo。**
`vite.config.ts` 的 `GEMINI_API_KEY` define 是既有安全債，不得擴大使用，理想方向是移除。

## 目錄地圖

```text
aichat/
├── index.html               # Vite 唯一 HTML 入口：zh-Hant、掛載 /index.tsx
├── index.tsx                # React 掛載點：App + globals.css
├── App.tsx                  # App shell：登入/路由判斷、Sidebar/Header、師生頁面切換
├── globals.css              # Tailwind 入口、全域 keyframes、學生端主題 CSS 變數
├── vite.config.ts           # port 3000、proxy /api /uploads → localhost:4000、alias '@' → repo 根
├── tsconfig.json            # paths @/* → 專案根、noEmit（檢查靠 npm run lint）
├── tailwind.config.js       # Tailwind v3：Noto Sans TC/Nunito、brand colors、soft-tech shadow
├── package.json             # 專案依賴與 npm scripts（逐套跑法見下方「測試」）
├── .gitattributes           # 文字檔一律 LF 存庫與 checkout（Windows CRLF 會弄壞讀源碼的測試）
├── vercel.json              # 前端部署設定
├── railway.toml             # 後端部署設定
├── next.config.mjs          # Next App Router 遺留設定；目前構建走 Vite
├── types.ts                 # 根層共享型別（部分型別也放在 types/）
├── pages/                   # Vite SPA 主要頁面（切換靠 App.tsx state）
│   ├── Dashboard.tsx            # 教師 Command Center 首頁
│   ├── AssessmentPage.tsx       # 智能評估/測驗工作台入口
│   ├── LearningReportPage.tsx   # 學習報告：5-tab（總覽／課堂參與／學生能力／對話紀錄／測驗質量）
│   ├── AiBotWorkshopPage.tsx    # AI Bot 工作坊主流程
│   ├── StudentManagementPage.tsx    # 學生帳戶/班級/群組管理
│   ├── StudentHome.tsx          # 學生首頁（共享 Bot 列表）
│   ├── StudentTasksPage.tsx     # 學生今日任務（分享事件 + 測驗任務）
│   ├── StudentAchievementsPage.tsx # 學生成就/徽章/統計
│   ├── SharedBotChatPage.tsx    # 學生與共享 Bot 對話頁
│   ├── CharacterStagePage.tsx   # 角色舞台 iframe 內嵌頁（idle/thinking/speaking）
│   ├── AuthPage.tsx             # 登入/註冊
│   ├── AccountPage.tsx          # 帳號資料與方案狀態
│   ├── SettingsPage.tsx         # 帳號設定、管理員帳號/Bot 管理
│   ├── ProPlanPage.tsx          # Pro 方案/升級頁
│   ├── HelpCenterPage.tsx       # 說明中心
│   ├── SchoolAvatarRequestPage.tsx # 學校頭像定制申請表
│   ├── SchoolAvatarRequestsAdminPage.tsx # 學校頭像申請管理後台
│   └── TeacherSharingPage.tsx   # ⚠️ 舊分享頁，待移除；勿再改舊 flow
├── components/
│   ├── icons.tsx                # Lucide icon 包裝與共用圖標
│   ├── layout/                  # App 外殼：Sidebar/Header/UserMenu/MobileSidebarDrawer
│   ├── chat/                    # 對話紀錄 Drawer/List Item
│   ├── dashboard/               # 學習報告卡、能力追蹤報告、學習報告入口卡
│   │   ├── FlaggedChatSummaryCard.tsx # 異常對話記錄卡（學習報告頁）：扼要＋撳開展開、類別 pill、待處理/已歸檔 tab、分頁
│   ├── assessment/              # 評估流程：題庫、產題、批改、主觀題、步驟元件
│   │   ├── MyQuizzesView.tsx        # 我的測驗：草稿/已發佈（含已封存區）+ 複製為草稿 flow + 刪除確認 + 封存/還原
│   │   ├── PublishedQuizDetailDrawer.tsx # 已發佈詳情 Drawer：題目預覽/成績結果/質量分析
│   │   ├── AnomalyAlertCenter.tsx   # 異常警示中心：Drawer 質量分析 tab 主體
│   │   ├── AnomalyAlertsOverview.tsx # AI 異常警示 sub-tab：有待處理警示嘅測驗列表
│   │   ├── AssessmentQualityList.tsx    # 評測質量測驗列表（學習報告頁，click 直開 Drawer）
│   │   └── QuestionCard.tsx         # 題目卡片（AssessmentLibrary 抽出共用）
│   ├── workshop/                # Bot 建立流程：CreationFlow/步驟/主題管理/影片/發布彈窗
│   │   ├── permissions/         # Bot 權限管理 Drawer
│   │   ├── steps/               # CreationStep1-4 + 聲音動畫步驟 + 教學模擬面板
│   │   ├── editor/              # 背景編輯、圖片裁切
│   │   └── topics/              # 角色主題/知識點管理
│   ├── student/                 # 學生端：Header/FloatingSidebar/StarMap/Island/TokenHistory/Confetti
│   ├── system/                  # 通用 UI：Button/Card/BentoGrid/Dialog/Token/FeatureLimit
│   └── shared/                  # 跨域小元件：AssessmentStepper/IosToggle/SafeAvatarImage/ShowMoreList（列表封頂 10＋看更多）
├── hooks/
│   ├── useFeatureEntitlements.ts # 方案功能限額與用量
│   ├── usePlatformDialog.ts      # 全域/局部 PlatformDialog 狀態
│   ├── useBodyScrollLock.ts      # Modal 開啟時鎖 body scroll
│   └── useFlaggedChatCount.ts    # 異常對話 open 數 15 秒輪詢（Sidebar「學習報告」badge）
├── utils/                   # 前端共用邏輯
│   ├── api.ts                   # API_BASE：VITE_API_URL 或 same-origin（所有 API 呼叫的入口）
│   ├── auth.ts                  # localStorage session、auth fetch bridge、登出
│   ├── chat-api.ts / voice-api.ts  # 對話/問答/語音 API 包裝
│   ├── chat-prompt.ts           # 系統 prompt 組裝＋知識點/對話狀態注入（前後端共用；規則見 docs/bot-persona-guide.md）
│   ├── coverage.ts              # 覆蓋判定純函數（client + server 共用，避免兩套實作走樣）
│   ├── teaching-simulation.ts   # 教學模擬預覽邏輯（純函數，唔打 API、唔寫 DB）
│   ├── topic-api.ts / topic-categories.ts # 角色主題 API 與分類標籤
│   ├── bot-proposal.ts          # 客制化申請的角色設定草案（輸出節名與 chat-prompt 對齊；合約見 server/tests/bot-proposal.test.ts）
│   ├── uiI18n.ts / uiEnglish.ts # 師生介面中英文文案
│   ├── teacherI18n.ts           # 教師語言 state 與切換
│   ├── teacher-data-cache.ts    # 教師資料快取（TTL 60 秒、in-flight 去重）
│   ├── userPreferences.ts       # 主題/語言偏好與 dark class 同步
│   ├── assessment-csv.ts        # 評估資料 CSV 匯出
│   ├── grades.ts                # 年級帶（P1…S4-S6）：只調語言難度，不改回覆語言
│   ├── subjects.ts              # 學科分類單一來源（9 項）＋逐科顏色＋舊分類 alias
│   ├── avatarColor.ts / default-avatar.ts # 頭像顏色與預設頭像
│   ├── uploadFilename.ts        # multipart 檔名 Latin-1→UTF-8 修正（中文檔名防亂碼）
│   ├── student-batches.ts       # 大量學生操作分批（API 每次最多 100 個 id，前後端共用上限）
│   ├── student-roster.ts        # 學生名單解析（CSV/TSV/xlsx → 姓名+班級+email）與範本產生；規則見 docs/student-management.md
│   └── trial-popup.ts           # Trial/demo 提示互動
├── types/
│   ├── chat.ts                  # 對話訊息/請求型別
│   └── topics.ts                # 主題/知識點型別
├── public/
│   ├── homepage/                # 官網首頁 iframe 靜態站（index.html/support.js/assets）
│   ├── ui-update/               # mock/升級頁圖片素材
│   ├── avatars/                 # 預設 Bot 頭像 SVG
│   ├── avatar-intake/           # 學校頭像定制風格圖
│   └── hint-videos/             # idle/thinking/speaking 示範影片
├── server/                  # Express + PostgreSQL 真後端
│   ├── index.ts                 # Express 入口：CORS、routes、health、media proxy、uploads
│   ├── db.ts                    # pg Pool 初始化
│   ├── botMapper.js             # camelCase ↔ snake_case 欄位映射（bots / modo API 用）
│   ├── api/                     # REST API routes（含 flagged-chat.ts：異常對話記錄）
│   ├── lib/                     # 後端邏輯（含 conversation-track-queue.ts、chat-anomaly-rules.ts：對話異常偵測）
│   ├── config/                  # 帳號覆寫、方案功能限額
│   ├── migrations/              # SQL migration
│   ├── scripts/                 # 主題 migration、Google Sheet 用戶註冊、bot-prompt 回歸場景（test:bot-prompt）
│   ├── tests/                   # 見下方「測試」
│   ├── types/                   # xai-sdk.d.ts：第三方 SDK 型別補充
│   └── handoff-*.txt            # 交付文件（凍結；更新開新日期檔）
├── tests/                   # 前端測試（見下方「測試」）
└── docs/                    # 本目錄：產品與工程文件，索引見 README.md
```

## 測試

| 位置 | 跑法 | 備註 |
| --- | --- | --- |
| `tests/*.test.mjs` | `npm run test:i18n`、`npm run test:ids` 等逐套 script | `/tests/*` 被 `.gitignore` 擋住，**只追蹤白名單**——新測試要加 `.gitignore` negation 先入版控。注意 `test:all` 係掃 working directory：未入版控嘅新測試**本機照跑、照綠燈**，但同事完全睇唔到，所以白名單係唯一防線 |
| `tests/ui-i18n.browser.cjs` | **不**行 `node --test`。要開住 dev server，用 `playwright-cli run-code --filename` 跑 | |
| `server/tests/*.ts` | `cd server && npm run test:<名>` | **每套都應該有 npm script**。冇 script 嘅測試檔冇人跑，會靜靜雞腐爛。要 DB 的自帶 guard：`DATABASE_URL` 要是本機（`localhost`／`127.0.0.1`）且含指定關鍵字，否則全 skip——`character-topics` 要 `topic_test`、`conversation-topic-switch` 同 `conversation-track-queue` 要 `topic_switch_test`、`students` 同 `flagged-chat` 要 `students_test`；`quiz-audience` 例外，用探測式（DB 可達且有 `quizzes` 表）就照跑 |
| `server/scripts/test-bot-prompt.ts` | `cd server && npm run test:bot-prompt [S1 … S14]` | 真 LLM 回歸場景（DeepSeek／OpenRouter，唔使 DB）；`test:all` 只 glob `tests/*.test.ts` 唔會掃到，所以佢有獨立 script。純 prompt 單元測試另見 `test:answer-mode` |

⚠️ 根目錄 `npm run lint`（`tsc --noEmit`）**會一併檢查 `server/`**：`tsconfig.json` 冇 `include`／
`exclude`，所以 `server/` 亦在掃描範圍。即係要**先 `cd server && npm install`** 先過得到。
只裝根目錄依賴就跑 lint，會出一批假錯誤：`Cannot find module 'pg'`／`'adm-zip'`，加連帶嘅
`TS2339: Property '…' does not exist on type 'unknown'`（2026-09-24 CI 首次運行時係 17 個）。
（CI 亦因此要裝兩次依賴，見 `.github/workflows/ci.yml`。）

DB suite 每次都會建 schema，所以**唔可以指去一個你在乎嘅 database**。一個全新空 DB 就夠跑，
只需先有 `bots`——佢係遺留表，`ensurePlatformTables()` 唔會建，但 `bot_student_progress` 有 FK
指住（測試檔自己會補上）。`test:all` 用 `--test-concurrency=1` 逐檔跑：所有 DB suite 共用同一個
database，而 `CREATE TABLE IF NOT EXISTS` 本身唔係 race-free（兩個進程同時建表，輸家爆
`pg_type_typname_nsp_index`），併發跑會隨機紅。

## 相關文件

- [設計系統](design-system.md) — 色彩、字體、圓角、動效
- [學生管理與名單匯入](student-management.md) — 班級欄位慣例、匯入規則、範本格式
- [Bot 角色設定指南](bot-persona-guide.md)
- [異常偵測規則規格](anomaly-detection-spec.md)
- [異常對話偵測規格](chat-anomaly-detection.md) — 學生對話三類別（不當用語／情緒困擾／個人私隱）× 攔截或放行、詞表、紀錄 API
- [Bot 對話測試架構](bot-conversation-testing.md)
