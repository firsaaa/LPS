// Minimal, dependency-free multi-page PDF generator for seed/dummy documents.
// Produces a structurally correct PDF (proper xref table + byte offsets) so it
// works both for inline browser viewing and for pdf-parse text extraction.

function escapePdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Builds a simple text PDF: a title line followed by paragraphs (each may contain "\n"). */
export function makeSimplePdf(title: string, paragraphs: string[]): Buffer {
  const MAX_CHARS = 90;
  const LINES_PER_PAGE = 48;

  const allLines: string[] = [title.toUpperCase(), ""];
  for (const p of paragraphs) {
    for (const raw of p.split("\n")) {
      allLines.push(...wrapLine(raw, MAX_CHARS));
    }
    allLines.push("");
  }

  const pages: string[][] = [];
  for (let i = 0; i < allLines.length; i += LINES_PER_PAGE) {
    pages.push(allLines.slice(i, i + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push([""]);

  const numPages = pages.length;
  const pageObjNums = pages.map((_, i) => 4 + i * 2);
  const contentObjNums = pages.map((_, i) => 5 + i * 2);
  const totalObjects = 3 + numPages * 2;

  const objects: string[] = new Array(totalObjects + 1);
  objects[1] = `<</Type/Catalog/Pages 2 0 R>>`;
  objects[2] = `<</Type/Pages/Kids[${pageObjNums.map((n) => `${n} 0 R`).join(" ")}]/Count ${numPages}>>`;
  objects[3] = `<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>`;

  pages.forEach((lines, i) => {
    const pageNum = pageObjNums[i];
    const contentNum = contentObjNums[i];
    objects[pageNum] = `<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 3 0 R>>>>/MediaBox[0 0 612 792]/Contents ${contentNum} 0 R>>`;

    let contentStream = "BT /F1 11 Tf 50 742 Td 14 TL\n";
    lines.forEach((line, idx) => {
      const esc = escapePdfText(line);
      contentStream += idx === 0 ? `(${esc}) Tj\n` : `T* (${esc}) Tj\n`;
    });
    contentStream += "ET";
    objects[contentNum] = `<</Length ${Buffer.byteLength(contentStream, "latin1")}>>stream\n${contentStream}\nendstream`;
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let n = 1; n <= totalObjects; n++) {
    offsets[n] = Buffer.byteLength(out, "latin1");
    out += `${n} 0 obj ${objects[n]} endobj\n`;
  }
  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${totalObjects + 1}\n`;
  out += `0000000000 65535 f \n`;
  for (let n = 1; n <= totalObjects; n++) {
    out += `${offsets[n].toString().padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer<</Size ${totalObjects + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(out, "latin1");
}
