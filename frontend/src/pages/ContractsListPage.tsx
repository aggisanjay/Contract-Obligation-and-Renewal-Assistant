import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { listContracts, deleteContract, ContractListItem } from "../services/api.js";
import {
  FileText,
  PlusCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Trash2,
  AlertTriangle,
  X,
  Search,
  Sparkles,
  Layers,
  ShieldCheck,
} from "lucide-react";

export const ContractsListPage: React.FC = () => {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [contractToDelete, setContractToDelete] = useState<ContractListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    listContracts()
      .then((res) => setContracts(res.contracts))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const confirmDelete = async () => {
    if (!contractToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteContract(contractToDelete.id);
      setContracts((prev) => prev.filter((c) => c.id !== contractToDelete.id));
      setContractToDelete(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete contract");
    } finally {
      setDeleting(false);
    }
  };

  const filteredContracts = useMemo(() => {
    if (!searchQuery.trim()) return contracts;
    return contracts.filter((c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [contracts, searchQuery]);

  const totalApproved = useMemo(
    () => contracts.reduce((acc, c) => acc + (c.approvedCount || 0), 0),
    [contracts]
  );
  const totalPending = useMemo(
    () => contracts.reduce((acc, c) => acc + (c.pendingCount || 0), 0),
    [contracts]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col">
      {/* Top Header & Metrics Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Contracts Repository
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">
              {contracts.length} {contracts.length === 1 ? "Contract" : "Contracts"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Enterprise legal information management. Review AI-extracted clauses with verbatim citations, manage versions, and calculate operational deadlines.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            to="/upload"
            className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-sm font-bold rounded-xl shadow-xs hover:shadow-glow-sky active:scale-95 transition-all"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Upload New Contract
          </Link>
        </div>
      </div>

      {/* Overview Stat Badges */}
      {!loading && contracts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Ingested</p>
              <p className="text-xl font-extrabold text-slate-900">{contracts.length} Contracts</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved Clauses</p>
              <p className="text-xl font-extrabold text-slate-900">{totalApproved} Verified</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Human Review</p>
              <p className="text-xl font-extrabold text-slate-900">{totalPending} Items</p>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      {!loading && contracts.length > 0 && (
        <div className="mb-6 flex items-center justify-between">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contracts by title..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs transition-all"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="ml-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Contracts Grid or Empty States */}
      {loading ? (
        <div className="text-center py-20 flex-1 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm text-slate-600 font-semibold">Loading contract repositories...</p>
        </div>
      ) : filteredContracts.length === 0 ? (
        <div className="text-center py-20 bg-white/70 backdrop-blur-xs border border-dashed border-slate-300 rounded-3xl p-10 max-w-2xl mx-auto my-auto shadow-2xs">
          <div className="w-16 h-16 rounded-2xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {contracts.length === 0 ? "No contracts uploaded yet" : "No matching contracts found"}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
            {contracts.length === 0
              ? "Upload a commercial contract in PDF, DOCX, or text format. The multi-pass AI will extract key clauses, terms, and obligations with exact verbatim citations."
              : `No contracts match "${searchQuery}". Clear your search query to see all contracts.`}
          </p>
          {contracts.length === 0 ? (
            <Link
              to="/upload"
              className="mt-6 inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs hover:shadow-glow-sky active:scale-95 transition-all"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Upload Your First Contract
            </Link>
          ) : (
            <button
              onClick={() => setSearchQuery("")}
              className="mt-4 px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50"
            >
              Reset Search Filter
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredContracts.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-card hover:shadow-card-hover hover:border-sky-200 transition-all p-6 flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100 text-sky-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="px-2.5 py-1 text-[11px] font-extrabold bg-slate-100/80 text-slate-700 border border-slate-200/70 rounded-lg">
                      v{c.latestVersionNumber}
                    </span>
                    <button
                      onClick={() => {
                        setContractToDelete(c);
                        setDeleteError(null);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete contract"
                      aria-label={`Delete ${c.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-900 group-hover:text-sky-600 transition-colors line-clamp-1" title={c.title}>
                  {c.title}
                </h3>
                <p className="text-[11px] font-medium text-slate-400 mt-1">
                  Uploaded: {new Date(c.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>

                {/* Progress Mini Status */}
                <div className="mt-5 p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 font-semibold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{c.approvedCount} Approved</span>
                  </div>
                  <div className="flex items-center space-x-1.5 font-semibold text-amber-800">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>{c.pendingCount} Pending</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <Link
                  to={`/contracts/${c.id}`}
                  className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-2xs hover:shadow-glow-sky active:scale-95 transition-all"
                >
                  Review Clauses
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Link>

                <Link
                  to={`/contracts/${c.id}/summary`}
                  className="inline-flex items-center px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  Summary
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {contractToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-start space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-2xs">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">Delete Contract</h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Are you sure you want to delete <span className="font-semibold text-slate-800">"{contractToDelete.title}"</span>?
                </p>
                <div className="mt-3 bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900">
                  <p className="font-bold flex items-center">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600 shrink-0" />
                    This action is permanent
                  </p>
                  <p className="mt-1 text-amber-800 leading-relaxed">
                    All document versions, extracted clauses, citations, deadline calculations, and audit history will be permanently deleted.
                  </p>
                </div>
                {deleteError && (
                  <p className="mt-2 text-xs text-rose-600 font-bold">{deleteError}</p>
                )}
              </div>
              <button
                onClick={() => setContractToDelete(null)}
                disabled={deleting}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setContractToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete Contract
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
