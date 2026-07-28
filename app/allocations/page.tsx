"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api, type AllocationRow } from "@/lib/api";
import { Badge } from "@/components/shared/Badge";
import { LoadingState, ErrorState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/shared/Skeleton";
import { EmployeeProfileModal } from "@/components/shared/EmployeeProfileModal";
import { ProjectBasicModal } from "@/components/shared/ProjectBasicModal";
import { ProjectHealthDetailModal } from "@/components/health/ProjectHealthDetailModal";
import { TimesheetProofModal } from "@/components/shared/TimesheetProofModal";
import { cn } from "@/lib/utils";

type Tab = "resource" | "project" | "availability";
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

type AvailStatusFilter = "all" | "fully_free" | "partially_free";
type AvailMinFilter = "all" | "100" | "75" | "50" | "25";
type AvailSort = "available_desc" | "available_asc" | "employee_asc";

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

const AVAIL_SORT_OPTIONS: { value: AvailSort; label: string }[] = [
  { value: "available_desc", label: "Available % ↓" },
  { value: "available_asc", label: "Available % ↑" },
  { value: "employee_asc", label: "Employee A–Z" },
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
  dateFrom: string;
  dateTo: string;
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
  // Overlap test (active-during), not an exact-date match.
  if (opts.dateFrom) result = result.filter((r) => r.allocated_end_date >= opts.dateFrom);
  if (opts.dateTo) result = result.filter((r) => r.allocated_start_date <= opts.dateTo);

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

interface AvailRow {
  employee_id: string;
  job_name: string | null;
  location: string | null;
  available_pct: number;
  is_fully_free: boolean;
  current_projects: { project_id: string; allocation_by_percentage: number }[];
}

interface AvailFilterOptions {
  search: string;
  designationFilter: string;
  locationFilter: string;
  statusFilter: AvailStatusFilter;
  minAvailable: AvailMinFilter;
  projectSearch: string;
  sort: AvailSort;
}

function filterAndSortAvailability<T extends AvailRow>(rows: T[], opts: AvailFilterOptions): T[] {
  let result = rows;

  const q = opts.search.trim().toLowerCase();
  if (q) {
    result = result.filter((r) =>
      [r.employee_id, r.job_name, r.location].some((v) => v?.toLowerCase().includes(q))
    );
  }
  if (opts.designationFilter !== "all") {
    result = result.filter((r) => (opts.designationFilter === "" ? r.job_name === null : r.job_name === opts.designationFilter));
  }
  if (opts.locationFilter !== "all") {
    result = result.filter((r) => (opts.locationFilter === "" ? r.location === null : r.location === opts.locationFilter));
  }
  if (opts.statusFilter !== "all") {
    result = result.filter((r) => (opts.statusFilter === "fully_free" ? r.is_fully_free : !r.is_fully_free));
  }
  if (opts.minAvailable !== "all") {
    const threshold = Number(opts.minAvailable);
    result = result.filter((r) => r.available_pct >= threshold);
  }
  const pq = opts.projectSearch.trim().toLowerCase();
  if (pq) {
    result = result.filter((r) => r.current_projects.some((p) => p.project_id.toLowerCase().includes(pq)));
  }

  const sorted = [...result];
  switch (opts.sort) {
    case "available_desc": sorted.sort((a, b) => b.available_pct - a.available_pct); break;
    case "available_asc": sorted.sort((a, b) => a.available_pct - b.available_pct); break;
    case "employee_asc": sorted.sort((a, b) => a.employee_id.localeCompare(b.employee_id)); break;
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const [availDate, setAvailDate] = useState(todayStr);
  const availability = useQuery({
    queryKey: ["availability", availDate],
    queryFn: () => api.availability(availDate),
    enabled: tab === "availability",
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [bandFilter, setBandFilter] = useState<BandFilter>("all");
  const [hoursBandFilter, setHoursBandFilter] = useState<HoursBandFilter>("all");
  const [coeFilter, setCoeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [absenceOnly, setAbsenceOnly] = useState(false);
  const [endingSoonOnly, setEndingSoonOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<Sort>("alloc_desc");

  // Availability-tab-specific filters
  const [availDesignationFilter, setAvailDesignationFilter] = useState<string>("all");
  const [availLocationFilter, setAvailLocationFilter] = useState<string>("all");
  const [availStatusFilter, setAvailStatusFilter] = useState<AvailStatusFilter>("all");
  const [availMinFilter, setAvailMinFilter] = useState<AvailMinFilter>("all");
  const [availProjectSearch, setAvailProjectSearch] = useState("");
  const [availSort, setAvailSort] = useState<AvailSort>("available_desc");

  useEffect(() => {
    if (searchParams.get("endingSoon") === "true") setEndingSoonOnly(true);
    const band = searchParams.get("band");
    if (band === "over_allocated" || band === "normal" || band === "under_utilized") setBandFilter(band);
  }, []);

  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedTimesheet, setSelectedTimesheet] = useState<{ employeeId: string; projectId: string } | null>(null);
  const [selectedAvailabilityRow, setSelectedAvailabilityRow] = useState<{
    employee_id: string;
    current_projects: { project_id: string; allocation_by_percentage: number }[];
  } | null>(null);

  const healthTrackedProjects = useMemo(
    () => new Set((healthProjects.data ?? []).map((p) => p.project_code)),
    [healthProjects.data]
  );

  const statuses = useMemo(() => Array.from(new Set((data ?? []).map((r) => r.resourcing_status))).sort(), [data]);
  const coes = useMemo(() => Array.from(new Set((data ?? []).map((r) => r.coe).filter((v): v is string => Boolean(v)))).sort(), [data]);
  const types = useMemo(() => Array.from(new Set((data ?? []).map((r) => r.type_of_project).filter((v): v is string => Boolean(v)))).sort(), [data]);

  const availDesignations = useMemo(
    () => Array.from(new Set((availability.data ?? []).map((r) => r.job_name).filter((v): v is string => Boolean(v)))).sort(),
    [availability.data]
  );
  const availLocations = useMemo(
    () => Array.from(new Set((availability.data ?? []).map((r) => r.location).filter((v): v is string => Boolean(v)))).sort(),
    [availability.data]
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    return filterAndSortAllocations(data, {
      search, statusFilter, bandFilter, hoursBandFilter, coeFilter, typeFilter, absenceOnly, endingSoonOnly, dateFrom, dateTo, sort,
    });
  }, [data, search, statusFilter, bandFilter, hoursBandFilter, coeFilter, typeFilter, absenceOnly, endingSoonOnly, dateFrom, dateTo, sort]);

  const filteredAvailability = useMemo(() => {
    if (!availability.data) return [];
    return filterAndSortAvailability(availability.data, {
      search,
      designationFilter: availDesignationFilter,
      locationFilter: availLocationFilter,
      statusFilter: availStatusFilter,
      minAvailable: availMinFilter,
      projectSearch: availProjectSearch,
      sort: availSort,
    });
  }, [availability.data, search, availDesignationFilter, availLocationFilter, availStatusFilter, availMinFilter, availProjectSearch, availSort]);

  const hasActiveFilters =
    tab === "availability"
      ? search !== "" || availDesignationFilter !== "all" || availLocationFilter !== "all" ||
        availStatusFilter !== "all" || availMinFilter !== "all" || availProjectSearch !== ""
      : search !== "" || statusFilter !== "all" || bandFilter !== "all" || hoursBandFilter !== "all" ||
        coeFilter !== "all" || typeFilter !== "all" || absenceOnly || endingSoonOnly || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setBandFilter("all");
    setHoursBandFilter("all");
    setCoeFilter("all");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setAbsenceOnly(false);
    setEndingSoonOnly(false);
    setAvailDesignationFilter("all");
    setAvailLocationFilter("all");
    setAvailStatusFilter("all");
    setAvailMinFilter("all");
    setAvailProjectSearch("");
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <TableSkeleton columns={11} rows={10} />
      </div>
    );
  }
  if (error) return <ErrorState message="Could not load allocations." />;

  const byProject = groupBy(filtered, (r) => r.project_id);

  const openProject = (projectId: string) => setSelectedProject(projectId);

const avgAvailablePct = useMemo(() => {
  if (!availability.data || availability.data.length === 0) return 0;
  const sum = availability.data.reduce((acc, r) => acc + r.available_pct, 0);
  return Math.round((sum / availability.data.length) * 10) / 10;
}, [availability.data]);


  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs font-medium">
          {(["resource", "project", "availability"] as Tab[]).map((t) => (
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
          {tab === "availability"
          ? `${filteredAvailability.length} of ${availability.data?.length ?? 0} employees`
          : `${filtered.length} of ${data?.length ?? 0} allocation(s)`}
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

        {tab === "availability" ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={availDesignationFilter}
              onChange={(e) => setAvailDesignationFilter(e.target.value)}
              className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
            >
              <option value="all">All designations</option>
              {availDesignations.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
              <option value="">Not set</option>
            </select>
            <select
              value={availLocationFilter}
              onChange={(e) => setAvailLocationFilter(e.target.value)}
              className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
            >
              <option value="all">All locations</option>
              {availLocations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
              <option value="">Not set</option>
            </select>
            <select
              value={availStatusFilter}
              onChange={(e) => setAvailStatusFilter(e.target.value as AvailStatusFilter)}
              className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
            >
              <option value="all">All statuses</option>
              <option value="fully_free">Fully free</option>
              <option value="partially_free">Partially free</option>
            </select>
            <select
              value={availMinFilter}
              onChange={(e) => setAvailMinFilter(e.target.value as AvailMinFilter)}
              className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
            >
              <option value="all">Any availability</option>
              <option value="100">100% available</option>
              <option value="75">75%+ available</option>
              <option value="50">50%+ available</option>
              <option value="25">25%+ available</option>
            </select>
            <input
              value={availProjectSearch}
              onChange={(e) => setAvailProjectSearch(e.target.value)}
              placeholder="Filter by current project…"
              className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 w-40"
            />
            <select
              value={availSort}
              onChange={(e) => setAvailSort(e.target.value as AvailSort)}
              className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 ml-auto"
            >
              {AVAIL_SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ) : (
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
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 whitespace-nowrap">Active during</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
              />
              <span className="text-[10px] text-gray-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
              />
            </div>
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
        )}
      </div>

      {tab === "resource" ? (
        <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] bg-white overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-xs data-table">
            <thead className="bg-secondary text-secondary-foreground">
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
      ) : tab === "project" ?  (
        <div className="space-y-3">
          {Object.entries(byProject).map(([projectId, rows]) => (
            <div key={projectId} className="rounded-xl border border-[hsl(var(--primary)/0.3)] bg-white overflow-hidden">
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
      ) : null}

      {tab === "availability" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Show availability as of</span>
            <input
              type="date"
              value={availDate}
              min={todayStr}
              onChange={(e) => setAvailDate(e.target.value < todayStr ? todayStr : e.target.value)}
              className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
            />
            <span className="text-xs text-gray-400">
            · {filteredAvailability.length} of {availability.data?.length ?? 0} employees shown
            {availability.data && availability.data.length > 0 && (
              <> · avg {avgAvailablePct}% free as of {availDate}</>
            )}
          </span>
          </div>
          {availability.isLoading ? (
            <TableSkeleton columns={6} rows={8} />
          ) : availability.error ? (
            <ErrorState message="Could not load availability." />
          ) : (
            <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs data-table">
                  <thead className="bg-secondary text-secondary-foreground">
                    <tr>
                      {["Employee", "Designation", "Location", "Available %", "Status", "Current projects"].map((h) => (
                        <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAvailability.map((r) => (
                      <tr key={r.employee_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button onClick={() => setSelectedEmployee(r.employee_id)} className="font-medium text-primary hover:underline">
                            {r.employee_id}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.job_name ?? "-"}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.location ?? "-"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.available_pct}%</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.is_fully_free ? <Badge variant="green">Fully free</Badge> : <Badge variant="amber">Partially free</Badge>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {r.current_projects.length === 0 ? (
                            "-"
                          ) : (
                            <button
                              onClick={() => setSelectedAvailabilityRow(r)}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              {r.current_projects.length} project{r.current_projects.length > 1 ? "s" : ""}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredAvailability.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center text-xs text-gray-400 italic py-6">
                          {availability.data?.length === 0 ? "No employees found." : "No employees match the current filters."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
      {selectedAvailabilityRow && (
        <CurrentProjectsModal
          employeeId={selectedAvailabilityRow.employee_id}
          projects={selectedAvailabilityRow.current_projects}
          onOpenProject={openProject}
          onClose={() => setSelectedAvailabilityRow(null)}
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
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
        {row.employee_total_allocation_pct}%
        {row.over_allocated_due_to_internal && (
          <span
            className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700"
            title={`Includes +${row.employee_internal_allocation_pct}% internal-project work; client-only allocation is ${row.employee_client_allocation_pct}%, at or under capacity.`}
          >
            incl. internal
          </span>
        )}
      </td>
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

function CurrentProjectsModal({
  employeeId,
  projects,
  onOpenProject,
  onClose,
}: {
  employeeId: string;
  projects: { project_id: string; allocation_by_percentage: number }[];
  onOpenProject: (projectId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {employeeId} <span className="text-gray-400 font-normal">· current projects</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">
            ×
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
          {projects.map((p) => (
            <button
              key={p.project_id}
              onClick={() => {
                onClose();
                onOpenProject(p.project_id);
              }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-gray-50/70 transition text-left"
            >
              <span className="font-medium text-primary hover:underline">{p.project_id}</span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">
                {p.allocation_by_percentage}%
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}