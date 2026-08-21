import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSessionUser, getUserProjectRole } from "@/lib/api-helpers";
import { canViewDocument, resolveVisibilityBypass } from "@/lib/services/document.service";
import { getUploadsRoot } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

// Formats browsers can display inline; everything else triggers a download
const INLINE_TYPES = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".txt"]);

const MIME_TYPES: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc":  "application/msword",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls":  "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt":  "application/vnd.ms-powerpoint",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".txt":  "text/plain",
  ".csv":  "text/csv",
  ".zip":  "application/zip",
  ".rar":  "application/x-rar-compressed",
  // AutoCAD
  ".dwg":  "application/acad",
  ".dxf":  "application/dxf",
  // Other engineering formats
  ".ifc":  "application/x-step",
  ".rvt":  "application/octet-stream",
};

/**
 * Any file on disk belongs to either a Document (or one of its versions) or a
 * Notulen — resolve which, and the project it belongs to, so access can be
 * checked against the SAME visibility rules the document/notulen APIs already
 * enforce. Previously this route only checked "is logged in", not "is this
 * viewer allowed to see THIS document" — an authenticated user from any
 * project could fetch any other project's internal files by path.
 */
async function resolveFileAccess(requestPath: string, projectIdFromPath: string) {
  const doc = await prisma.document.findFirst({
    where: { OR: [{ filePath: requestPath }, { versions: { some: { filePath: requestPath } } }] },
    select: {
      visibility: true, status: true,
      projectPhase: { select: { projectId: true, project: { select: { inspectorSeesAllDocuments: true, clientSeesAllDocuments: true } } } },
    },
  });
  if (doc) return { kind: "document" as const, projectId: doc.projectPhase.projectId, visibility: doc.visibility, status: doc.status, project: doc.projectPhase.project };

  const notulen = await prisma.notulen.findFirst({ where: { filePath: requestPath }, select: { projectId: true } });
  if (notulen) return { kind: "notulen" as const, projectId: notulen.projectId, visibility: null, status: null, project: null };

  // Orphaned/unrecognized path — fall back to plain project membership, scoped
  // to the projectId segment the URL itself is namespaced under.
  return { kind: "unknown" as const, projectId: projectIdFromPath, visibility: null, status: null, project: null };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: pathSegments } = await params;
  const relativePath = pathSegments.join("/");
  const requestPath = `/api/files/${relativePath}`;

  const uploadsDir = getUploadsRoot();
  const filePath = path.join(uploadsDir, relativePath);
  if (!filePath.startsWith(uploadsDir)) {
    return NextResponse.json({ error: "Path tidak valid" }, { status: 400 });
  }

  if (!user.isSuperadmin) {
    const access = await resolveFileAccess(requestPath, pathSegments[0]);
    const role = await getUserProjectRole(user.id, access.projectId);

    const allowed = access.kind === "document"
      ? canViewDocument(role, access.visibility!, access.status!, resolveVisibilityBypass(role, access.project))
      : !!role || user.isGlobalInspector; // notulen / unrecognized path: any project role is enough, same as the notulen list endpoint

    if (!allowed) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }
  }

  try {
    const fileBuffer = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    const fileName = path.basename(filePath);
    const disposition = INLINE_TYPES.has(ext) ? "inline" : "attachment";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 });
  }
}
