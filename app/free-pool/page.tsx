"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type FreePoolCandidate } from "@/lib/api";
import { Badge } from "@/components/shared/Badge";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorState } from "@/components/shared/EmptyState";
import { StatCardGridSkeleton, ChipRowSkeleton, TableSkeleton, Skeleton } from "@/components/shared/Skeleton";
import { Modal } from "@/components/shared/Modal";
import { EmployeeProfileModal } from "@/components/shared/EmployeeProfileModal";
import { cn, formatUsd } from "@/lib/utils";

type Filter = "all" | "fully_free" | "under_utilized" | "ending_soon";
type Sort = "default" | "idle_value_desc" | "days_free_desc" | "employee_asc" | "designation_asc";

const REASON_LABEL: Record<string, string> = { fully_free: "fully free", under_utilized: "under-utilized", ending_soon: "ending soon" };
const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "default", label: "Default (status, then allocation %)" },
  { value: "idle_value_desc", label: "Idle value $/mo ↓" },
  { value: "days_free_desc", label: "Days free ↓" },
  { value: "employee_asc", label: "Employee A–Z" },
  { value: "designation_asc", label: "Designation A–Z" },
];

export default function FreePoolPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["free-pool"], queryFn: api.freePool });
  const [filter, setFilter] = useState<Filter>("all");
  const [coeFilter, setCoeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("default");
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [designationFilter, setDesignationFilter] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<FreePoolCandidate | null>(null);
  const [showAllDesignations, setShowAllDesignations] = useState(false);

  const coes = useMemo(() => Array.from(new Set((data ?? []).map((c) => c.primary_coe).filter((v): v is string => Boolean(v)))).sort(), [data]);

  const byDesignation = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data ?? []) {
      const key = c.job_name ?? "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = filter === "all" ? data : data.filter((c) => c.reason === filter);
    if (coeFilter !== "all") rows = rows.filter((c) => c.primary_coe === coeFilter);
    if (designationFilter) rows = rows.filter((c) => c.job_name === designationFilter);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((c) => [c.employee_id, c.job_name, c.location, c.primary_coe].some((v) => v?.toLowerCase().includes(q)));
    rows = [...rows];
    switch (sort) {
      case "idle_value_desc": rows.sort((a, b) => (b.idle_value_usd_per_month ?? -1) - (a.idle_value_usd_per_month ?? -1)); break;
      case "days_free_desc": rows.sort((a, b) => (b.days_free ?? -1) - (a.days_free ?? -1)); break;
      case "employee_asc": rows.sort((a, b) => a.employee_id.localeCompare(b.employee_id)); break;
      case "designation_asc": rows.sort((a, b) => (a.job_name ?? "").localeCompare(b.job_name ?? "")); break;
    }
    return rows;
  }, [data, filter, coeFilter, designationFilter, search, sort]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-3 w-80" />
        <StatCardGridSkeleton count={4} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" />
        <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
          <Skeleton className="h-3 w-56" />
          <ChipRowSkeleton count={14} />
        </div>
        <TableSkeleton columns={7} rows={10} />
      </div>
    );
  }
  if (error || !data) return <ErrorState message="Could not load the free pool." />;

  const counts = {
    fully_free: data.filter((c) => c.reason === "fully_free").length,
    under_utilized: data.filter((c) => c.reason === "under_utilized").length,
    ending_soon: data.filter((c) => c.reason === "ending_soon").length,
  };
  const totalIdleValue = data.reduce((s, c) => s + (c.idle_value_usd_per_month ?? 0), 0);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <p className="text-xs text-gray-500">
        Who has spare capacity right now. Click anyone to see their profile and matching open pipeline roles.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Fully Free" value={counts.fully_free} sub="no active allocation at all" color="green" />
        <StatCard label="Under-Utilized" value={counts.under_utilized} sub="below 70% total allocation" color="blue" />
        <StatCard label="Ending Soon" value={counts.ending_soon} sub="freeing up within 30 days" color="amber" />
        <StatCard
          label="Idle Capacity Value"
          value={formatUsd(totalIdleValue)}
          sub="illustrative rate card, per month"
          color={totalIdleValue > 0 ? "red" : "default"}
        />
      </div>

      {byDesignation.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
            By designation -- click to filter ({data.length} total across {byDesignation.length} designations)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(showAllDesignations ? byDesignation : byDesignation.slice(0, 14)).map(([name, count]) => (
              <button
                key={name}
                onClick={() => setDesignationFilter((cur) => (cur === name ? null : name))}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[11px] border",
                  designationFilter === name
                    ? "bg-primary text-white border-primary"
                    : "bg-gray-50 text-gray-600 border-gray-200 hover:border-primary hover:text-primary"
                )}
              >
                {name} <span className={designationFilter === name ? "text-white/70" : "text-gray-400"}>×{count}</span>
              </button>
            ))}
          </div>
          {byDesignation.length > 14 && (
            <button
              onClick={() => setShowAllDesignations((v) => !v)}
              className="mt-2 text-[11px] text-primary hover:underline"
            >
              {showAllDesignations ? "Show fewer" : `Show all ${byDesignation.length} designations`}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs font-medium">
          {(["all", "fully_free", "under_utilized", "ending_soon"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("px-4 py-1.5 rounded-full transition-all", filter === f ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600")}
            >
              {f === "all" ? "All" : REASON_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={coeFilter}
            onChange={(e) => setCoeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-gray-300"
          >
            <option value="all">All CoEs</option>
            {coes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="">Not determined</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-gray-300"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee, role, location, CoE…"
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs w-full sm:w-64 outline-none focus:border-gray-300"
          />
        </div>
      </div>

      <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] bg-white overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs data-table">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              {["Employee", "Designation", "CoE", "Location", "Status", "Detail", "Idle value /mo"].map((h) => (
                <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.employee_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => setSelectedEmployee(c.employee_id)} className="font-medium text-primary hover:underline flex items-center gap-1">
                    {c.employee_id}
                  </button>
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.job_name ?? "-"}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {c.primary_coe ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600 whitespace-nowrap">
                      {c.primary_coe}
                    </span>
                  ) : (
                    <span className="text-gray-300">not determined</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.location ?? "-"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Badge variant={c.reason === "ending_soon" ? "amber" : c.reason === "fully_free" ? "green" : "under_utilized"}>
                    {REASON_LABEL[c.reason]}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {c.reason === "ending_soon" && c.days_to_end != null && (
                    <>
                      {c.days_to_end}d left on {c.project_id}
                      {(c.ending_allocations?.length ?? 0) > 1 && (
                        <span className="text-amber-600"> +{(c.ending_allocations?.length ?? 1) - 1} more ending</span>
                      )}
                    </>
                  )}
                  {c.reason === "under_utilized" && c.current_allocation_pct != null && `${c.current_allocation_pct}% allocated`}
                  {c.reason === "fully_free" && (
                    <button onClick={() => setProofFor(c)} className="hover:underline">
                      {c.days_free != null ? `free for ${c.days_free}d` : "no allocation history"}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">
                  <button onClick={() => setProofFor(c)} className="hover:underline">
                    {c.idle_value_usd_per_month != null ? formatUsd(c.idle_value_usd_per_month) : <span className="text-gray-300 font-normal">non-billable</span>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && <p className="text-xs text-gray-400 italic text-center py-6">No one in the free pool matches these filters.</p>}
      </div>

      {selectedEmployee && (
        <EmployeeProfileModal
          employeeId={selectedEmployee}
          initialTab="redeploy_matches"
          showRedeployMatches
          onClose={() => setSelectedEmployee(null)}
        />
      )}
      {proofFor && <IdleValueProofModal c={proofFor} onClose={() => setProofFor(null)} />}
    </div>
  );
}

function IdleValueProofModal({ c, onClose }: { c: FreePoolCandidate; onClose: () => void }) {
  const endingAllocations = c.ending_allocations ?? [];
  const basisIntro =
    c.reason === "fully_free"
      ? "100% idle -- no active allocation at all right now."
      : c.reason === "under_utilized"
        ? `100% − current total allocation (${c.current_allocation_pct}%) = ${c.idle_capacity_pct}% idle right now, across every active project.`
        : `${c.idle_capacity_pct}% -- the sum of every allocation ending within the window (capped at 100%). Their current total allocation right now is ${c.current_allocation_pct}% -- any other concurrent, non-ending work is unaffected.`;

  return (
    <Modal title={`${c.employee_id} -- Availability Proof`} onClose={onClose} widthClassName="max-w-md">
      <div className="p-5 space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Designation</p>
            <p className="text-gray-700 font-medium">{c.job_name ?? "-"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Rate Card rate</p>
            <p className="text-gray-700 font-medium">{c.hourly_rate_usd != null ? `$${c.hourly_rate_usd}/hr (illustrative)` : "no rate -- non-billable role"}</p>
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Basis</p>
            <p className="text-gray-600">{basisIntro}</p>
          </div>
          {c.reason === "fully_free" && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Free since</p>
              <p className="text-gray-600">
                {c.days_free != null ? (
                  <>
                    Last allocation (<strong>{c.last_ended_project_id}</strong>) ended{" "}
                    <strong>{c.last_ended_date}</strong>, {c.days_free} day{c.days_free === 1 ? "" : "s"} ago -- nothing
                    new has been allocated since.
                  </>
                ) : (
                  "No allocation record exists for this employee at all -- never assigned to a project in this dataset."
                )}
              </p>
            </div>
          )}
          {endingAllocations.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left font-medium py-0.5">Project</th>
                  <th className="text-left font-medium py-0.5">Allocation %</th>
                  <th className="text-left font-medium py-0.5">Ends in</th>
                </tr>
              </thead>
              <tbody>
                {endingAllocations.map((a) => (
                  <tr key={a.project_id} className="border-t border-gray-200">
                    <td className="py-1 text-gray-700 font-medium">{a.project_id}</td>
                    <td className="py-1 text-gray-600">{a.allocation_pct}%</td>
                    <td className="py-1 text-gray-600">{a.days_to_end}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {c.hourly_rate_usd != null ? (
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400 mb-1">Formula</p>
            <p className="text-violet-700">
              {c.idle_capacity_pct}% × ${c.hourly_rate_usd}/hr × 160 standard monthly hours ={" "}
              <strong>{c.idle_value_usd_per_month != null ? formatUsd(c.idle_value_usd_per_month) : "-"}/month</strong>
            </p>
          </div>
        ) : (
          <p className="text-gray-400 italic">
            No $ figure shown -- {c.job_name} has no Rate Card rate (non-billable back-office role).
          </p>
        )}
      </div>
    </Modal>
  );
}
