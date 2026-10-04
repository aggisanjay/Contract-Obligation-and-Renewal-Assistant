import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getContract,
  reviewItem,
  bulkApproveItems,
  getAuditLog,
  deleteContract,
  resolveStaleItem,
  retryExtractionStep,
  ContractDetailsResponse,
} from "../services/api.js";
import { UploadVersionModal } from "../components/UploadVersionModal.js";
import { VersionDiffModal } from "../components/VersionDiffModal.js";

interface ParsedItemPayload {
  name?: string;
  role?: string;
  effectiveDate?: string;
  expirationDate?: string;
  description?: string;
  obligor?: string;
  question?: string;
  options?: string[];
  userAnswer?: string;
  text?: string;
  [key: string]: unknown;
}
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
  Upload,
  Split,
  RefreshCw,
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

  // Versioning state
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [showUploadVersionModal, setShowUploadVersionModal] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [staleNotes, setStaleNotes] = useState<Record<string, string>>({});
  const [resolvingStaleId, setResolvingStaleId] = useState<string | null>(null);

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

  const loadData = async (targetVersion?: number) => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getContract(id, targetVersion);
      setData(res);
      setSelectedVersion(res.activeVersion.versionNumber);
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
    loadData(selectedVersion || undefined);
  };

  const handleReject = async (item: ExtractedItem) => {
    if (!id) return;
    await reviewItem(id, item.id, "reject");
    loadData(selectedVersion || undefined);
  };

  const handleResolveStale = async (itemId: string, action: "reconfirm" | "dismiss") => {
    if (!id) return;
    try {
      setResolvingStaleId(itemId);
      const note = staleNotes[itemId] || "";
      await resolveStaleItem(id, itemId, action, note);
      setStaleNotes((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      loadData(selectedVersion || undefined);
    } catch (err: any) {
      alert(err?.message || "Failed to resolve stale item");
    } finally {
      setResolvingStaleId(null);
    }
  };

  const STEP_ID_MAP: Record<string, string> = {
    parties: "parties_and_effective_date",
    term: "term_and_renewal",
    obligations: "obligations",
    ambiguities: "ambiguities_and_conflicts",
    questions: "clarification_questions",
  };

  const [isRetryingStep, setIsRetryingStep] = useState(false);

  const handleRetryCategoryStep = async (stepName: string) => {
    if (!id) return;
    try {
      setIsRetryingStep(true);
      await retryExtractionStep(id, stepName);
      await loadData(selectedVersion || undefined);
    } catch (err: any) {
      alert(err?.message || `Failed to retry step ${stepName}`);
    } finally {
      setIsRetryingStep(false);
    }
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
    loadData(selectedVersion || undefined);
  };

  const saveQuestionAnswer = async (item: ExtractedItem) => {
    if (!id) return;
    await reviewItem(id, item.id, "answer_question", questionAnswer);
    setAnsweringQuestionId(null);
    setQuestionAnswer("");
    loadData(selectedVersion || undefined);
  };

  const saveDateOverride = async (item: ExtractedItem) => {
    if (!id) return;
    await reviewItem(id, item.id, "override_date", newDateVal);
    setOverridingDateId(null);
    setNewDateVal("");
    loadData(selectedVersion || undefined);
  };

  const handleBulkApprove = async () => {
    if (!id || !data) return;
    // Only approved verified + confirmed items
    const eligibleItems = data.activeVersion.extractedItems.filter(
      (i) => i.reviewStatus === "pending" && i.status === "confirmed" && i.citationVerified
    );

    if (eligibleItems.length === 0) return;

    await bulkApproveItems(
      id,
      eligibleItems.map((i) => i.id)
    );
    loadData(selectedVersion || undefined);
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
  const staleItems = items.filter((i) => i.reviewStatus === "stale");

  const filteredItems = items.filter((item) => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "stale") return item.reviewStatus === "stale";
    if (categoryFilter === "parties") return item.itemType === "party" || item.itemType === "effective_date";
    if (categoryFilter === "term")
      return (
        item.itemType === "expiry" ||
        item.itemType === "renewal" ||
        item.itemType === "termination" ||
        item.itemType === "notice"
      );
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
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100/70">
      {/* Top Contract Action Bar */}
      <div className="backdrop-blur-md bg-white/90 border-b border-slate-200/90 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs shrink-0">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">{contract.title}</h1>

            {/* Version Switcher Dropdown */}
            <div className="flex items-center space-x-1.5 bg-slate-100/80 px-2.5 py-1 rounded-xl border border-slate-200/80">
              <label htmlFor="versionSelect" className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                Version:
              </label>
              <select
                id="versionSelect"
                value={activeVersion.versionNumber}
                onChange={(e) => loadData(parseInt(e.target.value, 10))}
                className="text-xs font-extrabold bg-transparent text-slate-800 focus:outline-none cursor-pointer"
              >
                {data.allVersions.map((v) => (
                  <option key={v.id} value={v.versionNumber}>
                    v{v.versionNumber} {v.versionNumber === contract.totalVersions ? "(Latest)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {activeVersion.versionNumber < contract.totalVersions && (
              <span className="px-2.5 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300/80 rounded-lg shadow-2xs">
                Viewing Historical v{activeVersion.versionNumber}
              </span>
            )}

            {activeVersion.pageCount && (
              <span className="text-xs font-medium text-slate-400">({activeVersion.pageCount} pages)</span>
            )}
          </div>

          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {pendingCount} items pending review &bull; {items.length} total in v{activeVersion.versionNumber}
            {contract.totalVersions > 1 && ` &bull; ${contract.totalVersions} total versions`}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Upload New Version Button */}
          <button
            onClick={() => setShowUploadVersionModal(true)}
            className="inline-flex items-center px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 shadow-2xs hover:shadow-xs active:scale-95 transition-all"
            title="Upload an updated version of this contract (v2, v3, etc.)"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Upload New Version
          </button>

          {/* Compare Versions Button (if >= 2 versions) */}
          {contract.totalVersions >= 2 && (
            <button
              onClick={() => setShowDiffModal(true)}
              className="inline-flex items-center px-3.5 py-2 border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold shadow-2xs active:scale-95 transition-all"
              title="Compare section-by-section diffs between versions"
            >
              <Split className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
              Compare Versions
            </button>
          )}

          <button
            onClick={viewAuditLog}
            className="inline-flex items-center px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 shadow-2xs active:scale-95 transition-all"
          >
            <History className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Audit Log ({activeVersion.auditLogs.length})
          </button>

          <Link
            to={`/contracts/${contract.id}/summary`}
            className="inline-flex items-center px-3.5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-glow-sky active:scale-95 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-sky-200" />
            Reviewed Summary
          </Link>

          {eligibleBulkCount > 0 && (
            <button
              onClick={handleBulkApprove}
              className="inline-flex items-center px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-glow-emerald active:scale-95 transition-all"
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
            className="inline-flex items-center px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 hover:border-rose-200 shadow-2xs active:scale-95 transition-all"
            title="Delete this contract"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5 text-rose-500" />
            Delete Contract
          </button>
        </div>
      </div>

      {/* Stale Items Banner (High Priority Alert) */}
      {staleItems.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-white px-6 py-3 flex items-center justify-between text-xs shadow-xs shrink-0 animate-in fade-in duration-200 border-b border-amber-600">
          <div className="flex items-center space-x-2.5">
            <div className="w-6 h-6 rounded-lg bg-amber-400/40 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-xs sm:text-sm">
              Stale Clause Alert: {staleItems.length} item{staleItems.length > 1 ? "s" : ""} from prior version{" "}
              {staleItems.length > 1 ? "have" : "has"} modified or missing underlying clauses in v
              {activeVersion.versionNumber}.
            </span>
            <span className="text-amber-100 text-xs hidden md:inline font-medium">
              &bull; Re-confirm or dismiss these items before compiling the contract summary.
            </span>
          </div>
          <button
            onClick={() => setCategoryFilter("stale")}
            className="px-3.5 py-1.5 bg-white text-amber-900 font-extrabold rounded-xl hover:bg-amber-50 active:scale-95 transition-all shadow-2xs text-xs shrink-0 ml-3"
          >
            Review Stale Items ({staleItems.length})
          </button>
        </div>
      )}

      {/* Main Split Screen */}
      <div className="flex-1 grid grid-cols-12 min-h-0 overflow-hidden">
        {/* Left Pane: Contract Sections */}
        <div className="col-span-6 border-r border-slate-200/80 bg-slate-50/30 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 mb-2">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-heading">
                Document Text & Sections (v{activeVersion.versionNumber})
              </h2>
            </div>
            <span className="text-xs font-medium text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200/80 shadow-2xs">
              {activeVersion.sections.length} parsed clauses
            </span>
          </div>

          {activeVersion.sections.map((section) => {
            const isHighlighted = highlightedSectionId === section.label;
            return (
              <div
                key={section.id}
                ref={(el) => {
                  sectionRefs.current[section.label] = el;
                }}
                className={`p-5 rounded-2xl border transition-all ${
                  isHighlighted
                    ? "bg-amber-50/80 border-amber-400 ring-4 ring-amber-400/20 shadow-glow-amber scale-[1.005]"
                    : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-2xs"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span className="font-bold text-slate-900 font-heading">
                    {section.label} {section.heading ? `— ${section.heading}` : ""}
                  </span>
                  {section.page && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold border border-slate-200/70">
                      Page {section.page}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-mono bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                  {section.text}
                </p>
              </div>
            );
          })}
        </div>

        {/* Right Pane: Extracted Items */}
        <div className="col-span-6 bg-slate-50/50 overflow-y-auto p-6 flex flex-col min-h-0">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/60 backdrop-blur-xs rounded-2xl border border-slate-200/80 mb-5 overflow-x-auto shrink-0 shadow-inner">
            {[
              { id: "all", label: `All (${items.length})` },
              ...(staleItems.length > 0
                ? [{ id: "stale", label: `⚠️ Stale / Changed (${staleItems.length})`, isAlert: true }]
                : []),
              { id: "parties", label: "Parties & Dates" },
              { id: "term", label: "Term & Renewal" },
              { id: "obligations", label: "Obligations" },
              { id: "ambiguities", label: "Ambiguities" },
              { id: "questions", label: "Clarifications" },
            ].map((cat: { id: string; label: string; isAlert?: boolean }) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  categoryFilter === cat.id
                    ? cat.isAlert
                      ? "bg-amber-500 text-white shadow-xs font-bold"
                      : "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold"
                    : cat.isAlert
                    ? "text-amber-800 hover:bg-amber-100/80 font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Items List */}
          <div className="space-y-4 flex-1">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm bg-white rounded-2xl border border-slate-200/80 p-8 shadow-card">
                <p className="font-bold text-slate-800 font-heading">No items found in this category.</p>
                <p className="text-xs text-slate-400 mt-1 mb-5">
                  You can retry the targeted extraction pass for this category without re-running the entire contract.
                </p>
                {categoryFilter in STEP_ID_MAP && (
                  <button
                    onClick={() => handleRetryCategoryStep(STEP_ID_MAP[categoryFilter])}
                    disabled={isRetryingStep}
                    className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-glow-sky transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isRetryingStep ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Running Extraction Pass...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-2" />
                        Retry Pass: {categoryFilter.replace("_", " ")}
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item) => {
                const isEditing = editingItemId === item.id;
                const isOverridingDate = overridingDateId === item.id;
                const isAnsweringQuestion = answeringQuestionId === item.id;
                const isStale = item.reviewStatus === "stale";

                let parsedVal: ParsedItemPayload = {};
                try {
                  const parsed = JSON.parse(item.currentValue);
                  if (typeof parsed === "object" && parsed !== null) {
                    parsedVal = parsed as ParsedItemPayload;
                  } else {
                    parsedVal = { text: item.currentValue };
                  }
                } catch {
                  parsedVal = { text: item.currentValue };
                }

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-2xl border transition-all p-5 shadow-card hover:shadow-card-hover ${
                      isStale ? "border-amber-300 bg-amber-50/20" : "border-slate-200/90"
                    }`}
                  >
                    {/* Item Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg uppercase tracking-wider bg-slate-100 text-slate-700 font-heading">
                          {item.itemType.replace("_", " ")}
                        </span>

                        {/* Status badge: Confirmed vs Uncertain */}
                        {item.status === "confirmed" ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                            Confirmed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/70">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
                            Uncertain (Inferred)
                          </span>
                        )}

                        {/* Review Status Badge */}
                        {item.reviewStatus === "stale" && (
                          <span className="px-2.5 py-1 text-xs rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold flex items-center shadow-2xs">
                            <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                            Stale - Action Required
                          </span>
                        )}
                        {item.reviewStatus === "approved" && (
                          <span className="px-2.5 py-1 text-xs rounded-lg bg-sky-50 text-sky-700 border border-sky-200/70 font-semibold flex items-center">
                            <CheckCircle className="w-3 h-3 mr-1 text-sky-600" />
                            Approved
                          </span>
                        )}
                        {item.reviewStatus === "edited_approved" && (
                          <span className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/70 font-semibold flex items-center">
                            <CheckCircle className="w-3 h-3 mr-1 text-indigo-600" />
                            User Edited & Approved
                          </span>
                        )}
                        {item.reviewStatus === "rejected" && (
                          <span className="px-2.5 py-1 text-xs rounded-lg bg-rose-50 text-rose-700 border border-rose-200/70 font-semibold flex items-center">
                            <XCircle className="w-3 h-3 mr-1 text-rose-600" />
                            Rejected
                          </span>
                        )}
                      </div>

                      {/* Citation Link */}
                      <button
                        onClick={() => handleCitationClick(item.sourceSectionLabel)}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-sky-50/70 hover:bg-sky-100 text-sky-700 border border-sky-200/70 text-xs font-bold font-mono transition-colors group"
                        title="Click to jump and highlight cited section"
                      >
                        <span>{item.sourceSectionLabel}</span>
                        {item.page && <span className="text-sky-600/80">(p.{item.page})</span>}
                        <ExternalLink className="w-3 h-3 transition-transform group-hover:scale-110" />
                      </button>
                    </div>

                    {/* Stale Clause Banner within Card */}
                    {isStale && (
                      <div className="mt-3.5 p-3.5 bg-amber-50/90 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-2 shadow-2xs">
                        <div className="font-bold flex items-center text-amber-800">
                          <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-600 shrink-0" />
                          Clause Modified in New Version:{" "}
                          <span className="ml-1 font-mono font-normal bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200">
                            {item.staleReason || "clause changed"}
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800/90 leading-relaxed">
                          This obligation or deadline was approved in prior version, but the text of its underlying section changed. Please re-confirm if the item still applies or dismiss it.
                        </p>
                        <div className="pt-1">
                          <input
                            type="text"
                            value={staleNotes[item.id] || ""}
                            onChange={(e) =>
                              setStaleNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            placeholder="Optional audit rationale (e.g. verified still applies under Section 2.1)..."
                            className="w-full text-xs p-2.5 bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-sans shadow-inner"
                          />
                        </div>
                      </div>
                    )}

                    {/* Citation Warnings */}
                    {!item.citationVerified && !isStale && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Citation Warning: </span>
                          {item.citationWarning || "Exact quote could not be verified in cited clause text."}
                        </div>
                      </div>
                    )}

                    {/* Verbatim Source Quote */}
                    <div className="mt-3.5 bg-gradient-to-r from-slate-50/90 to-white border-l-4 border-l-sky-500 border-y border-r border-slate-200/70 rounded-r-xl p-3.5 text-xs shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 font-heading">
                        Exact Verbatim Quote
                      </span>
                      <p className="font-mono text-slate-800 italic leading-relaxed">"{item.exactQuote}"</p>
                    </div>

                    {/* Item Value Content */}
                    <div className="mt-3.5">
                      {isEditing ? (
                        <div className="space-y-2.5 bg-slate-50/60 p-4 rounded-xl border border-slate-200">
                          <textarea
                            rows={3}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full text-xs font-mono p-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none shadow-inner"
                          />
                          <input
                            type="text"
                            placeholder="Reason for change (recorded in audit log)..."
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none shadow-inner"
                          />
                          <div className="flex justify-end space-x-2 pt-1">
                            <button
                              onClick={() => setEditingItemId(null)}
                              className="px-3.5 py-1.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(item)}
                              className="px-4 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-glow-sky transition-all active:scale-95"
                            >
                              Save Edit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-800 space-y-1.5 bg-slate-50/40 p-3 rounded-xl border border-slate-100">
                          {parsedVal.name && (
                            <p>
                              <span className="font-semibold text-slate-500">Party: </span>
                              <span className="font-bold text-slate-900">{parsedVal.name}</span>
                            </p>
                          )}
                          {parsedVal.effectiveDate && (
                            <p>
                              <span className="font-semibold text-slate-500">Effective Date: </span>
                              <span className="font-mono font-bold text-slate-900">{parsedVal.effectiveDate}</span>
                            </p>
                          )}
                          {parsedVal.expirationDate && (
                            <p>
                              <span className="font-semibold text-slate-500">Expiration Date: </span>
                              <span className="font-mono font-bold text-slate-900">{parsedVal.expirationDate}</span>
                            </p>
                          )}
                          {parsedVal.description && (
                            <p>
                              <span className="font-semibold text-slate-500">Description: </span>
                              <span className="text-slate-800">{parsedVal.description}</span>
                            </p>
                          )}
                          {parsedVal.obligor && (
                            <p>
                              <span className="font-semibold text-slate-500">Responsible Party: </span>
                              <span className="font-bold text-slate-900">{parsedVal.obligor}</span>
                            </p>
                          )}
                          {parsedVal.question && (
                            <div className="p-3.5 bg-sky-50/70 border border-sky-100 rounded-xl text-sky-950 mt-2">
                              <p className="font-bold text-sky-900 mb-1.5 flex items-center font-heading">
                                <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
                                Clarification Needed:
                              </p>
                              <p className="text-slate-800 leading-relaxed">{parsedVal.question}</p>
                              {Array.isArray(parsedVal.options) && (
                                <ul className="list-disc pl-5 mt-2 space-y-1 text-sky-900 font-medium">
                                  {parsedVal.options.map((opt: string, i: number) => (
                                    <li key={i}>{opt}</li>
                                  ))}
                                </ul>
                              )}
                              {parsedVal.userAnswer && (
                                <p className="mt-2.5 text-xs font-bold text-sky-900 bg-sky-100/70 p-2 rounded-lg border border-sky-200/60">
                                  Recorded Decision: {String(parsedVal.userAnswer)}
                                </p>
                              )}
                            </div>
                          )}
                          {!parsedVal.name &&
                            !parsedVal.description &&
                            !parsedVal.effectiveDate &&
                            !parsedVal.question && (
                              <pre className="text-[11px] font-mono bg-white p-2.5 rounded-lg border border-slate-200 overflow-x-auto text-slate-800">
                                {item.currentValue}
                              </pre>
                            )}
                        </div>
                      )}
                    </div>

                    {/* Calculated Dates & Override Box */}
                    {item.calculatedDate && (
                      <div className="mt-3.5 p-3 bg-gradient-to-r from-sky-50/50 to-slate-50 border border-sky-100/80 rounded-xl flex items-center justify-between text-xs shadow-2xs">
                        <div className="flex items-center space-x-2.5">
                          <Calendar className="w-4 h-4 text-sky-600 shrink-0" />
                          <div>
                            <span className="font-semibold text-slate-600">Calculated Deadline: </span>
                            <span className="font-mono text-slate-900 font-bold bg-white px-2 py-0.5 rounded border border-slate-200/70 ml-1">
                              {new Date(item.calculatedDate).toLocaleDateString()}
                            </span>
                            {item.dateResolutionReason && (
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                {item.dateResolutionReason}
                              </span>
                            )}
                          </div>
                        </div>

                        {isOverridingDate ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="date"
                              value={newDateVal}
                              onChange={(e) => setNewDateVal(e.target.value)}
                              className="p-1.5 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            />
                            <button
                              onClick={() => saveDateOverride(item)}
                              className="px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setOverridingDateId(null)}
                              className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setOverridingDateId(item.id);
                              setNewDateVal(item.calculatedDate?.split("T")[0] || "");
                            }}
                            className="text-xs font-bold text-sky-600 hover:text-sky-800 hover:underline px-2.5 py-1 rounded-lg hover:bg-sky-50/80 transition-colors"
                          >
                            Override Date
                          </button>
                        )}
                      </div>
                    )}

                    {/* Clarification Answer Interface */}
                    {item.itemType === "clarification_question" && (
                      <div className="mt-3.5">
                        {isAnsweringQuestion ? (
                          <div className="space-y-2.5 bg-sky-50/40 p-3.5 rounded-xl border border-sky-100">
                            <textarea
                              rows={2}
                              value={questionAnswer}
                              onChange={(e) => setQuestionAnswer(e.target.value)}
                              placeholder="Record factual understanding or party response..."
                              className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            />
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => setAnsweringQuestionId(null)}
                                className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveQuestionAnswer(item)}
                                className="px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
                              >
                                Record Answer
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAnsweringQuestionId(item.id);
                              setQuestionAnswer(
                                typeof parsedVal.userAnswer === "string" ? parsedVal.userAnswer : ""
                              );
                            }}
                            className="inline-flex items-center text-xs font-bold text-sky-600 hover:text-sky-800 hover:underline px-2 py-1 rounded-lg hover:bg-sky-50/80 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                            {parsedVal.userAnswer ? "Edit Answer" : "Answer Question"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                      {isStale ? (
                        /* Stale Item Actions: Re-confirm or Dismiss */
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleResolveStale(item.id, "reconfirm")}
                              disabled={resolvingStaleId === item.id}
                              className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs hover:shadow-glow-emerald active:scale-95 transition-all"
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                              Re-confirm (Keep Approved)
                            </button>

                            <button
                              onClick={() => handleResolveStale(item.id, "dismiss")}
                              disabled={resolvingStaleId === item.id}
                              className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 active:scale-95 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1.5" />
                              Dismiss (Mark Rejected)
                            </button>
                          </div>

                          <button
                            onClick={() => startEdit(item)}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200/90 rounded-xl hover:bg-slate-100 active:scale-95 transition-all shadow-2xs"
                          >
                            <Edit3 className="w-3 h-3 mr-1.5" />
                            Edit Value First
                          </button>
                        </div>
                      ) : (
                        /* Normal Item Actions: Approve, Reject, Edit */
                        <>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleApprove(item)}
                              disabled={item.reviewStatus === "approved"}
                              className={`inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-xs ${
                                item.reviewStatus === "approved"
                                  ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                                  : "bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-glow-emerald"
                              }`}
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                              Approve
                            </button>

                            <button
                              onClick={() => handleReject(item)}
                              disabled={item.reviewStatus === "rejected"}
                              className={`inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border ${
                                item.reviewStatus === "rejected"
                                  ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 hover:border-rose-300"
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1.5" />
                              Reject
                            </button>
                          </div>

                          <button
                            onClick={() => startEdit(item)}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200/90 rounded-xl hover:bg-slate-100 active:scale-95 transition-all shadow-2xs"
                          >
                            <Edit3 className="w-3 h-3 mr-1.5" />
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Upload New Version Modal */}
      <UploadVersionModal
        contractId={contract.id}
        contractTitle={contract.title}
        latestVersionNumber={contract.totalVersions}
        isOpen={showUploadVersionModal}
        onClose={() => setShowUploadVersionModal(false)}
        onSuccess={(newVer) => {
          loadData(newVer);
        }}
      />

      {/* Version Diff Modal */}
      <VersionDiffModal
        contractId={contract.id}
        contractTitle={contract.title}
        availableVersions={data.allVersions}
        defaultV1={activeVersion.versionNumber > 1 ? activeVersion.versionNumber - 1 : 1}
        defaultV2={activeVersion.versionNumber}
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
      />

      {/* Audit Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-slate-700" />
                <h3 className="text-base font-bold text-slate-900">Contract Review Audit Trail</h3>
              </div>
              <button onClick={() => setShowAuditModal(false)} className="text-slate-400 hover:text-slate-600">
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
                      <div className="text-slate-500 font-mono text-[11px] truncate">Old: {log.oldValue}</div>
                    )}
                    {log.newValue && (
                      <div className="text-slate-700 font-mono text-[11px] truncate">New: {log.newValue}</div>
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
                {deleteError && <p className="mt-2 text-xs text-rose-600 font-medium">{deleteError}</p>}
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
