"use client";

import { usePathname, useRouter } from "next/navigation";
import { Menu, HeartPulse } from "lucide-react";
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
  "/wellbeing": "Wellbeing",
};

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const title = TITLES[pathname] ?? "ResourceIQ";
  const { setMobileOpen } = useSidebarContext();
  const onWellbeing = pathname === "/wellbeing";

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-3 sm:px-6 gap-3 sm:gap-4 flex-shrink-0">
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden flex-shrink-0 p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition"
        title="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>
      <h1 className="text-sm font-semibold text-gray-700 truncate">{title}</h1>
      <div className="flex-1" />
      <button
        onClick={() => router.push("/wellbeing")}
        title="Wellbeing — project & employee burnout, in one place"
        className="relative flex-shrink-0 p-1.5 rounded-full transition hover:bg-pink-50"
      >
        {!onWellbeing && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ backgroundColor: "rgba(255, 97, 150, 0.35)" }}
            aria-hidden="true"
          />
        )}
        <HeartPulse className="w-5 h-5 relative" style={{ color: "#FF6196" }} />
      </button>
    </header>
  );
}
