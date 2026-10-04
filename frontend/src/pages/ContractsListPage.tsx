import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { listContracts, deleteContract, ContractListItem } from "../services/api.js";
import { FileText, PlusCircle, CheckCircle, Clock, ArrowRight, Trash2, AlertTriangle, X } from "lucide-react";

export const ContractsListPage: React.FC = () => {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
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
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete contract");
    } finally {
      setDeleting(false);
    }
  };

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
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded">
                      v{c.latestVersionNumber}
                    </span>
                    <button
                      onClick={() => {
                        setContractToDelete(c);
                        setDeleteError(null);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      title="Delete contract"
                      aria-label={`Delete ${c.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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

                <div className="flex items-center space-x-3">
                  <Link
                    to={`/contracts/${c.id}/summary`}
                    className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                  >
                    Summary
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {contractToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">Delete Contract</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to delete <span className="font-semibold text-slate-800">"{contractToDelete.title}"</span>?
                </p>
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <p className="font-semibold">This action cannot be undone.</p>
                  <p className="mt-0.5 text-amber-700">
                    All document versions, extracted clauses, citations, deadline calculations, and audit history will be permanently deleted.
                  </p>
                </div>
                {deleteError && (
                  <p className="mt-2 text-xs text-rose-600 font-medium">{deleteError}</p>
                )}
              </div>
              <button
                onClick={() => setContractToDelete(null)}
                disabled={deleting}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setContractToDelete(null)}
                disabled={deleting}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
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

