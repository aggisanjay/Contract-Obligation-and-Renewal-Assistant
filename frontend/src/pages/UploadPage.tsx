import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { uploadContract, retryExtractionStep } from "../services/api.js";
import {
  Upload,
  FileText,
  AlertCircle,
  Loader2,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
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
    <div className="max-w-4xl mx-auto px-4 py-8 relative">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Upload Contract for Extraction</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a digital contract (PDF, DOCX, or text) and optionally an organizational policy document to cross-check terms.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-sm text-red-700 animate-in fade-in duration-150">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Validation error: </span>
            {errorMessage}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Contract Title */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
          <label className="block text-sm font-semibold text-slate-800 mb-1">
            Contract Title / Identifier
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Master Services Agreement with Acme Corp"
            className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
        </div>

        {/* Primary Contract Input */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Contract Document (Required)</h2>
              <p className="text-xs text-slate-500">Text-based PDF, DOCX, or plain text (Max 10 MB)</p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-xs font-medium">
              <button
                type="button"
                onClick={() => setContractMode("file")}
                className={`px-3 py-1 rounded-md transition-colors ${
                  contractMode === "file" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setContractMode("paste")}
                className={`px-3 py-1 rounded-md transition-colors ${
                  contractMode === "paste" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Paste Text
              </button>
            </div>
          </div>

          {contractMode === "file" ? (
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-sky-500 transition-colors bg-slate-50/50">
              <input
                type="file"
                id="contract-file-input"
                accept=".pdf,.docx,.txt"
                onChange={handleContractFileChange}
                className="hidden"
              />
              <label htmlFor="contract-file-input" className="cursor-pointer block">
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                {contractFile ? (
                  <div className="text-sm">
                    <span className="font-semibold text-sky-600">{contractFile.name}</span>
                    <p className="text-xs text-slate-500 mt-1">
                      {(contractFile.size / (1024 * 1024)).toFixed(2)} MB - Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm font-semibold text-sky-600 hover:underline">
                      Click to choose a file
                    </span>
                    <span className="text-sm text-slate-500"> or drag and drop</span>
                    <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT up to 10 MB (Digital text only)</p>
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
              className="w-full p-3.5 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          )}
        </div>

        {/* Optional Policy Document Input */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Organizational Policy (Optional)</h2>
              <p className="text-xs text-slate-500">
                Cross-reference contract terms against your internal guidelines (Max 10 MB)
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-xs font-medium">
              <button
                type="button"
                onClick={() => setPolicyMode("file")}
                className={`px-3 py-1 rounded-md transition-colors ${
                  policyMode === "file" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setPolicyMode("paste")}
                className={`px-3 py-1 rounded-md transition-colors ${
                  policyMode === "paste" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Paste Text
              </button>
            </div>
          </div>

          {policyMode === "file" ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-slate-400 transition-colors bg-slate-50/50">
              <input
                type="file"
                id="policy-file-input"
                accept=".pdf,.docx,.txt"
                onChange={handlePolicyFileChange}
                className="hidden"
              />
              <label htmlFor="policy-file-input" className="cursor-pointer block">
                <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                {policyFile ? (
                  <div className="text-sm">
                    <span className="font-semibold text-slate-700">{policyFile.name}</span>
                    <p className="text-xs text-slate-500 mt-1">
                      {(policyFile.size / (1024 * 1024)).toFixed(2)} MB - Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-semibold text-slate-600 hover:underline">
                      Optional: Choose policy document
                    </span>
                    <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT</p>
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
              className="w-full p-3.5 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ingest & Run 5-Pass Extraction
            <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        </div>
      </form>

      {/* 5-PASS EXTRACTION PIPELINE PROGRESS MODAL */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-slate-200">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {hasStepErrors
                    ? "Extraction Finished with Warnings"
                    : "Running 5-Pass Extraction Pipeline..."}
                </h3>
                <p className="text-xs text-slate-500">
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
                    className={`p-3.5 rounded-xl border transition-all ${
                      isActive
                        ? "bg-sky-50/60 border-sky-300 ring-2 ring-sky-100 shadow-2xs"
                        : isCompleted
                        ? "bg-emerald-50/40 border-emerald-200"
                        : isError
                        ? "bg-rose-50 border-rose-200"
                        : "bg-slate-50/50 border-slate-200 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        {/* Step Status Icon */}
                        <div className="mt-0.5">
                          {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                          {isActive && <Loader2 className="w-4 h-4 text-sky-600 animate-spin shrink-0" />}
                          {isError && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                          {isWaiting && (
                            <span className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[10px] text-slate-400 font-bold shrink-0">
                              {index + 1}
                            </span>
                          )}
                        </div>

                        <div>
                          <p
                            className={`text-xs font-bold ${
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
                            <p className="text-[11px] text-rose-700 font-mono mt-1 bg-white/70 p-1.5 rounded border border-rose-200">
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
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-semibold shadow-2xs transition-colors flex items-center shrink-0 ml-2"
                        >
                          {retryingStepId === step.id ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Retrying...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3 mr-1" />
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
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-amber-700 font-medium">
                  Some passes had errors, but succeeded passes were persisted.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/contracts/${createdContractId}`)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center"
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
