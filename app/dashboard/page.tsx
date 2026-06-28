"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Users, Briefcase, ShieldAlert, Clock, ArrowRight, UserCheck, AlertOctagon, DollarSign, CalendarOff } from "lucide-react";
import { api, type RevenueMonth } from "@/lib/api";
import { StatCard } from "@/components/shared/StatCard";
import { Badge } from "@/components/shared/Badge";
import { LoadingState, ErrorState } from "@/components/shared/EmptyState";
import { Modal } from "@/components/shared/Modal";
import { ProjectHealthDetailModal } from "@/components/health/ProjectHealthDetailModal";
import { rootCauseLabel } from "@/lib/utils";
import { EmployeeProfileModal } from "@/components/shared/EmployeeProfileModal";
import { cn, formatUsd } from "@/lib/utils";

type RevenueRow = RevenueMonth & { deltaAbs: number | null; deltaPct: number | null };

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export default function DashboardPage() {
  const tables = useQuery({ queryKey: ["tables"], queryFn: api.tables });
  const headcount = useQuery({ queryKey: ["employee-headcount-summary"], queryFn: api.employeeHeadcountSummary });
  const health = useQuery({ queryKey: ["health-projects"], queryFn: api.healthProjects });
  const allocations = useQuery({ queryKey: ["allocations"], queryFn: api.allocations });
  const freePool = useQuery({ queryKey: ["free-pool"], queryFn: api.freePool });
  const revenue = useQuery({ queryKey: ["revenue-trend"], queryFn: api.revenueTrend });
  const leave = useQuery({ queryKey: ["leave-impact"], queryFn: api.leaveImpact });
  const pipeline = useQuery({ queryKey: ["pipeline-forecast"], queryFn: api.pipelineForecast });

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showRevenueProof, setShowRevenueProof] = useState(false);

  if (tables.isLoading || health.isLoading || allocations.isLoading) return <LoadingState label="Loading dashboard…" />;
  if (tables.error || health.error || allocations.error) return <ErrorState message="Could not reach the ResourceIQ backend. Is it running on :8000?" />;

  const highRisk = (health.data ?? []).filter((p) => p.risk_band === "high");
  const mediumRisk = (health.data ?? []).filter((p) => p.risk_band === "medium");
  const understaffed = (health.data ?? []).filter((p) => p.is_understaffed);
  const endingSoon = (allocations.data ?? []).filter((a) => a.ending_soon);
  const overAllocated = (allocations.data ?? []).filter((a) => a.utilization_band === "over_allocated");
  const revenueChartData: RevenueRow[] = [...(revenue.data ?? [])].reverse().map((m, i, arr) => {
    const prev = i > 0 ? arr[i - 1] : null;
    const deltaAbs = prev ? m.value - prev.value : null;
    const deltaPct = prev && prev.value !== 0 ? ((m.value - prev.value) / prev.value) * 100 : null;
    return { ...m, deltaAbs, deltaPct };
  });
  const latestRevenue = revenueChartData.length > 0 ? revenueChartData[revenueChartData.length - 1] : null;
  const totalUnbilledValue = (health.data ?? []).reduce((sum, p) => sum + p.monthly_unbilled_value_usd, 0);
  const onLeaveNow = (leave.data ?? []).filter((i) => i.is_currently_on_leave);
  const leaveNoBackfill = (leave.data ?? []).filter((i) => i.is_currently_on_leave && !i.backfill_available);

  const allocationsByType = new Map<string, number>();
  for (const a of allocations.data ?? []) {
    const key = a.type_of_project ?? "Unknown";
    allocationsByType.set(key, (allocationsByType.get(key) ?? 0) + 1);
  }
  const allocationTypeRows = Array.from(allocationsByType.entries()).sort((a, b) => b[1] - a[1]);

  const urgentPipeline = (pipeline.data ?? [])
    .filter((r) => (r.skillset || r.resources_requested) && normalize(r.status) !== "resourced")
    .filter((r) => normalize(r.priority) === "urgent" || r.is_late_notice)
    .sort((a, b) => (a.likely_start_date ?? "").localeCompare(b.likely_start_date ?? ""))
    .slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Total Employees"
          value={headcount.data?.currently_active ?? "-"}
          sub={headcount.data ? `of ${headcount.data.total_ever} ever on roster` : undefined}
          icon={<Users className="w-4 h-4" />}
          href="/employees"
          tooltip={
            headcount.data && (
              <div className="space-y-1">
                <p className="font-semibold text-gray-700">Currently active: {headcount.data.currently_active}</p>
                <p>Total ever on roster: {headcount.data.total_ever}</p>
                <p>Already departed: {headcount.data.already_departed}</p>
                <p>In notice period (resigning soon, still active): {headcount.data.in_notice_period}</p>
              </div>
            )
          }
        />
        <StatCard
          label="Active Allocations"
          value={allocations.data?.length ?? "-"}
          icon={<Briefcase className="w-4 h-4" />}
          href="/allocations"
          tooltip={
            <div className="space-y-1">
              <p className="font-semibold text-gray-700">By project type</p>
              {allocationTypeRows.map(([type, count]) => (
                <p key={type} className="flex justify-between gap-3">
                  <span>{type}</span>
                  <span className="font-medium text-gray-700">{count}</span>
                </p>
              ))}
            </div>
          }
        />
        <StatCard
          label="At-Risk Projects"
          value={highRisk.length + mediumRisk.length}
          sub={`${highRisk.length} high, ${mediumRisk.length} medium`}
          color={highRisk.length > 0 ? "red" : "default"}
          icon={<ShieldAlert className="w-4 h-4" />}
          href="/health"
        />
        <StatCard
          label="Allocations Ending Soon"
          value={endingSoon.length}
          sub="within 30 days"
          color="amber"
          icon={<Clock className="w-4 h-4" />}
          href="/allocations?endingSoon=true"
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Free Pool Available"
          value={freePool.data?.length ?? "-"}
          sub="fully free, under-utilized, or ending soon"
          color="green"
          icon={<UserCheck className="w-4 h-4" />}
          href="/free-pool"
        />
        <StatCard
          label="Understaffed Projects"
          value={understaffed.length}
          sub="actual headcount below 75% of role-mix expectation"
          color={understaffed.length > 0 ? "amber" : "default"}
          icon={<AlertOctagon className="w-4 h-4" />}
          href="/health?understaffed=true"
        />
        <StatCard
          label="Unbilled Value at Risk"
          value={formatUsd(totalUnbilledValue)}
          sub="rate card, per month"
          color={totalUnbilledValue > 0 ? "red" : "default"}
          icon={<DollarSign className="w-4 h-4" />}
          href="/health?revenue=true"
        />
        <StatCard
          label="On Leave Right Now"
          value={onLeaveNow.length}
          sub={leaveNoBackfill.length > 0 ? `${leaveNoBackfill.length} with no backfill` : undefined}
          color={leaveNoBackfill.length > 0 ? "red" : "default"}
          icon={<CalendarOff className="w-4 h-4" />}
          href="/leave?onLeaveNow=true"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Highest-Risk Projects</h2>
            <Link href="/health" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {highRisk.slice(0, 5).map((p) => (
              <button
                key={p.project_code}
                onClick={() => setSelectedProject(p.project_code)}
                className="flex items-center gap-2 text-xs w-full text-left hover:bg-gray-50 rounded-lg px-1.5 py-1 -mx-1.5 transition"
              >
                <Badge variant={p.risk_band}>{p.risk_band}</Badge>
                <span className="font-medium text-gray-700">{p.project_code}</span>
                <span className="text-gray-400 truncate">{p.root_causes.map(rootCauseLabel).join(", ")}</span>
                {p.wsr_worst_signal && <Badge variant={p.wsr_worst_signal}>{p.wsr_worst_signal}</Badge>}
              </button>
            ))}
            {highRisk.length === 0 && <p className="text-xs text-gray-400 italic">No high-risk projects right now.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Capacity Freeing Up Soon</h2>
            <Link href="/free-pool" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {endingSoon.slice(0, 5).map((a) => (
              <button
                key={`${a.employee_id}-${a.project_id}`}
                onClick={() => setSelectedEmployee(a.employee_id)}
                className="flex items-center gap-2 text-xs w-full text-left hover:bg-gray-50 rounded-lg px-1.5 py-1 -mx-1.5 transition"
              >
                <span className="font-medium text-gray-700">{a.employee_id}</span>
                <span className="text-gray-400">{a.job_name}</span>
                <span className="text-gray-400 ml-auto">{a.days_to_end}d left</span>
              </button>
            ))}
            {endingSoon.length === 0 && <p className="text-xs text-gray-400 italic">Nothing ending in the next 30 days.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Urgent Pipeline Needing Action</h2>
            <Link href="/recommendations" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {urgentPipeline.map((r) => (
              <Link
                key={r.row_index}
                href={`/recommendations?row=${r.row_index}`}
                className="flex items-center gap-2 text-xs w-full text-left hover:bg-gray-50 rounded-lg px-1.5 py-1 -mx-1.5 transition"
              >
                {r.is_late_notice && <Badge variant="red">late</Badge>}
                <span className="font-medium text-gray-700">{r.resources_requested ?? "Role TBD"}</span>
                <span className="text-gray-400 truncate">{r.client ?? "Unnamed client"}</span>
                {r.likely_start_date && <span className="text-gray-400 ml-auto whitespace-nowrap">{r.likely_start_date}</span>}
              </Link>
            ))}
            {!pipeline.isLoading && urgentPipeline.length === 0 && (
              <p className="text-xs text-gray-400 italic">No urgent unresourced demand right now.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">On Leave Right Now</h2>
            <Link href="/leave?onLeaveNow=true" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {onLeaveNow.slice(0, 5).map((i, idx) => (
              <button
                key={`${i.employee_id}-${i.project_id}-${idx}`}
                onClick={() => setSelectedEmployee(i.employee_id)}
                className="flex items-center gap-2 text-xs w-full text-left hover:bg-gray-50 rounded-lg px-1.5 py-1 -mx-1.5 transition"
              >
                <Badge variant={i.leave_type === "Emergency" ? "red" : i.leave_type === "Sick" ? "amber" : "default"}>{i.leave_type}</Badge>
                <span className="font-medium text-gray-700">{i.employee_id}</span>
                <span className="text-gray-400 truncate">{i.project_id}</span>
                {!i.backfill_available && <span className="text-red-500 ml-auto whitespace-nowrap">no backfill</span>}
              </button>
            ))}
            {onLeaveNow.length === 0 && <p className="text-xs text-gray-400 italic">Nobody is on leave right now.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Revenue Trend</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Monthly revenue, from the Pipeline workbook.</p>
          </div>
          {revenueChartData.length > 0 && (
            <button
              onClick={() => setShowRevenueProof(true)}
              className="text-xs text-primary hover:underline flex-shrink-0 whitespace-nowrap"
            >
              View proof
            </button>
          )}
        </div>
        {latestRevenue && (
          <p className="text-xs text-gray-500 mb-2">
            Latest ({latestRevenue.month}): <span className="font-semibold text-gray-800">{latestRevenue.value.toLocaleString()}</span>
            {latestRevenue.deltaPct != null && (
              <span className={cn("ml-1.5", latestRevenue.deltaAbs! >= 0 ? "text-emerald-600" : "text-red-500")}>
                {latestRevenue.deltaAbs! >= 0 ? "▲" : "▼"} {Math.abs(latestRevenue.deltaPct).toFixed(1)}% vs prior month
              </span>
            )}
          </p>
        )}
        {revenue.isLoading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : revenue.error || !revenue.data?.length ? (
          <p className="text-xs text-gray-400 italic">No revenue data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f3f7" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<RevenueTooltip />} />
              <Line type="monotone" dataKey="value" stroke="#3411A3" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {overAllocated.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700">
            <strong>{overAllocated.length}</strong> allocation rows belong to employees currently allocated above 100% capacity.{" "}
            <Link href="/allocations?band=over_allocated" className="underline">Review in Allocations →</Link>
          </p>
        </div>
      )}

      {selectedProject && (
        <ProjectHealthDetailModal projectCode={selectedProject} onClose={() => setSelectedProject(null)} />
      )}
      {selectedEmployee && (
        <EmployeeProfileModal employeeId={selectedEmployee} initialTab="overview" onClose={() => setSelectedEmployee(null)} />
      )}
      {showRevenueProof && <RevenueProofModal data={revenueChartData} onClose={() => setShowRevenueProof(false)} />}
    </div>
  );
}

function RevenueTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RevenueRow }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm text-xs space-y-1 max-w-xs">
      <p className="font-semibold text-gray-800">{d.month}</p>
      <p className="text-gray-600">
        Parsed value: <span className="font-medium text-gray-800">{d.value.toLocaleString()}</span>
      </p>
      <p className="text-gray-400">Source cell: &quot;{d.raw}&quot;</p>
      {d.deltaAbs != null && (
        <p className={d.deltaAbs >= 0 ? "text-emerald-600" : "text-red-500"}>
          {d.deltaAbs >= 0 ? "▲" : "▼"} {Math.abs(d.deltaAbs).toLocaleString()} ({d.deltaPct!.toFixed(1)}%) vs prior month
        </p>
      )}
    </div>
  );
}

function RevenueProofModal({ data, onClose }: { data: RevenueRow[]; onClose: () => void }) {
  return (
    <Modal title="Revenue Trend — Proof" subtitle="Pipeline workbook → &quot;6 Months Revenue&quot; sheet" onClose={onClose} widthClassName="max-w-lg">
      <div className="p-5 space-y-3 text-xs">
        <p className="text-gray-500">One figure per month, straight from the source sheet -- no further breakdown exists.</p>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-gray-400 border-b border-gray-200">
              <th className="text-left font-medium py-1">Month</th>
              <th className="text-left font-medium py-1">Raw source cell</th>
              <th className="text-right font-medium py-1">Parsed value</th>
              <th className="text-right font-medium py-1">vs prior month</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.month} className="border-b border-gray-100 last:border-0">
                <td className="py-1.5 text-gray-700 font-medium">{m.month}</td>
                <td className="py-1.5 text-gray-500">&quot;{m.raw}&quot;</td>
                <td className="py-1.5 text-gray-700 text-right">{m.value.toLocaleString()}</td>
                <td className={cn("py-1.5 text-right", m.deltaAbs == null ? "text-gray-400" : m.deltaAbs >= 0 ? "text-emerald-600" : "text-red-500")}>
                  {m.deltaAbs == null ? "-" : `${m.deltaAbs >= 0 ? "+" : ""}${m.deltaAbs.toLocaleString()} (${m.deltaPct!.toFixed(1)}%)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
