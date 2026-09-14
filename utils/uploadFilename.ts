/**
 * Multer/busboy follows the multipart specification and decodes filename
 * parameters as Latin-1. Browsers, however, send those bytes as UTF-8. That
 * mismatch turns names such as "中文教材.docx" into mojibake.
 *
 * Only reinterpret byte-sized strings that form valid UTF-8. This keeps ASCII,
 * genuine Latin-1 names and already-correct Unicode names unchanged.
 */
export function normalizeUploadFilename(value: unknown) {
  const filename = String(value ?? "");
  if (!filename || !Array.from(filename).every((character) => character.charCodeAt(0) <= 0xff)) {
    return filename.normalize("NFC");
  }

  try {
    const bytes = Uint8Array.from(filename, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).normalize("NFC");
  } catch {
    return filename.normalize("NFC");
  }
}
