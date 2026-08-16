import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { createWriteStream } from "fs";
import { mkdir, unlink } from "fs/promises";
import Busboy from "busboy";
import { getUploadsRoot } from "@/lib/storage";

// req.formData() (used everywhere before this) buffers the ENTIRE request
// body in memory before returning anything — a 5MB upload measured a 270MB
// RSS spike on the server (Prompt 3f). This streams the multipart body
// straight to a temp file on disk instead, so peak memory stays bounded
// regardless of upload size. Non-file fields are still collected in memory
// (they're always small — titles, notes, etc., never user-controlled size).
export type ParsedUpload = {
  fields: Record<string, string>;
  file: { tempPath: string; originalName: string; size: number } | null;
};

export function parseMultipartUpload(
  req: Request,
  opts: { maxFileBytes: number; isAllowedFilename?: (name: string) => boolean }
): Promise<ParsedUpload | { error: "too_large" | "invalid_filename" }> {
  const contentType = req.headers.get("content-type") ?? "";
  const tmpDir = path.join(getUploadsRoot(), ".tmp");

  return new Promise((resolve, reject) => {
    mkdir(tmpDir, { recursive: true })
      .then(() => {
        const bb = Busboy({ headers: { "content-type": contentType }, limits: { fileSize: opts.maxFileBytes } });
        const fields: Record<string, string> = {};
        let file: ParsedUpload["file"] = null;
        let tooLarge = false;
        let invalidFilename = false;
        let pendingFile: Promise<void> | null = null;

        bb.on("field", (name, val) => {
          fields[name] = val;
        });

        bb.on("file", (_name, stream, info) => {
          if (opts.isAllowedFilename && !opts.isAllowedFilename(info.filename)) {
            invalidFilename = true;
            stream.resume(); // drain without writing so busboy's 'close' still fires
            return;
          }

          const tempPath = path.join(tmpDir, `${crypto.randomUUID()}.tmp`);
          let size = 0;

          pendingFile = new Promise((res, rej) => {
            const ws = createWriteStream(tempPath);
            stream.on("data", (chunk: Buffer) => { size += chunk.length; });
            stream.on("limit", () => { tooLarge = true; });
            stream.pipe(ws);
            ws.on("finish", () => {
              file = { tempPath, originalName: info.filename, size };
              res();
            });
            ws.on("error", rej);
            stream.on("error", rej);
          });
        });

        bb.on("close", async () => {
          try {
            if (pendingFile) await pendingFile;
            if (invalidFilename) return resolve({ error: "invalid_filename" });
            if (tooLarge) {
              if (file) await unlink(file.tempPath).catch(() => {});
              return resolve({ error: "too_large" });
            }
            resolve({ fields, file });
          } catch (e) {
            reject(e);
          }
        });
        bb.on("error", reject);

        Readable.fromWeb(req.body as any).pipe(bb);
      })
      .catch(reject);
  });
}

export async function cleanupTempUpload(tempPath: string | undefined | null) {
  if (tempPath) await unlink(tempPath).catch(() => {});
}
