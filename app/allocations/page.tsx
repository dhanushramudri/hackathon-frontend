"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api, type AllocationRow } from "@/lib/api";
import { Badge } from "@/components/shared/Badge";
import { LoadingState, ErrorState } from "@/components/shared/EmptyState";
import { EmployeeProfileModal } from "@/components/shared/EmployeeProfileModal";
import { ProjectBasicModal } from "@/components/shared/ProjectBasicModal";
import { ProjectHealthDetailModal } from "@/components/health/ProjectHealthDetailModal";
import { TimesheetProofModal } from "@/components/shared/TimesheetProofModal";
import { cn } from "@/lib/utils";

type Tab = "resource" | "project";
type StatusFilter = string;
type BandFilter = "all" | "over_allocated" | "normal" | "under_utilized";
type HoursBandFilter = "all" | "over_allocated" | "normal" | "under_utilized" | "no_data";
type Sort =
  | "alloc_desc"
  | "alloc_asc"
  | "total_desc"
  | "hours_desc"
  | "hours_asc"
  | "ending_soonest"
  | "employee_asc"
  | "project_asc";

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "alloc_desc", label: "Alloc % ↓" },
  { value: "alloc_asc", label: "Alloc % ↑" },
  { value: "total_desc", label: "Total % ↓" },
  { value: "hours_desc", label: "Hours Util. ↓" },
  { value: "hours_asc", label: "Hours Util. ↑" },
  { value: "ending_soonest", label: "Ending soonest" },
  { value: "employee_asc", label: "Employee A–Z" },
  { value: "project_asc", label: "Project A–Z" },
];

function hoursUtilizationBand(pct: number): "over_allocated" | "normal" | "under_utilized" {
  if (pct > 100) return "over_allocated";
  if (pct < 70) return "under_utilized";
  return "normal";
}

interface FilterOptions {
  search: string;
  statusFilter: StatusFilter;
  bandFilter: BandFilter;
  hoursBandFilter: HoursBandFilter;
  coeFilter: string;
  typeFilter: string;
  absenceOnly: boolean;
  endingSoonOnly: boolean;
  sort: Sort;
}

function filterAndSortAllocations(rows: AllocationRow[], opts: FilterOptions): AllocationRow[] {
  let result = rows;

  const q = opts.search.trim().toLowerCase();
  if (q) {
    result = result.filter((r) =>
      [r.employee_id, r.job_name, r.project_id, r.location].some((v) => v?.toLowerCase().includes(q))
    );
  }
  if (opts.statusFilter !== "all") result = result.filter((r) => r.resourcing_status === opts.statusFilter);
  if (opts.bandFilter !== "all") result = result.filter((r) => r.utilization_band === opts.bandFilter);
  if (opts.hoursBandFilter !== "all") {
    if (opts.hoursBandFilter === "no_data") result = result.filter((r) => !r.hours_data_available);
    else result = result.filter((r) => r.hours_data_available && r.hours_utilization_pct !== null && hoursUtilizationBand(r.hours_utilization_pct) === opts.hoursBandFilter);
  }
  if (opts.coeFilter !== "all") {
    result = result.filter((r) => (opts.coeFilter === "" ? r.coe === null : r.coe === opts.coeFilter));
  }
  if (opts.typeFilter !== "all") result = result.filter((r) => r.type_of_project === opts.typeFilter);
  if (opts.absenceOnly) result = result.filter((r) => r.possible_unplanned_absence);
  if (opts.endingSoonOnly) result = result.filter((r) => r.ending_soon);

  const sorted = [...result];
  switch (opts.sort) {
    case "alloc_desc": sorted.sort((a, b) => b.allocation_by_percentage - a.allocation_by_percentage); break;
    case "alloc_asc": sorted.sort((a, b) => a.allocation_by_percentage - b.allocation_by_percentage); break;
    case "total_desc": sorted.sort((a, b) => b.employee_total_allocation_pct - a.employee_total_allocation_pct); break;
    case "hours_desc": sorted.sort((a, b) => (b.hours_utilization_pct ?? -1) - (a.hours_utilization_pct ?? -1)); break;
    case "hours_asc": sorted.sort((a, b) => (a.hours_utilization_pct ?? 9999) - (b.hours_utilization_pct ?? 9999)); break;
    case "ending_soonest": sorted.sort((a, b) => a.days_to_end - b.days_to_end); break;
    case "employee_asc": sorted.sort((a, b) => a.employee_id.localeCompare(b.employee_id)); break;
    case "project_asc": sorted.sort((a, b) => a.project_id.localeCompare(b.project_id)); break;
  }
  return sorted;
}

export default function AllocationsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <AllocationsPageInner />
    </Suspense>
  );
}

function AllocationsPageInner() {
  const { data, isLoading, error } = useQuery({ queryKey: ["allocations"], queryFn: api.allocations });
  const healthProjects = useQuery({ queryKey: ["health-projects"], queryFn: api.healthProjects });
  const [tab, setTab] = useState<Tab>("resource");
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [bandFilter, setBandFilter] = useState<BandFilter>("all");
  const [hoursBandFilter, setHoursBandFilter] = useState<HoursBandFilter>("all");
  const [coeFilter, setCoeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [absenceOnly, setAbsenceOnly] = useState(false);
  const [endingSoonOnly, setEndingSoonOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("alloc_desc");

  useEffect(() => {
    if (searchParams.get("endingSoon") === "true") setEndingSoonOnly(true);
    const band = searchParams.get("band");
    if (band === "over_allocated" || band === "normal" || band === "under_utilized") setBandFilter(band);
  }, []);

  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedTimesheet, setSelectedTimesheet] = useState<{ employeeId: string; projectId: string } | null>(null);

  const healthTrackedProjects = useMemo(
    () => new Set((healthProjects.data ?? []).map((p) => p.project_code)),
    [healthProjects.data]
  );

  const statuses = useMemo(() => Array.from(new Set((data ?? []).map((r) => r.resourcing_status))).sort(), [data]);
  const coes = useMemo(() => Array.from(new Set((data ?? []).map((r) => r.coe).filter((v): v is string => Boolean(v)))).sort(), [data]);
  const types = useMemo(() => Array.from(new Set((data ?? []).map((r) => r.type_of_project).filter((v): v is string => Boolean(v)))).sort(), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return filterAndSortAllocations(data, { search, statusFilter, bandFilter, hoursBandFilter, coeFilter, typeFilter, absenceOnly, endingSoonOnly, sort });
  }, [data, search, statusFilter, bandFilter, hoursBandFilter, coeFilter, typeFilter, absenceOnly, endingSoonOnly, sort]);

  const hasActiveFilters =
    search !== "" || statusFilter !== "all" || bandFilter !== "all" || hoursBandFilter !== "all" ||
    coeFilter !== "all" || typeFilter !== "all" || absenceOnly || endingSoonOnly;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setBandFilter("all");
    setHoursBandFilter("all");
    setCoeFilter("all");
    setTypeFilter("all");
    setAbsenceOnly(false);
    setEndingSoonOnly(false);
  };

  if (isLoading) return <LoadingState label="Loading allocations…" />;
  if (error) return <ErrorState message="Could not load allocations." />;

  const byProject = groupBy(filtered, (r) => r.project_id);

  const openProject = (projectId: string) => setSelectedProject(projectId);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs font-medium">
          {(["resource", "project"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("px-4 py-1.5 rounded-full transition-all capitalize", tab === t ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600")}
            >
              By {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          {filtered.length} of {data?.length ?? 0} allocation(s)
          {hasActiveFilters && (
            <button onClick={clearFilters} className="ml-2 text-primary hover:underline">
              Clear filters
            </button>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee, project, location…"
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value as BandFilter)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">All utilization</option>
            <option value="over_allocated">Over-allocated</option>
            <option value="normal">Normal</option>
            <option value="under_utilized">Under-utilized</option>
          </select>
          <select
            value={hoursBandFilter}
            onChange={(e) => setHoursBandFilter(e.target.value as HoursBandFilter)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">All hours util.</option>
            <option value="over_allocated">Hours: over</option>
            <option value="normal">Hours: normal</option>
            <option value="under_utilized">Hours: under</option>
            <option value="no_data">Hours: no data yet</option>
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
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">All project types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            onClick={() => setAbsenceOnly((v) => !v)}
            className={cn(
              "text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
              absenceOnly ? "bg-amber-50 border-amber-200 text-amber-700" : "border-gray-200 text-gray-500"
            )}
          >
            Possible absence only
          </button>
          <button
            onClick={() => setEndingSoonOnly((v) => !v)}
            className={cn(
              "text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
              endingSoonOnly ? "bg-amber-50 border-amber-200 text-amber-700" : "border-gray-200 text-gray-500"
            )}
          >
            Ending soon only
          </button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 ml-auto"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {tab === "resource" ? (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-xs data-table">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                {["Employee", "Designation", "Location", "Project", "Billing", "Alloc %", "Total %", "Utilization", "Hours Util.", "Ends", "Soon?"].map((h) => (
                  <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <ResourceRow
                  key={`${r.employee_id}-${r.project_id}`}
                  row={r}
                  onOpenEmployee={() => setSelectedEmployee(r.employee_id)}
                  onOpenProject={() => openProject(r.project_id)}
                  onOpenTimesheet={() => setSelectedTimesheet({ employeeId: r.employee_id, projectId: r.project_id })}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-xs text-gray-400 italic py-6">No allocations match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(byProject).map(([projectId, rows]) => (
            <div key={projectId} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-700 flex items-center gap-2">
                <button onClick={() => openProject(projectId)} className="text-primary hover:underline" title="View full project detail">
                  {projectId}
                </button>
                <span className="text-gray-400 font-normal">· {rows.length} resources</span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-xs data-table">
                <tbody>
                  {rows.map((r) => (
                    <ResourceRow
                      key={`${r.employee_id}-${r.project_id}`}
                      row={r}
                      hideProject
                      onOpenEmployee={() => setSelectedEmployee(r.employee_id)}
                      onOpenProject={() => openProject(r.project_id)}
                      onOpenTimesheet={() => setSelectedTimesheet({ employeeId: r.employee_id, projectId: r.project_id })}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ))}
          {Object.keys(byProject).length === 0 && (
            <p className="text-center text-xs text-gray-400 italic py-6">No allocations match the current filters.</p>
          )}
        </div>
      )}

      {selectedEmployee && <EmployeeProfileModal employeeId={selectedEmployee} initialTab="overview" onClose={() => setSelectedEmployee(null)} />}
      {selectedProject &&
        (healthTrackedProjects.has(selectedProject) ? (
          <ProjectHealthDetailModal projectCode={selectedProject} onClose={() => setSelectedProject(null)} />
        ) : (
          <ProjectBasicModal projectCode={selectedProject} onClose={() => setSelectedProject(null)} />
        ))}
      {selectedTimesheet && (
        <TimesheetProofModal
          employeeId={selectedTimesheet.employeeId}
          projectId={selectedTimesheet.projectId}
          onClose={() => setSelectedTimesheet(null)}
        />
      )}
    </div>
  );
}

function ResourceRow({
  row,
  hideProject,
  onOpenEmployee,
  onOpenProject,
  onOpenTimesheet,
}: {
  row: AllocationRow;
  hideProject?: boolean;
  onOpenEmployee: () => void;
  onOpenProject: () => void;
  onOpenTimesheet: () => void;
}) {
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
      <td className="px-3 py-2 whitespace-nowrap">
        <button onClick={onOpenEmployee} className="font-medium text-primary hover:underline" title="View full employee proof">
          {row.employee_id}
        </button>
      </td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.job_name ?? "-"}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.location ?? "-"}</td>
      {!hideProject && (
        <td className="px-3 py-2 whitespace-nowrap">
          <button onClick={onOpenProject} className="text-primary hover:underline" title="View full project detail">
            {row.project_id}
          </button>
        </td>
      )}
      <td className="px-3 py-2 whitespace-nowrap"><Badge variant={row.resourcing_status}>{row.resourcing_status}</Badge></td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.allocation_by_percentage}%</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.employee_total_allocation_pct}%</td>
      <td className="px-3 py-2 whitespace-nowrap"><Badge variant={row.utilization_band}>{row.utilization_band.replace("_", " ")}</Badge></td>
      <td className="px-3 py-2 whitespace-nowrap">
        <button
          onClick={onOpenTimesheet}
          className="flex items-center gap-1.5 hover:opacity-75 transition"
          title={`${row.actual_hours_logged}h logged / ${row.expected_hours}h expected -- click for the real timesheet proof`}
        >
          {row.hours_data_available && row.hours_utilization_pct !== null ? (
            <Badge variant={hoursUtilizationBand(row.hours_utilization_pct)}>{row.hours_utilization_pct}%</Badge>
          ) : (
            <span className="text-gray-300 underline">no data yet</span>
          )}
          {row.possible_unplanned_absence && <Badge variant="unbilled">quiet 14d+</Badge>}
        </button>
      </td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.allocated_end_date}</td>
      <td className="px-3 py-2 whitespace-nowrap">{row.ending_soon && <Badge variant="amber">{row.days_to_end}d</Badge>}</td>
    </tr>
  );
}

function groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}
