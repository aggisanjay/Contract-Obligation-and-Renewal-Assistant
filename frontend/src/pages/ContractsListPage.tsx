import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { listContracts, ContractListItem } from "../services/api.js";
import { FileText, PlusCircle, CheckCircle, Clock, ArrowRight } from "lucide-react";

export const ContractsListPage: React.FC = () => {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listContracts()
      .then((res) => setContracts(res.contracts))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contracts Repository</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage ingested contracts, review AI-extracted clauses with citations, and track obligations.
          </p>
        </div>

        <Link
          to="/upload"
          className="inline-flex items-center px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg shadow-2xs transition-colors"
        >
          <PlusCircle className="w-4 h-4 mr-1.5" />
          Upload New Contract
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-slate-500 font-medium">Loading contracts...</p>
        </div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-xl p-8">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No contracts uploaded yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Upload a text-based PDF, DOCX, or paste text to extract clauses, key dates, and obligations with source citations.
          </p>
          <Link
            to="/upload"
            className="mt-4 inline-flex items-center px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow-2xs"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
            Upload Contract
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contracts.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-md transition-shadow p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded">
                    v{c.latestVersionNumber}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 truncate" title={c.title}>
                  {c.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  Uploaded: {new Date(c.createdAt).toLocaleDateString()}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 text-slate-600">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{c.approvedCount} approved</span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-amber-700">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>{c.pendingCount} pending</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <Link
                  to={`/contracts/${c.id}`}
                  className="inline-flex items-center text-xs font-bold text-sky-600 hover:text-sky-800"
                >
                  Review Clauses
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>

                <Link
                  to={`/contracts/${c.id}/summary`}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Summary
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
