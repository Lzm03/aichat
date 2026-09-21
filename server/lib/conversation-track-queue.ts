/**
 * 對話狀態寫入嘅 per-conversation FIFO 隊列（read-your-writes）。
 *
 * 背景：trackConversationState 係 fire-and-forget（`void ...`）—— 一回覆完就
 * 喺背景寫 bot_conversation_states，唔想阻塞回覆（入面每 3 輪仲有一次 Gemini
 * judge call，閒閒地幾秒）。但咁樣就出現兩個問題：
 *
 *   1. 下一個 /api/ask 組裝 system prompt 前會讀返呢個 state row。學生手快
 *      再問一句，就讀到上一輪未寫好嘅 covered / next_point，Bot 照教舊嘢。
 *   2. 兩個在途寫入會互相交錯：state row 係最後寫入者贏，但計數器
 *      （turns_since_summary / turns_on_next_point / turns_since_judge）係
 *      read-modify-write —— 交錯就會靜靜雞食咗一個回合。
 *
 * 做法：同一段對話嘅寫入排成一條 promise 鏈（FIFO），讀之前用
 * waitForPendingTrack 等埋條鏈。寫入照舊唔阻塞回覆，但「寫完之後讀」嘅保證
 * 返返嚟。
 *
 * 局限（刻意唔解決，記住佢）：呢個 Map 係 per-process 嘅。多 instance 部署時，
 * 下一個 request 落喺另一個 instance 就唔會等 —— 同今日一樣。部署層面嘅
 * 跨進程序列化要 Redis 級基建，超出範圍；顯示側（工作坊對話嘅進度面板）
 * 有 5 秒輪詢兜底，唔會見到舊數。
 */

type ConversationStateWork = () => Promise<void>;

/** conversationId → 該對話嘅隊列尾（永遠唔會 reject 嘅 promise）。 */
const pendingTracks = new Map<string, Promise<void>>();

/**
 * 將一件寫入工作排入該對話嘅隊列尾，回傳「排到佢完成為止」嘅 promise。
 *
 * 回傳嘅 promise 一定唔會 reject（下面個 .catch 掛喺成條鏈上，前面任何
 * reject 都吞埋）—— 所以 caller 可以直接 await，唔使自己 catch。
 */
export function enqueueConversationTrack(
  conversationId: string,
  work: ConversationStateWork
): Promise<void> {
  const previous = pendingTracks.get(conversationId) ?? Promise.resolve();
  // 一定要 store 呢條「已經 catch 咗」嘅 promise：store 原本嗰條（raw）嘅話，
  // 佢一 reject 就會連累下一條鏈，成個隊列死喺度。用 () => work() 而唔係
  // .then(work)，免得 work 收到上一個 work 嘅回傳值。
  const next = previous
    .then(() => work())
    .catch((error) => {
      console.warn(
        `[conversation-state] queued track failed for conversation ${conversationId}`,
        error
      );
    });
  pendingTracks.set(conversationId, next);
  void next.then(() => {
    // 淨係喺自己仍然係隊列尾先清 entry：等候期間如果有新 track 入咗隊，
    // map 已經指住佢嗰條，呢度刪就等於刪走人哋條鏈。
    if (pendingTracks.get(conversationId) === next) pendingTracks.delete(conversationId);
  });
  return next;
}

/**
 * 等埋該對話所有在途寫入；冇在途嘢就即刻 resolve。
 *
 * timeoutMs > 0 時封頂：judge call 冇 app-level timeout，真係掛死咗嘅話，
 * 寧願退化成「讀到舊 state」都唔好令之後每一句都卡死喺度。
 *
 * 注意：唔可以喺隊列入面嘅 work 度 call 呢個函數（自己等自己 = 死鎖）。
 */
export function waitForPendingTrack(conversationId: string, timeoutMs = 0): Promise<void> {
  const pending = pendingTracks.get(conversationId);
  if (!pending) return Promise.resolve();
  if (timeoutMs <= 0) return pending;
  return new Promise<void>((resolve) => {
    // 呢個 timer 一定會 fire 或者被 clear，唔會留住個 process，所以唔使 unref。
    const timer = setTimeout(resolve, timeoutMs);
    pending.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        // pending 唔會 reject，呢個分支係防禦性：真係 reject 都唔好卡住 caller。
        clearTimeout(timer);
        resolve();
      }
    );
  });
}
