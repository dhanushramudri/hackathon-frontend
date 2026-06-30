"use client";

import { Award } from "lucide-react";
import type { LeaveImpact, RedeployCandidate } from "@/lib/api";
import { Modal } from "@/components/shared/Modal";
import { Badge } from "@/components/shared/Badge";

const REASON_VARIANT: Record<string, string> = { ending_soon: "amber", fully_free: "green", under_utilized: "under_utilized" };

function reasonLabel(c: RedeployCandidate): string {
  if (c.reason === "fully_free") return "Fully free";
  if (c.reason === "ending_soon") return `${c.days_to_end}d left on current work`;
  if (c.reason === "under_utilized") return `${c.current_allocation_pct}% allocated`;
  return c.reason;
}

function skillSourceLabel(source: LeaveImpact["required_skill_source"], jobName: string | null): string {
  if (source === "project_roster") return "this project's own team — what their current teammates actually know";
  if (source === "own_skills") return `${jobName ?? "the employee"}'s own skills (project roster too thin to derive a signature)`;
  return "no skill data available for this role — ranked by availability only";
}

function CandidateCard({
  candidate,
  rank,
  onSelectEmployee,
}: {
  candidate: RedeployCandidate;
  rank: number;
  onSelectEmployee: (id: string) => void;
}) {
  const matched = candidate.matched_skills ?? [];
  const missing = candidate.missing_skills ?? [];
  const assessed = candidate.skill_bucket && candidate.skill_bucket !== "not_assessed";

  return (
    <div
      className={
        "rounded-xl border p-3.5 space-y-2.5 transition " +
        (rank === 0 ? "border-primary/40 bg-primary/[0.03]" : "border-gray-200 bg-white")
      }
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {rank === 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary flex-shrink-0">
              <Award className="w-3.5 h-3.5" /> Top pick
            </span>
          )}
          <button onClick={() => onSelectEmployee(candidate.employee_id)} className="font-semibold text-sm text-primary hover:underline truncate">
            {candidate.employee_id}
          </button>
          <span className="text-xs text-gray-500 truncate">{candidate.job_name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge variant={REASON_VARIANT[candidate.reason] ?? "default"}>{reasonLabel(candidate)}</Badge>
          {assessed && (
            <Badge variant={candidate.skill_bucket}>
              {Math.round((candidate.skill_score ?? 0) * 100)}% skill match
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 text-[11px] text-gray-400">
        {candidate.coe && <span>{candidate.coe}</span>}
        {candidate.location && <span>· {candidate.location}</span>}
      </div>

      {assessed && (matched.length > 0 || missing.length > 0) && (
        <div className="space-y-1.5 pt-1 border-t border-gray-100">
          {matched.length > 0 && (
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] font-semibold text-emerald-600 flex-shrink-0 mt-0.5 w-12">Matched</span>
              <div className="flex flex-wrap gap-1">
                {matched.map((s) => (
                  <span key={s} className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {missing.length > 0 && (
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] font-semibold text-gray-400 flex-shrink-0 mt-0.5 w-12">Missing</span>
              <div className="flex flex-wrap gap-1">
                {missing.map((s) => (
                  <span key={s} className="px-1.5 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-[10px] text-gray-500">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LeaveBackfillModal({
  impact,
  onClose,
  onSelectEmployee,
}: {
  impact: LeaveImpact;
  onClose: () => void;
  onSelectEmployee: (id: string) => void;
}) {
  return (
    <Modal
      title={`Backfill for ${impact.employee_id}${impact.job_name ? ` (${impact.job_name})` : ""}`}
      subtitle={`${impact.project_id} · ${impact.allocation_by_percentage}% allocated · on leave ${impact.leave_start_date} → ${impact.leave_end_date}`}
      onClose={onClose}
      widthClassName="max-w-2xl"
    >
      <div className="p-5 space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-gray-600 mb-1.5">
            Skill match is matched against {skillSourceLabel(impact.required_skill_source, impact.job_name)}
          </p>
          {impact.required_skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {impact.required_skills.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[11px] text-gray-600">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {impact.backfill_candidates.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-6">
            No one with this designation ({impact.job_name ?? "?"}) is currently free.
          </p>
        ) : (
          <div className="space-y-2.5">
            {impact.backfill_candidates.map((c, i) => (
              <CandidateCard key={c.employee_id} candidate={c} rank={i} onSelectEmployee={onSelectEmployee} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
