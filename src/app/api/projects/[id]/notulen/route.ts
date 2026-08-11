import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import {
  getSessionUser, getUserProjectRole,
  unauthorized, forbidden, badRequest, ok, created,
} from "@/lib/api-helpers";
import { getUploadsRoot } from "@/lib/storage";
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
    const formData = await req.formData();
    title = formData.get("title") as string ?? "";
    meetingType = (formData.get("meetingType") as string) || null;
    meetingDate = formData.get("meetingDate") as string ?? "";
    location = (formData.get("location") as string) || null;
    attendees = (formData.get("attendees") as string) || null;
    discussion = (formData.get("discussion") as string) || null;
    const rawItems = formData.get("actionItems") as string;
    actionItems = rawItems ? JSON.parse(rawItems) : [];

    const file = formData.get("file") as File | null;
    if (file && file.size > 0) {
      const uploadsDir = path.join(getUploadsRoot(), projectId);
      await mkdir(uploadsDir, { recursive: true });
      const safeFilename = `notulen-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const dest = path.join(uploadsDir, safeFilename);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(dest, buffer);
      filePath = `/api/files/${projectId}/${safeFilename}`;
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
