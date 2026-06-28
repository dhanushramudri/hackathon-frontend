import { cn } from "@/lib/utils";

const VARIANTS: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  red: "bg-red-50 text-red-700 border-red-200",
  over_allocated: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200",
  under_utilized: "bg-blue-50 text-blue-700 border-blue-200",
  eligible: "bg-emerald-50 text-emerald-700 border-emerald-200",
  trainable: "bg-amber-50 text-amber-700 border-amber-200",
  gap: "bg-red-50 text-red-700 border-red-200",
  no_color: "bg-gray-50 text-gray-400 border-gray-200",
  billable: "bg-emerald-50 text-emerald-700 border-emerald-200",
  shadow: "bg-amber-50 text-amber-700 border-amber-200",
  unbilled: "bg-red-50 text-red-700 border-red-200",
  proposed: "bg-blue-50 text-blue-700 border-blue-200",
  pending: "bg-gray-50 text-gray-500 border-gray-200",
  default: "bg-gray-50 text-gray-600 border-gray-200",
};

export function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: string }) {
  const key = variant.toLowerCase();
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border", VARIANTS[key] ?? VARIANTS.default)}>
      {children}
    </span>
  );
}
