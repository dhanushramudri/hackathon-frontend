"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Sparkles, SlidersHorizontal, XCircle } from "lucide-react";
import { api, type PipelineDemandRow, type RecommendationCandidate, type SemanticMatchResult } from "@/lib/api";
import { Badge } from "@/components/shared/Badge";
import { LoadingState, ErrorState } from "@/components/shared/EmptyState";
import { Skeleton, ListSkeleton, FieldGridSkeleton, CandidateCardSkeleton } from "@/components/shared/Skeleton";
import { EmployeeProfileModal, type ProfileTab, type SkillMatchContext } from "@/components/shared/EmployeeProfileModal";
import { cn } from "@/lib/utils";

type DemandSort = "date_asc" | "date_desc" | "client_asc" | "cluster_asc" | "priority_desc" | "status_asc";
type StartConfirmedFilter = "all" | "confirmed" | "unconfirmed";
type CandidateSignalFilter = "all" | "redeploy" | "training" | "hire" | "not_assessed";
type SkillDataFilter = "all" | "observed" | "imputed" | "no_match" | "no_requirement";
type CandidateSort = "composite" | "skill" | "competency" | "available";

const SIGNAL_FILTER_TO_BUCKET: Record<Exclude<CandidateSignalFilter, "all">, RecommendationCandidate["bucket"]> = {
  redeploy: "eligible",
  training: "trainable",
  hire: "gap",
  not_assessed: "not_assessed",
};

const SKILL_DATA_LABEL: Record<Exclude<SkillDataFilter, "all">, string> = {
  observed: "Observed (real)",
  imputed: "Inferred",
  no_match: "No match found",
  no_requirement: "Not assessed (no skillset)",
};

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function matchesNormalized(value: string | null | undefined, filterValue: string): boolean {
  return normalizeLabel(value).toLowerCase() === filterValue.toLowerCase();
}

function buildNormalizedOptions(values: (string | null | undefined)[]): string[] {
  const variantCounts = new Map<string, Map<string, number>>();
  for (const raw of values) {
    const trimmed = normalizeLabel(raw);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const inner = variantCounts.get(key) ?? new Map<string, number>();
    inner.set(trimmed, (inner.get(trimmed) ?? 0) + 1);
    variantCounts.set(key, inner);
  }
  const canonical: string[] = [];
  for (const inner of variantCounts.values()) {
    canonical.push([...inner.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return canonical.sort();
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, complete: 4 };
const STATUS_RANK: Record<string, number> = { "not resourced": 0, "part resourced": 1, resourced: 2 };

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

function RecommendationsPageInner() {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [openProfile, setOpenProfile] = useState<{ employeeId: string; tab: ProfileTab; skillMatchContext?: SkillMatchContext } | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const row = searchParams.get("row");
    if (row !== null && !Number.isNaN(Number(row))) setSelectedRow(Number(row));
  }, []);

  const [semanticMatchByRow, setSemanticMatchByRow] = useState<Record<number, SemanticMatchResult>>({});
  const semanticMatchMutation = useMutation({ mutationFn: (rowIndex: number) => api.semanticMatch(rowIndex) });

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
  const [candidateSort, setCandidateSort] = useState<CandidateSort>("composite");
  const [topN, setTopN] = useState(15);
  const [topNInput, setTopNInput] = useState("15");

  useEffect(() => {
    setCandidateSearch("");
    setCandidateSignal("all");
    setCandidateDesignation("all");
    setCandidateCoe("all");
    setCandidateSkillData("all");
    setMinSkill(0);
    setMinCompetency(0);
    setMinAvailable(0);
    setMeetsCapacityOnly(false);
    setTopN(15);
    setTopNInput("15");
    semanticMatchMutation.reset();
  }, [selectedRow]);

  const pipeline = useQuery({ queryKey: ["pipeline-forecast"], queryFn: api.pipelineForecast });
  const coverage = useQuery({ queryKey: ["recommendations-coverage-summary"], queryFn: api.recommendationsCoverageSummary });
  const recommendation = useQuery({
    queryKey: ["recommendation", selectedRow, topN],
    queryFn: () => api.recommendationsForPipelineRow(selectedRow!, topN),
    enabled: selectedRow !== null,
  });

  if (pipeline.isLoading) return <RecommendationsSkeleton />;
  if (pipeline.error) return <ErrorState message="Could not load pipeline demand." />;

  const demandRows = (pipeline.data ?? []).filter((r) => r.skillset || r.resources_requested);
  const selected = recommendation.data?.pipeline_row;

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

  const designationOptions = buildNormalizedOptions((recommendation.data?.candidates ?? []).map((c) => c.job_name));
  const coeOptions = buildNormalizedOptions((recommendation.data?.candidates ?? []).map((c) => c.coe));
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
    sort: candidateSort,
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
    meetsCapacityOnly;
  const candidateFilterCount = [
    candidateSignal !== "all",
    candidateDesignation !== "all",
    candidateCoe !== "all",
    candidateSkillData !== "all",
    minSkill > 0,
    minCompetency > 0,
    minAvailable > 0,
    meetsCapacityOnly,
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
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      {coverage.data && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-5 text-xs flex-wrap">
          <span className="font-semibold text-gray-700">
            Pipeline coverage across {coverage.data.total_demand_rows} role-requests:
          </span>
          <span className="flex items-center gap-1.5">
            <Badge variant="eligible">{coverage.data.redeploy_ready_count} ready to redeploy</Badge>
          </span>
          <span className="flex items-center gap-1.5">
            <Badge variant="trainable">{coverage.data.redeploy_with_training_count} need upskilling</Badge>
          </span>
          <span className="flex items-center gap-1.5">
            <Badge variant="gap">{coverage.data.hire_signal_count} ({coverage.data.hire_signal_pct}%) need external hire</Badge>
          </span>
          {coverage.data.no_skillset_specified_count > 0 && (
            <span className="flex items-center gap-1.5">
              <Badge variant="pending">{coverage.data.no_skillset_specified_count} no skillset specified yet</Badge>
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col max-h-[60dvh] lg:max-h-[calc(100dvh-180px)]">
          <div className="px-3 py-2.5 border-b border-gray-100 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-700">
                Pipeline Demand ({filteredDemandRows.length}/{demandRows.length})
              </p>
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
                onClick={() => setSelectedRow(r.row_index)}
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

        <div>
          {selectedRow === null ? (
            <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Select a pipeline demand row to see ranked candidates</div>
          ) : recommendation.isLoading ? (
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
          ) : recommendation.error ? (
            <ErrorState message="Could not compute recommendations." />
          ) : recommendation.data ? (
            <div className="space-y-4">
              {selected && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {selected.client ?? "Unnamed client"}
                      {selected.solution && ` · ${selected.solution}`}
                      {selected.cluster != null && ` · Cluster ${selected.cluster}`}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Requesting {selected.resources_requested ?? "an unspecified role"}
                      {selected.requested_pct && ` at ${selected.requested_pct}%`}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px] border-t border-gray-100 pt-3">
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
                    <p className="text-[11px] text-gray-500 border-t border-gray-100 pt-2.5 leading-relaxed">
                      <span className="text-gray-400">Comments: </span>
                      {selected.comments}
                    </p>
                  )}

                  {recommendation.data.deal_composition.length > 1 && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-[11px] text-gray-400 mb-1.5">
                        Team composition for this deal ({recommendation.data.deal_composition.length} roles)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {recommendation.data.deal_composition.map((sib) => (
                          <button
                            key={sib.row_index}
                            onClick={() => setSelectedRow(sib.row_index)}
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

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400">Required skillset</p>
                  {selected && selected.skillset_coe_categories.length > 0 && (
                    <div className="flex items-center gap-1">
                      {selected.skillset_coe_categories.map((cat) => (
                        <span
                          key={cat}
                          title="Real skill category, exact-matched from the Pipeline Skillset reference sheet"
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-700">{recommendation.data.request.skillset_text || "(none specified)"}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {recommendation.data.request.required_phrases.map((p) => (
                    <Badge key={p} variant="default">{p}</Badge>
                  ))}
                </div>
              </div>

              {recommendation.data.hire_vs_redeploy_flag && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2 text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    No strong internal fit found -- this is a <strong>hire signal</strong>, not a redeploy opportunity.
                  </div>

                  {selectedRow !== null && semanticMatchByRow[selectedRow] ? (
                    <SemanticMatchPanel
                      result={semanticMatchByRow[selectedRow]}
                      onOpenProfile={(employeeId, skillMatchContext) => setOpenProfile({ employeeId, tab: "skills", skillMatchContext })}
                    />
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        onClick={() => {
                          if (selectedRow === null) return;
                          semanticMatchMutation.mutate(selectedRow, {
                            onSuccess: (data) => setSemanticMatchByRow((prev) => ({ ...prev, [selectedRow]: data })),
                          });
                        }}
                        disabled={semanticMatchMutation.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-100 transition disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {semanticMatchMutation.isPending ? "Asking AI…" : "Ask AI to search for a semantic match"}
                      </button>
                      {semanticMatchMutation.isError && (
                        <p className="text-[11px] text-red-500">Could not reach the AI matcher -- try again.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {recommendation.data.candidates.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                  {!recommendation.data.has_skillset && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      No skillset was specified for this request -- the candidates below could not be skill-matched at
                      all. They&apos;re ranked by competency and availability only (all show &quot;Not assessed&quot;);
                      treat this as a hire-vs-redeploy unknown, not a real shortlist.
                    </p>
                  )}
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
                      {recommendation.data.has_skillset && `, ${recommendation.data.candidates_with_real_skill_match} with a real skill match`})
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
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {filteredCandidates.map((c) => (
                  <CandidateCard
                    key={c.employee_id}
                    candidate={c}
                    onOpenProfile={(tab, skillMatchContext) => setOpenProfile({ employeeId: c.employee_id, tab, skillMatchContext })}
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
          ) : null}
        </div>
      </div>

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

const SIGNAL_LABEL: Record<RecommendationCandidate["bucket"], string> = {
  eligible: "Redeploy",
  trainable: "Needs training",
  gap: "Hire signal",
  not_assessed: "Not assessed",
};

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

const UNKNOWN_COE = "__unknown__";

interface CandidateFilterOptions {
  search: string;
  signal: CandidateSignalFilter;
  designation: string;
  coe: string;
  skillData: SkillDataFilter;
  minSkill: number;
  minCompetency: number;
  minAvailable: number;
  meetsCapacityOnly: boolean;
  sort: CandidateSort;
}

function filterAndSortCandidates(candidates: RecommendationCandidate[], opts: CandidateFilterOptions): RecommendationCandidate[] {
  let result = candidates;

  const q = opts.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (c) =>
        c.employee_id.toLowerCase().includes(q) ||
        (c.job_name ?? "").toLowerCase().includes(q) ||
        c.matched_skills.some((s) => s.toLowerCase().includes(q)) ||
        c.missing_skills.some((s) => s.toLowerCase().includes(q))
    );
  }
  if (opts.signal !== "all") {
    const signal = opts.signal;
    result = result.filter((c) => c.bucket === SIGNAL_FILTER_TO_BUCKET[signal]);
  }
  if (opts.designation !== "all") {
    const designation = opts.designation;
    result = result.filter((c) => matchesNormalized(c.job_name, designation));
  }
  if (opts.coe !== "all") {
    result = opts.coe === UNKNOWN_COE ? result.filter((c) => !c.coe) : result.filter((c) => matchesNormalized(c.coe, opts.coe));
  }
  if (opts.skillData !== "all") {
    const skillData = opts.skillData;
    result = result.filter((c) => c.skill_confidence === skillData);
  }
  if (opts.minSkill > 0) result = result.filter((c) => c.skill_score >= opts.minSkill / 100);
  if (opts.minCompetency > 0) result = result.filter((c) => c.competency_score >= opts.minCompetency / 100);
  if (opts.minAvailable > 0) result = result.filter((c) => c.available_pct >= opts.minAvailable);
  if (opts.meetsCapacityOnly) result = result.filter((c) => c.meets_requested_capacity);

  const sorted = [...result];
  switch (opts.sort) {
    case "composite":
      sorted.sort((a, b) => b.composite_score - a.composite_score);
      break;
    case "skill":
      sorted.sort((a, b) => b.skill_score - a.skill_score);
      break;
    case "competency":
      sorted.sort((a, b) => b.competency_score - a.competency_score);
      break;
    case "available":
      sorted.sort((a, b) => b.available_pct - a.available_pct);
      break;
  }
  return sorted;
}

function RangeFilter({
  label,
  value,
  onChange,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
  step: number;
  suffix?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-400 block mb-0.5">
        {label}
        {value > 0 ? `: ${suffix ? value : value.toFixed(1)}${suffix ?? ""}` : ": any"}
      </label>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-primary"
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-400 block mb-0.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
      >
        {children}
      </select>
    </div>
  );
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

function CandidateCard({
  candidate,
  onOpenProfile,
}: {
  candidate: RecommendationCandidate;
  onOpenProfile: (tab: ProfileTab, skillMatchContext?: SkillMatchContext) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-800">{candidate.employee_id}</span>
        <span className="text-xs text-gray-400">{candidate.job_name}</span>
        {candidate.coe ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600">{candidate.coe}</span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-400">CoE not determined</span>
        )}
        <Badge variant={candidate.bucket}>{SIGNAL_LABEL[candidate.bucket]}</Badge>
        {!candidate.meets_requested_capacity && <Badge variant="amber">below requested %</Badge>}
        <span className="ml-auto text-xs font-semibold text-gray-500">score {Math.round(candidate.composite_score * 100)}%</span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs mb-2">
        <Metric
          label="Skill"
          value={candidate.skill_score}
          suffix={`${Math.round(candidate.skill_score * 100)}%`}
          onClick={() =>
            onOpenProfile("skills", {
              matchedSkills: candidate.matched_skills,
              missingSkills: candidate.missing_skills,
            })
          }
        />
        <Metric
          label="Competency"
          value={candidate.competency_score}
          suffix={`${Math.round(candidate.competency_score * 100)}%`}
          onClick={() => onOpenProfile("competency")}
        />
        <Metric
          label="Available"
          value={candidate.available_pct / 100}
          suffix={`${candidate.available_pct}%`}
          onClick={() => onOpenProfile("allocations")}
        />
      </div>
      {candidate.matched_skills.length > 0 && (
        <div className="flex items-start gap-1.5 text-xs mt-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <span className="text-gray-500">{candidate.matched_skills.join(", ")}</span>
        </div>
      )}
      {candidate.missing_skills.length > 0 && (
        <div className="flex items-start gap-1.5 text-xs mt-1">
          <XCircle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
          <span className="text-gray-400">{candidate.missing_skills.join(", ")}</span>
        </div>
      )}
      <p className="text-xs text-gray-600 mt-2 leading-relaxed border-t border-gray-100 pt-2">{candidate.explanation}</p>
      <p className="text-[10px] text-gray-300 mt-1.5">skill data: {candidate.skill_confidence}</p>
    </div>
  );
}

function Metric({ label, value, suffix, onClick }: { label: string; value: number; suffix?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-left group" type="button">
      <p className="text-gray-400 mb-0.5 group-hover:text-primary transition">{label}</p>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(value, 1) * 100}%` }} />
      </div>
      <p className="text-gray-500 mt-0.5 group-hover:underline">{suffix ?? value.toFixed(2)}</p>
    </button>
  );
}

function RecommendationsSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
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
