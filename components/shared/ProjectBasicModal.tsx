"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Modal } from "@/components/shared/Modal";
import { Badge } from "@/components/shared/Badge";
import { ErrorState } from "@/components/shared/EmptyState";
import { FieldGridSkeleton, TableSkeleton, Skeleton } from "@/components/shared/Skeleton";
import { TableControls } from "@/components/shared/TableControls";
import { TimesheetProofModal } from "@/components/shared/TimesheetProofModal";

interface ProjectBasicModalProps {
  projectCode: string;
  onClose: () => void;
}

type RosterSort = "start_desc" | "start_asc" | "employee_asc";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-gray-700 font-medium">{value}</p>
    </div>
  );
}

function hoursUtilizationBand(pct: number): "over_allocated" | "normal" | "under_utilized" {
  if (pct > 100) return "over_allocated";
  if (pct < 70) return "under_utilized";
  return "normal";
}

export function ProjectBasicModal({ projectCode, onClose }: ProjectBasicModalProps) {
  const info = useQuery({ queryKey: ["project-info", projectCode], queryFn: () => api.projectInfo(projectCode) });
  const roster = useQuery({ queryKey: ["roster", projectCode], queryFn: () => api.projectRoster(projectCode) });
  const allocations = useQuery({ queryKey: ["allocations"], queryFn: api.allocations });

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RosterSort>("start_desc");
  const [timesheetEmployee, setTimesheetEmployee] = useState<string | null>(null);

  const isLoading = info.isLoading || roster.isLoading;
  const hasError = info.error || roster.error;

  const current = (allocations.data ?? []).filter((a) => a.project_id === projectCode);

  let rosterRows = roster.data?.roster ?? [];
  const q = search.trim().toLowerCase();
  if (q) rosterRows = rosterRows.filter((r) => r.employee_id.toLowerCase().includes(q) || (r.job_name ?? "").toLowerCase().includes(q));
  rosterRows = [...rosterRows];
  switch (sort) {
    case "start_desc": rosterRows.sort((a, b) => (b.allocated_start_date ?? "").localeCompare(a.allocated_start_date ?? "")); break;
    case "start_asc": rosterRows.sort((a, b) => (a.allocated_start_date ?? "").localeCompare(b.allocated_start_date ?? "")); break;
    case "employee_asc": rosterRows.sort((a, b) => a.employee_id.localeCompare(b.employee_id)); break;
  }

  return (
    <Modal
      title={info.data ? `${projectCode} — ${info.data.client_id ?? "Unknown client"}` : projectCode}
      onClose={onClose}
      widthClassName="max-w-5xl"
    >
      <div className="p-5 space-y-5">
        {isLoading ? (
          <div className="space-y-5">
            <Skeleton className="h-10 w-full rounded-lg" />
            <FieldGridSkeleton count={4} />
            <div className="space-y-2">
              <Skeleton className="h-3 w-44" />
              <TableSkeleton columns={6} rows={4} />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-56" />
              <TableSkeleton columns={7} rows={5} />
            </div>
          </div>
        ) : hasError || !info.data ? (
          <ErrorState message="Could not load this project." />
        ) : (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              Not part of Health Monitor's active risk tracking (real project status:{" "}
              <span className="font-semibold">{info.data.project_status ?? "unknown"}</span>) — showing real roster and current
              allocations only, no root-cause scoring.
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Field label="Client" value={info.data.client_id ?? "-"} />
              <Field label="Type" value={info.data.type_of_project ?? "-"} />
              <Field label="Tech COE" value={info.data.tech_coe ?? "-"} />
              <Field label="Project window" value={`${info.data.project_start_date ?? "?"} → ${info.data.project_end_date ?? "?"}`} />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1.5">Current allocations ({current.length})</p>
              {current.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No current allocations on this project.</p>
              ) : (
                <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {["Employee", "Designation", "Status", "Alloc %", "Hours Util.", "Ends"].map((h) => (
                          <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {current.map((c, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="px-2.5 py-1.5 font-medium text-gray-700 whitespace-nowrap">{c.employee_id}</td>
                          <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{c.job_name ?? "-"}</td>
                          <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={c.resourcing_status}>{c.resourcing_status}</Badge></td>
                          <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{c.allocation_by_percentage}%</td>
                          <td className="px-2.5 py-1.5 whitespace-nowrap">
                            <button
                              onClick={() => setTimesheetEmployee(c.employee_id)}
                              className="flex items-center gap-1.5 hover:opacity-75 transition"
                              title={`${c.actual_hours_logged}h logged / ${c.expected_hours}h expected -- click for the real timesheet proof`}
                            >
                              {c.hours_data_available && c.hours_utilization_pct !== null ? (
                                <Badge variant={hoursUtilizationBand(c.hours_utilization_pct)}>{c.hours_utilization_pct}%</Badge>
                              ) : (
                                <span className="text-gray-300 underline">no data yet</span>
                              )}
                              {c.possible_unplanned_absence && <Badge variant="unbilled">quiet 14d+</Badge>}
                            </button>
                          </td>
                          <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{c.allocated_end_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1.5">
                Full roster ({rosterRows.length} of {roster.data?.roster.length ?? 0}) — every resource ever staffed, all-time
              </p>
              <TableControls
                search={{ value: search, onChange: setSearch, placeholder: "Search employee or designation…" }}
                sort={{
                  value: sort,
                  onChange: (v) => setSort(v as RosterSort),
                  options: [["start_desc", "Start date ↓ (latest first)"], ["start_asc", "Start date ↑"], ["employee_asc", "Employee A–Z"]],
                }}
              />
              <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["Employee", "Designation", "Status", "Alloc %", "Start", "End", "Active?"].map((h) => (
                        <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rosterRows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-2.5 py-1.5 font-medium text-gray-700 whitespace-nowrap">{r.employee_id}</td>
                        <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{r.job_name ?? "-"}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={r.resourcing_status}>{r.resourcing_status}</Badge></td>
                        <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{r.allocation_by_percentage}%</td>
                        <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{r.allocated_start_date ?? "-"}</td>
                        <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{r.allocated_end_date ?? "-"}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          {r.is_allocation_active ? <Badge variant="billable">Active</Badge> : <Badge variant="default">Past</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {rosterRows.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No roster rows match the current search.</p>}
              </div>
            </div>
          </>
        )}
      </div>
      {timesheetEmployee && (
        <TimesheetProofModal employeeId={timesheetEmployee} projectId={projectCode} onClose={() => setTimesheetEmployee(null)} />
      )}
    </Modal>
  );
}
