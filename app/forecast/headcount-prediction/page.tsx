"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users2, Info, AlertTriangle, AlertOctagon, CheckCircle2, XCircle, Table2,
  Sparkles, TrendingUp, TrendingDown, Minus, DollarSign, Briefcase, UserMinus, Activity,
} from "lucide-react";
import { api, type HeadcountHistoryRow, type HeadcountForecastRow, type HeadcountInsights } from "@/lib/api";
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
    forecastExtrapolated: undefined as number | undefined,
    lower: undefined as number | undefined,
    upper: undefined as number | undefined,
    new_hires_chennai: r.new_hires_chennai as number | undefined,
    new_hires_uk: r.new_hires_uk as number | undefined,
    new_hires_usa: r.new_hires_usa as number | undefined,
  }));
  const fc = forecast.map((r) => ({
    month: r.month,
    actual: undefined as number | undefined,
    forecast: r.is_validated_horizon ? r.forecast : undefined,
    forecastExtrapolated: r.is_validated_horizon ? undefined : r.forecast,
    lower: r.lower,
    upper: r.upper,
    new_hires_chennai: undefined as number | undefined,
    new_hires_uk: undefined as number | undefined,
    new_hires_usa: undefined as number | undefined,
  }));
  // Bridge point so the forecast line connects to the last actual value
  // instead of starting from a gap.
  const last = hist[hist.length - 1];
  if (last && fc[0]) fc[0] = { ...fc[0], actual: last.actual, forecast: fc[0].forecast ?? last.actual };
  return [...hist, ...fc];
}

function ForecastChart({
  data, boundaryMonth, validatedEndMonth,
}: {
  data: ReturnType<typeof buildChartData>;
  boundaryMonth: string;
  validatedEndMonth: string | undefined;
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
            const hasForecast = byName["Forecast (validated)"] != null;
            const hasExtrapolated = byName["Forecast (extrapolated)"] != null;
            const hasCI = byName["Upper 90%"] != null && byName["Lower 90%"] != null;
            const point = payload[0]?.payload as
              | { new_hires_chennai?: number; new_hires_uk?: number; new_hires_usa?: number }
              | undefined;
            const hasHiresByLocation =
              hasActual && point && [point.new_hires_chennai, point.new_hires_uk, point.new_hires_usa].every((v) => v != null);
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
                    <p style={{ color: CHART_CHROME.mutedText, fontSize: 10, marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>Hires this month</p>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                      <span style={{ color: CHART_CHROME.mutedText }}>Chennai</span>
                      <strong style={{ color: CHART_CHROME.labelText }}>{point!.new_hires_chennai}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                      <span style={{ color: CHART_CHROME.mutedText }}>UK</span>
                      <strong style={{ color: CHART_CHROME.labelText }}>{point!.new_hires_uk}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                      <span style={{ color: CHART_CHROME.mutedText }}>USA</span>
                      <strong style={{ color: CHART_CHROME.labelText }}>{point!.new_hires_usa}</strong>
                    </div>
                  </div>
                )}
                {hasForecast && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText }}>Forecast (validated)</span>
                    <strong style={{ color: JMAN.trypanBlue }}>{Math.round(byName["Forecast (validated)"])}</strong>
                  </div>
                )}
                {hasExtrapolated && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText }}>Forecast (extrapolated)</span>
                    <strong style={{ color: JMAN.amethyst }}>{Math.round(byName["Forecast (extrapolated)"])}</strong>
                  </div>
                )}
                {hasCI && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText, fontSize: 11 }}>90% range</span>
                    <span style={{ color: CHART_CHROME.mutedText, fontSize: 11 }}>{Math.round(byName["Lower 90%"])} – {Math.round(byName["Upper 90%"])}</span>
                  </div>
                )}
                <p style={{ color: CHART_CHROME.mutedText, fontSize: 10, marginTop: 6, borderTop: `1px solid ${CHART_CHROME.grid}`, paddingTop: 5 }}>
                  {hasExtrapolated ? "Beyond the validated 3-month horizon" : hasForecast ? "Within the validated forecast horizon" : "Historical period"}
                </p>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line dataKey="actual" stroke={JMAN.midnightBlue} strokeWidth={2} dot={false} connectNulls name="Actual" />
        <Line dataKey="upper" stroke={JMAN.trypanBlue} strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls strokeOpacity={0.3} legendType="none" name="Upper 90%" />
        <Line dataKey="lower" stroke={JMAN.trypanBlue} strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls strokeOpacity={0.3} legendType="none" name="Lower 90%" />
        <Line dataKey="forecast" stroke={JMAN.trypanBlue} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls name="Forecast (validated)" />
        <Line dataKey="forecastExtrapolated" stroke={JMAN.amethyst} strokeWidth={2} strokeDasharray="1 4" dot={false} connectNulls strokeOpacity={0.7} name="Forecast (extrapolated)" />
        <ReferenceLine x={boundaryMonth} stroke={CHART_CHROME.mutedText} strokeDasharray="4 3" label={{ value: "Today", fontSize: 9, fill: CHART_CHROME.mutedText, position: "insideTopRight" }} />
        {validatedEndMonth && (
          <ReferenceLine x={validatedEndMonth} stroke={JMAN.amethyst} strokeDasharray="2 2" label={{ value: "Validated horizon ends", fontSize: 9, fill: JMAN.amethyst, position: "insideTopLeft" }} />
        )}
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

function ExecutiveSummaryPanel({ insights }: { insights: HeadcountInsights }) {
  const severityStyle: Record<string, string> = {
    critical: "text-destructive",
    warning: "text-amber-500",
    info: "text-muted-foreground",
  };
  const severityIcon: Record<string, typeof AlertTriangle> = {
    critical: AlertOctagon,
    warning: AlertTriangle,
    info: Info,
  };
  return (
    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Executive Summary</p>
      </div>
      <ul className="space-y-1.5 mb-4">
        {insights.executive_summary.map((s, i) => (
          <li key={i} className="text-sm text-foreground/90 flex gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
      {insights.risk_flags.length > 0 && (
        <div className="space-y-1.5 pt-3 border-t border-primary/10">
          {insights.risk_flags.map((f, i) => {
            const Icon = severityIcon[f.severity];
            return (
              <div key={i} className={cn("flex items-start gap-2 text-xs", severityStyle[f.severity])}>
                <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{f.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductivityPanel({ insights }: { insights: HeadcountInsights }) {
  const chartData = insights.productivity.history.slice(-12);
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <DollarSign className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Workforce Productivity & Margin</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Revenue per head and Adj. EBITDA margin, based on reported financials.</p>
      <div className="flex items-baseline gap-6 mb-3">
        <p className="text-2xl font-bold text-foreground">
          £{insights.productivity.current_revenue_per_head_usd.toLocaleString()}
          <span className="text-xs font-normal text-muted-foreground"> /head/month</span>
        </p>
        <p className="text-2xl font-bold text-foreground">
          {insights.productivity.current_ebitda_margin_pct.toFixed(1)}%
          <span className="text-xs font-normal text-muted-foreground"> Adj. EBITDA margin</span>
        </p>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 9, fill: CHART_CHROME.axisText }} interval={1} />
          <YAxis tick={{ fontSize: 9, fill: CHART_CHROME.axisText }} width={40} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(v: number) => [`£${v.toLocaleString()}`, "Revenue/head"]}
            labelFormatter={formatMonth}
            contentStyle={{ background: CHART_CHROME.tooltipBg, border: `1px solid ${CHART_CHROME.tooltipBorder}`, fontSize: 11 }}
          />
          <Line dataKey="value" stroke={JMAN.emerald} strokeWidth={2} dot={false} name="Revenue/head" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const COE_COLORS = JMAN_CHART_PALETTE;

function CoeBreakdownPanel({ insights }: { insights: HeadcountInsights }) {
  const { mix, forecast, latest_month } = insights.coe_breakdown;
  const maxShare = Math.max(...mix.map((m) => m.share_pct), 1);
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Briefcase className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Headcount by COE</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Current mix as of {formatMonth(latest_month)}, forecast split proportionally across COEs.</p>
      <div className="space-y-2 mb-4">
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
              {m.fte} FTE ({m.share_pct}%)
            </span>
          </div>
        ))}
      </div>
      {forecast.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted-foreground px-2 py-1 whitespace-nowrap">Month</th>
                {mix.map((m) => (
                  <th key={m.coe} className="text-right font-semibold text-muted-foreground px-2 py-1 whitespace-nowrap">{m.coe}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecast.map((f) => (
                <tr key={f.month} className="border-b border-border/50 last:border-0">
                  <td className="px-2 py-1 font-medium text-foreground whitespace-nowrap">{formatMonth(f.month)}</td>
                  {mix.map((m) => (
                    <td key={m.coe} className="px-2 py-1 text-right text-muted-foreground whitespace-nowrap">{f.by_coe[m.coe]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AttritionPanel({ insights }: { insights: HeadcountInsights }) {
  const { notice_period_current, notice_period_by_coe, notice_period_by_coe_as_of_month, hires_vs_resignations, flight_risk_note } =
    insights.attrition;
  const latestMonth = hires_vs_resignations[hires_vs_resignations.length - 1]?.month;
  const coeIsStale = !!notice_period_by_coe_as_of_month && notice_period_by_coe_as_of_month !== latestMonth?.slice(0, 7);
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserMinus className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Attrition & Retention</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Hires vs. resignations (last 6 months), and who&apos;s currently in their notice window.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="space-y-3">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/40 border border-border">
            <span className="text-xs font-medium text-foreground">Currently in notice period</span>
            <span className="text-lg font-bold text-foreground">{notice_period_current}</span>
          </div>
          {notice_period_by_coe.length > 0 && (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1.5">
                {notice_period_by_coe.map((c) => (
                  <span key={c.coe} className="text-[10px] px-2 py-1 rounded-full bg-muted border border-border text-muted-foreground">
                    {c.coe}: {c.count}
                  </span>
                ))}
              </div>
              {coeIsStale && (
                <p className="text-[10px] text-muted-foreground">As of {formatMonth(notice_period_by_coe_as_of_month!)}</p>
              )}
            </div>
          )}
          {flight_risk_note && (
            <div className="flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{flight_risk_note}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UtilizationPanel({ insights }: { insights: HeadcountInsights }) {
  const { free_pool_current, over_allocated_current, under_allocated_current, history } = insights.utilization;
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Utilization & Bench Health</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Over/under-allocation and free pool, last 6 months.</p>
      <div className="grid grid-cols-3 gap-3 mb-3">
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
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 9, fill: CHART_CHROME.axisText }} />
          <YAxis tick={{ fontSize: 9, fill: CHART_CHROME.axisText }} width={28} />
          <Tooltip labelFormatter={formatMonth} contentStyle={{ background: CHART_CHROME.tooltipBg, border: `1px solid ${CHART_CHROME.tooltipBorder}`, fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line dataKey="over_allocated" stroke={JMAN.red} strokeWidth={2} dot={false} name="Over-allocated" />
          <Line dataKey="under_allocated" stroke={JMAN.amber} strokeWidth={2} dot={false} name="Under-allocated" />
          <Line dataKey="free_pool" stroke={JMAN.lightBlue} strokeWidth={2} dot={false} name="Free pool" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MapeRow({ label, mape, threshold, recommended }: { label: string; mape: number; threshold: number; recommended?: boolean }) {
  const pass = mape < threshold;
  return (
    <div className={cn("flex items-center justify-between px-3 py-2 rounded-lg border", recommended ? "border-primary/40 bg-primary/5" : "border-border")}>
      <div className="flex items-center gap-2">
        {pass ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
        <span className="text-xs font-medium text-foreground">{label}</span>
        {recommended && <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">Recommended</span>}
      </div>
      <span className="text-xs text-muted-foreground">{mape.toFixed(2)}% MAPE</span>
    </div>
  );
}

export default function HeadcountPredictionPage() {
  const [horizon, setHorizon] = useState<Horizon>(6);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["headcount-prediction", horizon],
    queryFn: () => api.headcountPrediction(horizon),
  });

  const boundaryMonth = data?.history[data.history.length - 1]?.month ?? "";
  const validatedRows = data?.forecast.filter((r) => r.is_validated_horizon) ?? [];
  const validatedEndMonth = validatedRows[validatedRows.length - 1]?.month;
  const chartData = data ? buildChartData(data.history, data.forecast) : [];

  const currentHeadcount = data?.history[data.history.length - 1]?.total_active_headcount;
  const threeMonthForecast = data?.forecast[2];

  return (
    <div className="p-4 sm:p-6 w-full space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users2 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Headcount Prediction</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">Active headcount forecast, validated 3 months ahead.</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
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

      {isLoading && <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
      {isError && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <AlertTriangle className="w-4 h-4" /> Failed to load the headcount forecast. Check the backend is running.
        </div>
      )}

      {data && (
        <>
          {/* Executive summary + risk flags — the "so what," before any chart or table */}
          <ExecutiveSummaryPanel insights={data.insights} />

          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Current Headcount"
              value={String(currentHeadcount ?? "-")}
              sub={boundaryMonth ? formatMonth(boundaryMonth) : undefined}
              trend={data.insights.headcount_change_pct_3mo}
            />
            <StatCard
              label="3-Month Forecast"
              value={threeMonthForecast ? String(Math.round(threeMonthForecast.forecast)) : "-"}
              sub={threeMonthForecast ? `${formatMonth(threeMonthForecast.month)} · validated` : undefined}
              trend={data.insights.forecast_change_pct}
            />
            <StatCard label="Validated Horizon" value={`${data.validated_horizon_months}mo`} sub="within the model's tested accuracy" />
            <StatCard
              label="Holdout MAPE"
              value={`${data.model_info.holdout_mape_pct.toFixed(2)}%`}
              sub={`threshold ${data.model_info.acceptance_threshold_mape_pct}%`}
            />
          </div>

          {/* Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground mb-1">Monthly Active Headcount</p>
            <p className="text-xs text-muted-foreground mb-4">
              Solid = actual. Dashed = validated forecast (3mo). Dotted = extrapolated beyond that.
            </p>
            <ForecastChart data={chartData} boundaryMonth={boundaryMonth} validatedEndMonth={validatedEndMonth} />
          </div>

          {/* Executive panels: money, skills mix, retention, bench health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ProductivityPanel insights={data.insights} />
            <CoeBreakdownPanel insights={data.insights} />
            <AttritionPanel insights={data.insights} />
            <UtilizationPanel insights={data.insights} />
          </div>

          {/* Forecast table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Forecast detail</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    {["Month", "Forecast", "90% Range", "Status"].map((h) => (
                      <th key={h} className="text-left font-semibold text-muted-foreground px-4 py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.forecast.map((r) => (
                    <tr key={r.month} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">{formatMonth(r.month)}</td>
                      <td className="px-4 py-2 text-foreground whitespace-nowrap">{Math.round(r.forecast)}</td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{Math.round(r.lower)} – {Math.round(r.upper)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {r.is_validated_horizon ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${JMAN.emerald}1A`, color: JMAN.emerald }}
                          >
                            <CheckCircle2 className="w-2.5 h-2.5" /> validated
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${JMAN.amethyst}1A`, color: JMAN.amethyst }}
                          >
                            extrapolated
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Methodology -- collapsed by default so the primary view stays clean;
              still one click away for anyone who wants to audit the model. */}
          <details className="bg-card border border-border rounded-xl overflow-hidden group">
            <summary className="px-5 py-3 flex items-center gap-2 cursor-pointer select-none list-none">
              <Info className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Methodology & model validation</span>
              <span className="ml-auto text-xs text-muted-foreground">{data.model_info.holdout_mape_pct.toFixed(2)}% MAPE · click to expand</span>
            </summary>
            <div className="px-5 pb-5 pt-1 border-t border-border space-y-4">
              <div className="space-y-2">
                <MapeRow label="Trend + Seasonal + Ridge (hybrid)" mape={data.model_info.holdout_mape_pct} threshold={data.model_info.acceptance_threshold_mape_pct} recommended />
                {Object.entries(data.model_info.other_candidates_evaluated).map(([name, r]) => (
                  <MapeRow key={name} label={name === "arima" ? "ARIMA (classical baseline)" : name === "lightgbm" ? "LightGBM (gradient boosting)" : name} mape={r.holdout_mape_pct} threshold={data.model_info.acceptance_threshold_mape_pct} />
                ))}
              </div>
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p><strong className="text-foreground">Model:</strong> {data.model_info.type}. {data.model_info.formula}.</p>
                <p><strong className="text-foreground">Data:</strong> {data.model_info.training_rows_used} usable rows, {data.model_info.trained_on}.</p>
                <p><strong className="text-foreground">Why this model:</strong> {data.model_info.recommendation_rationale}</p>
                <p><strong className="text-foreground">Confidence band:</strong> {data.model_info.confidence_interval}.</p>
                <p className="pt-1 border-t border-border/60">{data.model_info.note}</p>
              </div>
            </div>
          </details>

          {/* Raw data used */}
          <DataUsedSection />
        </>
      )}
    </div>
  );
}

function DataUsedSection() {
  const tablesQuery = useQuery({ queryKey: ["headcount-prediction-tables"], queryFn: () => api.headcountPredictionTables() });
  const [selected, setSelected] = useState<string | null>(null);
  const activeTable = selected ?? tablesQuery.data?.[0]?.table ?? null;

  const rawQuery = useQuery({
    queryKey: ["headcount-prediction-raw", activeTable],
    queryFn: () => api.headcountPredictionRawData(activeTable as string),
    enabled: !!activeTable,
  });

  const activeMeta = tablesQuery.data?.find((t) => t.table === activeTable);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Table2 className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Data used for this forecast</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Every table behind this forecast — sortable, searchable, exportable.</p>

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

      {rawQuery.isLoading && <Skeleton className="h-64" />}
      {rawQuery.isError && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <AlertTriangle className="w-4 h-4" /> Failed to load this table.
        </div>
      )}
      {rawQuery.data && (
        <DataGrid columns={rawQuery.data.columns} rows={rawQuery.data.rows} exportFilename={`${rawQuery.data.table}.csv`} />
      )}
    </div>
  );
}
