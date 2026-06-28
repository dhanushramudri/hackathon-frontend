"use client";

import { cn } from "@/lib/utils";

export interface TableControlsProps {
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  filters?: { value: string; onChange: (v: string) => void; options: [string, string][] }[];
  toggles?: { active: boolean; onToggle: () => void; label: string }[];
  sort?: { value: string; onChange: (v: string) => void; options: [string, string][] };
}

export function TableControls({ search, filters, toggles, sort }: TableControlsProps) {
  return (
    <div className="space-y-1.5 mb-2">
      {search && (
        <input
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder}
          className="w-full text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-gray-300"
        />
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {filters?.map((f, i) => (
          <select
            key={i}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600"
          >
            {f.options.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        ))}
        {toggles?.map((t, i) => (
          <button
            key={i}
            onClick={t.onToggle}
            className={cn(
              "text-[11px] px-2 py-1 rounded-lg border whitespace-nowrap transition",
              t.active ? "bg-amber-50 border-amber-200 text-amber-700" : "border-gray-200 text-gray-500"
            )}
          >
            {t.label}
          </button>
        ))}
        {sort && (
          <select
            value={sort.value}
            onChange={(e) => sort.onChange(e.target.value)}
            className="text-[11px] px-1.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 ml-auto"
          >
            {sort.options.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
