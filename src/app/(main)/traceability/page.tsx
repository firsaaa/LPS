import { redirect } from "next/navigation";

// Traceability Dokumen is now the "Traceability per Proyek" tab inside the
// Auditor dashboard — kept as a redirect so old links/bookmarks still land
// somewhere, instead of two overlapping monitoring pages in the sidebar.
export default function TraceabilityPage() {
  redirect("/auditor");
}
