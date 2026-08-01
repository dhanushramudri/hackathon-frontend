"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users2, AlertTriangle, Table2,
  TrendingUp, TrendingDown, Minus, DollarSign, Briefcase, UserMinus, Activity,
  FlaskConical, RotateCcw, Play, Loader2,
} from "lucide-react";
import {
  api, type HeadcountHistoryRow, type HeadcountForecastRow, type HeadcountInsights,
  type HeadcountPredictionResult, type HeadcountRawCellValue,
} from "@/lib/api";
import { Skeleton } from "@/components/shared/Skeleton";
import { DataGrid } from "@/components/shared/DataGrid";
import { cn } from "@/lib/utils";
import { JMAN, JMAN_CHART_PALETTE, CHART_CHROME } from "@/lib/brandColors";

const HORIZONS = [3, 6, 12] as const;
type Horizon = typeof HORIZONS[number];

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

function buildChartData(history: HeadcountHistoryRow[], forecast: HeadcountForecastRow[]) {
  const hist = history.map((r) => ({
    month: r.month,
    actual: r.total_active_headcount as number | undefined,
    forecast: undefined as number | undefined,
    hires_by_location: r.hires_by_location,
    hires_estimated: r.hires_estimated,
    note: r.note,
  }));
  const fc = forecast.map((r) => ({
    month: r.month,
    actual: undefined as number | undefined,
    forecast: r.forecast as number | undefined,
    lower: r.lower as number | undefined,
    upper: r.upper as number | undefined,
    hires_by_location: undefined as Record<string, number> | undefined,
    hires_estimated: false,
    note: null as string | null,
  }));
  // Bridge point so the forecast line (and its range band) connects to the
  // last actual value instead of starting from a gap.
  const last = hist[hist.length - 1];
  if (last && fc[0]) {
    fc[0] = { ...fc[0], actual: last.actual, forecast: fc[0].forecast ?? last.actual, lower: fc[0].lower ?? last.actual, upper: fc[0].upper ?? last.actual };
  }
  return [...hist, ...fc];
}

function ForecastChart({
  data, boundaryMonth, lowConfidence,
}: {
  data: ReturnType<typeof buildChartData>;
  boundaryMonth: string;
  lowConfidence: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
        <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 10, fill: CHART_CHROME.axisText }} interval={2} />
        <YAxis
          tick={{ fontSize: 10, fill: CHART_CHROME.axisText }}
          domain={["dataMin - 15", "dataMax + 15"]}
          width={48}
          label={{ value: "Headcount", angle: -90, position: "insideLeft", offset: 12, style: { fontSize: 10, fill: CHART_CHROME.axisText } }}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const byName = Object.fromEntries(payload.map((p) => [p.name as string, p.value as number]));
            const hasActual = byName["Actual"] != null;
            const hasForecast = byName["Forecast"] != null;
            const hasRange = byName["Upper"] != null && byName["Lower"] != null && byName["Upper"] !== byName["Lower"];
            const point = payload[0]?.payload as
              | { hires_by_location?: Record<string, number>; hires_estimated?: boolean; note?: string | null }
              | undefined;
            const hiresByLocation = hasActual ? point?.hires_by_location : undefined;
            const hasHiresByLocation = hiresByLocation && Object.keys(hiresByLocation).length > 0;
            return (
              <div style={{ background: CHART_CHROME.tooltipBg, border: `1px solid ${CHART_CHROME.tooltipBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, minWidth: 210, boxShadow: "0 4px 16px rgba(25,16,91,0.12)" }}>
                <p style={{ color: CHART_CHROME.labelText, marginBottom: 8, fontWeight: 700, fontSize: 13 }}>{formatMonth(label as string)}</p>
                {hasActual && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText }}>Actual headcount</span>
                    <strong style={{ color: JMAN.midnightBlue }}>{Math.round(byName["Actual"])}</strong>
                  </div>
                )}
                {hasHiresByLocation && (
                  <div style={{ margin: "6px 0", padding: "6px 8px", borderRadius: 6, background: `${JMAN.emerald}0D` }}>
                    <p style={{ color: CHART_CHROME.mutedText, fontSize: 10, marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      Hires this month{point?.hires_estimated ? " (estimated)" : ""}
                    </p>
                    {Object.entries(hiresByLocation!).map(([loc, count]) => (
                      <div key={loc} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                        <span style={{ color: CHART_CHROME.mutedText }}>{loc}</span>
                        <strong style={{ color: CHART_CHROME.labelText }}>{count}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {hasForecast && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText }}>Forecast</span>
                    <strong style={{ color: JMAN.trypanBlue }}>{Math.round(byName["Forecast"])}</strong>
                  </div>
                )}
                {hasRange && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText, fontSize: 11 }}>Real range (best/worst trailing month)</span>
                    <span style={{ color: CHART_CHROME.mutedText, fontSize: 11 }}>{Math.round(byName["Lower"])} – {Math.round(byName["Upper"])}</span>
                  </div>
                )}
                {point?.note && (
                  <p style={{ color: JMAN.amber, fontSize: 10, marginTop: 6 }}>{point.note}</p>
                )}
                <p style={{ color: CHART_CHROME.mutedText, fontSize: 10, marginTop: 6, borderTop: `1px solid ${CHART_CHROME.grid}`, paddingTop: 5 }}>
                  {hasForecast ? "Trailing-average forecast, not a validated model" : "Real historical period"}
                </p>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line dataKey="actual" stroke={JMAN.midnightBlue} strokeWidth={2} dot={false} connectNulls name="Actual" />
        <Line dataKey="upper" stroke={JMAN.trypanBlue} strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls strokeOpacity={0.35} legendType="none" name="Upper" />
        <Line dataKey="lower" stroke={JMAN.trypanBlue} strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls strokeOpacity={0.35} legendType="none" name="Lower" />
        <Line dataKey="forecast" stroke={JMAN.trypanBlue} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls strokeOpacity={lowConfidence ? 0.6 : 1} name="Forecast" />
        <ReferenceLine x={boundaryMonth} stroke={CHART_CHROME.mutedText} strokeDasharray="4 3" label={{ value: "Today", fontSize: 9, fill: CHART_CHROME.mutedText, position: "insideTopRight" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function TrendBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null;
  const isUp = pct > 0.5;
  const isDown = pct < -0.5;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? "text-emerald-500" : isDown ? "text-red-500" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold", color)}>
      <Icon className="w-2.5 h-2.5" /> {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function StatCard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number | null }) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-xl font-bold text-foreground">{value}</p>
        <TrendBadge pct={trend} />
      </div>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ProductivityPanel({ insights }: { insights: HeadcountInsights }) {
  const { history, forecast, predicted_revenue_per_head_gbp_3mo, predicted_ebitda_margin_pct_3mo } = insights.productivity;
  // Combined, in order, so a 12-months-back YoY lookup (for the growth-rate proof
  // in the tooltip) can walk back across the history/forecast boundary.
  const combined = [...history, ...forecast];
  const yoyGrowthPct = (idx: number): number | null => {
    const back = idx - 12;
    if (back < 0) return null;
    const now = combined[idx].revenue_ltm_gbp_000;
    const then = combined[back].revenue_ltm_gbp_000;
    return then > 0 ? Math.round(((now - then) / then) * 1000) / 10 : null;
  };

  // -16 shows the full real 13-month LTM anchor range (May-25 -> May-26) plus a
  // little context on either side, instead of clipping to just the trailing 12.
  const histStartIdx = Math.max(0, history.length - 16);
  const histSlice = history.slice(histStartIdx).map((p, i) => ({
    month: p.month, value: p.value as number | undefined, predicted: undefined as number | undefined,
    revenueLtm000: p.revenue_ltm_gbp_000, headcount: p.headcount, isRealAnchor: p.is_real_revenue_anchor,
    yoyGrowthPct: yoyGrowthPct(histStartIdx + i),
  }));
  const fcSlice = forecast.map((p, i) => ({
    month: p.month, value: undefined as number | undefined, predicted: p.value as number | undefined,
    revenueLtm000: p.revenue_ltm_gbp_000, headcount: p.headcount, isRealAnchor: p.is_real_revenue_anchor,
    yoyGrowthPct: yoyGrowthPct(history.length + i),
  }));
  const last = histSlice[histSlice.length - 1];
  if (last && fcSlice[0]) fcSlice[0] = { ...fcSlice[0], value: last.value, predicted: fcSlice[0].predicted ?? last.value };
  const chartData = [...histSlice, ...fcSlice];
  const boundaryMonth = last?.month ?? "";

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <DollarSign className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Workforce Productivity & Margin</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Revenue per head and Adj. EBITDA margin, based on reported financials -- with a 3-month predicted continuation. Hover a point for the real revenue/headcount behind it.</p>
      <div className="flex items-baseline gap-6 mb-1 flex-wrap">
        <p className="text-2xl font-bold text-foreground">
          £{insights.productivity.current_revenue_per_head_gbp.toLocaleString()}
          <span className="text-xs font-normal text-muted-foreground"> /head/month</span>
        </p>
        <p className="text-2xl font-bold text-foreground">
          {insights.productivity.current_ebitda_margin_pct.toFixed(1)}%
          <span className="text-xs font-normal text-muted-foreground"> Adj. EBITDA margin</span>
        </p>
      </div>
      {predicted_revenue_per_head_gbp_3mo != null && (
        <p className="text-xs text-muted-foreground mb-3">
          3-month predicted: <strong className="text-foreground">£{predicted_revenue_per_head_gbp_3mo.toLocaleString()}/head/month</strong>
          {predicted_ebitda_margin_pct_3mo != null && <> · <strong className="text-foreground">{predicted_ebitda_margin_pct_3mo.toFixed(1)}%</strong> margin</>}
        </p>
      )}
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 9, fill: CHART_CHROME.axisText }} interval={2} />
          <YAxis tick={{ fontSize: 9, fill: CHART_CHROME.axisText }} width={40} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as (typeof chartData)[number] | undefined;
              if (!point) return null;
              const revenuePerHead = point.value ?? point.predicted;
              return (
                <div style={{ background: CHART_CHROME.tooltipBg, border: `1px solid ${CHART_CHROME.tooltipBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, minWidth: 220, boxShadow: "0 4px 16px rgba(25,16,91,0.12)" }}>
                  <p style={{ color: CHART_CHROME.labelText, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>{formatMonth(label as string)}</p>
                  {revenuePerHead != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                      <span style={{ color: CHART_CHROME.mutedText }}>Revenue/head</span>
                      <strong style={{ color: JMAN.emerald }}>£{Math.round(revenuePerHead).toLocaleString()}</strong>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText }}>LTM revenue</span>
                    <strong style={{ color: CHART_CHROME.labelText }}>£{Math.round(point.revenueLtm000 * 1000).toLocaleString()}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText }}>Headcount used</span>
                    <strong style={{ color: CHART_CHROME.labelText }}>{Math.round(point.headcount)}</strong>
                  </div>
                  {point.yoyGrowthPct != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                      <span style={{ color: CHART_CHROME.mutedText }}>Revenue growth (YoY)</span>
                      <strong style={{ color: CHART_CHROME.labelText }}>{point.yoyGrowthPct > 0 ? "+" : ""}{point.yoyGrowthPct}%</strong>
                    </div>
                  )}
                  <p style={{ color: CHART_CHROME.mutedText, fontSize: 10, marginTop: 6, borderTop: `1px solid ${CHART_CHROME.grid}`, paddingTop: 5 }}>
                    {point.isRealAnchor ? "Real reported figure" : "Extrapolated from the real reported trend"}
                  </p>
                </div>
              );
            }}
          />
          <Line dataKey="value" stroke={JMAN.emerald} strokeWidth={2} dot={false} connectNulls name="Revenue/head" />
          <Line dataKey="predicted" stroke={JMAN.emerald} strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.6} dot={false} connectNulls name="Predicted" />
          <ReferenceLine x={boundaryMonth} stroke={CHART_CHROME.mutedText} strokeDasharray="4 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const COE_COLORS = JMAN_CHART_PALETTE;

function CoeBreakdownPanel({ insights }: { insights: HeadcountInsights }) {
  const { mix, latest_month } = insights.coe_breakdown;
  const maxShare = Math.max(...mix.map((m) => m.share_pct), 1);
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Briefcase className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Headcount by COE</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Current mix as of {formatMonth(latest_month)}.</p>
      <div className="space-y-2">
        {mix.map((m, i) => (
          <div key={m.coe} className="flex items-center gap-2">
            <span className="text-xs text-foreground w-40 flex-shrink-0 truncate">{m.coe}</span>
            <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${(m.share_pct / maxShare) * 100}%`, backgroundColor: COE_COLORS[i % COE_COLORS.length] }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-28 text-right flex-shrink-0">
              {m.headcount} ({m.share_pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttritionPanel({ insights }: { insights: HeadcountInsights }) {
  const { hires_vs_resignations } = insights.attrition;
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserMinus className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Attrition & Retention</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Real hires vs. resignations, last 6 months. Resignation records only exist from 2026-05 onward, so
        earlier months show hires only.
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={hires_vs_resignations} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 9, fill: CHART_CHROME.axisText }} />
          <YAxis tick={{ fontSize: 9, fill: CHART_CHROME.axisText }} width={28} />
          <Tooltip labelFormatter={formatMonth} contentStyle={{ background: CHART_CHROME.tooltipBg, border: `1px solid ${CHART_CHROME.tooltipBorder}`, fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line dataKey="new_hires" stroke={JMAN.emerald} strokeWidth={2} dot={{ r: 2 }} name="Hires" />
          <Line dataKey="resignations" stroke={JMAN.rose} strokeWidth={2} dot={{ r: 2 }} name="Resignations" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function UtilizationPanel({ insights }: { insights: HeadcountInsights }) {
  const { free_pool_current, over_allocated_current, under_allocated_current } = insights.utilization;
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Utilization & Bench Health</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Real current over/under-allocation and free pool (same counts as the Allocations/Free Pool pages).</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center px-2 py-2 rounded-lg bg-muted/40 border border-border">
          <p className="text-lg font-bold text-foreground">{over_allocated_current}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Over-allocated</p>
        </div>
        <div className="text-center px-2 py-2 rounded-lg bg-muted/40 border border-border">
          <p className="text-lg font-bold text-foreground">{under_allocated_current}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Under-allocated</p>
        </div>
        <div className="text-center px-2 py-2 rounded-lg bg-muted/40 border border-border">
          <p className="text-lg font-bold text-foreground">{free_pool_current}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Free pool</p>
        </div>
      </div>
    </div>
  );
}


export default function HeadcountPredictionPage() {
  const [horizon, setHorizon] = useState<Horizon>(6);
  const [simulated, setSimulated] = useState<HeadcountPredictionResult | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["headcount-prediction", horizon],
    queryFn: () => api.headcountPrediction(horizon),
  });

  const activeData = simulated ?? data;

  const boundaryMonth = activeData?.history[activeData.history.length - 1]?.month ?? "";
  const lowConfidence = activeData?.forecast[0]?.low_confidence ?? false;
  const chartData = activeData ? buildChartData(activeData.history, activeData.forecast) : [];

  const currentHeadcount = activeData?.history[activeData.history.length - 1]?.total_active_headcount;
  const threeMonthForecast = activeData?.forecast[2];

  return (
    <div className="p-4 sm:p-6 w-full space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users2 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Headcount Prediction</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">Real active headcount, with a trailing-average forecast.</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => { setHorizon(h); setSimulated(null); }}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                horizon === h ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {h}M
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
      {isError && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <AlertTriangle className="w-4 h-4" /> Failed to load the headcount forecast. Check the backend is running.
        </div>
      )}

      {simulated && (
        <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5 text-amber-700 dark:text-amber-400">
          <FlaskConical className="w-4 h-4 flex-shrink-0" />
          <span>Showing a <strong>simulated scenario</strong> from manually edited data below — not the live real numbers.</span>
          <button
            onClick={() => setSimulated(null)}
            className="ml-auto flex items-center gap-1 font-semibold px-2.5 py-1 rounded-md bg-background border border-amber-500/40 hover:bg-amber-500/10 transition"
          >
            <RotateCcw className="w-3 h-3" /> Reset to real data
          </button>
        </div>
      )}

      {activeData && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard
              label="Current Headcount"
              value={String(currentHeadcount ?? "-")}
              sub={boundaryMonth ? formatMonth(boundaryMonth) : undefined}
              trend={activeData.insights.headcount_change_pct_3mo}
            />
            <StatCard
              label="3-Month Forecast"
              value={threeMonthForecast ? String(Math.round(threeMonthForecast.forecast)) : "-"}
              sub={threeMonthForecast ? formatMonth(threeMonthForecast.month) : undefined}
              trend={activeData.insights.forecast_change_pct}
            />
            <StatCard
              label="Forecast Confidence"
              value={activeData.model_info.low_confidence ? "Low" : "OK"}
              sub={`based on ${activeData.model_info.sample_months} real month(s) of departure data`}
            />
          </div>

          {/* Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground mb-1">Monthly Active Headcount</p>
            <p className="text-xs text-muted-foreground mb-4">
              Solid = real headcount. Dashed = trailing-average forecast{lowConfidence ? " (low confidence -- thin real departure history)" : ""}.
              Faint band = real range (best vs. worst of the trailing months feeding the forecast), not a fabricated confidence interval.
            </p>
            <ForecastChart data={chartData} boundaryMonth={boundaryMonth} lowConfidence={lowConfidence} />
          </div>

          {/* Executive panels: money, skills mix, retention, bench health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ProductivityPanel insights={activeData.insights} />
            <CoeBreakdownPanel insights={activeData.insights} />
            <AttritionPanel insights={activeData.insights} />
            <UtilizationPanel insights={activeData.insights} />
          </div>

          {/* Raw data used -- editable, with a Run button to re-forecast on edited values */}
          <DataUsedSection horizon={horizon} onSimulate={setSimulated} isSimulated={!!simulated} />
        </>
      )}
    </div>
  );
}

const EDITABLE_HISTORY_COLUMNS = ["new_hires", "resignations", "total_active_headcount"];

function DataUsedSection({
  horizon, onSimulate, isSimulated,
}: {
  horizon: number;
  onSimulate: (result: HeadcountPredictionResult) => void;
  isSimulated: boolean;
}) {
  const tablesQuery = useQuery({ queryKey: ["headcount-prediction-tables"], queryFn: () => api.headcountPredictionTables() });
  const [selected, setSelected] = useState<string | null>(null);
  const activeTable = selected ?? tablesQuery.data?.[0]?.table ?? null;

  const rawQuery = useQuery({
    queryKey: ["headcount-prediction-raw", activeTable],
    queryFn: () => api.headcountPredictionRawData(activeTable as string),
    enabled: !!activeTable,
  });

  const activeMeta = tablesQuery.data?.find((t) => t.table === activeTable);
  const isMonthlyHistory = activeTable === "monthly_history";

  // Edits keyed by month -> column -> value, layered on top of the fetched real rows.
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const editedRows = useMemo(() => {
    if (!rawQuery.data) return [];
    if (!isMonthlyHistory) return rawQuery.data.rows;
    return rawQuery.data.rows.map((row) => {
      const rowEdits = edits[String(row.month)];
      if (!rowEdits) return row;
      const merged = { ...row, ...rowEdits };
      const newHires = Number(merged.new_hires) || 0;
      const resignations = Number(merged.resignations) || 0;
      return { ...merged, net: newHires - resignations };
    });
  }, [rawQuery.data, isMonthlyHistory, edits]);

  const pendingEditCount = Object.keys(edits).length;

  const handleCellEdit = (rowKeyValue: string, column: string, value: number) => {
    setEdits((prev) => ({ ...prev, [rowKeyValue]: { ...prev[rowKeyValue], [column]: value } }));
  };

  const handleRun = async () => {
    setIsRunning(true);
    setRunError(null);
    try {
      const result = await api.headcountPredictionSimulate(horizon, editedRows as Record<string, HeadcountRawCellValue>[]);
      onSimulate(result);
    } catch {
      setRunError("Couldn't run the model on the edited data. Check the values and try again.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Table2 className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Data used for this forecast</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Every table behind this forecast — sortable, searchable, exportable. Monthly History is editable: double-click a
        Hires / Resignations / Headcount cell, then Run to see the forecast and graphs recompute on your edited values.
      </p>

      {tablesQuery.isLoading && <Skeleton className="h-10 mb-3" />}
      {tablesQuery.data && (
        <div className="flex items-center gap-1 flex-wrap mb-3 bg-muted rounded-lg p-1">
          {tablesQuery.data.map((t) => (
            <button
              key={t.table}
              onClick={() => setSelected(t.table)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap",
                activeTable === t.table ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {activeMeta && <p className="text-xs text-muted-foreground mb-3">{activeMeta.description}</p>}

      {isMonthlyHistory && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button
            onClick={handleRun}
            disabled={isRunning || pendingEditCount === 0}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition",
              pendingEditCount === 0
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:opacity-90"
            )}
          >
            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run model{pendingEditCount > 0 ? ` (${pendingEditCount} month${pendingEditCount > 1 ? "s" : ""} edited)` : ""}
          </button>
          {(pendingEditCount > 0 || isSimulated) && (
            <button
              onClick={() => { setEdits({}); }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border hover:bg-muted transition"
              style={{ borderColor: `${JMAN.emerald}40` }}
            >
              <RotateCcw className="w-3 h-3" /> Clear edits
            </button>
          )}
          {runError && <span className="text-xs text-destructive">{runError}</span>}
        </div>
      )}

      {rawQuery.isLoading && <Skeleton className="h-64" />}
      {rawQuery.isError && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <AlertTriangle className="w-4 h-4" /> Failed to load this table.
        </div>
      )}
      {rawQuery.data && (
        <DataGrid
          columns={rawQuery.data.columns}
          rows={editedRows}
          exportFilename={`${rawQuery.data.table}.csv`}
          rowKey={isMonthlyHistory ? "month" : undefined}
          editableColumns={isMonthlyHistory ? EDITABLE_HISTORY_COLUMNS : undefined}
          onCellEdit={isMonthlyHistory ? handleCellEdit : undefined}
        />
      )}
    </div>
  );
}
