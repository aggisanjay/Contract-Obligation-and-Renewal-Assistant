import React, { useState } from "react";
import { uploadNewVersion } from "../services/api.js";
import { X, Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

interface UploadVersionModalProps {
  contractId: string;
  contractTitle: string;
  latestVersionNumber: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (versionNumber: number) => void;
}

export const UploadVersionModal: React.FC<UploadVersionModalProps> = ({
  contractId,
  contractTitle,
  latestVersionNumber,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState("");
  const [activeTab, setActiveTab] = useState<"file" | "text">("file");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    versionNumber: number;
    newItemsCount: number;
    staleCount: number;
    carriedOverCount: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    if (activeTab === "file") {
      if (!file) {
        setError("Please select a document file (.pdf, .docx, or .txt)");
        return;
      }
      formData.append("contract", file);
    } else {
      if (!textInput.trim()) {
        setError("Please paste the contract text");
        return;
      }
      formData.append("contractText", textInput.trim());
    }

    try {
      setIsSubmitting(true);
      const res = await uploadNewVersion(contractId, formData);
      setUploadResult({
        versionNumber: res.versionNumber,
        newItemsCount: res.newItemsCount,
        staleCount: res.staleCount,
        carriedOverCount: res.carriedOverCount,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload new version");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = () => {
    if (uploadResult) {
      onSuccess(uploadResult.versionNumber);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 relative border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          disabled={isSubmitting}
        >
          <X className="w-5 h-5" />
        </button>

        {!uploadResult ? (
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Upload New Version</h3>
                <p className="text-xs text-slate-500">
                  Adding <span className="font-semibold text-slate-700">v{latestVersionNumber + 1}</span> for "{contractTitle}"
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Input Mode Selector */}
            <div className="flex rounded-lg bg-slate-100 p-1 mb-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("file")}
                className={`flex-1 py-1.5 rounded-md transition-all ${
                  activeTab === "file"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Upload File (PDF / DOCX / TXT)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("text")}
                className={`flex-1 py-1.5 rounded-md transition-all ${
                  activeTab === "text"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Paste Revised Text
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {activeTab === "file" ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Contract Document
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-sky-500 transition-colors bg-slate-50/50">
                    <input
                      type="file"
                      id="versionFileInput"
                      accept=".pdf,.docx,.txt"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label
                      htmlFor="versionFileInput"
                      className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                    >
                      <FileText className="w-8 h-8 text-slate-400" />
                      <span className="text-xs font-semibold text-sky-600 hover:underline">
                        {file ? file.name : "Select a document from your computer"}
                      </span>
                      <span className="text-[11px] text-slate-400">PDF, DOCX, or TXT up to 10 MB</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Paste Updated Contract Text
                  </label>
                  <textarea
                    rows={8}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste the revised contract clauses here..."
                    className="w-full text-xs font-mono p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3 text-xs text-sky-800 space-y-1">
                <p className="font-semibold flex items-center">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
                  Automatic Version Alignment & Stale Detection:
                </p>
                <p className="text-[11px] text-sky-700 pl-5">
                  Previously approved clauses that remain unchanged will be automatically carried forward. Items whose source clauses were modified or removed will be flagged in the Stale Review Queue.
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Analyzing & Ingesting v{latestVersionNumber + 1}...
                    </>
                  ) : (
                    <>
                      Upload Version {latestVersionNumber + 1}
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Success Screen */
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              Version {uploadResult.versionNumber} Created Successfully
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              The new version has been ingested and compared against v{latestVersionNumber}.
            </p>

            <div className="grid grid-cols-3 gap-3 my-6 text-left">
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
                  Carried Over
                </span>
                <span className="text-xl font-bold text-emerald-900 mt-1 block">
                  {uploadResult.carriedOverCount}
                </span>
                <span className="text-[11px] text-emerald-600">Unchanged approvals</span>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
                  Stale Flagged
                </span>
                <span className="text-xl font-bold text-amber-900 mt-1 block">
                  {uploadResult.staleCount}
                </span>
                <span className="text-[11px] text-amber-600">Clause changes</span>
              </div>

              <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl">
                <span className="text-[11px] font-semibold text-sky-700 uppercase tracking-wider block">
                  New Pending
                </span>
                <span className="text-xl font-bold text-sky-900 mt-1 block">
                  {uploadResult.newItemsCount}
                </span>
                <span className="text-[11px] text-sky-600">New extractions</span>
              </div>
            </div>

            <button
              onClick={handleFinish}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors"
            >
              View Version {uploadResult.versionNumber} & Review Queue
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
