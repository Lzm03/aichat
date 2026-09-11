# Bot Persona 設定指南：三層映射 + 分界原則

角色設定由**三個層**流動：網頁「客制化申請」欄位 → 儲存層（`bots.knowledge_base` 四節）→ 組裝層（`utils/chat-prompt.ts` 砌出嘅 system prompt）。呢份文件就係三層嘅 canonical 映射，任何一層加嘢都要跟返呢張表。

## 一、三層映射表

| 客制化申請欄位（SchoolAvatarRequestPage） | 儲存層（knowledgeBase 節） | 組裝層（system prompt 章節） |
|---|---|---|
| 數字人名稱／角色主題 | `bots.name` +【人物背景設定】 | `# Role & Persona` 嘅 Name |
| 角色背景資料（身份／背景故事／性格）＋補充需求（語氣要求） | 【人物背景設定】＋【角色對話策略】 | `# Background & Traits` ＋ `# Character's Dialogue Strategy` |
| 教學文檔／單元教材（上傳檔案或文字） | LLM 抽取 →【人物知識庫摘要】＋【知識點分級】（tier：`basic_fact` 基礎事實／`deep_understanding` 深度理解，每層 ≤4） | `# Character Knowledge Base` ＋ `# Input Context` 嘅 Target_Knowledge_Points |
| 應用學科 | `bots.subject` | 分類顯示用，唔入 prompt |
| 預計使用班級／學生人數／使用時段 | 服務情境 meta（唔入 prompt，或寫入背景） | — |
| 角色視覺風格 | 視覺製作團隊用，同 prompt 無關 | — |
| （設定書可選節）唔知道邏輯 | 【不知道邏輯】optional | `# Linguistic Constraints` 嘅 Unknown Boundary Logic——**寫咗覆蓋預設，冇寫用預設** |
| （設定書可選節）收尾儀式 | 【收尾儀式】optional | Closing Ritual——同上 |

知識庫四節固定格式（`buildStoredKnowledgeBase` 組裝）：

```
【人物背景設定】
【人物知識庫摘要】
【知識點分級】  ← JSON 陣列：[{id, tier: "basic_fact"|"deep_understanding", title, content, keywords[]}]
【角色對話策略】  ← 成節原封注入 prompt；內含【性格特質】【說話風格】【答題策略】三個標籤＋自由硬規則文本
```

## 二、分界原則：安全網 vs 角色特色

**安全網規則（骨架層，老師唔可以覆寫）**——全部喺 `CHAT_STYLE_RULES`：
自介只准第一輪一次／一個回覆一條消息／訊息先行（問前必俾資訊）／一輪最多一條問題／先肯定觀察再精準校正／topic lock／稱呼唔假設性別／每 3-5 輪小結／相近概念唔混埋／Advance 唔准重複已覆蓋知識點。

**角色特色規則（老師可寫，但必須同安全網相容）**：句長節奏／動手觀察指令／三步結構／禁忌詞／觸發器／唔知道邏輯／收尾儀式——經【角色對話策略】同 optional 節入 prompt。

衝突時**安全網贏**（system prompt 已寫：「如果本節同下方 # Interaction Rules 有衝突，一律以 # Interaction Rules 為準」）。

## 三、設定書模板（跟客制化申請欄位對齊）

老師填客制化申請時，背景資料欄建議照以下結構寫（RUBAN.docx 係一份完整範例）：

1. **我是誰**：一句身份＋一句核心信念（例：我係魯班，木工出身，百工之祖。天底下冇解決唔到嘅問題，只有你未試過嘅角度。）
2. **背景故事**：2-4 句關鍵經歷，要具體（例：十五歲造第一張枱俾師傅一斧劈開，教我聽木頭講嘢。）
3. **說話方式**：句長／節奏／每次必備元素（例：一句唔超過 20 字；每次回應必須有動手指令。）
4. **禁忌與偏好**：禁咩詞、多用咩詞。
5. **觸發器**：學生質疑／稱讚／挫敗／搞笑時點應對。

確認草案之後，`buildBotProposal`（`utils/bot-proposal.ts`）會將申請表欄位砌成以下格式，**console 上面嘅節名就係儲存層節名**，可以原封存入 `bots.knowledge_base`：

| 申請表欄位 | 草案輸出節 |
|---|---|
| 角色背景資料 | 【人物背景設定】 |
| 教材檔案／文字 | 【人物知識庫摘要】——列出已收到嘅教材，實際內容待抽取 |
| （未收集） | 【知識點分級】——待抽取，每層最多 4 個 |
| 補充需求 | 【角色對話策略】（自由硬規則；上方三個標籤待填） |
| （未收集） | 【不知道邏輯】、【收尾儀式】——留空即用 `DEFAULT_*` |
| 班級／人數／時段／學科／視覺風格 | 【製作備註】——**唔會進入 prompt** |

### ⚠️ 改格式時嘅陷阱

`matchSection` 配對嘅係**第一個**出現嘅節名。所以草案嘅開場白、【製作備註】、以及任何正文，**都唔可以出現「【節名】」字樣**（要提及就寫「不知道邏輯」唔好加括號）。加咗會令真正嘅節被前面嗰個提及蓋過，而且唔會報錯。

`server/tests/bot-proposal.test.ts` 就係鎖住呢個契約，改草案格式必跑 `npm run test:proposal`（喺 `server/`）。

## 四、對話狀態追蹤（conversationState）

後台 `bot_conversation_states` 表實錄每段對話嘅知識點覆蓋：每輪回覆後按知識點 keyword 匹配計 `covered_point_ids`、計出 `next_point_id`（第一個未覆蓋）、`turns_since_summary` 計數。下一輪組裝 prompt 時注入 `# Input Context`：

```
2. Covered_Points（嚴禁重複提問或重複教）
3. Next_Point（推進問題必須圍繞佢）
4. 小結提醒（turnsSinceSummary ≥ 4 觸發）
```

三步曲對應：Evaluate＝CHAT_STYLE_RULES 12/13；Inform＝規則 6；Advance＝規則 20（由 Covered/Next 狀態驅動）。

### 草案而家點傳去製作團隊

1. 老師喺客制化申請確認草案 → `proposal_text` 欄位（`school_avatar_request_roles`）獨立儲存，**唔再夾埋喺 `notes` 入面**。
2. 管理端「數位分身申請」詳情頁會獨立顯示「角色設定書（可直接存入 Bot）」，附一鍵複製。
3. 製作團隊複製 → 跑教材抽取填【人物知識庫摘要】同【知識點分級】→ 存入 `bots.knowledge_base`。

`notes` 而家只裝申請備註（班級／人數／時段）；角色背景同補充需求已經喺設定書入面，唔會重複。

## 五、待辦

- CreationStep2 嘅 LLM 抽取 prompt 照本文件嘅四節格式輸出（含 optional 節）；workshop 表單需要加「不知道邏輯」「收尾儀式」兩個輸入框，先可以經 UI 收集。
- 客制化申請表單本身都未有「性格特質／說話風格／答題策略」三個欄位——而家草案只會輸出空標籤，等老師或製作團隊手填。
- 儲存層未有 migration 機制：`bots` 表唔喺 repo 任何 code 或 migration 入面建立過，新環境起唔到乾淨 DB。需要獨立一條線處理。
