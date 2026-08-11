import path from "path";
import { mkdir } from "fs/promises";
import type { Worker } from "tesseract.js";

// OCR for scanned/image-only PDFs (no embedded text layer — see
// text-extraction.service.ts). Tesseract is CPU-heavy (roughly 0.5-1s per
// page), so this is always called from a background task (Next's after()),
// never synchronously during the upload request.
const MAX_OCR_PAGES = 60;

// Language data downloads once into this cache dir on first use, instead of
// littering the project root (tesseract.js's default behavior).
const CACHE_DIR = path.join(process.cwd(), ".tesseract-cache");

// A fresh worker per OCR job, not a kept-alive singleton: jobs are already
// rare and take minutes (background, per-document), so the ~1s init cost is
// negligible — while a singleton would pin the WASM engine + language data in
// server memory for the process's entire lifetime, for a feature used
// occasionally. Sized against actual usage, not against theoretical reuse.
async function createOcrWorker(): Promise<Worker> {
  await mkdir(CACHE_DIR, { recursive: true }); // writeCache() doesn't create missing dirs
  const { createWorker } = await import("tesseract.js");
  // Next's server bundler mangles tesseract.js's own dynamic require() of
  // its worker script (turns the real path into a nonexistent "/ROOT/..."
  // one) — and even require.resolve() gets rewritten into a synthetic
  // "[externals]/..." string for an externalized package. Building the
  // path from process.cwd() is plain string concatenation, invisible to
  // the bundler's static analysis, so it survives untouched.
  const workerPath = path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js");
  const corePath = path.join(process.cwd(), "node_modules/tesseract.js-core/index.js");
  return createWorker(["ind", "eng"], undefined, {
    // langPath intentionally NOT set to a local dir: tesseract.js treats a
    // non-URL langPath as "the trained data already lives here" and just
    // reads it (no download). Leaving it unset makes it default to the
    // jsdelivr CDN, which is what actually triggers the download.
    // cachePath is the separate "write the downloaded copy here" option.
    cachePath: CACHE_DIR,
    workerPath,
    corePath,
  });
}

/** Rasterizes each page of a scanned PDF and OCRs it. Returns null if nothing readable comes out. */
export async function ocrPdf(buffer: Buffer): Promise<string | null> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  let pageImages: { pageNumber: number; data: Uint8Array }[];
  try {
    const info = await parser.getInfo();
    const pageCount = Math.min(info.total ?? 1, MAX_OCR_PAGES);
    const partial = Array.from({ length: pageCount }, (_, i) => i + 1);
    const screenshot = await parser.getScreenshot({ imageBuffer: true, partial } as any);
    pageImages = screenshot.pages.map((p: any) => ({ pageNumber: p.pageNumber, data: p.data }));
  } finally {
    await parser.destroy();
  }

  const worker = await createOcrWorker();
  try {
    const parts: string[] = [];
    for (const page of pageImages) {
      const { data } = await worker.recognize(Buffer.from(page.data));
      if (data.text?.trim()) parts.push(data.text.trim());
    }
    return parts.join("\n\n").trim() || null;
  } finally {
    await worker.terminate();
  }
}
