# 本地開發

## 技術棧

- **前端**：React 19.2 + TypeScript 5.8 + Vite 6 + Tailwind CSS 3 + Framer Motion 11
  + lucide-react + Recharts
- **後端**：Express 5 + TypeScript + tsx + PostgreSQL（`pg`）；圖片／影片處理與上傳用
  multer、express-fileupload
- **AI／多媒體**：Gemini（server-side）、DeepSeek、xAI、影片背景移除服務；
  **所有 key 只放 `server/.env`**
- **測試**：`node --test`（前端）與 `node --import tsx --test`（後端）。逐套都有 `test:<名>`
  script，見 `package.json` / `server/package.json`
- k6 load test 已於 2026-09-15 移除（腳本本來就不在 repo）

## 鐵則

- **API key 不得進前端 bundle 或 repo**
- `vite.config.ts` 的 `GEMINI_API_KEY` define 是既有安全債，**不得擴大使用**，理想方向是移除

## Mock 預覽模式

不需要 PostgreSQL，最快看到畫面的方式。

1. 啟動 mock backend（在 repo 外）：

   ```bash
   cd ../aichat-preview-mock
   node mock-server.mjs
   ```

2. 啟動前端：

   ```bash
   npm run dev
   ```

3. 開 `http://localhost:3000`

Mock 登入規則：

- 任意 email → 學生
- email 含 `teacher` → 教師

Mock 的 API 清單同真後端**不齊全**——mock 沒有的 route 會回錯誤。要試的功能如果 mock 未支援，
就只有行真後端，或者先補 mock（改 `../aichat-preview-mock/mock-server.mjs`，不要改主專案）。

## 真後端模式

```bash
cd server
npm install
npm run dev
```

需要 PostgreSQL 與 `server/.env` 內其他環境變數。

真後端 port 由 `server/.env` 的 `PORT` 決定（`server/index.ts` 的預設是 4000，與 mock 相同，
所以本機通常把它改成別的埠避開，`BACKEND_URL` 要跟著改）。

### ⚠️ 兩個後端都可能同時在跑

打錯會誤以為測試通過。分辨方法：

```bash
curl localhost:<port>/api/health
```

回傳的 `version` 是 `"dev"` 就是真後端，`"preview-mock"` 就是 mock。

### 讓 SPA 直接打真後端

不用改 `vite.config.ts`：

```bash
VITE_API_URL=http://localhost:4100 npm run dev   # port 換成 server/.env 的值
```

`utils/api.ts` 見到 `VITE_API_URL` 就用它並繞過 proxy；後端 CORS 已放行任何
`http://localhost:*` 來源。

## 常用指令

前端：

- `npm run dev` — Vite dev server（3000）
- `npm run build` — production build
- `npm run preview` — 預覽 production build
- `npm run lint` — TypeScript `tsc --noEmit`
- `npm run test:i18n` — 文案測試（只掃**字面量**，`uiText(option.label)` 這類由陣列驅動的
  呼叫掃不到，漏翻譯也會綠燈）
- `npm run test:ids` — 知識點 ID 測試

後端（先 `cd server`）：

- `npm run dev` — 真後端（port 見 `server/.env`）
- `npm run migrate:topics` — 主題資料 migration
- `npm run test:topics` — 主題 API integration test（需要 DB）
- `npm run test:topic-switch` — 對話轉題 integration test（需要 DB）
- `npm run test:proposal` — 角色設定書 proposal 產生測試
- `npm run test:conversation-state` — 對話狀態追蹤純函數測試（不需要 DB）
- `npm run test:kb-sync` — 知識庫同步守護測試
- `npm run test:golden` — golden 對話場景 + answer judge + 教學模擬
- `npm run test:gemini` — Gemini 多模態測試

完整清單以 `server/package.json` 為準。**加了測試檔就要加對應 script**——冇 script 的測試
冇人跑，會靜靜雞腐爛。

## 相關文件

- [架構總覽](architecture.md)
- [設計系統](design-system.md)
