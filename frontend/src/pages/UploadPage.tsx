import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadContract } from "../services/api.js";
import { Upload, FileText, AlertCircle, Loader2, ArrowRight } from "lucide-react";

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

  const handleContractFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage("File exceeds the 10 MB limit.");
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
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage("Policy file exceeds the 10 MB limit.");
        return;
      }
      setPolicyFile(file);
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (contractMode === "file" && !contractFile) {
      setErrorMessage("Please select a contract file (PDF, DOCX, or TXT).");
      return;
    }
    if (contractMode === "paste" && !contractText.trim()) {
      setErrorMessage("Please paste the contract text.");
      return;
    }

    try {
      setLoading(true);
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
      navigate(`/contracts/${result.contractId}`);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process contract.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Upload Contract for Extraction</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a digital contract (PDF, DOCX, or text) and optionally an organizational policy document to cross-check terms.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-sm text-red-700">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Upload failed: </span>
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
                    <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT up to 10 MB (No OCR)</p>
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
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Parsing & Extracting Data...
              </>
            ) : (
              <>
                Ingest & Run Extraction
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
