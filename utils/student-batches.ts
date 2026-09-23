/**
 * Splitting bulk student operations into server-sized requests.
 *
 * The students API takes at most MAX_BATCH_STUDENTS ids per request
 * (server/lib/student-ops.ts) and answers 400 above that — both the batch
 * assign (PUT /api/students/groups) and the batch remove (DELETE
 * /api/students). A teacher pressing "select all" on a few hundred students
 * cannot be sent in one call, and the raw rejection ("studentIds must be an
 * array of 1-100 ids") is not something a teacher should ever read. The split
 * lives here so both call sites share one definition instead of drifting.
 */

/** Kept in step with server/lib/student-ops.ts MAX_BATCH_STUDENTS; see tests/student-batches.test.mjs. */
export const STUDENT_BATCH_SIZE = 100;

/** Split into consecutive batches of at most `size` items; order is preserved. */
export function chunkIds<T>(items: T[], size: number = STUDENT_BATCH_SIZE): T[][] {
  // A zero/negative size would never advance the cursor and loop forever.
  if (!Number.isFinite(size) || size < 1) throw new Error("batch size must be at least 1");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export type BatchRun<T> = {
  /** Items that actually succeeded, in order. Anything after a failure is absent. */
  done: T[];
  /** How many batches the work was split into; 1 means it was not split. */
  batchCount: number;
  /** The first failure; null when every batch succeeded. */
  error: Error | null;
};

/**
 * Run the batches one after another and stop at the first failure — no
 * silently continuing past an error. Reports which items actually succeeded so
 * the caller can say "partly done" instead of claiming a clean sweep.
 */
export async function runChunkedBatches<T>(
  items: T[],
  runBatch: (batch: T[]) => Promise<void>,
  size: number = STUDENT_BATCH_SIZE
): Promise<BatchRun<T>> {
  const batches = chunkIds(items, size);
  const done: T[] = [];
  for (const batch of batches) {
    try {
      await runBatch(batch);
    } catch (error) {
      return {
        done,
        batchCount: batches.length,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    done.push(...batch);
  }
  return { done, batchCount: batches.length, error: null };
}
