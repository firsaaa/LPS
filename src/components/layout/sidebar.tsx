"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, Users,
  ShieldCheck, LogOut, Zap, Building2, Search,
  ClipboardList, Bell, ChevronsLeft, ChevronsRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";
import { useUnreadCount } from "@/hooks/use-unread-count";

interface RoleFlags {
  isSuperadmin: boolean;
  isGlobalInspector: boolean;
  canLeadProject: boolean;
  hasInternalRole: boolean;
  hasClientRole: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  show: (r: RoleFlags & { isPureClient: boolean }) => boolean;
}

// A user who ONLY ever holds CLIENT (no internal role anywhere, can't lead a
// project, not staff) gets a deliberately narrow sidebar — see "Portal
// Client" below. Someone who's e.g. Engineer on one project and Client on
// another keeps the full internal nav; multi-role isn't collapsed away.
function isPureClient(r: RoleFlags): boolean {
  return !r.isSuperadmin && !r.isGlobalInspector && !r.canLeadProject && !r.hasInternalRole && r.hasClientRole;
}

const navItems: NavItem[] = [
  // "Dashboard" = see everything at a glance (all projects, progress, role
  // filter). Used to be labeled "Proyek" — renamed because that's what a
  // dashboard should mean, and the single-project deep-dive below now
  // carries the "Proyek" name instead.
  {
    href: "/projects",
    label: "Dashboard",
    icon: LayoutDashboard,
    show: (r) => !r.isPureClient,
  },
  // "Proyek" = drill into ONE project's own workspace (fase, dokumen,
  // notulen, milestone, tim). Used to be labeled "Dashboard", which read as
  // "see everything" but only ever showed a single selected project.
  {
    href: "/dashboard",
    label: "Proyek",
    icon: FolderKanban,
    show: (r) => !r.isSuperadmin && !r.isGlobalInspector && !r.isPureClient,
  },
  {
    href: "/documents",
    label: "Cari Dokumen",
    icon: Search,
    show: (r) => !r.isSuperadmin && !r.isGlobalInspector && !r.isPureClient,
  },
  {
    href: "/notifications",
    label: "Notifikasi",
    icon: Bell,
    show: (r) => !r.isSuperadmin && !r.isGlobalInspector && !r.isPureClient,
  },
  {
    href: "/laporan",
    label: "Laporan & Insight",
    icon: ClipboardList,
    show: (r) => !r.isSuperadmin && !r.isPureClient,
  },
  // Portal Client: the external-facing view. Shown to an actual Client
  // (that IS their whole sidebar, see isPureClient) and to anyone who can
  // lead a project (a Team Leader needs to preview what their client sees —
  // it's their call what gets marked client-facing, not a plain Engineer's).
  {
    href: "/client",
    label: "Portal Client",
    icon: Building2,
    show: (r) => !r.isSuperadmin && !r.isGlobalInspector && (r.hasClientRole || r.canLeadProject),
  },
  {
    href: "/auditor",
    label: "Pusat Kepatuhan",
    icon: ShieldCheck,
    show: (r) => r.isSuperadmin || r.isGlobalInspector,
  },
  {
    href: "/admin/users",
    label: "Manajemen User",
    icon: Users,
    show: (r) => r.isSuperadmin,
  },
];

interface SidebarProps extends RoleFlags {
  userName: string;
  userEmail: string;
}

const ROLE_ACCENT = {
  superadmin: { bg: "bg-red-600", chip: "bg-red-900/60 text-red-300", ring: "ring-red-500/30" },
  inspector:  { bg: "bg-purple-600", chip: "bg-purple-900/60 text-purple-300", ring: "ring-purple-500/30" },
  leader:     { bg: "bg-blue-600", chip: "bg-blue-900/60 text-blue-300", ring: "ring-blue-500/30" },
  client:     { bg: "bg-amber-600", chip: "bg-amber-900/60 text-amber-300", ring: "ring-amber-500/30" },
  member:     { bg: "bg-teal-600", chip: "bg-teal-900/60 text-teal-300", ring: "ring-teal-500/30" },
};

function roleAccentKey(r: RoleFlags): keyof typeof ROLE_ACCENT {
  if (r.isSuperadmin) return "superadmin";
  if (r.isGlobalInspector) return "inspector";
  if (r.canLeadProject) return "leader";
  if (isPureClient(r)) return "client";
  return "member";
}

const COLLAPSE_KEY = "lps-edms-sidebar-collapsed";

export function Sidebar({ isSuperadmin, isGlobalInspector, canLeadProject, hasInternalRole, hasClientRole, userName, userEmail }: SidebarProps) {
  const pathname = usePathname();
  const unreadCount = useUnreadCount();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    setMounted(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const flags: RoleFlags = { isSuperadmin, isGlobalInspector, canLeadProject, hasInternalRole, hasClientRole };
  const pureClient = isPureClient(flags);
  const visibleItems = navItems.filter((item) => item.show({ ...flags, isPureClient: pureClient }));
  const accent = ROLE_ACCENT[roleAccentKey(flags)];

  const roleLabel =
    isSuperadmin ? "Super Admin"
    : isGlobalInspector ? "Inspector"
    : canLeadProject ? "Team Leader"
    : pureClient ? "Client"
    : "Engineer";

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col bg-slate-900 transition-[width] duration-150",
        mounted ? (collapsed ? "w-[68px]" : "w-60") : "w-60"
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-14 items-center border-b border-slate-800", collapsed ? "justify-center px-2" : "gap-2.5 px-5")}>
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", accent.bg)}>
          <Zap className="h-3.5 w-3.5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-bold text-white tracking-tight">LPS EDMS</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">IEC 62305</p>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-white"
            aria-label="Ciutkan sidebar"
            title="Ciutkan sidebar"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center border-b border-slate-800 py-2 text-slate-500 hover:bg-slate-800 hover:text-white"
          aria-label="Perluas sidebar"
          title="Perluas sidebar"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && item.href !== "/documents" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center rounded-md text-sm transition-colors",
                    collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2",
                    isActive
                      ? cn(accent.bg, "text-white font-medium")
                      : "text-slate-400 hover:bg-slate-800 hover:text-white font-normal"
                  )}
                >
                  <span className="relative shrink-0">
                    <item.icon className={cn("h-4 w-4", isActive ? "text-white" : "text-slate-500")} />
                    {collapsed && item.href === "/notifications" && unreadCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </span>
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && item.href === "/notifications" && unreadCount > 0 && (
                    <span
                      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white"
                      aria-label={`${unreadCount} notifikasi belum dibaca`}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      <div className="border-t border-slate-800 p-3">
        <div className={cn("mb-2 flex items-center rounded-md py-1.5", collapsed ? "justify-center px-0" : "gap-2.5 px-2")}>
          <div
            className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-2", accent.bg, accent.ring)}
            title={collapsed ? `${userName} · ${roleLabel}` : undefined}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-200">{userName}</p>
              <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-medium mt-0.5", accent.chip)}>
                {roleLabel}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Keluar" : undefined}
          className={cn(
            "flex w-full items-center rounded-md text-xs text-slate-500 hover:bg-slate-800 hover:text-red-400 transition-colors",
            collapsed ? "justify-center py-2" : "gap-2 px-3 py-1.5"
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && "Keluar"}
        </button>
      </div>
    </aside>
  );
}
