"use client";

import { useEffect, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, X, Sparkles, RefreshCw } from "lucide-react";
import { api, type AllocationRow, type DealSummary, type RosterEntry, DEFAULT_INCLUDE_PARAMS } from "@/lib/api";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { AssignWithOverAllocationCheck, OverAllocationWarningModal } from "@/components/shared/OverAllocationWarningModal";
import { RESOURCING_STATUSES, SHIFT_TYPES } from "@/components/shared/AssignModal";
import { RoleRecommendationDetail } from "@/components/shared/RoleRecommendationDetail";
import type { ProfileTab, SkillMatchContext } from "@/components/shared/EmployeeProfileModal";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface DraftRow {
  key: string;
  designation: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  resourcingStatus: string;
  shiftType: string;
  reviewerEmployeeId: string;
  allocationPct: number;
  source: "budget" | "cloned";
}

export function Step5ResourceAllocation({
  projectCode,
  projectDates,
  deal,
  onOpenProfile,
  cloneSignal,
  onCloneApplied,
}: {
  projectCode: string | null;
  projectDates: { startDate: string; endDate: string } | null;
  deal: DealSummary | null;
  onOpenProfile: (employeeId: string, tab: ProfileTab, skillMatchContext?: SkillMatchContext) => void;
  cloneSignal?: { oldEndDate: string; newEndDate: string } | null;
  onCloneApplied?: () => void;
}) {
  const qc = useQueryClient();
  const roster = useQuery({
    queryKey: ["roster", projectCode],
    queryFn: () => api.projectRoster(projectCode as string),
    enabled: projectCode != null,
  });
  const budget = useQuery({
    queryKey: ["project-budget", projectCode],
    queryFn: () => api.getProjectBudget(projectCode as string),
    enabled: projectCode != null,
  });
  const employees = useQuery({ queryKey: ["employees-list"], queryFn: api.employeesList });

  const lineItems = (budget.data?.line_items ?? []).filter((li) => li.designation);
  const distinctDesignations = Array.from(new Set(lineItems.map((li) => li.designation)));
  const asOfDate = projectDates?.startDate ?? todayStr();

  // One ranked-by-availability shortlist per distinct budgeted role -- the
  // real signal behind "pre-select the top guys" instead of leaving every
  // row blank the way JIN's own Resource Allocation table does.
  const topCandidatesQueries = useQueries({
    queries: distinctDesignations.map((designation) => ({
      queryKey: ["top-candidates-for-role", designation, asOfDate],
      queryFn: () => api.topCandidatesForRole(designation, asOfDate, 20),
      enabled: projectCode != null,
    })),
  });
  const candidatesByDesignation: Record<string, { employee_id: string }[]> = {};
  distinctDesignations.forEach((d, i) => {
    candidatesByDesignation[d] = topCandidatesQueries[i]?.data ?? [];
  });
  const topCandidatesLoading = topCandidatesQueries.some((q) => q.isLoading);

  // The ranked top-20 list can run out before every budgeted slot for that
  // designation is filled (e.g. budget wants 2 "Solutions Enabler" but only 1
  // real ranked candidate exists) -- when that happens the draft's employeeId
  // is legitimately blank, not a bug, but the dropdown must still offer every
  // real employee with that title so the row is never a dead end with zero
  // options to pick from.
  const allByDesignation: Record<string, { employee_id: string; job_name: string | null }[]> = {};
  for (const e of employees.data ?? []) {
    if (!e.job_name) continue;
    (allByDesignation[e.job_name] ??= []).push(e);
  }
  function optionsForDesignation(designation: string) {
    const ranked = candidatesByDesignation[designation] ?? [];
    const seen = new Set(ranked.map((c) => c.employee_id));
    const rest = (allByDesignation[designation] ?? []).filter((e) => !seen.has(e.employee_id));
    return [...ranked, ...rest].map((c) => ({ value: c.employee_id, label: `${c.employee_id} (${designation})` }));
  }

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  // Reconciles rather than one-shot-initializes: every time the budget or
  // roster data actually changes (a fresh save in Step 3, an auto-assign
  // completing, a manual Assign here), scan for budgeted roles not yet
  // covered by a real allocation OR an existing draft, and add drafts only
  // for those. This component is mounted for the whole wizard session (see
  // ProjectWizard's hidden-class steps), so a naive "run once" effect could
  // permanently lock onto an empty/stale budget snapshot from before Step 3
  // was even visited -- appending instead of replacing also means an
  // in-progress edit on one draft is never wiped out by another role's
  // suggestions arriving later.
  useEffect(() => {
    if (!projectCode || budget.isLoading || roster.isLoading || topCandidatesLoading) return;

    setDrafts((prevDrafts) => {
      const realCountByDesignation: Record<string, number> = {};
      for (const r of roster.data?.roster ?? []) {
        if (r.job_name) realCountByDesignation[r.job_name] = (realCountByDesignation[r.job_name] ?? 0) + 1;
      }
      const coveredCountByDesignation: Record<string, number> = { ...realCountByDesignation };
      for (const d of prevDrafts) {
        coveredCountByDesignation[d.designation] = (coveredCountByDesignation[d.designation] ?? 0) + 1;
      }
      const suggestedByDesignation: Record<string, Set<string>> = {};
      for (const d of prevDrafts) {
        (suggestedByDesignation[d.designation] ??= new Set()).add(d.employeeId);
      }

      const additions: DraftRow[] = [];
      lineItems.forEach((item, idx) => {
        const designation = item.designation;
        const alreadyCovered = coveredCountByDesignation[designation] ?? 0;
        const realOnly = realCountByDesignation[designation] ?? 0;
        // How many total slots for this designation have we walked past so far
        // (real + covered-by-draft), vs. how many this budget wants overall --
        // approximate via a running per-designation counter across all items.
        const wantedSoFar = lineItems.slice(0, idx + 1).filter((li) => li.designation === designation).length;
        if (wantedSoFar <= Math.max(alreadyCovered, realOnly)) return;

        const pool = candidatesByDesignation[designation] ?? [];
        const used = suggestedByDesignation[designation] ?? new Set<string>();
        const pick = pool.find((c) => !used.has(c.employee_id));
        if (pick) used.add(pick.employee_id);
        suggestedByDesignation[designation] = used;
        coveredCountByDesignation[designation] = (coveredCountByDesignation[designation] ?? 0) + 1;

        additions.push({
          key: `draft-${idx}`,
          designation,
          employeeId: pick?.employee_id ?? "",
          startDate: item.estimated_start_date || projectDates?.startDate || todayStr(),
          endDate: projectDates?.endDate || todayStr(),
          resourcingStatus: "BILLABLE",
          shiftType: "General",
          reviewerEmployeeId: "",
          allocationPct: item.allocation_pct || 100,
          source: "budget",
        });
      });

      return additions.length > 0 ? [...prevDrafts, ...additions] : prevDrafts;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCode, budget.data, roster.data, topCandidatesLoading]);

  // When a project's end date is extended (see ProjectWizard's confirm modal),
  // carry every currently-active real allocation forward into the new period --
  // pre-filled, fully editable, using the same draft mechanism as budget
  // suggestions above. Runs once per `cloneSignal` (cleared via onCloneApplied
  // right after), and keys are stable per allocation_id so a stray re-fire
  // before the signal clears can't duplicate rows.
  useEffect(() => {
    if (!cloneSignal || roster.isLoading) return;
    const activeRows = (roster.data?.roster ?? []).filter((r) => r.is_allocation_active);
    setDrafts((prevDrafts) => {
      const existingKeys = new Set(prevDrafts.map((d) => d.key));
      const additions: DraftRow[] = activeRows
        .filter((r) => !existingKeys.has(`cloned-${r.allocation_id}`))
        .map((r) => ({
          key: `cloned-${r.allocation_id}`,
          designation: r.job_name ?? "",
          employeeId: r.employee_id,
          startDate: r.allocated_end_date ? addDaysToDateStr(r.allocated_end_date, 1) : cloneSignal.oldEndDate,
          endDate: cloneSignal.newEndDate,
          resourcingStatus: r.resourcing_status,
          shiftType: r.shift_type ?? "General",
          reviewerEmployeeId: r.reviewer_employee_id ?? "",
          allocationPct: r.allocation_by_percentage,
          source: "cloned",
        }));
      return additions.length > 0 ? [...prevDrafts, ...additions] : prevDrafts;
    });
    onCloneApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloneSignal, roster.data, roster.isLoading]);

  function updateDraft(key: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  const [adding, setAdding] = useState(false);
  const [activeRoleRowIndex, setActiveRoleRowIndex] = useState<number | null>(deal?.roles[0]?.row_index ?? null);
  const [manualSkillsetText, setManualSkillsetText] = useState("");
  const [manualQuery, setManualQuery] = useState<string | null>(null);

  const [includeParams, setIncludeParams] = useState(DEFAULT_INCLUDE_PARAMS);
  const [includeBelowCapacity, setIncludeBelowCapacity] = useState(false);
  const [nearCapacityTolerancePct, setNearCapacityTolerancePct] = useState(25);

  const manualSearch = useQuery({
    queryKey: ["recommendations-search", manualQuery, projectDates?.startDate],
    queryFn: () => api.recommendationsSearch(manualQuery as string, projectDates?.startDate ?? todayStr()),
    enabled: manualQuery != null,
  });

  const rows = roster.data?.roster ?? [];
  const employeeOptions = (employees.data ?? []).map((e) => ({ value: e.employee_id, label: `${e.employee_id} (${e.job_name})` }));

  function refreshRoster() {
    qc.invalidateQueries({ queryKey: ["roster", projectCode] });
  }

  return (
    <div className="space-y-4">
      {!projectCode && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No project created yet — you can browse candidates below, but assigning someone needs a project from Step 1.
        </p>
      )}
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-2">
          Resource Allocations ({rows.length}{drafts.length > 0 && ` + ${drafts.length} draft${drafts.length > 1 ? "s" : ""}`})
        </p>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <colgroup>
                <col className="min-w-[240px]" />
                <col className="w-[130px]" />
                <col className="w-[130px]" />
                <col className="min-w-[110px]" />
                <col className="min-w-[110px]" />
                <col className="min-w-[160px]" />
                <col className="w-[90px]" />
                <col className="w-[70px]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Name (Designation)", "Start Date", "End Date", "Status", "Shift Type", "Reviewer", "Allocation %", ""].map((h) => (
                    <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <RealAllocationRow key={r.allocation_id} row={r} employeeOptions={employeeOptions} onSaved={refreshRoster} />
                ))}
                {drafts.map((d) => (
                  <tr key={d.key} className="border-b border-gray-50 last:border-0 bg-[hsl(var(--primary)/0.04)]">
                    <td className="px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {d.source === "cloned" ? (
                          <span title="Cloned from a prior allocation -- continuing into the extended project period" className="flex-shrink-0 inline-flex">
                            <RefreshCw size={13} className="text-blue-500" />
                          </span>
                        ) : (
                          <span title="Suggested from Budget" className="flex-shrink-0 inline-flex">
                            <Sparkles size={13} className="text-amber-500" />
                          </span>
                        )}
                        <SearchableSelect
                          size="sm"
                          className="flex-1"
                          options={optionsForDesignation(d.designation)}
                          value={d.employeeId ? [d.employeeId] : []}
                          onChange={(v) => updateDraft(d.key, { employeeId: v[0] ?? "" })}
                          placeholder={`Select ${d.designation}`}
                        />
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input type="date" className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none" value={d.startDate} onChange={(e) => updateDraft(d.key, { startDate: e.target.value })} />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input type="date" className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none" value={d.endDate} onChange={(e) => updateDraft(d.key, { endDate: e.target.value })} />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <SearchableSelect size="sm" options={RESOURCING_STATUSES.map((s) => ({ value: s, label: s }))} value={[d.resourcingStatus]} onChange={(v) => updateDraft(d.key, { resourcingStatus: v[0] ?? "BILLABLE" })} />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <SearchableSelect size="sm" options={SHIFT_TYPES.map((s) => ({ value: s, label: s }))} value={[d.shiftType]} onChange={(v) => updateDraft(d.key, { shiftType: v[0] ?? "General" })} />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <SearchableSelect size="sm" options={employeeOptions} value={d.reviewerEmployeeId ? [d.reviewerEmployeeId] : []} onChange={(v) => updateDraft(d.key, { reviewerEmployeeId: v[0] ?? "" })} placeholder="Select Employee" />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="number" min={0} max={100}
                        className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none"
                        value={d.allocationPct}
                        onChange={(e) => updateDraft(d.key, { allocationPct: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <DraftRowActions
                        row={d}
                        projectCode={projectCode}
                        onAssigned={() => { removeDraft(d.key); refreshRoster(); }}
                        onDismiss={() => removeDraft(d.key)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && drafts.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-6">
              No resources allocated to this project yet{projectCode ? " -- add roles in Budget Creation to get suggestions here." : "."}
            </p>
          )}
        </div>
      </div>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-white px-3.5 py-2 rounded-lg"
          style={{ backgroundColor: "hsl(var(--primary))" }}
        >
          <Plus size={13} /> Add Resource
        </button>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Find a candidate</p>
            <button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
          </div>

          {deal && deal.roles.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {deal.roles.map((r) => (
                  <button
                    key={r.row_index}
                    onClick={() => { setActiveRoleRowIndex(r.row_index); setManualQuery(null); }}
                    className={`text-xs px-3 py-1.5 rounded-lg border ${
                      activeRoleRowIndex === r.row_index ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200"
                    }`}
                    style={activeRoleRowIndex === r.row_index ? { backgroundColor: "hsl(var(--primary))" } : undefined}
                  >
                    {r.resources_requested ?? `Role ${r.row_index}`}
                  </button>
                ))}
              </div>
              {activeRoleRowIndex != null && (
                <RoleRecommendationDetail
                  key={activeRoleRowIndex}
                  rowIndex={activeRoleRowIndex}
                  includeParams={includeParams}
                  setIncludeParams={setIncludeParams}
                  includeBelowCapacity={includeBelowCapacity}
                  setIncludeBelowCapacity={setIncludeBelowCapacity}
                  nearCapacityTolerancePct={nearCapacityTolerancePct}
                  setNearCapacityTolerancePct={setNearCapacityTolerancePct}
                  onOpenProfile={onOpenProfile}
                  onSelectSibling={setActiveRoleRowIndex}
                  projectCode={projectCode}
                  projectDates={projectDates}
                />
              )}
            </>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-[11px] text-gray-400 block mb-0.5">What role/skillset are you filling?</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none"
                    value={manualSkillsetText}
                    onChange={(e) => setManualSkillsetText(e.target.value)}
                    placeholder="e.g. Senior Software Engineer, SQL, Python, Databricks"
                  />
                </div>
                <button
                  onClick={() => setManualQuery(manualSkillsetText)}
                  disabled={!manualSkillsetText.trim()}
                  className="text-xs px-3.5 py-2 rounded-lg text-white font-medium disabled:opacity-50"
                  style={{ backgroundColor: "hsl(var(--primary))" }}
                >
                  Search
                </button>
              </div>
              {manualSearch.data && (
                <div className="space-y-1.5">
                  {manualSearch.data.candidates.map((c, i) => (
                    <div key={c.employee_id} className="flex items-center justify-between text-xs rounded-lg border border-gray-100 px-3 py-2">
                      <button onClick={() => onOpenProfile(c.employee_id, "overview")} className="text-left hover:underline">
                        {i + 1}. {c.employee_id} — {c.job_name} ({(c.skill_score * 100).toFixed(0)}% skill match)
                      </button>
                      <AssignInlineButton projectCode={projectCode} projectDates={projectDates} employeeId={c.employee_id} onDone={refreshRoster} />
                    </div>
                  ))}
                  {manualSearch.data.candidates.length === 0 && <p className="text-xs text-gray-400 italic">No candidates found.</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// A real, already-committed allocation -- editable in place (dates, status,
// shift, reviewer, allocation %) rather than frozen the moment it's saved.
// Employee identity itself isn't editable here (re-assigning a committed row
// to a different person is a new allocation, not an edit); Save only enables
// once something actually differs from the row's real saved values.
function RealAllocationRow({
  row,
  employeeOptions,
  onSaved,
}: {
  row: RosterEntry;
  employeeOptions: { value: string; label: string }[];
  onSaved: () => void;
}) {
  const [startDate, setStartDate] = useState(row.allocated_start_date ?? "");
  const [endDate, setEndDate] = useState(row.allocated_end_date ?? "");
  const [status, setStatus] = useState(row.resourcing_status);
  const [shiftType, setShiftType] = useState(row.shift_type ?? "General");
  const [reviewerEmployeeId, setReviewerEmployeeId] = useState(row.reviewer_employee_id ?? "");
  const [allocationPct, setAllocationPct] = useState(row.allocation_by_percentage);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    startDate !== (row.allocated_start_date ?? "") ||
    endDate !== (row.allocated_end_date ?? "") ||
    status !== row.resourcing_status ||
    shiftType !== (row.shift_type ?? "General") ||
    reviewerEmployeeId !== (row.reviewer_employee_id ?? "") ||
    allocationPct !== row.allocation_by_percentage;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateAllocation(row.allocation_id, {
        allocationPct, startDate, endDate, resourcingStatus: status,
        shiftType, reviewerEmployeeId: reviewerEmployeeId || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${row.employee_id}'s allocation entirely? This can't be undone.`)) return;
    setRemoving(true);
    setError(null);
    try {
      await api.deleteAllocation(row.allocation_id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this allocation.");
      setRemoving(false);
    }
  }

  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="px-2.5 py-1.5 font-medium text-gray-700 whitespace-nowrap">
        {row.employee_id} {row.job_name && <span className="text-gray-400 font-normal">({row.job_name})</span>}
      </td>
      <td className="px-2.5 py-1.5">
        <input type="date" className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </td>
      <td className="px-2.5 py-1.5">
        <input type="date" className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </td>
      <td className="px-2.5 py-1.5">
        <SearchableSelect size="sm" options={RESOURCING_STATUSES.map((s) => ({ value: s, label: s }))} value={[status]} onChange={(v) => setStatus(v[0] ?? status)} />
      </td>
      <td className="px-2.5 py-1.5">
        <SearchableSelect size="sm" options={SHIFT_TYPES.map((s) => ({ value: s, label: s }))} value={[shiftType]} onChange={(v) => setShiftType(v[0] ?? "General")} />
      </td>
      <td className="px-2.5 py-1.5">
        <SearchableSelect
          size="sm"
          options={employeeOptions}
          value={reviewerEmployeeId ? [reviewerEmployeeId] : []}
          onChange={(v) => setReviewerEmployeeId(v[0] ?? "")}
          placeholder="Select Employee"
        />
      </td>
      <td className="px-2.5 py-1.5">
        <input
          type="number" min={0} max={100}
          className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none"
          value={allocationPct}
          onChange={(e) => setAllocationPct(Number(e.target.value) || 0)}
        />
      </td>
      <td className="px-2.5 py-1.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          {error && <span className="text-red-500" title={error}>!</span>}
          <button
            onClick={save}
            disabled={!dirty || saving || removing}
            title={dirty ? "Save changes" : "No changes to save"}
            className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:bg-gray-50 disabled:text-gray-300"
          >
            <Check size={13} />
          </button>
          <button
            onClick={remove}
            disabled={saving || removing}
            title="Remove this allocation"
            className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
          >
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// A draft row is already fully specified inline (employee, dates, status,
// shift, reviewer, allocation %) -- clicking Assign commits those exact
// values directly rather than reopening AssignModal to re-enter them, but
// still runs the same over-allocation pre-check as every other assign path.
function DraftRowActions({
  row, projectCode, onAssigned, onDismiss,
}: {
  row: DraftRow; projectCode: string | null; onAssigned: () => void; onDismiss: () => void;
}) {
  const qc = useQueryClient();
  const allocations = useQuery({ queryKey: ["allocations"], queryFn: api.allocations });
  const [warningRows, setWarningRows] = useState<AllocationRow[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doAssign() {
    if (!projectCode) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.assignAllocation({
        employeeId: row.employeeId, projectId: projectCode,
        allocationPct: row.allocationPct, startDate: row.startDate, endDate: row.endDate,
        resourcingStatus: row.resourcingStatus, shiftType: row.shiftType,
        reviewerEmployeeId: row.reviewerEmployeeId || null,
      });
      // This bypasses AssignModal (the row is already fully specified inline),
      // so it needs the same broad refresh AssignModal's own submit() does --
      // this employee's allocations, this project's roster, and every open
      // candidate/recommendation list whose availability just changed.
      qc.invalidateQueries({ queryKey: ["allocations"] });
      qc.invalidateQueries({ queryKey: ["roster", projectCode] });
      qc.invalidateQueries({ queryKey: ["recommendation"] });
      onAssigned();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign this employee.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClick() {
    if (!row.employeeId) return;
    const empRows = (allocations.data ?? []).filter((a) => a.employee_id === row.employeeId);
    if (empRows.some((a) => a.utilization_band === "over_allocated")) {
      setWarningRows(empRows);
      return;
    }
    doAssign();
  }

  return (
    <div className="flex items-center gap-1.5">
      {error && <span className="text-red-500" title={error}>!</span>}
      <button
        onClick={handleClick}
        disabled={!projectCode || !row.employeeId || submitting}
        title="Assign"
        className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:bg-gray-50 disabled:text-gray-300"
      >
        <Check size={13} />
      </button>
      <button onClick={onDismiss} title="Dismiss" className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500">
        <X size={13} />
      </button>
      {warningRows && (
        <OverAllocationWarningModal
          employeeId={row.employeeId}
          rows={warningRows}
          onCancel={() => setWarningRows(null)}
          onOverride={() => { setWarningRows(null); doAssign(); }}
        />
      )}
    </div>
  );
}

function AssignInlineButton({
  projectCode, projectDates, employeeId, onDone,
}: {
  projectCode: string | null; projectDates: { startDate: string; endDate: string } | null; employeeId: string; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!projectCode) {
    return (
      <span className="text-gray-300 font-medium cursor-not-allowed" title="Create the project in Step 1 first">
        Assign
      </span>
    );
  }
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[hsl(var(--primary))] font-medium hover:underline">Assign</button>
      {open && (
        <AssignWithOverAllocationCheck
          employeeId={employeeId} projectId={projectCode}
          defaultStartDate={projectDates?.startDate} defaultEndDate={projectDates?.endDate}
          onClose={() => setOpen(false)}
          onAssigned={() => { setOpen(false); onDone(); }}
        />
      )}
    </>
  );
}
