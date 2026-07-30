"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import { Users2, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { api, type HeadcountHistoryRow, type HeadcountForecastRow } from "@/lib/api";
import { Skeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";

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
  }));
  const fc = forecast.map((r) => ({
    month: r.month,
    actual: undefined as number | undefined,
    forecast: r.is_validated_horizon ? r.forecast : undefined,
    forecastExtrapolated: r.is_validated_horizon ? undefined : r.forecast,
    lower: r.lower,
    upper: r.upper,
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
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 10, fill: "#64748b" }} interval={2} />
        <YAxis
          tick={{ fontSize: 10, fill: "#64748b" }}
          domain={["dataMin - 15", "dataMax + 15"]}
          width={48}
          label={{ value: "Headcount", angle: -90, position: "insideLeft", offset: 12, style: { fontSize: 10, fill: "#64748b" } }}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const byName = Object.fromEntries(payload.map((p) => [p.name as string, p.value as number]));
            const hasActual = byName["Actual"] != null;
            const hasForecast = byName["Forecast (validated)"] != null;
            const hasExtrapolated = byName["Forecast (extrapolated)"] != null;
            const hasCI = byName["Upper 90%"] != null && byName["Lower 90%"] != null;
            return (
              <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", fontSize: 12, minWidth: 210 }}>
                <p style={{ color: "#94a3b8", marginBottom: 8, fontWeight: 700, fontSize: 13 }}>{formatMonth(label as string)}</p>
                {hasActual && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: "#94a3b8" }}>Actual headcount</span>
                    <strong style={{ color: "#e2e8f0" }}>{Math.round(byName["Actual"])}</strong>
                  </div>
                )}
                {hasForecast && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: "#94a3b8" }}>Forecast (validated)</span>
                    <strong style={{ color: "#818cf8" }}>{Math.round(byName["Forecast (validated)"])}</strong>
                  </div>
                )}
                {hasExtrapolated && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: "#94a3b8" }}>Forecast (extrapolated)</span>
                    <strong style={{ color: "#a78bfa" }}>{Math.round(byName["Forecast (extrapolated)"])}</strong>
                  </div>
                )}
                {hasCI && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>90% range</span>
                    <span style={{ color: "#64748b", fontSize: 11 }}>{Math.round(byName["Lower 90%"])} – {Math.round(byName["Upper 90%"])}</span>
                  </div>
                )}
                <p style={{ color: "#475569", fontSize: 10, marginTop: 6, borderTop: "1px solid #1e293b", paddingTop: 5 }}>
                  {hasExtrapolated ? "Beyond the validated 3-month horizon — a rough scenario, not a validated forecast" : hasForecast ? "Within the validated forecast horizon" : "Historical period"}
                </p>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line dataKey="actual" stroke="#e2e8f0" strokeWidth={2} dot={false} connectNulls name="Actual" />
        <Line dataKey="upper" stroke="#818cf8" strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls strokeOpacity={0.3} legendType="none" name="Upper 90%" />
        <Line dataKey="lower" stroke="#818cf8" strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls strokeOpacity={0.3} legendType="none" name="Lower 90%" />
        <Line dataKey="forecast" stroke="#818cf8" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls name="Forecast (validated)" />
        <Line dataKey="forecastExtrapolated" stroke="#a78bfa" strokeWidth={2} strokeDasharray="1 4" dot={false} connectNulls strokeOpacity={0.7} name="Forecast (extrapolated)" />
        <ReferenceLine x={boundaryMonth} stroke="#334155" strokeDasharray="4 3" label={{ value: "Today", fontSize: 9, fill: "#64748b", position: "insideTopRight" }} />
        {validatedEndMonth && (
          <ReferenceLine x={validatedEndMonth} stroke="#a78bfa" strokeDasharray="2 2" label={{ value: "Validated horizon ends", fontSize: 9, fill: "#a78bfa", position: "insideTopLeft" }} />
        )}
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
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users2 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Headcount Prediction</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            3-month-ahead active headcount forecast, trained on synthetic revenue, project, HR,
            FTE, and pulse-survey signals.
          </p>
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
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Current Headcount" value={String(currentHeadcount ?? "-")} sub={boundaryMonth ? formatMonth(boundaryMonth) : undefined} />
            <StatCard
              label="3-Month Forecast"
              value={threeMonthForecast ? String(Math.round(threeMonthForecast.forecast)) : "-"}
              sub={threeMonthForecast ? `${formatMonth(threeMonthForecast.month)} · validated` : undefined}
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
              History (solid) + forecast — bright dashed line is within the validated 3-month
              horizon, lighter dotted line beyond that is an extrapolated scenario, not a
              validated forecast.
            </p>
            <ForecastChart data={chartData} boundaryMonth={boundaryMonth} validatedEndMonth={validatedEndMonth} />
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
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">
                            <CheckCircle2 className="w-2.5 h-2.5" /> validated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium">
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

          {/* Model comparison */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-2">
            <p className="text-sm font-semibold text-foreground mb-1">Model candidates evaluated</p>
            <p className="text-xs text-muted-foreground mb-3">
              Walk-forward validated on ~15 usable months of synthetic history. See the rationale
              below for why the recommended model isn't simply the lowest holdout MAPE.
            </p>
            <MapeRow label="Trend + Seasonal + Ridge (hybrid)" mape={data.model_info.holdout_mape_pct} threshold={data.model_info.acceptance_threshold_mape_pct} recommended />
            {Object.entries(data.model_info.other_candidates_evaluated).map(([name, r]) => (
              <MapeRow key={name} label={name === "arima" ? "ARIMA (classical baseline)" : name === "lightgbm" ? "LightGBM (gradient boosting)" : name} mape={r.holdout_mape_pct} threshold={data.model_info.acceptance_threshold_mape_pct} />
            ))}
          </div>

          {/* Model info */}
          <div className="bg-muted/40 border border-border rounded-xl p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p><strong className="text-foreground">Model:</strong> {data.model_info.type}. {data.model_info.formula}.</p>
              <p><strong className="text-foreground">Data:</strong> {data.model_info.training_rows_used} usable rows, {data.model_info.trained_on}.</p>
              <p><strong className="text-foreground">Features used ({data.model_info.features_used.length}):</strong> {data.model_info.features_used.join(", ")}.</p>
              <p><strong className="text-foreground">Why this model:</strong> {data.model_info.recommendation_rationale}</p>
              <p><strong className="text-foreground">Confidence band:</strong> {data.model_info.confidence_interval}.</p>
              <p className="pt-1 border-t border-border/60">{data.model_info.note}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
