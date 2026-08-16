import JSZip from "jszip";

// Best-effort plain-text extraction for content search (FR full-text search).
// Legacy binary formats (.doc, .ppt, .xls-BIFF via non-SheetJS-supported variants)
// are left unsupported — title/tag/code search still covers those documents.
export const MAX_EXTRACT_BYTES = 25 * 1024 * 1024; // skip extraction above this to keep uploads snappy

export async function extractText(buffer: Buffer, ext: string): Promise<string | null> {
  if (buffer.byteLength > MAX_EXTRACT_BYTES) return null;

  try {
    switch (ext) {
      case "pdf":
        return await extractPdf(buffer);
      case "docx":
        return await extractDocx(buffer);
      case "xlsx":
      case "xls":
        return await extractXlsx(buffer);
      case "pptx":
        return await extractPptx(buffer);
      default:
        return null;
    }
  } catch {
    // Corrupted/unsupported file variant — never block the upload on extraction failure
    return null;
  }
}

async function extractPdf(buffer: Buffer): Promise<string | null> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    // pdf-parse inserts a "-- N of M --" separator between every page's text
    // regardless of whether that page actually has any. A scanned/image-only
    // PDF (no embedded text layer — needs OCR, which this doesn't do) ends up
    // as just those separators with nothing real between them; stripping them
    // first is how we tell "genuinely no text" apart from "has content".
    const withoutPageMarkers = (result.text ?? "").replace(/--\s*\d+\s*of\s*\d+\s*--/g, "");
    return withoutPageMarkers.trim() ? result.text!.trim() : null;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string | null> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value?.trim() || null;
}

async function extractXlsx(buffer: Buffer): Promise<string | null> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) parts.push(`# ${sheetName}\n${csv}`);
  }
  return parts.join("\n\n").trim() || null;
}

// .pptx is a zip of slide{N}.xml files; each text run lives in an <a:t> node.
// A full XML parser is overkill for indexable text — a regex pull is enough.
async function extractPptx(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      return na - nb;
    });

  const parts: string[] = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async("text");
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    if (texts.length) parts.push(texts.join(" "));
  }
  return parts.join("\n").trim() || null;
}
