import { NextRequest } from "next/server";
import { copyFile, mkdir } from "fs/promises";
import path from "path";
import {
  getSessionUser, getUserProjectRole,
  unauthorized, forbidden, badRequest, ok, created,
} from "@/lib/api-helpers";
import { getUploadsRoot } from "@/lib/storage";
import { parseMultipartUpload, cleanupTempUpload } from "@/lib/upload-stream";
import { MAX_UPLOAD_SIZE_BYTES } from "@/types";
import { listNotulenForProject, createNotulen } from "@/lib/services/notulen.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: projectId } = await params;

  if (!user.isSuperadmin && !user.isGlobalInspector) {
    const role = await getUserProjectRole(user.id, projectId);
    if (!role) return forbidden();
  }

  const notulen = await listNotulenForProject(projectId);

  return ok(notulen);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.isSuperadmin || user.isGlobalInspector) return forbidden();

  const { id: projectId } = await params;
  const role = await getUserProjectRole(user.id, projectId);
  if (!role || role === "CLIENT") return forbidden();

  const contentType = req.headers.get("content-type") ?? "";

  let title = "";
  let meetingType: string | null = null;
  let meetingDate = "";
  let location: string | null = null;
  let attendees: string | null = null;
  let discussion: string | null = null;
  let actionItems: any[] = [];
  let filePath: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    // Streams straight to a temp file instead of buffering the whole request
    // in memory (req.formData() would) — see upload-stream.ts.
    const parsed = await parseMultipartUpload(req, { maxFileBytes: MAX_UPLOAD_SIZE_BYTES });
    if ("error" in parsed) return badRequest("Ukuran file maksimal 200MB");

    title = parsed.fields.title ?? "";
    meetingType = parsed.fields.meetingType || null;
    meetingDate = parsed.fields.meetingDate ?? "";
    location = parsed.fields.location || null;
    attendees = parsed.fields.attendees || null;
    discussion = parsed.fields.discussion || null;
    const rawItems = parsed.fields.actionItems;
    actionItems = rawItems ? JSON.parse(rawItems) : [];

    const file = parsed.file;
    if (file && file.size > 0) {
      const uploadsDir = path.join(getUploadsRoot(), projectId);
      await mkdir(uploadsDir, { recursive: true });
      const safeFilename = `notulen-${Date.now()}-${file.originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const dest = path.join(uploadsDir, safeFilename);
      await copyFile(file.tempPath, dest);
      await cleanupTempUpload(file.tempPath);
      filePath = `/api/files/${projectId}/${safeFilename}`;
    } else {
      await cleanupTempUpload(file?.tempPath);
    }
  } else {
    const body = await req.json();
    ({ title, meetingType, meetingDate, location, attendees, discussion, actionItems } = body);
  }

  if (!title || !meetingDate) return badRequest("Judul dan tanggal rapat wajib diisi");

  const notulen = await createNotulen({
    projectId, userId: user.id, title, meetingType, meetingDate, location, attendees, discussion, filePath, actionItems,
  });

  return created(notulen);
}
