"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api, type BudgetLineItem } from "@/lib/api";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { StepPlaceholder } from "@/components/wizard/StepPlaceholder";
import {
  BILLING_CURRENCY_OPTIONS, ENGAGEMENT_STYLE_OPTIONS, PAYMENT_TERM_OPTIONS, PROPOSITION_COE_OPTIONS, JMAN_LOCATIONS,
} from "@/lib/projectConstants";

const selectCls = "w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs bg-white outline-none";

type Tab = "fees" | "discount" | "planned_cost";

// Same real, RM-provided team templates the Forecast page's own FTE
// auto-generation already uses (backend/app/engines/role_mix_engine.py) --
// reused here rather than re-hardcoding the same numbers a second time.
const DELIVERY_STANDARD_TEAM = "Delivery Project - Standard Team";
const DND_TACTICAL_BUILD = "D&D Tactical Build";

function blankRow(defaultDate: string): BudgetLineItem {
  return {
    designation: "", location: JMAN_LOCATIONS[0], estimated_start_date: defaultDate,
    hours_per_day: 8, allocation_pct: 100, working_days: null,
    base_day_rate: null, eff_day_rate: null,
  };
}

export function Step3BudgetCreation({
  projectCode,
  projectLabel,
  defaultStartDate,
  defaultEndDate,
  defaultIsBillable,
  onNext,
}: {
  projectCode: string | null;
  projectLabel: string;
  defaultStartDate: string;
  defaultEndDate: string;
  defaultIsBillable: boolean;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ["project-budget", projectCode],
    queryFn: () => api.getProjectBudget(projectCode as string),
    enabled: projectCode != null,
  });
  const designations = useQuery({ queryKey: ["employee-designations"], queryFn: api.employeeDesignations });
  const roleMixCategories = useQuery({ queryKey: ["role-mix-categories"], queryFn: api.roleMixCategories });

  const [tab, setTab] = useState<Tab>("fees");
  const [loadedFromServer, setLoadedFromServer] = useState(false);
  const [billingCurrencies, setBillingCurrencies] = useState<string[]>([BILLING_CURRENCY_OPTIONS[0]]);
  const billingCurrency = billingCurrencies[0] ?? BILLING_CURRENCY_OPTIONS[0];
  const [engagementStyles, setEngagementStyles] = useState<string[]>([]);
  // Multi-value, consistent with Step 1's Tech/Solution COE -- this app's
  // real data already stores proposition_coe as semicolon-joined combos.
  const [propositionCoes, setPropositionCoes] = useState<string[]>([PROPOSITION_COE_OPTIONS[0]]);
  const [paymentTerms, setPaymentTerms] = useState<string[]>([]);
  const [feeMultiplier, setFeeMultiplier] = useState(1);
  const [paymentTermPct, setPaymentTermPct] = useState(0);
  const [isBillable, setIsBillable] = useState(defaultIsBillable);
  const [rows, setRows] = useState<BudgetLineItem[]>([blankRow(defaultStartDate)]);
  const [hourlyRateCache, setHourlyRateCache] = useState<Record<string, number | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateApplied, setTemplateApplied] = useState(false);

  // Consultant-family seats are UK-based by default on these real team
  // templates; everything else defaults to Chennai.
  function defaultLocationForDesignation(designation: string): string {
    return designation === "Consultant" || designation === "Associate Consultant" ? "UK" : JMAN_LOCATIONS[0];
  }

  function rowsFromTemplate(categoryName: string): BudgetLineItem[] {
    const cat = roleMixCategories.data?.find((c) => c.category === categoryName);
    if (!cat || cat.roles.length === 0) return [blankRow(defaultStartDate)];
    const out: BudgetLineItem[] = [];
    cat.roles.forEach((r) => {
      const headcount = Math.max(1, r.headcount);
      for (let i = 0; i < headcount; i++) {
        out.push({
          designation: r.designation, location: defaultLocationForDesignation(r.designation), estimated_start_date: defaultStartDate,
          hours_per_day: 8, allocation_pct: Math.round(r.typical_pct) || 100, working_days: null,
          base_day_rate: null, eff_day_rate: null,
        });
      }
    });
    return out;
  }

  // Typical delivery engagements need a predictable team (2 engineers, an
  // enabler, a consultant -- the real DELIVERY_STANDARD_TEAM template) --
  // pre-fill it by default on a brand-new budget instead of one blank row,
  // so the RM edits/removes what doesn't apply rather than building from
  // scratch every time. Skipped once a real saved budget exists.
  useEffect(() => {
    if (templateApplied || loadedFromServer) return;
    if (existing.isLoading || roleMixCategories.isLoading) return;
    const savedLineItems = (existing.data as { line_items?: unknown[] } | null)?.line_items;
    if (Array.isArray(savedLineItems) && savedLineItems.length > 0) { setTemplateApplied(true); return; }
    setRows(rowsFromTemplate(DELIVERY_STANDARD_TEAM));
    setTemplateApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateApplied, loadedFromServer, existing.isLoading, existing.data, roleMixCategories.isLoading]);

  useEffect(() => {
    if (existing.data && !loadedFromServer) {
      const d = existing.data as Record<string, unknown>;
      if (typeof d.billing_currency === "string" && d.billing_currency) setBillingCurrencies([d.billing_currency]);
      if (typeof d.engagement_style === "string" && d.engagement_style) setEngagementStyles([d.engagement_style]);
      if (typeof d.proposition_coe === "string" && d.proposition_coe) setPropositionCoes(d.proposition_coe.split("; ").filter(Boolean));
      if (typeof d.payment_term === "string" && d.payment_term) setPaymentTerms([d.payment_term]);
      setIsBillable(d.is_billable === "True" || d.is_billable === true);
      if (Array.isArray(d.line_items) && d.line_items.length > 0) setRows(d.line_items as BudgetLineItem[]);
      setLoadedFromServer(true);
    }
  }, [existing.data, loadedFromServer]);

  useEffect(() => {
    const missing = Array.from(new Set(rows.map((r) => r.designation).filter(Boolean))).filter((d) => !(d in hourlyRateCache));
    missing.forEach(async (d) => {
      const r = await api.projectDayRate(d, 1);
      setHourlyRateCache((prev) => ({ ...prev, [d]: r.base_day_rate }));
    });
  }, [rows, hourlyRateCache]);

  function updateRow(i: number, patch: Partial<BudgetLineItem>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, blankRow(defaultStartDate)]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function computed(row: BudgetLineItem) {
    const hourly = row.designation ? hourlyRateCache[row.designation] : null;
    const baseDayRate = hourly != null ? Math.round(hourly * row.hours_per_day * 100) / 100 : null;
    const effDayRate = baseDayRate != null ? Math.round(baseDayRate * feeMultiplier * 100) / 100 : null;
    const workingDays = row.working_days ?? 0;
    const total = effDayRate != null && workingDays ? Math.round(effDayRate * workingDays * 100) / 100 : 0;
    const cost = baseDayRate != null && workingDays ? Math.round(baseDayRate * workingDays * 100) / 100 : 0;
    const margin = total > 0 ? Math.round(((total - cost) / total) * 1000) / 10 : 0;
    return { baseDayRate, effDayRate, total, cost, margin };
  }

  const totals = rows.reduce(
    (acc, r) => {
      const c = computed(r);
      return { total: acc.total + c.total, cost: acc.cost + c.cost };
    },
    { total: 0, cost: 0 }
  );
  const blendedMargin = totals.total > 0 ? Math.round(((totals.total - totals.cost) / totals.total) * 1000) / 10 : 0;

  // Straight after the budget is saved, actually staff each budgeted role
  // with the top available real person holding that designation -- Resource
  // Allocation should already be done by the time the RM gets there, not
  // waiting on a separate manual "Assign" click per row. Roles that already
  // have enough real allocations (e.g. re-saving an edited budget) are
  // skipped so this stays idempotent rather than piling up duplicates.
  //
  // Fetches/writes run in parallel, not one role at a time: this used to
  // await a topCandidatesForRole + assignAllocation round trip sequentially
  // per row (and even re-fetch the identical candidate list twice for two
  // rows of the same designation), which is why saving a 4-role budget was
  // taking 30-60s. Now it's one parallel batch of lookups (deduped by
  // designation) followed by one parallel batch of writes.
  async function autoAssignFromBudget(items: BudgetLineItem[]) {
    if (!projectCode) return;
    // A transient failure here (e.g. a reload race right after the project
    // was just created) shouldn't abort staffing the whole budget -- worst
    // case we treat it as "no existing allocations yet" and possibly
    // over-suggest, which is far better than silently staffing nobody.
    const realCountByDesignation: Record<string, number> = {};
    try {
      const rosterData = await api.projectRoster(projectCode);
      for (const r of rosterData.roster) {
        if (r.job_name) realCountByDesignation[r.job_name] = (realCountByDesignation[r.job_name] ?? 0) + 1;
      }
    } catch {
      // proceed with an empty count -- see comment above
    }

    const seenCountByDesignation: Record<string, number> = {};
    const itemsNeedingStaff = items.filter((item) => {
      if (!item.designation) return false;
      seenCountByDesignation[item.designation] = (seenCountByDesignation[item.designation] ?? 0) + 1;
      return seenCountByDesignation[item.designation] > (realCountByDesignation[item.designation] ?? 0);
    });
    if (itemsNeedingStaff.length === 0) return;

    const distinctDesignations = Array.from(new Set(itemsNeedingStaff.map((i) => i.designation)));
    const candidatesByDesignation: Record<string, { employee_id: string }[]> = {};
    await Promise.all(
      distinctDesignations.map(async (designation) => {
        const asOfDate = itemsNeedingStaff.find((i) => i.designation === designation)?.estimated_start_date || defaultStartDate;
        candidatesByDesignation[designation] = await api.topCandidatesForRole(designation, asOfDate, 20);
      })
    );

    const usedEmployeeIds = new Set<string>();
    const picks: { employeeId: string; item: BudgetLineItem }[] = [];
    for (const item of itemsNeedingStaff) {
      const pool = candidatesByDesignation[item.designation] ?? [];
      const pick = pool.find((c) => !usedEmployeeIds.has(c.employee_id));
      if (!pick) continue;
      usedEmployeeIds.add(pick.employee_id);
      picks.push({ employeeId: pick.employee_id, item });
    }

    await Promise.allSettled(
      picks.map(({ employeeId, item }) =>
        api.assignAllocation({
          employeeId, projectId: projectCode,
          allocationPct: item.allocation_pct || 100,
          startDate: item.estimated_start_date || defaultStartDate,
          endDate: defaultEndDate || item.estimated_start_date || defaultStartDate,
          resourcingStatus: "BILLABLE", shiftType: "General", reviewerEmployeeId: null,
        })
      )
    );
  }

  async function submit() {
    setError(null);
    if (!projectCode) { setError("Create the project in Step 1 first, then come back to save this."); return; }
    setSubmitting(true);
    try {
      const enrichedRows = rows.map((r) => {
        const c = computed(r);
        return { ...r, base_day_rate: c.baseDayRate, eff_day_rate: c.effDayRate };
      });
      await api.saveProjectBudget(
        projectCode,
        {
          billing_currency: billingCurrency,
          engagement_style: engagementStyles[0] ?? "",
          proposition_coe: propositionCoes.join("; "),
          payment_term: paymentTerms[0] ?? "",
          is_billable: isBillable,
        },
        enrichedRows
      );
      // Step 5 stays mounted the whole time the wizard is open (so switching
      // steps never loses in-progress edits) -- which means its own budget/
      // roster queries won't refetch on their own just because we saved here.
      // Invalidate explicitly so it picks up the new budget and the
      // allocations we're about to create below.
      qc.invalidateQueries({ queryKey: ["project-budget", projectCode] });
      await autoAssignFromBudget(enrichedRows);
      qc.invalidateQueries({ queryKey: ["roster", projectCode] });
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the budget.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-800">
          Create Budget for project
          {projectLabel && <span className="ml-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs align-middle">{projectLabel}</span>}
        </p>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} />
          Is Billable
        </label>
      </div>

      {!projectCode && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No project created yet — you can build out this budget now, but it won&apos;t save until you complete Step 1.
        </p>
      )}
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Billing Currency <span className="text-red-500">*</span></label>
          <SearchableSelect options={BILLING_CURRENCY_OPTIONS.map((c) => ({ value: c, label: c }))} value={billingCurrencies} onChange={setBillingCurrencies} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Engagement Style <span className="text-red-500">*</span></label>
          <SearchableSelect
            options={ENGAGEMENT_STYLE_OPTIONS.map((c) => ({ value: c, label: c }))}
            value={engagementStyles}
            onChange={setEngagementStyles}
            placeholder="Select Engagement Style"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Proposition Coe <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-1.5">
            <SearchableSelect options={PROPOSITION_COE_OPTIONS.map((c) => ({ value: c, label: c }))} value={propositionCoes} onChange={setPropositionCoes} multi className="flex-1" />
            <input
              type="number" step={0.05} min={1} value={feeMultiplier}
              onChange={(e) => setFeeMultiplier(Number(e.target.value) || 1)}
              className="w-14 px-1.5 py-1.5 rounded-lg border border-gray-200 text-xs text-center flex-shrink-0"
              title="Fee multiplier applied to the base day rate to get the billed (Eff.) rate"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Payment Term <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-1.5">
            <SearchableSelect
              options={PAYMENT_TERM_OPTIONS.map((c) => ({ value: c, label: c }))}
              value={paymentTerms}
              onChange={setPaymentTerms}
              placeholder="Select Payment Term"
              className="flex-1"
            />
            <input
              type="number" step={1} min={0} value={paymentTermPct}
              onChange={(e) => setPaymentTermPct(Number(e.target.value) || 0)}
              className="w-14 px-1.5 py-1.5 rounded-lg border border-gray-200 text-xs text-center flex-shrink-0"
              title="Early/late payment adjustment %"
            />
          </div>
        </div>
      </div>

      <div className="flex rounded-xl overflow-hidden border border-gray-200 text-xs font-medium">
        {([
          ["fees", "Professional Fees"],
          ["discount", "Discount / Premium"],
          ["planned_cost", "Planned Cost"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 px-4 py-2.5 ${tab === key ? "text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            style={tab === key ? { backgroundColor: "hsl(var(--primary))" } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "fees" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-400">Quick-fill a typical team:</span>
            <button
              onClick={() => setRows(rowsFromTemplate(DELIVERY_STANDARD_TEAM))}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
            >
              Delivery Team (2 Engineers, 1 Enabler, 1 Consultant)
            </button>
            <button
              onClick={() => setRows(rowsFromTemplate(DND_TACTICAL_BUILD))}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
            >
              D&amp;D Team (Assoc. Consultant, Sr. Engineer, Architect, Consultant)
            </button>
          </div>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Role *", "Location", "Est. Start", "Hrs/Day", "Alloc %", "Working Days *", "Base Day Rate", "Eff. Day Rate", "Total", "Cost", "Margin %", ""].map((h) => (
                    <th key={h} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const c = computed(row);
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-2.5 py-1.5 min-w-[180px]">
                        <SearchableSelect
                          options={(designations.data ?? []).map((d) => ({ value: d, label: d }))}
                          value={row.designation ? [row.designation] : []}
                          onChange={(v) => updateRow(i, { designation: v[0] ?? "" })}
                        />
                      </td>
                      <td className="px-2.5 py-1.5 min-w-[100px]">
                        <SearchableSelect
                          options={JMAN_LOCATIONS.map((l) => ({ value: l, label: l }))}
                          value={row.location ? [row.location] : []}
                          onChange={(v) => updateRow(i, { location: v[0] ?? null })}
                          placeholder="-- Select --"
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input type="date" className={selectCls} value={row.estimated_start_date ?? ""} onChange={(e) => updateRow(i, { estimated_start_date: e.target.value })} />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input type="number" min={1} max={24} className={selectCls + " w-16"} value={row.hours_per_day} onChange={(e) => updateRow(i, { hours_per_day: Number(e.target.value) || 0 })} />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input type="number" min={0} max={100} className={selectCls + " w-16"} value={row.allocation_pct} onChange={(e) => updateRow(i, { allocation_pct: Number(e.target.value) || 0 })} />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <input type="number" min={0} className={selectCls + " w-20"} value={row.working_days ?? ""} onChange={(e) => updateRow(i, { working_days: e.target.value ? Number(e.target.value) : null })} />
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{c.baseDayRate != null ? c.baseDayRate.toLocaleString() : "-"}</td>
                      <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{c.effDayRate != null ? c.effDayRate.toLocaleString() : "-"}</td>
                      <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{c.total.toLocaleString()}</td>
                      <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{c.cost.toLocaleString()}</td>
                      <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{c.margin}%</td>
                      <td className="px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <button onClick={addRow} className="text-[hsl(var(--primary))]"><Plus size={14} /></button>
                          <button onClick={() => removeRow(i)} className="text-red-500"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td colSpan={8} className="px-2.5 py-2 text-right">Total</td>
                  <td className="px-2.5 py-2">{billingCurrency} {totals.total.toLocaleString()}</td>
                  <td className="px-2.5 py-2">{billingCurrency} {totals.cost.toLocaleString()}</td>
                  <td className="px-2.5 py-2">{blendedMargin}%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        </div>
      )}

      {tab === "planned_cost" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-[11px] text-gray-400">Planned Revenue</p>
            <p className="text-lg font-semibold text-gray-800">{billingCurrency} {totals.total.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-[11px] text-gray-400">Planned Cost</p>
            <p className="text-lg font-semibold text-gray-800">{billingCurrency} {totals.cost.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-[11px] text-gray-400">Blended Margin</p>
            <p className="text-lg font-semibold text-gray-800">{blendedMargin}%</p>
          </div>
          <p className="sm:col-span-3 text-[11px] text-gray-400">Computed from the Professional Fees rows above — no separate data entry.</p>
        </div>
      )}

      {tab === "discount" && <StepPlaceholder title="Discount / Premium" />}

      <div className="flex justify-end gap-2">
        <button
          onClick={submit}
          disabled={submitting}
          className="text-xs px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50"
          style={{ backgroundColor: "hsl(var(--primary))" }}
        >
          {submitting ? "Saving…" : "Save & Next"}
        </button>
      </div>
    </div>
  );
}
