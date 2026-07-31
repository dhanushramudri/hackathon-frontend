"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, Info, AlertTriangle } from "lucide-react";
import { api, type PredictionHistoryRow, type PredictionForecastRow } from "@/lib/api";
import { Skeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import { JMAN, CHART_CHROME } from "@/lib/brandColors";

const HORIZONS = [12, 24, 36] as const;
type Horizon = typeof HORIZONS[number];

// Merge history + forecast into one chart series
function buildChartData(
  history: PredictionHistoryRow[],
  forecast: PredictionForecastRow[],
  histKey: keyof PredictionHistoryRow,
) {
  const hist = history.map((r) => ({
    month: r.month,
    actual: r[histKey] as number,
    forecast: undefined as number | undefined,
    lower: undefined as number | undefined,
    upper: undefined as number | undefined,
    isForecast: false,
  }));
  const fc = forecast.map((r) => ({
    month: r.month,
    actual: undefined as number | undefined,
    forecast: r.forecast,
    lower: r.lower,
    upper: r.upper,
    isForecast: true,
  }));
  // Add bridge point: last history value repeated as forecast start
  const last = hist[hist.length - 1];
  if (last) {
    fc[0] = { ...fc[0], actual: last.actual };
  }
  return [...hist, ...fc];
}

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

function formatUsd(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

interface ChartProps {
  data: ReturnType<typeof buildChartData>;
  boundaryMonth: string;
  yLabel: string;
  color: string;
  formatter?: (v: number) => string;
}

function ForecastChart({ data, boundaryMonth, yLabel, color, formatter }: ChartProps) {
  const fmt = formatter ?? ((v: number) => String(Math.round(v)));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fontSize: 10, fill: CHART_CHROME.axisText }}
          interval={5}
        />
        <YAxis
          tick={{ fontSize: 10, fill: CHART_CHROME.axisText }}
          tickFormatter={fmt}
          width={52}
          label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 12, style: { fontSize: 10, fill: CHART_CHROME.axisText } }}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const byName = Object.fromEntries(payload.map(p => [p.name as string, p.value as number]));
            const hasActual   = byName["Actual"]   != null;
            const hasForecast = byName["Forecast"] != null;
            const hasCI       = byName["Upper 90%"] != null && byName["Lower 90%"] != null;
            const isPredicted = hasForecast && !hasActual;
            const histLabel   = yLabel === "Win %" ? "Actual win rate" : yLabel === "Revenue" ? "Actual revenue" : "Actual demand";
            return (
              <div style={{ background: CHART_CHROME.tooltipBg, border: `1px solid ${CHART_CHROME.tooltipBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, minWidth: 200, boxShadow: "0 4px 16px rgba(25,16,91,0.12)" }}>
                <p style={{ color: CHART_CHROME.labelText, marginBottom: 8, fontWeight: 700, fontSize: 13 }}>{formatMonth(label as string)}</p>
                {hasActual && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText }}>{histLabel}</span>
                    <strong style={{ color: JMAN.midnightBlue }}>{fmt(byName["Actual"])}</strong>
                  </div>
                )}
                {hasForecast && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText }}>Forecast</span>
                    <strong style={{ color: color }}>{fmt(byName["Forecast"])}</strong>
                  </div>
                )}
                {hasCI && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: CHART_CHROME.mutedText, fontSize: 11 }}>90% range</span>
                    <span style={{ color: CHART_CHROME.mutedText, fontSize: 11 }}>{fmt(byName["Lower 90%"])} – {fmt(byName["Upper 90%"])}</span>
                  </div>
                )}
                <p style={{ color: CHART_CHROME.mutedText, fontSize: 10, marginTop: 6, borderTop: `1px solid ${CHART_CHROME.grid}`, paddingTop: 5 }}>
                  {isPredicted ? "Predicted period" : "Historical period"}
                </p>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {/* Actual history */}
        <Line dataKey="actual" stroke={JMAN.midnightBlue} strokeWidth={2} dot={false} connectNulls name="Actual" />
        {/* CI band — upper stroke only, lower stroke only, no fill */}
        <Line dataKey="upper" stroke={color} strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls strokeOpacity={0.35} legendType="none" name="Upper 90%" />
        <Line dataKey="lower" stroke={color} strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls strokeOpacity={0.35} legendType="none" name="Lower 90%" />
        {/* Forecast */}
        <Line dataKey="forecast" stroke={color} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls name="Forecast" />
        {/* Boundary marker */}
        <ReferenceLine x={boundaryMonth} stroke={CHART_CHROME.mutedText} strokeDasharray="4 3" label={{ value: "Today", fontSize: 9, fill: CHART_CHROME.mutedText, position: "insideTopRight" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PredictionPage() {
  const [horizon, setHorizon] = useState<Horizon>(24);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["prediction-forecast", horizon],
    queryFn: () => api.predictionForecast(horizon),
  });

  const boundaryMonth = data?.history[data.history.length - 1]?.month ?? "";

  const demandData  = data ? buildChartData(data.history, data.demand_forecast,  "total_headcount_demand") : [];
  const revenueData = data ? buildChartData(data.history, data.revenue_forecast, "revenue_usd") : [];
  const winrateData = data ? buildChartData(data.history, data.winrate_forecast, "win_rate_pct") : [];

  return (
    <div className="p-4 sm:p-6 w-full space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Demand Prediction</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Headcount demand, revenue, and win rate projections across your selected horizon.
          </p>
        </div>
        {/* Horizon picker */}
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

      {/* Summary stats */}
      {isLoading && <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Peak Demand Month"
            value={formatMonth(data.summary.peak_demand_month)}
            sub={`${data.summary.peak_demand_headcount} roles needed`}
          />
          <StatCard
            label={`Total Headcount (${horizon}M)`}
            value={String(Math.round(data.summary.total_forecast_headcount))}
            sub="forecast roles across horizon"
          />
          <StatCard
            label={`Total Revenue (${horizon}M)`}
            value={formatUsd(data.summary.total_forecast_revenue_usd)}
            sub="projected (illustrative)"
          />
          <StatCard
            label="Monthly Growth Rate"
            value={`+${data.summary.demand_monthly_growth_rate.toFixed(2)}`}
            sub="roles/month trend"
          />
        </div>
      )}

      {/* Charts */}
      {isLoading && <div className="space-y-4"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}
      {isError && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <AlertTriangle className="w-4 h-4" /> Failed to load forecast. Check the backend is running.
        </div>
      )}

      {data && (
        <div className="space-y-5">

          {/* Headcount demand */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground mb-1">Monthly Headcount Demand</p>
            <p className="text-xs text-muted-foreground mb-4">Total roles requested per month — history (solid) + forecast (dashed) with 90% CI band</p>
            <ForecastChart data={demandData} boundaryMonth={boundaryMonth} yLabel="Roles" color={JMAN.trypanBlue} />
          </div>

          {/* Revenue */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground mb-1">Monthly Revenue Projection</p>
            <p className="text-xs text-muted-foreground mb-4">Illustrative revenue based on confirmed headcount × rate card. Not real financial data.</p>
            <ForecastChart data={revenueData} boundaryMonth={boundaryMonth} yLabel="Revenue" color={JMAN.emerald} formatter={formatUsd} />
          </div>

          {/* Win rate */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground mb-1">Deal Win Rate (%)</p>
            <p className="text-xs text-muted-foreground mb-4">% of pipeline deals confirmed (SOW signed). Synthetic historical trend only.</p>
            <ForecastChart data={winrateData} boundaryMonth={boundaryMonth} yLabel="Win %" color={JMAN.amber} formatter={(v) => `${v.toFixed(1)}%`} />
          </div>

          {/* Model info */}
          <div className="bg-muted/40 border border-border rounded-xl p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p><strong className="text-foreground">How it works:</strong> Detects the long-term growth trend in demand, then adjusts each month for known seasonal patterns (e.g. slower Jan–Feb, busier Oct–Nov).</p>
              <p><strong className="text-foreground">Data:</strong> Built from {data.model_info.training_months} months of historical records ({data.model_info.training_period}).</p>
              <p><strong className="text-foreground">Confidence band:</strong> The dotted lines around each forecast show the 90% likely range — actual outcomes are expected to fall within this band 9 times out of 10.</p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
