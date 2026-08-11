import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  globalRoleLabel?: string | null;
  projectRole?: string | null;
  icon?: LucideIcon;
  accent?: "blue" | "purple" | "red" | "amber" | "teal";
}

const ACCENT = {
  blue:   { bg: "bg-blue-50", text: "text-blue-600" },
  purple: { bg: "bg-purple-50", text: "text-purple-600" },
  red:    { bg: "bg-red-50", text: "text-red-600" },
  amber:  { bg: "bg-amber-50", text: "text-amber-600" },
  teal:   { bg: "bg-teal-50", text: "text-teal-600" },
};

export function Header({ title, globalRoleLabel, projectRole, icon: Icon, accent = "blue" }: HeaderProps) {
  const tone = ACCENT[accent];
  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone.bg)}>
            <Icon className={cn("h-4 w-4", tone.text)} />
          </div>
        )}
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {globalRoleLabel && (
          <Badge variant="secondary" className="text-xs">
            {globalRoleLabel}
          </Badge>
        )}
        {projectRole && (
          <Badge variant="info" className="text-xs">{projectRole}</Badge>
        )}
      </div>
    </header>
  );
}
