import path from "path";

// Uploaded files live on local disk, not object storage — on a platform with
// ephemeral filesystems (serverless functions, containers without a mounted
// volume) they'd vanish on every redeploy/restart. UPLOAD_DIR lets deployment
// point this at a persistent volume (e.g. Railway) instead of the app's own
// working directory; defaults to "uploads" next to the project root for local dev.
export function getUploadsRoot(): string {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "uploads");
}
