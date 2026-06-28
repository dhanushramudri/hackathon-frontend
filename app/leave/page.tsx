"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { api, type LeaveImpact } from "@/lib/api";
import { Badge } from "@/components/shared/Badge";
import { StatCard } from "@/components/shared/StatCard";
import { LoadingState, ErrorState } from "@/components/shared/EmptyState";
import { StatCardGridSkeleton, TableSkeleton } from "@/components/shared/Skeleton";
import { TableControls } from "@/components/shared/TableControls";
import { EmployeeProfileModal } from "@/components/shared/EmployeeProfileModal";
import { ProjectBasicModal } from "@/components/shared/ProjectBasicModal";
import { ProjectHealthDetailModal } from "@/components/health/ProjectHealthDetailModal";

type LeaveTypeFilter = "all" | "Planned" | "Sick" | "Emergency";
type Sort = "start_asc" | "start_desc" | "employee_asc" | "project_asc" | "alloc_desc";

const REASON_VARIANT: Record<string, string> = { ending_soon: "amber", fully_free: "green", under_utilized: "under_utilized" };

interface FilterOptions {
  search: string;
  onLeaveOnly: boolean;
  noBackfillOnly: boolean;
  leaveType: LeaveTypeFilter;
  project: string;
  coe: string;
  sort: Sort;
}

function filterAndSortLeave(rows: LeaveImpact[], opts: FilterOptions): LeaveImpact[] {
  let result = rows;

  const q = opts.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (i) =>
        i.employee_id.toLowerCase().includes(q) ||
        (i.job_name ?? "").toLowerCase().includes(q) ||
        i.project_id.toLowerCase().includes(q)
    );
  }
  if (opts.onLeaveOnly) result = result.filter((i) => i.is_currently_on_leave);
  if (opts.noBackfillOnly) result = result.filter((i) => !i.backfill_available);
  if (opts.leaveType !== "all") result = result.filter((i) => i.leave_type === opts.leaveType);
  if (opts.project !== "all") result = result.filter((i) => i.project_id === opts.project);
  if (opts.coe !== "all") result = result.filter((i) => (opts.coe === "" ? i.coe === null : i.coe === opts.coe));

  const sorted = [...result];
  switch (opts.sort) {
    case "start_asc":
      sorted.sort((a, b) => (Number(b.is_currently_on_leave) - Number(a.is_currently_on_leave)) || a.leave_start_date.localeCompare(b.leave_start_date));
      break;
    case "start_desc":
      sorted.sort((a, b) => b.leave_start_date.localeCompare(a.leave_start_date));
      break;
    case "employee_asc":
      sorted.sort((a, b) => a.employee_id.localeCompare(b.employee_id));
      break;
    case "project_asc":
      sorted.sort((a, b) => a.project_id.localeCompare(b.project_id));
      break;
    case "alloc_desc":
      sorted.sort((a, b) => b.allocation_by_percentage - a.allocation_by_percentage);
      break;
  }
  return sorted;
}

export default function LeavePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <LeavePageInner />
    </Suspense>
  );
}

function LeavePageInner() {
  const { data, isLoading, error } = useQuery({ queryKey: ["leave-impact"], queryFn: api.leaveImpact });
  const healthProjects = useQuery({ queryKey: ["health-projects"], queryFn: api.healthProjects });
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [onLeaveOnly, setOnLeaveOnly] = useState(false);
  const [noBackfillOnly, setNoBackfillOnly] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveTypeFilter>("all");
  const [project, setProject] = useState("all");
  const [coe, setCoe] = useState("all");
  const [sort, setSort] = useState<Sort>("start_asc");

  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("onLeaveNow") === "true") setOnLeaveOnly(true);
  }, []);

  const healthTrackedProjects = useMemo(
    () => new Set((healthProjects.data ?? []).map((p) => p.project_code)),
    [healthProjects.data]
  );

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <StatCardGridSkeleton count={3} className="grid grid-cols-1 sm:grid-cols-3 gap-4" />
        <TableSkeleton columns={8} rows={8} />
      </div>
    );
  }
  if (error || !data) return <ErrorState message="Could not load leave impact." />;

  const onLeaveNow = data.filter((i) => i.is_currently_on_leave);
  const noBackfill = data.filter((i) => !i.backfill_available);
  const projects = Array.from(new Set(data.map((i) => i.project_id))).sort();
  const coes = Array.from(new Set(data.map((i) => i.coe).filter((v): v is string => Boolean(v)))).sort();

  const filtered = filterAndSortLeave(data, { search, onLeaveOnly, noBackfillOnly, leaveType, project, coe, sort });

  const hasActiveFilters = search !== "" || onLeaveOnly || noBackfillOnly || leaveType !== "all" || project !== "all" || coe !== "all";
  const clearFilters = () => {
    setSearch("");
    setOnLeaveOnly(false);
    setNoBackfillOnly(false);
    setLeaveType("all");
    setProject("all");
    setCoe("all");
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Currently On Leave"
          value={onLeaveNow.length}
          color="amber"
          onClick={() => setOnLeaveOnly((v) => !v)}
          active={onLeaveOnly}
        />
        <StatCard label="Total Impacted Allocations" value={data.length} sub="ongoing + upcoming, next 45 days" />
        <StatCard
          label="No Backfill Available"
          value={noBackfill.length}
          color={noBackfill.length > 0 ? "red" : "default"}
          onClick={() => setNoBackfillOnly((v) => !v)}
          active={noBackfillOnly}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">
            Leave Impact ({filtered.length}/{data.length})
          </p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-[11px] text-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>
        <TableControls
          search={{ value: search, onChange: setSearch, placeholder: "Search employee, designation, project…" }}
          filters={[
            {
              value: leaveType,
              onChange: (v) => setLeaveType(v as LeaveTypeFilter),
              options: [["all", "All leave types"], ["Planned", "Planned"], ["Sick", "Sick"], ["Emergency", "Emergency"]],
            },
            {
              value: project,
              onChange: setProject,
              options: [["all", "All projects"], ...projects.map((p) => [p, p] as [string, string])],
            },
            {
              value: coe,
              onChange: setCoe,
              options: [["all", "All CoEs"], ...coes.map((c) => [c, c] as [string, string]), ["", "Not determined"]],
            },
          ]}
          toggles={[{ active: noBackfillOnly, onToggle: () => setNoBackfillOnly((v) => !v), label: "No backfill only" }]}
          sort={{
            value: sort,
            onChange: (v) => setSort(v as Sort),
            options: [
              ["start_asc", "Most urgent first"],
              ["start_desc", "Leave start ↓"],
              ["employee_asc", "Employee A–Z"],
              ["project_asc", "Project A–Z"],
              ["alloc_desc", "Alloc % ↓"],
            ],
          }}
        />
      </div>

      <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] bg-white overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs data-table">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              {["Employee", "Designation", "Leave Type", "Dates", "Status", "Project", "Alloc %", "Backfill"].map((h) => (
                <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((i, idx) => (
              <tr key={`${i.employee_id}-${i.project_id}-${idx}`} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                <td className="px-3 py-2 font-medium whitespace-nowrap">
                  <button onClick={() => setSelectedEmployee(i.employee_id)} className="text-primary hover:underline">
                    {i.employee_id}
                  </button>
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{i.job_name ?? "-"}</td>
                <td className="px-3 py-2 whitespace-nowrap"><Badge variant={i.leave_type === "Emergency" ? "red" : i.leave_type === "Sick" ? "amber" : "default"}>{i.leave_type}</Badge></td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{i.leave_start_date} → {i.leave_end_date}</td>
                <td className="px-3 py-2 whitespace-nowrap">{i.is_currently_on_leave ? <Badge variant="red">on leave now</Badge> : <Badge variant="amber">upcoming</Badge>}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => setSelectedProject(i.project_id)} className="text-primary hover:underline">
                    {i.project_id}
                  </button>
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{i.allocation_by_percentage}%</td>
                <td className="px-3 py-2">
                  {i.backfill_available ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      {i.backfill_candidates.map((c) => (
                        <button
                          key={c.employee_id}
                          onClick={() => setSelectedEmployee(c.employee_id)}
                          className="inline-flex items-center gap-1 hover:opacity-75 transition"
                          title={`Same designation (${i.job_name ?? "?"}), real Free Pool match -- click for the full profile`}
                        >
                          <span className="text-gray-700 font-medium">{c.employee_id}</span>
                          <Badge variant={REASON_VARIANT[c.reason] ?? "default"}>
                            {c.reason === "fully_free" && "free"}
                            {c.reason === "ending_soon" && `${c.days_to_end}d left`}
                            {c.reason === "under_utilized" && `${c.current_allocation_pct}% alloc`}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500"><AlertTriangle className="w-3 h-3" /> none free</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400 italic">No leave records match the current filters.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {selectedEmployee && (
        <EmployeeProfileModal employeeId={selectedEmployee} initialTab="leave" onClose={() => setSelectedEmployee(null)} />
      )}
      {selectedProject &&
        (healthTrackedProjects.has(selectedProject) ? (
          <ProjectHealthDetailModal projectCode={selectedProject} onClose={() => setSelectedProject(null)} />
        ) : (
          <ProjectBasicModal projectCode={selectedProject} onClose={() => setSelectedProject(null)} />
        ))}
    </div>
  );
}
