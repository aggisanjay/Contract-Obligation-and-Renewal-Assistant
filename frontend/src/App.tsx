import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "./components/Header.js";
import { LegalDisclaimerBanner } from "./components/LegalDisclaimerBanner.js";
import { ContractsListPage } from "./pages/ContractsListPage.js";
import { UploadPage } from "./pages/UploadPage.js";
import { ReviewPage } from "./pages/ReviewPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SummaryPage } from "./pages/SummaryPage.js";
import { getHealth } from "./services/api.js";

import { ToastProvider } from "./context/ToastContext.js";

export const App: React.FC = () => {
  const [llmMode, setLlmMode] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getHealth()
      .then((health) => {
        if (isMounted && health?.llmMode) {
          setLlmMode(health.llmMode);
        }
      })
      .catch(() => {
        // Silently ignore health check errors in offline/mock environment
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-slate-100">
          <Header isDemoMode={llmMode === "mock"} />
          <main className="flex-1 flex flex-col">
            <Routes>
              <Route path="/" element={<ContractsListPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/contracts/:id" element={<ReviewPage />} />
              <Route path="/contracts/:id/summary" element={<SummaryPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
            </Routes>
          </main>
          <LegalDisclaimerBanner />
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
};
