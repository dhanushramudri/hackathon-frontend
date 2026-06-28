"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Contact, Sparkles, ShieldAlert, TrendingUp, CalendarRange, UserCheck, CalendarOff,
  ChevronLeft, X,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Mascot } from "@/components/shared/Mascot";
import { useSidebarContext } from "@/components/layout/SidebarContext";

type NavLinkSpec = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };

const TOP_LINK: NavLinkSpec = { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard };

const NAV_GROUPS: { label: string; links: NavLinkSpec[] }[] = [
  {
    label: "Allocation",
    links: [
      { label: "Employees", href: "/employees", icon: Contact },
      { label: "Allocations", href: "/allocations", icon: Users },
      { label: "Free Pool", href: "/free-pool", icon: UserCheck },
      { label: "Leave", href: "/leave", icon: CalendarOff },
    ],
  },
  {
    label: "Recommendation",
    links: [
      { label: "Recommendations", href: "/recommendations", icon: Sparkles },
      { label: "Health", href: "/health", icon: ShieldAlert },
    ],
  },
  {
    label: "Forecast",
    links: [
      { label: "Forecast", href: "/forecast/new-project", icon: TrendingUp },
      { label: "Pipeline", href: "/forecast/pipeline", icon: CalendarRange },
    ],
  },
];

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="px-3 pt-3 pb-1">
      <span className="text-[9px] font-bold tracking-widest uppercase text-sidebar-foreground select-none">{children}</span>
    </div>
  );
}

function NavLink({ link, open, isActive }: { link: NavLinkSpec; open: boolean; isActive: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      title={open ? undefined : link.label}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
        open ? "justify-start" : "justify-center",
        !isActive && "text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
      )}
      style={
        isActive
          ? { backgroundColor: "hsl(var(--primary) / 0.10)", color: "hsl(var(--primary))", fontWeight: 600, borderLeft: "1px solid hsl(var(--primary))" }
          : {}
      }
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      {open && <span>{link.label}</span>}
    </Link>
  );
}

function PersonGlyph({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <circle cx="0" cy="-5" r="3.4" fill="#ff6196" />
      <path d="M -6 10 C -6 2 6 2 6 10 Z" fill="#ff6196" />
    </g>
  );
}

function SidebarBackground() {
  return (
    <svg className="absolute left-0 right-0 top-14 bottom-0 w-full pointer-events-none" viewBox="0 0 256 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <style>{`
          @keyframes sfloat1 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-14px)} }
          @keyframes sfloat2 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-10px)} }
          @keyframes sfloat3 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-8px)} }
          @keyframes sdash   { to { stroke-dashoffset: -32; } }
          @keyframes sspin   { to { transform: rotate(360deg); } }
          .sf1 { animation: sfloat1 7s ease-in-out infinite; }
          .sf2 { animation: sfloat2 9s ease-in-out infinite 1.2s; }
          .sf3 { animation: sfloat3 8s ease-in-out infinite 0.6s; }
          .sline { stroke-dasharray: 4 4; animation: sdash 3s linear infinite; }
          .sring { transform-origin: center; animation: sspin 16s linear infinite; }
        `}</style>
      </defs>

      {}
      <g transform="translate(20,70)" opacity="0.10">
        <g className="sf2">
          <PersonGlyph x={0} y={0} />
          <PersonGlyph x={16} y={-6} scale={0.85} />
          <PersonGlyph x={32} y={2} scale={0.9} />
        </g>
      </g>

      {}
      <g transform="translate(150,40)" opacity="0.09">
        <g className="sf1">
          <rect x="0" y="0" width="70" height="7" rx="3.5" fill="#ff6196" />
          <rect x="14" y="14" width="50" height="7" rx="3.5" fill="#ff6196" />
          <rect x="4" y="28" width="60" height="7" rx="3.5" fill="#ff6196"/>
        </g>
      </g>

      {}
      <g transform="translate(45,280)" opacity="0.10">
        <g className="sring">
          <circle r="22" fill="none" stroke="#ff6196" strokeWidth="5" opacity="0.25" />
          <circle r="22" fill="none" stroke="#ff6196" strokeWidth="5" strokeDasharray="90 138" strokeLinecap="round" />
        </g>
      </g>

      {}
      <g transform="translate(165,300)" opacity="0.09">
        <g className="sf3">
          <PersonGlyph x={0} y={0} scale={0.9} />
          <rect x="40" y="-6" width="14" height="14" rx="3" fill="#ff6196" />
          <line className="sline" x1="10" y1="0" x2="38" y2="0" stroke="#ff6196" strokeWidth="1.4" />
        </g>
      </g>

      {}
      <g transform="translate(30,560)" opacity="0.09">
        <g className="sf2">
          <PersonGlyph x={0} y={0} scale={0.9} />
          <PersonGlyph x={18} y={4} />
          <PersonGlyph x={36} y={-4} scale={0.85} />
        </g>
      </g>

      {}
      <g transform="translate(150,620)" opacity="0.08">
        <g className="sf1">
          <rect x="0" y="0" width="56" height="7" rx="3.5" fill="#ff6196"/>
          <rect x="10" y="14" width="72" height="7" rx="3.5" fill="#ff6196"/>
        </g>
      </g>

      {}
      <g transform="translate(50,760)" opacity="0.08">
        <g className="sf3">
          <rect x="0" y="-6" width="14" height="14" rx="3" fill="#ff6196"/>
          <line className="sline" x1="14" y1="0" x2="42" y2="0" stroke="#ff6196" strokeWidth="1.4" />
          <PersonGlyph x={52} y={0} scale={0.85} />
        </g>
      </g>
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const { mobileOpen, setMobileOpen } = useSidebarContext();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  const showExpanded = open || mobileOpen;

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
      <aside
        className={cn(
          "relative h-full bg-sidebar flex flex-col border-r border-sidebar-border shadow-sm overflow-hidden",
          "fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:translate-x-0 md:z-auto md:transition-all",
          open ? "md:w-64" : "md:w-20"
        )}
      >
        <SidebarBackground />
        <div className="relative z-10 flex flex-col flex-1 h-full">
          <div className="px-3 min-h-14 flex items-center gap-2">
            {showExpanded ? (
              <Link href="/dashboard" className="flex-1 flex flex-col items-stretch justify-center min-w-0 py-4 gap-0 pl-3 pr-3 px-3">
                <Image src="/jman_logo.svg" alt="JMAN" width={80} height={20} className="h-5 w-auto object-contain mt-1" />
                <span className="leading-none select-none w-full text-right -mt-0.5 pr-10">
                  <span className="text-[14px] font-serif font-bold text-sidebar-foreground">Resource</span>
                  <span className="text-[12px] font-mono font-normal" style={{ color: "hsl(var(--primary))" }}>IQ</span>
                </span>
              </Link>
            ) : (
              <button onClick={() => setOpen(true)} className="flex-1 flex items-center justify-center" title="ResourceIQ — expand sidebar">
                <span className="leading-none select-none">
                  <span className="text-[15px] font-serif font-bold text-sidebar-foreground">R</span>
                  <span className="text-[13px] font-mono font-normal" style={{ color: "hsl(var(--primary))" }}>IQ</span>
                </span>
              </button>
            )}
            {showExpanded && (
              <button
                onClick={() => setMobileOpen(false)}
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground md:hidden"
                title="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {open && (
              <button
                onClick={() => setOpen(false)}
                className="hidden md:flex flex-shrink-0 p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin px-3 space-y-0.5">
            <NavLink link={TOP_LINK} open={showExpanded} isActive={pathname.startsWith(TOP_LINK.href)} />

            {NAV_GROUPS.map((group, gi) => (
              <div key={group.label}>
                {showExpanded && <div className={cn("border-t border-sidebar-border/50", gi === 0 ? "mt-3 mb-1" : "mt-2 mb-1")} />}
                <SectionLabel collapsed={!showExpanded}>{group.label}</SectionLabel>
                <div className="space-y-0.5">
                  {group.links.map((link) => (
                    <NavLink key={link.href} link={link} open={showExpanded} isActive={pathname.startsWith(link.href)} />
                  ))}
                </div>
              </div>
            ))}

            {showExpanded && <div className="my-3 border-t border-sidebar-border/50" />}

            <Link
              href="/buddy"
              title={showExpanded ? undefined : "Buddy"}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                showExpanded ? "justify-start" : "justify-center",
                pathname.startsWith("/buddy") ? "" : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
              style={
                pathname.startsWith("/buddy")
                  ? { backgroundColor: "hsl(var(--primary) / 0.10)", color: "hsl(var(--primary))", fontWeight: 600, borderLeft: "1px solid hsl(var(--primary))" }
                  : {}
              }
            >
              <Mascot className="w-3.5 h-3.5 flex-shrink-0" />
              {showExpanded && <span>Buddy</span>}
              {showExpanded && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ color: "#ff6196", backgroundColor: "rgba(255, 97, 150, 0.12)" }}>
                  Beta
                </span>
              )}
            </Link>
          </nav>

          <div className="border-t border-sidebar-border px-3 py-3">
            <div className={cn("flex items-center gap-2.5 px-2 py-2 rounded-lg", showExpanded ? "justify-start" : "justify-center")} title={showExpanded ? undefined : "Resource Manager — Admin"}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                style={{ backgroundColor: "#FF6196", color: "#FFF3E0" }}
              >
                RM
              </div>
              {showExpanded && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">Resource Manager</p>
                  <p className="text-[10px] leading-tight" style={{ color: "hsl(var(--primary))" }}>Admin</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
