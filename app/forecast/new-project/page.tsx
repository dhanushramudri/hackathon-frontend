"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";
import { api, type ForecastSpec, type RedeployCandidate } from "@/lib/api";
import { ErrorState } from "@/components/shared/EmptyState";
import { Skeleton, TableSkeleton } from "@/components/shared/Skeleton";
import { Badge } from "@/components/shared/Badge";
import { EmployeeProfileModal, type SkillMatchContext } from "@/components/shared/EmployeeProfileModal";
import { Modal } from "@/components/shared/Modal";
import { cn, formatUsd } from "@/lib/utils";

const INLINE_CANDIDATE_LIMIT = 5;

function levelNoteFor(c: RedeployCandidate): string | undefined {
  if (c.level_offset == null || c.level_offset === 0) return undefined;
  return `${c.level_offset < 0 ? "one level below" : "one level above"} -- ${c.source_designation}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

const TYPE_OPTIONS = ["Client Project", "Internal Project", "Managed Services", "BAU Activity", "Sales Activity"];

const REASON_LABEL: Record<RedeployCandidate["reason"], string> = {
  ending_soon: "ending soon",
  under_utilized: "under-utilized",
  fully_free: "fully free",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  medium: "medium confidence match",
  low: "low confidence match",
  none: "no direct match",
};

function CandidateRow({
  c,
  onOpen,
  levelNote,
  qualifies,
}: {
  c: RedeployCandidate;
  onOpen: (sel: { employeeId: string; skillMatchContext?: SkillMatchContext }) => void;
  levelNote?: string;
  qualifies?: boolean;
}) {
  const reasonDetail =
    c.reason === "ending_soon" && c.days_to_end != null
      ? `${REASON_LABEL[c.reason]} · ${c.days_to_end}d left`
      : c.reason !== "fully_free" && c.current_allocation_pct != null
      ? `${REASON_LABEL[c.reason]} · ${c.current_allocation_pct}% allocated`
      : REASON_LABEL[c.reason];
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <button
        onClick={() =>
          onOpen({
            employeeId: c.employee_id,
            skillMatchContext: c.matched_skills || c.missing_skills ? { matchedSkills: c.matched_skills ?? [], missingSkills: c.missing_skills ?? [] } : undefined,
          })
        }
        className="font-medium text-primary hover:underline"
      >
        {c.employee_id}
      </button>
      {c.coe && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600">{c.coe}</span>}
      {levelNote && <Badge variant={qualifies ? "green" : "amber"}>{levelNote}</Badge>}
      <Badge variant={c.reason === "ending_soon" ? "amber" : c.reason === "fully_free" ? "green" : "under_utilized"}>{reasonDetail}</Badge>
      {c.skill_score != null && <span className="ml-auto font-semibold text-gray-500">skill match {Math.round(c.skill_score * 100)}%</span>}
    </div>
  );
}

function CandidateListSection({
  title,
  candidates,
  onOpen,
  onShowAll,
  showQualifies,
  emptyText,
}: {
  title: string;
  candidates: RedeployCandidate[];
  onOpen: (sel: { employeeId: string; skillMatchContext?: SkillMatchContext }) => void;
  onShowAll: () => void;
  showQualifies?: boolean;
  emptyText?: string;
}) {
  if (candidates.length === 0) {
    return emptyText ? <p className="text-[11px] text-gray-400">{emptyText}</p> : null;
  }
  return (
    <div>
      {title && <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{title}</p>}
      <div className="flex flex-col gap-1">
        {candidates.slice(0, INLINE_CANDIDATE_LIMIT).map((c) => (
          <CandidateRow
            key={c.employee_id}
            c={c}
            onOpen={onOpen}
            levelNote={levelNoteFor(c)}
            qualifies={showQualifies && c.skill_score != null ? c.skill_score >= 0.6 : undefined}
          />
        ))}
      </div>
      {candidates.length > INLINE_CANDIDATE_LIMIT && (
        <button onClick={onShowAll} className="mt-1 text-[11px] text-primary hover:underline">
          + Show all {candidates.length}
        </button>
      )}
    </div>
  );
}

interface RoleMixRow {
  designation: string;
  headcount: number;
  typicalPct: number;
  prevalencePct: number | null;
  common: boolean;
}

function rowToFte(row: RoleMixRow): number {
  return Math.round(((row.headcount * row.typicalPct) / 100) * 100) / 100;
}

interface SkillChip {
  skill: string;
  subskill: string;
  employee_count?: number;
  avg_score?: number;
}

interface SpecState {
  coes: string[];
  typeOfProject: string;
  category: string | null;
  count: number;
  startDate: string;
  durationWeeks: string;
  roleMix: RoleMixRow[];
  roleMixSource: string | null;
  roleMixSampleSize: number | null;
  roleMixMatchedProjects: string[];
  roleMixEdited: boolean;
  showAllRoles: boolean;
  skills: SkillChip[];
  skillCoeBasis: { coe: string; confidence: string; fallback: string | null }[];
  previewLoading: boolean;
}

function blankSpec(): SpecState {
  return {
    coes: [],
    typeOfProject: "Client Project",
    category: null,
    count: 1,
    startDate: todayStr(),
    durationWeeks: "",
    roleMix: [],
    roleMixSource: null,
    roleMixSampleSize: null,
    roleMixMatchedProjects: [],
    roleMixEdited: false,
    showAllRoles: false,
    skills: [],
    skillCoeBasis: [],
    previewLoading: false,
  };
}

function toForecastSpec(spec: SpecState): ForecastSpec {
  const requiredSkills = spec.skills.map((s) => s.subskill || s.skill).filter(Boolean);
  const durationWeeks = parseInt(spec.durationWeeks, 10);
  return {
    coes: spec.category ? undefined : spec.coes.length ? spec.coes : undefined,
    type_of_project: spec.category ? undefined : spec.typeOfProject || undefined,
    category: spec.category ?? undefined,
    count: spec.count,
    // spec.roleMix always holds every historical role (common + rare), so the editor
    // can reveal rare ones via "Show all roles" -- but only rows actually visible to
    // the user (common, manually added, or explicitly revealed) should be submitted.
    // Without this filter, editing just one visible row silently drags ~12 hidden
    // rare roles the user never saw into the override as full headcount needs.
    role_mix_overrides: spec.roleMixEdited
      ? Object.fromEntries(
          spec.roleMix.filter((r) => r.common || spec.showAllRoles).map((r) => [r.designation, rowToFte(r)])
        )
      : undefined,
    required_skills: requiredSkills.length ? requiredSkills : undefined,
    start_date: spec.startDate || undefined,
    duration_weeks: Number.isNaN(durationWeeks) ? undefined : durationWeeks,
  };
}

function formatRoleMixSource(source: string | null | undefined, sampleSize?: number | null, scope?: string | null): string {
  switch (source) {
    case "manual_override":
      return "edited by you";
    case "docx_given":
      return "standard template · D&D Tactical Build";
    case "derived_empirical":
      return `based on ${sampleSize ?? 0} past project(s)${scope ? ` · ${scope}` : ""}`;
    case "derived_empirical_on_time_preferred":
      return `based on ${sampleSize ?? 0} past project(s) that finished on schedule, no extension${scope ? ` · ${scope}` : ""}`;
    case "derived_empirical_type_fallback":
      return `based on ${sampleSize ?? 0} past project(s) of this type (broader CoE match)`;
    case "derived_empirical_org_fallback":
      return `based on ${sampleSize ?? 0} past project(s) org-wide (broader fallback)`;
    case "no_data":
    case "no_coes_selected":
    case "unknown_category":
      return "no historical match yet";
    default:
      return "not previewed";
  }
}

function roleMixSourceLabel(spec: SpecState): string {
  if (spec.roleMixEdited) return "edited by you";
  const scope = spec.roleMixSource === "derived_empirical"
    ? spec.typeOfProject || spec.coes.join(", ") || spec.category || "any project type"
    : undefined;
  return formatRoleMixSource(spec.roleMixSource, spec.roleMixSampleSize, scope);
}

export default function NewProjectForecastPage() {
  const coeOptions = useQuery({ queryKey: ["role-mix-coes"], queryFn: api.roleMixCoes });
  const categories = useQuery({ queryKey: ["role-mix-categories"], queryFn: api.roleMixCategories });
  const designations = useQuery({ queryKey: ["employee-designations"], queryFn: api.employeeDesignations });
  const knownDesignations = new Set((designations.data ?? []).map((d) => d.toLowerCase()));

  const [specs, setSpecs] = useState<SpecState[]>([blankSpec()]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rareRolesOpen, setRareRolesOpen] = useState(false);
  const [skillDrafts, setSkillDrafts] = useState<Record<number, string>>({});
  const [roleDrafts, setRoleDrafts] = useState<Record<number, { designation: string; headcount: string; pct: string }>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<{ employeeId: string; skillMatchContext?: SkillMatchContext } | null>(null);
  const [candidateModal, setCandidateModal] = useState<{ title: string; subtitle?: string; candidates: RedeployCandidate[]; showQualifies?: boolean } | null>(null);
  const forecast = useMutation({ mutationFn: () => api.newProjectForecast(specs.map(toForecastSpec)) });

  if (coeOptions.isLoading || categories.isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
        <Skeleton className="h-3 w-64" />
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-24 rounded-lg" />
            ))}
          </div>
          <TableSkeleton columns={3} rows={4} />
        </div>
      </div>
    );
  }
  if (coeOptions.error || categories.error) return <ErrorState message="Could not load role-mix reference data." />;

  const coeList = coeOptions.data ?? [];
  const sortedCoes = [...coeList].sort((a, b) => b.sample_size - a.sample_size);

  async function runPreview(specIndex: number, coes: string[], typeOfProject: string) {
    if (coes.length === 0) return;
    setSpecs((prev) => prev.map((s, i) => (i !== specIndex ? s : { ...s, previewLoading: true })));
    try {
      const [roleMixResult, skillsResult] = await Promise.all([
        api.roleMixPreview(coes, typeOfProject || null),
        api.roleMixCoeSkills(coes),
      ]);
      const roleMix: RoleMixRow[] = roleMixResult.roles.map((r) => ({
        designation: r.designation,
        headcount: r.headcount,
        typicalPct: r.typical_pct,
        prevalencePct: r.prevalence_pct,
        common: r.common,
      }));
      const skills: SkillChip[] = skillsResult.combined.map((s) => ({
        skill: s.skill,
        subskill: s.subskill,
        employee_count: s.employee_count,
        avg_score: s.avg_score,
      }));
      const skillCoeBasis = coes.map((coe) => ({
        coe,
        confidence: skillsResult.by_coe[coe]?.confidence ?? "none",
        fallback: skillsResult.by_coe[coe]?.fallback ?? null,
      }));
      setSpecs((prev) =>
        prev.map((s, i) =>
          i !== specIndex
            ? s
            : {
                ...s,
                roleMix,
                roleMixSource: roleMixResult.source,
                roleMixSampleSize: roleMixResult.sample_size,
                roleMixMatchedProjects: roleMixResult.matched_project_codes,
                roleMixEdited: false,
                showAllRoles: false,
                skills,
                skillCoeBasis,
                previewLoading: false,
              }
        )
      );
    } catch {
      setSpecs((prev) => prev.map((s, i) => (i !== specIndex ? s : { ...s, previewLoading: false })));
    }
  }

  function toggleCoe(specIndex: number, coe: string) {
    const spec = specs[specIndex];
    const newCoes = spec.coes.includes(coe) ? spec.coes.filter((c) => c !== coe) : [...spec.coes, coe];
    setSpecs((prev) => prev.map((s, i) => (i !== specIndex ? s : { ...s, category: null, coes: newCoes })));
    runPreview(specIndex, newCoes, spec.typeOfProject);
  }

  function changeTypeOfProject(specIndex: number, typeOfProject: string) {
    const spec = specs[specIndex];
    setSpecs((prev) => prev.map((s, i) => (i !== specIndex ? s : { ...s, typeOfProject })));
    if (spec.coes.length > 0) runPreview(specIndex, spec.coes, typeOfProject);
  }

  function quickFillCategory(specIndex: number, category: string) {
    if (!category) {
      setSpecs((prev) => prev.map((s, i) => (i !== specIndex ? s : { ...s, category: null })));
      return;
    }
    const cat = categories.data?.find((c) => c.category === category);
    if (!cat) return;
    setSpecs((prev) =>
      prev.map((s, i) =>
        i !== specIndex
          ? s
          : {
              ...s,
              category,
              coes: [],
              roleMix: cat.roles.map((r) => ({
                designation: r.designation,
                headcount: r.headcount,
                typicalPct: r.typical_pct,
                prevalencePct: r.prevalence_pct,
                common: r.common,
              })),
              roleMixSource: cat.source,
              roleMixSampleSize: cat.sample_size,
              roleMixMatchedProjects: [],
              roleMixEdited: false,
              showAllRoles: false,
              skills: [],
              skillCoeBasis: [],
            }
      )
    );
  }

  function updateHeadcount(specIndex: number, rowIndex: number, headcount: number) {
    setSpecs((prev) =>
      prev.map((s, i) =>
        i !== specIndex ? s : { ...s, roleMixEdited: true, roleMix: s.roleMix.map((r, ri) => (ri !== rowIndex ? r : { ...r, headcount })) }
      )
    );
  }

  function updateTypicalPct(specIndex: number, rowIndex: number, typicalPct: number) {
    setSpecs((prev) =>
      prev.map((s, i) =>
        i !== specIndex ? s : { ...s, roleMixEdited: true, roleMix: s.roleMix.map((r, ri) => (ri !== rowIndex ? r : { ...r, typicalPct })) }
      )
    );
  }

  function removeRoleMixRow(specIndex: number, rowIndex: number) {
    setSpecs((prev) =>
      prev.map((s, i) => (i !== specIndex ? s : { ...s, roleMixEdited: true, roleMix: s.roleMix.filter((_, ri) => ri !== rowIndex) }))
    );
  }

  function toggleShowAllRoles(specIndex: number) {
    setSpecs((prev) => prev.map((s, i) => (i !== specIndex ? s : { ...s, showAllRoles: !s.showAllRoles })));
  }

  function addRoleMixRow(specIndex: number) {
    const draft = roleDrafts[specIndex];
    const designation = draft?.designation.trim();
    const headcount = parseInt(draft?.headcount ?? "", 10);
    const typicalPct = parseFloat(draft?.pct ?? "");
    if (!designation || Number.isNaN(headcount) || Number.isNaN(typicalPct)) return;
    const newRow: RoleMixRow = { designation, headcount, typicalPct, prevalencePct: null, common: true };
    setSpecs((prev) =>
      prev.map((s, i) => (i !== specIndex ? s : { ...s, roleMixEdited: true, roleMix: [...s.roleMix, newRow] }))
    );
    setRoleDrafts((prev) => ({ ...prev, [specIndex]: { designation: "", headcount: "", pct: "" } }));
  }

  function removeSkill(specIndex: number, skillIndex: number) {
    setSpecs((prev) => prev.map((s, i) => (i !== specIndex ? s : { ...s, skills: s.skills.filter((_, si) => si !== skillIndex) })));
  }

  function addSkill(specIndex: number) {
    const text = (skillDrafts[specIndex] ?? "").trim();
    if (!text) return;
    setSpecs((prev) => prev.map((s, i) => (i !== specIndex ? s : { ...s, skills: [...s.skills, { skill: text, subskill: text }] })));
    setSkillDrafts((prev) => ({ ...prev, [specIndex]: "" }));
  }

  const toggleExpanded = (rowKey: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
      return next;
    });

  const anyPreviewLoading = specs.some((s) => s.previewLoading);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">What if these new projects started on a given date?</p>
        <datalist id="known-designations">
          {(designations.data ?? []).map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        {specs.map((spec, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">Project spec {i + 1}</p>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-400">Count</label>
                <input
                  type="number"
                  min={1}
                  value={spec.count}
                  onChange={(e) =>
                    setSpecs((prev) => prev.map((s, idx) => (idx !== i ? s : { ...s, count: Math.max(1, parseInt(e.target.value) || 1) })))
                  }
                  className="w-16 px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none"
                />
                <button
                  onClick={() => setSpecs((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={specs.length === 1}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-30 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Start date</label>
                <input
                  type="date"
                  value={spec.startDate}
                  onChange={(e) => setSpecs((prev) => prev.map((s, idx) => (idx !== i ? s : { ...s, startDate: e.target.value || todayStr() })))}
                  className="px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-0.5">Duration (weeks)</label>
                <input
                  type="number"
                  min={1}
                  value={spec.durationWeeks}
                  onChange={(e) => setSpecs((prev) => prev.map((s, idx) => (idx !== i ? s : { ...s, durationWeeks: e.target.value })))}
                  placeholder="e.g. 12"
                  className="w-28 px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none"
                />
              </div>
              {spec.durationWeeks && !Number.isNaN(parseInt(spec.durationWeeks, 10)) && (
                <p className="text-[11px] text-gray-400 self-end pb-1.5">
                  through {addWeeks(spec.startDate, parseInt(spec.durationWeeks, 10))}
                </p>
              )}
            </div>

            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Complexion of COEs</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {sortedCoes.map((c) => (
                  <button
                    key={c.coe}
                    title={`${c.sample_size} historical project${c.sample_size === 1 ? "" : "s"}`}
                    onClick={() => toggleCoe(i, c.coe)}
                    className={cn(
                      "text-[11px] px-2 py-1 rounded-lg border transition",
                      spec.coes.includes(c.coe) ? "bg-primary/10 border-primary text-primary" : "border-gray-200 text-gray-500"
                    )}
                  >
                    {c.coe}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <select
                  value={spec.typeOfProject}
                  onChange={(e) => changeTypeOfProject(i, e.target.value)}
                  className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 max-w-full"
                >
                  <option value="">Any project type</option>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={spec.category ?? ""}
                  onChange={(e) => quickFillCategory(i, e.target.value)}
                  className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 max-w-full"
                >
                  <option value="">Or quick-fill from a project category…</option>
                  {(categories.data ?? []).map((c) => (
                    <option key={c.category} value={c.category}>{c.category}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] text-gray-500">{spec.previewLoading ? "loading…" : roleMixSourceLabel(spec)}</p>
                {spec.roleMix.some((r) => !r.common) && (
                  <button onClick={() => toggleShowAllRoles(i)} className="text-[11px] text-primary hover:underline whitespace-nowrap">
                    {spec.showAllRoles ? "Hide rare roles" : "Show all roles (incl. rare)"}
                  </button>
                )}
              </div>
              {spec.roleMix.length === 0 && !spec.previewLoading ? (
                <p className="text-xs text-gray-400 italic mb-2">Select CoEs above, or a project category, to auto-fill this.</p>
              ) : (
                <div className="space-y-1 mb-2">
                  {spec.roleMix
                    .map((row, ri) => ({ row, ri }))
                    .filter(({ row }) => row.common || spec.showAllRoles)
                    .map(({ row, ri }) => (
                      <div key={ri} className="flex items-center gap-2 text-xs">
                        <span
                          className="flex-1 text-gray-700"
                          title={row.prevalencePct != null ? `used in ${row.prevalencePct}% of matched historical projects` : undefined}
                        >
                          {row.designation}
                          {row.prevalencePct != null && !row.common && (
                            <span className="text-gray-300 ml-1">({row.prevalencePct}% of projects)</span>
                          )}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={row.headcount}
                          onChange={(e) => updateHeadcount(i, ri, Math.max(0, parseInt(e.target.value, 10) || 0))}
                          title="Headcount"
                          className="w-12 px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none"
                        />
                        <span className="text-gray-400">x</span>
                        <input
                          type="number"
                          min={0}
                          step={5}
                          value={row.typicalPct}
                          onChange={(e) => updateTypicalPct(i, ri, parseFloat(e.target.value) || 0)}
                          title="Typical allocation % per person"
                          className="w-20 px-2 py-1 rounded-lg border border-gray-200 text-xs outline-none"
                        />
                        <span className="text-gray-400">%</span>
                        <button onClick={() => removeRoleMixRow(i, ri)} className="text-gray-300 hover:text-red-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  value={roleDrafts[i]?.designation ?? ""}
                  onChange={(e) =>
                    setRoleDrafts((prev) => ({
                      ...prev,
                      [i]: { designation: e.target.value, headcount: prev[i]?.headcount ?? "", pct: prev[i]?.pct ?? "" },
                    }))
                  }
                  list="known-designations"
                  placeholder="Add a role (designation)…"
                  className="flex-1 min-w-[140px] text-[11px] px-2 py-1 rounded-lg border border-gray-200 outline-none"
                />
                <input
                  value={roleDrafts[i]?.headcount ?? ""}
                  onChange={(e) =>
                    setRoleDrafts((prev) => ({
                      ...prev,
                      [i]: { designation: prev[i]?.designation ?? "", headcount: e.target.value, pct: prev[i]?.pct ?? "" },
                    }))
                  }
                  placeholder="Headcount"
                  className="w-20 text-[11px] px-2 py-1 rounded-lg border border-gray-200 outline-none"
                />
                <input
                  value={roleDrafts[i]?.pct ?? ""}
                  onChange={(e) =>
                    setRoleDrafts((prev) => ({
                      ...prev,
                      [i]: { designation: prev[i]?.designation ?? "", headcount: prev[i]?.headcount ?? "", pct: e.target.value },
                    }))
                  }
                  placeholder="%"
                  className="w-16 text-[11px] px-2 py-1 rounded-lg border border-gray-200 outline-none"
                />
                <button onClick={() => addRoleMixRow(i)} className="text-[11px] text-primary hover:underline whitespace-nowrap">
                  + Add role
                </button>
              </div>
              {roleDrafts[i]?.designation.trim() &&
                designations.data &&
                !knownDesignations.has(roleDrafts[i]!.designation.trim().toLowerCase()) && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    No employee currently holds this exact title -- it will show as a pure hire need with zero
                    redeploy candidates. Pick a suggestion from the list to match a real designation.
                  </p>
                )}
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-[11px] text-gray-500 mb-1.5">Skills needed</p>
              {spec.skillCoeBasis.length > 0 && (
                <div className="mb-1.5 space-y-0.5">
                  {spec.skillCoeBasis.map((b) => (
                    <p key={b.coe} className="text-[10px] text-gray-400">
                      {b.coe}: {b.fallback ? "no direct COE skill data -- showing org-wide common skills instead" : CONFIDENCE_LABEL[b.confidence]}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                {spec.skills.map((sk, si) => (
                  <span
                    key={`${sk.skill}-${sk.subskill}-${si}`}
                    title={sk.employee_count != null ? `${sk.employee_count} employees with real proficiency, avg score ${sk.avg_score}` : "manually added"}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-600"
                  >
                    {sk.subskill || sk.skill}
                    <button onClick={() => removeSkill(i, si)} className="text-gray-300 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {spec.skills.length === 0 && <span className="text-xs text-gray-400 italic">No skills specified yet.</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  value={skillDrafts[i] ?? ""}
                  onChange={(e) => setSkillDrafts((prev) => ({ ...prev, [i]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill(i))}
                  placeholder="Add a skill…"
                  className="flex-1 text-[11px] px-2 py-1 rounded-lg border border-gray-200 outline-none"
                />
                <button onClick={() => addSkill(i)} className="text-[11px] text-primary hover:underline whitespace-nowrap">
                  + Add skill
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between">
          <button
            onClick={() => setSpecs((prev) => [...prev, blankSpec()])}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Add project
          </button>
          <button
            onClick={() => forecast.mutate()}
            disabled={forecast.isPending || anyPreviewLoading}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "hsl(var(--primary))" }}
          >
            {forecast.isPending ? "Computing…" : "Run Forecast"}
          </button>
        </div>
      </div>

      {forecast.isPending && !forecast.data && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-72" />
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
          <TableSkeleton columns={8} rows={6} />
        </div>
      )}

      {forecast.data && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-700">What was forecast</p>
            {forecast.data.role_mix_sources.map((rs, i) => (
              <p key={i} className="text-[11px] text-gray-500">
                Spec {i + 1}: {rs.spec.count}x {rs.spec.coes?.join(", ") || rs.spec.category || "manual role-mix"}
                {rs.spec.type_of_project ? ` (${rs.spec.type_of_project})` : ""} -- role-mix:{" "}
                {formatRoleMixSource(rs.source, rs.sample_size, rs.spec.type_of_project)}
              </p>
            ))}
            {forecast.data.required_skills.length > 0 && (
              <p className="text-[11px] text-gray-500">
                Skills considered across this run: {forecast.data.required_skills.join(", ")}
              </p>
            )}
          </div>

          {forecast.data.total_shortfall_headcount > 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Shortfall of <strong>{forecast.data.total_shortfall_headcount}</strong> heads across roles -- redeployment alone can&apos;t cover this.
              {forecast.data.total_shortfall_value_usd > 0 && (
                <span className="ml-1">That&apos;s <strong>{formatUsd(forecast.data.total_shortfall_value_usd)}/mo</strong> of demand we can&apos;t staff without hiring.</span>
              )}
              {forecast.data.pct_achievable_with_current_headcount != null && (
                <span className="ml-1">
                  With the headcount we already have, we can hit{" "}
                  <strong>{forecast.data.pct_achievable_with_current_headcount}%</strong> of this engagement&apos;s
                  monthly billable value without hiring.
                </span>
              )}
            </div>
          ) : (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              Fully coverable by redeployment -- no hiring needed for this scenario
              {forecast.data.pct_achievable_with_current_headcount != null &&
                ` (100% of monthly billable value achievable with current headcount)`}
              .
            </div>
          )}

          <div className="rounded-xl border border-[hsl(var(--primary)/0.3)] bg-white overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-xs data-table">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  {["", "Designation", "Needed By", "Needed Headcount", "Covers This Role", "Shortfall", "Shortfall $/mo", "Signal"].map((h) => (
                    <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecast.data.breakdown.map((b) => {
                  const rowKey = `${b.designation}__${b.start_date}`;
                  const isOpen = expanded.has(rowKey);
                  return (
                    <Fragment key={rowKey}>
                      <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-3 py-2">
                          {(b.redeploy_candidates.length > 0 || b.adjacent_level_candidates.length > 0 || b.recommended_start_date) && (
                            <button onClick={() => toggleExpanded(rowKey)} className="text-gray-400 hover:text-gray-600">
                              {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-700">{b.designation}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {b.start_date}
                          {b.duration_weeks != null && <span className="text-gray-300"> +{b.duration_weeks}w</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{b.needed_headcount}</td>
                        <td className="px-3 py-2">
                          <span
                            className="text-gray-800 font-semibold"
                            title="The number that actually covers this role -- skill-matched, plus anyone one level away who flexes in. This is what Shortfall is calculated against."
                          >
                            {b.qualifying_for_redeploy + b.adjacent_fill_count} qualify
                          </span>
                          {b.adjacent_fill_count > 0 && (
                            <span className="text-gray-400"> ({b.qualifying_for_redeploy} on-skill <span className="text-emerald-600">+{b.adjacent_fill_count} flexible fit</span>)</span>
                          )}
                          {b.qualifying_for_redeploy < b.available_for_redeploy && (
                            <span
                              className="block text-[10px] text-amber-600 mt-0.5"
                              title="Holds the title but doesn't meet the requested skillset, so doesn't count toward covering this role"
                            >
                              {b.available_for_redeploy} hold this title in total
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{b.shortfall}</td>
                        <td className="px-3 py-2 text-gray-500">{b.shortfall_value_usd > 0 ? formatUsd(b.shortfall_value_usd) : "-"}</td>
                        <td className="px-3 py-2">{b.hire_signal ? <Badge variant="red">hire</Badge> : <Badge variant="green">covered</Badge>}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50/50 border-b border-gray-50">
                          <td colSpan={8} className="px-3 py-2.5 space-y-3">
                            <CandidateListSection
                              title={`Who could free up for this role by ${b.start_date} -- click a name for their full profile`}
                              candidates={b.redeploy_candidates}
                              onOpen={setSelectedEmployee}
                              onShowAll={() =>
                                setCandidateModal({ title: `${b.designation} -- who could free up by ${b.start_date}`, candidates: b.redeploy_candidates })
                              }
                              emptyText="No real spare capacity at this exact level."
                            />

                            <CandidateListSection
                              title={`Flexible fit -- one level away${
                                b.adjacent_fill_count > 0 ? ` (${b.adjacent_fill_count} counted toward the need above, verified skill match)` : ""
                              }`}
                              candidates={b.adjacent_level_candidates}
                              onOpen={setSelectedEmployee}
                              onShowAll={() =>
                                setCandidateModal({
                                  title: `${b.designation} -- flexible fit, one level away`,
                                  candidates: b.adjacent_level_candidates,
                                  showQualifies: true,
                                })
                              }
                              showQualifies
                            />

                            {b.recommended_start_date && (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                                <p className="text-[11px] text-amber-800">
                                  <strong>Recommended start date: {b.recommended_start_date}</strong> -- {b.recommended_start_date_proof}
                                </p>
                                <div className="mt-1.5">
                                  <CandidateListSection
                                    title=""
                                    candidates={b.recommended_available_then}
                                    onOpen={setSelectedEmployee}
                                    onShowAll={() =>
                                      setCandidateModal({
                                        title: `${b.designation} -- available by ${b.recommended_start_date}`,
                                        candidates: b.recommended_available_then,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            )}

                            {b.shortfall > 0 && !b.recommended_start_date && (
                              <p className="text-[11px] text-gray-400">
                                No real date within {180} days resolves this with same-or-adjacent-level capacity -- hire signal stands.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {forecast.data.excluded_rare_roles.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <button
                onClick={() => setRareRolesOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                <span>
                  {forecast.data.excluded_rare_roles.length} rare role{forecast.data.excluded_rare_roles.length > 1 ? "s" : ""} not counted
                  toward headcount need (historically needed on under 40% of past projects)
                </span>
                {rareRolesOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
              </button>
              {rareRolesOpen && (
                <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap gap-1.5">
                  {forecast.data.excluded_rare_roles.map((r) => (
                    <span
                      key={r.designation}
                      title={`Needed ${r.fte} FTE in this run, but only ~${r.prevalence_pct ?? "?"}% of historical projects in this role-mix needed one at all`}
                      className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
                    >
                      {r.designation} ({r.prevalence_pct ?? "?"}% of past projects)
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedEmployee && (
        <EmployeeProfileModal
          employeeId={selectedEmployee.employeeId}
          initialTab="allocations"
          skillMatchContext={selectedEmployee.skillMatchContext}
          onClose={() => setSelectedEmployee(null)}
        />
      )}

      {candidateModal && (
        <Modal title={candidateModal.title} subtitle={`${candidateModal.candidates.length} total`} onClose={() => setCandidateModal(null)}>
          <div className="flex flex-col gap-1.5 p-4">
            {candidateModal.candidates.map((c) => (
              <CandidateRow
                key={c.employee_id}
                c={c}
                onOpen={setSelectedEmployee}
                levelNote={levelNoteFor(c)}
                qualifies={candidateModal.showQualifies && c.skill_score != null ? c.skill_score >= 0.6 : undefined}
              />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
