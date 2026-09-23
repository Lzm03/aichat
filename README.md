# aichat

ChopReality 的主前端與 API 服務：一套 Vite + React 19 單頁應用，配 Express + PostgreSQL 後端。
教師可以建立 AI Bot、設計評估、追蹤學生學習；學生端有對話、任務與成就。

介面語言以繁體中文（香港用語）為主，教師端另支援英文。

## 快速開始

```bash
npm install
npm run dev     # http://localhost:3000
```

前端要接一個 API 後端才有資料；後端在 `server/`（Express + PostgreSQL）。

## 文件

| 文件 | 內容 |
| --- | --- |
| [文件索引](docs/README.md) | 全部文件的入口 |
| [架構總覽](docs/architecture.md) | 專案組成、資料流、目錄地圖、測試 |
| [設計系統](docs/design-system.md) | 色彩、字體、圓角、陰影、動效 |
