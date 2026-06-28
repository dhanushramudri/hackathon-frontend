"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronUp, Sparkles, XCircle } from "lucide-react";
import { api, type AllocationRow, type EmployeeAllocationRow, type EmployeeProfile } from "@/lib/api";
import { Modal } from "@/components/shared/Modal";
import { Badge } from "@/components/shared/Badge";
import { LoadingState, ErrorState } from "@/components/shared/EmptyState";
import { TableControls } from "@/components/shared/TableControls";
import { FiredBadge } from "@/components/shared/FiredBadge";
import { TimesheetProofModal } from "@/components/shared/TimesheetProofModal";
import { cn } from "@/lib/utils";

export type ProfileTab = "overview" | "allocations" | "overtime" | "skills" | "competency" | "leave" | "redeploy_matches";

export interface SkillMatchContext {
  matchedSkills: string[];
  missingSkills: string[];
}

interface EmployeeProfileModalProps {
  employeeId: string;
  initialTab: ProfileTab;
  onClose: () => void;
  skillMatchContext?: SkillMatchContext;
  showRedeployMatches?: boolean;
}

const BASE_TABS: { key: ProfileTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "allocations", label: "Allocations" },
  { key: "overtime", label: "Overtime & Effort" },
  { key: "skills", label: "Skills" },
  { key: "competency", label: "Competency" },
  { key: "leave", label: "Leave" },
];

export function EmployeeProfileModal({ employeeId, initialTab, onClose, skillMatchContext, showRedeployMatches }: EmployeeProfileModalProps) {
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const tabs = showRedeployMatches ? [...BASE_TABS, { key: "redeploy_matches" as const, label: "Redeploy Matches" }] : BASE_TABS;

  const profile = useQuery({
    queryKey: ["employee-profile", employeeId],
    queryFn: () => api.employeeProfile(employeeId),
  });

  return (
    <Modal
      title={profile.data ? `${employeeId} — ${profile.data.job_name ?? "Employee"}` : employeeId}
      onClose={onClose}
      widthClassName="max-w-5xl"
    >
      <div className="flex border-b border-gray-100 px-5 sticky top-0 bg-white z-10 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition whitespace-nowrap flex items-center gap-1",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            {t.key === "redeploy_matches" && <Sparkles className="w-3 h-3" />}
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {profile.isLoading ? (
          <LoadingState label="Loading profile…" />
        ) : profile.error ? (
          <ErrorState message="Could not load this employee's profile." />
        ) : profile.data ? (
          <>
            {tab === "overview" && <OverviewTab profile={profile.data} />}
            {tab === "allocations" && <AllocationsTab profile={profile.data} />}
            {tab === "overtime" && <OvertimeTab profile={profile.data} />}
            {tab === "skills" && <SkillsTab profile={profile.data} matchContext={skillMatchContext} />}
            {tab === "competency" && <CompetencyTab profile={profile.data} />}
            {tab === "leave" && <LeaveTab profile={profile.data} />}
            {tab === "redeploy_matches" && <RedeployMatchesTab employeeId={employeeId} />}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function RedeployMatchesTab({ employeeId }: { employeeId: string }) {
  const matches = useQuery({
    queryKey: ["free-pool-matches", employeeId],
    queryFn: () => api.freePoolMatches(employeeId),
  });

  if (matches.isLoading) return <LoadingState label="Scoring this person against open pipeline demand…" />;
  if (matches.error) return <ErrorState message="Could not load redeploy matches." />;
  const rows = matches.data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">
        Open pipeline demand that matches this person&apos;s skills, reverse-scored from the Recommendation Engine.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          No real skill overlap with any currently-open pipeline demand -- either no skill record exists for this
          employee, or nothing open right now asks for what they have.
        </p>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Match", "Client", "Role requested", "Likely start", "Priority", "Matched skills", ""].map((h) => (
                  <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.row_index} className="border-b border-gray-50 last:border-0">
                  <td className="px-2.5 py-1.5">
                    <Badge variant={m.skill_score >= 0.6 ? "billable" : m.skill_score >= 0.3 ? "amber" : "default"}>
                      {Math.round(m.skill_score * 100)}%
                    </Badge>
                  </td>
                  <td className="px-2.5 py-1.5 text-gray-700 font-medium whitespace-nowrap">{m.client ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{m.resources_requested ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{m.likely_start_date ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{m.priority ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 max-w-[220px] truncate" title={m.matched_skills.join(", ")}>
                    {m.matched_skills.join(", ") || "-"}
                  </td>
                  <td className="px-2.5 py-1.5">
                    <Link href={`/recommendations?row=${m.row_index}`} className="text-primary hover:underline whitespace-nowrap">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
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

function OverviewTab({ profile }: { profile: EmployeeProfile }) {
  const s = profile.signals;
  const [timesheetProject, setTimesheetProject] = useState<string | null>(null);
  const quietAllocations = profile.current_allocations.filter((a) => a.possible_unplanned_absence);
  const rows: { key: string; label: string; fired: boolean; detail: ReactNode }[] = [
    {
      key: "over_allocated",
      label: "Over-allocated",
      fired: s.over_allocated,
      detail:
        profile.employee_total_allocation_pct != null
          ? `${profile.employee_total_allocation_pct}% total allocation across current projects — threshold >${s.over_allocated_threshold}%`
          : "no current allocations",
    },
    {
      key: "under_utilized",
      label: "Under-utilized",
      fired: s.under_utilized,
      detail:
        profile.employee_total_allocation_pct != null
          ? `${profile.employee_total_allocation_pct}% total allocation — threshold <${s.under_utilized_threshold}%`
          : "no current allocations",
    },
    {
      key: "sustained_overtime",
      label: "Sustained overtime",
      fired: s.sustained_overtime,
      detail: `${profile.overtime_risk.overtime_days_recent} day(s) >${s.overtime_daily_threshold_hours}h in the last ${s.overtime_window_days} days (max ${profile.overtime_risk.max_daily_hours_recent}h) — threshold ${s.overtime_sustained_min_days}+ days`,
    },
    {
      key: "possible_unplanned_absence",
      label: "Possible unplanned absence",
      fired: s.possible_unplanned_absence,
      detail:
        quietAllocations.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            Quiet 14d+ on:
            {quietAllocations.map((a) => (
              <button key={a.project_id} onClick={() => setTimesheetProject(a.project_id)} className="text-primary hover:underline">
                {a.project_id}
              </button>
            ))}
            <span className="text-gray-400">(click for real proof)</span>
          </span>
        ) : (
          "no current allocation shows this"
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Field label="Designation" value={profile.job_name ?? "-"} />
        <Field label="Department" value={profile.department_name ?? "-"} />
        <Field label="Location" value={profile.location ?? "-"} />
        <Field label="Joined" value={profile.date_of_join ?? "-"} />
      </div>
      <div className="flex items-center gap-3">
        {profile.account_status != null && (
          <Badge variant={profile.account_status ? "billable" : "default"}>{profile.account_status ? "Active employee" : "Inactive"}</Badge>
        )}
        <span className="text-xs text-gray-400">
          {profile.employee_total_allocation_pct != null ? `${profile.employee_total_allocation_pct}% total allocation right now` : "no current allocations"}
        </span>
      </div>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Signal</th>
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
      {timesheetProject && (
        <TimesheetProofModal employeeId={profile.employee_id} projectId={timesheetProject} onClose={() => setTimesheetProject(null)} />
      )}
    </div>
  );
}

type AllocSort = "start_desc" | "start_asc" | "end_desc" | "end_asc" | "pct_desc" | "employee_asc";

function hoursFor(row: EmployeeAllocationRow, current: AllocationRow[]): AllocationRow | undefined {
  return current.find((c) => c.project_id === row.project_id);
}

function AllocationsTab({ profile }: { profile: EmployeeProfile }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sort, setSort] = useState<AllocSort>("start_desc");
  const [timesheetProject, setTimesheetProject] = useState<string | null>(null);

  if (profile.allocations.length === 0) {
    return <p className="text-sm text-gray-400 italic">No allocation history for this employee.</p>;
  }

  const statuses = Array.from(new Set(profile.allocations.map((a) => a.resourcing_status))).sort();

  let rows = profile.allocations;
  const q = search.trim().toLowerCase();
  if (q) rows = rows.filter((a) => a.project_id.toLowerCase().includes(q) || (a.client_id ?? "").toLowerCase().includes(q));
  if (statusFilter !== "all") rows = rows.filter((a) => a.resourcing_status === statusFilter);
  if (activeOnly) rows = rows.filter((a) => a.is_allocation_active);

  rows = [...rows];
  switch (sort) {
    case "start_desc": rows.sort((a, b) => (b.allocated_start_date ?? "").localeCompare(a.allocated_start_date ?? "")); break;
    case "start_asc": rows.sort((a, b) => (a.allocated_start_date ?? "").localeCompare(b.allocated_start_date ?? "")); break;
    case "end_desc": rows.sort((a, b) => (b.allocated_end_date ?? "").localeCompare(a.allocated_end_date ?? "")); break;
    case "end_asc": rows.sort((a, b) => (a.allocated_end_date ?? "").localeCompare(b.allocated_end_date ?? "")); break;
    case "pct_desc": rows.sort((a, b) => (b.allocation_by_percentage ?? 0) - (a.allocation_by_percentage ?? 0)); break;
    case "employee_asc": rows.sort((a, b) => a.project_id.localeCompare(b.project_id)); break;
  }

  return (
    <div>
      <TableControls
        search={{ value: search, onChange: setSearch, placeholder: "Search project or client…" }}
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
            ["employee_asc", "Project A–Z"],
          ],
        }}
      />
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Project", "Client", "Type", "Status", "Alloc %", "Start", "End", "Active?", "Hours Util."].map((h) => (
                <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => {
              const hours = a.is_allocation_active ? hoursFor(a, profile.current_allocations) : undefined;
              return (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-2.5 py-1.5 text-gray-700 font-medium whitespace-nowrap">{a.project_id}</td>
                  <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{a.client_id ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{a.type_of_project ?? "-"}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={a.resourcing_status}>{a.resourcing_status}</Badge></td>
                  <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{a.allocation_by_percentage ?? 0}%</td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{a.allocated_start_date ?? "-"}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{a.allocated_end_date ?? "-"}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">
                    {a.is_allocation_active ? <Badge variant="billable">Active</Badge> : <Badge variant="default">Past</Badge>}
                  </td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">
                    {hours ? (
                      <button
                        onClick={() => setTimesheetProject(a.project_id)}
                        className="flex items-center gap-1.5 hover:opacity-75 transition"
                        title={`${hours.actual_hours_logged}h logged / ${hours.expected_hours}h expected -- click for the real timesheet proof`}
                      >
                        {hours.hours_data_available && hours.hours_utilization_pct !== null ? (
                          <Badge variant={hours.utilization_band}>{hours.hours_utilization_pct}%</Badge>
                        ) : (
                          <span className="text-gray-300 underline">no data yet</span>
                        )}
                        {hours.possible_unplanned_absence && <Badge variant="unbilled">quiet 14d+</Badge>}
                      </button>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {rows.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No allocations match the current filters.</p>}
      </div>
      {timesheetProject && (
        <TimesheetProofModal employeeId={profile.employee_id} projectId={timesheetProject} onClose={() => setTimesheetProject(null)} />
      )}
    </div>
  );
}

function OvertimeTab({ profile }: { profile: EmployeeProfile }) {
  const r = profile.overtime_risk;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-700">Sustained overtime</p>
        <FiredBadge fired={profile.signals.sustained_overtime} />
      </div>
      <p className="text-[11px] text-gray-400">
        Hours are summed across every project/task that day, not just one. {r.overtime_days_recent} day(s) &gt;{profile.signals.overtime_daily_threshold_hours}h
        in the last {profile.signals.overtime_window_days} days (max {r.max_daily_hours_recent}h) — threshold {profile.signals.overtime_sustained_min_days}+ days.
      </p>
      {profile.daily_hours_recent.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No timesheet history in the trailing window for this employee.</p>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          {profile.daily_hours_recent.map((dh) => (
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
      )}
    </div>
  );
}

type SkillSort = "score_desc" | "source_asc" | "skill_asc";

function SkillsTab({ profile, matchContext }: { profile: EmployeeProfile; matchContext?: SkillMatchContext }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SkillSort>("source_asc");
  const hasMatchContext = Boolean(matchContext && (matchContext.matchedSkills.length > 0 || matchContext.missingSkills.length > 0));
  const [showAll, setShowAll] = useState(!hasMatchContext);

  let rows = profile.skills;
  const q = search.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (s) =>
        (s.coe_skill ?? "").toLowerCase().includes(q) ||
        (s.skill ?? "").toLowerCase().includes(q) ||
        (s.subskill ?? "").toLowerCase().includes(q)
    );
  }
  rows = [...rows];
  switch (sort) {
    case "score_desc": rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)); break;
    case "source_asc": rows.sort((a, b) => Number(b.skill_source === "observed") - Number(a.skill_source === "observed")); break;
    case "skill_asc": rows.sort((a, b) => (a.skill ?? "").localeCompare(b.skill ?? "")); break;
  }

  return (
    <div className="space-y-3">
      {hasMatchContext && matchContext && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">What matched for this request</p>
          {matchContext.matchedSkills.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span className="text-gray-600">{matchContext.matchedSkills.join(", ")}</span>
            </div>
          )}
          {matchContext.missingSkills.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs">
              <XCircle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
              <span className="text-gray-400">{matchContext.missingSkills.join(", ")}</span>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setShowAll((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {showAll ? "Hide" : "Show"} all {profile.skills.length} skill records, real and inferred
      </button>

      {showAll && (
        <div>
          <TableControls
            search={{ value: search, onChange: setSearch, placeholder: "Search skill, sub-skill, or COE…" }}
            sort={{ value: sort, onChange: (v) => setSort(v as SkillSort), options: [["source_asc", "Observed first"], ["score_desc", "Score ↓"], ["skill_asc", "Skill A–Z"]] }}
          />
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">COE Skill</th>
                  <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Skill</th>
                  <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Sub-skill</th>
                  <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Experience</th>
                  <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Score</th>
                  <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{s.coe_skill ?? "-"}</td>
                    <td className="px-2.5 py-1.5 text-gray-700 font-medium whitespace-nowrap">{s.skill ?? "-"}</td>
                    <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{s.subskill ?? "-"}</td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{s.experience ?? "-"}</td>
                    <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{s.score != null ? s.score.toFixed(1) : "-"}/5</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <SourceTag value={s.skill_source} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {rows.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No skill records match this search.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

type CompetencySort = "score_desc" | "source_asc";

function CompetencyTab({ profile }: { profile: EmployeeProfile }) {
  const [sort, setSort] = useState<CompetencySort>("score_desc");

  if (profile.competencies.length === 0) {
    return <p className="text-sm text-gray-400 italic">No competency records for this employee.</p>;
  }

  const rows = [...profile.competencies];
  switch (sort) {
    case "score_desc": rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)); break;
    case "source_asc": rows.sort((a, b) => Number(b.competency_source === "observed") - Number(a.competency_source === "observed")); break;
  }

  return (
    <div>
      <TableControls
        sort={{ value: sort, onChange: (v) => setSort(v as CompetencySort), options: [["score_desc", "Score ↓"], ["source_asc", "Observed first"]] }}
      />
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Competency question</th>
              <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Response</th>
              <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Score</th>
              <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="px-2.5 py-2 text-gray-700 whitespace-nowrap">{c.competency_question ?? "-"}</td>
                <td className="px-2.5 py-2 text-gray-600 whitespace-nowrap">{c.response ?? "-"}</td>
                <td className="px-2.5 py-2 text-gray-700 whitespace-nowrap">{c.score != null ? c.score.toFixed(1) : "-"}/5</td>
                <td className="px-2.5 py-2 whitespace-nowrap">
                  <SourceTag value={c.competency_source} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function LeaveTab({ profile }: { profile: EmployeeProfile }) {
  if (profile.leaves.length === 0) {
    return <p className="text-sm text-gray-400 italic">No leave records for this employee.</p>;
  }
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-2">
        {profile.leaves.length} leave record(s) -- synthetic (no real leave/absence dataset exists in the source files; see clean_datasets.py).
      </p>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Type", "Start", "End", "Status", "Currently on leave?"].map((h) => (
                <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.leaves.map((l, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="px-2.5 py-1.5 text-gray-700 font-medium whitespace-nowrap">{l.leave_type}</td>
                <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{l.leave_start_date ?? "-"}</td>
                <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{l.leave_end_date ?? "-"}</td>
                <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{l.status}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{l.is_currently_on_leave && <Badge variant="amber">Currently on leave</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function SourceTag({ value }: { value: string }) {
  const isObserved = value === "observed";
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap",
        isObserved ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400"
      )}
    >
      {isObserved ? "observed" : "inferred"}
    </span>
  );
}
