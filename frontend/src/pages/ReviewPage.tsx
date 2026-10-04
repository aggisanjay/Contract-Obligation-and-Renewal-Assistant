import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getContract,
  reviewItem,
  bulkApproveItems,
  getAuditLog,
  deleteContract,
  ContractDetailsResponse,
} from "../services/api.js";
import { ExtractedItem, AuditLog } from "@contract-assistant/shared";
import {
  CheckCircle,
  XCircle,
  Edit3,
  Calendar,
  AlertTriangle,
  History,
  CheckCheck,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

export const ReviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<ContractDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active section or quote highlighted in the left pane
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);

  // Category filter for right pane
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Audit log modal state
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Delete contract modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Item editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [editNote, setEditNote] = useState<string>("");

  // Clarification question answer state
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const [questionAnswer, setQuestionAnswer] = useState<string>("");

  // Date override state
  const [overridingDateId, setOverridingDateId] = useState<string | null>(null);
  const [newDateVal, setNewDateVal] = useState<string>("");

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getContract(id);
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load contract");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleCitationClick = (sectionLabel: string) => {
    // Scroll left pane to section
    const targetEl = sectionRefs.current[sectionLabel];
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedSectionId(sectionLabel);
      setTimeout(() => {
        setHighlightedSectionId(null);
      }, 3000);
    }
  };

  const handleApprove = async (item: ExtractedItem) => {
    if (!id) return;
    await reviewItem(id, item.id, "approve");
    loadData();
  };

  const handleReject = async (item: ExtractedItem) => {
    if (!id) return;
    await reviewItem(id, item.id, "reject");
    loadData();
  };

  const startEdit = (item: ExtractedItem) => {
    setEditingItemId(item.id);
    setEditText(item.currentValue);
    setEditNote("");
  };

  const saveEdit = async (item: ExtractedItem) => {
    if (!id) return;
    await reviewItem(id, item.id, "edit", editText, editNote);
    setEditingItemId(null);
    loadData();
  };

  const saveQuestionAnswer = async (item: ExtractedItem) => {
    if (!id) return;
    await reviewItem(id, item.id, "answer_question", questionAnswer);
    setAnsweringQuestionId(null);
    setQuestionAnswer("");
    loadData();
  };

  const saveDateOverride = async (item: ExtractedItem) => {
    if (!id) return;
    await reviewItem(id, item.id, "override_date", newDateVal);
    setOverridingDateId(null);
    setNewDateVal("");
    loadData();
  };

  const handleBulkApprove = async () => {
    if (!id || !data) return;
    // Only approved verified + confirmed items
    const eligibleItems = data.activeVersion.extractedItems.filter(
      (i) =>
        i.reviewStatus === "pending" &&
        i.status === "confirmed" &&
        i.citationVerified
    );
    if (eligibleItems.length === 0) return;

    await bulkApproveItems(
      id,
      eligibleItems.map((i) => i.id)
    );
    loadData();
  };

  const viewAuditLog = async () => {
    if (!id) return;
    const res = await getAuditLog(id);
    setAuditLogs(res.logs);
    setShowAuditModal(true);
  };

  const handleDeleteContract = async () => {
    if (!id) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteContract(id);
      navigate("/");
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete contract");
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium text-sm">Loading contract and extracted data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-red-900">Failed to Load Contract</h2>
          <p className="text-sm text-red-700 mt-1">{error || "Contract not found"}</p>
          <Link
            to="/"
            className="mt-4 inline-block px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
          >
            Back to Contracts
          </Link>
        </div>
      </div>
    );
  }

  const { contract, activeVersion } = data;
  const items = activeVersion.extractedItems;

  const filteredItems = items.filter((item) => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "parties") return item.itemType === "party" || item.itemType === "effective_date";
    if (categoryFilter === "term") return item.itemType === "expiry" || item.itemType === "renewal" || item.itemType === "termination" || item.itemType === "notice";
    if (categoryFilter === "obligations") return item.itemType === "obligation";
    if (categoryFilter === "ambiguities") return item.itemType === "ambiguity" || item.itemType === "conflict";
    if (categoryFilter === "questions") return item.itemType === "clarification_question";
    return true;
  });

  const pendingCount = items.filter((i) => i.reviewStatus === "pending").length;
  const eligibleBulkCount = items.filter(
    (i) => i.reviewStatus === "pending" && i.status === "confirmed" && i.citationVerified
  ).length;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100">
      {/* Top Contract Action Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold text-slate-900">{contract.title}</h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 rounded-md">
              v{activeVersion.versionNumber}
            </span>
            {activeVersion.pageCount && (
              <span className="text-xs text-slate-400">
                ({activeVersion.pageCount} pages)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {pendingCount} items pending review - {items.length} total extracted
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={viewAuditLog}
            className="inline-flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <History className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Audit Log ({activeVersion.auditLogs.length})
          </button>

          <Link
            to={`/contracts/${contract.id}/summary`}
            className="inline-flex items-center px-3 py-1.5 border border-sky-600 text-sky-600 rounded-lg text-xs font-semibold hover:bg-sky-50 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Reviewed Summary
          </Link>

          {eligibleBulkCount > 0 && (
            <button
              onClick={handleBulkApprove}
              className="inline-flex items-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
              title="Bulk approve all confirmed items with verified citations"
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
              Bulk Approve Verified ({eligibleBulkCount})
            </button>
          )}

          <button
            onClick={() => {
              setDeleteError(null);
              setShowDeleteModal(true);
            }}
            className="inline-flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-2xs"
            title="Delete this contract"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5 text-rose-500" />
            Delete Contract
          </button>
        </div>
      </div>

      {/* Main Split Screen */}
      <div className="flex-1 grid grid-cols-12 min-h-0 overflow-hidden">
        {/* Left Pane: Contract Sections */}
        <div className="col-span-6 border-r border-slate-200 bg-white overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-2">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Document Text & Sections
            </h2>
            <span className="text-xs text-slate-500">
              {activeVersion.sections.length} parsed clauses
            </span>
          </div>

          {activeVersion.sections.map((section) => {
            const isHighlighted = highlightedSectionId === section.label;
            return (
              <div
                key={section.id}
                ref={(el) => (sectionRefs.current[section.label] = el)}
                className={`p-4 rounded-xl border transition-all ${
                  isHighlighted
                    ? "border-amber-400 bg-amber-50/60 shadow-md ring-2 ring-amber-300 citation-target-highlight"
                    : "border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-800">
                      {section.label}
                    </span>
                    {section.heading && (
                      <span className="text-xs font-semibold text-slate-700">
                        {section.heading}
                      </span>
                    )}
                  </div>
                  {section.page && (
                    <span className="text-xs text-slate-400 font-mono">
                      Page {section.page}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-800 font-mono whitespace-pre-wrap leading-relaxed select-text">
                  {section.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Pane: Extracted Items */}
        <div className="col-span-6 bg-slate-50 overflow-y-auto p-6 flex flex-col min-h-0">
          {/* Category Tabs */}
          <div className="flex items-center space-x-1.5 pb-4 border-b border-slate-200 mb-4 overflow-x-auto shrink-0">
            {[
              { id: "all", label: `All (${items.length})` },
              { id: "parties", label: "Parties & Dates" },
              { id: "term", label: "Term & Renewal" },
              { id: "obligations", label: "Obligations" },
              { id: "ambiguities", label: "Ambiguities" },
              { id: "questions", label: "Clarifications" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  categoryFilter === cat.id
                    ? "bg-sky-600 text-white shadow-2xs font-semibold"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Items List */}
          <div className="space-y-4 flex-1">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No items match this category.
              </div>
            ) : (
              filteredItems.map((item) => {
                const isEditing = editingItemId === item.id;
                const isOverridingDate = overridingDateId === item.id;
                const isAnsweringQuestion = answeringQuestionId === item.id;

                let parsedVal: any = {};
                try {
                  parsedVal = JSON.parse(item.currentValue);
                } catch {
                  parsedVal = { text: item.currentValue };
                }

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 transition-shadow hover:shadow-xs"
                  >
                    {/* Item Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wide bg-slate-100 text-slate-700">
                          {item.itemType.replace("_", " ")}
                        </span>

                        {/* Status badge: Confirmed vs Uncertain */}
                        {item.status === "confirmed" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Confirmed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Uncertain (Inferred)
                          </span>
                        )}

                        {/* Review Status Badge */}
                        {item.reviewStatus === "approved" && (
                          <span className="px-2 py-0.5 text-xs rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                            Approved
                          </span>
                        )}
                        {item.reviewStatus === "edited_approved" && (
                          <span className="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                            User Edited & Approved
                          </span>
                        )}
                        {item.reviewStatus === "rejected" && (
                          <span className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-700 border border-red-200 font-medium">
                            Rejected
                          </span>
                        )}
                      </div>

                      {/* Citation Link */}
                      <button
                        onClick={() => handleCitationClick(item.sourceSectionLabel)}
                        className="text-xs font-semibold text-sky-600 hover:text-sky-800 flex items-center space-x-1 hover:underline"
                        title="Click to jump and highlight cited section"
                      >
                        <span>{item.sourceSectionLabel}</span>
                        {item.page && <span>(p.{item.page})</span>}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Citation Warnings */}
                    {!item.citationVerified && (
                      <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Citation Warning: </span>
                          {item.citationWarning || "Exact quote could not be verified in cited clause text."}
                        </div>
                      </div>
                    )}

                    {/* Uncertainty Reason */}
                    {item.uncertaintyReason && (
                      <p className="mt-2 text-xs text-amber-800 italic">
                        Reason: {item.uncertaintyReason}
                      </p>
                    )}

                    {/* Content Display / Inline Edit */}
                    <div className="mt-3 text-sm text-slate-800">
                      {isEditing ? (
                        <div className="space-y-2 mt-2">
                          <textarea
                            rows={3}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-md text-xs font-mono focus:ring-2 focus:ring-sky-500"
                          />
                          <input
                            type="text"
                            placeholder="Optional note describing your edit..."
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs"
                          />
                          <div className="flex space-x-2 justify-end">
                            <button
                              onClick={() => setEditingItemId(null)}
                              className="px-2.5 py-1 border border-slate-300 rounded text-xs text-slate-600"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(item)}
                              className="px-3 py-1 bg-sky-600 text-white rounded text-xs font-semibold"
                            >
                              Save & Approve
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs leading-relaxed">
                          {item.itemType === "obligation" && (
                            <div>
                              <p className="font-semibold text-slate-900">{parsedVal.description}</p>
                              <div className="mt-1 flex flex-wrap gap-2 text-slate-500">
                                <span>Party: <strong>{parsedVal.responsibleParty}</strong></span>
                                <span>Type: {parsedVal.obligationType}</span>
                                <span>Recurrence: {parsedVal.recurrence}</span>
                              </div>
                            </div>
                          )}

                          {item.itemType === "party" && (
                            <div>
                              <p className="font-bold text-slate-900">{parsedVal.name}</p>
                              <p className="text-slate-500">Role: {parsedVal.role}</p>
                              {parsedVal.address && <p className="text-slate-500">Address: {parsedVal.address}</p>}
                            </div>
                          )}

                          {item.itemType === "clarification_question" && (
                            <div>
                              <p className="font-semibold text-slate-900">{parsedVal.question}</p>
                              <p className="text-slate-500 mt-1">Target Clause: {parsedVal.targetClause}</p>
                              {parsedVal.userAnswer && (
                                <div className="mt-2 p-2 bg-sky-50 border border-sky-100 rounded text-sky-900">
                                  <strong>Reviewer Answer:</strong> {parsedVal.userAnswer}
                                </div>
                              )}
                            </div>
                          )}

                          {item.itemType !== "obligation" &&
                            item.itemType !== "party" &&
                            item.itemType !== "clarification_question" && (
                              <p className="font-medium text-slate-800">
                                {parsedVal.description || parsedVal.summary || JSON.stringify(parsedVal)}
                              </p>
                            )}

                          {/* Verbatim Quote */}
                          <div className="mt-2.5 pt-2 border-t border-slate-200 text-slate-500 italic">
                            "{item.exactQuote}"
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Date Details & Override */}
                    {(item.calculatedDate || item.manualDateOverride) && (
                      <div className="mt-3 flex items-center justify-between p-2.5 bg-sky-50/50 border border-sky-100 rounded-lg text-xs">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-3.5 h-3.5 text-sky-600" />
                          <span>
                            Deadline Date:{" "}
                            <strong>
                              {item.manualDateOverride || item.calculatedDate}
                            </strong>
                            {item.manualDateOverride && (
                              <span className="ml-1 text-amber-700 font-semibold">(Manually Overridden)</span>
                            )}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setOverridingDateId(item.id);
                            setNewDateVal(item.manualDateOverride || item.calculatedDate || "");
                          }}
                          className="text-xs text-sky-600 hover:underline font-semibold"
                        >
                          Override
                        </button>
                      </div>
                    )}

                    {/* Date Override Form */}
                    {isOverridingDate && (
                      <div className="mt-2 p-3 bg-white border border-sky-200 rounded-lg space-y-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          Set Override Date (YYYY-MM-DD):
                        </label>
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            placeholder="YYYY-MM-DD"
                            value={newDateVal}
                            onChange={(e) => setNewDateVal(e.target.value)}
                            className="px-2.5 py-1 text-xs border border-slate-300 rounded w-40"
                          />
                          <button
                            onClick={() => saveDateOverride(item)}
                            className="px-3 py-1 bg-sky-600 text-white rounded text-xs font-semibold"
                          >
                            Save Override
                          </button>
                          <button
                            onClick={() => setOverridingDateId(null)}
                            className="px-2.5 py-1 text-xs border border-slate-300 rounded text-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Clarification Question Answer Form */}
                    {item.itemType === "clarification_question" && (
                      <div className="mt-3">
                        {isAnsweringQuestion ? (
                          <div className="p-3 bg-white border border-sky-200 rounded-lg space-y-2">
                            <label className="block text-xs font-semibold text-slate-700">
                              Your Clarification / Answer:
                            </label>
                            <textarea
                              rows={2}
                              value={questionAnswer}
                              onChange={(e) => setQuestionAnswer(e.target.value)}
                              placeholder="Record factual understanding or party response..."
                              className="w-full p-2 border border-slate-300 rounded text-xs"
                            />
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => setAnsweringQuestionId(null)}
                                className="px-2.5 py-1 border border-slate-300 rounded text-xs text-slate-600"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveQuestionAnswer(item)}
                                className="px-3 py-1 bg-sky-600 text-white rounded text-xs font-semibold"
                              >
                                Record Answer
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAnsweringQuestionId(item.id);
                              setQuestionAnswer(parsedVal.userAnswer || "");
                            }}
                            className="inline-flex items-center text-xs font-semibold text-sky-600 hover:underline"
                          >
                            <MessageSquare className="w-3 h-3 mr-1" />
                            {parsedVal.userAnswer ? "Edit Answer" : "Answer Question"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleApprove(item)}
                          disabled={item.reviewStatus === "approved"}
                          className={`inline-flex items-center px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            item.reviewStatus === "approved"
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white"
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          Approve
                        </button>

                        <button
                          onClick={() => handleReject(item)}
                          disabled={item.reviewStatus === "rejected"}
                          className={`inline-flex items-center px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            item.reviewStatus === "rejected"
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                              : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                          }`}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Reject
                        </button>
                      </div>

                      <button
                        onClick={() => startEdit(item)}
                        className="inline-flex items-center px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                      >
                        <Edit3 className="w-3 h-3 mr-1" />
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-slate-700" />
                <h3 className="text-base font-bold text-slate-900">Contract Review Audit Trail</h3>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 mt-4 space-y-3">
              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No audit records found.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {log.actor} - <span className="font-mono">{log.action}</span>
                      </span>
                      <span className="text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.note && <p className="text-slate-600">Note: {log.note}</p>}
                    {log.oldValue && (
                      <div className="text-slate-500 font-mono text-[11px] truncate">
                        Old: {log.oldValue}
                      </div>
                    )}
                    {log.newValue && (
                      <div className="text-slate-700 font-mono text-[11px] truncate">
                        New: {log.newValue}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">Delete Contract</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to delete <span className="font-semibold text-slate-800">"{contract.title}"</span>?
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
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteContract}
                disabled={isDeleting}
                className="inline-flex items-center px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
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
