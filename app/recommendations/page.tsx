"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Sparkles, SlidersHorizontal, XCircle, Users, List } from "lucide-react";
import {
  api,
  DEFAULT_INCLUDE_PARAMS,
  type DealCompositionRow,
  type DealSummary,
  type EmployeeProjectHistoryRow,
  type IncludeParams,
  type PipelineDemandRow,
  type RecommendationCandidate,
  type RecommendationResult,
  type SemanticMatchResult,
  type TeamRoleResult,
} from "@/lib/api";
import { Badge } from "@/components/shared/Badge";
import { HoldChip, HoldDot } from "@/components/shared/HoldFlag";
import { LoadingState, ErrorState } from "@/components/shared/EmptyState";
import { Skeleton, ListSkeleton, FieldGridSkeleton, CandidateCardSkeleton } from "@/components/shared/Skeleton";
import { EmployeeProfileModal, type ProfileTab, type SkillMatchContext } from "@/components/shared/EmployeeProfileModal";
import { Modal } from "@/components/shared/Modal";
import {
  type CandidateSignalFilter,
  type SkillDataFilter,
  type CandidateSort,
  type CandidateFilterOptions,
  SIGNAL_FILTER_TO_BUCKET,
  SKILL_DATA_LABEL,
  SIGNAL_LABEL,
  UNKNOWN_COE,
  friendlyConfidence,
  normalizeLabel,
  matchesNormalized,
  buildNormalizedOptions,
  filterAndSortCandidates,
  ADVANCED_PARAMS,
} from "@/components/shared/candidateFilters";
import { AdvancedFiltersButton, AdvancedFiltersPanel, RangeFilter, FilterSelect } from "@/components/shared/AdvancedFilters";
import { CandidateRow, ProjectHistoryModal } from "@/components/shared/CandidateRow";
import { cn } from "@/lib/utils";

type DemandSort = "date_asc" | "date_desc" | "client_asc" | "cluster_asc" | "priority_desc" | "status_asc";
type StartConfirmedFilter = "all" | "confirmed" | "unconfirmed";

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, complete: 4 };
const STATUS_RANK: Record<string, number> = { "not resourced": 0, "part resourced": 1, resourced: 2, complete: 3 };

function rankOf(map: Record<string, number>, value: string | null): number {
  return map[normalizeLabel(value).toLowerCase()] ?? 99;
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
      <RecommendationsPageInner />
    </Suspense>
  );
}

type ViewMode = "by-role" | "by-project";

function RecommendationsPageInner() {
  const [viewMode, setViewMode] = useState<ViewMode>("by-role");
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [openProfile, setOpenProfile] = useState<{ employeeId: string; tab: ProfileTab; skillMatchContext?: SkillMatchContext } | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const row = searchParams.get("row");
    if (row !== null && !Number.isNaN(Number(row))) setSelectedRow(Number(row));
  }, []);

  const [demandFiltersOpen, setDemandFiltersOpen] = useState(false);
  const [demandSearch, setDemandSearch] = useState("");
  const [demandSowFilter, setDemandSowFilter] = useState<"all" | "signed" | "unconfirmed">("all");
  const [demandLateOnly, setDemandLateOnly] = useState(false);
  const [demandCluster, setDemandCluster] = useState("all");
  const [demandDateFrom, setDemandDateFrom] = useState("");
  const [demandDateTo, setDemandDateTo] = useState("");
  const [demandStatus, setDemandStatus] = useState("all");
  const [demandPriority, setDemandPriority] = useState("all");
  const [demandClientPriority, setDemandClientPriority] = useState("all");
  const [demandRequestType, setDemandRequestType] = useState("all");
  const [demandStage, setDemandStage] = useState("all");
  const [demandStartConfirmed, setDemandStartConfirmed] = useState<StartConfirmedFilter>("all");
  const [demandSort, setDemandSort] = useState<DemandSort>("date_asc");

  // All 5 ranking parameters (skill, competency, availability, category match,
  // project count) are independently selectable in Advanced Filters -- the
  // selected subset gets its base weights renormalized to sum to 1.0, see
  // composite_score_v2() in scoring.py. Shared across both By Role and By
  // Project views (one panel governs ranking parameters regardless of view) --
  // and now also across every role tab within a project, so switching roles
  // doesn't reset your chosen ranking parameters.
  const [includeParams, setIncludeParams] = useState<IncludeParams>(DEFAULT_INCLUDE_PARAMS);
  // Separate from includeParams: a hard pool gate, not a ranking weight. Off by
  // default -- someone who can't actually take the requested % stays out of
  // Candidates regardless of which ranking parameters are selected.
  const [includeBelowCapacity, setIncludeBelowCapacity] = useState(false);
  // How many points below the requested % still counts as a real, actionable
  // option in the main Candidates list (not a fixed number -- fully adjustable
  // via the Advanced Filters slider). Shared across By Role and By Project,
  // same pattern as includeBelowCapacity above.
  const [nearCapacityTolerancePct, setNearCapacityTolerancePct] = useState(25);

  const [pipelineCollapsed, setPipelineCollapsed] = useState(false);

  // Project-mode state
  const [selectedDealKey, setSelectedDealKey] = useState<string | null>(null);
  // Which role tab is active within the selected deal -- null means "default to
  // the first role", reset whenever the deal changes so a new deal doesn't
  // inherit a stale tab selection from the previous one.
  const [selectedRoleRowIndex, setSelectedRoleRowIndex] = useState<number | null>(null);
  // "tabs": one role's full detail at a time. "all": every role stacked as a
  // lazy-loading accordion on one page -- no tab-switching, but each section
  // only fetches its recommendation once expanded so an 11-role deal doesn't
  // fire 11 heavy scoring requests at once.
  const [projectRoleViewMode, setProjectRoleViewMode] = useState<"tabs" | "all">("tabs");
  const [expandedAllRoles, setExpandedAllRoles] = useState<Set<number>>(new Set());
  const [dealListSearch, setDealListSearch] = useState("");
  const [dealListPriority, setDealListPriority] = useState("all");
  const [dealListStatus, setDealListStatus] = useState("all");
  const [dealListCluster, setDealListCluster] = useState("all");
  const [dealListClientPriority, setDealListClientPriority] = useState("all");
  const [dealListRequestType, setDealListRequestType] = useState("all");
  const [dealListStage, setDealListStage] = useState("all");
  const [dealListStartConfirmed, setDealListStartConfirmed] = useState<"all" | "confirmed" | "unconfirmed">("all");
  const [dealListDateFrom, setDealListDateFrom] = useState("");
  const [dealListDateTo, setDealListDateTo] = useState("");
  const [dealListLateOnly, setDealListLateOnly] = useState(false);
  const [dealListSow, setDealListSow] = useState<"all" | "signed" | "unconfirmed">("all");
  const [dealListSort, setDealListSort] = useState<"date_asc" | "date_desc" | "client_asc" | "cluster_asc" | "priority_desc" | "role_count_desc" | "status_asc">("date_asc");
  const [dealListFiltersOpen, setDealListFiltersOpen] = useState(false);
  const [projectTopN, setProjectTopN] = useState(15);
  const [projectTopNInput, setProjectTopNInput] = useState("15");

  // On narrow screens the two panels stack instead of sitting side by side, so picking
  // a deal from a 293-row list otherwise leaves the recommendation buried below it --
  // collapse the list out of the way so the result is the first thing visible. Desktop
  // already shows both panels at once side by side, so this only fires under the lg
  // breakpoint (matches the grid's own lg:grid-cols switch below).
  const handleSelectRow = (rowIndex: number) => {
    setSelectedRow(rowIndex);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setPipelineCollapsed(true);
    }
  };

  const pipeline = useQuery({ queryKey: ["pipeline-forecast"], queryFn: api.pipelineForecast });
  const [coverageEnabled, setCoverageEnabled] = useState(false);
  const coverage = useQuery({
    queryKey: ["recommendations-coverage-summary"],
    queryFn: api.recommendationsCoverageSummary,
    enabled: coverageEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const dealsQuery = useQuery({
    queryKey: ["deals"],
    queryFn: api.listDeals,
    enabled: viewMode === "by-project",
  });
  const selectedDeal = dealsQuery.data?.find((d) => d.deal_key === selectedDealKey) ?? null;
  const projectTeamQuery = useQuery({
    queryKey: ["project-team", selectedDealKey, projectTopN, includeParams],
    queryFn: () => api.projectTeamRecommendation(selectedDeal!.row_indices, projectTopN, includeParams),
    enabled: viewMode === "by-project" && selectedDealKey !== null && selectedDeal !== null,
  });

  if (pipeline.isLoading) return <RecommendationsSkeleton />;
  if (pipeline.error) return <ErrorState message="Could not load pipeline demand." />;

  // Deal list filter options
  const allDeals = dealsQuery.data ?? [];
  const dealClusters = Array.from(new Set(allDeals.map((d) => d.cluster).filter((c): c is number => c != null))).sort((a, b) => a - b);
  const dealPriorityOptions = buildNormalizedOptions(allDeals.map((d) => d.priority));
  const dealStatusOptions = buildNormalizedOptions(allDeals.map((d) => d.status));
  const dealClientPriorityOptions = buildNormalizedOptions(allDeals.map((d) => d.client_priority));
  const dealRequestTypeOptions = buildNormalizedOptions(allDeals.map((d) => d.request_type));
  const dealStageOptions = buildNormalizedOptions(allDeals.map((d) => d.deal_stage_hubspot));
  const filteredDeals = filterAndSortDeals(allDeals, {
    search: dealListSearch,
    priority: dealListPriority,
    status: dealListStatus,
    cluster: dealListCluster,
    clientPriority: dealListClientPriority,
    requestType: dealListRequestType,
    stage: dealListStage,
    startConfirmed: dealListStartConfirmed,
    dateFrom: dealListDateFrom,
    dateTo: dealListDateTo,
    lateOnly: dealListLateOnly,
    sow: dealListSow,
    sort: dealListSort,
  });
  const dealFilterCount = [
    dealListPriority !== "all",
    dealListStatus !== "all",
    dealListCluster !== "all",
    dealListClientPriority !== "all",
    dealListRequestType !== "all",
    dealListStage !== "all",
    dealListStartConfirmed !== "all",
    dealListDateFrom !== "",
    dealListDateTo !== "",
    dealListLateOnly,
    dealListSow !== "all",
  ].filter(Boolean).length;
  const clearDealFilters = () => {
    setDealListSearch("");
    setDealListPriority("all");
    setDealListStatus("all");
    setDealListCluster("all");
    setDealListClientPriority("all");
    setDealListRequestType("all");
    setDealListStage("all");
    setDealListStartConfirmed("all");
    setDealListDateFrom("");
    setDealListDateTo("");
    setDealListLateOnly(false);
    setDealListSow("all");
  };

  const demandRows = (pipeline.data ?? []).filter((r) => r.skillset || r.resources_requested);

  const clusters = Array.from(new Set(demandRows.map((r) => r.cluster).filter((c): c is number => c != null))).sort(
    (a, b) => a - b
  );
  const statusOptions = buildNormalizedOptions(demandRows.map((r) => r.status));
  const priorityOptions = buildNormalizedOptions(demandRows.map((r) => r.priority));
  const clientPriorityOptions = buildNormalizedOptions(demandRows.map((r) => r.client_priority));
  const requestTypeOptions = buildNormalizedOptions(demandRows.map((r) => r.request_type));
  const stageOptions = buildNormalizedOptions(demandRows.map((r) => r.deal_stage_hubspot));

  const filteredDemandRows = filterAndSortDemand(demandRows, {
    search: demandSearch,
    sowFilter: demandSowFilter,
    lateOnly: demandLateOnly,
    cluster: demandCluster,
    dateFrom: demandDateFrom,
    dateTo: demandDateTo,
    status: demandStatus,
    priority: demandPriority,
    clientPriority: demandClientPriority,
    requestType: demandRequestType,
    stage: demandStage,
    startConfirmed: demandStartConfirmed,
    sort: demandSort,
  });
  const hasActiveDemandFilters =
    demandSearch !== "" ||
    demandSowFilter !== "all" ||
    demandLateOnly ||
    demandCluster !== "all" ||
    demandDateFrom !== "" ||
    demandDateTo !== "" ||
    demandStatus !== "all" ||
    demandPriority !== "all" ||
    demandClientPriority !== "all" ||
    demandRequestType !== "all" ||
    demandStage !== "all" ||
    demandStartConfirmed !== "all";
  const demandFilterCount = [
    demandSowFilter !== "all",
    demandLateOnly,
    demandCluster !== "all",
    demandDateFrom !== "",
    demandDateTo !== "",
    demandStatus !== "all",
    demandPriority !== "all",
    demandClientPriority !== "all",
    demandRequestType !== "all",
    demandStage !== "all",
    demandStartConfirmed !== "all",
  ].filter(Boolean).length;
  const clearDemandFilters = () => {
    setDemandSearch("");
    setDemandSowFilter("all");
    setDemandLateOnly(false);
    setDemandCluster("all");
    setDemandDateFrom("");
    setDemandDateTo("");
    setDemandStatus("all");
    setDemandPriority("all");
    setDemandClientPriority("all");
    setDemandRequestType("all");
    setDemandStage("all");
    setDemandStartConfirmed("all");
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* View mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode("by-role")}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition",
            viewMode === "by-role"
              ? "bg-primary text-white border-primary"
              : "bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary"
          )}
        >
          <List className="w-3.5 h-3.5" />
          By Role
        </button>
        <button
          onClick={() => setViewMode("by-project")}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition",
            viewMode === "by-project"
              ? "bg-primary text-white border-primary"
              : "bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary"
          )}
        >
          <Users className="w-3.5 h-3.5" />
          By Project
        </button>
        {viewMode === "by-role" && (
          <div className="ml-3 flex items-center gap-3 text-xs flex-wrap">
            {coverage.data ? (
              <>
                <span className="font-semibold text-gray-700">
                  Pipeline coverage across {coverage.data.total_demand_rows} role-requests:
                </span>
                <Badge variant="eligible">{coverage.data.redeploy_ready_count} ready to redeploy</Badge>
                <Badge variant="trainable">{coverage.data.redeploy_with_training_count} need upskilling</Badge>
                <Badge variant="gap">{coverage.data.hire_signal_count} ({coverage.data.hire_signal_pct}%) need external hire</Badge>
                {coverage.data.no_skillset_specified_count > 0 && (
                  <Badge variant="pending">{coverage.data.no_skillset_specified_count} no skillset specified yet</Badge>
                )}
              </>
            ) : coverage.isFetching ? (
              <span className="text-gray-400 italic">Computing pipeline coverage…</span>
            ) : (
              <button
                onClick={() => setCoverageEnabled(true)}
                className="text-gray-400 hover:text-primary underline underline-offset-2 text-[11px]"
              >
                Load pipeline coverage stats
              </button>
            )}
          </div>
        )}
      </div>

      {/* Project-based view */}
      {viewMode === "by-project" && (
        <div className={cn("grid grid-cols-1 gap-4", pipelineCollapsed ? "lg:grid-cols-[44px_1fr]" : "lg:grid-cols-[320px_1fr]")}>
          {/* Left: Deal list */}
          {pipelineCollapsed ? (
            <>
              <button
                onClick={() => setPipelineCollapsed(false)}
                className="lg:hidden sticky top-0 z-10 flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm text-left"
              >
                <span className="text-xs font-medium text-gray-600">Deals ({allDeals.length})</span>
                <span className="flex items-center gap-1 text-[11px] text-primary flex-shrink-0">Tap to view <ChevronDown className="w-3.5 h-3.5" /></span>
              </button>
              <div className="hidden lg:flex rounded-xl border border-gray-200 bg-white flex-col items-center gap-3 py-3 lg:max-h-[calc(100dvh-180px)]">
                <button onClick={() => setPipelineCollapsed(false)} title="Expand deal list" className="text-gray-400 hover:text-primary transition">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <p className="text-[10px] text-gray-400 whitespace-nowrap [writing-mode:vertical-rl]">Deals ({allDeals.length})</p>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col lg:max-h-[calc(100dvh-180px)]">
              <div className="px-3 py-2.5 border-b border-gray-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPipelineCollapsed(true)} title="Collapse deal list" className="text-gray-400 hover:text-primary transition flex-shrink-0">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <p className="text-xs font-semibold text-gray-700">Deals ({filteredDeals.length}/{allDeals.length})</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(dealListSearch || dealFilterCount > 0) && (
                      <button onClick={clearDealFilters} className="text-[11px] text-primary hover:underline whitespace-nowrap">Clear</button>
                    )}
                    <button
                      onClick={() => setDealListFiltersOpen((v) => !v)}
                      className={cn(
                        "flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
                        dealListFiltersOpen || dealFilterCount > 0 ? "border-primary/40 text-primary bg-primary/5" : "border-gray-200 text-gray-500"
                      )}
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      Filters{dealFilterCount > 0 && ` (${dealFilterCount})`}
                      <ChevronDown className={cn("w-3 h-3 transition-transform", dealListFiltersOpen && "rotate-180")} />
                    </button>
                  </div>
                </div>
                <input
                  value={dealListSearch}
                  onChange={(e) => setDealListSearch(e.target.value)}
                  placeholder="Search client, solution, role…"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
                />
                {dealListFiltersOpen && (
                  <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <FilterSelect label="Status" value={dealListStatus} onChange={setDealListStatus}>
                        <option value="all">All</option>
                        {dealStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </FilterSelect>
                      <FilterSelect label="Priority" value={dealListPriority} onChange={setDealListPriority}>
                        <option value="all">All</option>
                        {dealPriorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                      </FilterSelect>
                      <FilterSelect label="Client priority" value={dealListClientPriority} onChange={setDealListClientPriority}>
                        <option value="all">All</option>
                        {dealClientPriorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                      </FilterSelect>
                      <FilterSelect label="SOW" value={dealListSow} onChange={(v) => setDealListSow(v as typeof dealListSow)}>
                        <option value="all">All</option>
                        <option value="signed">Signed</option>
                        <option value="unconfirmed">Unconfirmed</option>
                      </FilterSelect>
                      <FilterSelect label="Cluster" value={dealListCluster} onChange={setDealListCluster}>
                        <option value="all">All</option>
                        {dealClusters.map((c) => <option key={c} value={String(c)}>Cluster {c}</option>)}
                      </FilterSelect>
                      <FilterSelect label="Request type" value={dealListRequestType} onChange={setDealListRequestType}>
                        <option value="all">All</option>
                        {dealRequestTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </FilterSelect>
                      <FilterSelect label="Deal stage" value={dealListStage} onChange={setDealListStage}>
                        <option value="all">All</option>
                        {dealStageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </FilterSelect>
                      <FilterSelect
                        label="Start confirmed"
                        value={dealListStartConfirmed}
                        onChange={(v) => setDealListStartConfirmed(v as typeof dealListStartConfirmed)}
                      >
                        <option value="all">All</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="unconfirmed">Unconfirmed</option>
                      </FilterSelect>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Likely start from</label>
                        <input
                          type="date"
                          value={dealListDateFrom}
                          onChange={(e) => setDealListDateFrom(e.target.value)}
                          className="w-full text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Likely start to</label>
                        <input
                          type="date"
                          value={dealListDateTo}
                          onChange={(e) => setDealListDateTo(e.target.value)}
                          className="w-full text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDealListLateOnly((v) => !v)}
                        className={cn(
                          "text-[11px] px-2 py-1.5 rounded-lg border whitespace-nowrap transition",
                          dealListLateOnly ? "bg-red-50 border-red-200 text-red-700" : "border-gray-200 bg-white text-gray-500"
                        )}
                      >
                        Late notice only
                      </button>
                      <select
                        value={dealListSort}
                        onChange={(e) => setDealListSort(e.target.value as typeof dealListSort)}
                        className="flex-1 text-[11px] px-1.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600"
                      >
                        <option value="date_asc">Sort: earliest start ↑</option>
                        <option value="date_desc">Sort: earliest start ↓</option>
                        <option value="client_asc">Sort: client A–Z</option>
                        <option value="cluster_asc">Sort: cluster</option>
                        <option value="priority_desc">Sort: priority (urgent first)</option>
                        <option value="role_count_desc">Sort: most roles first</option>
                        <option value="status_asc">Sort: status (not resourced first)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {dealsQuery.isLoading && <p className="text-xs text-gray-400 italic px-3 py-4 text-center">Loading deals…</p>}
                {filteredDeals.map((deal) => (
                  <button
                    key={deal.deal_key}
                    onClick={() => {
                      setSelectedDealKey(deal.deal_key);
                      setSelectedRoleRowIndex(null);
                      setExpandedAllRoles(new Set());
                      if (typeof window !== "undefined" && window.innerWidth < 1024) setPipelineCollapsed(true);
                    }}
                    className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition ${selectedDealKey === deal.deal_key ? "bg-primary/5" : ""}`}
                  >
                    <p className="text-xs font-medium text-gray-700 truncate">{deal.client ?? "Unnamed client"}{deal.cluster != null && ` · Cluster ${deal.cluster}`}</p>
                    <p className="text-[11px] text-gray-400 truncate">{deal.solution ?? (deal.roles.map((r) => r.resources_requested).filter(Boolean).join(", ") || "No roles specified")}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{deal.role_count} role{deal.role_count !== 1 ? "s" : ""}</span>
                      {deal.sow_signed ? <Badge variant="billable">SOW signed</Badge> : <Badge variant="pending">unconfirmed</Badge>}
                      {deal.is_late_notice && <Badge variant="red">late notice</Badge>}
                      {deal.priority && <Badge variant="default">{deal.priority}</Badge>}
                      {deal.earliest_start && <span className="text-[10px] text-gray-400">{deal.earliest_start}</span>}
                    </div>
                  </button>
                ))}
                {!dealsQuery.isLoading && filteredDeals.length === 0 && (
                  <p className="text-xs text-gray-400 italic px-3 py-4 text-center">No deals match the current filters.</p>
                )}
              </div>
            </div>
          )}

          {/* Right: Team recommendation */}
          {/* min-w-0 is required here -- a CSS grid track defaults to min-width:auto,
              so without it a wide child (the role tab bar on an 11-role deal) expands
              the whole grid column instead of clipping/scrolling within it, dragging
              the entire page into horizontal scroll. */}
          <div className="min-w-0">
            {selectedDealKey === null ? (
              <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Select a deal to see the team recommendation</div>
            ) : projectTeamQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-48" />
                    <div className="h-3 bg-gray-100 rounded w-32" />
                    <div className="h-10 bg-gray-100 rounded" />
                  </div>
                ))}
              </div>
            ) : projectTeamQuery.error ? (
              <ErrorState message="Could not compute team recommendation." />
            ) : projectTeamQuery.data ? (
              <div className="space-y-3">
                {/* Coverage summary */}
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-4 flex-wrap text-xs">
                  <span className="font-semibold text-gray-700">
                    {selectedDeal?.client ?? "Deal"} · {projectTeamQuery.data.coverage_summary.total} roles
                  </span>
                  <Badge variant="eligible">{projectTeamQuery.data.coverage_summary.assigned} assigned</Badge>
                  {projectTeamQuery.data.coverage_summary.hire_signal > 0 && (
                    <Badge variant="gap">{projectTeamQuery.data.coverage_summary.hire_signal} hire signal{projectTeamQuery.data.coverage_summary.hire_signal > 1 ? "s" : ""}</Badge>
                  )}
                  {projectTeamQuery.data.coverage_summary.conflict > 0 && (
                    <Badge variant="amber">{projectTeamQuery.data.coverage_summary.conflict} conflict{projectTeamQuery.data.coverage_summary.conflict > 1 ? "s" : ""}</Badge>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-gray-500">Candidates per role:</span>
                    <input
                      type="number" min={1} max={2000}
                      value={projectTopNInput}
                      onChange={(e) => setProjectTopNInput(e.target.value)}
                      onBlur={() => {
                        const p = Math.max(1, Math.min(2000, Number(projectTopNInput) || 15));
                        setProjectTopN(p); setProjectTopNInput(String(p));
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="w-14 text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
                    />
                  </div>
                </div>

                {/* Roles container -- sits right after the deal/project details
                    (coverage summary) card. Its own overflow-x-auto is scoped to just
                    this row (min-w-0 on the grid column above stops it from dragging
                    the whole page into horizontal scroll on high-role-count deals). */}
                <div className="rounded-xl border border-gray-200 bg-white p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-gray-500">
                      {projectTeamQuery.data.roles.length} role{projectTeamQuery.data.roles.length !== 1 ? "s" : ""} in this deal
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setProjectRoleViewMode("tabs")}
                        className={cn(
                          "text-[11px] px-2 py-1 rounded-lg border transition",
                          projectRoleViewMode === "tabs" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-500"
                        )}
                      >
                        One at a time
                      </button>
                      <button
                        onClick={() => setProjectRoleViewMode("all")}
                        className={cn(
                          "text-[11px] px-2 py-1 rounded-lg border transition",
                          projectRoleViewMode === "all" ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-500"
                        )}
                      >
                        All roles, one page
                      </button>
                    </div>
                  </div>

                  {projectRoleViewMode === "tabs" ? (
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1">
                      {projectTeamQuery.data.roles.map((roleResult) => {
                        const active = (selectedRoleRowIndex ?? projectTeamQuery.data.roles[0]?.row_index) === roleResult.row_index;
                        const dotColor =
                          roleResult.status === "assigned" ? "bg-emerald-500" :
                          roleResult.status === "hire_signal" ? "bg-red-500" : "bg-amber-500";
                        return (
                          <button
                            key={roleResult.row_index}
                            onClick={() => setSelectedRoleRowIndex(roleResult.row_index)}
                            className={cn(
                              "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border whitespace-nowrap transition flex-shrink-0",
                              active ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary"
                            )}
                          >
                            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", active ? "bg-white" : dotColor)} />
                            {roleResult.pipeline_row?.resources_requested ?? "Role"}
                            <span className={active ? "text-white/70" : "text-gray-400"}>{roleResult.requested_pct}%</span>
                            {roleResult.assigned && (
                              <span className={active ? "text-white/70" : "text-gray-400"}>· {roleResult.assigned.employee_id}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400">
                      Click a role below to expand its full recommendation — collapsed roles haven&apos;t loaded yet, so opening a deal doesn&apos;t fire every role&apos;s scoring at once.
                    </p>
                  )}
                </div>

                {projectRoleViewMode === "tabs" ? (
                  (() => {
                    const activeRowIndex = selectedRoleRowIndex ?? projectTeamQuery.data.roles[0]?.row_index ?? null;
                    if (activeRowIndex === null) return null;
                    return (
                      <RoleRecommendationDetail
                        key={activeRowIndex}
                        rowIndex={activeRowIndex}
                        includeParams={includeParams}
                        setIncludeParams={setIncludeParams}
                        includeBelowCapacity={includeBelowCapacity}
                        setIncludeBelowCapacity={setIncludeBelowCapacity}
                        nearCapacityTolerancePct={nearCapacityTolerancePct}
                        setNearCapacityTolerancePct={setNearCapacityTolerancePct}
                        onOpenProfile={(employeeId, tab, skillMatchContext) => setOpenProfile({ employeeId, tab, skillMatchContext })}
                        onSelectSibling={setSelectedRoleRowIndex}
                      />
                    );
                  })()
                ) : (
                  <div className="space-y-2.5">
                    {projectTeamQuery.data.roles.map((roleResult) => {
                      const isOpen = expandedAllRoles.has(roleResult.row_index);
                      const dotColor =
                        roleResult.status === "assigned" ? "bg-emerald-500" :
                        roleResult.status === "hire_signal" ? "bg-red-500" : "bg-amber-500";
                      return (
                        <div key={roleResult.row_index} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                          <button
                            onClick={() =>
                              setExpandedAllRoles((prev) => {
                                const next = new Set(prev);
                                if (next.has(roleResult.row_index)) next.delete(roleResult.row_index);
                                else next.add(roleResult.row_index);
                                return next;
                              })
                            }
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition"
                          >
                            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", dotColor)} />
                            <span className="text-sm font-semibold text-gray-800">{roleResult.pipeline_row?.resources_requested ?? "Role"}</span>
                            <span className="text-xs text-gray-400">{roleResult.requested_pct}%</span>
                            {roleResult.assigned && (
                              <span className="text-xs text-gray-500">Recommended: {roleResult.assigned.employee_id} · {Math.round(roleResult.assigned.composite_score * 100)}% match</span>
                            )}
                            {roleResult.status === "hire_signal" && <Badge variant="gap">hire signal</Badge>}
                            {roleResult.status === "conflict" && <Badge variant="amber">conflict</Badge>}
                            <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform ml-auto flex-shrink-0", isOpen && "rotate-180")} />
                          </button>
                          {isOpen && (
                            <div className="border-t border-gray-100 p-3.5">
                              <RoleRecommendationDetail
                                key={roleResult.row_index}
                                rowIndex={roleResult.row_index}
                                includeParams={includeParams}
                                setIncludeParams={setIncludeParams}
                                includeBelowCapacity={includeBelowCapacity}
                                setIncludeBelowCapacity={setIncludeBelowCapacity}
                                nearCapacityTolerancePct={nearCapacityTolerancePct}
                                setNearCapacityTolerancePct={setNearCapacityTolerancePct}
                                onOpenProfile={(employeeId, tab, skillMatchContext) => setOpenProfile({ employeeId, tab, skillMatchContext })}
                                onSelectSibling={(ri) => {
                                  setExpandedAllRoles((prev) => new Set(prev).add(ri));
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Role-based view */}
      {viewMode === "by-role" && (
      <div className={cn("grid grid-cols-1 gap-4", pipelineCollapsed ? "lg:grid-cols-[44px_1fr]" : "lg:grid-cols-[320px_1fr]")}>
        {pipelineCollapsed ? (
          <>
            {/* Mobile: a sticky horizontal bar, always reachable without scrolling back up. */}
            <button
              onClick={() => setPipelineCollapsed(false)}
              className="lg:hidden sticky top-0 z-10 flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm text-left"
            >
              <span className="text-xs font-medium text-gray-600">Pipeline Demand ({demandRows.length})</span>
              <span className="flex items-center gap-1 text-[11px] text-primary flex-shrink-0">
                Tap to view <ChevronDown className="w-3.5 h-3.5" />
              </span>
            </button>
            {/* Desktop: thin vertical strip alongside the detail panel. */}
            <div className="hidden lg:flex rounded-xl border border-gray-200 bg-white flex-col items-center gap-3 py-3 lg:max-h-[calc(100dvh-180px)]">
              <button
                onClick={() => setPipelineCollapsed(false)}
                title="Expand pipeline list"
                className="text-gray-400 hover:text-primary transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <p className="text-[10px] text-gray-400 whitespace-nowrap [writing-mode:vertical-rl]">
                Pipeline ({demandRows.length})
              </p>
            </div>
          </>
        ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col lg:max-h-[calc(100dvh-180px)]">
          <div className="px-3 py-2.5 border-b border-gray-100 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPipelineCollapsed(true)}
                  title="Collapse pipeline list"
                  className="text-gray-400 hover:text-primary transition flex-shrink-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <p className="text-xs font-semibold text-gray-700">
                  Pipeline Demand ({filteredDemandRows.length}/{demandRows.length})
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasActiveDemandFilters && (
                  <button onClick={clearDemandFilters} className="text-[11px] text-primary hover:underline whitespace-nowrap">
                    Clear filters
                  </button>
                )}
                <button
                  onClick={() => setDemandFiltersOpen((v) => !v)}
                  className={cn(
                    "flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
                    demandFiltersOpen || demandFilterCount > 0
                      ? "border-primary/40 text-primary bg-primary/5"
                      : "border-gray-200 text-gray-500"
                  )}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Filters{demandFilterCount > 0 && ` (${demandFilterCount})`}
                  <ChevronDown className={cn("w-3 h-3 transition-transform", demandFiltersOpen && "rotate-180")} />
                </button>
              </div>
            </div>
            <input
              value={demandSearch}
              onChange={(e) => setDemandSearch(e.target.value)}
              placeholder="Search client, role, skill, solution…"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
            />
            {demandFiltersOpen && (
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <FilterSelect label="Status" value={demandStatus} onChange={setDemandStatus}>
                    <option value="all">All</option>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect label="Priority" value={demandPriority} onChange={setDemandPriority}>
                    <option value="all">All</option>
                    {priorityOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect label="Client priority" value={demandClientPriority} onChange={setDemandClientPriority}>
                    <option value="all">All</option>
                    {clientPriorityOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="SOW"
                    value={demandSowFilter}
                    onChange={(v) => setDemandSowFilter(v as typeof demandSowFilter)}
                  >
                    <option value="all">All</option>
                    <option value="signed">Signed</option>
                    <option value="unconfirmed">Unconfirmed</option>
                  </FilterSelect>
                  <FilterSelect label="Cluster" value={demandCluster} onChange={setDemandCluster}>
                    <option value="all">All</option>
                    {clusters.map((c) => (
                      <option key={c} value={String(c)}>Cluster {c}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect label="Request type" value={demandRequestType} onChange={setDemandRequestType}>
                    <option value="all">All</option>
                    {requestTypeOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect label="Deal stage" value={demandStage} onChange={setDemandStage}>
                    <option value="all">All</option>
                    {stageOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Start confirmed"
                    value={demandStartConfirmed}
                    onChange={(v) => setDemandStartConfirmed(v as StartConfirmedFilter)}
                  >
                    <option value="all">All</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="unconfirmed">Unconfirmed</option>
                  </FilterSelect>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Likely start from</label>
                    <input
                      type="date"
                      value={demandDateFrom}
                      onChange={(e) => setDemandDateFrom(e.target.value)}
                      className="w-full text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Likely start to</label>
                    <input
                      type="date"
                      value={demandDateTo}
                      onChange={(e) => setDemandDateTo(e.target.value)}
                      className="w-full text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDemandLateOnly((v) => !v)}
                    className={cn(
                      "text-[11px] px-2 py-1.5 rounded-lg border whitespace-nowrap transition",
                      demandLateOnly ? "bg-red-50 border-red-200 text-red-700" : "border-gray-200 bg-white text-gray-500"
                    )}
                  >
                    Late notice only
                  </button>
                  <select
                    value={demandSort}
                    onChange={(e) => setDemandSort(e.target.value as DemandSort)}
                    className="flex-1 text-[11px] px-1.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600"
                  >
                    <option value="date_asc">Sort: start date ↑</option>
                    <option value="date_desc">Sort: start date ↓</option>
                    <option value="client_asc">Sort: client A–Z</option>
                    <option value="cluster_asc">Sort: cluster</option>
                    <option value="priority_desc">Sort: priority (urgent first)</option>
                    <option value="status_asc">Sort: status (not resourced first)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filteredDemandRows.map((r) => (
              <button
                key={r.row_index}
                onClick={() => handleSelectRow(r.row_index)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition ${selectedRow === r.row_index ? "bg-primary/5" : ""}`}
              >
                <p className="text-xs font-medium text-gray-700 truncate">{r.resources_requested ?? "Role TBD"} · {r.client ?? "Unnamed client"}</p>
                <p className="text-[11px] text-gray-400 truncate">{r.skillset ?? r.solution ?? "No skillset specified"}</p>
                {(r.client_priority || r.cluster != null) && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {r.client_priority && `Priority ${r.client_priority}`}
                    {r.client_priority && r.cluster != null && " · "}
                    {r.cluster != null && `Cluster ${r.cluster}`}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {r.sow_signed === "Yes" ? <Badge variant="billable">SOW signed</Badge> : <Badge variant="pending">unconfirmed</Badge>}
                  {r.is_late_notice && <Badge variant="red">late notice</Badge>}
                  {r.skillset_coe_categories.map((cat) => (
                    <span key={cat} title="Real skill category, exact-matched from the Pipeline Skillset reference sheet" className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                      {cat}
                    </span>
                  ))}
                  {r.likely_start_date && <span className="text-[10px] text-gray-400">{r.likely_start_date}</span>}
                </div>
              </button>
            ))}
            {filteredDemandRows.length === 0 && (
              <p className="text-xs text-gray-400 italic px-3 py-4 text-center">No pipeline rows match the current filters.</p>
            )}
          </div>
        </div>
        )}

        <div className="min-w-0">
          {selectedRow === null ? (
            <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Select a pipeline demand row to see ranked candidates</div>
          ) : (
            <RoleRecommendationDetail
              key={selectedRow}
              rowIndex={selectedRow}
              includeParams={includeParams}
              setIncludeParams={setIncludeParams}
              includeBelowCapacity={includeBelowCapacity}
              setIncludeBelowCapacity={setIncludeBelowCapacity}
              nearCapacityTolerancePct={nearCapacityTolerancePct}
              setNearCapacityTolerancePct={setNearCapacityTolerancePct}
              onOpenProfile={(employeeId, tab, skillMatchContext) => setOpenProfile({ employeeId, tab, skillMatchContext })}
              onSelectSibling={handleSelectRow}
            />
          )}
        </div>
      </div>
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

interface DemandFilterOptions {
  search: string;
  sowFilter: "all" | "signed" | "unconfirmed";
  lateOnly: boolean;
  cluster: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  priority: string;
  clientPriority: string;
  requestType: string;
  stage: string;
  startConfirmed: StartConfirmedFilter;
  sort: DemandSort;
}

function filterAndSortDemand(rows: PipelineDemandRow[], opts: DemandFilterOptions): PipelineDemandRow[] {
  let result = rows;

  const q = opts.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (r) =>
        (r.client ?? "").toLowerCase().includes(q) ||
        (r.resources_requested ?? "").toLowerCase().includes(q) ||
        (r.skillset ?? "").toLowerCase().includes(q) ||
        (r.solution ?? "").toLowerCase().includes(q)
    );
  }
  if (opts.sowFilter === "signed") result = result.filter((r) => r.sow_signed === "Yes");
  if (opts.sowFilter === "unconfirmed") result = result.filter((r) => r.sow_signed !== "Yes");
  if (opts.lateOnly) result = result.filter((r) => r.is_late_notice);
  if (opts.cluster !== "all") result = result.filter((r) => String(r.cluster) === opts.cluster);
  if (opts.dateFrom) result = result.filter((r) => (r.likely_start_date ?? "") >= opts.dateFrom);
  if (opts.dateTo) result = result.filter((r) => (r.likely_start_date ?? "") <= opts.dateTo);
  if (opts.status !== "all") result = result.filter((r) => matchesNormalized(r.status, opts.status));
  if (opts.priority !== "all") result = result.filter((r) => matchesNormalized(r.priority, opts.priority));
  if (opts.clientPriority !== "all") result = result.filter((r) => matchesNormalized(r.client_priority, opts.clientPriority));
  if (opts.requestType !== "all") result = result.filter((r) => matchesNormalized(r.request_type, opts.requestType));
  if (opts.stage !== "all") result = result.filter((r) => matchesNormalized(r.deal_stage_hubspot, opts.stage));
  if (opts.startConfirmed === "confirmed") result = result.filter((r) => matchesNormalized(r.start_date_confirmed, "Yes"));
  if (opts.startConfirmed === "unconfirmed") result = result.filter((r) => !matchesNormalized(r.start_date_confirmed, "Yes"));

  const sorted = [...result];
  switch (opts.sort) {
    case "date_asc":
      sorted.sort((a, b) => (a.likely_start_date ?? "").localeCompare(b.likely_start_date ?? ""));
      break;
    case "date_desc":
      sorted.sort((a, b) => (b.likely_start_date ?? "").localeCompare(a.likely_start_date ?? ""));
      break;
    case "client_asc":
      sorted.sort((a, b) => (a.client ?? "").localeCompare(b.client ?? ""));
      break;
    case "cluster_asc":
      sorted.sort((a, b) => (a.cluster ?? 0) - (b.cluster ?? 0));
      break;
    case "priority_desc":
      sorted.sort((a, b) => rankOf(PRIORITY_RANK, a.priority) - rankOf(PRIORITY_RANK, b.priority));
      break;
    case "status_asc":
      sorted.sort((a, b) => rankOf(STATUS_RANK, a.status) - rankOf(STATUS_RANK, b.status));
      break;
  }
  return sorted;
}


interface DealFilterOptions {
  search: string;
  priority: string;
  status: string;
  cluster: string;
  clientPriority: string;
  requestType: string;
  stage: string;
  startConfirmed: "all" | "confirmed" | "unconfirmed";
  dateFrom: string;
  dateTo: string;
  lateOnly: boolean;
  sow: "all" | "signed" | "unconfirmed";
  sort: "date_asc" | "date_desc" | "client_asc" | "cluster_asc" | "priority_desc" | "role_count_desc" | "status_asc";
}

function filterAndSortDeals(deals: DealSummary[], opts: DealFilterOptions): DealSummary[] {
  let result = deals;
  const q = opts.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (d) =>
        (d.client ?? "").toLowerCase().includes(q) ||
        (d.solution ?? "").toLowerCase().includes(q) ||
        d.roles.some((r) => (r.resources_requested ?? "").toLowerCase().includes(q)) ||
        d.roles.some((r) => (r.skillset ?? "").toLowerCase().includes(q))
    );
  }
  if (opts.priority !== "all") result = result.filter((d) => matchesNormalized(d.priority, opts.priority));
  if (opts.status !== "all") result = result.filter((d) => matchesNormalized(d.status, opts.status));
  if (opts.cluster !== "all") result = result.filter((d) => String(d.cluster) === opts.cluster);
  if (opts.clientPriority !== "all") result = result.filter((d) => matchesNormalized(d.client_priority, opts.clientPriority));
  if (opts.requestType !== "all") result = result.filter((d) => matchesNormalized(d.request_type, opts.requestType));
  if (opts.stage !== "all") result = result.filter((d) => matchesNormalized(d.deal_stage_hubspot, opts.stage));
  if (opts.startConfirmed === "confirmed") result = result.filter((d) => matchesNormalized(d.start_date_confirmed, "Yes"));
  if (opts.startConfirmed === "unconfirmed") result = result.filter((d) => !matchesNormalized(d.start_date_confirmed, "Yes"));
  if (opts.dateFrom) result = result.filter((d) => (d.earliest_start ?? "") >= opts.dateFrom);
  if (opts.dateTo) result = result.filter((d) => (d.earliest_start ?? "") <= opts.dateTo);
  if (opts.lateOnly) result = result.filter((d) => d.is_late_notice);
  if (opts.sow === "signed") result = result.filter((d) => d.sow_signed);
  if (opts.sow === "unconfirmed") result = result.filter((d) => !d.sow_signed);

  const sorted = [...result];
  switch (opts.sort) {
    case "date_asc":
      sorted.sort((a, b) => (a.earliest_start ?? "9999").localeCompare(b.earliest_start ?? "9999"));
      break;
    case "date_desc":
      sorted.sort((a, b) => (b.earliest_start ?? "0000").localeCompare(a.earliest_start ?? "0000"));
      break;
    case "client_asc":
      sorted.sort((a, b) => (a.client ?? "").localeCompare(b.client ?? ""));
      break;
    case "cluster_asc":
      sorted.sort((a, b) => (a.cluster ?? 0) - (b.cluster ?? 0));
      break;
    case "priority_desc":
      sorted.sort((a, b) => rankOf(PRIORITY_RANK, a.priority) - rankOf(PRIORITY_RANK, b.priority));
      break;
    case "role_count_desc":
      sorted.sort((a, b) => b.role_count - a.role_count);
      break;
    case "status_asc":
      sorted.sort((a, b) => rankOf(STATUS_RANK, a.status) - rankOf(STATUS_RANK, b.status));
      break;
  }
  return sorted;
}

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
// reached from the By Role sidebar or a By Project role tab. Mounted with
// key={rowIndex} at both call sites so switching rows/tabs gives every piece
// of local filter/expand state a clean reset for free (no manual reset effect
// needed, unlike the old per-page useEffect this replaced).
function RoleRecommendationDetail({
  rowIndex,
  includeParams,
  setIncludeParams,
  includeBelowCapacity,
  setIncludeBelowCapacity,
  nearCapacityTolerancePct,
  setNearCapacityTolerancePct,
  onOpenProfile,
  onSelectSibling,
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

      <OtherOptionsSection
        otherOptions={recommendation.data.other_options}
        windowDays={recommendation.data.other_options_window_days}
        includeParams={includeParams}
        onOpenProfile={onOpenProfile}
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
          />
        ))}
        {recommendation.data.candidates.length === 0 && (
          <p className="text-sm text-gray-400 italic">No candidates with available capacity were found.</p>
        )}
        {recommendation.data.candidates.length > 0 && filteredCandidates.length === 0 && (
          <p className="text-sm text-gray-400 italic">No candidates match the current filters.</p>
        )}
      </div>
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
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5 text-xs text-gray-600">
            No skillset was specified for this request -- candidates are ranked by competency and availability only
            (all show &quot;Not assessed&quot;). Treat this as a hire-vs-redeploy unknown, not a real shortlist.
          </div>
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
}: {
  // Optional/nullable on purpose: an un-restarted or older backend simply
  // won't have this field yet -- render nothing rather than crash.
  otherOptions?: RecommendationCandidate[] | null;
  windowDays?: number;
  includeParams: IncludeParams;
  onOpenProfile: (employeeId: string, tab: ProfileTab, skillMatchContext?: SkillMatchContext) => void;
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

function RecommendationsSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3 flex-wrap">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-5 w-32 rounded-full" />
        <Skeleton className="h-5 w-32 rounded-full" />
        <Skeleton className="h-5 w-32 rounded-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-7 w-full rounded-lg" />
          </div>
          <ListSkeleton rows={7} lines={2} />
        </div>
        <div className="h-64 flex items-center justify-center">
          <Skeleton className="h-3 w-72" />
        </div>
      </div>
    </div>
  );
}
