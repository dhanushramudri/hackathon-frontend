"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/shared/Modal";

const RESOURCING_STATUSES = ["BILLABLE", "SHADOW", "UNBILLED"];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

// Shared assign-to-project action used everywhere a candidate is shown
// against a real project (Relief Staffing, Leave Backfill, Replacement/
// Backfill tab) -- writes a real allocation row via /allocations/assign.
export function AssignModal({
  employeeId,
  projectId,
  defaultAllocationPct = 100,
  defaultStartDate,
  defaultEndDate,
  onClose,
  onAssigned,
}: {
  employeeId: string;
  projectId: string;
  defaultAllocationPct?: number;
  // Caller-supplied real dates (leave start/end, project start/end, the
  // vacated allocation's own dates, etc.) -- falls back to today/+12w only
  // when the caller genuinely has nothing better to seed from. Always
  // editable regardless of where the default came from.
  defaultStartDate?: string | null;
  defaultEndDate?: string | null;
  onClose: () => void;
  onAssigned?: () => void;
}) {
  const [allocationPct, setAllocationPct] = useState(String(Math.round(defaultAllocationPct)));
  const [startDate, setStartDate] = useState(defaultStartDate || todayStr());
  const [endDate, setEndDate] = useState(defaultEndDate || addWeeks(defaultStartDate || todayStr(), 12));
  const [resourcingStatus, setResourcingStatus] = useState("BILLABLE");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.assignAllocation({
        employeeId, projectId,
        allocationPct: Number(allocationPct) || 0,
        startDate, endDate, resourcingStatus,
      });
      onAssigned?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign this employee.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Assign ${employeeId} to ${projectId}`} onClose={onClose} widthClassName="max-w-sm">
      <div className="p-4 space-y-3 text-xs">
        {error && <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>}
        <div>
          <label className="text-[11px] text-gray-400 block mb-0.5">Allocation %</label>
          <input
            type="number" min={1} max={100} value={allocationPct}
            onChange={(e) => setAllocationPct(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[11px] text-gray-400 block mb-0.5">Start date</label>
            <input
              type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-gray-400 block mb-0.5">End date</label>
            <input
              type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-gray-400 block mb-0.5">Resourcing status</label>
          <select
            value={resourcingStatus} onChange={(e) => setResourcingStatus(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none bg-white"
          >
            {RESOURCING_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "hsl(var(--primary))" }}
        >
          {submitting ? "Assigning…" : "Confirm assignment"}
        </button>
      </div>
    </Modal>
  );
}
