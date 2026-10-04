import React, { useState, useEffect } from "react";
import { ShieldAlert } from "lucide-react";

export const LegalDisclaimerBanner: React.FC = () => {
  const [showFirstUseModal, setShowFirstUseModal] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem("hasSeenFirstUseLegalNotice");
    if (!hasSeen) {
      setShowFirstUseModal(true);
    }
  }, []);

  const acknowledgeNotice = () => {
    localStorage.setItem("hasSeenFirstUseLegalNotice", "true");
    setShowFirstUseModal(false);
  };

  return (
    <>
      {/* Persistent Footer Banner */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-300 py-3 px-4 text-center text-xs tracking-normal sticky bottom-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong className="text-white font-semibold">Important Notice:</strong> This tool organizes contract information. It does not provide legal advice. Verify all items against the original document and consult a qualified professional.
          </span>
        </div>
      </footer>

      {/* First-Use Modal Dialog */}
      {showFirstUseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">
                  Welcome to Contract Assistant
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  This application is strictly an <strong>information-management tool</strong>. It helps organize dates, extract clauses, and cite source paragraphs from your contract files.
                </p>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-medium">
                  This tool organizes contract information. It does not provide legal advice. Verify all items against the original document and consult a qualified professional.
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={acknowledgeNotice}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg shadow-xs transition-colors"
                  >
                    I Understand & Acknowledge
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
