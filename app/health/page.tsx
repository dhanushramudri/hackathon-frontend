"use client";

import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api, type HealthProject } from "@/lib/api";
import { Badge } from "@/components/shared/Badge";
import { StatCard } from "@/components/shared/StatCard";
import { LoadingState, ErrorState } from "@/components/shared/EmptyState";
import { StatCardGridSkeleton, TableSkeleton } from "@/components/shared/Skeleton";
import { ProjectHealthDetailModal } from "@/components/health/ProjectHealthDetailModal";
import { cn, formatUsd, rootCauseLabel, ROOT_CAUSE_LABEL } from "@/lib/utils";

type RiskFilter = "all" | "high" | "medium" | "low";
type WsrFilter = "all" | "RED" | "AMBER" | "GREEN" | "no_report" | "has_report";
type RevenuePeriod = "day" | "week" | "month";

function convertRevenue(monthly: number, period: RevenuePeriod): number {
  if (period === "day") return monthly / 30;
  if (period === "week") return (monthly / 30) * 7;
  return monthly;
}
type HealthSort =
  | "risk_desc"
  | "overrun_desc"
  | "unbilled_desc"
  | "churn_desc"
  | "headcount_desc"
  | "headcount_asc"
  | "rampdown_asc"
  | "project_asc"
  | "client_asc";

const ROOT_CAUSES: { value: string; label: string }[] = Object.entries(ROOT_CAUSE_LABEL).map(([value, label]) => ({ value, label }));

const SORT_OPTIONS: { value: HealthSort; label: string }[] = [
  { value: "risk_desc", label: "Sort: highest risk first" },
  { value: "overrun_desc", label: "Sort: most overrun days" },
  { value: "unbilled_desc", label: "Sort: highest $ at risk" },
  { value: "churn_desc", label: "Sort: highest churn" },
  { value: "headcount_desc", label: "Sort: largest team" },
  { value: "headcount_asc", label: "Sort: smallest team" },
  { value: "rampdown_asc", label: "Sort: ending soonest" },
  { value: "project_asc", label: "Sort: project A–Z" },
  { value: "client_asc", label: "Sort: client A–Z" },
];

interface HealthFilterOptions {
  search: string;
  riskFilter: RiskFilter;
  rootCauseFilter: string;
  typeFilter: string;
  coeFilter: string;
  wsrFilter: WsrFilter;
  understaffedOnly: boolean;
  rampDownOnly: boolean;
  hasUnbilledValueOnly: boolean;
  sort: HealthSort;
}

function filterAndSortHealth(rows: HealthProject[], opts: HealthFilterOptions): HealthProject[] {
  let result = rows;

  const q = opts.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (p) =>
        p.project_code.toLowerCase().includes(q) ||
        (p.client_id ?? "").toLowerCase().includes(q) ||
        p.type_of_project.toLowerCase().includes(q) ||
        (p.tech_coe ?? "").toLowerCase().includes(q)
    );
  }
  if (opts.riskFilter !== "all") result = result.filter((p) => p.risk_band === opts.riskFilter);
  if (opts.rootCauseFilter !== "all") result = result.filter((p) => p.root_causes.includes(opts.rootCauseFilter));
  if (opts.typeFilter !== "all") result = result.filter((p) => p.type_of_project === opts.typeFilter);
  if (opts.coeFilter !== "all") {
    result = result.filter((p) => (opts.coeFilter === "" ? p.coe === null : p.coe === opts.coeFilter));
  }
  if (opts.wsrFilter === "no_report") result = result.filter((p) => !p.wsr_data_available);
  else if (opts.wsrFilter === "has_report") result = result.filter((p) => p.wsr_data_available);
  else if (opts.wsrFilter !== "all") result = result.filter((p) => p.wsr_latest_signal === opts.wsrFilter);
  if (opts.understaffedOnly) result = result.filter((p) => p.is_understaffed);
  if (opts.rampDownOnly) result = result.filter((p) => p.is_ramp_down_candidate);
  if (opts.hasUnbilledValueOnly) result = result.filter((p) => p.monthly_unbilled_value_usd > 0);

  const sorted = [...result];
  switch (opts.sort) {
    case "risk_desc":
      sorted.sort((a, b) => b.risk_score - a.risk_score);
      break;
    case "overrun_desc":
      sorted.sort((a, b) => (b.overrun_days ?? -Infinity) - (a.overrun_days ?? -Infinity));
      break;
    case "unbilled_desc":
      sorted.sort((a, b) => b.monthly_unbilled_value_usd - a.monthly_unbilled_value_usd);
      break;
    case "churn_desc":
      sorted.sort((a, b) => (b.churn_per_month ?? -Infinity) - (a.churn_per_month ?? -Infinity));
      break;
    case "headcount_desc":
      sorted.sort((a, b) => b.n_employees - a.n_employees);
      break;
    case "headcount_asc":
      sorted.sort((a, b) => a.n_employees - b.n_employees);
      break;
    case "rampdown_asc":
      sorted.sort((a, b) => (a.days_to_ramp_down ?? Infinity) - (b.days_to_ramp_down ?? Infinity));
      break;
    case "project_asc":
      sorted.sort((a, b) => a.project_code.localeCompare(b.project_code));
      break;
    case "client_asc":
      sorted.sort((a, b) => (a.client_id ?? "").localeCompare(b.client_id ?? ""));
      break;
  }
  return sorted;
}

export default function HealthPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <HealthPageInner />
    </Suspense>
  );
}

function HealthPageInner() {
  const projects = useQuery({ queryKey: ["health-projects"], queryFn: api.healthProjects });
  const validation = useQuery({ queryKey: ["health-validation"], queryFn: api.healthValidation });
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [rootCauseFilter, setRootCauseFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [coeFilter, setCoeFilter] = useState("all");
  const [wsrFilter, setWsrFilter] = useState<WsrFilter>("all");
  const [understaffedOnly, setUnderstaffedOnly] = useState(false);
  const [rampDownOnly, setRampDownOnly] = useState(false);
  const [hasUnbilledValueOnly, setHasUnbilledValueOnly] = useState(false);
  const [revenueBreakdownOpen, setRevenueBreakdownOpen] = useState(false);
  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>("month");
  const [sort, setSort] = useState<HealthSort>("risk_desc");

  useEffect(() => {
    const risk = searchParams.get("risk");
    if (risk === "high" || risk === "medium" || risk === "low") setRiskFilter(risk);
    if (searchParams.get("understaffed") === "true") setUnderstaffedOnly(true);
    if (searchParams.get("wsr") === "has_report") setWsrFilter("has_report");
    if (searchParams.get("revenue") === "true") {
      setHasUnbilledValueOnly(true);
      setRevenueBreakdownOpen(true);
    }
  }, []);

  const toggleRiskFilter = (band: "high" | "medium" | "low") => {
    setRiskFilter((current) => (current === band ? "all" : band));
  };
  const toggleWsrHasReport = () => {
    setWsrFilter((current) => (current === "has_report" ? "all" : "has_report"));
  };
  const toggleRevenue = () => {
    setHasUnbilledValueOnly((v) => {
      const next = !v;
      setRevenueBreakdownOpen(next);
      return next;
    });
  };

  if (projects.isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <StatCardGridSkeleton count={3} className="grid grid-cols-1 sm:grid-cols-3 gap-4" />
        <StatCardGridSkeleton count={3} className="grid grid-cols-1 sm:grid-cols-3 gap-4" />
        <TableSkeleton columns={9} rows={10} />
      </div>
    );
  }
  if (projects.error) return <ErrorState message="Could not load health data." />;

  const data = projects.data ?? [];
  const types = Array.from(new Set(data.map((p) => p.type_of_project))).sort();
  const coes = Array.from(new Set(data.map((p) => p.coe).filter((v): v is string => Boolean(v)))).sort();

  const filtered = filterAndSortHealth(data, {
    search, riskFilter, rootCauseFilter, typeFilter, coeFilter, wsrFilter, understaffedOnly, rampDownOnly, hasUnbilledValueOnly, sort,
  });

  const hasActiveFilters =
    search !== "" ||
    riskFilter !== "all" ||
    rootCauseFilter !== "all" ||
    typeFilter !== "all" ||
    coeFilter !== "all" ||
    wsrFilter !== "all" ||
    understaffedOnly ||
    rampDownOnly ||
    hasUnbilledValueOnly;

  const clearFilters = () => {
    setSearch("");
    setRiskFilter("all");
    setRootCauseFilter("all");
    setTypeFilter("all");
    setCoeFilter("all");
    setWsrFilter("all");
    setUnderstaffedOnly(false);
    setRampDownOnly(false);
    setHasUnbilledValueOnly(false);
    setRevenueBreakdownOpen(false);
  };

  const counts = {
    high: data.filter((p) => p.risk_band === "high").length,
    medium: data.filter((p) => p.risk_band === "medium").length,
    low: data.filter((p) => p.risk_band === "low").length,
  };
  const understaffedCount = data.filter((p) => p.is_understaffed).length;
  const totalUnbilledValue = data.reduce((sum, p) => sum + p.monthly_unbilled_value_usd, 0);
  const unbilledProjects = [...data]
    .filter((p) => p.monthly_unbilled_value_usd > 0)
    .sort((a, b) => b.monthly_unbilled_value_usd - a.monthly_unbilled_value_usd);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="High Risk"
          value={counts.high}
          color="red"
          onClick={() => toggleRiskFilter("high")}
          active={riskFilter === "high"}
        />
        <StatCard
          label="Medium Risk"
          value={counts.medium}
          color="amber"
          onClick={() => toggleRiskFilter("medium")}
          active={riskFilter === "medium"}
        />
        <StatCard
          label="Low Risk"
          value={counts.low}
          color="green"
          onClick={() => toggleRiskFilter("low")}
          active={riskFilter === "low"}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Understaffed"
          value={understaffedCount}
          sub="below 75% of expected headcount"
          color={understaffedCount > 0 ? "amber" : "default"}
          onClick={() => setUnderstaffedOnly((v) => !v)}
          active={understaffedOnly}
        />
        <RevenueRiskCard
          totalMonthly={totalUnbilledValue}
          period={revenuePeriod}
          onPeriodChange={setRevenuePeriod}
          active={hasUnbilledValueOnly}
          onToggle={toggleRevenue}
        />
        <StatCard
          label="Validated vs Real WSR"
          value={validation.data?.derived_risk_agrees_with_wsr_pct != null ? `${validation.data.derived_risk_agrees_with_wsr_pct}%` : "-"}
          sub={validation.data ? `${validation.data.projects_with_real_wsr} projects had real WSR data` : undefined}
          onClick={toggleWsrHasReport}
          active={wsrFilter === "has_report"}
        />
      </div>

      {revenueBreakdownOpen && (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-3.5 space-y-2">
          <p className="text-[11px] text-gray-500">
            Projected unbilled value for the selected period (allocation % × hourly rate × 160 monthly hours).
          </p>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left font-medium px-3 py-1.5 whitespace-nowrap">Project</th>
                  <th className="text-left font-medium px-3 py-1.5 whitespace-nowrap">Client</th>
                  <th className="text-right font-medium px-3 py-1.5 whitespace-nowrap">$ at risk / {revenuePeriod}</th>
                </tr>
              </thead>
              <tbody>
                {unbilledProjects.map((p) => (
                  <tr key={p.project_code} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <button onClick={() => setSelectedProject(p.project_code)} className="font-medium text-primary hover:underline">
                        {p.project_code}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{p.client_id ?? "-"}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700 whitespace-nowrap">
                      {formatUsd(convertRevenue(p.monthly_unbilled_value_usd, revenuePeriod))}
                    </td>
                  </tr>
                ))}
                {unbilledProjects.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-xs text-gray-400 italic py-4">No projects currently have unbilled value at risk.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">
            Projects ({filtered.length}/{data.length})
          </p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-[11px] text-primary hover:underline">
              Clear filters
            </button>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as HealthSort)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 ml-auto"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search project, client, type, tech COE…"
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
        />

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs font-medium">
            {(["all", "high", "medium", "low"] as RiskFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setRiskFilter(f)}
                className={cn(
                  "px-3 py-1 rounded-full transition-all capitalize",
                  riskFilter === f ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <select
            value={rootCauseFilter}
            onChange={(e) => setRootCauseFilter(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">All root causes</option>
            {ROOT_CAUSES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">All project types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={coeFilter}
            onChange={(e) => setCoeFilter(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">All CoEs</option>
            {coes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="">Not determined</option>
          </select>
          <select
            value={wsrFilter}
            onChange={(e) => setWsrFilter(e.target.value as WsrFilter)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">All WSR</option>
            <option value="RED">Latest WSR: RED</option>
            <option value="AMBER">Latest WSR: AMBER</option>
            <option value="GREEN">Latest WSR: GREEN</option>
            <option value="no_report">No WSR report</option>
          </select>
          <button
            onClick={() => setUnderstaffedOnly((v) => !v)}
            className={cn(
              "text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
              understaffedOnly ? "bg-amber-50 border-amber-200 text-amber-700" : "border-gray-200 text-gray-500"
            )}
          >
            Understaffed only
          </button>
          <button
            onClick={() => setRampDownOnly((v) => !v)}
            className={cn(
              "text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
              rampDownOnly ? "bg-amber-50 border-amber-200 text-amber-700" : "border-gray-200 text-gray-500"
            )}
          >
            Ramp-down only
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs data-table">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              {["Project", "Client", "Type", "Team (actual/expected)", "Risk", "Root Causes", "Unbilled $/mo", "Real WSR (latest)", "Ramp-down?"].map((h) => (
                <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.project_code} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <button
                    onClick={() => setSelectedProject(p.project_code)}
                    className="font-medium text-primary hover:underline"
                    title="View full proof & allocation detail"
                  >
                    {p.project_code}
                  </button>
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.client_id ?? "-"}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.type_of_project}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {p.n_employees} / {p.expected_headcount ?? "?"}
                  {p.is_understaffed && <Badge variant="amber">understaffed</Badge>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap"><Badge variant={p.risk_band}>{p.risk_band}</Badge></td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.root_causes.map(rootCauseLabel).join(", ") || "-"}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.monthly_unbilled_value_usd > 0 ? formatUsd(p.monthly_unbilled_value_usd) : "-"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {p.wsr_latest_signal ? (
                      <span title={`Most recent real WSR report. Worst ever recorded for this project: ${p.wsr_worst_signal ?? "n/a"}.`}>
                        <Badge variant={p.wsr_latest_signal}>{p.wsr_latest_signal}</Badge>
                      </span>
                    ) : (
                      <span className="text-gray-300">no report</span>
                    )}
                    {p.wsr_trend && (
                      <span
                        title={`WSR trend: ${p.wsr_trend}`}
                        className={cn(
                          "text-xs font-semibold",
                          p.wsr_trend === "deteriorating" ? "text-red-500" : p.wsr_trend === "improving" ? "text-emerald-500" : "text-gray-300"
                        )}
                      >
                        {p.wsr_trend === "deteriorating" ? "↓" : p.wsr_trend === "improving" ? "↑" : "→"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{p.is_ramp_down_candidate && <Badge variant="amber">{p.days_to_ramp_down}d</Badge>}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-xs text-gray-400 italic py-6">No projects match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {selectedProject && (
        <ProjectHealthDetailModal projectCode={selectedProject} onClose={() => setSelectedProject(null)} />
      )}
    </div>
  );
}

function RevenueRiskCard({
  totalMonthly,
  period,
  onPeriodChange,
  active,
  onToggle,
}: {
  totalMonthly: number;
  period: RevenuePeriod;
  onPeriodChange: (p: RevenuePeriod) => void;
  active: boolean;
  onToggle: () => void;
}) {
  const value = convertRevenue(totalMonthly, period);
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        totalMonthly > 0 ? "bg-red-50 border-red-200 text-red-900" : "bg-white border-gray-200 text-gray-900",
        active && "ring-2 ring-red-300"
      )}
    >
      <button type="button" onClick={onToggle} className="w-full text-left group">
        <p className="text-xs font-medium text-gray-500 mb-1">Unbilled Value at Risk</p>
        <p className="text-2xl font-bold leading-tight">{formatUsd(value)}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          rate card, per {period}
          {active && " · click to hide breakdown"}
        </p>
      </button>
      <div className="flex items-center gap-1 mt-2">
        {(["day", "week", "month"] as RevenuePeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full border capitalize transition",
              p === period ? "bg-white border-red-300 text-red-700 font-medium" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
