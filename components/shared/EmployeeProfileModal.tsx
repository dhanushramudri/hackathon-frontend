"use client";

import React, { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CheckCircle2, ChevronDown, ChevronUp, Sparkles, XCircle,
  RefreshCw, AlertTriangle, Clock, Zap, Users, MessageSquare, Star,
} from "lucide-react";
import {
  api,
  DEFAULT_INCLUDE_PARAMS,
  type AllocationRow, type EmployeeAllocationRow, type EmployeeProfile,
  type BackfillResult, type RecommendationCandidate, type FallbackCandidates,
  type IncludeParams, type RedeployMatch, type EmployeeFeedbackEntry,
  type EmployeeTimesheetRow,
} from "@/lib/api";
import { Modal } from "@/components/shared/Modal";
import { Badge } from "@/components/shared/Badge";
import { ErrorState } from "@/components/shared/EmptyState";
import { ModalBodySkeleton, TableSkeleton } from "@/components/shared/Skeleton";
import { TableControls } from "@/components/shared/TableControls";
import { AdvancedFiltersButton, AdvancedFiltersPanel } from "@/components/shared/AdvancedFilters";
import { FiredBadge } from "@/components/shared/FiredBadge";
import { HoldDot, HoldChip } from "@/components/shared/HoldFlag";
import { TimesheetProofModal } from "@/components/shared/TimesheetProofModal";
import { AssignModal } from "@/components/shared/AssignModal";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { ProjectHealthDetailModal } from "@/components/health/ProjectHealthDetailModal";
import { cn } from "@/lib/utils";

export type ProfileTab =
  | "overview"
  | "allocations"
  | "overtime"
  | "skills"
  | "competency"
  | "leave"
  | "feedback"
  | "timesheet"
  | "redeploy_matches"
  | "replacement";

export interface SkillMatchContext {
  matchedSkills: string[];
  missingSkills: string[];
}

interface ReplacementContext {
  projectId: string;
  allocPct: number;
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
  { key: "feedback", label: "Feedback" },
  { key: "timesheet", label: "Timesheet" },
];

export function EmployeeProfileModal({
  employeeId, initialTab, onClose, skillMatchContext, showRedeployMatches,
}: EmployeeProfileModalProps) {
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [replacementCtx, setReplacementCtx] = useState<ReplacementContext | null>(null);
  const [openProjectCode, setOpenProjectCode] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["employee-profile", employeeId],
    queryFn: () => api.employeeProfile(employeeId),
  });

  function handleFindReplacement(ctx: ReplacementContext | null) {
    setReplacementCtx(ctx);
    if (ctx) setTab("replacement");
    else if (tab === "replacement") setTab("allocations");
  }

  const tabs = [
    ...BASE_TABS,
    ...(showRedeployMatches ? [{ key: "redeploy_matches" as const, label: "Redeploy Matches" }] : []),
    ...(replacementCtx ? [{ key: "replacement" as const, label: `Replace · ${replacementCtx.projectId}` }] : []),
  ];

  return (
    <Modal
      title={
        profile.data ? (
          <span className="inline-flex items-center gap-1.5">
            {employeeId} — {profile.data.job_name ?? "Employee"}
            <HoldDot onHold={profile.data.signals.on_hold} holdProjects={profile.data.signals.hold_projects} />
          </span>
        ) : (
          employeeId
        )
      }
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
            {t.key === "replacement" && <RefreshCw className="w-3 h-3" />}
            {t.key === "feedback" && <MessageSquare className="w-3 h-3" />}
            {t.key === "timesheet" && <Clock className="w-3 h-3" />}
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {profile.isLoading ? (
          <ModalBodySkeleton />
        ) : profile.error ? (
          <ErrorState message="Could not load this employee's profile." />
        ) : profile.data ? (
          <>
            {tab === "overview" && <OverviewTab profile={profile.data} onOpenProject={setOpenProjectCode} />}
            {tab === "allocations" && (
              <AllocationsTab
                profile={profile.data}
                onFindReplacement={handleFindReplacement}
                activeReplacementProjectId={replacementCtx?.projectId ?? null}
                onOpenProject={setOpenProjectCode}
              />
            )}
            {tab === "overtime" && <OvertimeTab profile={profile.data} />}
            {tab === "skills" && <SkillsTab profile={profile.data} matchContext={skillMatchContext} />}
            {tab === "competency" && <CompetencyTab profile={profile.data} />}
            {tab === "leave" && <LeaveTab profile={profile.data} />}
            {tab === "feedback" && <FeedbackTab employeeId={employeeId} />}
            {tab === "timesheet" && <TimesheetTab employeeId={employeeId} />}
            {tab === "redeploy_matches" && <RedeployMatchesTab employeeId={employeeId} />}
            {tab === "replacement" && replacementCtx && (
              <ReplacementTab
                employeeId={employeeId}
                projectId={replacementCtx.projectId}
                allocPct={replacementCtx.allocPct}
                onClose={() => handleFindReplacement(null)}
              />
            )}
          </>
        ) : null}
      </div>
      {openProjectCode && (
        <ProjectHealthDetailModal projectCode={openProjectCode} onClose={() => setOpenProjectCode(null)} />
      )}
    </Modal>
  );
}

// ── Replacement Tab ────────────────────────────────────────────────────────────

type ReplacementSort = "composite_desc" | "skill_desc" | "available_desc" | "competency_desc";

function ReplacementTab({
  employeeId, projectId, allocPct, onClose,
}: {
  employeeId: string;
  projectId: string;
  allocPct: number;
  onClose: () => void;
}) {
  const [bucketFilter, setBucketFilter] = useState<string[]>([]);
  const [coeFilter, setCoeFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<ReplacementSort>("composite_desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bestFitOpen, setBestFitOpen] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  // Same ranking-parameter flexibility as the main Resourcing engine.
  const [includeParams, setIncludeParams] = useState<IncludeParams>(DEFAULT_INCLUDE_PARAMS);
  const [includeBelowCapacity, setIncludeBelowCapacity] = useState(false);
  const [nearCapacityTolerancePct, setNearCapacityTolerancePct] = useState(25);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);

  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<BackfillResult>({
    queryKey: ["backfill", employeeId, projectId, includeParams, includeBelowCapacity, nearCapacityTolerancePct],
    queryFn: () => api.backfillCandidates(employeeId, projectId, 15, includeParams, includeBelowCapacity, nearCapacityTolerancePct),
  });
  const [assignEmployeeId, setAssignEmployeeId] = useState<string | null>(null);
  const handleAssigned = () => {
    queryClient.invalidateQueries({ queryKey: ["backfill", employeeId, projectId] });
    queryClient.invalidateQueries({ queryKey: ["allocations"] });
  };

  const allCandidates = data?.candidates ?? [];

  let candidates = allCandidates;
  if (bucketFilter.length > 0) candidates = candidates.filter((c) => bucketFilter.includes(c.bucket));
  if (coeFilter.length > 0) candidates = candidates.filter((c) => c.coe != null && coeFilter.includes(c.coe));
  if (roleFilter.length > 0) candidates = candidates.filter((c) => c.job_name != null && roleFilter.includes(c.job_name));
  candidates = [...candidates];
  switch (sort) {
    case "composite_desc": candidates.sort((a, b) => b.composite_score - a.composite_score); break;
    case "skill_desc":     candidates.sort((a, b) => b.skill_score - a.skill_score); break;
    case "available_desc": candidates.sort((a, b) => b.available_pct - a.available_pct); break;
    case "competency_desc":candidates.sort((a, b) => b.competency_score - a.competency_score); break;
  }

  const coeOptions   = Array.from(new Set(allCandidates.map((c) => c.coe).filter((v): v is string => Boolean(v)))).sort();
  const roleOptions  = Array.from(new Set(allCandidates.map((c) => c.job_name).filter((v): v is string => Boolean(v)))).sort();

  const bestFit      = data?.best_fit_if_delayed ?? [];
  const fallback     = data?.fallback_candidates;
  const fallbackCount = (fallback?.same_grade?.length ?? 0) + (fallback?.adjacent_level?.length ?? 0);
  const ctx          = data?.backfill_context;
  const isTopPick    = bucketFilter.length === 0 && sort === "composite_desc";

  if (isLoading) return <div className="space-y-3"><TableSkeleton columns={7} rows={5} /></div>;
  if (isError)   return <ErrorState message="Could not load replacement candidates." />;

  return (
    <div className="space-y-4">
      {/* Context header */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-amber-800">
              Replacing {employeeId} on {projectId}
            </p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              {allocPct}% allocation vacated
              {ctx?.pulled_employee_job && ` · ${ctx.pulled_employee_job}`}
              {ctx?.pulled_employee_coe && ` · ${ctx.pulled_employee_coe} CoE`}
            </p>
            {ctx?.skill_basis && ctx.skill_basis.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {ctx.skill_basis.slice(0, 6).map((s) => (
                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700">
                    {s}
                  </span>
                ))}
                {ctx.skill_basis.length > 6 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-600">
                    +{ctx.skill_basis.length - 6} more
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-amber-400 hover:text-amber-600 transition text-[11px] px-2 py-0.5 rounded border border-amber-200 hover:border-amber-400 whitespace-nowrap"
          >
            ✕ Clear
          </button>
        </div>
      </div>

      {/* Hire signal banner */}
      {data?.hire_vs_redeploy_flag && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-700 font-medium">
            No strong internal match — this role may require an external hire or significant training.
          </p>
        </div>
      )}

      {data?.error && <p className="text-xs text-red-500">{data.error}</p>}

      {!data?.error && (
        <>
          {/* Filter + sort bar */}
          <div className="flex items-center justify-end">
            <AdvancedFiltersButton
              open={advancedFiltersOpen}
              include={includeParams}
              defaults={DEFAULT_INCLUDE_PARAMS}
              includeBelowCapacity={includeBelowCapacity}
              onClick={() => setAdvancedFiltersOpen((v) => !v)}
            />
          </div>
          {advancedFiltersOpen && (
            <AdvancedFiltersPanel
              include={includeParams}
              onApply={setIncludeParams}
              includeBelowCapacity={includeBelowCapacity}
              onApplyBelowCapacity={setIncludeBelowCapacity}
              nearCapacityTolerancePct={nearCapacityTolerancePct}
              onApplyNearCapacityTolerancePct={setNearCapacityTolerancePct}
            />
          )}
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <SearchableSelect
              options={[
                { value: "eligible", label: "Eligible — ready now" },
                { value: "trainable", label: "Trainable — some gap" },
                { value: "gap", label: "Gap — significant training" },
              ]}
              value={bucketFilter}
              onChange={setBucketFilter}
              multi
              placeholder="All tiers"
              size="sm"
              className="w-40"
            />
            <SearchableSelect
              options={coeOptions.map((c) => ({ value: c, label: c }))}
              value={coeFilter}
              onChange={setCoeFilter}
              multi
              placeholder="All CoEs"
              size="sm"
              className="w-40"
            />
            <SearchableSelect
              options={roleOptions.map((r) => ({ value: r, label: r }))}
              value={roleFilter}
              onChange={setRoleFilter}
              multi
              placeholder="All roles"
              size="sm"
              className="w-44"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ReplacementSort)}
              className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 cursor-pointer hover:border-gray-300 ml-auto"
            >
              <option value="composite_desc">Best overall fit ↓</option>
              <option value="skill_desc">Skill match ↓</option>
              <option value="available_desc">Availability ↓</option>
              <option value="competency_desc">Competency ↓</option>
            </select>
          </div>

          {/* Candidate table */}
          {candidates.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-4 text-center">
              {allCandidates.length === 0
                ? "No internal replacement candidates found — consider hiring or cross-training."
                : "No candidates match the current filters."}
            </p>
          ) : (
            <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["#", "Employee", "Role", "CoE", "Tier", "Skill", "Competency", "Available", "Flags", ""].map((h) => (
                        <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c, i) => {
                      const isExpanded = expandedId === c.employee_id;
                      const isTop = isTopPick && i === 0;
                      return (
                        <React.Fragment key={c.employee_id}>
                          <tr
                            className={cn(
                              "border-b border-gray-50 cursor-pointer hover:bg-gray-50/60 transition",
                              isTop && "border-l-2 border-l-emerald-400",
                              isExpanded && "bg-gray-50/80"
                            )}
                            onClick={() => setExpandedId(isExpanded ? null : c.employee_id)}
                          >
                            <td className="px-2.5 py-1.5">
                              <div className="flex items-center gap-1">
                                <span className={cn("font-bold", isTop ? "text-emerald-600" : "text-gray-300")}>{i + 1}</span>
                                {isTop && (
                                  <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded-full">
                                    Top pick
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">
                              <button
                                onClick={(e) => { e.stopPropagation(); setOpenProfile(c.employee_id); }}
                                className="text-primary hover:underline font-medium"
                              >
                                {c.employee_id}
                              </button>
                            </td>
                            <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap max-w-[120px] truncate" title={c.job_name ?? ""}>
                              {c.job_name ?? "-"}
                            </td>
                            <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{c.coe ?? "-"}</td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">
                              <Badge variant={c.bucket}>{c.bucket}</Badge>
                            </td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">
                              <span className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                                c.bucket === "eligible" ? "bg-green-50 text-green-700" :
                                c.bucket === "trainable" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
                              )}>
                                {Math.round(c.skill_score * 100)}%
                              </span>
                            </td>
                            <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">
                              {Math.round(c.competency_score * 100)}%
                            </td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">
                              <span className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                                c.available_pct >= 80 ? "bg-green-50 text-green-700" :
                                c.available_pct >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
                              )}>
                                {c.available_pct}%
                              </span>
                            </td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                {c.on_leave_now && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700">
                                    <Clock className="w-2.5 h-2.5" />On leave
                                  </span>
                                )}
                                {c.in_free_pool && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700">
                                    <Zap className="w-2.5 h-2.5" />Free pool
                                  </span>
                                )}
                                <HoldChip onHold={c.on_hold} holdProjects={c.hold_projects} />
                              </div>
                            </td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAssignEmployeeId(c.employee_id); }}
                                  className="text-[11px] px-2 py-1 rounded-lg bg-primary text-white hover:opacity-90 whitespace-nowrap"
                                >
                                  Assign
                                </button>
                                {isExpanded
                                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                  : <ChevronDown className="w-3.5 h-3.5 text-gray-300" />}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-b border-gray-100 bg-gray-50/40">
                              <td colSpan={10} className="px-5 py-2.5 border-l-2 border-l-gray-100">
                                <CandidateDetail candidate={c} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Best Fit If Delayed */}
          {bestFit.length > 0 && (
            <div className="rounded-xl border border-blue-200 overflow-hidden">
              <button
                onClick={() => setBestFitOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-blue-50 hover:bg-blue-100 transition text-xs font-semibold text-blue-700"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Best fit if start is delayed ({bestFit.length})
                </div>
                {bestFitOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {bestFitOpen && (
                <div className="p-3 bg-blue-50/30 space-y-2">
                  <p className="text-[11px] text-blue-500">
                    Currently busy but freeing up soon — consider these if the backfill start can wait.
                  </p>
                  <CandidateMiniList candidates={bestFit} onOpenProfile={setOpenProfile} />
                </div>
              )}
            </div>
          )}

          {/* Fallback Cascade */}
          {fallback && fallbackCount > 0 && (
            <div className="rounded-xl border border-amber-200 overflow-hidden">
              <button
                onClick={() => setFallbackOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 hover:bg-amber-100 transition text-xs font-semibold text-amber-700"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Fallback cascade — same grade & adjacent level ({fallbackCount})
                </div>
                {fallbackOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {fallbackOpen && (
                <div className="p-3 bg-amber-50/30 space-y-3">
                  {(fallback.same_grade ?? []).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1.5">
                        Same grade ({fallback.same_grade.length})
                      </p>
                      <CandidateMiniList candidates={fallback.same_grade} onOpenProfile={setOpenProfile} />
                    </div>
                  )}
                  {(fallback.adjacent_level ?? []).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1.5">
                        Adjacent level ({fallback.adjacent_level.length})
                      </p>
                      <CandidateMiniList candidates={fallback.adjacent_level} onOpenProfile={setOpenProfile} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {openProfile && (
        <EmployeeProfileModal
          employeeId={openProfile}
          initialTab="overview"
          onClose={() => setOpenProfile(null)}
        />
      )}

      {assignEmployeeId && (
        <AssignModal
          employeeId={assignEmployeeId}
          projectId={projectId}
          defaultAllocationPct={allocPct}
          defaultStartDate={data?.backfill_context?.vacated_start_date}
          defaultEndDate={data?.backfill_context?.vacated_end_date}
          onClose={() => setAssignEmployeeId(null)}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}

export function cleanSkillLabel(s: string): string {
  const cleaned = s.split("|")[0].replace(/\s*\(score [\d.]+\/\d+\)\s*$/i, "").trim();
  return cleaned.length > 42 ? cleaned.slice(0, 40) + "…" : cleaned;
}

const MATCH_SHOW = 5;
const MISS_SHOW  = 3;

export function SkillSection({
  labels,
  variant,
  showAll,
  onToggle,
}: {
  labels: string[];
  variant: "matched" | "missing";
  showAll: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const cap      = variant === "matched" ? MATCH_SHOW : MISS_SHOW;
  const overflow = labels.length - cap;
  const chipCls  = variant === "matched"
    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : "bg-gray-50 border-gray-200 text-gray-500";
  const label    = variant === "matched"
    ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> <span className="text-emerald-600">Matched ({labels.length})</span></>
    : <><XCircle className="w-3 h-3 text-gray-300" /> <span className="text-gray-400">Missing ({labels.length})</span></>;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold flex items-center gap-1">{label}</p>

      {/* Primary row — always one tidy line */}
      <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
        {labels.slice(0, cap).map((s, i) => (
          <span
            key={i}
            title={s}
            className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${chipCls}`}
          >
            {s}
          </span>
        ))}
        {overflow > 0 && !showAll && (
          <button
            onClick={onToggle}
            className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-primary hover:text-primary transition whitespace-nowrap flex-shrink-0"
          >
            +{overflow} more
          </button>
        )}
      </div>

      {/* Overflow box — appears below, neatly contained */}
      {showAll && overflow > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-1">
            {labels.slice(cap).map((s, i) => (
              <span key={i} title={s} className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${chipCls}`}>
                {s}
              </span>
            ))}
          </div>
          <button
            onClick={onToggle}
            className="text-[10px] text-gray-400 hover:text-gray-600 underline mt-1.5 block"
          >
            ↑ Show less
          </button>
        </div>
      )}
    </div>
  );
}

function CandidateDetail({ candidate: c }: { candidate: RecommendationCandidate }) {
  const [showAllMatched, setShowAllMatched] = useState(false);
  const [showAllMissing, setShowAllMissing] = useState(false);
  const [showRationale, setShowRationale]   = useState(false);

  const matchedLabels = c.matched_skills.map(cleanSkillLabel).filter(Boolean);
  const missingLabels = c.missing_skills.map(cleanSkillLabel).filter(Boolean);

  return (
    <div className="space-y-2 py-0.5 text-[11px]">
      {/* Matched skills */}
      {matchedLabels.length > 0 && (
        <SkillSection
          labels={matchedLabels}
          variant="matched"
          showAll={showAllMatched}
          onToggle={(e) => { e.stopPropagation(); setShowAllMatched((v) => !v); }}
        />
      )}

      {/* Missing skills */}
      {missingLabels.length > 0 && (
        <SkillSection
          labels={missingLabels}
          variant="missing"
          showAll={showAllMissing}
          onToggle={(e) => { e.stopPropagation(); setShowAllMissing((v) => !v); }}
        />
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-[10px] pt-1.5 border-t border-gray-100">
        {c.earliest_available_date && (
          <span className="flex items-center gap-1 text-blue-500">
            <Clock className="w-3 h-3" />
            Available from <span className="font-semibold">{c.earliest_available_date}</span>
          </span>
        )}
        {c.skill_confidence && (
          <span className="text-gray-400">Confidence: {c.skill_confidence}</span>
        )}
        {c.explanation && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowRationale((v) => !v); }}
            className="ml-auto text-gray-400 hover:text-primary transition text-[10px] underline"
          >
            {showRationale ? "Hide rationale" : "Why this match?"}
          </button>
        )}
      </div>

      {showRationale && c.explanation && (
        <p className="text-[10px] text-gray-500 leading-relaxed px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
          {c.explanation}
        </p>
      )}
    </div>
  );
}

function CandidateMiniList({
  candidates, onOpenProfile,
}: {
  candidates: RecommendationCandidate[];
  onOpenProfile: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {["Employee", "Role", "Tier", "Skill", "Available", "Flags", "Earliest avail."].map((h) => (
                <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.employee_id} className="border-b border-gray-50 last:border-0">
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  <button onClick={() => onOpenProfile(c.employee_id)} className="text-primary hover:underline font-medium">
                    {c.employee_id}
                  </button>
                </td>
                <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{c.job_name ?? "-"}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={c.bucket}>{c.bucket}</Badge></td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  <span className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                    c.bucket === "eligible" ? "bg-green-50 text-green-700" :
                    c.bucket === "trainable" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
                  )}>
                    {Math.round(c.skill_score * 100)}%
                  </span>
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  <span className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                    c.available_pct >= 80 ? "bg-green-50 text-green-700" :
                    c.available_pct >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
                  )}>
                    {c.available_pct}%
                  </span>
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  <div className="flex items-center gap-1 flex-nowrap">
                    {c.on_leave_now && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 whitespace-nowrap">On leave</span>
                    )}
                    {c.in_free_pool && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 whitespace-nowrap">Free pool</span>
                    )}
                    <HoldChip onHold={c.on_hold} holdProjects={c.hold_projects} />
                  </div>
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap text-blue-500 text-[10px]">
                  {c.earliest_available_date ?? <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Redeploy Matches Tab ───────────────────────────────────────────────────────

type RedeployMatchSort = "composite_desc" | "skill_desc" | "competency_desc" | "available_desc";

function RedeployMatchesTab({ employeeId }: { employeeId: string }) {
  const [includeParams, setIncludeParams] = useState<IncludeParams>(DEFAULT_INCLUDE_PARAMS);
  const [includeBelowCapacity, setIncludeBelowCapacity] = useState(false);
  const [nearCapacityTolerancePct, setNearCapacityTolerancePct] = useState(25);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const matches = useQuery({
    queryKey: ["free-pool-matches", employeeId, includeParams, includeBelowCapacity, nearCapacityTolerancePct],
    queryFn: () => api.freePoolMatches(employeeId, 20, includeParams, includeBelowCapacity, nearCapacityTolerancePct),
  });
  const [coeFilter, setCoeFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sort, setSort] = useState<RedeployMatchSort>("composite_desc");

  if (matches.isLoading) return <TableSkeleton columns={8} rows={5} />;
  if (matches.error) return <ErrorState message="Could not load redeploy matches." />;
  const allRows = matches.data ?? [];

  const coeOptions = Array.from(new Set(allRows.flatMap((m) => m.skill_areas))).sort();
  const roleOptions = Array.from(new Set(allRows.map((m) => m.resources_requested).filter((v): v is string => Boolean(v)))).sort();

  let rows = allRows;
  if (coeFilter !== "all") rows = rows.filter((m) => m.skill_areas.includes(coeFilter));
  if (roleFilter !== "all") rows = rows.filter((m) => m.resources_requested === roleFilter);
  rows = [...rows];
  switch (sort) {
    case "composite_desc": rows.sort((a, b) => b.composite_score - a.composite_score); break;
    case "skill_desc":     rows.sort((a, b) => b.skill_score - a.skill_score); break;
    case "competency_desc":rows.sort((a, b) => b.competency_score - a.competency_score); break;
    case "available_desc": rows.sort((a, b) => b.available_pct - a.available_pct); break;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">
        Open pipeline demand this person could redeploy into, ranked by the same skill + competency + availability
        composite score used everywhere else in the app.
      </p>
      {allRows.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          No real skill overlap with any currently-open pipeline demand.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-end">
            <AdvancedFiltersButton
              open={advancedFiltersOpen}
              include={includeParams}
              defaults={DEFAULT_INCLUDE_PARAMS}
              includeBelowCapacity={includeBelowCapacity}
              onClick={() => setAdvancedFiltersOpen((v) => !v)}
            />
          </div>
          {advancedFiltersOpen && (
            <AdvancedFiltersPanel
              include={includeParams}
              onApply={setIncludeParams}
              includeBelowCapacity={includeBelowCapacity}
              onApplyBelowCapacity={setIncludeBelowCapacity}
              nearCapacityTolerancePct={nearCapacityTolerancePct}
              onApplyNearCapacityTolerancePct={setNearCapacityTolerancePct}
            />
          )}
          <TableControls
            filters={[
              { value: coeFilter, onChange: setCoeFilter, options: [["all", "All skill areas / CoE"], ...coeOptions.map((c) => [c, c] as [string, string])] },
              { value: roleFilter, onChange: setRoleFilter, options: [["all", "All roles"], ...roleOptions.map((r) => [r, r] as [string, string])] },
            ]}
            sort={{
              value: sort,
              onChange: (v) => setSort(v as RedeployMatchSort),
              options: [
                ["composite_desc", "Best overall fit ↓"],
                ["skill_desc", "Skill match ↓"],
                ["competency_desc", "Competency ↓"],
                ["available_desc", "Availability ↓"],
              ],
            }}
          />
          {rows.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No matches with the current filters.</p>
          ) : (
            <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["Fit", "Skill", "Competency", "Available", "Client", "Role requested", "Skill area / CoE", "Flags", ""].map((h) => (
                        <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.row_index} className="border-b border-gray-50 last:border-0">
                        <td className="px-2.5 py-1.5">
                          <Badge variant={m.bucket}>{Math.round(m.composite_score * 100)}%</Badge>
                        </td>
                        <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap" title={`Matched: ${m.matched_skills.join(", ") || "none"}. Missing: ${m.missing_skills.join(", ") || "none"}.`}>
                          {Math.round(m.skill_score * 100)}%
                        </td>
                        <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">
                          {Math.round(m.competency_score * 100)}%
                        </td>
                        <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">
                          {m.available_pct}%{m.meets_requested_capacity === false && <span className="text-amber-600"> (below requested %)</span>}
                        </td>
                        <td className="px-2.5 py-1.5 text-gray-700 font-medium whitespace-nowrap">{m.client ?? "-"}</td>
                        <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{m.resources_requested ?? "-"}</td>
                        <td className="px-2.5 py-1.5 text-gray-500 max-w-[160px] truncate" title={m.skill_areas.join(", ")}>
                          {m.skill_areas.join(", ") || "-"}
                        </td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <HoldChip onHold={m.on_hold} holdProjects={m.hold_projects} />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <Link href={`/resourcing?row=${m.row_index}`} className="text-primary hover:underline whitespace-nowrap">
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
        </>
      )}
    </div>
  );
}

// ── Allocations Tab ────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-gray-700 font-medium">{value}</p>
    </div>
  );
}

function OverviewTab({ profile, onOpenProject }: { profile: EmployeeProfile; onOpenProject: (projectCode: string) => void }) {
  const s = profile.signals;
  const [timesheetProject, setTimesheetProject] = useState<string | null>(null);
  const quietAllocations = profile.current_allocations.filter((a) => a.possible_unplanned_absence);
  const rows: { key: string; label: string; fired: boolean; detail: ReactNode }[] = [
    {
      key: "on_hold",
      label: "Hold / doubt",
      fired: s.on_hold,
      detail:
        s.hold_projects.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            Current project(s) flagged as likely to extend past end date:
            {s.hold_projects.map((p) => (
              <button key={p.project_code} onClick={() => onOpenProject(p.project_code)} className="text-amber-700 font-medium hover:underline">
                {p.project_code}
              </button>
            ))}
            <span className="text-gray-400">— availability uncertain until confirmed.</span>
          </span>
        ) : (
          "no current allocation on a project flagged as extending"
        ),
    },
    {
      key: "over_allocated",
      label: "Over-allocated",
      fired: s.over_allocated,
      detail:
        profile.employee_client_allocation_pct != null ? (
          <>
            {profile.employee_client_allocation_pct}% client allocation — threshold &gt;{s.over_allocated_threshold}%
            {s.over_allocated_due_to_internal && profile.employee_internal_allocation_pct != null && (
              <span className="block mt-1 text-amber-600">
                Total shows {profile.employee_total_allocation_pct}% only because of +{profile.employee_internal_allocation_pct}%
                internal-project work on top — discretionary, not a hard commitment, so not flagged as over capacity.
              </span>
            )}
          </>
        ) : (
          "no current allocations"
        ),
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
    {
      key: "pulse",
      label: "Pulse",
      fired: profile.pulse?.is_not_happy ?? false,
      detail: !profile.pulse
        ? "no Weekly Pulse submissions for this employee"
        : `${profile.pulse.avg_score}/4 avg (inspired/valued/workload), ${profile.pulse.response_count} response(s), last ${profile.pulse.window_weeks}w. Worst: ${profile.pulse.worst_question}.`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
        <Field label="Designation" value={profile.job_name ?? "-"} />
        <Field label="Department" value={profile.department_name ?? "-"} />
        <Field label="Manager" value={profile.manager_employee_id ?? "-"} />
        <Field label="Location" value={profile.location ?? "-"} />
        <Field label="Joined" value={profile.date_of_join ?? "-"} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {profile.account_status != null && (
          <Badge variant={profile.account_status ? "billable" : "default"}>{profile.account_status ? "Active employee" : "Inactive"}</Badge>
        )}
        {profile.coe && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-violet-50 text-violet-700 border-violet-200">
            CoE · {profile.coe}
          </span>
        )}
        <span className="text-xs text-gray-400">
          {profile.employee_total_allocation_pct != null ? `${profile.employee_total_allocation_pct}% total allocation right now` : "no current allocations"}
        </span>
      </div>
      <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
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
                  <td className="px-2.5 py-2 whitespace-nowrap"><FiredBadge fired={r.fired} /></td>
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

function AllocationsTab({
  profile, onFindReplacement, activeReplacementProjectId, onOpenProject,
}: {
  profile: EmployeeProfile;
  onFindReplacement: (ctx: { projectId: string; allocPct: number } | null) => void;
  activeReplacementProjectId: string | null;
  onOpenProject: (projectCode: string) => void;
}) {
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
    case "start_asc":  rows.sort((a, b) => (a.allocated_start_date ?? "").localeCompare(b.allocated_start_date ?? "")); break;
    case "end_desc":   rows.sort((a, b) => (b.allocated_end_date ?? "").localeCompare(a.allocated_end_date ?? "")); break;
    case "end_asc":    rows.sort((a, b) => (a.allocated_end_date ?? "").localeCompare(b.allocated_end_date ?? "")); break;
    case "pct_desc":   rows.sort((a, b) => (b.allocation_by_percentage ?? 0) - (a.allocation_by_percentage ?? 0)); break;
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
      <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Project", "Client", "Type", "Status", "Alloc %", "Start", "End", "Active?", "Hours Util.", ""].map((h) => (
                  <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const hours = a.is_allocation_active ? hoursFor(a, profile.current_allocations) : undefined;
                const isActiveReplacement = activeReplacementProjectId === a.project_id;
                return (
                  <tr key={i} className={cn("border-b border-gray-50 last:border-0", isActiveReplacement && "bg-amber-50/40")}>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <button onClick={() => onOpenProject(a.project_id)} className="text-primary font-medium hover:underline">
                        {a.project_id}
                      </button>
                    </td>
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
                          title={`${hours.actual_hours_logged}h logged / ${hours.expected_hours}h expected`}
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
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      {a.is_allocation_active && (
                        <button
                          onClick={() =>
                            onFindReplacement(
                              isActiveReplacement
                                ? null
                                : { projectId: a.project_id, allocPct: a.allocation_by_percentage ?? 100 }
                            )
                          }
                          className={cn(
                            "flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border transition whitespace-nowrap",
                            isActiveReplacement
                              ? "bg-amber-100 border-amber-300 text-amber-700"
                              : "bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-700"
                          )}
                          title="Find who can replace this person if they are pulled from this project"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          {isActiveReplacement ? "View replacement" : "Find replacement"}
                        </button>
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

const PULSE_QUESTION_LABELS: Record<string, string> = {
  q1_inspired_motivated: "Inspired/motivated",
  q2_valued_supported: "Valued/supported",
  q3_feedback_growth: "Feedback & growth",
  q4_cdm_guidance: "CDM guidance",
  q5_workload_sustainable: "Workload sustainable",
};

function OvertimeTab({ profile }: { profile: EmployeeProfile }) {
  const r = profile.overtime_risk;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-700">Sustained overtime</p>
        <FiredBadge fired={profile.signals.sustained_overtime} />
      </div>
      <p className="text-[11px] text-gray-400">
        Hours are summed across every project/task that day. {r.overtime_days_recent} day(s) &gt;{profile.signals.overtime_daily_threshold_hours}h
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

      <div className="pt-2 border-t border-gray-100 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">Weekly Pulse - Not happy</p>
          <FiredBadge fired={profile.pulse?.is_not_happy ?? false} />
        </div>
        {!profile.pulse || profile.pulse.responses.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No weekly pulse responses in the trailing window.</p>
        ) : (
          <div className="space-y-2">
            {profile.pulse.responses.map((resp) => (
              <div key={resp.week_start_date + resp.project_id} className="rounded-lg border border-gray-100 p-2">
                <p className="text-[11px] text-gray-400 mb-1">
                  {resp.week_start_date} · {resp.project_id}
                </p>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(resp.answers).map(([q, a]) => (
                    <span
                      key={q}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap",
                        a.is_not_happy_question && a.score <= 2
                          ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-gray-50 border-gray-200 text-gray-500"
                      )}
                    >
                      {PULSE_QUESTION_LABELS[q] ?? q}: {a.meaning}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
    case "skill_asc":  rows.sort((a, b) => (a.skill ?? "").localeCompare(b.skill ?? "")); break;
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

      <button onClick={() => setShowAll((v) => !v)} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
        {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {showAll ? "Hide" : "Show"} all {profile.skills.length} skill records, real and inferred
      </button>

      {showAll && (
        <div>
          <TableControls
            search={{ value: search, onChange: setSearch, placeholder: "Search skill, sub-skill, or COE…" }}
            sort={{ value: sort, onChange: (v) => setSort(v as SkillSort), options: [["source_asc", "Observed first"], ["score_desc", "Score ↓"], ["skill_asc", "Skill A–Z"]] }}
          />
          <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["COE Skill", "Skill", "Sub-skill", "Experience", "Score", "Source"].map((h) => (
                      <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                    ))}
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
                      <td className="px-2.5 py-1.5 whitespace-nowrap"><SourceTag value={s.skill_source} /></td>
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
      <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Competency question", "Response", "Score", "Source"].map((h) => (
                  <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-2.5 py-2 text-gray-700 whitespace-nowrap">{c.competency_question ?? "-"}</td>
                  <td className="px-2.5 py-2 text-gray-600 whitespace-nowrap">{c.response ?? "-"}</td>
                  <td className="px-2.5 py-2 text-gray-700 whitespace-nowrap">{c.score != null ? c.score.toFixed(1) : "-"}/5</td>
                  <td className="px-2.5 py-2 whitespace-nowrap"><SourceTag value={c.competency_source} /></td>
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
        {profile.leaves.length} leave record(s).
      </p>
      <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden">
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

// ── Feedback Tab ───────────────────────────────────────────────────────────────
// Real HR/PM performance-review check-ins on real projects, written by a real
// reviewing employee -- a manual "proof" surface for the resource manager to
// cross-check a recommendation candidate against, never an input to
// recommendation scoring itself.

const WEEKS_BACK_OPTIONS: [string, string][] = [
  ["all", "All time"],
  ["4", "Last 4 weeks"],
  ["8", "Last 8 weeks"],
  ["12", "Last 12 weeks"],
  ["26", "Last 6 months"],
  ["52", "Last 12 months"],
];

// All 5 real rating values -- the scale is 1-5, no 0, and every value is
// independently selectable (e.g. just 5 and 2, to see the extremes only)
// rather than a single "N+" threshold.
const RATING_OPTIONS = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? "" : "s"}` }));

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("w-3 h-3", n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200")}
        />
      ))}
    </span>
  );
}

function FeedbackDetailModal({ entry, onClose }: { entry: EmployeeFeedbackEntry; onClose: () => void }) {
  return (
    <Modal
      title={
        <span className="inline-flex items-center gap-2">
          {entry.project_id} — feedback
          <StarRating rating={entry.rating} />
        </span>
      }
      subtitle={`${entry.feedback_date} · Reviewed by ${entry.reviewer_employee_id} (${entry.reviewer_role})`}
      onClose={onClose}
      widthClassName="max-w-2xl"
    >
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {entry.client_id && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-gray-50 border-gray-200 text-gray-500 whitespace-nowrap">
              {entry.client_id}
            </span>
          )}
          {entry.coe && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-violet-50 border-violet-200 text-violet-700 whitespace-nowrap">
              {entry.coe}
            </span>
          )}
          {entry.themes.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full border bg-teal-50 border-teal-200 text-teal-700 whitespace-nowrap">
              {t}
            </span>
          ))}
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap",
            entry.would_recommend ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-600"
          )}>
            {entry.would_recommend ? "Would recommend" : "Would not recommend"}
          </span>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
          <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-line">{entry.full_text}</p>
        </div>
      </div>
    </Modal>
  );
}

function FeedbackEntryCard({ entry, onOpen }: { entry: EmployeeFeedbackEntry; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-gray-100 p-3 space-y-1.5 hover:border-primary/40 hover:bg-gray-50/60 transition"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-500">
          <span className="text-gray-700 font-medium">{entry.project_id}</span>
          {entry.client_id && <span>· {entry.client_id}</span>}
          {entry.coe && <span>· {entry.coe}</span>}
          <span>· {entry.feedback_date}</span>
          <span>· by {entry.reviewer_employee_id} ({entry.reviewer_role})</span>
        </div>
        <StarRating rating={entry.rating} />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {entry.themes.map((t) => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full border bg-teal-50 border-teal-200 text-teal-700 whitespace-nowrap">
            {t}
          </span>
        ))}
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap",
          entry.would_recommend ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-600"
        )}>
          {entry.would_recommend ? "Would recommend" : "Would not recommend"}
        </span>
      </div>
      <p className="text-[11px] text-gray-600 leading-relaxed">{entry.summary_comment}</p>
      <p className="text-[10px] text-primary">Read full feedback →</p>
    </button>
  );
}

function FeedbackTab({ employeeId }: { employeeId: string }) {
  const [weeksBack, setWeeksBack] = useState("all");
  const [coe, setCoe] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [reviewerEmployeeId, setReviewerEmployeeId] = useState("all");
  const [theme, setTheme] = useState("all");
  const [ratings, setRatings] = useState<string[]>([]);
  const [openEntry, setOpenEntry] = useState<EmployeeFeedbackEntry | null>(null);

  const feedback = useQuery({
    queryKey: ["employee-feedback", employeeId, weeksBack, coe, projectId, reviewerEmployeeId, theme, ratings],
    queryFn: () =>
      api.employeeFeedback(employeeId, {
        weeksBack: weeksBack === "all" ? undefined : Number(weeksBack),
        coe: coe === "all" ? undefined : coe,
        projectId: projectId === "all" ? undefined : projectId,
        reviewerEmployeeId: reviewerEmployeeId === "all" ? undefined : reviewerEmployeeId,
        theme: theme === "all" ? undefined : theme,
        ratings: ratings.length > 0 ? ratings.map(Number) : undefined,
      }),
  });

  if (feedback.isLoading) return <TableSkeleton columns={4} rows={5} />;
  if (feedback.error) return <ErrorState message="Could not load feedback for this employee." />;
  const data = feedback.data;
  if (!data || data.total_response_count === 0) {
    return <p className="text-sm text-gray-400 italic">No HR feedback records for this employee.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">
        Real HR/PM performance-review check-ins on this person's real projects — proof to cross-check a recommendation against, not a ranking input.
      </p>

      <TableControls
        filters={[
          { value: weeksBack, onChange: setWeeksBack, options: WEEKS_BACK_OPTIONS },
          { value: coe, onChange: setCoe, options: [["all", "All CoEs"], ...data.available_coes.map((c) => [c, c] as [string, string])] },
          { value: projectId, onChange: setProjectId, options: [["all", "All projects"], ...data.available_projects.map((p) => [p, p] as [string, string])] },
          {
            value: reviewerEmployeeId,
            onChange: setReviewerEmployeeId,
            options: [["all", "All reviewers"], ...data.available_reviewers.map((r) => [r.employee_id, `${r.employee_id} (${r.role})`] as [string, string])],
          },
          { value: theme, onChange: setTheme, options: [["all", "All themes"], ...data.available_themes.map((t) => [t, t] as [string, string])] },
        ]}
      />
      <div className="flex items-center gap-1.5 -mt-1.5">
        <span className="text-[10px] text-gray-400 whitespace-nowrap">Rating:</span>
        <SearchableSelect
          options={RATING_OPTIONS}
          value={ratings}
          onChange={setRatings}
          multi
          placeholder="All ratings"
          className="w-36"
          size="sm"
        />
      </div>

      {data.response_count === 0 ? (
        <p className="text-xs text-gray-400 italic py-4 text-center">No feedback matches the current filters.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Avg rating</p>
              <p className="text-gray-700 font-semibold text-sm">{data.avg_rating}/5</p>
            </div>
            <div className="rounded-lg border border-gray-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Responses</p>
              <p className="text-gray-700 font-semibold text-sm">{data.response_count}</p>
            </div>
            <div className="rounded-lg border border-gray-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Would recommend</p>
              <p className="text-gray-700 font-semibold text-sm">{data.would_recommend_pct}%</p>
            </div>
            <div className="rounded-lg border border-gray-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Projects covered</p>
              <p className="text-gray-700 font-semibold text-sm">{data.distinct_project_count}</p>
            </div>
          </div>

          {Object.keys(data.theme_averages).length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {Object.entries(data.theme_averages).map(([t, avg]) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500 whitespace-nowrap">
                  {t}: {avg}/5
                </span>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {data.entries.map((entry) => (
              <FeedbackEntryCard key={entry.feedback_id} entry={entry} onOpen={() => setOpenEntry(entry)} />
            ))}
          </div>
        </>
      )}

      {openEntry && <FeedbackDetailModal entry={openEntry} onClose={() => setOpenEntry(null)} />}
    </div>
  );
}

type TimesheetSort = "date_desc" | "date_asc" | "hours_desc";

function TimesheetTab({ employeeId }: { employeeId: string }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [billingStatus, setBillingStatus] = useState("all");
  const [sort, setSort] = useState<TimesheetSort>("date_desc");

  const ts = useQuery({
    queryKey: ["employee-timesheet", employeeId, startDate, endDate, projectId, billingStatus],
    queryFn: () =>
      api.employeeTimesheet(employeeId, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        projectId: projectId === "all" ? undefined : projectId,
        billingStatus: billingStatus === "all" ? undefined : billingStatus,
      }),
  });

  if (ts.isLoading) return <TableSkeleton columns={5} rows={6} />;
  if (ts.error || !ts.data) return <ErrorState message="Could not load timesheet data for this employee." />;
  const data = ts.data;

  const rows: EmployeeTimesheetRow[] = [...data.rows];
  switch (sort) {
    case "date_desc": rows.sort((a, b) => b.date.localeCompare(a.date)); break;
    case "date_asc": rows.sort((a, b) => a.date.localeCompare(b.date)); break;
    case "hours_desc": rows.sort((a, b) => b.hours - a.hours); break;
  }

  const billingOptions = Object.keys(data.by_billing_status);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">
        Real day-by-day timesheet entries for this employee
        {data.data_start_date && data.data_end_date && ` — data available ${data.data_start_date} → ${data.data_end_date}`}.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 whitespace-nowrap">From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min={data.data_start_date ?? undefined}
            max={data.data_end_date ?? undefined}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 whitespace-nowrap">To</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={data.data_start_date ?? undefined}
            max={data.data_end_date ?? undefined}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          />
        </div>
        {(startDate || endDate) && (
          <button
            onClick={() => { setStartDate(""); setEndDate(""); }}
            className="text-[11px] text-gray-400 hover:text-gray-600 underline"
          >
            Clear dates
          </button>
        )}
      </div>

      <TableControls
        filters={[
          { value: projectId, onChange: setProjectId, options: [["all", "All projects"], ...data.available_projects.map((p) => [p, p] as [string, string])] },
          { value: billingStatus, onChange: setBillingStatus, options: [["all", "All billing status"], ...billingOptions.map((b) => [b, b] as [string, string])] },
        ]}
        sort={{
          value: sort,
          onChange: (v) => setSort(v as TimesheetSort),
          options: [
            ["date_desc", "Latest day first"],
            ["date_asc", "Earliest day first"],
            ["hours_desc", "Most hours first"],
          ],
        }}
      />

      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-4 text-center">No timesheet entries match the current filters.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Total hours</p>
              <p className="text-gray-700 font-semibold text-sm">{data.total_hours}h</p>
            </div>
            <div className="rounded-lg border border-gray-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Days logged</p>
              <p className="text-gray-700 font-semibold text-sm">{data.days_logged}</p>
            </div>
            <div className="rounded-lg border border-gray-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Avg hrs/day logged</p>
              <p className="text-gray-700 font-semibold text-sm">{data.avg_hours_per_logged_day}h</p>
            </div>
            <div className="rounded-lg border border-gray-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Entries</p>
              <p className="text-gray-700 font-semibold text-sm">{data.entry_count}</p>
            </div>
          </div>

          {data.by_project.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {data.by_project.map((p) => (
                <span key={p.project_id} className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500 whitespace-nowrap">
                  {p.project_id}: {p.hours}h
                </span>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-hidden max-h-96 overflow-y-auto scrollbar-thin">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Date</th>
                    <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Project</th>
                    <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Hours</th>
                    <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Status</th>
                    <th className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">Billing</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{r.date}</td>
                      <td className="px-2.5 py-1.5 text-gray-700 font-medium whitespace-nowrap">{r.project_id}</td>
                      <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{r.hours}h</td>
                      <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{r.status}</td>
                      <td className="px-2.5 py-1.5 whitespace-nowrap"><Badge variant={r.billing_status.toLowerCase()}>{r.billing_status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SourceTag({ value }: { value: string }) {
  const isObserved = value === "observed";
  return (
    <span className={cn(
      "text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap",
      isObserved ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400"
    )}>
      {isObserved ? "observed" : "inferred"}
    </span>
  );
}
