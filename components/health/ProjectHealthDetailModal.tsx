"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartPulse, ChevronDown, SlidersHorizontal, UserCheck } from "lucide-react";
import {
  api,
  DEFAULT_INCLUDE_PARAMS,
  type IncludeParams, type ProjectHealthDetail, type ReliefCandidate, type WsrReportRow, type SentimentSummary, type DevopsTicketRow,
} from "@/lib/api";
import { Modal } from "@/components/shared/Modal";
import { Badge } from "@/components/shared/Badge";
import { ErrorState } from "@/components/shared/EmptyState";
import { ModalBodySkeleton, TableSkeleton } from "@/components/shared/Skeleton";
import { TableControls } from "@/components/shared/TableControls";
import { AdvancedFiltersButton, AdvancedFiltersPanel } from "@/components/shared/AdvancedFilters";
import { FiredBadge } from "@/components/shared/FiredBadge";
import { HoldChip } from "@/components/shared/HoldFlag";
import { EmployeeProfileModal, type ProfileTab, type SkillMatchContext } from "@/components/shared/EmployeeProfileModal";
import { cn, formatUsd } from "@/lib/utils";

type DetailTab = "overview" | "allocations" | "staffing" | "overtime" | "relief" | "wsr" | "devops";

interface ProjectHealthDetailModalProps {
  projectCode: string;
  onClose: () => void;
  initialTab?: DetailTab;
}

const BASE_TABS: { key: DetailTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "allocations", label: "Allocations" },
  { key: "staffing", label: "Staffing & Cost" },
  { key: "overtime", label: "Overtime & Effort" },
  { key: "wsr", label: "WSR Reports" },
  { key: "devops", label: "DevOps" },
];

export function ProjectHealthDetailModal({ projectCode, onClose, initialTab }: ProjectHealthDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>(initialTab ?? "overview");
  const detail = useQuery({
    queryKey: ["health-detail", projectCode],
    queryFn: () => api.healthProjectDetail(projectCode),
  });

  const tabs = [...BASE_TABS.slice(0, 4), { key: "relief" as const, label: "Relief Staffing" }, ...BASE_TABS.slice(4)];

  return (
    <Modal
      title={detail.data ? `${projectCode} — ${detail.data.client_id ?? "Unknown client"}` : projectCode}
      onClose={onClose}
      widthClassName="max-w-6xl"
    >
      <div className="flex border-b border-gray-100 px-5 sticky top-0 bg-white z-10 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition whitespace-nowrap",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            {t.key === "relief" && <HeartPulse className="w-3 h-3 text-amber-500" />}
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
            {tab === "relief" && <ReliefStaffingSection projectCode={detail.data.project_code} />}
            {tab === "wsr" && <WsrTab d={detail.data} projectCode={projectCode} />}
            {tab === "devops" && <DevopsTab d={detail.data} />}
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
   {
  key: "devops_extension_risk",
  label: "DevOps extension risk",
  fired: d.devops?.fired ?? false,
  detail: !d.devops
    ? "DevOps signal not yet available for this project's detail view"
    : !d.devops.data_available
    ? "DevOps board not configured for this project"
    : d.devops.open_ticket_count === 0
    ? "No open work items found on the board"
    : (() => {
        const dv = d.devops;
        if (dv.is_overdue) {
          return `Project end (${d.project_end_date ?? "?"}) has passed with ${dv.open_ticket_count} open ticket(s), ${dv.remaining_effort_hours}h remaining — see DevOps tab.`;
        }
        if (dv.within_risk_window) {
          const shortfall = dv.capacity_surplus_hours ?? 0;
          return shortfall >= 0
            ? `${dv.working_days_in_window} working day(s) left, ${shortfall}h capacity surplus over ${dv.remaining_effort_hours}h remaining — see DevOps tab.`
            : `${dv.working_days_in_window} working day(s) left, ${Math.abs(shortfall)}h capacity shortfall against ${dv.remaining_effort_hours}h remaining — see DevOps tab.`;
        }
        return `${dv.open_ticket_count} open ticket(s), ${dv.remaining_effort_hours}h remaining — outside the ${dv.window_days}-day risk window — see DevOps tab.`;
      })(),
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
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant={d.risk_band}>{d.risk_band} risk</Badge>
        <span className="text-xs text-gray-400">{d.risk_score} of {rows.length} tracked root causes are flagged</span>
        {d.is_extension_risk && <Badge variant="amber">extension risk</Badge>}
        {d.is_escalation_risk && <Badge variant="red">escalation</Badge>}
      </div>

      {d.is_extension_risk && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800">Extension outlook</p>
          {d.extension_estimate.committed_overrun_days > 0 && (
            <p className="text-xs text-gray-700">
              Already booked <strong>{d.extension_estimate.committed_overrun_days} day(s)</strong> past the official end date
              ({d.extension_estimate.committed_overrun_source}).
            </p>
          )}
          {d.extension_estimate.projected_additional_days != null ? (
            <p className="text-xs text-gray-700">
              Estimated <strong>{d.extension_estimate.projected_additional_days} more day(s)</strong>
              {" "}({d.extension_estimate.projected_additional_weeks}wk) beyond that, based on{" "}
              {d.extension_estimate.projected_basis} —{" "}
              <span className={cn("font-medium", d.extension_estimate.projected_additional_days_confidence === "low" ? "text-amber-700" : "text-gray-500")}>
                {d.extension_estimate.projected_additional_days_confidence} confidence
              </span>
              {d.extension_estimate.projected_additional_days_confidence === "low" && (
                <span> — several tickets are missing effort data, so treat this as a floor, not a fixed number</span>
              )}
              .
              {d.extension_estimate.predicted_extension_start_date && d.extension_estimate.predicted_extension_end_date && (
                <span className="block mt-0.5 text-gray-600">
                  Predicted window: {d.extension_estimate.predicted_extension_start_date} → {d.extension_estimate.predicted_extension_end_date}
                  {" "}({d.extension_estimate.projected_extension_duration_label})
                </span>
              )}
            </p>
          ) : d.extension_estimate.committed_overrun_days === 0 ? (
            <p className="text-xs text-gray-500">No projected additional days beyond today — see DevOps tab for ticket-level detail.</p>
          ) : null}
          <p className="text-[10px] text-gray-400 pt-1">{d.extension_estimate.note}</p>
        </div>
      )}
      <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
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
            <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
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
            <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
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
            <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
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

function SentimentSection({ s }: { s: SentimentSummary }) {
  if (!s.has_data) return null;

  const riskColor =
    s.risk_signal === "high" ? "border-red-200 bg-red-50" :
    s.risk_signal === "medium" ? "border-amber-200 bg-amber-50" :
    "border-emerald-200 bg-emerald-50";
  const labelColor =
    s.risk_signal === "high" ? "text-red-700" :
    s.risk_signal === "medium" ? "text-amber-700" :
    "text-emerald-700";
  const trendArrow = s.trend === "deteriorating" ? "↘ deteriorating" : s.trend === "improving" ? "↗ improving" : s.trend === "stable" ? "→ stable" : null;
  const pct = s.compound != null ? Math.round(Math.abs(s.compound) * 100) : null;
  const avgPct = s.avg_compound != null ? Math.round(Math.abs(s.avg_compound) * 100) : null;

  return (
    <div className={cn("rounded-lg border p-3 space-y-2", riskColor)}>
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-semibold", labelColor)}>
          Comment Sentiment Risk — DistilBERT (primary) + VADER (secondary)
        </span>
        {trendArrow && (
          <span className={cn("text-[11px] font-medium", labelColor)}>{trendArrow}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px]">
        <span className={labelColor}>
          Latest: <strong>{s.label}</strong> {pct != null && `(${pct}% confidence)`}
        </span>
        {avgPct != null && (
          <span className="text-gray-500">Avg last 8 weeks: {s.avg_compound != null && s.avg_compound < 0 ? "-" : "+"}{avgPct}%</span>
        )}
        <span className={cn("font-medium", s.risk_signal === "none" ? "text-emerald-600" : labelColor)}>
          Signal: {s.risk_signal === "high" ? "⚠ HIGH RISK" : s.risk_signal === "medium" ? "↘ MEDIUM RISK" : "✓ low risk"}
        </span>
      </div>
      {s.latest_comment && (
        <p className="text-[11px] text-gray-600 italic border-l-2 border-gray-300 pl-2">
          &ldquo;{s.latest_comment.slice(0, 220)}{s.latest_comment.length > 220 ? "…" : ""}&rdquo;
        </p>
      )}
      {s.recent_scores && s.recent_scores.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {s.recent_scores.map((sc, i) => {
            const c = sc.compound;
            const dot = c <= -0.6 ? "bg-red-500" : c <= -0.05 ? "bg-amber-400" : c >= 0.05 ? "bg-emerald-400" : "bg-gray-300";
            return (
              <span key={i} className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white", dot)} title={sc.comment}>
                {sc.date?.slice(5) ?? "?"} {Math.round(Math.abs(c) * 100)}%
              </span>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-gray-400">
        Model: <code>distilbert-base-uncased-finetuned-sst-2-english</code> · transformer, context-aware, handles negation and recovery language · VADER shown as secondary signal
      </p>
    </div>
  );
}

function WsrTab({ d, projectCode }: { d: ProjectHealthDetail; projectCode: string }) {
  const [signalFilter, setSignalFilter] = useState<WsrSignalFilter>("all");
  const [sort, setSort] = useState<WsrSort>("week_desc");
  // const sentimentQ = useQuery<SentimentSummary>({
  //   queryKey: ["wsr-sentiment", projectCode],
  //   queryFn: () => api.healthProjectSentiment(projectCode),
  // });

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

      {/* ── Sentiment Risk Section (commented out — WSR table comments visible directly) ── */}
      {/* {sentimentQ.isLoading && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 flex items-center gap-2 text-[11px] text-blue-600 animate-pulse">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-400 animate-bounce" />
          Running DistilBERT sentiment analysis on WSR comments…
        </div>
      )}
      {sentimentQ.data && <SentimentSection s={sentimentQ.data} />} */}

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
      <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Week", "Scope", "Schedule", "Quality", "CSAT", "Team", "Worst", "Comment"].map((h) => (
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
                <td className="px-2.5 py-1.5 text-gray-500 max-w-xs truncate" title={r.comment ?? undefined}>{r.comment ?? "—"}</td>
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

type SprintSortKey = "sprint_name" | "sprint_start_date" | "sprint_end_date" | "ticket_count" | "blocked_count" | "in_progress_count" | "to_do_count" | "remaining_hours";

function SortableTh({
  label,
  sortKey,
  activeSort,
  activeDir,
  onSort,
}: {
  label: string;
  sortKey: string;
  activeSort: string;
  activeDir: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  const isActive = activeSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      title={isActive ? `Sorted ${activeDir}ending — click to reverse` : `Sort by ${label}`}
      className={cn(
        "text-left font-semibold px-2.5 py-1.5 whitespace-nowrap cursor-pointer select-none transition-colors",
        isActive
          ? "text-primary underline underline-offset-2 decoration-primary/40"
          : "text-gray-500 hover:text-gray-800"
      )}
    >
      {label}
    </th>
  );
}

type DevopsFilter = "all" | "blocked" | "in_progress" | "past_due" | "unestimated";
type TicketSortKey = "id" | "title" | "state" | "assigned_to" | "start_date" | "due_date" | "remaining_hours" | "completed_hours" | "original_estimate_hours";


function DevopsTab({ d }: { d: ProjectHealthDetail }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DevopsFilter>("all");
  const [proofSprint, setProofSprint] = useState<string | null>(null);

  const devops = d.devops;

  const [sprintSort, setSprintSort] = useState<SprintSortKey>("sprint_end_date");
  const [sprintSortDir, setSprintSortDir] = useState<"asc" | "desc">("desc");

  const handleSprintSort = (key: string) => {
    if (key === sprintSort) {
      setSprintSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSprintSort(key as SprintSortKey);
      setSprintSortDir("desc");
    }
  };

  const sortedSprints = [...devops.sprint_breakdown].sort((a, b) => {
    const av = a[sprintSort] ?? "";
    const bv = b[sprintSort] ?? "";
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sprintSortDir === "asc" ? cmp : -cmp;
  });


   const [ticketSort, setTicketSort] = useState<TicketSortKey>("id");
  const [ticketSortDir, setTicketSortDir] = useState<"asc" | "desc">("desc");
  const handleTicketSort = (key: string) => {
    if (key === ticketSort) {
      setTicketSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTicketSort(key as TicketSortKey);
      setTicketSortDir(key === "title" || key === "assigned_to" || key === "state" ? "asc" : "desc");
    }
  };


  if (!devops.data_available) {
    return <p className="text-sm text-gray-400 italic">DevOps board not configured for this project.</p>;
  }
  if (devops.open_ticket_count === 0) {
    return <p className="text-sm text-gray-400 italic">No open work items found on the board for this project.</p>;
  }

  let rows = devops.tickets ?? [];
  const q = search.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (t) =>
        (t.title ?? "").toLowerCase().includes(q) ||
        (t.assigned_to ?? "").toLowerCase().includes(q) ||
        String(t.id ?? "").includes(q)
    );
  }
  if (filter === "blocked") rows = rows.filter((t) => t.is_blocked);
  else if (filter === "in_progress") rows = rows.filter((t) => t.is_in_progress);
  else if (filter === "past_due") rows = rows.filter((t) => t.is_past_project_end);
  else if (filter === "unestimated")
    rows = rows.filter(
      (t) => !(t.remaining_hours != null && t.remaining_hours > 0) && (t.original_estimate_hours == null || t.original_estimate_hours === 0)
    );

  rows = [...rows].sort((a, b) => {
    const av = a[ticketSort];
    const bv = b[ticketSort];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return ticketSortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="space-y-4">


      {/* ── Risk summary — single panel, clear hierarchy ── */}
      <div
        className={cn(
          "rounded-xl border p-4",
          devops.fired ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"
        )}
      >
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <FiredBadge fired={devops.fired} />
          <span className="text-[11px] text-gray-500">
            {devops.open_ticket_count} open · {devops.in_progress_ticket_count} in progress ·{" "}
            {devops.to_do_ticket_count} to do
            {devops.blocked_ticket_count > 0 && ` · ${devops.blocked_ticket_count} blocked`}
            {devops.tickets_due_past_project_end > 0 && ` · ${devops.tickets_due_past_project_end} due past end`}
          </span>
        </div>

        {devops.is_overdue ? (
          <>
            <p className="text-sm text-gray-700">
              Project end date <strong>{d.project_end_date ?? "?"}</strong> has passed —{" "}
              <span className="text-red-700 font-semibold">{devops.remaining_effort_hours}h</span> of work is
              still open. This is the pattern that leads to a late extension request.
            </p>
            {d.extension_estimate.projected_additional_days != null && (
              <p className="text-xs text-gray-600 mt-1">
                At this team's current daily capacity, that's roughly{" "}
                <strong>{d.extension_estimate.projected_additional_days} more day(s)</strong>
                {" "}({d.extension_estimate.projected_additional_weeks}wk) of work —{" "}
                {d.extension_estimate.projected_additional_days_confidence} confidence.
              </p>
            )}
          </>
        ) : devops.within_risk_window ? (
          <>
            <p className="text-2xl font-semibold text-gray-800">
              {(devops.capacity_surplus_hours ?? 0) >= 0 ? (
                <span className="text-emerald-700">{devops.capacity_surplus_hours}h surplus</span>
              ) : (
                <span className="text-red-700">{Math.abs(devops.capacity_surplus_hours ?? 0)}h shortfall</span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {devops.working_days_in_window} working day(s) left → {devops.team_capacity_hours_after_leave}h team
              capacity{" "}
              {devops.team_capacity_hours_after_leave !== devops.team_capacity_hours &&
                `(${devops.team_capacity_hours}h before planned leave) `}
              vs. {devops.remaining_effort_hours}h of remaining work.
            </p>
            {d.extension_estimate.projected_additional_days != null && (
              <p className="text-xs text-red-700 mt-1 font-medium">
                Projected to run {d.extension_estimate.projected_additional_days} day(s) beyond the {devops.working_days_in_window}-day window
                {" "}({d.extension_estimate.projected_additional_weeks}wk) — {d.extension_estimate.projected_additional_days_confidence} confidence.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600">
            {devops.remaining_effort_hours}h remaining across {devops.open_ticket_count} open ticket(s) — outside
            the {devops.window_days}-day risk window, so capacity hasn&apos;t been evaluated yet.
          </p>
        )}

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-black/5 text-[11px] text-gray-500">
          <span>{devops.completed_work_hours}h completed</span>
          <span>{devops.original_estimate_hours}h originally estimated</span>
          {devops.effort_completion_pct != null && <span>{devops.effort_completion_pct}% tracked-work complete</span>}
        </div>

        {(devops.tickets_missing_remaining_estimate > 0 || devops.tickets_with_no_effort_data > 0) && (
          <p className="text-[11px] text-amber-700 mt-2">
            {devops.tickets_with_no_effort_data > 0
              ? `${devops.tickets_with_no_effort_data} ticket(s) have no effort data at all — the ${devops.remaining_effort_hours}h figure is a floor, not the real total.`
              : `${devops.tickets_missing_remaining_estimate} ticket(s) used their original estimate in place of a missing remaining-work value.`}
          </p>
        )}
      </div>

        {devops.sprint_breakdown.length > 0 && (
        <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-700">Sprint breakdown</p>
            {devops.sprint_breakdown[0].has_open_work && (devops.is_overdue || devops.within_risk_window) && (
              <p className="text-[11px] text-red-600 mt-0.5">
                {devops.sprint_breakdown[0].sprint_name} still has open work — may need a new sprint to close this out.
              </p>
            )}
             {(() => {
              const unknownCount = devops.sprint_breakdown.filter(
                (s) => s.remaining_hours === 0 && s.tickets_with_no_effort_data > 0
              ).length;
              return unknownCount > 0 ? (
                <p className="text-[11px] text-amber-600 mt-0.5">
                  {unknownCount} of {devops.sprint_breakdown.length} sprints have no reliable remaining-hours data — treat their totals as unknown, not zero.
                </p>
              ) : null;
            })()}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                   <SortableTh label="Sprint" sortKey="sprint_name" activeSort={sprintSort} activeDir={sprintSortDir} onSort={handleSprintSort} />
                  <SortableTh label="Start" sortKey="sprint_start_date" activeSort={sprintSort} activeDir={sprintSortDir} onSort={handleSprintSort} />
                  <SortableTh label="End" sortKey="sprint_end_date" activeSort={sprintSort} activeDir={sprintSortDir} onSort={handleSprintSort} />
                  <SortableTh label="Open" sortKey="ticket_count" activeSort={sprintSort} activeDir={sprintSortDir} onSort={handleSprintSort} />
                  <SortableTh label="Blocked" sortKey="blocked_count" activeSort={sprintSort} activeDir={sprintSortDir} onSort={handleSprintSort} />
                  <SortableTh label="In progress" sortKey="in_progress_count" activeSort={sprintSort} activeDir={sprintSortDir} onSort={handleSprintSort} />
                  <SortableTh label="To do" sortKey="to_do_count" activeSort={sprintSort} activeDir={sprintSortDir} onSort={handleSprintSort} />
                  <SortableTh label="Remaining" sortKey="remaining_hours" activeSort={sprintSort} activeDir={sprintSortDir} onSort={handleSprintSort} />
                </tr>
              </thead>
              <tbody>
                {sortedSprints.map((s) => (
                  <tr key={s.iteration_path} className="border-b border-gray-50 last:border-0">
                    <td className="px-2.5 py-1.5 font-medium text-gray-700 whitespace-nowrap">{s.sprint_name}</td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{s.sprint_start_date ?? "-"}</td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{s.sprint_end_date ?? "-"}</td>

                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{s.ticket_count}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">{s.blocked_count > 0 ? <Badge variant="red">{s.blocked_count}</Badge> : "-"}</td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{s.in_progress_count}</td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{s.to_do_count}</td>
                    <td
                      className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap cursor-pointer hover:underline hover:text-primary"
                      onClick={() => setProofSprint(s.sprint_name)}
                      title="Click to see per-ticket breakdown"
                    >
                      {s.remaining_hours > 0
                        ? `${s.remaining_hours}h`
                        : s.tickets_with_no_effort_data > 0
                        ? <span className="text-amber-600" title={`${s.tickets_with_no_effort_data} ticket(s) with no effort data logged`}>unknown</span>
                        : "0h"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      <TableControls
        search={{ value: search, onChange: setSearch, placeholder: "Search title, assignee, or ID…" }}
        filters={[
          {
            value: filter,
            onChange: (v) => setFilter(v as DevopsFilter),
            options: [
              ["all", "All tickets"],
              ["blocked", "Blocked only"],
              ["in_progress", "In progress only"],
              ["past_due", "Due past project end"],
              ["unestimated", "No effort data logged"],
            ],
          },
        ]}
      />

      <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                 <SortableTh label="ID" sortKey="id" activeSort={ticketSort} activeDir={ticketSortDir} onSort={handleTicketSort} />
    <SortableTh label="Title" sortKey="title" activeSort={ticketSort} activeDir={ticketSortDir} onSort={handleTicketSort} />
    <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Type</th>
    <SortableTh label="State" sortKey="state" activeSort={ticketSort} activeDir={ticketSortDir} onSort={handleTicketSort} />
    <SortableTh label="Assigned to" sortKey="assigned_to" activeSort={ticketSort} activeDir={ticketSortDir} onSort={handleTicketSort} />
    <SortableTh label="Start" sortKey="start_date" activeSort={ticketSort} activeDir={ticketSortDir} onSort={handleTicketSort} />
    <SortableTh label="Due" sortKey="due_date" activeSort={ticketSort} activeDir={ticketSortDir} onSort={handleTicketSort} />
   <SortableTh label="Remaining" sortKey="remaining_hours" activeSort={ticketSort} activeDir={ticketSortDir} onSort={handleTicketSort} />
    <SortableTh label="Completed" sortKey="completed_hours" activeSort={ticketSort} activeDir={ticketSortDir} onSort={handleTicketSort} />
    <SortableTh label="Estimate" sortKey="original_estimate_hours" activeSort={ticketSort} activeDir={ticketSortDir} onSort={handleTicketSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{t.id}</td>
                  <td className="px-2.5 py-1.5 text-gray-700 font-medium max-w-xs truncate" title={t.title ?? undefined}>
                    {t.title ?? "-"}
                  </td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{t.work_item_type ?? "-"}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      {t.state}
                      {t.is_blocked && <Badge variant="red">blocked</Badge>}
                      {t.is_past_project_end && <Badge variant="amber">past end</Badge>}
                      {/* {t.is_effort_inconsistent && <Badge variant="amber">stalled?</Badge>} */}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{t.assigned_to ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{t.start_date ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{t.due_date ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">
                    {t.remaining_hours != null && t.remaining_hours > 0 ? (
                      t.remaining_hours
                    ) : t.original_estimate_hours == null || t.original_estimate_hours === 0 ? (
                      <span className="text-amber-600" title="No estimate or remaining-work logged">unestimated</span>
                    ) : (
                      t.remaining_hours ?? "-"
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{t.completed_hours ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{t.original_estimate_hours ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No tickets match the current filters.</p>}
        {proofSprint && (() => {
  const proofRows = (devops.tickets ?? []).filter((t) => t.sprint_name === proofSprint);
  const total = proofRows.reduce((sum, t) => sum + (t.effective_remaining_hours ?? 0), 0);
  return (
    <Modal title={`${proofSprint} — Remaining Hours Proof`} onClose={() => setProofSprint(null)} widthClassName="max-w-3xl">
      <div className="p-5 space-y-3 text-xs">
        <p className="text-gray-500">
          Every open ticket in {proofSprint}. Tickets with a "?" have no RemainingWork or OriginalEstimate
          logged in DevOps at all, so their true remaining effort is unknown — they contribute 0h to the total below.
        </p>
        <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5">ID</th>
                <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5">Title</th>
                <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5">State</th>
                <th className="text-right font-semibold text-gray-500 px-2.5 py-1.5">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {proofRows.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-2.5 py-1.5 text-gray-500">{t.id}</td>
                  <td className="px-2.5 py-1.5 text-gray-700 font-medium max-w-xs truncate">{t.title ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500">{t.state}</td>
                  <td className="px-2.5 py-1.5 text-right font-medium">
                    {t.effective_remaining_hours != null ? (
                      `${t.effective_remaining_hours}h`
                    ) : (
                      <span className="text-amber-600" title="No RemainingWork or OriginalEstimate logged">?</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td colSpan={3} className="px-2.5 py-1.5 text-right font-semibold text-gray-700">Total</td>
                <td className="px-2.5 py-1.5 text-right font-semibold text-gray-900">{Math.round(total * 10) / 10}h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Modal>
  );
})()}
      </div>
    </div>
  );
}

type ReliefSignal = "all" | "eligible" | "trainable" | "gap";
type ReliefReason = "all" | "fully_free" | "under_utilized";
type ReliefSort = "composite" | "skill" | "competency" | "available";

interface ReliefFilterOptions {
  search: string;
  signal: ReliefSignal;
  designation: string;
  coe: string;
  reason: ReliefReason;
  minSkill: number;
  minCompetency: number;
  minAvailable: number;
  sort: ReliefSort;
}

function filterAndSortRelief(candidates: ReliefCandidate[], opts: ReliefFilterOptions): ReliefCandidate[] {
  let result = candidates;
  const q = opts.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (c) =>
        c.employee_id.toLowerCase().includes(q) ||
        (c.job_name ?? "").toLowerCase().includes(q) ||
        c.matched_skills.some((s) => s.toLowerCase().includes(q))
    );
  }
  if (opts.signal !== "all") result = result.filter((c) => c.skill_bucket === opts.signal);
  if (opts.designation !== "all") result = result.filter((c) => c.job_name === opts.designation);
  if (opts.coe !== "all") result = result.filter((c) => c.primary_coe === opts.coe);
  if (opts.reason !== "all") result = result.filter((c) => c.reason === opts.reason);
  if (opts.minSkill > 0) result = result.filter((c) => c.skill_score >= opts.minSkill / 100);
  if (opts.minCompetency > 0) result = result.filter((c) => c.competency_score >= opts.minCompetency / 100);
  if (opts.minAvailable > 0) result = result.filter((c) => c.idle_capacity_pct >= opts.minAvailable);

  const sorted = [...result];
  switch (opts.sort) {
    case "composite": sorted.sort((a, b) => b.composite_score - a.composite_score); break;
    case "skill": sorted.sort((a, b) => b.skill_score - a.skill_score); break;
    case "competency": sorted.sort((a, b) => b.competency_score - a.competency_score); break;
    case "available": sorted.sort((a, b) => b.idle_capacity_pct - a.idle_capacity_pct); break;
  }
  return sorted;
}

function RangeFilter({
  label, value, onChange, max, step, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void; max: number; step: number; suffix?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-400 block mb-0.5">
        {label}
        {value > 0 ? `: ${value}${suffix ?? ""}` : ": any"}
      </label>
      <input type="range" min={0} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full h-1 accent-primary" />
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-gray-400 block mb-0.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600">
        {children}
      </select>
    </div>
  );
}

const REASON_LABEL: Record<string, string> = { fully_free: "fully free", under_utilized: "under-utilized" };

function RequiredSkillSourceNote({ source, coe }: { source: string; coe: string | null }) {
  if (source === "project_roster") return <>matched against this project&apos;s own team&apos;s real skills</>;
  if (source === "coe_typical") return <>project team too small to derive a signature -- matched against typical {coe ?? "this project's CoE"} skills instead</>;
  return <>no skill data available to assess fit -- ranked by competency and availability only</>;
}

function ReliefStaffingSection({ projectCode }: { projectCode: string }) {
  const [includeParams, setIncludeParams] = useState<IncludeParams>(DEFAULT_INCLUDE_PARAMS);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const relief = useQuery({
    queryKey: ["relief-staffing", projectCode, includeParams],
    queryFn: () => api.reliefStaffingCandidates(projectCode, includeParams),
  });
  const roleMixCoes = useQuery({ queryKey: ["role-mix-coes"], queryFn: api.roleMixCoes });

  const [search, setSearch] = useState("");
  const [signal, setSignal] = useState<ReliefSignal>("all");
  const [designation, setDesignation] = useState("all");
  const [coe, setCoe] = useState("all");
  const [reason, setReason] = useState<ReliefReason>("all");
  const [minSkill, setMinSkill] = useState(0);
  const [minCompetency, setMinCompetency] = useState(0);
  const [minAvailable, setMinAvailable] = useState(0);
  const [sort, setSort] = useState<ReliefSort>("composite");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openProfile, setOpenProfile] = useState<{ employeeId: string; tab: ProfileTab; skillMatchContext?: SkillMatchContext } | null>(null);
  const handleOpenProfile = (employeeId: string, tab: ProfileTab, skillMatchContext?: SkillMatchContext) =>
    setOpenProfile({ employeeId, tab, skillMatchContext });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <HeartPulse className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-gray-800">Relief staffing — who from the Free Pool could help</p>
        </div>
      </div>

      {relief.isLoading ? (
        <TableSkeleton columns={6} rows={4} />
      ) : relief.error || !relief.data ? (
        <ErrorState message="Could not load relief staffing candidates." />
      ) : relief.data.candidates.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          No one in the Free Pool (fully free or under-utilized) right now -- of {relief.data.candidate_pool_size} considered.
        </p>
      ) : (
        <>
          <div className="mb-3">
            <p className="text-[11px] text-gray-400">
              <RequiredSkillSourceNote source={relief.data.required_skill_source} coe={relief.data.project_coe} />
            </p>
            {relief.data.required_skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {relief.data.required_skills.map((s) => (
                  <span key={s} className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-500">{s}</span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee ID, role, or skill…"
              className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-300 bg-white"
            />
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg border whitespace-nowrap transition flex-shrink-0",
                filtersOpen ? "border-primary/40 text-primary bg-primary/5" : "border-gray-200 text-gray-500 bg-white"
              )}
            >
              <SlidersHorizontal className="w-3 h-3" />
              Filters
              <ChevronDown className={cn("w-3 h-3 transition-transform", filtersOpen && "rotate-180")} />
            </button>
            <AdvancedFiltersButton
              open={advancedFiltersOpen}
              include={includeParams}
              defaults={DEFAULT_INCLUDE_PARAMS}
              onClick={() => setAdvancedFiltersOpen((v) => !v)}
            />
          </div>

          {advancedFiltersOpen && (
            <div className="mb-2.5">
              <AdvancedFiltersPanel include={includeParams} onApply={setIncludeParams} />
            </div>
          )}

          {filtersOpen && (
            <div className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-2.5 mb-2.5">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Fit</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {([["all", "All"], ["eligible", "Eligible"], ["trainable", "Trainable"], ["gap", "Gap"]] as [ReliefSignal, string][]).map(
                    ([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setSignal(value)}
                        className={cn(
                          "text-[11px] px-2 py-1 rounded-lg border transition",
                          signal === value ? "bg-primary/10 border-primary text-primary" : "border-gray-200 text-gray-500"
                        )}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <FilterSelect label="Designation" value={designation} onChange={setDesignation}>
                  <option value="all">All</option>
                  {Array.from(new Set(relief.data.candidates.map((c) => c.job_name).filter((v): v is string => Boolean(v)))).sort().map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </FilterSelect>
                <FilterSelect label="CoE" value={coe} onChange={setCoe}>
                  <option value="all">All</option>
                  {(roleMixCoes.data ?? []).map((c) => (
                    <option key={c.coe} value={c.coe}>{c.coe}</option>
                  ))}
                </FilterSelect>
                <FilterSelect label="Availability reason" value={reason} onChange={(v) => setReason(v as ReliefReason)}>
                  <option value="all">All</option>
                  <option value="fully_free">Fully free</option>
                  <option value="under_utilized">Under-utilized</option>
                </FilterSelect>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <RangeFilter label="Min skill" value={minSkill} onChange={setMinSkill} max={100} step={10} suffix="%" />
                <RangeFilter label="Min competency" value={minCompetency} onChange={setMinCompetency} max={100} step={10} suffix="%" />
                <RangeFilter label="Min available" value={minAvailable} onChange={setMinAvailable} max={100} step={10} suffix="%" />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as ReliefSort)}
                className="w-full text-[11px] px-1.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600"
              >
                <option value="composite">Sort: best overall fit</option>
                <option value="skill">Sort: skill match</option>
                <option value="competency">Sort: competency</option>
                <option value="available">Sort: availability</option>
              </select>
            </div>
          )}

          <div className="space-y-2">
            {filterAndSortRelief(relief.data.candidates, { search, signal, designation, coe, reason, minSkill, minCompetency, minAvailable, sort }).map((c) => (
              <ReliefCandidateCard key={c.employee_id} c={c} onOpenProfile={handleOpenProfile} includeParams={includeParams} />
            ))}
            {filterAndSortRelief(relief.data.candidates, { search, signal, designation, coe, reason, minSkill, minCompetency, minAvailable, sort }).length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-3">No candidates match the current filters.</p>
            )}
          </div>

          {relief.data.available_soon_candidates.length > 0 && (
            <AvailableSoonAccordion candidates={relief.data.available_soon_candidates} onOpenProfile={handleOpenProfile} includeParams={includeParams} />
          )}
        </>
      )}

      {openProfile && (
        <EmployeeProfileModal
          employeeId={openProfile.employeeId}
          initialTab={openProfile.tab}
          skillMatchContext={openProfile.skillMatchContext}
          onClose={() => setOpenProfile(null)}
        />
      )}
    </div>
  );
}

function Metric({
  label, value, suffix, weight, onClick,
}: {
  label: string; value: number; suffix: string; weight: string; onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      type="button"
      className="text-left group"
    >
      <p className="text-gray-400 mb-0.5 group-hover:text-primary transition">
        {label} <span className="text-gray-300">({weight})</span>
      </p>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(value, 1) * 100}%` }} />
      </div>
      <p className="text-gray-500 mt-0.5 group-hover:underline">{suffix}</p>
    </button>
  );
}

function ReliefCandidateCard({
  c, onOpenProfile, availableSoon, includeParams,
}: {
  c: ReliefCandidate;
  onOpenProfile: (employeeId: string, tab: ProfileTab, skillMatchContext?: SkillMatchContext) => void;
  availableSoon?: boolean;
  includeParams: IncludeParams;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile(c.employee_id, "overview");
            }}
            className="text-xs font-medium text-primary hover:underline flex-shrink-0"
          >
            {c.employee_id}
          </button>
          <span className="text-[11px] text-gray-500 truncate">{c.job_name ?? "Employee"}</span>
          {c.primary_coe ? (
            <span
              title={c.coe_matches_project ? "Same CoE as this project" : undefined}
              className={cn(
                "flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0",
                c.coe_matches_project ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-violet-50 border-violet-200 text-violet-600"
              )}
            >
              {c.coe_matches_project && <UserCheck className="w-3 h-3" />}
              {c.primary_coe}
            </span>
          ) : (
            <span className="text-[10px] text-gray-300 flex-shrink-0">CoE not determined</span>
          )}
          <HoldChip onHold={c.on_hold} holdProjects={c.hold_projects} />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {availableSoon ? (
            <Badge variant="amber">free from {c.available_from_date ?? "?"} ({c.days_to_available}d)</Badge>
          ) : (
            <Badge variant={REASON_LABEL[c.reason] ? (c.reason === "fully_free" ? "green" : "under_utilized") : "default"}>
              {REASON_LABEL[c.reason] ?? c.reason} · {c.idle_capacity_pct.toFixed(0)}% idle
            </Badge>
          )}
          <Badge variant={c.skill_bucket}>{Math.round(c.composite_score * 100)}% {availableSoon ? "potential fit" : "fit"}</Badge>
          <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0", expanded && "rotate-180")} />
        </div>
      </div>

      {!expanded && (c.matched_skills.length > 0 || c.missing_skills.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-1.5 text-[10px]">
          {c.matched_skills.map((s) => (
            <span key={s} className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700">{s}</span>
          ))}
          {c.missing_skills.map((s) => (
            <span key={s} className="px-1.5 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-400">{s}</span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-2.5">
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <Metric
              label="Skill"
              value={c.skill_score}
              suffix={`${Math.round(c.skill_score * 100)}%`}
              weight="50%"
              onClick={() => onOpenProfile(c.employee_id, "skills", { matchedSkills: c.matched_skills, missingSkills: c.missing_skills })}
            />
            <Metric
              label="Competency"
              value={c.competency_score}
              suffix={`${Math.round(c.competency_score * 100)}%`}
              weight="30%"
              onClick={() => onOpenProfile(c.employee_id, "competency")}
            />
            <Metric
              label="Available"
              value={c.idle_capacity_pct / 100}
              suffix={`${c.idle_capacity_pct.toFixed(0)}%`}
              weight="20%"
              onClick={() => onOpenProfile(c.employee_id, "allocations")}
            />
          </div>
          <p className="text-[11px] text-gray-400">
            {Math.round(c.composite_score * 100)}% overall fit — skill {Math.round(c.skill_score * 100)}%, competency{" "}
            {Math.round(c.competency_score * 100)}%, available {c.idle_capacity_pct.toFixed(0)}%
            {includeParams.category_match && c.relevant_project_ratio != null && `, category match ${Math.round(c.relevant_project_ratio * 100)}%`}
            {includeParams.project_count && c.project_count_score != null && `, project count ${Math.round(c.project_count_score * 100)}%`}
            {" "}(only the selected Advanced Filters parameters are actually blended in)
          </p>
          {(c.matched_skills.length > 0 || c.missing_skills.length > 0) && (
            <div className="flex flex-wrap gap-1 text-[10px]">
              {c.matched_skills.map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700">{s}</span>
              ))}
              {c.missing_skills.map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-400">{s}</span>
              ))}
            </div>
          )}
          {c.total_projects != null && c.total_projects > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
              <span className="text-gray-400 font-medium flex-shrink-0">Track record</span>
              <span className="px-1.5 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600">
                {c.relevant_project_count}/{c.total_projects} relevant projects
              </span>
              {c.top_categories?.map((tc) => (
                <span key={tc.category} className="px-1.5 py-0.5 rounded-full border border-gray-200 bg-white text-gray-500">
                  {tc.category} ({tc.count})
                </span>
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-300">
            skill data: {c.skill_confidence} · competency data: {c.competency_confidence}
            {c.competency_confidence === "imputed" && " (tenure-based estimate, no direct assessment)"}
          </p>
        </div>
      )}
    </div>
  );
}

function AvailableSoonAccordion({
  candidates, onOpenProfile, includeParams,
}: {
  candidates: ReliefCandidate[];
  onOpenProfile: (employeeId: string, tab: ProfileTab, skillMatchContext?: SkillMatchContext) => void;
  includeParams: IncludeParams;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3.5">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 w-full text-left">
        <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0", open && "rotate-180")} />
        <p className="text-xs font-semibold text-gray-700">
          No one free right now? {candidates.length} more becoming available soon
        </p>
      </button>
      {!open && (
        <p className="text-[11px] text-gray-400 mt-1 ml-5">
          Still busy today, but with a real end date -- not immediately available, worth knowing about.
        </p>
      )}
      {open && (
        <div className="space-y-2 mt-2.5">
          {candidates.map((c) => (
            <ReliefCandidateCard key={c.employee_id} c={c} onOpenProfile={onOpenProfile} availableSoon includeParams={includeParams} />
          ))}
        </div>
      )}
    </div>
  );
}
