"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { IncludeParams } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ADVANCED_PARAMS, isNonDefaultParams } from "@/components/shared/candidateFilters";

// Shared "Advanced Filters" control -- the exact same ranking-parameter panel
// used on the Recommendations page, reused verbatim everywhere else a
// candidate list is ranked (Leave backfill, Employee Profile Replacement/
// Redeploy tabs, Relief Staffing, New Project forecast). One definition, one
// behavior, everywhere.

export function AdvancedFiltersButton({
  open, include, defaults, includeBelowCapacity, onClick,
}: {
  open: boolean;
  include: IncludeParams;
  defaults: IncludeParams;
  includeBelowCapacity?: boolean;
  onClick: () => void;
}) {
  const activeCount = Object.values(include).filter(Boolean).length;
  const nonDefault = isNonDefaultParams(include, defaults) || !!includeBelowCapacity;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border-2 whitespace-nowrap transition",
        open || nonDefault ? "border-amber-400 text-amber-700 bg-amber-50" : "border-amber-300 text-amber-600"
      )}
      title="Choose exactly which parameters (skill, competency, availability, category match, project count) shape the ranking"
    >
      <SlidersHorizontal className="w-3 h-3" />
      Advanced{nonDefault && ` (${activeCount}/${ADVANCED_PARAMS.length}${includeBelowCapacity ? "+pool" : ""})`}
      <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
    </button>
  );
}

// Inline dropdown, not a modal -- opens/closes exactly like the Filters panel.
// Each parameter is its own checkbox; any combination can be applied, including
// turning off any of the defaults. At least one must stay checked (enforced
// below) since a fully-empty selection has nothing to rank by. Checking a box
// only stages a draft choice; nothing re-ranks until "Apply" is clicked.
export function AdvancedFiltersPanel({
  include,
  onApply,
  includeBelowCapacity,
  onApplyBelowCapacity,
  nearCapacityTolerancePct,
  onApplyNearCapacityTolerancePct,
}: {
  include: IncludeParams;
  onApply: (v: IncludeParams) => void;
  // Optional: the "candidate pool" gate (separate from ranking weights above).
  includeBelowCapacity?: boolean;
  onApplyBelowCapacity?: (v: boolean) => void;
  // How many points below requested % still counts as "near enough" -- fully
  // adjustable, paired with includeBelowCapacity in the same panel section.
  nearCapacityTolerancePct?: number;
  onApplyNearCapacityTolerancePct?: (v: number) => void;
}) {
  const [draft, setDraft] = useState<IncludeParams>(include);
  const [draftBelowCapacity, setDraftBelowCapacity] = useState(includeBelowCapacity ?? false);
  const [draftTolerance, setDraftTolerance] = useState(nearCapacityTolerancePct ?? 25);
  // Stay in sync if applied state changes from outside (e.g. a row/deal change
  // resets it) so the draft never silently disagrees with reality.
  useEffect(() => {
    setDraft(include);
  }, [include]);
  useEffect(() => {
    setDraftBelowCapacity(includeBelowCapacity ?? false);
  }, [includeBelowCapacity]);
  useEffect(() => {
    setDraftTolerance(nearCapacityTolerancePct ?? 25);
  }, [nearCapacityTolerancePct]);

  const draftCount = Object.values(draft).filter(Boolean).length;
  const isDirty =
    ADVANCED_PARAMS.some((p) => draft[p.key] !== include[p.key]) ||
    draftBelowCapacity !== (includeBelowCapacity ?? false) ||
    draftTolerance !== (nearCapacityTolerancePct ?? 25);
  const appliedLabels = ADVANCED_PARAMS.filter((p) => include[p.key]).map((p) => p.label);
  const totalWeight = ADVANCED_PARAMS.filter((p) => draft[p.key]).reduce((sum, p) => sum + p.weightPct, 0);

  const toggle = (key: keyof IncludeParams, checked: boolean) => {
    // Refuse to uncheck the last remaining parameter -- nothing left to rank by.
    if (!checked && draftCount <= 1) return;
    setDraft((prev) => ({ ...prev, [key]: checked }));
  };

  const apply = () => {
    onApply(draft);
    if (onApplyBelowCapacity) onApplyBelowCapacity(draftBelowCapacity);
    if (onApplyNearCapacityTolerancePct) onApplyNearCapacityTolerancePct(draftTolerance);
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 space-y-3">
      <div className="space-y-2.5">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Ranking parameters — select any (at least one)</p>
        {ADVANCED_PARAMS.map((p) => (
          <label key={p.key} className={cn("flex items-start gap-2.5", draftCount <= 1 && draft[p.key] ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>
            <input
              type="checkbox"
              className="mt-0.5"
              checked={draft[p.key]}
              onChange={(e) => toggle(p.key, e.target.checked)}
            />
            <span className="flex-1">
              <span className="text-sm font-medium text-gray-800">{p.label}</span>
              <span className="text-[10px] text-gray-400 ml-1.5">
                (base weight {p.weightPct}%{draft[p.key] && totalWeight > 0 ? ` → ${Math.round((p.weightPct / totalWeight) * 100)}% of ranking` : ""})
              </span>
              <span className="block text-[11px] text-gray-400 mt-0.5">{p.description}</span>
            </span>
          </label>
        ))}
      </div>
      {onApplyBelowCapacity && (
        <div className="pt-2 border-t border-amber-100 space-y-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Candidate pool — not a ranking weight</p>
          <div>
            <label className="text-[11px] text-gray-500 block mb-1">
              Near-capacity tolerance: <span className="font-semibold text-gray-700">{draftTolerance} points</span>
              <span className="text-gray-400"> — someone this many points short of the requested % still shows in Candidates</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={draftTolerance}
              onChange={(e) => setDraftTolerance(Number(e.target.value))}
              className="w-full h-1 accent-primary"
            />
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={draftBelowCapacity}
              onChange={(e) => setDraftBelowCapacity(e.target.checked)}
            />
            <span className="flex-1">
              <span className="text-sm font-medium text-gray-800">Include candidates below requested capacity</span>
              <span className="block text-[11px] text-gray-400 mt-0.5">
                Ignores the tolerance above entirely and shows everyone regardless of shortfall — they'll show with a
                "below requested %" tag.
              </span>
            </span>
          </label>
        </div>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-amber-100">
        <span className="text-[11px] text-gray-400">
          {isDirty
            ? "Not applied yet — click Apply to update the ranking"
            : `Applied: ${appliedLabels.join(", ")} · tolerance ${nearCapacityTolerancePct ?? 25} pts${includeBelowCapacity ? " + below-capacity included" : ""}`}
        </span>
        <button
          onClick={apply}
          disabled={!isDirty}
          className={cn(
            "text-xs font-medium px-4 py-1.5 rounded-lg transition",
            isDirty ? "bg-primary text-white hover:opacity-90" : "bg-gray-100 text-gray-400 cursor-not-allowed"
          )}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export function RangeFilter({
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

export function FilterSelect({
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
