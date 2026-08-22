# 後端對接事項（Doris → Jayden）

> 本檔記錄前端（Doris）已完成/設計中的內容，需要後端（Jayden）配合的接口、資料結構與判定規則。
> 更新方式：完成一項在「狀態」標 ✅ 並記錄日期；新增事項附「日期 + 相關前端頁面」。

---

## 一、勳章判定規則（2026-08-23 新增，學生「我的成就」頁）

**12 個勳章**，前端頁面 `/achievements`（pages/StudentAchievementsPage.tsx）。
**計算建議**：批次計分——每日 cron 掃描資料表、達成即寫入勳章記錄，不即時監聽；時區一律 HKT（參考 Duolingo 的 streak/成就批次結算模式）。

| # | 勳章 | 判定規則（對應現有資料表） | 依賴 |
|---|---|---|---|
| 1 | 初次啟航 🚀 | `conversation_messages` 出現第一筆 role='user' 訊息 | 無 |
| 2 | 連勝新手 🔥 | 連續 7 天（HKT 日界）每天 ≥1 筆 user 訊息 | 無 |
| 3 | 早起之鳥 🌅 | 任一 user 訊息 HKT 時間 00:00–06:00 | 無 |
| 4 | 書蟲 📚 | 語文（閱讀理解）測驗 ≥90 分；無作答記錄時暫以「語文 bot 對話訊息 ≥30 則」代替 | ⚠️ 測驗作答表 |
| 5 | 數學大師 🔢 | 數學 bot 的 `character_topics` 全數出現在該生 DISTINCT topic_id（覆蓋 100%） | 無 |
| 6 | 文字魔法師 ✍️ | 與寫作/語文類 bot 的對話數（`conversations`）≥10 | 無 |
| 7 | 好奇寶寶 🤔 | user 訊息總數 ≥100 | 無 |
| 8 | 語法大師 📝 | 英文文法測驗**連續 5 次**滿分 | ⚠️ 測驗作答表 |
| 9 | 知識探險家 🔍 | 與 ≥4 個不同學科的 bot 各有 ≥1 筆對話（學科依 bot 分類） | 無 |
| 10 | 閃電俠 ⚡ | 同一天（HKT）內 5 筆 user 訊息首尾時間差 ≤10 分鐘 | 無 |
| 11 | 完美主義者 💎 | 連續 5 次測驗全對 | ⚠️ 測驗作答表 |
| 12 | 全能學者 🎓 | 各學科 topic 覆蓋率均 ≥80% | 無 |

### 前端期望的接口形狀（供參考，可討論）

```
GET /api/student/achievements
→ { badges: [{ id, name, icon, description, unlocked, unlockedAt? }], stats: {...} }
```

---

## 二、接口需求（前端 UI 已做，待後端）

| # | 事項 | 相關前端 | 狀態 |
|---|---|---|---|
| 1 | **學生統計接口**（成就頁統計卡 4 張：已對話機器人、已聊知識點、今日互動、累計訊息）— 前端已決定不用「學習時長」估算與 duration 欄位 | `/achievements` | 待實作 |
| 2 | 勳章資料接口（見上「接口形狀」；mock 先行） | `/achievements` | 待實作 |
| 3 | 學生雷達圖六維能力分數接口（暫用 mock Bloom 六維） | `/achievements` | 待討論 |
| 4 | 測驗作答記錄（`hasPendingQuiz` 已有；作答歷史/分數儲存位置待確認——4 條勳章依賴） | 學生首頁/勳章 | 待確認 |
| 5 | 「今日任務」數據（底部導覽頁待做，明天 Doris 與討論內容後再定接口） | 學生首頁導覽 | 待討論 |
| 6 | 學生通知系統（通知鈴已暫時移除；發布機制待討論後加回） | 學生 headbar | 待討論 |
| 7 | 郵箱 OTP 驗證碼（已決定先用密碼確認式改郵箱；OTP 為後續選項） | 帳戶中心安全設定 | 已決定不做（暫） |

---

## 三、資料結構需求

| # | 事項 | 現況 | 建議 |
|---|---|---|---|
| 1 | **知識點基礎/高級分層**：教師端可拆分基礎/高級知識點，學生統計「已聊知識點」需要分層統計 | `character_topics` 無 level 欄位（僅 name/sort_order/is_default） | 加 `level TEXT`（如 'basic'/'advanced'） |
| 2 | 試用帳戶 3 個月過期（到期日寫進資料結構） | 無 | 加 `trial_expires_at`（Mandy 決定 5） |
| 3 | 帳戶功能開關（不做方案分級；trial/school + 功能 on/off） | `account-overrides.ts` 環境變數白名單 | 搬資料庫（Mandy 決定 3/4） |

---

## 四、待確認事項（Doris 需要 Jayden 答案）

1. 簽約學校的老師/學生帳戶數量？（報告 8/22 待確認）
2. 學生對話額度：按學生各自算還是按學校總量算？——未確認前按「學生各自算」實作
3. 測驗作答記錄存在哪張表/是否需新建？
4. 上傳檔案（server/uploads 1200+ 檔）何時移出 repo 到物件儲存？

---

## 五、報告承接事項（8/22 檢查報告，提醒 Jayden 已在處理）

- [ ] 健康檢查放寬：連續 2 次失敗 → 4–5 次或改右上角細條提示（P0）
- [ ] 學校方案額度分開設定（免費版額度第一堂課就撞牆，P0）
- [ ] 權限判斷：email 白名單 → 角色（server/config/account-overrides.ts）
- [ ] 孤立頁面刪除：MessagesPage.tsx / TaskCenter.tsx / Classes.tsx（確認全 repo 引用後）
- [ ] `app/portal/student/*` 整套刪除（Mandy 決定 1；學生活界面已改走 Vite StudentHome）
- [ ] 上傳檔案移出版本庫 + .gitignore + 物件儲存
- [ ] StudentHome.tsx：8/26 前接完數據（hasPendingQuiz 等）後交 Doris 改文案
- [ ] SettingsPage.tsx：8/27 加帳戶區欄位（Doris 不碰）

---

## 協作規則提醒（8/22 報告）

- 一個檔案同一天只有一個人動；StudentHome.tsx 排開：Jayden 8/26 前合併、之後 Doris 動
- 各開 branch 每晚合一次；8/28 驗收日不修衝突
