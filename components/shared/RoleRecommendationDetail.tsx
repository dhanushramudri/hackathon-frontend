"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Sparkles, SlidersHorizontal } from "lucide-react";
import {
  api,
  DEFAULT_INCLUDE_PARAMS,
  type DealCompositionRow,
  type IncludeParams,
  type RecommendationCandidate,
  type RecommendationResult,
  type SemanticMatchResult,
} from "@/lib/api";
import { Badge } from "@/components/shared/Badge";
import { ErrorState } from "@/components/shared/EmptyState";
import { Skeleton, FieldGridSkeleton, CandidateCardSkeleton } from "@/components/shared/Skeleton";
import type { ProfileTab, SkillMatchContext } from "@/components/shared/EmployeeProfileModal";
import { Modal } from "@/components/shared/Modal";
import {
  type CandidateSignalFilter,
  type SkillDataFilter,
  type CandidateSort,
  SKILL_DATA_LABEL,
  UNKNOWN_COE,
  buildNormalizedOptions,
  filterAndSortCandidates,
} from "@/components/shared/candidateFilters";
import { AdvancedFiltersButton, AdvancedFiltersPanel, RangeFilter, FilterSelect } from "@/components/shared/AdvancedFilters";
import { CandidateRow } from "@/components/shared/CandidateRow";
import { AssignWithOverAllocationCheck } from "@/components/shared/OverAllocationWarningModal";
import { cn } from "@/lib/utils";

// This whole file (DealField/SemanticMatchPanel/RoleRecommendationDetail/
// DecisionHeader/OtherOptionsSection) used to live inline in
// app/recommendations/page.tsx. Moved out verbatim so the Project Wizard's
// Step 5 (Resource Allocation) can reuse RoleRecommendationDetail too --
// Next.js forbids arbitrary named exports from a page.tsx file, so it can't
// be exported from there directly.

function DealField({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-gray-400">{label}</p>
      <p className="text-gray-700 font-medium">{value}</p>
    </div>
  );
}

function SemanticMatchPanel({
  result,
  onOpenProfile,
}: {
  result: SemanticMatchResult;
  onOpenProfile: (employeeId: string, skillMatchContext?: SkillMatchContext) => void;
}) {
  if (!result.available) {
    return <p className="text-xs text-red-600 italic">{result.reason ?? "AI matching is not available right now."}</p>;
  }
  if (result.no_match_found || !result.matches || result.matches.length === 0) {
    return (
      <p className="text-xs text-red-600">
        AI reviewed {result.candidates_considered ?? 0} candidates&apos; real skill records and found no semantic match
        either -- this is a genuine hire signal.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-red-600">
        AI reviewed {result.candidates_considered} candidates&apos; real skill records and found {result.matches.length}{" "}
        possible semantic match{result.matches.length > 1 ? "es" : ""} below -- each verified against that
        employee&apos;s actual recorded skills, not just restated by the model.
      </p>
      {result.matches.map((m, i) => (
        <div key={i} className="rounded-lg border border-red-200 bg-white p-2.5 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-800">{m.employee_id}</span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full border",
                m.confidence === "high"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              )}
            >
              {m.confidence} confidence
            </span>
            <button
              onClick={() =>
                onOpenProfile(m.employee_id, {
                  matchedSkills: [m.skill, m.subskill].filter((s): s is string => Boolean(s)),
                  missingSkills: [],
                })
              }
              className="ml-auto text-[11px] text-primary hover:underline"
            >
              View full profile
            </button>
          </div>
          <p className="text-gray-600">
            Matches &quot;<span className="font-medium">{m.matched_requirement}</span>&quot; via real skill:{" "}
            <span className="font-medium text-gray-800">
              {m.skill}
              {m.subskill && ` — ${m.subskill}`}
            </span>
            {m.score != null && ` (score ${m.score.toFixed(1)}/5, ${m.skill_source})`}
          </p>
          {m.rationale && <p className="text-gray-400 mt-1">{m.rationale}</p>}
        </div>
      ))}
    </div>
  );
}

// Full single-role recommendation view -- identical content/behavior whether
// reached from the By Role sidebar, a By Project role tab, or the Project
// Wizard's Step 5. Mounted with key={rowIndex} at every call site so
// switching rows/tabs gives every piece of local filter/expand state a clean
// reset for free (no manual reset effect needed).
export function RoleRecommendationDetail({
  rowIndex,
  includeParams,
  setIncludeParams,
  includeBelowCapacity,
  setIncludeBelowCapacity,
  nearCapacityTolerancePct,
  setNearCapacityTolerancePct,
  onOpenProfile,
  onSelectSibling,
  projectCode,
  projectDates,
  onAssigned,
}: {
  rowIndex: number;
  includeParams: IncludeParams;
  setIncludeParams: (v: IncludeParams) => void;
  includeBelowCapacity: boolean;
  setIncludeBelowCapacity: (v: boolean) => void;
  nearCapacityTolerancePct: number;
  setNearCapacityTolerancePct: (v: number) => void;
  onOpenProfile: (employeeId: string, tab: ProfileTab, skillMatchContext?: SkillMatchContext) => void;
  onSelectSibling: (rowIndex: number) => void;
  // Project a candidate can be assigned into -- set once, at the wizard level
  // (Step 1), and passed down here rather than created inline per role tab
  // (that's what CreateProjectSection used to do; the wizard's Step 1 is now
  // the single place a project gets created).
  projectCode?: string | null;
  projectDates?: { startDate: string; endDate: string } | null;
  // Lets a caller with its own view of this project's roster (Step 5) refresh
  // it once an assignment here actually succeeds -- without this, a
  // successful assign was invisible until the caller's roster query happened
  // to refetch for an unrelated reason.
  onAssigned?: () => void;
}) {
  const [semanticMatchResult, setSemanticMatchResult] = useState<SemanticMatchResult | undefined>(undefined);
  const semanticMatchMutation = useMutation({ mutationFn: (ri: number) => api.semanticMatch(ri) });
  const [candidateFiltersOpen, setCandidateFiltersOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateSignal, setCandidateSignal] = useState<CandidateSignalFilter>("all");
  const [candidateDesignation, setCandidateDesignation] = useState("all");
  const [candidateCoe, setCandidateCoe] = useState("all");
  const [candidateSkillData, setCandidateSkillData] = useState<SkillDataFilter>("all");
  const [minSkill, setMinSkill] = useState(0);
  const [minCompetency, setMinCompetency] = useState(0);
  const [minAvailable, setMinAvailable] = useState(0);
  const [meetsCapacityOnly, setMeetsCapacityOnly] = useState(false);
  const [minRelevantProjects, setMinRelevantProjects] = useState(0);
  const [relevantExperienceOnly, setRelevantExperienceOnly] = useState(false);
  const [candidateSort, setCandidateSort] = useState<CandidateSort>("composite");
  const [topN, setTopN] = useState(15);
  const [topNInput, setTopNInput] = useState("15");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [dealDetailsOpen, setDealDetailsOpen] = useState(false);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [assignEmployeeId, setAssignEmployeeId] = useState<string | null>(null);

  const roleMixCoes = useQuery({ queryKey: ["role-mix-coes"], queryFn: api.roleMixCoes });
  const recommendation = useQuery({
    queryKey: ["recommendation", rowIndex, topN, includeParams, includeBelowCapacity, nearCapacityTolerancePct],
    queryFn: () => api.recommendationsForPipelineRow(rowIndex, topN, includeParams, includeBelowCapacity, nearCapacityTolerancePct),
});

  const selected = recommendation.data?.pipeline_row;
  const topCandidate =
    recommendation.data && !recommendation.data.hire_vs_redeploy_flag && recommendation.data.has_skillset && recommendation.data.candidates.length > 0
      ? recommendation.data.candidates[0]
      : null;

  const designationOptions = buildNormalizedOptions((recommendation.data?.candidates ?? []).map((c) => c.job_name));
  const coeOptions = (roleMixCoes.data ?? []).map((c) => c.coe).sort();
  const candidatesWithUnknownCoe = (recommendation.data?.candidates ?? []).some((c) => !c.coe);
  const filteredCandidates = filterAndSortCandidates(recommendation.data?.candidates ?? [], {
    search: candidateSearch,
    signal: candidateSignal,
    designation: candidateDesignation,
    coe: candidateCoe,
    skillData: candidateSkillData,
    minSkill,
    minCompetency,
    minAvailable,
    meetsCapacityOnly,
    minRelevantProjects,
    relevantExperienceOnly,
    sort: candidateSort,
    includeSkill: includeParams.skill,
    includeAvailability: includeParams.availability,
    includeCoeAffinity: includeParams.coe_affinity,
  });

  const hasActiveCandidateFilters =
    candidateSearch !== "" ||
    candidateSignal !== "all" ||
    candidateDesignation !== "all" ||
    candidateCoe !== "all" ||
    candidateSkillData !== "all" ||
    minSkill > 0 ||
    minCompetency > 0 ||
    minAvailable > 0 ||
    meetsCapacityOnly ||
    minRelevantProjects > 0 ||
    relevantExperienceOnly ;

  const candidateFilterCount = [
    candidateSignal !== "all",
    candidateDesignation !== "all",
    candidateCoe !== "all",
    candidateSkillData !== "all",
    minSkill > 0,
    minCompetency > 0,
    minAvailable > 0,
    meetsCapacityOnly,
    minRelevantProjects > 0,
    relevantExperienceOnly,
  ].filter(Boolean).length;
  const clearCandidateFilters = () => {
    setCandidateSearch("");
    setCandidateSignal("all");
    setCandidateDesignation("all");
    setCandidateCoe("all");
    setCandidateSkillData("all");
    setMinSkill(0);
    setMinCompetency(0);
    setMinAvailable(0);
    setMeetsCapacityOnly(false);
    setMinRelevantProjects(0);
    setRelevantExperienceOnly(false);
  };

  if (recommendation.isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-40" />
          <FieldGridSkeleton count={6} className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 border-t border-gray-100 pt-3" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <CandidateCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (recommendation.error) return <ErrorState message="Could not compute recommendations." />;
  if (!recommendation.data) return null;

  return (
    <div className="space-y-4">
      {selected && (
        <DecisionHeader
          selected={selected}
          dealComposition={recommendation.data.deal_composition}
          skillsetText={recommendation.data.request.skillset_text}
          requiredPhrases={recommendation.data.request.required_phrases}
          hireFlag={recommendation.data.hire_vs_redeploy_flag}
          hasSkillset={recommendation.data.has_skillset}
          topCandidate={topCandidate}
          dealDetailsOpen={dealDetailsOpen}
          onToggleDealDetails={() => setDealDetailsOpen((v) => !v)}
          onSelectSibling={onSelectSibling}
          semanticMatchResult={semanticMatchResult}
          semanticMatchPending={semanticMatchMutation.isPending}
          semanticMatchError={semanticMatchMutation.isError}
          onAskSemanticMatch={() => {
            semanticMatchMutation.mutate(rowIndex, {
              onSuccess: (data) => setSemanticMatchResult(data),
            });
          }}
          onOpenProfile={onOpenProfile}
        />
      )}

      {!projectCode && (
        <p className="text-[11px] text-gray-400 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
          Browsing candidates only — open this deal&apos;s Project Wizard to create/link a project and assign someone.
        </p>
      )}

      <OtherOptionsSection
        otherOptions={recommendation.data.other_options}
        windowDays={recommendation.data.other_options_window_days}
        includeParams={includeParams}
        onOpenProfile={onOpenProfile}
        linkedProjectId={projectCode ?? undefined}
        onAssign={(employeeId) => setAssignEmployeeId(employeeId)}
      />

      {recommendation.data.candidates.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-700">
              Candidates ({filteredCandidates.length}/{recommendation.data.candidates.length} shown)
            </p>
            <div className="flex items-center gap-2">
              {hasActiveCandidateFilters && (
                <button onClick={clearCandidateFilters} className="text-[11px] text-primary hover:underline whitespace-nowrap">
                  Clear filters
                </button>
              )}
              <AdvancedFiltersButton
                open={advancedFiltersOpen}
                include={includeParams}
                defaults={DEFAULT_INCLUDE_PARAMS}
                includeBelowCapacity={includeBelowCapacity}
                onClick={() => setAdvancedFiltersOpen((v) => !v)}
              />
              <button
                onClick={() => setCandidateFiltersOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
                  candidateFiltersOpen || candidateFilterCount > 0
                    ? "border-primary/40 text-primary bg-primary/5"
                    : "border-gray-200 text-gray-500"
                )}
              >
                <SlidersHorizontal className="w-3 h-3" />
                Filters{candidateFilterCount > 0 && ` (${candidateFilterCount})`}
                <ChevronDown className={cn("w-3 h-3 transition-transform", candidateFiltersOpen && "rotate-180")} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-gray-400">
              Showing top {recommendation.data.candidates.length} of {recommendation.data.candidate_pool_size} viable candidates
              {" "}({recommendation.data.total_employees_considered} employees scored
              {recommendation.data.has_skillset && (() => {
                const observed = recommendation.data.observed_skill_match_count ?? recommendation.data.genuine_skill_match_count ?? 0;
                const inferred = recommendation.data.inferred_skill_match_count ?? 0;
                const semantic = recommendation.data.semantic_only_match_count ?? 0;
                const parts: string[] = [];
                if (observed > 0) parts.push(`${observed} with observed skills`);
                if (inferred > 0) parts.push(`${inferred} inferred`);
                if (semantic > 0) parts.push(`${semantic} AI-matched`);
                if (parts.length > 0) return `, ${parts.join(" · ")}`;
                return ", no skill overlap found";
              })()})
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-500 whitespace-nowrap">Show top</span>
              <input
                type="number"
                min={1}
                max={2000}
                value={topNInput}
                onChange={(e) => setTopNInput(e.target.value)}
                onBlur={() => {
                  const parsed = Math.max(1, Math.min(2000, Number(topNInput) || 15));
                  setTopN(parsed);
                  setTopNInput(String(parsed));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="w-16 text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
              />
              {[15, 25, 50].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setTopN(n);
                    setTopNInput(String(n));
                  }}
                  className={cn(
                    "text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
                    topN === n ? "bg-primary/10 border-primary text-primary" : "border-gray-200 text-gray-500"
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => {
                  const all = recommendation.data!.candidate_pool_size;
                  setTopN(all);
                  setTopNInput(String(all));
                }}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
                  topN === recommendation.data.candidate_pool_size
                    ? "bg-primary/10 border-primary text-primary"
                    : "border-gray-200 text-gray-500"
                )}
              >
                Everyone
              </button>
            </div>
          </div>
          <input
            value={candidateSearch}
            onChange={(e) => setCandidateSearch(e.target.value)}
            placeholder="Search employee ID, role, or skill…"
            className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
          />
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
          {candidateFiltersOpen && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 space-y-2.5">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Signal</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {([
                    ["all", "All"],
                    ["redeploy", "Redeploy"],
                    ["training", "Needs training"],
                    ["hire", "Hire signal"],
                    ["not_assessed", "Not assessed"],
                  ] as [CandidateSignalFilter, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setCandidateSignal(value)}
                      className={cn(
                        "text-[11px] px-2 py-1 rounded-lg border transition bg-white",
                        candidateSignal === value ? "bg-primary/10 border-primary text-primary" : "border-gray-200 text-gray-500"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <FilterSelect label="Designation" value={candidateDesignation} onChange={setCandidateDesignation}>
                  <option value="all">All</option>
                  {designationOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </FilterSelect>
                <FilterSelect label="CoE" value={candidateCoe} onChange={setCandidateCoe}>
                  <option value="all">All</option>
                  {coeOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  {candidatesWithUnknownCoe && <option value={UNKNOWN_COE}>Not determined</option>}
                </FilterSelect>
                <FilterSelect
                  label="Skill data"
                  value={candidateSkillData}
                  onChange={(v) => setCandidateSkillData(v as SkillDataFilter)}
                >
                  <option value="all">All</option>
                  {(Object.entries(SKILL_DATA_LABEL) as [Exclude<SkillDataFilter, "all">, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <RangeFilter label="Min skill" value={minSkill} onChange={setMinSkill} max={100} step={10} suffix="%" />
                <RangeFilter label="Min competency" value={minCompetency} onChange={setMinCompetency} max={100} step={10} suffix="%" />
                <RangeFilter label="Min available" value={minAvailable} onChange={setMinAvailable} max={100} step={10} suffix="%" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <RangeFilter label="Min relevant projects" value={minRelevantProjects} onChange={setMinRelevantProjects} max={10} step={1} suffix="" />
                <label className="flex items-end pb-1.5 gap-1.5 text-[11px] text-gray-500 whitespace-nowrap">
                  <input type="checkbox" checked={relevantExperienceOnly} onChange={(e) => setRelevantExperienceOnly(e.target.checked)} />
                  Has relevant experience only
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-gray-500 whitespace-nowrap">
                  <input type="checkbox" checked={meetsCapacityOnly} onChange={(e) => setMeetsCapacityOnly(e.target.checked)} />
                  Meets capacity
                </label>

                <select
                  value={candidateSort}
                  onChange={(e) => setCandidateSort(e.target.value as CandidateSort)}
                  className="flex-1 text-[11px] px-1.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600"
                >
                  <option value="composite">Sort: best match</option>
                  <option value="skill">Sort: skill match</option>
                  <option value="competency">Sort: competency</option>
                  <option value="available">Sort: availability</option>
                  <option value="experience">Sort: relevant experience</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {filteredCandidates.map((c, i) => (
          <CandidateRow
            key={c.employee_id}
            candidate={c}
            rank={i + 1}
            isTopPick={topCandidate?.employee_id === c.employee_id}
            isExpanded={expandedCandidateId === c.employee_id}
            onToggleExpand={() => setExpandedCandidateId((prev) => (prev === c.employee_id ? null : c.employee_id))}
            onOpenProfile={(tab, skillMatchContext) => onOpenProfile(c.employee_id, tab, skillMatchContext)}
            includeParams={includeParams}
            onAssign={projectCode ? () => setAssignEmployeeId(c.employee_id) : undefined}
          />
        ))}
        {recommendation.data.candidates.length === 0 && (
          <p className="text-sm text-gray-400 italic">No candidates with available capacity were found.</p>
        )}
        {recommendation.data.candidates.length > 0 && filteredCandidates.length === 0 && (
          <p className="text-sm text-gray-400 italic">No candidates match the current filters.</p>
        )}
      </div>

      {assignEmployeeId && projectCode && (
        <AssignWithOverAllocationCheck
          employeeId={assignEmployeeId}
          projectId={projectCode}
          defaultStartDate={projectDates?.startDate}
          defaultEndDate={projectDates?.endDate}
          onClose={() => setAssignEmployeeId(null)}
          onAssigned={() => { setAssignEmployeeId(null); onAssigned?.(); }}
        />
      )}
    </div>
  );
}

function DecisionHeader({
  selected,
  dealComposition,
  skillsetText,
  requiredPhrases,
  hireFlag,
  hasSkillset,
  topCandidate,
  dealDetailsOpen,
  onToggleDealDetails,
  onSelectSibling,
  semanticMatchResult,
  semanticMatchPending,
  semanticMatchError,
  onAskSemanticMatch,
  onOpenProfile,
}: {
  selected: NonNullable<RecommendationResult["pipeline_row"]>;
  dealComposition: DealCompositionRow[];
  skillsetText: string;
  requiredPhrases: string[];
  hireFlag: boolean;
  hasSkillset: boolean;
  topCandidate: RecommendationCandidate | null;
  dealDetailsOpen: boolean;
  onToggleDealDetails: () => void;
  onSelectSibling: (rowIndex: number) => void;
  semanticMatchResult?: SemanticMatchResult;
  semanticMatchPending: boolean;
  semanticMatchError: boolean;
  onAskSemanticMatch: () => void;
  onOpenProfile: (employeeId: string, tab: ProfileTab, skillMatchContext?: SkillMatchContext) => void;
}) {
  const [classificationProofOpen, setClassificationProofOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            {selected.resources_requested ?? "Role TBD"} · {selected.client ?? "Unnamed client"}
            {selected.cluster != null && ` · Cluster ${selected.cluster}`}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {selected.requested_pct && `Requesting at ${selected.requested_pct}%`}
            {selected.requested_pct && selected.likely_start_date && " · "}
            {selected.likely_start_date && `Likely start ${selected.likely_start_date}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {selected.status && <Badge variant="default">{selected.status}</Badge>}
          {selected.priority && <Badge variant="default">{selected.priority}</Badge>}
        </div>
      </div>

      {(skillsetText || requiredPhrases.length > 0) && (
        <div className="border-t border-gray-100 pt-2.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-gray-400">Required skillset</p>
            {selected.skillset_coe_categories.length > 0 && (
              <button
                onClick={() => setClassificationProofOpen(true)}
                className="flex items-center gap-1 hover:opacity-75 transition"
                title="Click to see the proof behind this classification"
              >
                {selected.skillset_coe_categories.map((cat) => (
                  <span
                    key={cat}
                    className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500"
                  >
                    {cat}
                  </span>
                ))}
              </button>
            )}
          </div>
          {skillsetText && <p className="text-xs text-gray-600 mb-1.5">{skillsetText}</p>}
          <div className="flex flex-wrap gap-1.5">
            {requiredPhrases.map((p) => (
              <Badge key={p} variant="default">{p}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 pt-2">
        <button
          onClick={onToggleDealDetails}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary transition"
        >
          Deal details
          <ChevronDown className={cn("w-3 h-3 transition-transform", dealDetailsOpen && "rotate-180")} />
        </button>
        {dealDetailsOpen && (
          <div className="mt-2.5 space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px]">
              <DealField label="Status" value={selected.status} />
              <DealField label="Priority" value={selected.priority} />
              <DealField label="Client Priority" value={selected.client_priority} />
              <DealField label="SOW Signed" value={selected.sow_signed} />
              <DealField label="EM" value={selected.em} />
              <DealField label="Request Type" value={selected.request_type} />
              <DealField label="Request Received" value={selected.request_received} />
              <DealField label="Original Requested Start" value={selected.original_requested_start_date} />
              <DealField label="Likely Start" value={selected.likely_start_date} />
              <DealField label="Start Date Confirmed" value={selected.start_date_confirmed} />
              <DealField label="Number of Weeks" value={selected.number_of_weeks} />
              <DealField label="Deal Stage" value={selected.deal_stage_hubspot} />
            </div>
            {selected.comments && (
              <p className="text-[11px] text-gray-500 leading-relaxed">
                <span className="text-gray-400">Comments: </span>
                {selected.comments}
              </p>
            )}
            {dealComposition.length > 1 && (
              <div>
                <p className="text-[11px] text-gray-400 mb-1.5">
                  Team composition for this deal ({dealComposition.length} roles)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dealComposition.map((sib) => (
                    <button
                      key={sib.row_index}
                      onClick={() => onSelectSibling(sib.row_index)}
                      disabled={sib.is_current}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-lg border transition",
                        sib.is_current
                          ? "bg-primary text-white border-primary cursor-default"
                          : "border-gray-200 text-gray-600 hover:border-primary hover:text-primary"
                      )}
                    >
                      {sib.resources_requested ?? "Role TBD"}
                      {sib.requested_pct && ` · ${sib.requested_pct}%`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 pt-3">
        {hireFlag ? (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              No strong internal fit found -- this is a <strong>hire signal</strong>, not a redeploy opportunity.
            </div>
            {semanticMatchResult ? (
              <SemanticMatchPanel
                result={semanticMatchResult}
                onOpenProfile={(employeeId, skillMatchContext) => onOpenProfile(employeeId, "skills", skillMatchContext)}
              />
            ) : (
              <div className="space-y-1.5">
                <button
                  onClick={onAskSemanticMatch}
                  disabled={semanticMatchPending}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-100 transition disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {semanticMatchPending ? "Asking AI…" : "Ask AI to search for a semantic match"}
                </button>
                {semanticMatchError && <p className="text-[11px] text-red-500">Could not reach the AI matcher -- try again.</p>}
              </div>
            )}
          </div>
        ) : !hasSkillset ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-gray-400"
            title="No skillset was specified for this request -- candidates are ranked by competency and availability only (all show &quot;Not assessed&quot;). Treat this as a hire-vs-redeploy unknown, not a real shortlist."
          >
            <Info size={13} className="flex-shrink-0" /> No skillset specified — ranked by competency/availability only
          </span>
        ) : topCandidate ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-emerald-800 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>
                Recommended: <strong>{topCandidate.employee_id}</strong> · {topCandidate.job_name ?? "Role unspecified"} ·{" "}
                {Math.round(topCandidate.composite_score * 100)}% match
              </span>
            </div>
            <button
              onClick={() =>
                onOpenProfile(topCandidate.employee_id, "skills", {
                  matchedSkills: topCandidate.matched_skills,
                  missingSkills: topCandidate.missing_skills,
                })
              }
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 transition whitespace-nowrap"
            >
              View profile
            </button>
          </div>
        ) : null}
      </div>
      {classificationProofOpen && (
        <Modal
          title={`Why ${selected.skillset_coe_categories.join(", ")}?`}
          subtitle="Proof from JMAN's real Pipeline Skillset reference sheet -- not inferred"
          onClose={() => setClassificationProofOpen(false)}
          widthClassName="max-w-xl"
        >
          <div className="p-5 space-y-3">
            <p className="text-xs text-gray-500">
              This deal&apos;s required skillset text is matched <strong>exactly</strong> (word-for-word) against
              JMAN&apos;s Skillset reference sheet. The category badge above comes straight from whichever reference
              row matched -- nothing here is guessed or re-derived.
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">This deal&apos;s skillset text</p>
              <p className="text-xs text-gray-700">{skillsetText}</p>
            </div>
            {selected.skillset_classification_proof.map((row, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Matched reference row</p>
                <p className="text-xs text-gray-600">{row.skills_combined}</p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-gray-400">coe_skill:</span>
                  <Badge variant="default">{row.coe_skill ?? "-"}</Badge>
                  <span className="text-[10px] text-gray-400">coe_skills_list:</span>
                  <Badge variant="default">{row.coe_skills_list ?? "-"}</Badge>
                </div>
                {row.coe_skill !== row.coe_skills_list && (
                  <p className="text-[11px] text-amber-600 pt-1">
                    Heads up: the reference sheet&apos;s two category columns disagree on this row -- the badge above
                    uses coe_skill.
                  </p>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// Full replacement for the old accordion (fallback tiers + best-fit-if-delayed,
// capped at 5/3 results): everyone scored who isn't already in the main
// Candidates list, same filter/sort engine, same CandidateRow rendering, plus
// an availability-by-date filter. No cap -- "Show everyone" is a real option.
function OtherOptionsSection({
  otherOptions,
  windowDays,
  includeParams,
  onOpenProfile,
  linkedProjectId,
  onAssign,
}: {
  // Optional/nullable on purpose: an un-restarted or older backend simply
  // won't have this field yet -- render nothing rather than crash.
  otherOptions?: RecommendationCandidate[] | null;
  windowDays?: number;
  includeParams: IncludeParams;
  onOpenProfile: (employeeId: string, tab: ProfileTab, skillMatchContext?: SkillMatchContext) => void;
  linkedProjectId?: string | null;
  onAssign?: (employeeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [signal, setSignal] = useState<CandidateSignalFilter>("all");
  const [designation, setDesignation] = useState("all");
  const [coe, setCoe] = useState("all");
  const [skillData, setSkillData] = useState<SkillDataFilter>("all");
  const [minSkill, setMinSkill] = useState(0);
  const [minCompetency, setMinCompetency] = useState(0);
  const [minAvailable, setMinAvailable] = useState(0);
  const [meetsCapacityOnly, setMeetsCapacityOnly] = useState(false);
  const [minRelevantProjects, setMinRelevantProjects] = useState(0);
  const [relevantExperienceOnly, setRelevantExperienceOnly] = useState(false);
  const [sort, setSort] = useState<CandidateSort>("composite");
  const [availableByDate, setAvailableByDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showN, setShowN] = useState(20);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!otherOptions || otherOptions.length === 0) return null;
  const windowDaysLabel = windowDays ?? 365;

  const designationOptions = buildNormalizedOptions(otherOptions.map((c) => c.job_name));
  const coeOptions = buildNormalizedOptions(otherOptions.map((c) => c.coe));
  const hasUnknownCoe = otherOptions.some((c) => !c.coe);

  const filteredBase = filterAndSortCandidates(otherOptions, {
    search, signal, designation, coe, skillData, minSkill, minCompetency, minAvailable,
    meetsCapacityOnly, minRelevantProjects, relevantExperienceOnly, sort,
    includeSkill: includeParams.skill,
    includeAvailability: includeParams.availability,
    includeCoeAffinity: includeParams.coe_affinity,
  });
  const filtered = availableByDate
    ? filteredBase.filter((c) => c.meets_requested_capacity || (c.earliest_available_date != null && c.earliest_available_date <= availableByDate))
    : filteredBase;
  const shown = filtered.slice(0, showN);

  const hasActiveFilters =
  search !== "" || signal !== "all" || designation !== "all" || coe !== "all" || skillData !== "all" ||
  minSkill > 0 || minCompetency > 0 || minAvailable > 0 || meetsCapacityOnly ||
  minRelevantProjects > 0 || relevantExperienceOnly || availableByDate !== "";

const filterCount = [
  signal !== "all", designation !== "all", coe !== "all", skillData !== "all",
  minSkill > 0, minCompetency > 0, minAvailable > 0, meetsCapacityOnly,
 minRelevantProjects > 0, relevantExperienceOnly, availableByDate !== "",
].filter(Boolean).length;

  const clearFilters = () => {
  setSearch(""); setSignal("all"); setDesignation("all"); setCoe("all"); setSkillData("all");
  setMinSkill(0); setMinCompetency(0); setMinAvailable(0); setMeetsCapacityOnly(false);
  setMinRelevantProjects(0); setRelevantExperienceOnly(false); setAvailableByDate("");
};

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
      >
        <span>Other options to consider ({otherOptions.length})</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-gray-100 p-3.5 space-y-3">
          <p className="text-[11px] text-gray-400">
            Everyone else scored for this role — same engine and ranking parameters as Candidates above.
            Availability lookahead: {windowDaysLabel} days.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee ID, role, skill…"
              className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
            />
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-[11px] text-primary hover:underline whitespace-nowrap">
                Clear
              </button>
            )}
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
                filtersOpen || filterCount > 0 ? "border-primary/40 text-primary bg-primary/5" : "border-gray-200 text-gray-500"
              )}
            >
              <SlidersHorizontal className="w-3 h-3" />
              Filters{filterCount > 0 && ` (${filterCount})`}
              <ChevronDown className={cn("w-3 h-3 transition-transform", filtersOpen && "rotate-180")} />
            </button>
          </div>
          {filtersOpen && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 space-y-2.5">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Signal</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {([
                    ["all", "All"],
                    ["redeploy", "Redeploy"],
                    ["training", "Needs training"],
                    ["hire", "Hire signal"],
                    ["not_assessed", "Not assessed"],
                  ] as [CandidateSignalFilter, string][]).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setSignal(v)}
                      className={cn(
                        "text-[11px] px-2 py-1 rounded-lg border transition bg-white",
                        signal === v ? "bg-primary/10 border-primary text-primary" : "border-gray-200 text-gray-500"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <FilterSelect label="Designation" value={designation} onChange={setDesignation}>
                  <option value="all">All</option>
                  {designationOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </FilterSelect>
                <FilterSelect label="CoE" value={coe} onChange={setCoe}>
                  <option value="all">All</option>
                  {coeOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  {hasUnknownCoe && <option value={UNKNOWN_COE}>Not determined</option>}
                </FilterSelect>
                <FilterSelect label="Skill data" value={skillData} onChange={(v) => setSkillData(v as SkillDataFilter)}>
                  <option value="all">All</option>
                  {(Object.entries(SKILL_DATA_LABEL) as [Exclude<SkillDataFilter, "all">, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <RangeFilter label="Min skill" value={minSkill} onChange={setMinSkill} max={100} step={10} suffix="%" />
                <RangeFilter label="Min competency" value={minCompetency} onChange={setMinCompetency} max={100} step={10} suffix="%" />
                <RangeFilter label="Min available" value={minAvailable} onChange={setMinAvailable} max={100} step={10} suffix="%" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <RangeFilter label="Min relevant projects" value={minRelevantProjects} onChange={setMinRelevantProjects} max={10} step={1} suffix="" />
                <label className="flex items-end pb-1.5 gap-1.5 text-[11px] text-gray-500 whitespace-nowrap">
                  <input type="checkbox" checked={relevantExperienceOnly} onChange={(e) => setRelevantExperienceOnly(e.target.checked)} />
                  Has relevant experience only
                </label>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Available by date</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={availableByDate}
                    onChange={(e) => setAvailableByDate(e.target.value)}
                    className="text-[11px] px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600"
                  />
                  <span className="text-[10px] text-gray-400">
                    Shows people free now, or free by this date (within the {windowDaysLabel}-day lookahead)
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-gray-500 whitespace-nowrap">
                  <input type="checkbox" checked={meetsCapacityOnly} onChange={(e) => setMeetsCapacityOnly(e.target.checked)} />
                  Meets capacity now
                </label>

                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as CandidateSort)}
                  className="flex-1 text-[11px] px-1.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600"
                >
                  <option value="composite">Sort: best match</option>
                  <option value="skill">Sort: skill match</option>
                  <option value="competency">Sort: competency</option>
                  <option value="available">Sort: availability</option>
                  <option value="experience">Sort: relevant experience</option>
                </select>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-gray-400">
              Showing {shown.length} of {filtered.length} filtered ({otherOptions.length} total)
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-500 whitespace-nowrap">Show</span>
              {[10, 20, 50, 100].map((n) => (
                <button
                  key={n}
                  onClick={() => setShowN(n)}
                  className={cn(
                    "text-[11px] px-2 py-1 rounded-lg border transition",
                    showN === n ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-500"
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setShowN(otherOptions.length)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-lg border transition",
                  showN >= otherOptions.length ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-500"
                )}
              >
                Everyone
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {shown.map((c, i) => (
              <CandidateRow
                key={c.employee_id}
                candidate={c}
                rank={i + 1}
                isTopPick={false}
                isExpanded={expandedId === c.employee_id}
                onToggleExpand={() => setExpandedId((prev) => (prev === c.employee_id ? null : c.employee_id))}
                onOpenProfile={(tab, skillMatchContext) => onOpenProfile(c.employee_id, tab, skillMatchContext)}
                includeParams={includeParams}
                onAssign={linkedProjectId ? () => onAssign?.(c.employee_id) : undefined}
              />
            ))}
            {shown.length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-2">No one matches the current filters.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
