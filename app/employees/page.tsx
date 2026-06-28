"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type EmployeeListRow } from "@/lib/api";
import { Badge } from "@/components/shared/Badge";
import { StatCard } from "@/components/shared/StatCard";
import { LoadingState, ErrorState } from "@/components/shared/EmptyState";
import { EmployeeProfileModal } from "@/components/shared/EmployeeProfileModal";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "active" | "departed" | "notice_period";
type Sort = "name_asc" | "alloc_desc" | "alloc_asc" | "join_desc" | "join_asc";

const STATUS_LABEL: Record<string, string> = { active: "active", departed: "departed", notice_period: "notice period" };
const STATUS_VARIANT: Record<string, string> = { active: "green", departed: "default", notice_period: "amber" };

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "name_asc", label: "Employee A–Z" },
  { value: "alloc_desc", label: "Allocation % ↓" },
  { value: "alloc_asc", label: "Allocation % ↑" },
  { value: "join_desc", label: "Newest joiners first" },
  { value: "join_asc", label: "Longest tenure first" },
];

export default function EmployeesPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["employees-list"], queryFn: api.employeesList });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [coeFilter, setCoeFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("name_asc");
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  const coes = useMemo(() => Array.from(new Set((data ?? []).map((e) => e.coe).filter((v): v is string => Boolean(v)))).sort(), [data]);
  const departments = useMemo(
    () => Array.from(new Set((data ?? []).map((e) => e.department_name).filter((v): v is string => Boolean(v)))).sort(),
    [data]
  );

  const counts = useMemo(() => {
    const rows = data ?? [];
    return {
      active: rows.filter((r) => r.status === "active").length,
      departed: rows.filter((r) => r.status === "departed").length,
      notice_period: rows.filter((r) => r.status === "notice_period").length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [r.employee_id, r.job_name, r.department_name, r.location, r.coe].some((v) => v?.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (coeFilter !== "all") rows = rows.filter((r) => (coeFilter === "" ? r.coe === null : r.coe === coeFilter));
    if (deptFilter !== "all") rows = rows.filter((r) => r.department_name === deptFilter);

    const sorted = [...rows];
    switch (sort) {
      case "name_asc":
        sorted.sort((a, b) => a.employee_id.localeCompare(b.employee_id));
        break;
      case "alloc_desc":
        sorted.sort((a, b) => (b.current_allocation_pct ?? -1) - (a.current_allocation_pct ?? -1));
        break;
      case "alloc_asc":
        sorted.sort((a, b) => (a.current_allocation_pct ?? 9999) - (b.current_allocation_pct ?? 9999));
        break;
      case "join_desc":
        sorted.sort((a, b) => (b.date_of_join ?? "").localeCompare(a.date_of_join ?? ""));
        break;
      case "join_asc":
        sorted.sort((a, b) => (a.date_of_join ?? "").localeCompare(b.date_of_join ?? ""));
        break;
    }
    return sorted;
  }, [data, search, statusFilter, coeFilter, deptFilter, sort]);

  const hasActiveFilters = search !== "" || statusFilter !== "all" || coeFilter !== "all" || deptFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCoeFilter("all");
    setDeptFilter("all");
  };

  if (isLoading) return <LoadingState label="Loading employees…" />;
  if (error || !data) return <ErrorState message="Could not load employees." />;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total" value={data.length} sub="ever on roster" />
        <StatCard
          label="Active"
          value={counts.active}
          color="green"
          onClick={() => setStatusFilter((v) => (v === "active" ? "all" : "active"))}
          active={statusFilter === "active"}
        />
        <StatCard
          label="In Notice Period"
          value={counts.notice_period}
          color={counts.notice_period > 0 ? "amber" : "default"}
          onClick={() => setStatusFilter((v) => (v === "notice_period" ? "all" : "notice_period"))}
          active={statusFilter === "notice_period"}
        />
        <StatCard
          label="Departed"
          value={counts.departed}
          onClick={() => setStatusFilter((v) => (v === "departed" ? "all" : "departed"))}
          active={statusFilter === "departed"}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">
            Employees ({filtered.length}/{data.length})
          </p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-[11px] text-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee, designation, department, location, CoE…"
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
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

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-xs data-table">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              {["Employee", "Designation", "Department", "Location", "CoE", "Status", "Allocation %", "Joined"].map((h) => (
                <th key={h} className="text-left font-medium px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.employee_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                <td className="px-3 py-2">
                  <button onClick={() => setSelectedEmployee(r.employee_id)} className="font-medium text-primary hover:underline">
                    {r.employee_id}
                  </button>
                </td>
                <td className="px-3 py-2 text-gray-500">{r.job_name ?? "-"}</td>
                <td className="px-3 py-2 text-gray-500">{r.department_name ?? "-"}</td>
                <td className="px-3 py-2 text-gray-500">{r.location ?? "-"}</td>
                <td className="px-3 py-2">
                  {r.coe ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600 whitespace-nowrap">
                      {r.coe}
                    </span>
                  ) : (
                    <span className="text-gray-300">not determined</span>
                  )}
                </td>
                <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                <td className="px-3 py-2 text-gray-500">{r.current_allocation_pct != null ? `${r.current_allocation_pct}%` : "-"}</td>
                <td className="px-3 py-2 text-gray-500">{r.date_of_join ?? "-"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className={cn("text-center text-xs text-gray-400 italic py-6")}>No employees match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedEmployee && (
        <EmployeeProfileModal employeeId={selectedEmployee} initialTab="overview" onClose={() => setSelectedEmployee(null)} />
      )}
    </div>
  );
}
