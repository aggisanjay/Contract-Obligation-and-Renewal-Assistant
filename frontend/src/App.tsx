import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "./components/Header.js";
import { LegalDisclaimerBanner } from "./components/LegalDisclaimerBanner.js";
import { ContractsListPage } from "./pages/ContractsListPage.js";
import { UploadPage } from "./pages/UploadPage.js";
import { ReviewPage } from "./pages/ReviewPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { SummaryPage } from "./pages/SummaryPage.js";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-100">
        <Header />
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
  );
};
