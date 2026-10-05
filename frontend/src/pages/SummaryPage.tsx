import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getContractSummary, generateContractSummary } from "../services/api.js";
import {
  CompiledSummaryData,
  SummaryParty,
  SummaryObligation,
  SummaryAmbiguity,
} from "@contract-assistant/shared";
import {
  Printer,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  FileCheck2,
  Calendar,
  Building2,
  Scale,
  Copy,
  Check,
} from "lucide-react";
import { useToast } from "../context/ToastContext.js";

function renderDateStatusBadge(val: string | null) {
  const text = val || "Not found in contract";
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(text);

  if (isDate) {
    return <span className="text-base font-bold text-slate-900 font-mono">{text}</span>;
  }
  if (text.startsWith("Needs input:")) {
    return (
      <span className="inline-block text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg mt-1.5 leading-snug">
        {text}
      </span>
    );
  }
  if (text === "Pending review") {
    return (
      <span className="inline-block text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200/80 px-2.5 py-1 rounded-lg mt-1.5">
        Pending review
      </span>
    );
  }
  if (text.includes("Not applicable")) {
    return (
      <span className="inline-block text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg mt-1.5">
        {text}
      </span>
    );
  }
  return (
    <span className="inline-block text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg mt-1.5">
      {text}
    </span>
  );
}

export const SummaryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [compiled, setCompiled] = useState<CompiledSummaryData | null>(null);
  const [isOutdated, setIsOutdated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadSummary = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getContractSummary(id);
      setCompiled(res.compiled);
      setIsOutdated(res.isOutdated);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load summary";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, [id]);

  const handleRegenerate = async () => {
    if (!id) return;
    try {
      setRegenerating(true);
      const res = await generateContractSummary(id);
      setCompiled(res.compiled);
      setIsOutdated(false);
      toast.success("Summary regenerated successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Failed to regenerate summary: " + msg);
    } finally {
      setRegenerating(false);
    }
  };

  const handlePrint = () => {
    // Triggers native browser print dialog with print-optimized styles
    window.print();
  };

  const handleCopy = async () => {
    if (!compiled) return;
    try {
      await navigator.clipboard.writeText(compiled.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback if clipboard API not permitted
      const textarea = document.createElement("textarea");
      textarea.value = compiled.markdown;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3 shadow-glow-sky"></div>
          <p className="text-xs text-slate-500 font-medium">Compiling reviewed summary...</p>
        </div>
      </div>
    );
  }

  if (error || !compiled) {
    return (
      <div className="flex-1 max-w-xl mx-auto p-12 text-center">
        <div className="p-8 bg-rose-50/70 border border-rose-200/80 rounded-2xl shadow-card">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-rose-900 font-heading">Summary Not Available</h2>
          <p className="text-xs text-rose-700 mt-1.5 leading-relaxed">{error || "Could not generate summary."}</p>
          <Link
            to={id ? `/contracts/${id}` : "/"}
            className="mt-5 inline-flex items-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition-all"
          >
            Back to Contract
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex-1">
      {/* Back Link & Header */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          to={`/contracts/${id}`}
          className="inline-flex items-center text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5 transition-transform group-hover:-translate-x-0.5" />
          Back to Contract Review
        </Link>

        <div className="flex items-center flex-wrap gap-2">
          {isOutdated && (
            <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
              Outdated (Reviewed items changed)
            </span>
          )}

          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex items-center px-3.5 py-1.5 border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl shadow-2xs transition-all active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${regenerating ? "animate-spin" : ""}`} />
            Regenerate Summary
          </button>

          <button
            onClick={handleCopy}
            className="inline-flex items-center px-3.5 py-1.5 border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-all active:scale-95"
            title="Copy formatted summary to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                Copy Summary
              </>
            )}
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-glow-sky transition-all active:scale-95"
            title="Print or Save as PDF"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5 text-sky-100" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Summary Document Preview Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-card p-8 sm:p-12 space-y-8">
        {/* Document Header */}
        <div className="border-b border-slate-200/80 pb-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-heading">
              Reviewed Contract Summary: {compiled.contractTitle}
            </h1>
            <span className="px-3 py-1 text-xs font-bold font-mono bg-sky-50 text-sky-700 border border-sky-200/70 rounded-lg shadow-2xs shrink-0">
              v{compiled.versionNumber}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2 font-mono">
            Generated at: {new Date(compiled.generatedAt).toLocaleString()}
          </p>

          <div className="mt-5 p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-xs text-amber-900 font-medium leading-relaxed shadow-2xs flex items-start space-x-2">
            <Scale className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">NOTICE:</strong> {compiled.disclaimer}
            </div>
          </div>
        </div>

        {/* 1. Parties */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2 flex items-center space-x-2 font-heading">
            <Building2 className="w-4 h-4 text-sky-600" />
            <span>1. Contracting Parties</span>
          </h2>
          {compiled.parties.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No approved parties recorded.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {compiled.parties.map((p: SummaryParty, idx: number) => (
                <div key={idx} className="p-4 bg-slate-50/60 border border-slate-200/80 rounded-2xl text-xs hover:border-slate-300 transition-all shadow-2xs">
                  <p className="font-bold text-slate-900 text-sm font-heading">{p.name}</p>
                  <p className="text-slate-600 mt-1">Role: <span className="font-semibold text-slate-800">{p.role}</span></p>
                  <p className="text-slate-400 italic mt-2.5 text-[11px] font-mono bg-white p-2 rounded-lg border border-slate-100 break-words">{p.citation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Key Dates */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2 flex items-center space-x-2 font-heading">
            <Calendar className="w-4 h-4 text-sky-600" />
            <span>2. Key Dates</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-50/60 border border-slate-200/80 rounded-2xl shadow-2xs">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px] font-heading">Effective Date</span>
              <div className="mt-1.5">
                {renderDateStatusBadge(compiled.keyDates.effectiveDate)}
              </div>
            </div>
            <div className="p-4 bg-slate-50/60 border border-slate-200/80 rounded-2xl shadow-2xs">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px] font-heading">Contract Expiry Date</span>
              <div className="mt-1.5">
                {renderDateStatusBadge(compiled.keyDates.expiryDate)}
              </div>
            </div>
            <div className="p-4 bg-slate-50/60 border border-slate-200/80 rounded-2xl shadow-2xs">
              <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px] font-heading">Notice Deadline</span>
              <div className="mt-1.5">
                {renderDateStatusBadge(compiled.keyDates.noticeDeadline)}
              </div>
            </div>
          </div>
          {compiled.keyDates.citation && (
            <p className="text-[11px] text-slate-400 italic mt-2.5 font-mono bg-slate-50/50 p-2 rounded-lg border border-slate-100 break-words">{compiled.keyDates.citation}</p>
          )}
        </div>

        {/* 3. Term, Renewal & Termination */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2 font-heading">
            3. Term, Renewal & Termination
          </h2>
          <div className="space-y-3.5 text-xs">
            <div className="p-4 bg-slate-50/60 border border-slate-200/80 rounded-2xl shadow-2xs">
              <span className="font-bold text-slate-900 font-heading">Renewal Clause: </span>
              <span className="text-slate-700 leading-relaxed">{compiled.renewalTerms.summary}</span>
              <p className="text-slate-400 italic text-[11px] mt-2 font-mono bg-white p-2 rounded-lg border border-slate-100 break-words">{compiled.renewalTerms.citation}</p>
            </div>
            <div className="p-4 bg-slate-50/60 border border-slate-200/80 rounded-2xl shadow-2xs">
              <span className="font-bold text-slate-900 font-heading">Termination Clause: </span>
              <span className="text-slate-700 leading-relaxed">{compiled.terminationTerms.summary}</span>
              <p className="text-slate-400 italic text-[11px] mt-2 font-mono bg-white p-2 rounded-lg border border-slate-100 break-words">{compiled.terminationTerms.citation}</p>
            </div>
          </div>
        </div>

        {/* 4. Obligations Table */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2 flex items-center space-x-2 font-heading">
            <FileCheck2 className="w-4 h-4 text-emerald-600" />
            <span>4. Approved Contract Obligations</span>
          </h2>
          {compiled.obligations.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No approved obligations recorded.</p>
          ) : (
            <div className="border border-slate-200/90 rounded-2xl overflow-x-auto shadow-card bg-white">
              <table className="w-full text-left text-xs divide-y divide-slate-200 min-w-[760px] table-fixed">
                <colgroup>
                  <col className="w-[15%]" />
                  <col className="w-[33%]" />
                  <col className="w-[20%]" />
                  <col className="w-[12%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="bg-slate-50/80 text-slate-700 font-bold uppercase tracking-wider text-[10px] font-heading">
                  <tr>
                    <th className="p-3.5 font-semibold">Party</th>
                    <th className="p-3.5 font-semibold">Obligation</th>
                    <th className="p-3.5 font-semibold">Deadline</th>
                    <th className="p-3.5 font-semibold">Recurrence</th>
                    <th className="p-3.5 font-semibold">Source Citation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {compiled.obligations.map((o: SummaryObligation, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 align-top font-bold text-slate-900 font-heading">
                        <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200/60 break-words">
                          {o.responsibleParty}
                        </span>
                      </td>
                      <td className="p-3.5 align-top text-slate-800 leading-relaxed font-normal break-words">
                        {o.description}
                      </td>
                      <td className="p-3.5 align-top font-mono text-xs font-semibold text-sky-700 leading-snug break-words">
                        {o.deadline || "None specified"}
                      </td>
                      <td className="p-3.5 align-top">
                        <span className="inline-block px-2 py-0.5 bg-sky-50 text-sky-700 rounded text-[10px] uppercase font-mono font-bold border border-sky-200/70">
                          {o.recurrence}
                        </span>
                      </td>
                      <td className="p-3.5 align-top text-slate-500 italic text-[11px] font-mono leading-relaxed break-words">
                        {o.citation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 5. Open Questions & Ambiguities */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2 font-heading">
            5. Open Questions & Ambiguities
          </h2>
          {compiled.openQuestionsAndAmbiguities.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No open clarification questions.</p>
          ) : (
            <div className="space-y-3 text-xs">
              {compiled.openQuestionsAndAmbiguities.map((q: SummaryAmbiguity, idx: number) => (
                <div key={idx} className="p-4 bg-slate-50/60 border border-slate-200/80 rounded-2xl shadow-2xs">
                  <p className="font-bold text-slate-900 font-heading">{q.description}</p>
                  <p className="text-slate-600 mt-1.5">
                    Answer / Resolution:{" "}
                    <strong className="text-slate-900 font-semibold">{q.userAnswer || "Pending Reviewer Answer"}</strong>
                  </p>
                  <p className="text-[11px] text-slate-400 italic mt-2 font-mono bg-white p-2 rounded-lg border border-slate-100">{q.citation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 6. Review Metrics */}
        <div className="pt-5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span>Approved items: <strong className="text-emerald-700 font-bold">{compiled.metrics.totalApproved}</strong></span>
            <span>&bull;</span>
            <span>Rejected: <strong className="text-rose-700 font-bold">{compiled.metrics.totalRejected}</strong></span>
            <span>&bull;</span>
            <span>Stale: <strong className="text-amber-700 font-bold">{compiled.metrics.totalStale}</strong></span>
          </div>
          <div className="font-semibold text-slate-600 flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
            Review status verified
          </div>
        </div>
      </div>
    </div>
  );
};
