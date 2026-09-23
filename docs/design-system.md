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

## 相關文件

- [架構總覽](architecture.md)
