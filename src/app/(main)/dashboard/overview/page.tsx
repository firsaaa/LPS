import { redirect } from "next/navigation";

// Overview Proyek is now folded into the "Proyek" page itself (list view +
// stats strip toggle) — kept as a redirect so old links/bookmarks still land
// somewhere, instead of two pages showing the same project list.
export default function OverviewPage() {
  redirect("/projects");
}
