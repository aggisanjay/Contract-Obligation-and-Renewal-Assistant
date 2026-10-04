import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { uploadContract, retryExtractionStep } from "../services/api.js";
import {
  Upload,
  AlertCircle,
  Loader2,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FileCheck,
  BookOpen,
} from "lucide-react";

interface PipelineStep {
  id: string;
  name: string;
  description: string;
  status: "waiting" | "active" | "completed" | "error";
  error?: string;
}

const INITIAL_PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "parties_and_effective_date",
    name: "Pass 1: Parties & Effective Date",
    description: "Extracting legal contracting entities, corporate roles, and effective date with verbatim citations",
    status: "waiting",
  },
  {
    id: "term_and_renewal",
    name: "Pass 2: Term, Expiry & Renewal Deadlines",
    description: "Identifying initial term duration, renewal mechanisms, and mandatory advance notice windows",
    status: "waiting",
  },
  {
    id: "obligations",
    name: "Pass 3: Operational Obligations & Deliverables",
    description: "Structuring operational obligations, milestones, payment terms, and assigned parties",
    status: "waiting",
  },
  {
    id: "ambiguities_and_conflicts",
    name: "Pass 4: Ambiguities, Contradictions & Policy Gaps",
    description: "Comparing clauses against internal policy standards to flag conflicting terms or vague standards",
    status: "waiting",
  },
  {
    id: "clarification_questions",
    name: "Pass 5: Neutral Clarification Questions",
    description: "Formulating objective multiple-choice questions for human operator resolution",
    status: "waiting",
  },
];

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];

function validateFile(file: File): string | null {
  if (file.size > 10 * 1024 * 1024) {
    return `File "${file.name}" exceeds the 10 MB maximum allowed size (${(file.size / (1024 * 1024)).toFixed(1)} MB).`;
  }
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Unsupported file format for "${file.name}". Supported formats: PDF (.pdf), Word document (.docx), or plain text (.txt).`;
  }
  return null;
}

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [contractMode, setContractMode] = useState<"file" | "paste">("file");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractText, setContractText] = useState("");

  const [policyMode, setPolicyMode] = useState<"file" | "paste">("file");
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [policyText, setPolicyText] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 5-Pass Pipeline Stepper State
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_PIPELINE_STEPS);
  const [createdContractId, setCreatedContractId] = useState<string | null>(null);
  const [hasStepErrors, setHasStepErrors] = useState(false);
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null);

  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, []);

  const handleContractFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const error = validateFile(file);
      if (error) {
        setErrorMessage(error);
        return;
      }
      setContractFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
      setErrorMessage(null);
    }
  };

  const handlePolicyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const error = validateFile(file);
      if (error) {
        setErrorMessage(error);
        return;
      }
      setPolicyFile(file);
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (contractMode === "file") {
      if (!contractFile) {
        setErrorMessage("Please select a contract file (.pdf, .docx, or .txt).");
        return;
      }
      const fileError = validateFile(contractFile);
      if (fileError) {
        setErrorMessage(fileError);
        return;
      }
    } else {
      if (!contractText.trim()) {
        setErrorMessage("Please paste the contract text before proceeding.");
        return;
      }
    }

    if (policyMode === "file" && policyFile) {
      const polError = validateFile(policyFile);
      if (polError) {
        setErrorMessage(polError);
        return;
      }
    }

    // Start loading stepper
    setLoading(true);
    setHasStepErrors(false);
    setCreatedContractId(null);

    // Initialize stepper: Step 1 active, others waiting
    setSteps(
      INITIAL_PIPELINE_STEPS.map((s, idx) => ({
        ...s,
        status: idx === 0 ? "active" : "waiting",
      }))
    );

    // Progress visual stepper while backend pipeline executes
    let currentStepIdx = 0;
    stepTimerRef.current = setInterval(() => {
      currentStepIdx++;
      if (currentStepIdx < INITIAL_PIPELINE_STEPS.length) {
        setSteps((prev) =>
          prev.map((s, idx) => {
            if (idx < currentStepIdx) return { ...s, status: "completed" };
            if (idx === currentStepIdx) return { ...s, status: "active" };
            return { ...s, status: "waiting" };
          })
        );
      }
    }, 1200);

    try {
      const formData = new FormData();
      formData.append("title", title || "Untitled Contract");

      if (contractMode === "file" && contractFile) {
        formData.append("contract", contractFile);
      } else {
        formData.append("contractText", contractText);
      }

      if (policyMode === "file" && policyFile) {
        formData.append("policy", policyFile);
      } else if (policyMode === "paste" && policyText.trim()) {
        formData.append("policyText", policyText);
      }

      const result = await uploadContract(formData);

      if (stepTimerRef.current) clearInterval(stepTimerRef.current);

      setCreatedContractId(result.contractId);

      // Check if any steps encountered errors
      if (result.stepErrors && result.stepErrors.length > 0) {
        const errorMap = new Map(result.stepErrors.map((se) => [se.step, se.error]));
        setHasStepErrors(true);
        setSteps((prev) =>
          prev.map((s) => {
            if (errorMap.has(s.id)) {
              return { ...s, status: "error", error: errorMap.get(s.id) };
            }
            return { ...s, status: "completed" };
          })
        );
      } else {
        // All passes succeeded!
        setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
        setTimeout(() => {
          navigate(`/contracts/${result.contractId}`);
        }, 800);
      }
    } catch (err: any) {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setLoading(false);
      setErrorMessage(err.message || "Failed to process and extract contract.");
    }
  };

  const handleRetryStep = async (stepId: string) => {
    if (!createdContractId) return;
    try {
      setRetryingStepId(stepId);
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, status: "active", error: undefined } : s))
      );

      const res = await retryExtractionStep(createdContractId, stepId);

      if (res.stepErrors && res.stepErrors.length > 0) {
        const errObj = res.stepErrors.find((e) => e.step === stepId);
        setSteps((prev) =>
          prev.map((s) =>
            s.id === stepId
              ? { ...s, status: "error", error: errObj?.error || "Retry failed." }
              : s
          )
        );
      } else {
        setSteps((prev) =>
          prev.map((s) => (s.id === stepId ? { ...s, status: "completed", error: undefined } : s))
        );
      }
    } catch (err: any) {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId ? { ...s, status: "error", error: err?.message || "Failed to retry step." } : s
        )
      );
    } finally {
      setRetryingStepId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 relative flex-1 flex flex-col justify-center">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200 uppercase tracking-wider">
            Ingestion & Extraction
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
          Upload Contract for Extraction
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a digital contract (PDF, DOCX, or text) and optionally an organizational policy document to cross-check terms with verbatim citations.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-3 text-sm text-rose-800 shadow-2xs animate-in fade-in duration-150">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Validation error: </span>
            {errorMessage}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Contract Title */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-card">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
            Contract Title / Identifier
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Master Cloud Services Agreement with Acme Corp"
            className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:bg-white shadow-2xs transition-all"
          />
        </div>

        {/* Primary Contract Input */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900">Contract Document</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide bg-sky-50 text-sky-700 border border-sky-200">
                  Required
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Text-based PDF, DOCX, or plain text (Max 10 MB)</p>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-100/80 text-xs font-bold">
              <button
                type="button"
                onClick={() => setContractMode("file")}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  contractMode === "file" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setContractMode("paste")}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  contractMode === "paste" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Paste Text
              </button>
            </div>
          </div>

          {contractMode === "file" ? (
            <div className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-2xl p-8 text-center transition-all bg-gradient-to-b from-slate-50/50 to-white group">
              <input
                type="file"
                id="contract-file-input"
                accept=".pdf,.docx,.txt"
                onChange={handleContractFileChange}
                className="hidden"
              />
              <label htmlFor="contract-file-input" className="cursor-pointer block">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center mx-auto mb-3.5 group-hover:scale-105 transition-transform shadow-2xs">
                  <Upload className="w-6 h-6" />
                </div>
                {contractFile ? (
                  <div className="text-sm">
                    <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-sky-50 text-sky-800 rounded-lg border border-sky-200 font-bold">
                      <FileCheck className="w-4 h-4 text-sky-600" />
                      <span>{contractFile.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 font-medium">
                      {(contractFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Click to choose another file
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm font-bold text-sky-600 group-hover:text-sky-700">
                      Click to choose a file
                    </span>
                    <span className="text-sm text-slate-500 font-medium"> or drag and drop</span>
                    <div className="flex items-center justify-center space-x-2 mt-2">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">PDF</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">DOCX</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">TXT</span>
                      <span className="text-[11px] text-slate-400 font-medium">Max 10 MB (Digital text only)</span>
                    </div>
                  </div>
                )}
              </label>
            </div>
          ) : (
            <textarea
              rows={8}
              value={contractText}
              onChange={(e) => setContractText(e.target.value)}
              placeholder="Paste full contract text here with sections and numbered clauses..."
              className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:bg-white shadow-2xs transition-all leading-relaxed"
            />
          )}
        </div>

        {/* Optional Policy Document Input */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900">Organizational Policy Guidelines</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600">
                  Optional
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cross-reference contract terms against your internal guidelines (Max 10 MB)
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-100/80 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPolicyMode("file")}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  policyMode === "file" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setPolicyMode("paste")}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  policyMode === "paste" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Paste Text
              </button>
            </div>
          </div>

          {policyMode === "file" ? (
            <div className="border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-2xl p-6 text-center transition-all bg-slate-50/40">
              <input
                type="file"
                id="policy-file-input"
                accept=".pdf,.docx,.txt"
                onChange={handlePolicyFileChange}
                className="hidden"
              />
              <label htmlFor="policy-file-input" className="cursor-pointer block">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                {policyFile ? (
                  <div className="text-sm">
                    <span className="font-bold text-slate-800">{policyFile.name}</span>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      {(policyFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-bold text-slate-700 hover:underline">
                      Optional: Choose policy document
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">PDF, DOCX, TXT</p>
                  </div>
                )}
              </label>
            </div>
          ) : (
            <textarea
              rows={4}
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
              placeholder="Optional: Paste policy guidelines, standards, or vendor requirements here..."
              className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:bg-white shadow-2xs transition-all leading-relaxed"
            />
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-7 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white shadow-xs hover:shadow-glow-sky active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ingest & Run 5-Pass Extraction
            <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        </div>
      </form>

      {/* 5-PASS EXTRACTION PIPELINE PROGRESS MODAL */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full p-6 sm:p-8 border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3.5 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100 flex items-center justify-center text-sky-600 shadow-2xs">
                <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {hasStepErrors
                    ? "Extraction Finished with Warnings"
                    : "Running 5-Pass Extraction Pipeline..."}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Targeted, single-responsibility extraction with verbatim source quote verification
                </p>
              </div>
            </div>

            {/* Stepper List */}
            <div className="space-y-3 mb-6">
              {steps.map((step, index) => {
                const isWaiting = step.status === "waiting";
                const isActive = step.status === "active";
                const isCompleted = step.status === "completed";
                const isError = step.status === "error";

                return (
                  <div
                    key={step.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isActive
                        ? "bg-sky-50/70 border-sky-300 ring-2 ring-sky-100 shadow-2xs"
                        : isCompleted
                        ? "bg-emerald-50/40 border-emerald-200"
                        : isError
                        ? "bg-rose-50 border-rose-200"
                        : "bg-slate-50/50 border-slate-200/80 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start space-x-3">
                        {/* Step Status Icon */}
                        <div className="mt-0.5">
                          {isCompleted && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                          {isActive && <Loader2 className="w-5 h-5 text-sky-600 animate-spin shrink-0" />}
                          {isError && <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
                          {isWaiting && (
                            <span className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center text-[11px] text-slate-400 font-bold shrink-0">
                              {index + 1}
                            </span>
                          )}
                        </div>

                        <div>
                          <p
                            className={`text-xs sm:text-sm font-bold ${
                              isCompleted
                                ? "text-emerald-900"
                                : isActive
                                ? "text-sky-900"
                                : isError
                                ? "text-rose-900"
                                : "text-slate-600"
                            }`}
                          >
                            {step.name}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {step.description}
                          </p>
                          {isError && step.error && (
                            <p className="text-[11px] text-rose-700 font-mono mt-1.5 bg-white/80 p-2 rounded-lg border border-rose-200">
                              Error: {step.error}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Retry Button if this step errored */}
                      {isError && createdContractId && (
                        <button
                          type="button"
                          onClick={() => handleRetryStep(step.id)}
                          disabled={retryingStepId === step.id}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-colors flex items-center shrink-0 ml-2"
                        >
                          {retryingStepId === step.id ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                              Retrying...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3 mr-1.5" />
                              Retry Pass
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stepper Footer */}
            {hasStepErrors && createdContractId && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-amber-800 font-medium">
                  Some passes had errors, but succeeded passes were persisted.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/contracts/${createdContractId}`)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors flex items-center"
                >
                  Continue to Contract Review
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
