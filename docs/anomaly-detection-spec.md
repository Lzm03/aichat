# 異常偵測規則規格（Anomaly Detection Rules Spec）

版本：v1（2026-09-10 初版）｜適用：`server/api/quizzes.ts` 嘅 `ANOMALY_RULES`／`detectAttemptAnomalies` 與前端警示中心

## 目的

定義學生測驗作答觸發「AI 異常警示」嘅偵測規則：型別、關鍵字、判斷依據、假陽性風險同官方依據，作為規則擴充、調整同合規嘅單一來源（single source of truth）。**警示一律只供教師覆核，唔可作自動化紀律處分**（見「合規依據」）。

## 偵測原則

1. **逐題獨立偵測**：每條題目嘅作答單獨跑規則，唔會因其他題目嘅文字誤報（一條題可同時命中多個不同型別，各自成一條 flag）。
2. **每條規則只記首個 match**，摘錄（excerpt）上限 40 字。
3. **ruleId 係持久化資料，永不改名**：已寫入 `quiz_attempts.anomaly_flags_json` 嘅 `reason` 欄位。關鍵字微調（語義不變）沿用同一 ID；語義變更先開新 ID，舊 ID 保留喺前端 `REASON_LABELS`。
4. **優先序**（UI 分組同處理順序）：wellbeing → inappropriate → academic → privacy → effort；身心安全置頂。
5. **status 生命週期**：`open` → `resolved`（標記已處理）／`dismissed`（確認無礙），單向不可逆；統計只數 `open`。

## 規則總表

FP 風險：極低＝正規作答幾乎唔會出現；低＝少見；中＝需情境判斷；高＝常見正常用法，須謹慎。

### 1. 身心安全 `wellbeing` — ruleId `wellbeing-distress-terms`

| 關鍵字 | FP | 採用 |
|---|---|---|
| 活著好像沒什麼意義／不想活／自殺／死後 | —（v1 前既有） | ✅ |
| 唔使醒／不用再醒／唔想醒（「瞓咗唔使醒」類） | 低 | ✅ |
| 人生冇意義／人生沒有意義／生存冇意義 | 低-中 | ✅ |
| 都係因我而起／都是因我而起／我唔喺度會好啲／我不在會更好 | 低-中 | ✅ |
| 如果我死咗（假設句） | 中 | ❌（作文假設句易誤報） |
| 冇人理我／冇人掛住我 | 中 | ❌（青春期口頭禪，弱信號） |

判斷依據：作答中出現與情緒困擾相關的詞語。

來源：[教育局「校園．好精神」《及早識別和支援有自殺風險的學生》](https://mentalhealth.edb.gov.hk/tc/support-at-the-indicated-level/supporting-students-with-suicidal-risk.html)（明言教師可透過**周記或功課內的信息**識別風險——掃描學生文字嘅官方先例）、[香港撒瑪利亞防止自殺會「自殺的徵兆」](https://sbhk.org.hk/?page_id=34091)。

### 2. 不當言論 `inappropriate` — ruleId `inappropriate-offensive-terms`

| 關鍵字 | FP | 採用 |
|---|---|---|
| 腦袋有洞／白痴／垃圾／蠢 | —（v1 前既有；「垃圾」會命中環保題、「蠢」會命中寓言） | ✅ |
| 阿差／黑鬼（種族貶稱） | 低 | ✅ |
| 死肥／樣衰（譏笑身材樣貌） | 低-中 | ✅ |
| 收皮／食屎（辱罵） | 中 | ✅ |
| 低能／弱智（能力貶損） | 中-高 | ❌（關愛專題作文正面使用） |
| 排擠／冇人同佢玩（社交排擠） | 中-高 | ❌（欺凌議題作文常見） |

判斷依據：作答中出現攻擊性或不適宜詞彙。

來源：[教育局《學校行政手冊》§3.7.6 欺凌定義](https://www.edb.gov.hk/attachment/tc/sch-admin/regulations/sch-admin-guide/sag_c.pdf)（言語欺凌：惡意中傷、言語侮辱、譏笑身材樣貌；排擠孤立）、[平機會《種族歧視條例》第602章](https://www.eoc.org.hk/zh-hk/discrimination-laws/race-discrimination)（中傷＝煽動仇恨、嚴重鄙視或強烈嘲諷）。

### 3. 非原創/AI `academic` — ruleId `academic-ai-generated`（不分大小寫）

| 關鍵字 | FP | 採用 |
|---|---|---|
| in conclusion／chatgpt／gemini／ai generated | —（v1 前既有） | ✅ |
| 作為人工智能（助手／語言模型）／作為 AI（助手／語言模型） | 極低（AI 自曝句式） | ✅ |
| 訓練數據／知識截至／知識截止／知識庫 | 低（LLM 自述用語） | ✅ |
| deepseek／豆包／copilot／文心一言／通義千問（工具名） | 低 | ✅ |
| 上網抄／抄返嚟／copy返嚟（自認抄襲） | 低-中 | ✅ |
| 總括而言／綜上所述／由此可見（文體特徵） | 中-高 | ❌（議論文正常結尾，只宜弱信號） |

判斷依據：作答中出現疑似 AI 生成語句特徵。

來源：[考評局校本評核 AI 條款](https://www.hkeaa.edu.hk/tc/sba/faqs/faq_02.html)（學生參考 AI 生成內容必須註明出處，否則視為抄襲；「不可把 AI 軟件生成的作品當作自己的作品向教師遞交」）、[中大／港大學術誠信指引](https://www.cuhk.edu.hk/policy/academichonesty/)、[教育局 2025-06-04 立法會答覆](https://www.info.gov.hk/gia/general/202506/04/P2025060400285.htm)（AI 評核最終必須教師人工審核）。

### 4. 私隱洩漏 `privacy` — ruleId `privacy-personal-info`

| 關鍵字 | FP | 採用 |
|---|---|---|
| 住在／電話／地址／彌敦道／身份證 | —（v1 前既有；「住在」會命中「我的家」作文） | ✅ |
| hkid／id card／電郵格式（含 @） | 低 | ✅ |
| 住喺／家住／屋企住（口語覆蓋） | 中 | ✅ |
| 我讀 XX 中學／我就讀 | 中 | ❌（自我介紹／介紹母校常見） |
| 生日／出生日期 | 高 | ❌（記敘文常用，除非配年份數字組合） |

判斷依據：作答中出現疑似個人私隱資料。

來源：[《個人資料（私隱）條例》第486章 個人資料定義](https://www.pcpd.org.hk/tc_chi/)（姓名、身份證號碼、電話、地址、電郵等；單一資料不足亦可因**組合**而可識辨）、[私隱專員公署《AI：個人資料保障模範框架》](https://www.pcpd.org.hk/tc_chi/artificial_intelligence/)（目的限制、資料最少化、**人為監督**）、[PCPD 深偽學校錦囊（2025-12）](https://www.pcpd.org.hk/tc_chi/news_events/media_statements/press_20251217.html)（避免發布可識別個別學生的資料）。

### 5. 敷衍/偏題 `effort` — ruleId `effort-filler-terms`／`effort-blank-answer`

| 關鍵字 | FP | 採用 |
|---|---|---|
| asdf／不知道 不知道／亂寫／不想寫／有夠蠢 | —（v1 前既有） | ✅ |
| 求其寫／求其答／是但寫／是但答／亂噏／亂up | 低 | ✅ |
| sdkfj／akjsdh／fsdaf／zzzz（鍵盤亂碼） | 極低 | ✅ |
| 唔識做（真誠求助） | 中 | ✅（弱信號，建議與 wellbeing 交叉檢視） |
| 無話可說 | 中 | ✅（同上） |
| 好攰／冇時間（可能係真實情況） | 中-高 | ❌ |

`effort-blank-answer`：填充題答案 trim 後 ≤1 字（留空或過短）。

判斷依據：effort-filler-terms＝作答中出現無意義字元或敷衍內容。effort-blank-answer＝填充題留空或答案過短。

來源：**冇官方「偵測詞彙」來源**（香港冇規管作業態度嘅法例）。最接近：教育局《小學教育課程指引》「有效益的課業」＋[教育局通告第18/2015號《家課與測驗指引》](https://www.edb.gov.hk/)（重質不重量）。注意教育局自殺識別文件將「無心向學」列為**福祉訊號**——此類別定位係「需教師介入嘅弱信號」，唔係紀律處分依據。

## Flag 資料結構

```json
{
  "type": "wellbeing|academic|inappropriate|privacy|effort",
  "questionIndex": 2,
  "questionId": "q_x",
  "excerpt": "觸發句摘錄（≤40 字）",
  "reason": "<ruleId>",
  "status": "open|resolved|dismissed",
  "teacherComment": "",
  "resolvedAt": null
}
```

- 歷史資料（v1 前 flat `string[]`）經 `normalizeAnomalyFlags` 轉為 `{ type, questionIndex: null, reason: "legacy", status: "open" }`，UI 顯示為「整份作答」層級警示。
- 處理 API：`PATCH /api/quizzes/:id/attempts/:attemptId/anomalies/:flagIndex`（只可由 open 轉）。

## 合規依據（整體）

香港目前**冇**直接授權或禁止「學校用 AI 自動標記學生作答」嘅通函，以下官方文件係設計錨點：

1. 教育局自殺識別文件明言可檢視**周記或功課內的信息**——安全用途掃描學生文字有官方先例。
2. PCPD《AI：個人資料保障模範框架》（2024-06）：目的限制、資料最少化、透明度、**人為監督**——不得以純自動化決定損害學生。
3. 教育局「智啟學教」通函＋2025 立法會答覆：AI 評核**必須教師人工把關**。
4. 學校屬 PDPO「資料使用者」：標記結果只送達老師、只保留偵測所需資料、福祉類標記限老師知情。

**本系統對應設計**：AI 標記 → 教師在警示中心覆核（確認無礙／標記已處理）→ 教師決定後續，唔存在自動處分。

## 擴展 Checklist（加新規則必做）

1. `ANOMALY_RULES` 加條目（type＋新 ruleId＋regex）；關鍵字微調沿用舊 ruleId
2. 前端 `AnomalyAlertCenter.tsx` 嘅 `REASON_LABELS` 加判斷依據中文
3. `utils/uiEnglish.ts` 加英文（`npm run test:i18n` 強制）
4. 新**型別**先要：改 server 型別 union、前端 `TYPE_CONFIG`／優先序／`AnomalyAlertsOverview` legend、`utils/uiI18n` 文案、mock 同步
5. 更新本 spec 規則總表＋FP 風險＋來源
6. 無 DB migration（JSONB 唔使）；舊 flag 靠 `normalizeAnomalyFlags` 相容
