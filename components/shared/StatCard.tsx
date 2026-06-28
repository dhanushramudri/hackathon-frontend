import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "blue" | "green" | "amber" | "red";
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  tooltip?: ReactNode;
}
const colorMap = {
  default: "bg-white border-gray-200 text-gray-900",
  blue: "bg-blue-50 border-blue-200 text-blue-900",
  green: "bg-emerald-50 border-emerald-200 text-emerald-900",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
  red: "bg-red-50 border-red-200 text-red-900",
};
const activeRingMap = {
  default: "ring-2 ring-gray-300",
  blue: "ring-2 ring-blue-300",
  green: "ring-2 ring-emerald-300",
  amber: "ring-2 ring-amber-300",
  red: "ring-2 ring-red-300",
};
export function StatCard({ label, value, sub, color = "default", icon, onClick, href, active, tooltip }: StatCardProps) {
  const interactive = Boolean(onClick || href);
  const body = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {interactive && (
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 absolute bottom-3 right-3 text-gray-300 transition-transform",
            "group-hover:translate-x-0.5 group-hover:text-gray-400"
          )}
        />
      )}
      {tooltip && (
        <div className="absolute left-0 top-full mt-1.5 z-20 hidden group-hover:block bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs w-60 text-left normal-case font-normal text-gray-600">
          {tooltip}
        </div>
      )}
    </>
  );
  const className = cn(
    "rounded-xl border p-4 relative group",
    colorMap[color],
    interactive && "text-left w-full transition hover:shadow-sm cursor-pointer",
    active && activeRingMap[color]
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}