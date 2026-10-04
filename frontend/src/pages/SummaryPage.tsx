import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getContractSummary, generateContractSummary, API_BASE } from "../services/api.js";
import {
  Download,
  Printer,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

export const SummaryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [compiled, setCompiled] = useState<any>(null);
  const [isOutdated, setIsOutdated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getContractSummary(id);
      setCompiled((res as any).compiled);
      setIsOutdated((res as any).isOutdated);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load summary");
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
      setCompiled((res as any).compiled);
      setIsOutdated(false);
    } catch (err: any) {
      alert("Failed to regenerate summary: " + err.message);
    } finally {
      setRegenerating(false);
    }
  };

  const handlePrint = () => {
    window.open(`${API_BASE}/contracts/${id}/summary/export/html`, "_blank");
  };

  const handleDownloadMarkdown = () => {
    window.open(`${API_BASE}/contracts/${id}/summary/export/markdown`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-slate-500 font-medium">Compiling reviewed summary...</p>
        </div>
      </div>
    );
  }

  if (error || !compiled) {
    return (
      <div className="flex-1 max-w-xl mx-auto p-12 text-center">
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <h2 className="text-base font-bold text-red-900">Summary Not Available</h2>
          <p className="text-xs text-red-700 mt-1">{error || "Could not generate summary."}</p>
          <Link
            to={id ? `/contracts/${id}` : "/"}
            className="mt-4 inline-block px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
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
      <div className="mb-6 flex items-center justify-between">
        <Link
          to={`/contracts/${id}`}
          className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Contract Review
        </Link>

        <div className="flex items-center space-x-2">
          {isOutdated && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-700" />
              Outdated (Reviewed items changed)
            </span>
          )}

          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex items-center px-3 py-1.5 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${regenerating ? "animate-spin" : ""}`} />
            Regenerate Summary
          </button>

          <button
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export Markdown
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Summary Document Preview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12 space-y-8">
        {/* Document Header */}
        <div className="border-b border-slate-200 pb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">
              Reviewed Contract Summary: {compiled.contractTitle}
            </h1>
            <span className="px-2.5 py-1 text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200 rounded-md">
              v{compiled.versionNumber}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Generated at: {new Date(compiled.generatedAt).toLocaleString()}
          </p>

          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
            <strong>NOTICE:</strong> {compiled.disclaimer}
          </div>
        </div>

        {/* 1. Parties */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3 border-b border-slate-100 pb-1.5">
            1. Contracting Parties
          </h2>
          {compiled.parties.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No approved parties recorded.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {compiled.parties.map((p: any, idx: number) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                  <p className="text-slate-600 mt-0.5">Role: {p.role}</p>
                  <p className="text-slate-400 italic mt-2 text-[11px]">{p.citation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Key Dates */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3 border-b border-slate-100 pb-1.5">
            2. Key Dates
          </h2>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 font-medium">Effective Date</span>
              <p className="text-sm font-bold text-slate-900 mt-1">
                {compiled.keyDates.effectiveDate || "Not confirmed"}
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 font-medium">Contract Expiry Date</span>
              <p className="text-sm font-bold text-slate-900 mt-1">
                {compiled.keyDates.expiryDate || "Not confirmed"}
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 font-medium">Notice Deadline</span>
              <p className="text-sm font-bold text-slate-900 mt-1">
                {compiled.keyDates.noticeDeadline || "Not confirmed"}
              </p>
            </div>
          </div>
          {compiled.keyDates.citation && (
            <p className="text-[11px] text-slate-400 italic mt-2">{compiled.keyDates.citation}</p>
          )}
        </div>

        {/* 3. Term, Renewal & Termination */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3 border-b border-slate-100 pb-1.5">
            3. Term, Renewal & Termination
          </h2>
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="font-semibold text-slate-700">Renewal Clause: </span>
              <span>{compiled.renewalTerms.summary}</span>
              <p className="text-slate-400 italic text-[11px] mt-1">{compiled.renewalTerms.citation}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="font-semibold text-slate-700">Termination Clause: </span>
              <span>{compiled.terminationTerms.summary}</span>
              <p className="text-slate-400 italic text-[11px] mt-1">{compiled.terminationTerms.citation}</p>
            </div>
          </div>
        </div>

        {/* 4. Obligations Table */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3 border-b border-slate-100 pb-1.5">
            4. Approved Contract Obligations
          </h2>
          {compiled.obligations.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No approved obligations recorded.</p>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-700 font-semibold">
                  <tr>
                    <th className="p-3">Party</th>
                    <th className="p-3">Obligation</th>
                    <th className="p-3">Deadline</th>
                    <th className="p-3">Recurrence</th>
                    <th className="p-3">Citation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {compiled.obligations.map((o: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-slate-800">{o.responsibleParty}</td>
                      <td className="p-3 text-slate-800">{o.description}</td>
                      <td className="p-3 font-mono font-semibold text-sky-700">{o.deadline}</td>
                      <td className="p-3 text-slate-500 uppercase text-[10px]">{o.recurrence}</td>
                      <td className="p-3 text-slate-400 italic text-[11px]">{o.citation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 5. Open Questions & Ambiguities */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3 border-b border-slate-100 pb-1.5">
            5. Open Questions & Ambiguities
          </h2>
          {compiled.openQuestionsAndAmbiguities.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No open clarification questions.</p>
          ) : (
            <div className="space-y-2.5 text-xs">
              {compiled.openQuestionsAndAmbiguities.map((q: any, idx: number) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="font-semibold text-slate-900">{q.description}</p>
                  <p className="text-slate-600 mt-1">
                    Answer / Resolution:{" "}
                    <strong>{q.userAnswer || "Pending Reviewer Answer"}</strong>
                  </p>
                  <p className="text-[11px] text-slate-400 italic mt-1">{q.citation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 6. Review Metrics */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>
            Approved items: <strong className="text-emerald-700">{compiled.metrics.totalApproved}</strong> |
            Rejected: <strong className="text-red-700 ml-1">{compiled.metrics.totalRejected}</strong> |
            Stale: <strong className="text-amber-700 ml-1">{compiled.metrics.totalStale}</strong>
          </div>
          <div>Review status verified</div>
        </div>
      </div>
    </div>
  );
};
