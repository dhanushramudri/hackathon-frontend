"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2, Plus, Trash2, MessageSquare, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
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

interface BuddyConversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
}

const CONVERSATIONS_KEY = "buddy_conversations";
const SIDEBAR_COLLAPSED_KEY = "buddy_sidebar_collapsed";

function loadConversations(): BuddyConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(list: BuddyConversation[]) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list));
  } catch {}
}

function mostRecentId(list: BuddyConversation[]): string | null {
  if (list.length === 0) return null;
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].id;
}

function deriveTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

function relativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
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
    <div className="hidden sm:flex w-7 h-7 rounded-full items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "hsl(var(--primary) / 0.12)" }}>
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
    <div className="w-full rounded-xl border border-[hsl(var(--primary)/0.3)] overflow-x-auto">
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
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border border-gray-200 px-3 py-2">
          <p className="text-[10px] text-gray-400 mb-0.5">{s.label}</p>
          <p className="text-sm font-bold text-gray-800">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function ConversationRail({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  mobileOpen,
  onMobileClose,
}: {
  conversations: BuddyConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (collapsed && !mobileOpen) {
    return (
      <div className="hidden md:flex w-12 flex-shrink-0 border-r border-gray-100 flex-col items-center bg-gray-50/50 py-2.5 gap-2 transition-all">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand conversations"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 transition"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button
          onClick={onCreate}
          title="New chat"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white bg-primary transition hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onMobileClose} aria-hidden="true" />
      )}
      <div
        className={cn(
          "w-72 md:w-56 flex-shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/50",
          "fixed inset-y-0 left-0 z-40 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:translate-x-0 md:z-auto md:transition-all"
        )}
      >
        <div className="p-2.5 flex items-center gap-1.5">
          <button
            onClick={onCreate}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-primary transition hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" />
            New chat
          </button>
          <button
            onClick={onMobileClose}
            title="Close"
            className="md:hidden w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse"
            className="hidden md:flex w-8 h-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 transition"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-0.5">
          {sorted.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "w-full group flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition",
                c.id === activeId ? "bg-white shadow-sm" : "hover:bg-white/70"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className={cn("text-xs truncate", c.id === activeId ? "text-gray-900 font-medium" : "text-gray-600")}>{c.title}</p>
                <p className="text-[10px] text-gray-400">{relativeTime(c.updatedAt)}</p>
              </div>
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded-md hover:bg-gray-100 text-gray-300 hover:text-red-400 transition flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </span>
            </button>
          ))}
          {sorted.length === 0 && <p className="text-[11px] text-gray-300 text-center py-6 px-2">No conversations yet</p>}
        </div>
      </div>
    </>
  );
}

export default function BuddyPage() {
  const [conversations, setConversations] = useState<BuddyConversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => mostRecentId(loadConversations()));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [railMobileOpen, setRailMobileOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const appendMessage = (conversationId: string, message: Message) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, messages: [...c.messages, message], updatedAt: new Date().toISOString() } : c
      )
    );
  };

  const handleSend = async (text?: string) => {
    const message = (text ?? draft).trim();
    if (!message || sending) return;

    const isNew = activeId === null;
    const conversationId = activeId ?? crypto.randomUUID();
    const history = (isNew ? [] : activeConversation?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));

    if (isNew) {
      setConversations((prev) => [
        { id: conversationId, title: deriveTitle(message), messages: [], updatedAt: new Date().toISOString() },
        ...prev,
      ]);
      setActiveId(conversationId);
    }
    appendMessage(conversationId, { role: "user", content: message });
    setDraft("");
    setSending(true);
    try {
      const json = await api.buddyAsk(message, history);
      appendMessage(conversationId, { role: "assistant", content: json.answer, format: json.format, table: json.table, stats: json.stats, data: json.data });
    } catch {
      appendMessage(conversationId, { role: "assistant", content: "Could not reach Buddy's backend." });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  };

  return (
    <div className="h-[calc(100dvh-56px)] flex bg-white">
      <ConversationRail
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setRailMobileOpen(false);
        }}
        onCreate={() => {
          setActiveId(null);
          setRailMobileOpen(false);
        }}
        onDelete={handleDelete}
        mobileOpen={railMobileOpen}
        onMobileClose={() => setRailMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2.5 px-3 sm:px-6 py-3 sm:py-3.5 border-b border-gray-100 flex-shrink-0 min-w-0">
          <button
            onClick={() => setRailMobileOpen(true)}
            title="Conversations"
            className="md:hidden flex-shrink-0 p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <span className="hidden sm:inline-flex flex-shrink-0">
            <Mascot className="w-8 h-8" />
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Buddy</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 sm:px-6 py-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto gap-4 sm:gap-5">
              <Mascot className="w-11 h-11 sm:w-14 sm:h-14" glow />
              <div className="flex flex-col gap-1.5 sm:gap-2 w-full">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className={cn(
                      "flex items-center gap-2.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200 text-[13px] sm:text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition text-left",
                      i >= 3 && "hidden sm:flex"
                    )}
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
                        "max-w-[92%] sm:max-w-[80%] px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-wrap",
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

        <div className="border-t border-gray-100 px-3 sm:px-6 py-4 flex-shrink-0">
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
          <p className="text-center text-[10px] text-gray-300 mt-2">Buddy can make mistakes. Verify important findings on dedicated pages.</p>
        </div>
      </div>

      {selectedEmployee && (
        <EmployeeProfileModal employeeId={selectedEmployee} initialTab="overview" onClose={() => setSelectedEmployee(null)} />
      )}
      {selectedProject && <ProjectHealthDetailModal projectCode={selectedProject} onClose={() => setSelectedProject(null)} />}
    </div>
  );
}
