"use client";

import { usePathname } from "next/navigation";
import { useSidebarContext } from "@/components/layout/SidebarContext";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/allocations": "Current-State Allocation Report",
  "/free-pool": "Free Pool",
  "/leave": "Leave Impact",
  "/recommendations": "Resource Recommendation Engine",
  "/health": "Project Health & Efficiency Monitor",
  "/forecast/new-project": "New Project Demand Forecast",
  "/forecast/pipeline": "Pipeline Outlook",
  "/buddy": "Buddy",
};

export function Topbar() {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "ResourceIQ";
  const { setMobileOpen } = useSidebarContext();

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-3 sm:px-6 gap-3 sm:gap-4 flex-shrink-0">
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden flex-shrink-0 -ml-1 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition"
        title="Open menu"
      >
        <span className="leading-none select-none">
          <span className="text-[16px] font-serif font-bold text-gray-900">R</span>
          <span className="text-[14px] font-mono font-normal" style={{ color: "hsl(var(--primary))" }}>IQ</span>
        </span>
      </button>
      <h1 className="text-sm font-semibold text-gray-700 truncate">{title}</h1>
      <div className="flex-1" />
      <span className="hidden sm:inline text-[11px] text-gray-400">From negotiation to evidence</span>
    </header>
  );
}
