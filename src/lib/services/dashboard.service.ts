import { prisma } from "@/lib/prisma";
import { getUserProjectIds, getUserProjectRole } from "@/lib/api-helpers";
import { isStaleDailyReport, isMeetingGapWarning } from "@/lib/cadence";

type SessionUser = { id: string; isSuperadmin: boolean; isGlobalInspector: boolean; canLeadProject: boolean };

export async function getProjectDashboard(user: SessionUser, projectId: string | null) {
  let accessibleIds: string[];
  if (user.isSuperadmin) {
    const all = await prisma.project.findMany({ select: { id: true } });
    accessibleIds = all.map((p) => p.id);
  } else {
    // getUserProjectIds already returns every project if the user holds the global INSPECTOR role
    accessibleIds = await getUserProjectIds(user.id, ["TEAM_LEADER", "ENGINEER", "INSPECTOR", "CLIENT"]);
  }

  const targetId = projectId ?? accessibleIds[0];
  if (!targetId || !accessibleIds.includes(targetId)) {
    return { project: null, actionItems: [], pendingReview: [], needsRevision: [], missingDocs: [], cadence: null, warnings: [] };
  }

  const project = await prisma.project.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, client: true, status: true, targetEndDate: true },
  });
  if (!project) {
    return { project: null, actionItems: [], pendingReview: [], needsRevision: [], missingDocs: [], cadence: null, warnings: [] };
  }

  const now = new Date();

  // Pending review / needs revision / missing-docs / open action items are all
  // internal workflow state — a Client should never see them here even though
  // the widgets don't apply the same visibility+status gate the document
  // list/search/file routes do. Gate on role rather than trusting nav to hide
  // this page (nav visibility isn't access control — the page is still
  // reachable by URL).
  const viewerRole = user.isSuperadmin ? null : await getUserProjectRole(user.id, targetId);
  const isClientViewer = !user.isSuperadmin && viewerRole === "CLIENT";

  const actionItems = isClientViewer ? [] : await prisma.actionItem.findMany({
    where: { notulen: { projectId: targetId }, status: "OPEN" },
    include: {
      assignedTo: { select: { id: true, name: true } },
      notulen: { select: { id: true, title: true, meetingDate: true } },
    },
    orderBy: { deadline: "asc" },
    take: 10,
  });

  const pendingReview = isClientViewer ? [] : await prisma.document.findMany({
    where: { projectPhase: { projectId: targetId }, status: "UNDER_REVIEW" },
    include: {
      projectPhase: { select: { phase: true } },
      uploadedBy: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  const needsRevision = isClientViewer ? [] : await prisma.document.findMany({
    where: { projectPhase: { projectId: targetId }, status: "REVISION_REQUESTED" },
    include: {
      projectPhase: { select: { phase: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  const requiredDocs = await prisma.phaseRequiredDocument.findMany({ where: { isOptional: false } });
  const phases = await prisma.projectPhase.findMany({
    where: { projectId: targetId, isActive: true },
    include: { documents: { select: { documentType: true, status: true } } },
  });
  const missingDocs = isClientViewer ? [] : phases.flatMap((ph) => {
    const required = requiredDocs.filter((r) => r.phase === ph.phase);
    const approvedTypes = new Set(ph.documents.filter((d) => d.status === "APPROVED").map((d) => d.documentType));
    return required
      .filter((r) => !approvedTypes.has(r.documentType))
      .map((r) => ({ phase: ph.phase, label: r.label }));
  });

  const lastNotulen = await prisma.notulen.findFirst({
    where: { projectId: targetId },
    orderBy: { meetingDate: "desc" },
    select: { meetingDate: true },
  });
  const implementasiPhase = phases.find((p) => p.phase === "IMPLEMENTASI");
  const lastImplDoc = implementasiPhase
    ? await prisma.document.findFirst({
        where: { projectPhaseId: implementasiPhase.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
    : null;

  const cadence = {
    lastNotulenDate: lastNotulen?.meetingDate ?? null,
    daysSinceNotulen: lastNotulen ? Math.floor((now.getTime() - lastNotulen.meetingDate.getTime()) / 86400000) : null,
    openActionItemCount: actionItems.length,
    lastImplementasiUpload: lastImplDoc?.createdAt ?? null,
    daysSinceImplementasiUpload: lastImplDoc ? Math.floor((now.getTime() - lastImplDoc.createdAt.getTime()) / 86400000) : null,
    implementasiIsActive: !!implementasiPhase,
  };

  const warnings: { type: string; message: string }[] = [];
  if (project.targetEndDate && project.status !== "COMPLETED") {
    const daysLeft = Math.ceil((project.targetEndDate.getTime() - now.getTime()) / 86400000);
    if (daysLeft < 0) warnings.push({ type: "DEADLINE_OVERDUE", message: `Proyek melewati target ${Math.abs(daysLeft)} hari yang lalu.` });
    else if (daysLeft <= 14) warnings.push({ type: "DEADLINE_APPROACHING", message: `Target selesai dalam ${daysLeft} hari.` });
  }

  return { project, actionItems, pendingReview, needsRevision, missingDocs, cadence, warnings };
}

export async function getLaporanReport(
  user: SessionUser,
  projectId: string | null,
  period: "today" | "week" | "month" | "all"
) {
  let accessibleIds: string[];
  if (user.isSuperadmin) {
    const all = await prisma.project.findMany({ select: { id: true } });
    accessibleIds = all.map((p) => p.id);
  } else {
    // getUserProjectIds already returns every project if the user holds the global INSPECTOR role
    accessibleIds = await getUserProjectIds(user.id, ["TEAM_LEADER", "ENGINEER", "INSPECTOR", "CLIENT"]);
  }

  const targetId = projectId ?? accessibleIds[0];
  if (!targetId || !accessibleIds.includes(targetId)) {
    return { project: null, summary: null, byPhase: [], insights: [], recentActivity: [] };
  }

  const now = new Date();
  let since: Date | null = null;
  if (period === "today") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "week") {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const project = await prisma.project.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, client: true, status: true, targetEndDate: true },
  });
  if (!project) return { project: null, summary: null, byPhase: [], insights: [], recentActivity: [] };

  // Internal team reporting (draft/rejected/stale counts, uploader activity) —
  // not for Client, same reasoning as getProjectDashboard's gate above. Nav
  // already hides this page for Client; this is the actual access control.
  if (!user.isSuperadmin && (await getUserProjectRole(user.id, targetId)) === "CLIENT") {
    return { project: null, summary: null, byPhase: [], insights: [], recentActivity: [] };
  }

  // Aggregated in the database (count/groupBy) rather than fetching every
  // document row into Node and filtering in JS — result sizes here are bounded
  // by (phase count × status count), not by how many documents the project has
  // accumulated, so this stays fast as history piles up over a long project.
  const periodWhere = {
    projectPhase: { projectId: targetId },
    ...(since && { createdAt: { gte: since } }),
  };
  const staleThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const [
    totalDocuments,
    uploadedThisPeriod,
    statusCounts,
    phaseStatusCounts,
    approvedTypesByPhase,
    uploaderGroups,
    staleCount,
  ] = await Promise.all([
    prisma.document.count({ where: { projectPhase: { projectId: targetId } } }),
    prisma.document.count({ where: periodWhere }),
    prisma.document.groupBy({
      by: ["status"],
      where: { projectPhase: { projectId: targetId } },
      _count: { _all: true },
    }),
    prisma.document.groupBy({
      by: ["projectPhaseId", "status"],
      where: { projectPhase: { projectId: targetId } },
      _count: { _all: true },
    }),
    prisma.document.groupBy({
      by: ["projectPhaseId", "documentType"],
      where: { projectPhase: { projectId: targetId }, status: "APPROVED" },
    }),
    prisma.document.groupBy({
      by: ["uploadedById"],
      where: periodWhere,
      _count: { _all: true },
    }),
    prisma.document.count({
      where: { projectPhase: { projectId: targetId }, status: "UNDER_REVIEW", createdAt: { lt: staleThreshold } },
    }),
  ]);

  const statusCountMap: Record<string, number> = {};
  for (const row of statusCounts) statusCountMap[row.status] = row._count._all;

  const summary = {
    totalDocuments,
    uploadedThisPeriod,
    draft: statusCountMap["DRAFT"] ?? 0,
    underReview: statusCountMap["UNDER_REVIEW"] ?? 0,
    approved: statusCountMap["APPROVED"] ?? 0,
    revisionRequired: statusCountMap["REVISION_REQUESTED"] ?? 0,
    rejected: statusCountMap["REJECTED"] ?? 0,
    archived: statusCountMap["ARCHIVED"] ?? 0,
    pendingAction: statusCountMap["UNDER_REVIEW"] ?? 0,
  };

  const phases = await prisma.projectPhase.findMany({
    where: { projectId: targetId },
    orderBy: { phase: "asc" },
  });
  const requiredDocs = await prisma.phaseRequiredDocument.findMany({ where: { isOptional: false } });

  const phaseStatusMap = new Map<string, Record<string, number>>();
  for (const row of phaseStatusCounts) {
    const m = phaseStatusMap.get(row.projectPhaseId) ?? {};
    m[row.status] = row._count._all;
    phaseStatusMap.set(row.projectPhaseId, m);
  }
  const approvedTypesMap = new Map<string, Set<string>>();
  for (const row of approvedTypesByPhase) {
    const s = approvedTypesMap.get(row.projectPhaseId) ?? new Set<string>();
    s.add(row.documentType);
    approvedTypesMap.set(row.projectPhaseId, s);
  }

  const byPhase = phases.map((ph) => {
    const statusMap = phaseStatusMap.get(ph.id) ?? {};
    const total = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const required = requiredDocs.filter((r) => r.phase === ph.phase);
    const approvedTypes = approvedTypesMap.get(ph.id) ?? new Set<string>();
    const fulfilled = required.filter((r) => approvedTypes.has(r.documentType)).length;
    return {
      phase: ph.phase,
      isActive: ph.isActive,
      isSkipped: ph.isSkipped,
      total,
      approved: statusMap["APPROVED"] ?? 0,
      pending: statusMap["UNDER_REVIEW"] ?? 0,
      requiredCount: required.length,
      fulfilledCount: fulfilled,
      percent: required.length === 0 ? 100 : Math.round((fulfilled / required.length) * 100),
    };
  });

  const lastNotulen = await prisma.notulen.findFirst({
    where: { projectId: targetId },
    orderBy: { meetingDate: "desc" },
    select: { meetingDate: true, id: true },
  });

  const openActionItems = await prisma.actionItem.count({
    where: { notulen: { projectId: targetId }, status: "OPEN" },
  });

  const implementasiPhase = phases.find((p) => p.phase === "IMPLEMENTASI");
  let lastImplementasiUpload: Date | null = null;
  if (implementasiPhase?.isActive) {
    const lastDoc = await prisma.document.findFirst({
      where: { projectPhaseId: implementasiPhase.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    lastImplementasiUpload = lastDoc?.createdAt ?? null;
  }

  const cadence = {
    lastNotulenDate: lastNotulen?.meetingDate ?? null,
    daysSinceNotulen: lastNotulen
      ? Math.floor((now.getTime() - lastNotulen.meetingDate.getTime()) / 86400000)
      : null,
    openActionItems,
    lastImplementasiUpload,
    daysSinceImplementasiUpload: lastImplementasiUpload
      ? Math.floor((now.getTime() - lastImplementasiUpload.getTime()) / 86400000)
      : null,
    implementasiIsActive: implementasiPhase?.isActive ?? false,
  };

  const insights: { type: "warning" | "info" | "success"; message: string }[] = [];

  if (cadence.implementasiIsActive) {
    if (cadence.lastImplementasiUpload === null) {
      insights.push({
        type: "warning",
        message: "Fase Implementasi aktif tetapi belum ada dokumen yang diupload. Laporan harian harus ada setiap hari kerja.",
      });
    } else if (isStaleDailyReport(cadence.daysSinceImplementasiUpload)) {
      insights.push({
        type: "warning",
        message: `Tidak ada dokumen baru di fase Implementasi selama ${cadence.daysSinceImplementasiUpload} hari. Pastikan laporan harian sudah diupload.`,
      });
    } else if (cadence.daysSinceImplementasiUpload === 1 || cadence.daysSinceImplementasiUpload === 2) {
      insights.push({
        type: "warning",
        message: `Laporan harian terakhir diupload ${cadence.daysSinceImplementasiUpload} hari lalu. Jangan lupa upload hari ini.`,
      });
    }
  }

  if (project.status === "ACTIVE") {
    if (cadence.lastNotulenDate === null) {
      insights.push({
        type: "info",
        message: "Belum ada notulen rapat yang dicatat. Rekam hasil meeting untuk tracking tindak lanjut.",
      });
    } else if (cadence.daysSinceNotulen !== null && cadence.daysSinceNotulen >= 14) {
      insights.push({
        type: "warning",
        message: `Tidak ada notulen rapat dalam ${cadence.daysSinceNotulen} hari terakhir. Jadwalkan review meeting.`,
      });
    } else if (isMeetingGapWarning(cadence.daysSinceNotulen)) {
      insights.push({
        type: "warning",
        message: `Belum ada notulen rapat minggu ini (terakhir ${cadence.daysSinceNotulen} hari lalu).`,
      });
    }
  }

  if (openActionItems > 0) {
    insights.push({
      type: "warning",
      message: `${openActionItems} action item dari notulen rapat belum selesai.`,
    });
  }

  if (summary.pendingAction > 0) {
    insights.push({ type: "warning", message: `${summary.pendingAction} dokumen menunggu review atau persetujuan.` });
  }
  if (summary.revisionRequired > 0) {
    insights.push({ type: "warning", message: `${summary.revisionRequired} dokumen perlu direvisi oleh engineer.` });
  }

  if (staleCount > 0) {
    insights.push({ type: "warning", message: `${staleCount} dokumen sudah menunggu review lebih dari 3 hari.` });
  }

  if (project.targetEndDate) {
    const daysLeft = Math.ceil((project.targetEndDate.getTime() - now.getTime()) / 86400000);
    if (daysLeft < 0) {
      insights.push({ type: "warning", message: `Target proyek terlewat ${Math.abs(daysLeft)} hari yang lalu.` });
    } else if (daysLeft <= 14) {
      insights.push({ type: "warning", message: `Sisa ${daysLeft} hari menuju target selesai proyek.` });
    }
  }

  const completedPhases = byPhase.filter((p) => p.isActive && !p.isSkipped && p.requiredCount > 0 && p.fulfilledCount === p.requiredCount);
  if (completedPhases.length > 0) {
    insights.push({ type: "success", message: `${completedPhases.length} fase sudah memiliki semua dokumen wajib yang disetujui.` });
  }
  if (summary.approved > 0 && summary.pendingAction === 0 && summary.revisionRequired === 0) {
    insights.push({ type: "success", message: "Semua dokumen yang diupload sudah disetujui. Tidak ada yang pending." });
  }
  if (insights.length === 0) {
    insights.push({ type: "info", message: "Belum ada dokumen yang diupload ke proyek ini." });
  }

  const uploaderIds = uploaderGroups.map((g) => g.uploadedById);
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true } })
    : [];
  const uploaderNameMap = new Map(uploaders.map((u) => [u.id, u.name]));
  const uploaderBreakdown = uploaderGroups
    .map((g) => ({ name: uploaderNameMap.get(g.uploadedById) ?? "Tidak diketahui", count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const recentActivity = await prisma.auditLog.findMany({
    where: {
      projectId: targetId,
      ...(since && { createdAt: { gte: since } }),
    },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return {
    project,
    period,
    summary,
    byPhase,
    uploaderBreakdown,
    insights,
    cadence,
    recentActivity,
  };
}

export async function getMyTasks(userId: string) {
  const [assignedDocs, openActionItems] = await Promise.all([
    prisma.document.findMany({
      where: {
        assignedToId: userId,
        status: { notIn: ["APPROVED", "ARCHIVED"] },
      },
      include: {
        projectPhase: {
          select: {
            phase: true,
            project: { select: { id: true, name: true } },
          },
        },
        uploadedBy: { select: { id: true, name: true } },
        versions: { where: { isCurrent: true }, take: 1, select: { versionNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),

    prisma.actionItem.findMany({
      where: {
        assignedToId: userId,
        status: "OPEN",
      },
      include: {
        notulen: {
          select: {
            id: true,
            title: true,
            meetingDate: true,
            project: { select: { id: true, name: true } },
          },
        },
        linkedDocument: { select: { id: true, title: true } },
        requiredDocumentType: { select: { id: true, name: true, typeCode: true } },
      },
      orderBy: { deadline: "asc" },
      take: 20,
    }),
  ]);

  return { assignedDocs, openActionItems };
}
