export function takeVertexSseData(input: string) {
  const normalized = input.replace(/\r\n/g, "\n");
  const chunks = normalized.split("\n\n");
  const rest = chunks.pop() || "";
  const data = chunks
    .map((event) =>
      event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    )
    .filter(Boolean);
  return { data, rest };
}
