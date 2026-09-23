# Bot Conversation Testing — Multilingual Semantic Evaluation

## Scope

This instruction applies ONLY to the Bot's conversational behavior and
conversation-level testing/evaluation framework.

It does NOT require or imply a product-wide NLP architecture.

Do not expand this requirement into unrelated areas such as:

- global NLP
- site-wide language understanding
- search
- general text classification
- global language detection
- unrelated product features

The scope is specifically:

- Bot conversation generation
- Bot dialogue behavior
- Bot dialogue-state evaluation
- Bot conversation regression tests

The Bot currently supports three conversation languages:

1. Cantonese (粵語)
2. Mandarin Chinese (普通話)
3. English

# 1. Core Architecture Principle

The conversation test framework should evaluate what the Bot
**means and does in the current dialogue**, rather than relying primarily
on surface-level wording.

The primary hierarchy is:

```
Conversation Context → Semantic Intent / Dialogue Act → Dialogue State → Deterministic Validation
```

NOT:

```
Keywords → Regex → Guess semantic meaning
```

The key principle is:

> Semantic meaning comes first. Language-specific keywords and regexes are
> supporting signals, not the source of truth.

# 2. LLM Semantic Judge Is the Primary Semantic Evaluator

Use an LLM Semantic Judge for conversation-level judgments that require
understanding meaning, intent, or dialogue state.

The Semantic Judge should evaluate the Bot based on the actual conversation
context rather than evaluating the latest Bot message in isolation.

Where relevant, provide:

- recent conversation history
- previous Bot question
- latest student response
- latest Bot response
- expected dialogue state
- available choices
- expected topic
- expected progression
- relevant knowledge/context

The judge should determine semantic properties such as:

- Did the Bot understand the student's latest intent?
- Did the Bot answer/respond to what the student actually said?
- Did the Bot correctly interpret a student's answer?
- Did the Bot recognize an explicit choice?
- Did the Bot recognize that the previous question was answered?
- Did the Bot repeat the same conceptual question?
- Did the Bot advance after a correct answer?
- Did the Bot handle uncertainty appropriately?
- Did the Bot keep asking unnecessarily?
- Did the Bot respect disengagement?
- Did the Bot follow an explicit topic switch?
- Did the Bot introduce an unsupported premise?
- Is the Bot actually asking the student a question?
- What conversational action is the Bot performing?

These are semantic/dialogue-state problems.

# 3. Question Detection Must Be Semantic

For conversation testing, "the Bot asks a question" means:

> The Bot is requiring, requesting, or inviting the student to provide a
> response, such as an answer, choice, explanation, observation, opinion,
> comparison, prediction, or recall.

Do NOT define a question simply as:

- containing a question word
- containing "?"
- matching a regex
- matching a known Cantonese/Mandarin/English phrase

For example:

```
"我想知道點解古人會咁做。"
```

contains a question-related word, but it is not necessarily asking the
student anything.

Conversely:

```
"咁你又會點理解呢？"
```

is semantically asking the student to respond.

The same principle must work across:

- Cantonese
- Mandarin
- English

# 4. Punctuation Is a Supporting Signal, Not the Definition

Question marks may still be used for deterministic checks.

For example:

```
maxQuestions <= 1
```

is a valid mechanical constraint.

However:

```
question mark exists ≠ semantic question exists
```

And:

```
no question mark ≠ no semantic question exists
```

The system should distinguish between:

- semantic question
- statement
- rhetorical statement
- quoted question
- explanation containing question words
- question-like wording that does not request a student response

Therefore:

```
Semantic intent > heuristic signals > punctuation
```

Punctuation is useful for hard constraints, not for defining conversational
meaning.

# 5. Keep a Small Dictionary / Regex Layer as Heuristic Fallback

Existing language-specific dictionaries or regexes MAY be retained.

Do NOT remove them just for the sake of making the system "purely semantic".

However, their role must be explicitly limited.

The dictionary/regex layer is:

```
heuristic evidence / fallback
```

It is NOT:

```
semantic truth
```

For example, a small set of high-confidence question hints may remain:

```
Cantonese: "點解" "係咪"
Mandarin: "為什麼" "是不是"
English: "why" "is it"
```

But a match should produce something like:

```
hasQuestionHint = true
```

It should NOT directly produce:

```
asksQuestion = true
```

Similarly:

```
noQuestionHint = true
```

must NOT mean:

```
asksQuestion = false
```

The Semantic Judge remains the final semantic authority.

# 6. Do Not Let the Dictionary Grow Without Bound

The framework MUST NOT evolve into a large language-specific question
phrase dictionary.

Do NOT repeatedly add new phrases simply because a new conversational
example was missed.

For example, do NOT respond to every new failure with:

- add another Cantonese phrase
- add another Mandarin phrase
- add another English phrase
- add another regex
- add another sentence template

This creates an unmaintainable system and does not solve the underlying
semantic problem.

When a new failure is discovered, first ask:

1. What semantic behavior are we trying to detect?
2. Is the Semantic Judge receiving enough conversation context?
3. Is the dialogue state represented correctly?
4. Is the semantic judge schema sufficient?
5. Is the generation behavior actually wrong?
6. Should this behavior become a new regression scenario?

Only after that should a heuristic dictionary be considered.

A new phrase should normally NOT require a new permanent keyword.

# 7. When It Is Appropriate to Add a Heuristic

Adding a dictionary/regex entry is acceptable when the signal is:

- high confidence
- language-specific
- broadly reusable
- cheap to detect
- useful as supporting evidence
- useful as a fallback when semantic judging is unavailable

It should NOT be added merely to make one individual regression case pass.

Prefer:

```
"This is a reusable high-confidence heuristic."
```

over:

```
"This exact sentence failed, so add this phrase."
```

# 8. Recommended Evaluation Architecture

```
           Bot Response
                │
      ┌─────────┴─────────┐
      ↓                   ↓
Deterministic Checks   LLM Semantic Judge
      │                   │
      └─────────┬─────────┘
                ↓
         Final Test Result
```

## Deterministic Checks

Use deterministic checks for objective/mechanical requirements such as:

- schema validity
- JSON validity
- required fields
- required output structure
- maximum number of question marks
- hard length constraints
- exact state transitions when explicitly encoded
- other objective format/safety constraints

## Semantic Judge

Use the Semantic Judge for:

- meaning
- intent
- dialogue act
- answer recognition
- choice recognition
- conceptual repetition
- topic progression
- uncertainty handling
- disengagement handling
- topic switching
- unsupported premise detection
- semantic question detection

Do NOT force semantic problems into deterministic regexes.

# 9. Separate Generation From Evaluation

The Bot generation prompt and the evaluation prompt must remain
conceptually separate.

The Generator answers:

> What should the Bot say?

The Semantic Judge answers:

> Given the actual conversation, what did the Bot do?

The test must evaluate the actual generated output.

Do not make a test pass merely because the generation prompt contains
the desired instruction.

The generated response must demonstrate the intended behavior.

# 10. S2 — Question / Information Behavior

S2 should NOT depend on a hardcoded Cantonese `askWords` regex as its
primary question detector.

For S2:

### Deterministic layer

Can check things such as:

- required information/knowledge signal exists where appropriate
- question-mark count
- maximum number of questions

### Semantic layer

The LLM judge should determine:

- whether the Bot actually asks a question
- whether it asks the student to respond
- what type of question/action it is
- whether the question is appropriate to the current dialogue state

Possible semantic question types include:

```
none / recall / explanation / opinion / observation / comparison / prediction / choice / open / mixed
```

Do not create language-specific regexes for every category.

# 11. S7 — Context Continuity

The judge must determine whether the Bot preserves facts established
earlier in the conversation.

Example:

```
Bot: 南蓮園池喺鑽石山。
Student: 我唔知 wor。
```

The Bot should not suddenly behave as though the location is unknown
and ask:

```
"你覺得係鑽石山定大嶼山？"
```

The important test is not whether certain words appear.

The important test is:

> Did the Bot preserve and correctly use the established conversational
> context?

This should be judged semantically.

# 12. S8 — Choice Resolution

When the Bot presents an explicit choice, a student's subsequent answer
may refer to that choice without repeating the exact wording.

Example:

```
Bot: "你想知唐式點解咁素，定係想知嶺南雕通常用咩色？"
Student: "通常用咩色"
```

The judge should understand that the student selected the second option.

Do NOT require:

- exact string match
- complete sentence match
- predefined answer phrase

The test should evaluate semantic choice resolution.

The judge should be able to return something conceptually like:

```
recognizedChoice: "B"
```

when appropriate.

# 13. S9 — Correct Answer Must Advance the Dialogue

When the student gives a correct answer:

```
acknowledge + brief supplement if useful + advance the concept/topic
```

The Bot should not simply ask essentially the same conceptual question
again.

The Semantic Judge should determine:

- Was the student's answer correct?
- Did the Bot recognize it as correct?
- Did the Bot acknowledge it?
- Did the Bot provide useful supplementation where appropriate?
- Did the Bot advance?
- Did the Bot repeat the same conceptual question?

"Same concept" should be judged semantically, not by comparing exact
sentences.

For example, these may be semantically repetitive even though the wording
is different:

```
"點解小園林會令人覺得空間好大？"
"你覺得佢點樣做到空間感咁強？"
"咁你又會點解釋呢種空間效果？"
```

If the student has already correctly answered the underlying concept,
repeatedly asking variations of the same question should be detected as
conceptual repetition.

# 14. S10 — Unknown / "I Don't Know" Escalation

The Bot should appropriately handle uncertainty.

Examples:

```
唔知 / 我唔知道 / 不知道 / I don't know / I'm not sure
```

These should be interpreted semantically.

Do NOT maintain a large list of all possible ways a student might say
"I don't know".

The Semantic Judge should determine whether the student is expressing
uncertainty.

After repeated uncertainty, the Bot should reduce reliance on endless
Socratic questioning and provide a more direct explanation or easier
scaffolding.

The test should specifically detect:

- repeated questioning despite repeated uncertainty
- failure to adapt difficulty
- failure to provide explanation/scaffolding
- endless Socratic loops

# 15. S11 — Disengagement / Re-engagement

The Bot should recognize conversational disengagement semantically.

Examples may include:

```
算啦 / 唔想答 / 不想答 / never mind / I don't want to answer
```

Do NOT rely on a fixed phrase list.

The judge should determine whether the student is:

- disengaging
- refusing to answer
- asking to move on
- still participating but uncertain

The Bot should respond appropriately to the student's actual state.

The test should focus on behavior, not exact wording.

# 16. S12 — Topic Switching

If the student explicitly changes the topic, the Bot should follow the
new conversational intent when appropriate.

Example:

```
Current topic: 川劇變臉
Student: "我想問下南蓮園池。"
```

The test should determine semantically whether the Bot:

- recognized the topic switch
- followed the new topic
- avoided unnecessarily dragging the conversation back to the old topic

Do not implement topic switching through a list of predefined topic-switch
phrases.

The topic transition should be judged from context and meaning.

# 17. Unified Semantic Judge Schema

Prefer a structured result rather than asking the LLM for free-form prose.

The schema should be extensible and focused on dialogue behavior.

For example:

```ts
type DialogueJudgeResult = {
  asksQuestion: boolean;
  questionCount: number;
  questionType:
    | "none"
    | "open"
    | "choice"
    | "recall"
    | "explanation"
    | "opinion"
    | "observation"
    | "comparison"
    | "prediction"
    | "mixed";

  answeredPreviousQuestion: boolean;
  recognizedChoice: "A" | "B" | null;

  repeatedConcept: boolean;
  advancedTopic: boolean;

  introducedUnsupportedPremise: boolean;

  respectedUnknown: boolean;
  respectedDisengagement: boolean;
  followedTopicSwitch: boolean;

  explanation: string;
};
```

The exact schema may be adapted to the existing test framework.

Do not introduce unnecessary fields simply for the sake of abstraction.

# 18. Semantic Judge Must Use Conversation Context

Never evaluate difficult dialogue behavior from the Bot's latest message
alone.

For example, this sentence:

```
"咁你覺得呢？"
```

cannot be correctly evaluated without knowing what came before it.

The judge needs to know:

- what the Bot previously asked
- what the student answered
- whether the student already answered that concept
- whether the Bot offered choices
- what topic is currently active
- what state the dialogue is expected to be in

Therefore, semantic evaluation should be context-aware.

# 19. Regression Tests Should Test Behavioral Principles

Regression tests should represent underlying conversational behavior,
not merely the exact wording of a previous failure.

Bad regression design:

> "If Bot says exactly X, fail."

Better:

> "If student has already correctly answered concept Y,
>  Bot must not ask essentially the same conceptual question again."

Bad:

> "Detect the phrase '通常用咩色'."

Better:

> "When Bot offers an A/B choice and the student's reply semantically
>  selects B, Bot must treat it as selecting B."

Bad:

> "Recognize '唔知 wor' as unknown."

Better:

> "Recognize semantically that the student is expressing uncertainty."

This makes the tests robust against:

- paraphrasing
- different Cantonese wording
- Mandarin wording
- English wording
- natural variation in Bot generation

# 20. Multilingual Requirement

The semantic evaluation rules must be language-agnostic.

The same behavioral rule should work for:

- Cantonese
- Mandarin
- English

Do not create three independent semantic systems:

```
CantoneseQuestionDetector / MandarinQuestionDetector / EnglishQuestionDetector
```

Instead use one conceptual dialogue evaluation layer:

```
language-agnostic semantic dialogue evaluation
```

Language-specific heuristics are allowed as supporting/fallback signals,
but they should not become three separate semantic rule systems.

# 21. Handling LLM Judge Failure

The Semantic Judge itself may fail because of:

- API failure
- timeout
- malformed JSON
- unexpected model output

Do not silently treat judge failure as a semantic pass.

If practical, use:

```
primary: LLM Semantic Judge
fallback: heuristic/deterministic signals
```

But clearly distinguish the result source.

For example:

```
judgeSource: "semantic"
```

or:

```
judgeSource: "heuristic-fallback"
```

A heuristic fallback should never be presented as equivalent to a
successful semantic judgment.

# 22. Avoid False Confidence

Do not make the tests appear stronger than they actually are.

For example:

```
hasQuestionHint = true
questionMarkCount = 1
```

does NOT prove:

```
asksQuestion = true
```

Similarly:

```
noQuestionHint = true
```

does NOT prove:

```
asksQuestion = false
```

The test result should distinguish:

- deterministic evidence
- heuristic evidence
- semantic judgment

# 23. New Failure Handling Rule

Whenever a new Bot conversation failure is found:

### Step 1

Reproduce the actual conversation.

### Step 2

Identify the underlying semantic/dialogue-state failure.

### Step 3

Check whether the existing Semantic Judge should already detect it.

### Step 4

If not, improve the semantic evaluation rule/schema/context.

### Step 5

Add a regression scenario representing the behavioral principle.

### Step 6

Only consider adding a heuristic dictionary entry if it is a genuinely
high-confidence and reusable signal.

Do NOT automatically add a new keyword or regex.

# 24. Anti-Pattern / Red Flag

Treat this pattern as a red flag:

```
New failure → Add another keyword → Add another regex → Add another special case → Repeat forever
```

Instead:

```
New failure → Identify semantic behavior → Improve semantic judge/state evaluation
→ Add behavioral regression test → Optionally add reusable heuristic evidence
```

# 25. Relationship Between the Three Layers

The intended priority is:

1. **Semantic Judge** — Understand what happened in the conversation.
2. **Heuristic Dictionary / Regex** — Provide supporting evidence or fallback.
3. **Deterministic Checks** — Enforce objective mechanical constraints.

However, deterministic checks may independently fail regardless of semantic
judgment.

For example:

```
Semantic Judge: Bot asks exactly one appropriate question.
Deterministic:  output contains 2 question marks.
```

The test may still fail because the deterministic hard constraint was
violated.

This separation is intentional.

# 26. Final Design Principle

The test framework is not trying to answer:

> "Does this Bot response contain one of the question phrases we know?"

It is trying to answer:

> "Given the current conversation, what conversational action did the
>  Bot actually perform?"

The framework should therefore optimize for:

- semantic robustness
- multilingual robustness
- context awareness
- dialogue-state awareness
- regression coverage
- maintainability

while keeping a small set of practical deterministic and heuristic
fallbacks.

Do not solve a semantic problem by endlessly expanding a phrase dictionary.

The goal is:

```
NEW WORDING → same semantic interpretation → same behavioral test
```

across:

```
粵語 / 普通話 / English
```

---

## 落地原則（Implementation Note）

Dictionary 可以存在，但它永遠只能回答「有沒有一個可疑訊號」，
不能回答「這句話到底做了甚麼」。

Implementation status (`server/scripts/test-bot-prompt.ts`, 2026-09-18):

- S2 的 `askWords` 已移除，改由 Semantic Judge 判斷係咪問問題
  （deterministic `qCount <= 1` 保留做問號硬限制）
- S7–S12 全部經 Semantic Judge（統一 `DialogueJudgeResult` schema）
- Judge prompt 必須明確寫出輸出 schema（`questions[]` 每輪一個 +
  `dialogue` 全部欄位）——寫「只輸出 JSON」唔夠，model 會自由發揮
- S4 語言詞表（粵/普語氣詞、北方話禁詞）屬高置信度語言特定訊號，保留做 heuristic

---

## 落地原則（2026-09-19 追加）

以下三條由實作教訓而來，適用於所有功能（不只對話測試）。

### 1. 有設計文檔的 feature，實作收尾要逐條對返 checklist

實作收尾**必須**逐條對返文檔的 UX checklist tick 一次，不可以只靠測試綠燈當做完。

2026-09-19 教訓：topic 版本功能在 `docs/knowledge-map-topic-versions.md` §4.1 的
#4 記住上次選擇 / #6 完成反饋（highlight + toast）spec 了但漏做，同事試用才發現；
測試 gate（lint / i18n / ids / build）全部捉不到這類缺失。

### 2. 用戶文案：假設用戶第一次用

所有用戶可見文案，假設**從未用過產品的老師**第一眼要明：

1. 不准用開發／機制詞：解析、抽取、提取、版本、覆蓋、佔位、tab（除非真係指瀏覽器分頁）
2. 用老師日常詞：主題、教材、檔案、整理；講「結果」不講「機制」
3. 每句過一次測試：未用過的老師，第一眼明不明白？

2026-09-19 全 step 4 板塊已按這個原則重寫（commit b7f04fa）。

### 3. 資料來源一致性：寫入路徑必須覆蓋所有讀取路徑

知識點等核心數據有多個存儲（`bots.knowledge_base` / `character_topics` / `progress` 表）。
**每加一條寫入路徑，必須盤點所有讀取路徑**，確保讀到的是同一份來源；純邏輯要抽入
`utils/` 做守護測試。

2026-09-19 教訓：手動知識點只寫版本數據，學習報告只讀 `bots.knowledge_base` →
報告隱形 + 覆蓋被 filter 走。修法：發佈時以默認版本重建主知識庫
（`utils/chat-prompt.ts` 的 `buildKnowledgeBaseWithVersionPoints` +
`server/tests/knowledge-base-sync.test.ts` 守護測試，`npm run test:kb-sync`）。
