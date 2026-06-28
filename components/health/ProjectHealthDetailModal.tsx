"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ProjectHealthDetail, type WsrReportRow } from "@/lib/api";
import { Modal } from "@/components/shared/Modal";
import { Badge } from "@/components/shared/Badge";
import { ErrorState } from "@/components/shared/EmptyState";
import { ModalBodySkeleton } from "@/components/shared/Skeleton";
import { TableControls } from "@/components/shared/TableControls";
import { FiredBadge } from "@/components/shared/FiredBadge";
import { cn, formatUsd } from "@/lib/utils";

type DetailTab = "overview" | "allocations" | "staffing" | "overtime" | "wsr";

interface ProjectHealthDetailModalProps {
  projectCode: string;
  onClose: () => void;
}

const TABS: { key: DetailTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "allocations", label: "Allocations" },
  { key: "staffing", label: "Staffing & Cost" },
  { key: "overtime", label: "Overtime & Effort" },
  { key: "wsr", label: "WSR Reports" },
];

export function ProjectHealthDetailModal({ projectCode, onClose }: ProjectHealthDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const detail = useQuery({
    queryKey: ["health-detail", projectCode],
    queryFn: () => api.healthProjectDetail(projectCode),
  });

  return (
    <Modal
      title={detail.data ? `${projectCode} — ${detail.data.client_id ?? "Unknown client"}` : projectCode}
      onClose={onClose}
      widthClassName="max-w-6xl"
    >
      <div className="flex border-b border-gray-100 px-5 sticky top-0 bg-white z-10 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition whitespace-nowrap",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {detail.isLoading ? (
          <ModalBodySkeleton />
        ) : detail.error ? (
          <ErrorState message="Could not load this project's detail." />
        ) : detail.data ? (
          <>
            {tab === "overview" && <OverviewTab d={detail.data} />}
            {tab === "allocations" && <AllocationsTab d={detail.data} />}
            {tab === "staffing" && <StaffingTab d={detail.data} />}
            {tab === "overtime" && <OvertimeTab d={detail.data} />}
            {tab === "wsr" && <WsrTab d={detail.data} />}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-gray-700 font-medium">{value}</p>
    </div>
  );
}

function ragSequence(reports: WsrReportRow[]): string {
  return reports.length ? reports.map((r) => r.worst_signal).join(", ") : "no reports";
}

function OverviewTab({ d }: { d: ProjectHealthDetail }) {
  const recentReports = d.wsr.reports.slice(-d.wsr.recent_n);
  const priorReports = d.wsr.reports.slice(-d.wsr.min_reports_required, -d.wsr.recent_n);
  const baselineReports = d.wsr.reports.slice(0, d.wsr.recent_n);

  const rows: { key: string; label: string; fired: boolean; detail: string }[] = [
    {
      key: "overrunning",
      label: "Overrunning",
      fired: d.overrun.fired,
      detail:
        d.overrun.overrun_days != null
          ? `${d.overrun.overrun_days}d past project end (${d.overrun.project_end_date ?? "?"}) — threshold >${d.overrun.threshold_days}d`
          : "no allocation runs past the project end date",
    },
    {
      key: "shadow_heavy",
      label: "Shadow-heavy",
      fired: d.shadow_heavy.fired,
      detail:
        d.shadow_heavy.shadow_unbilled_share != null
          ? `${Math.round(d.shadow_heavy.shadow_unbilled_share * 100)}% of allocation rows are shadow/unbilled — threshold >${Math.round(d.shadow_heavy.threshold_share * 100)}%`
          : "-",
    },
    {
      key: "high_churn",
      label: "High churn",
      fired: d.high_churn.fired,
      detail:
        d.high_churn.churn_per_month != null
          ? `About ${d.high_churn.churn_per_month} different people rotate through this project each month — more than similar projects, which typically see up to ${d.high_churn.cohort_p75_threshold}/month`
          : "-",
    },
    {
      key: "understaffed",
      label: "Understaffed",
      fired: d.understaffed.fired,
      detail: `${d.understaffed.actual_headcount_all_time} actual vs. ${d.understaffed.expected_headcount ?? "?"} expected headcount — threshold ${Math.round(d.understaffed.ratio_threshold * 100)}% of expected`,
    },
    {
      key: "overtime_risk",
      label: "Overtime risk",
      fired: d.overtime_risk.fired,
      detail: `${d.overtime_risk.overtime_employee_count} active employee(s) logging >${d.overtime_risk.daily_threshold_hours}h on ${d.overtime_risk.sustained_min_days}+ of the last ${d.overtime_risk.window_days} days`,
    },
    {
      key: "effort_spike",
      label: "Effort spike",
      fired: d.effort_spike.fired,
      detail:
        d.effort_spike.weekly_hours.length > 0
          ? `latest week ${d.effort_spike.weekly_hours[d.effort_spike.weekly_hours.length - 1].hours}h logged — threshold >${d.effort_spike.ratio_threshold}x the trailing ${d.effort_spike.min_baseline_weeks}-week average`
          : "no timesheet history for this project",
    },
    {
      key: "wsr_deteriorating",
      label: "WSR getting worse",
      fired: d.wsr.fired_deteriorating,
      detail: d.wsr.trend
        ? `Last ${d.wsr.recent_n} reports: ${ragSequence(recentReports)} — vs. the ${d.wsr.recent_n} before that: ${ragSequence(priorReports)}`
        : `not enough real WSR history (need ${d.wsr.min_reports_required}+ reports)`,
    },
    {
      key: "wsr_critical",
      label: "WSR stuck at red/amber",
      fired: d.wsr.fired_critical,
      detail:
        d.wsr.recent_avg_severity != null
          ? `Last ${d.wsr.critical_min_reports_required} reports: ${ragSequence(recentReports)} — none green`
          : `not enough real WSR history (need ${d.wsr.critical_min_reports_required}+ reports)`,
    },
    {
      key: "wsr_long_term_decline",
      label: "WSR fell and hasn't recovered",
      fired: d.wsr.fired_long_term_decline,
      detail:
        d.wsr.baseline_avg_severity != null
          ? `Now: ${ragSequence(recentReports)} — when reporting started: ${ragSequence(baselineReports)}. Still worse than where it began, even if that fall happened before the recent-trend window above.`
          : `not enough real WSR history (need ${d.wsr.long_term_min_reports_required}+ reports)`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Field label="Client" value={d.client_id ?? "-"} />
        <Field label="Type" value={d.type_of_project} />
        <Field label="Tech COE" value={d.tech_coe ?? "-"} />
        <Field label="Project window" value={`${d.project_start_date ?? "?"} → ${d.project_end_date ?? "?"}`} />
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={d.risk_band}>{d.risk_band} risk</Badge>
        <span className="text-xs text-gray-400">{d.risk_score} of {rows.length} tracked root causes are flagged</span>
      </div>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Root cause</th>
              <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Status</th>
              <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Actual vs. threshold</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-50 last:border-0">
                <td className="px-2.5 py-2 text-gray-700 font-medium whitespace-nowrap">{r.label}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">
                  <FiredBadge fired={r.fired} />
                </td>
                <td className="px-2.5 py-2 text-gray-500 whitespace-nowrap">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

type AllocSort = "start_desc" | "start_asc" | "end_desc" | "end_asc" | "pct_desc" | "pct_asc" | "employee_asc";

function AllocationsTab({ d }: { d: ProjectHealthDetail }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sort, setSort] = useState<AllocSort>("start_desc");

  if (d.allocations_roster.length === 0) {
    return <p className="text-sm text-gray-400 italic">No allocation history for this project.</p>;
  }

  const statuses = Array.from(new Set(d.allocations_roster.map((r) => r.resourcing_status))).sort();

  let rows = d.allocations_roster;
  const q = search.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.employee_id.toLowerCase().includes(q) || (r.job_name ?? "").toLowerCase().includes(q));
  if (statusFilter !== "all") rows = rows.filter((r) => r.resourcing_status === statusFilter);
  if (activeOnly) rows = rows.filter((r) => r.is_allocation_active);

  rows = [...rows];
  switch (sort) {
    case "start_desc":
      rows.sort(
        (a, b) =>
          (b.allocated_start_date ?? "").localeCompare(a.allocated_start_date ?? "") ||
          (b.allocated_end_date ?? "").localeCompare(a.allocated_end_date ?? "") ||
          Number(b.is_allocation_active) - Number(a.is_allocation_active)
      );
      break;
    case "start_asc": rows.sort((a, b) => (a.allocated_start_date ?? "").localeCompare(b.allocated_start_date ?? "")); break;
    case "end_desc": rows.sort((a, b) => (b.allocated_end_date ?? "").localeCompare(a.allocated_end_date ?? "")); break;
    case "end_asc": rows.sort((a, b) => (a.allocated_end_date ?? "").localeCompare(b.allocated_end_date ?? "")); break;
    case "pct_desc": rows.sort((a, b) => b.allocation_by_percentage - a.allocation_by_percentage); break;
    case "pct_asc": rows.sort((a, b) => a.allocation_by_percentage - b.allocation_by_percentage); break;
    case "employee_asc": rows.sort((a, b) => a.employee_id.localeCompare(b.employee_id)); break;
  }

  return (
    <div>
      <TableControls
        search={{ value: search, onChange: setSearch, placeholder: "Search employee or designation…" }}
        filters={[{ value: statusFilter, onChange: setStatusFilter, options: [["all", "All statuses"], ...statuses.map((s) => [s, s] as [string, string])] }]}
        toggles={[{ active: activeOnly, onToggle: () => setActiveOnly((v) => !v), label: "Active only" }]}
        sort={{
          value: sort,
          onChange: (v) => setSort(v as AllocSort),
          options: [
            ["start_desc", "Start date ↓ (latest first)"],
            ["start_asc", "Start date ↑"],
            ["end_desc", "End date ↓"],
            ["end_asc", "End date ↑"],
            ["pct_desc", "Allocation % ↓"],
            ["pct_asc", "Allocation % ↑"],
            ["employee_asc", "Employee A–Z"],
          ],
        }}
      />
      <div className="rounded-xl border border-gray-200 overflow-hidden">
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
            {rows.map((r, i) => (
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
        {rows.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No allocations match the current filters.</p>}
      </div>
    </div>
  );
}

type ShadowSort = "value_desc" | "value_asc" | "pct_desc" | "employee_start_asc";
type RoleMixSort = "gap_desc" | "designation_asc" | "expected_desc" | "actual_active_desc" | "prevalence_desc" | "headcount_desc";

function fteToPct(fte: number): number {
  return Math.round(fte * 100);
}

function StaffingTab({ d }: { d: ProjectHealthDetail }) {
  const [shadowSearch, setShadowSearch] = useState("");
  const [shadowStatus, setShadowStatus] = useState("all");
  const [shadowSort, setShadowSort] = useState<ShadowSort>("value_desc");

  const [roleSearch, setRoleSearch] = useState("");
  const [roleSort, setRoleSort] = useState<RoleMixSort>("gap_desc");
  const [showAllRoles, setShowAllRoles] = useState(false);

  const shadowStatuses = Array.from(new Set(d.shadow_heavy.qualifying_allocations.map((q) => q.resourcing_status))).sort();
  let shadowRows = d.shadow_heavy.qualifying_allocations;
  const sq = shadowSearch.trim().toLowerCase();
  if (sq) shadowRows = shadowRows.filter((q) => q.employee_id.toLowerCase().includes(sq) || (q.job_name ?? "").toLowerCase().includes(sq));
  if (shadowStatus !== "all") shadowRows = shadowRows.filter((q) => q.resourcing_status === shadowStatus);
  shadowRows = [...shadowRows];
  switch (shadowSort) {
    case "value_desc": shadowRows.sort((a, b) => b.monthly_unbilled_value_usd - a.monthly_unbilled_value_usd); break;
    case "value_asc": shadowRows.sort((a, b) => a.monthly_unbilled_value_usd - b.monthly_unbilled_value_usd); break;
    case "pct_desc": shadowRows.sort((a, b) => b.allocation_by_percentage - a.allocation_by_percentage); break;
    case "employee_start_asc":
      shadowRows.sort((a, b) => a.employee_id.localeCompare(b.employee_id) || (a.allocated_start_date ?? "").localeCompare(b.allocated_start_date ?? ""));
      break;
  }

  const expectedByDesignation = new Map(d.understaffed.expected_roles.map((r) => [r.designation, r]));
  const actualHeadcountByRole = d.understaffed.actual_headcount_active_now_by_role;
  const actualFteByRole = d.understaffed.actual_fte_active_now_by_role;
  const allRoles = Array.from(
    new Set([
      ...d.understaffed.expected_roles.map((r) => r.designation),
      ...Object.keys(actualHeadcountByRole),
      ...Object.keys(d.understaffed.headcount_all_time_by_role),
    ])
  );
  const expectedHeadcountFor = (role: string) => {
    const r = expectedByDesignation.get(role);
    return r?.common ? r.headcount : 0;
  };
  const gapFor = (role: string) => expectedHeadcountFor(role) - (actualHeadcountByRole[role] ?? 0);
  const isShortFor = (role: string) => {
    const expected = expectedHeadcountFor(role);
    return expected > 0 && (actualHeadcountByRole[role] ?? 0) < expected * d.understaffed.ratio_threshold;
  };

  let roleRows = allRoles;
  const rq = roleSearch.trim().toLowerCase();
  if (rq) roleRows = roleRows.filter((r) => r.toLowerCase().includes(rq));
  if (!showAllRoles) {
    roleRows = roleRows.filter(
      (r) => expectedByDesignation.get(r)?.common || (actualHeadcountByRole[r] ?? 0) > 0 || (d.understaffed.headcount_all_time_by_role[r] ?? 0) > 0
    );
  }
  roleRows = [...roleRows];
  switch (roleSort) {
    case "gap_desc": roleRows.sort((a, b) => gapFor(b) - gapFor(a)); break;
    case "designation_asc": roleRows.sort((a, b) => a.localeCompare(b)); break;
    case "expected_desc": roleRows.sort((a, b) => expectedHeadcountFor(b) - expectedHeadcountFor(a)); break;
    case "actual_active_desc": roleRows.sort((a, b) => (actualHeadcountByRole[b] ?? 0) - (actualHeadcountByRole[a] ?? 0)); break;
    case "prevalence_desc": roleRows.sort((a, b) => (expectedByDesignation.get(b)?.prevalence_pct ?? -1) - (expectedByDesignation.get(a)?.prevalence_pct ?? -1)); break;
    case "headcount_desc": roleRows.sort((a, b) => (d.understaffed.headcount_all_time_by_role[b] ?? 0) - (d.understaffed.headcount_all_time_by_role[a] ?? 0)); break;
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-gray-700">Shadow / Unbilled allocations</p>
          <FiredBadge fired={d.shadow_heavy.fired} />
        </div>
        {d.shadow_heavy.qualifying_allocations.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No shadow/unbilled allocations on this project.</p>
        ) : (
          <>
            <TableControls
              search={{ value: shadowSearch, onChange: setShadowSearch, placeholder: "Search employee or designation…" }}
              filters={[{ value: shadowStatus, onChange: setShadowStatus, options: [["all", "All statuses"], ...shadowStatuses.map((s) => [s, s] as [string, string])] }]}
              sort={{
                value: shadowSort,
                onChange: (v) => setShadowSort(v as ShadowSort),
                options: [
                  ["value_desc", "$/mo ↓"],
                  ["value_asc", "$/mo ↑"],
                  ["pct_desc", "Allocation % ↓"],
                  ["employee_start_asc", "Employee, then by date"],
                ],
              }}
            />
            <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Employee", "Designation", "Status", "Alloc %", "Start", "End", "Rate/hr", "$/mo"].map((h) => (
                    <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shadowRows.map((q, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-2.5 py-1.5 font-medium text-gray-700 whitespace-nowrap">{q.employee_id}</td>
                    <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{q.job_name ?? "-"}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={q.resourcing_status}>{q.resourcing_status}</Badge></td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{q.allocation_by_percentage}%</td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{q.allocated_start_date ?? "-"}</td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{q.allocated_end_date ?? "-"}</td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{q.hourly_rate_usd != null ? `$${q.hourly_rate_usd}` : "-"}</td>
                    <td className="px-2.5 py-1.5 text-gray-700 font-medium whitespace-nowrap">{formatUsd(q.monthly_unbilled_value_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            </div>
            {shadowRows.length === 0 && <p className="text-xs text-gray-400 italic text-center py-3">No rows match the current filters.</p>}
          </>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-gray-700">Who this project usually needs vs. who it has</p>
          <FiredBadge fired={d.understaffed.fired} />
        </div>
        <p className="text-[11px] text-gray-400 mb-2">
          Based on {d.understaffed.role_mix_sample_size ?? 0} similar past projects. Roles most of those projects didn&apos;t
          really use are marked &quot;not typical&quot; and never count toward the staffing flag above.
        </p>
        {allRoles.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No comparison data available for this project's type/CoE.</p>
        ) : (
          <>
            <TableControls
              search={{ value: roleSearch, onChange: setRoleSearch, placeholder: "Search role…" }}
              toggles={[{ active: showAllRoles, onToggle: () => setShowAllRoles((v) => !v), label: showAllRoles ? "Showing all roles" : "Show all roles" }]}
              sort={{
                value: roleSort,
                onChange: (v) => setRoleSort(v as RoleMixSort),
                options: [
                  ["gap_desc", "Most short-staffed first"],
                  ["designation_asc", "Role A–Z"],
                  ["expected_desc", "Usually needs ↓"],
                  ["actual_active_desc", "Currently staffed ↓"],
                  ["prevalence_desc", "How typical ↓"],
                  ["headcount_desc", "People ever on this role ↓"],
                ],
              }}
            />
            <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Role", "Status", "Usually needs", "Currently staffed", "Short by"].map((h) => (
                    <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roleRows.map((role) => {
                  const exp = expectedByDesignation.get(role);
                  const actualHeadcount = actualHeadcountByRole[role] ?? 0;
                  const actualFte = fteToPct(actualFteByRole[role] ?? 0);
                  const gap = gapFor(role);
                  const short = isShortFor(role);
                  const isCommon = !!exp?.common;
                  const expectedHeadcount = expectedHeadcountFor(role);
                  const shortPct = expectedHeadcount > 0 ? Math.round((gap / expectedHeadcount) * 100) : 0;
                  return (
                    <tr key={role} className="border-b border-gray-50 last:border-0">
                      <td className="px-2.5 py-1.5 font-medium text-gray-700 whitespace-nowrap">{role}</td>
                      <td className="px-2.5 py-1.5">
                        {short ? (
                          <Badge variant="red">Short</Badge>
                        ) : isCommon ? (
                          <Badge variant="green">Staffed</Badge>
                        ) : (
                          <Badge variant="default">Not typical</Badge>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-500">
                        {!exp ? (
                          "-"
                        ) : isCommon ? (
                          `${exp.headcount} ${exp.headcount === 1 ? "person" : "people"}, usually ${exp.typical_pct}% each`
                        ) : (
                          <span className="text-gray-400">used on only {exp.prevalence_pct}% of similar projects</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-700 font-medium">
                        {actualHeadcount === 0
                          ? "Nobody"
                          : `${actualHeadcount} ${actualHeadcount === 1 ? "person" : "people"} (${actualFte}% combined)`}
                      </td>
                      <td className={cn("px-2.5 py-1.5 font-medium", short ? "text-red-600" : "text-gray-400")}>
                        {!isCommon ? (
                          "-"
                        ) : short ? (
                          <>
                            <span className="text-sm">
                              {gap} of {expectedHeadcount} {expectedHeadcount === 1 ? "person" : "people"} missing
                            </span>
                            <span className="block text-[10px] text-gray-400 font-normal">{shortPct}% of this role&apos;s headcount unfilled</span>
                          </>
                        ) : (
                          "Fully staffed"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </div>
            {roleRows.length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-3">
                {showAllRoles ? "No designations match the current search." : "No roles with a real staffing gap right now — try \"Show all roles\"."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type OvertimeSort = "hours_desc" | "days_desc" | "employee_asc";
type WeeklySort = "week_desc" | "week_asc";

function OvertimeTab({ d }: { d: ProjectHealthDetail }) {
  const [otSearch, setOtSearch] = useState("");
  const [otSort, setOtSort] = useState<OvertimeSort>("hours_desc");
  const [weekSort, setWeekSort] = useState<WeeklySort>("week_desc");

  let employees = d.overtime_risk.employees;
  const q = otSearch.trim().toLowerCase();
  if (q) employees = employees.filter((e) => e.employee_id.toLowerCase().includes(q) || (e.job_name ?? "").toLowerCase().includes(q));
  employees = [...employees];
  switch (otSort) {
    case "hours_desc": employees.sort((a, b) => b.max_daily_hours_recent - a.max_daily_hours_recent); break;
    case "days_desc": employees.sort((a, b) => b.overtime_days_recent - a.overtime_days_recent); break;
    case "employee_asc": employees.sort((a, b) => a.employee_id.localeCompare(b.employee_id)); break;
  }

  const maxWeek = d.effort_spike.weekly_hours.length > 0 ? d.effort_spike.weekly_hours[d.effort_spike.weekly_hours.length - 1].week : null;
  const weeklyHours = weekSort === "week_desc" ? [...d.effort_spike.weekly_hours].reverse() : d.effort_spike.weekly_hours;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-gray-700">Sustained overtime</p>
          <FiredBadge fired={d.overtime_risk.fired} />
        </div>
        <p className="text-[11px] text-gray-400 mb-2">Hours are summed across every project/task that day, not just this one.</p>
        {d.overtime_risk.employees.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No currently-active employee on this project shows sustained overtime.</p>
        ) : (
          <>
            <TableControls
              search={{ value: otSearch, onChange: setOtSearch, placeholder: "Search employee or designation…" }}
              sort={{
                value: otSort,
                onChange: (v) => setOtSort(v as OvertimeSort),
                options: [["hours_desc", "Max daily hours ↓"], ["days_desc", "Overtime days ↓"], ["employee_asc", "Employee A–Z"]],
              }}
            />
            <div className="space-y-2.5">
              {employees.map((e) => (
                <div key={e.employee_id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-700">{e.employee_id} — {e.job_name ?? "Employee"}</p>
                    <p className="text-[11px] text-gray-400">{e.overtime_days_recent} overtime day(s) · max {e.max_daily_hours_recent}h</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {e.daily_hours.map((dh) => (
                      <span
                        key={dh.date}
                        title={dh.date}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap",
                          dh.is_overtime ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-500"
                        )}
                      >
                        {dh.date.slice(5)}: {dh.hours}h
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {employees.length === 0 && <p className="text-xs text-gray-400 italic text-center py-3">No employees match the current search.</p>}
            </div>
          </>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-gray-700">Weekly effort</p>
          <FiredBadge fired={d.effort_spike.fired} />
        </div>
        {d.effort_spike.weekly_hours.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No timesheet history for this project.</p>
        ) : (
          <>
            <TableControls
              sort={{
                value: weekSort,
                onChange: (v) => setWeekSort(v as WeeklySort),
                options: [["week_desc", "Latest week first"], ["week_asc", "Earliest week first"]],
              }}
            />
            <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Week</th>
                  <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Hours logged</th>
                </tr>
              </thead>
              <tbody>
                {weeklyHours.map((w) => {
                  const isLatest = w.week === maxWeek;
                  return (
                    <tr key={w.week} className={cn("border-b border-gray-50 last:border-0", isLatest && "bg-amber-50/50")}>
                      <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">
                        {w.week}
                        {isLatest && <span className="ml-1.5 text-[10px] text-amber-600 font-medium">latest</span>}
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-700 font-medium whitespace-nowrap">{w.hours}h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type WsrSignalFilter = "all" | "RED" | "AMBER" | "GREEN";
type WsrSort = "week_desc" | "week_asc";

function WsrTab({ d }: { d: ProjectHealthDetail }) {
  const [signalFilter, setSignalFilter] = useState<WsrSignalFilter>("all");
  const [sort, setSort] = useState<WsrSort>("week_desc");

  const w = d.wsr;
  if (!w.data_available) {
    return <p className="text-sm text-gray-400 italic">No real WSR report exists for this project.</p>;
  }

  let rows = w.reports;
  if (signalFilter !== "all") rows = rows.filter((r) => r.worst_signal === signalFilter);

  const recentReports = w.reports.slice(-w.recent_n);
  const priorReports = w.reports.slice(-w.min_reports_required, -w.recent_n);
  const baselineReports = w.reports.slice(0, w.recent_n);

  const trendSummary =
    w.trend
      ? {
          deteriorating: `Getting worse lately: last ${w.recent_n} reports were ${ragSequence(recentReports)}, vs. ${ragSequence(priorReports)} the ${w.recent_n} before that.`,
          stable: `Holding steady lately: last ${w.recent_n} reports were ${ragSequence(recentReports)}, about the same as the ${w.recent_n} before that (${ragSequence(priorReports)}).`,
          improving: `Getting better lately: last ${w.recent_n} reports were ${ragSequence(recentReports)}, up from ${ragSequence(priorReports)} the ${w.recent_n} before that.`,
        }[w.trend]
      : `Not enough real reports yet to call a recent trend (need ${w.min_reports_required}+).`;
  const longTermSummary =
    w.baseline_avg_severity != null
      ? w.is_long_term_decline
        ? `But compared to when real reporting started: this project began at ${ragSequence(baselineReports)} and is now at ${ragSequence(recentReports)} — a real decline from its own baseline, even if that fall happened before the recent window above.`
        : `Compared to when real reporting started (${ragSequence(baselineReports)}), it's not meaningfully worse now (${ragSequence(recentReports)}).`
      : `Not enough real reports yet to compare against this project's starting point (need ${w.long_term_min_reports_required}+).`;
  rows = sort === "week_desc" ? [...rows].reverse() : rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {w.fired_deteriorating && <Badge variant="red">Getting worse</Badge>}
        {w.fired_critical && <Badge variant="red">Stuck at red/amber</Badge>}
        {w.fired_long_term_decline && <Badge variant="red">Fell and hasn&apos;t recovered</Badge>}
        {!w.fired_deteriorating && !w.fired_critical && !w.fired_long_term_decline && <Badge variant="green">No sustained WSR risk</Badge>}
      </div>
      <p className="text-xs text-gray-500">{trendSummary}</p>
      <p className="text-xs text-gray-500">{longTermSummary}</p>
      <TableControls
        filters={[
          {
            value: signalFilter,
            onChange: (v) => setSignalFilter(v as WsrSignalFilter),
            options: [
              ["all", "All signals"],
              ["RED", "RED"],
              ["AMBER", "AMBER"],
              ["GREEN", "GREEN"],
            ],
          },
        ]}
        sort={{ value: sort, onChange: (v) => setSort(v as WsrSort), options: [["week_desc", "Latest week first"], ["week_asc", "Earliest week first"]] }}
      />
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Week", "Scope", "Schedule", "Quality", "CSAT", "Team", "Worst"].map((h) => (
                <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">
                  {r.week_start_date ?? "-"}{r.week_end_date ? ` → ${r.week_end_date}` : ""}
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={r.scope_status}>{r.scope_status}</Badge></td>
                <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={r.schedule_status}>{r.schedule_status}</Badge></td>
                <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={r.quality_status}>{r.quality_status}</Badge></td>
                <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={r.csat_status}>{r.csat_status}</Badge></td>
                <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={r.team_status}>{r.team_status}</Badge></td>
                <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={r.worst_signal}>{r.worst_signal}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {rows.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No WSR reports match this filter.</p>}
      </div>
    </div>
  );
}
