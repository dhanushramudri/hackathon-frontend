"use client";

import { usePathname } from "next/navigation";

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

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 gap-4 flex-shrink-0">
      <h1 className="text-sm font-semibold text-gray-700">{title}</h1>
      <div className="flex-1" />
      <span className="text-[11px] text-gray-400">From negotiation to evidence</span>
    </header>
  );
}
