export type ExtractedFilePart = {
  fileName: string;
  extractedText: string;
};

/**
 * Build one model input while sharing the available context across every file.
 * Short files return their unused allowance to the remaining larger files.
 */
export function combineExtractedFileText(parts: ExtractedFilePart[], maxChars: number) {
  const usableParts = parts.filter((part) => part.extractedText.trim());
  if (!usableParts.length || maxChars <= 0) return "";

  const headers = usableParts.map((part) => `【文件：${part.fileName.slice(0, 180)}】\n`);
  const separatorLength = Math.max(0, usableParts.length - 1) * 2;
  const contentBudget = Math.max(
    0,
    maxChars - headers.reduce((total, header) => total + header.length, 0) - separatorLength
  );
  const allocations = usableParts.map(() => 0);
  let remainingBudget = contentBudget;
  let pending = usableParts.map((_, index) => index);

  while (remainingBudget > 0 && pending.length > 0) {
    const share = Math.max(1, Math.floor(remainingBudget / pending.length));
    const nextPending: number[] = [];
    for (const index of pending) {
      if (remainingBudget <= 0) break;
      const available = usableParts[index].extractedText.length - allocations[index];
      const granted = Math.min(available, share, remainingBudget);
      allocations[index] += granted;
      remainingBudget -= granted;
      if (allocations[index] < usableParts[index].extractedText.length) nextPending.push(index);
    }
    pending = nextPending;
  }

  return usableParts
    .map((part, index) => `${headers[index]}${part.extractedText.slice(0, allocations[index])}`)
    .join("\n\n")
    .slice(0, maxChars)
    .trim();
}
