import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return format(new Date(date), "dd MMM yyyy", { locale: localeId });
}

export function formatDateTime(date: Date | string) {
  return format(new Date(date), "dd MMM yyyy, HH:mm", { locale: localeId });
}

export function formatRelative(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: localeId });
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getFileExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function generateVersionLabel(version: number) {
  return `v${version}.0`;
}

// A failed request's body isn't always JSON — a stale dev-server connection,
// a proxy timeout, or a framework-level rejection can all return an empty or
// HTML body, and `res.json()` throws an uncaught "Unexpected end of JSON
// input" on that instead of the intended error toast. Always route error
// responses through this instead of `await res.json()` directly.
export async function parseErrorMessage(res: Response, fallback = "Terjadi kesalahan, silakan coba lagi"): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
}

/** Convert stored fileUrl to a servable URL via /api/files route. */
export function getFileUrl(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  if (fileUrl.startsWith("http") || fileUrl.startsWith("/api/files/")) return fileUrl;
  // Seed stores "uploads/proj-xxx/file.pdf" — strip "uploads/" prefix
  const stripped = fileUrl.startsWith("uploads/") ? fileUrl.slice("uploads/".length) : fileUrl;
  return `/api/files/${stripped}`;
}
