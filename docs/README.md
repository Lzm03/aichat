# 文件索引

這個目錄放**產品與工程文件**：規格、判定規則、UX 決策、架構說明。
讀者是需要理解或修改這個專案的人（包括將來接手的同事）。

## 全部文件

| 文件 | 幾時要睇 |
| --- | --- |
| [architecture.md](architecture.md) | 想知專案點組成、資料流、邊個目錄放乜、測試喺邊 |
| [design-system.md](design-system.md) | 要寫／改 UI，想知道色彩、字體、圓角、陰影、動效的 token |
| [bot-persona-guide.md](bot-persona-guide.md) | 要改 Bot 角色設定、知識點關鍵詞規則、對話狀態追蹤 |
| [bot-conversation-testing.md](bot-conversation-testing.md) | 要改對話評測／回歸測試（Semantic Judge、場景 S1–S12） |
| [anomaly-detection-spec.md](anomaly-detection-spec.md) | 要改異常偵測規則、加新規則（含 FP 風險與合規依據） |
| [knowledge-map-topic-versions.md](knowledge-map-topic-versions.md) | 要改知識地圖多主題版本（Tab 架構）的 UX／UI |

## 寫文件的規矩

1. **一個功能一份文件**，不要把所有討論塞進一份超大型文件
2. **漸進式披露**：主文件只放概要與目錄，細節連結到子文件。
   判準：一份文件超過約 200 行、或同時服務兩種不同讀者／兩種演進節奏，就拆
3. **內容只有一個住處**。同一件事寫兩份，早晚會漂移；要重複就寫連結
4. **只記「為何」同「規則」**，不要記一條命令就查得到的清單（例如逐個檔名）。
   會自動腐爛的內容，就不要寫進文件
5. 語言用繁體中文（香港用語）；程式碼、指令、識別碼保持原文
6. **不要在文件中連結 repo 外的本機檔案**（同事 clone 落嚟會是死連結）
7. 改了功能就同步改相關文件。文件與程式碼不一致時，**以程式碼為準**，然後把文件改返啱
