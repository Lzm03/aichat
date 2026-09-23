# aichat

ChopReality 的主前端與 API 服務：一套 Vite + React 19 單頁應用，配 Express + PostgreSQL 後端。
教師可以建立 AI Bot、設計評估、追蹤學生學習；學生端有對話、任務與成就。

介面語言以繁體中文（香港用語）為主，教師端另支援英文。

## 快速開始

不需要資料庫，用預覽 mock 最快看到畫面：

```bash
cd ../aichat-preview-mock && node mock-server.mjs   # 假後端（repo 外，port 4000）
npm install && npm run dev                          # 前端 http://localhost:3000
```

登入：任意 email 是學生，email 含 `teacher` 是教師。

要接真後端、或想知道 mock 同真後端點分辨，見[本地開發](docs/local-development.md)。

## 文件

| 文件 | 內容 |
| --- | --- |
| [文件索引](docs/README.md) | 全部文件的入口 |
| [架構總覽](docs/architecture.md) | 專案組成、資料流、目錄地圖、測試 |
| [設計系統](docs/design-system.md) | 色彩、字體、圓角、陰影、動效 |
| [本地開發](docs/local-development.md) | 環境設定、常用指令、技術棧 |
