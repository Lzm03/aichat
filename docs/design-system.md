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
- 尊重 `prefers-reduced-motion: reduce`；新動效需評估是否跟隨關閉
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

## 相關文件

- [架構總覽](architecture.md)
