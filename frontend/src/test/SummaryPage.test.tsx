import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SummaryPage } from "../pages/SummaryPage.js";
import * as api from "../services/api.js";
import { ContractSummaryResponse } from "../services/api.js";

vi.mock("../services/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    getContractSummary: vi.fn(),
    generateContractSummary: vi.fn(),
  };
});

describe("SummaryPage Component - Key Dates Display Wording", () => {
  const mockSummaryResponse: ContractSummaryResponse = {
    summary: {
      id: "sum-1",
      contractId: "contract-1",
      contractVersionId: "ver-1",
      versionNumber: 1,
      contractTitle: "Enterprise MSA",
      generatedAt: new Date().toISOString(),
      isOutdated: false,
      legalDisclaimer: "Legal disclaimer text",
      parties: [],
      keyDates: {
        effectiveDate: "2026-01-15",
        expiryDate: null,
        noticeDeadline: null,
        citation: "",
      },
      renewalTerms: {
        isAutoRenew: false,
        summary: "Does not auto-renew.",
        citation: "",
      },
      terminationTerms: {
        summary: "30 days notice",
        citation: "",
      },
      obligations: [],
      openQuestionsAndAmbiguities: [],
      metrics: {
        totalApproved: 3,
        totalRejected: 0,
        totalStale: 0,
      },
      markdownContent: "# Summary",
      htmlContent: "<p>Summary</p>",
    },
    compiled: {
      contractTitle: "Enterprise MSA",
      versionNumber: 1,
      generatedAt: new Date().toISOString(),
      disclaimer: "Legal disclaimer text",
      parties: [],
      keyDates: {
        effectiveDate: "2026-01-15",
        expiryDate: "Needs input: Expiry date could not be resolved from term or effective date.",
        noticeDeadline: "Not applicable (does not renew automatically)",
        citation: 'Effective Date: [Section 1] "January 15, 2026"',
      },
      renewalTerms: {
        isAutoRenew: false,
        summary: "Does not auto-renew.",
        citation: 'Section 2.1 "No renewal"',
      },
      terminationTerms: {
        summary: "30 days notice",
        citation: 'Section 3 "Termination"',
      },
      obligations: [],
      openQuestionsAndAmbiguities: [],
      metrics: {
        totalApproved: 3,
        totalRejected: 0,
        totalStale: 0,
      },
      markdown: "# Summary",
      html: "<p>Summary</p>",
    },
    isOutdated: false,
  };

  it("renders concrete dates and refined status badges for needs input and not applicable", async () => {
    vi.mocked(api.getContractSummary).mockResolvedValue(mockSummaryResponse);

    render(
      <MemoryRouter initialEntries={["/contracts/contract-1/summary"]}>
        <Routes>
          <Route path="/contracts/:id/summary" element={<SummaryPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // Concrete date
      expect(screen.getByText("2026-01-15")).toBeInTheDocument();
      // Needs input status
      expect(
        screen.getByText(/Needs input: Expiry date could not be resolved from term or effective date\./i)
      ).toBeInTheDocument();
      // Not applicable status
      expect(
        screen.getByText(/Not applicable \(does not renew automatically\)/i)
      ).toBeInTheDocument();
    });
  });

  it("renders 'Pending review' and 'Not found in contract' appropriately", async () => {
    const pendingSummaryResponse: ContractSummaryResponse = {
      ...mockSummaryResponse,
      compiled: {
        ...mockSummaryResponse.compiled,
        keyDates: {
          effectiveDate: "Pending review",
          expiryDate: "Not found in contract",
          noticeDeadline: "Pending review",
          citation: "",
        },
      },
    };

    vi.mocked(api.getContractSummary).mockResolvedValue(pendingSummaryResponse);

    render(
      <MemoryRouter initialEntries={["/contracts/contract-1/summary"]}>
        <Routes>
          <Route path="/contracts/:id/summary" element={<SummaryPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const pendingElements = screen.getAllByText("Pending review");
      expect(pendingElements.length).toBe(2);
      expect(screen.getByText("Not found in contract")).toBeInTheDocument();
    });
  });
});
