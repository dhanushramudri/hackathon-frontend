"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Mascot } from "@/components/shared/Mascot";
import { api, type BuddyStat, type BuddyTable } from "@/lib/api";
import { EmployeeProfileModal } from "@/components/shared/EmployeeProfileModal";
import { ProjectHealthDetailModal } from "@/components/health/ProjectHealthDetailModal";

const EMPLOYEE_COLUMNS = new Set(["Employee"]);
const PROJECT_COLUMNS = new Set(["Project"]);

interface Message {
  role: "user" | "assistant";
  content: string;
  format?: "table" | "stats" | "text";
  table?: BuddyTable;
  stats?: BuddyStat[];
  data?: unknown;
}

const SUGGESTIONS = [
  "Who's currently free or under-utilized in Data Engineering?",
  "Which projects are at risk right now, and why?",
  "Who's going on leave soon, and is there a backfill?",
  "What roles does a typical AI project need, and what do they cost?",
  "What does the pipeline outlook look like for the next quarter?",
];

function Avatar() {
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "hsl(var(--primary) / 0.12)" }}>
      <Mascot className="w-5 h-5" />
    </div>
  );
}

function ChatTable({
  columns,
  rows,
  onEmployeeClick,
  onProjectClick,
}: BuddyTable & { onEmployeeClick: (id: string) => void; onProjectClick: (code: string) => void }) {
  const employeeColIdx = columns.findIndex((c) => EMPLOYEE_COLUMNS.has(c));
  const projectColIdx = columns.findIndex((c) => PROJECT_COLUMNS.has(c));
  return (
    <div className="w-full rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map((c) => (
              <th key={c} className="text-left font-semibold text-gray-500 px-2.5 py-1.5 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">
                  {j === employeeColIdx && cell ? (
                    <button onClick={() => onEmployeeClick(String(cell))} className="text-primary hover:underline">{cell}</button>
                  ) : j === projectColIdx && cell ? (
                    <button onClick={() => onProjectClick(String(cell))} className="text-primary hover:underline">{cell}</button>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChatStats({ items }: { items: BuddyStat[] }) {
  return (
    <div className="w-full grid grid-cols-2 gap-2">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border border-gray-200 px-3 py-2">
          <p className="text-[10px] text-gray-400 mb-0.5">{s.label}</p>
          <p className="text-sm font-bold text-gray-800">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function BuddyPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const handleSend = async (text?: string) => {
    const message = (text ?? draft).trim();
    if (!message || sending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setDraft("");
    setSending(true);
    try {
      const json = await api.buddyAsk(message, history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.answer, format: json.format, table: json.table, stats: json.stats, data: json.data },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Could not reach Buddy's backend." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-white">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Mascot className="w-8 h-8" />
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Buddy</h1>
            <p className="text-[11px] text-gray-400 leading-tight">Your resourcing buddy -- staffing, health, free pool, leave, profiles, forecasts, rate card, and more</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto gap-5">
            <Mascot className="w-14 h-14" glow />
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-1">Ask Buddy anything about resourcing</h2>
              <p className="text-sm text-gray-400">Every answer is backed by the same engines behind the dedicated pages -- not a guess.</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition text-left"
                >
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "assistant" && <Avatar />}
                <div className={cn("flex flex-col gap-2", m.role === "assistant" ? "flex-1 min-w-0" : "", m.role === "user" && "order-first ml-auto items-end")}>
                  <div
                    className={cn(
                      "max-w-[80%] px-4 py-2.5 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-wrap",
                      m.role === "user" ? "text-white rounded-br-md bg-primary" : "bg-gray-50 text-gray-800 rounded-bl-md border border-gray-100"
                    )}
                  >
                    {m.content}
                  </div>
                  {m.role === "assistant" && m.format === "table" && m.table && (
                    <ChatTable {...m.table} onEmployeeClick={setSelectedEmployee} onProjectClick={setSelectedProject} />
                  )}
                  {m.role === "assistant" && m.format === "stats" && m.stats && <ChatStats items={m.stats} />}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-3 justify-start">
                <Avatar />
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-gray-50 border border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 px-6 py-4 flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-end gap-2.5">
          <div className="flex-1 flex items-end gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 focus-within:border-gray-300 transition">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask Buddy…"
              className="flex-1 text-sm outline-none placeholder:text-gray-400 resize-none leading-relaxed py-0.5"
              rows={1}
              disabled={sending}
            />
          </div>
          <button
            onClick={() => handleSend()}
            disabled={!draft.trim() || sending}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 transition hover:opacity-90 bg-primary"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-300 mt-2">Buddy can make mistakes -- verify important findings on the dedicated pages.</p>
      </div>

      {selectedEmployee && (
        <EmployeeProfileModal employeeId={selectedEmployee} initialTab="overview" onClose={() => setSelectedEmployee(null)} />
      )}
      {selectedProject && <ProjectHealthDetailModal projectCode={selectedProject} onClose={() => setSelectedProject(null)} />}
    </div>
  );
}
