# 設計系統

介面視覺的單一來源：`tailwind.config.js`（token 定義）、`globals.css`（CSS 變數、keyframes）、
`utils/subjects.ts`（學科分類與配色）。

寫 UI 時照這裡的 token 走，不要自己發明顏色或圓角數值。

## 色彩

| 用途 | 值 |
| --- | --- |
| 全域亮色背景 | `#F7F8FB`（`--bg-app`） |
| 全域深色背景 | `#020617`（`.dark --bg-app`） |
| 卡片/Headbar | 亮 `#FFFFFF`；暗 `#0F172A` |
| 主文字 | 亮 `#0F172A`；暗 `#F1F5F9` |
| 內文 | 亮 `#1E293B`；暗 `#E2E8F0` |
| 次要文字 | 亮 `#64748B`；暗 `#94A3B8` |
| 邊框 | 亮 `#E2E8F0`；暗 `#1E293B` |
| 主色 Indigo | 亮 `#4F46E5`；暗 `#818CF8`；soft 亮 `#EEF2FF`、暗 `rgba(99,102,241,.16)` |
| 中國語文 | `#F43F5E` |
| 中國歷史 · 歷史科 | `#F59E0B` |
| 英國語文 (English Language) | `#3B82F6` |
| 數學科 · 邏輯思維 | `#8B5CF6` |
| 小學常識科 · 跨學科 | `#22C55E` |
| 科學 · STEM · 創科教育 | `#06B6D4` |
| 公民與社會發展科 (CS) · 德育及公民教育 | `#14B8A6` |
| SEN 特殊教育 · 社交與情緒共融 | `#D946EF` |
| 校園導覽 · 圖書館 · 升學規劃 | `#64748B` |

學科分類的單一來源是 `utils/subjects.ts`（`SUBJECT_OPTIONS`），工作坊「知識與教學設定」與
客制化申請頁都由此派生。

- 顏色**只准 6 位 flat hex**：chip 用 `` `${color}1A` `` 加 alpha 做底色，**漸變色會失效**
- 舊分類（語文（中文）／英文／數學／科學／科技/編程／常識/人文／藝術/其他，以及
  `chinese`／`english` 等英文 value）由同檔的 `LEGACY_SUBJECT_COLORS` 映射到新調色盤，
  查不到才落 `#94A3B8` 灰
- 顏色一律由 `bot.subject` **label** 派生，**不讀 `bot.subjectColor` 欄**（舊資料存的是 Tailwind 色名）

## 字體、圓角與陰影

- 字體：`"Noto Sans TC", Nunito, sans-serif`；display 字體 `Nunito, "Noto Sans TC", sans-serif`
- 圓角節奏：
  - 頁面容器／大卡 `rounded-[24px]`–`rounded-[32px]`、`rounded-3xl`
  - 一般卡片／按鈕 `rounded-xl`、`rounded-2xl`
  - 小標籤／輸入 `rounded-lg`
  - 頭像／浮球／膠囊 `rounded-full`
- 陰影：預設 `shadow-sm`；卡片 `shadow-card`（`--shadow-card`）；hover 加深 `--shadow-card-hover`；
  浮動導航 `--shadow-nav`
- 學生端主題一律使用 `globals.css` 的 CSS variables，並透過 `html.dark` 支援深色模式

## 動效

- Framer Motion：頁面／卡片進場常用 `opacity: 0, y: 20 → 1, 0`；hover 常用 `y: -4~-5`；
  點擊常用 `scale: 0.95`
- 列表 stagger：`transition.delay = index * 0.03~0.1`
- Bot 頭像：`bot-avatar-pulse` + `bot-avatar-breathe`，集中在 `globals.css`
- **數字（KPI／統計）一律用 `components/shared/AnimatedNumber` 滾到新值，唔好硬切**——硬切
  老師唔會察覺背景已經靜靜雞更新咗。過阻尼彈簧（約 0.4s 定下來、無 overshoot），
  `tabular-nums` 防止滾動途中數字闊度跳動。現時用喺智能評測總覽四張 KPI 卡
- **載入狀態：列表／卡片型（等 1–2 秒嗰種）一律用 `components/shared/Skeleton`，唔好淨出
  「正在載入…」一行字**——一行字冇形狀，老師睇唔出等緊嘅係一張卡定一個表，載入完仲會跳位。
  骨架形狀抄返即將出現嘅內容，配同一個 `min-h` 防跳位
  - **顏色同圓角由 caller 傳**（老師端 `bg-slate-200/70`，學生端
    `bg-[var(--bg-subtle-2)]`），Skeleton 本身唔 bake：Tailwind 兩個同層 bg utility 邊個贏
    係睇 stylesheet 次序、唔可靠
  - **Skeleton 純裝飾**（`aria-hidden`）：真嘅載入文字要留喺 `sr-only` span，讀屏先聽到狀態。
    文字重用現有 `uiText` key，唔使加新 key
  - 首次載入用 `isLoading && !items.length` 守住，refetch 已有資料時唔好閃 skeleton
  - **唔適用**：AI 生成／上傳等長流程（保留 spinner 加進度文案）、按鈕微狀態（上傳中／
    提交中）、全屏聊天頁——用戶已經預期等，灰塊反而似壞咗
  - reduced-motion 下自動靜止：`animate-pulse` 已喺下面嘅 `@media` 區塊停咗，灰塊唔郁但
    仍然讀得出「未載入」，零新 keyframe
  - **尚未覆蓋**（下次做）：`AbilityTrackingReport`／`StudentLearningReportCard` 嘅能力追蹤
    圖表位、`AnomalyAlerts*`、`TopicManager`、`ConversationHistoryDrawer`、`TokenDetailModal`、
    `SchoolAvatarRequestsAdmin`
- **可撳元素一定要有 hover 回饋**：`button`／`a`／`role="button"` 冇 hover 態嘅要補返，
  連 `transition` 一齊加
  - 跟**就近慣例**揀色：同一個卡片／列表入面通常已經有個有 hover 嘅 sibling，抄佢，
    唔好自創色
  - 顏色／邊框／陰影用 CSS `hover:`（`hover:bg-slate-50`、`hover:border-indigo-200`）；
    **transform 才用 framer `whileHover`**——兩套唔好撈，CSS hover 先跟到
    `prefers-reduced-motion` 嘅統一語義
  - ⚠️ **同底色一樣嘅 hover 等於冇**（例如 `bg-[var(--accent)]` 配
    `hover:bg-[var(--accent)]`）：呢類實色掣改用 `hover:brightness-110`
  - 已選中／已啟用嘅分支唔使加 hover，顏色本身已經分辨到
- 2026-09-25 決定**唔加**「微彈（放大一下）／晃動」一類嘅一下脈衝：實測 ±3px 冇人睇得到，
  推到 ±8px 又同儀表板嘅警示色語言打對台（晃動＝出錯）。要加之前先問用戶
- 尊重 `prefers-reduced-motion: reduce`；新動效需評估是否跟隨關閉
  - **機制（2026-09-25 落地）**：`index.tsx` 用 `<MotionConfig reducedMotion="user">` 包住整個 SPA，
    一次覆蓋全部 framer-motion 嘅 transform／layout 動效，唔使逐個元件讀 `useReducedMotion`。
    opacity 照郁（framer-motion 原設計）。**但由動效逐格寫入嘅值唔屬 transform
    （例如數字滾動），MotionConfig 管唔到**——該類元件要自己讀 hook 判斷
  - ⚠️ **陷阱**：`MotionConfig` 喺 element **建構時**快照 media query
    （`node_modules/framer-motion/dist/framer-motion.dev.js:6041-6046`）。建構之後才改 OS 設定，
    已 mount 嘅元件完全唔受影響。驗證時一定要**先 emulate 再 reload**，否則會誤判成「機制失效」
  - CSS keyframe 由 `globals.css` 底部嘅 `@media (prefers-reduced-motion: reduce)` 區塊負責：
    `bot-avatar-pulse`／`bot-avatar-breathe`／`animate-pulse`／`animate-bounce` 一律停。
    **`animate-spin` 特登唔停**——剩低 32 處載入指示全靠佢一個講「仲喺度等」。
    改用 Skeleton 嘅列表位係例外：佢哋有 `sr-only` 文字替代，唔靠動畫講狀態
  - 該區塊用 `html` 前綴係為咗特異度：Play CDN 喺 runtime 注入 `<style>`，位置喺 `globals.css`
    之後，同特異度嘅規則會被佢蓋過（包 `@layer` 嘅更加一定輸）
- 避免大型 DOM 無過渡直接切換；需要時使用 Framer Motion `AnimatePresence`

## 橫向捲動列（分頁列、chip 列、pill 列）

**只寫 `overflow-x-auto` 嘅話，`overflow-y` 一樣會計成 `auto`，嗰行就同時係垂直 scroll
container。** 2026-09-25 用戶報「學習報告分頁位置有得上下滑嘅 ▲▼」。行高係零餘裕
（分頁列 38px＝按鈕自身高度；學習報告 52px＝pill 36px＋`mb-4`），所以任何 1px 壓縮、
sub-pixel 捨入或者橫向 scrollbar 佔走高度，就會出垂直 scrollbar；Windows 經典 scrollbar
畫成一小對 ▲▼。

- 橫向捲動嘅列一律寫 **`overflow-x-auto overflow-y-hidden`**；喺 flex column 裏面就加
  `shrink-0`（唔係會被壓扁，量過 5–8px）。已經改嘅：`LearningReportPage` 分頁列、
  `AssessmentPage` 頂層 tabs、`SettingsPage` 分頁列
- **唔可以靠截圖驗**：headless／Playwright 用 overlay scrollbar
  （`offsetWidth - clientWidth === 0`），▲▼ 永遠唔會出現喺截圖。要結構化驗：掃
  `document.querySelectorAll('*')` 揀 computed `overflow-y ∈ {auto, scroll}` 再比
  `scrollHeight - clientHeight`
- 改完檔（特別係 `git checkout` 之後）要 reload 先量，Vite HMR 可能停留在舊 DOM

## 可展開列（Accordion）與可撳範圍

**「睇落可以撳」嘅嘢一定要真係可以撳。** 2026-09-24 學生管理嘅班級卡就係踩咗：
展開箭嘴 `<ChevronDown/Right>` 擺喺 toggle `<button>` **外面**做同層裝飾 `<svg>`，
結果撳班名開得到、撳箭嘴收唔返——箭嘴根本冇 handler。

- **整行（含箭嘴）係同一個可撳範圍**。箭嘴要喺 `<button>` / `<motion.button>` **入面**，
  用 `ml-auto shrink-0` 推去右邊；唔好另開 sibling
- 行內仲有互動元素（刪除、剔選）→ 佢自己一個獨立 `<button>`，**唔可以 nest 喺 toggle button 入面**
  （HTML 唔容許 button 疊 button）
- toggle 要寫 `aria-expanded`；純裝飾 icon 加 `aria-hidden="true"`
- 現有兩種寫法：`<motion.button>`（例：`components/assessment/AssessmentQualityList.tsx`）
  同 `<div onClick>` + `cursor-pointer`（例：`components/assessment/AnomalyAlertsOverview.tsx`）。
  **新代碼優先 `<button>`**——`<div onClick>` 冇鍵盤支援
- 呢類錯**測試捉唔到**（撳落去唔會 throw、唔會 render 錯），lint 亦冇規則管得到。
  驗證方法係真撳一次，而且**唔可以用 locator click**：`locator.click()` 會自動揀可撳嘅祖先、
  自動 scroll，啱啱好遮蓋「撳唔到」嘅真相。要 `document.elementFromPoint(x, y)` 睇 click 實際落喺邊個 element

## 頁面標題只出一次

**頁名由 topbar（`App.tsx` 嘅 `PAGE_TITLES` → `components/layout/Header.tsx`）負責，
內頁唔可以再出一次同名 `<h1>`。** 2026-09-25 用戶報：由側邊欄入智能評測／學習報告／
學生管理，topbar 已經寫住頁名，內頁頂再出同一個大字。

- 側邊欄入得去、又喺 shell 入面 render 嘅頁（dashboard／workshop／assessment／learning／
  students）唔應該有同頁名一樣嘅 `<h1>`；**保留一句用途說明冇問題**
  （例：「管理學生帳戶與班級。」），佢講「呢頁做乜」，唔係重複個名
- 例外（自帶標題係正確嘅，唔好順手刪）：
  - 唔經 shell 嘅獨立頁：`SettingsPage`／`AccountPage`／`ProPlanPage`／`HelpCenterPage`／
    `SchoolAvatarRequestPage`／學生端各頁——冇 topbar，頁內標題係唯一頁名
  - 子檢視標題（唔等於頁名）：`GradingWorkspaceHome`「智能批改工作台」、
    `AssessmentLibrary`「歷史題庫」
  - 「申請管理」內頁寫「學校客製化申請」：字眼唔同，保留
- 加新頁時：`PAGE_TITLES` 有咗個名，內頁就唔好再寫一次

## 會增長嘅列表一律封頂

**任何隨學生數／時間增長嘅列表都要封頂，底部出一個展開掣。** 2026-09-25 用戶要求：
mock 有 235 個未分組學生，成頁拉唔完。

- 用共用元件 `components/shared/ShowMoreList.tsx`（`limit` 預設 10，就地
  「看更多（還有 N 個）／收起」，唔開下拉選單、唔跳頁）
- 唔好自己寫 `slice` ＋ 自訂掣——同一個行為只可以有一個實作。舊寫法（`我的學生`
  preview 5 ＋彈窗）唔再跟，新列表一律用 `ShowMoreList`
- **唔需要封頂**：固定高度嘅圖表（例如學習狀態分佈矩陣）、本身已經喺可滾動
  modal／drawer 入面嘅表（容器已經封咗頂）
- 展開掣要喺列表**最下方**、喺同一個卡片入面；撳完要真嘅撳一次驗（見上節
  「可展開列」——`locator.click()` 睇唔到撳唔到嘅情況）

## 相關文件

- [架構總覽](architecture.md)
