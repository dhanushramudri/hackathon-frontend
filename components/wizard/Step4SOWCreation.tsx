"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollText, Upload, Download } from "lucide-react";
import { api } from "@/lib/api";

export function Step4SOWCreation({ projectCode, onNext }: { projectCode: string | null; onNext: () => void }) {
  const qc = useQueryClient();
  const files = useQuery({
    queryKey: ["project-sow", projectCode],
    queryFn: () => api.listProjectSow(projectCode as string),
    enabled: projectCode != null,
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(f: File) {
    setError(null);
    if (!projectCode) { setError("Create the project in Step 1 first, then come back to upload."); return; }
    setUploading(true);
    try {
      await api.uploadProjectSow(projectCode, f);
      await qc.invalidateQueries({ queryKey: ["project-sow", projectCode] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const list = files.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Statement Of Work Documents</p>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg text-white font-medium disabled:opacity-50"
          style={{ backgroundColor: "hsl(var(--primary))" }}
        >
          <Upload size={13} /> {uploading ? "Uploading…" : "Upload SOW"}
        </button>
        <input
          ref={fileInput} type="file" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>

      {!projectCode && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No project created yet — complete Step 1 before uploading a SOW.
        </p>
      )}
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl border border-gray-200 bg-white p-8">
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ScrollText className="text-gray-300" size={32} />
            <p className="text-sm text-rose-500 font-medium">No SOW Submitted Yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {list.map((f) => (
              <div key={f.filename} className="flex items-center justify-between py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <ScrollText className="text-gray-400" size={16} />
                  <span className="text-gray-700 font-medium">{f.filename}</span>
                  <span className="text-gray-400">{(f.size_bytes / 1024).toFixed(1)} KB · {new Date(f.uploaded_at).toLocaleString()}</span>
                </div>
                <a
                  href={api.projectSowDownloadUrl(projectCode as string, f.filename)}
                  className="flex items-center gap-1 text-[hsl(var(--primary))] hover:underline"
                  download
                >
                  <Download size={13} /> Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={onNext} className="text-xs px-4 py-2 rounded-lg text-white font-medium" style={{ backgroundColor: "hsl(var(--primary))" }}>
          Next
        </button>
      </div>
    </div>
  );
}
