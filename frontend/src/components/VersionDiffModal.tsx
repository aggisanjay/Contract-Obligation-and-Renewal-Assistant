import React, { useState, useEffect } from "react";
import { compareVersions, VersionCompareResponse } from "../services/api.js";
import {
  X,
  PlusCircle,
  MinusCircle,
  FileEdit,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Split,
} from "lucide-react";

interface VersionDiffModalProps {
  contractId: string;
  contractTitle: string;
  availableVersions: Array<{ versionNumber: number; itemCount: number }>;
  defaultV1?: number;
  defaultV2?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const VersionDiffModal: React.FC<VersionDiffModalProps> = ({
  contractId,
  contractTitle,
  availableVersions,
  defaultV1,
  defaultV2,
  isOpen,
  onClose,
}) => {
  const [v1, setV1] = useState<number>(
    defaultV1 || (availableVersions.length >= 2 ? availableVersions[availableVersions.length - 2].versionNumber : 1)
  );
  const [v2, setV2] = useState<number>(
    defaultV2 || (availableVersions.length >= 2 ? availableVersions[availableVersions.length - 1].versionNumber : 2)
  );

  const [filter, setFilter] = useState<"all" | "modified" | "added" | "removed">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<VersionCompareResponse | null>(null);

  const fetchDiff = async (baseV: number, targetV: number) => {
    try {
      setLoading(true);
      setError(null);
      const res = await compareVersions(contractId, baseV, targetV);
      setDiffData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to compare versions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && v1 && v2 && v1 !== v2) {
      fetchDiff(v1, v2);
    }
  }, [isOpen, v1, v2]);

  if (!isOpen) return null;

  const diff = diffData?.sectionDiff;
  const modifiedList = diff?.modified || [];
  const addedList = diff?.added || [];
  const removedList = diff?.removed || [];
  const unchangedList = diff?.unchanged || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[90vh] flex flex-col relative border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Split className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900">Version Diff & Clause Comparison</h3>
                <span className="text-xs text-slate-500 font-normal">({contractTitle})</span>
              </div>
              <div className="flex items-center space-x-2 mt-1 text-xs text-slate-600">
                <span>Base Version:</span>
                <select
                  value={v1}
                  onChange={(e) => setV1(parseInt(e.target.value, 10))}
                  className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {availableVersions.map((v) => (
                    <option key={`v1-${v.versionNumber}`} value={v.versionNumber} disabled={v.versionNumber === v2}>
                      v{v.versionNumber}
                    </option>
                  ))}
                </select>

                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />

                <span>Target Version:</span>
                <select
                  value={v2}
                  onChange={(e) => setV2(parseInt(e.target.value, 10))}
                  className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {availableVersions.map((v) => (
                    <option key={`v2-${v.versionNumber}`} value={v.versionNumber} disabled={v.versionNumber === v1}>
                      v{v.versionNumber}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diff Statistics Pills & Filter Buttons */}
        {diff && !loading && (
          <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  filter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Changes ({modifiedList.length + addedList.length + removedList.length})
              </button>
              <button
                onClick={() => setFilter("modified")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 ${
                  filter === "modified"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                }`}
              >
                <FileEdit className="w-3 h-3 mr-1" />
                Modified ({modifiedList.length})
              </button>
              <button
                onClick={() => setFilter("added")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 ${
                  filter === "added"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                }`}
              >
                <PlusCircle className="w-3 h-3 mr-1" />
                Added ({addedList.length})
              </button>
              <button
                onClick={() => setFilter("removed")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 ${
                  filter === "removed"
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                }`}
              >
                <MinusCircle className="w-3 h-3 mr-1" />
                Removed ({removedList.length})
              </button>
            </div>

            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{unchangedList.length}</span> clauses unchanged
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
          {loading && (
            <div className="h-64 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Computing section diffs between v{v1} and v{v2}...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3 text-xs text-red-700">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && diff && (
            <>
              {/* MODIFIED SECTIONS */}
              {(filter === "all" || filter === "modified") && modifiedList.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold text-amber-800 uppercase tracking-wider">
                    <FileEdit className="w-4 h-4 text-amber-600" />
                    <span>Modified Clauses ({modifiedList.length})</span>
                  </div>

                  {modifiedList.map((m, idx) => (
                    <div
                      key={`mod-${idx}`}
                      className="bg-white rounded-xl border border-amber-200 shadow-2xs overflow-hidden"
                    >
                      <div className="bg-amber-50/70 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900">
                          {m.v2.label} {m.v2.heading ? `- ${m.v2.heading}` : ""}
                        </span>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[11px] font-semibold">
                          {m.diffSummary}
                        </span>
                      </div>

                      {/* Side-by-side Comparison */}
                      <div className="grid grid-cols-2 divide-x divide-slate-200 text-xs">
                        {/* Base Version v1 */}
                        <div className="p-4 bg-rose-50/30">
                          <div className="flex items-center space-x-1.5 text-[11px] font-bold text-rose-700 uppercase tracking-wider mb-2">
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                            <span>Version {v1} (Original)</span>
                          </div>
                          <p className="text-slate-800 whitespace-pre-wrap leading-relaxed font-mono text-[12px] bg-white p-3 rounded-lg border border-rose-100">
                            {m.v1.text}
                          </p>
                        </div>

                        {/* Target Version v2 */}
                        <div className="p-4 bg-emerald-50/30">
                          <div className="flex items-center space-x-1.5 text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>Version {v2} (Updated)</span>
                          </div>
                          <p className="text-slate-800 whitespace-pre-wrap leading-relaxed font-mono text-[12px] bg-white p-3 rounded-lg border border-emerald-100">
                            {m.v2.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ADDED SECTIONS */}
              {(filter === "all" || filter === "added") && addedList.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    <PlusCircle className="w-4 h-4 text-emerald-600" />
                    <span>Added Clauses in v{v2} ({addedList.length})</span>
                  </div>

                  {addedList.map((sec, idx) => (
                    <div
                      key={`add-${idx}`}
                      className="bg-emerald-50/40 rounded-xl border border-emerald-300 p-4 shadow-2xs"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-emerald-900">
                          {sec.label} {sec.heading ? `- ${sec.heading}` : ""}
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[11px] font-bold">
                          + Added in v{v2}
                        </span>
                      </div>
                      <p className="text-slate-800 text-xs whitespace-pre-wrap leading-relaxed font-mono bg-white p-3 rounded-lg border border-emerald-100">
                        {sec.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* REMOVED SECTIONS */}
              {(filter === "all" || filter === "removed") && removedList.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold text-rose-800 uppercase tracking-wider">
                    <MinusCircle className="w-4 h-4 text-rose-600" />
                    <span>Removed Clauses in v{v2} ({removedList.length})</span>
                  </div>

                  {removedList.map((sec, idx) => (
                    <div
                      key={`rem-${idx}`}
                      className="bg-rose-50/40 rounded-xl border border-rose-300 p-4 shadow-2xs"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-rose-900 line-through">
                          {sec.label} {sec.heading ? `- ${sec.heading}` : ""}
                        </span>
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded text-[11px] font-bold">
                          - Removed from v{v2}
                        </span>
                      </div>
                      <p className="text-slate-600 text-xs whitespace-pre-wrap leading-relaxed font-mono bg-white p-3 rounded-lg border border-rose-100 line-through opacity-80">
                        {sec.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {modifiedList.length === 0 && addedList.length === 0 && removedList.length === 0 && (
                <div className="py-16 text-center text-slate-500">
                  <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-800">No Differences Found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    All clauses between Version {v1} and Version {v2} are identical.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
