import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ReviewPage } from "../pages/ReviewPage.js";
import * as api from "../services/api.js";

vi.mock("../services/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    getContract: vi.fn(),
    reviewItem: vi.fn(),
    resolveStaleItem: vi.fn(),
    bulkApproveItems: vi.fn(),
    deleteContract: vi.fn(),
  };
});

describe("ReviewPage Component - Human-in-the-Loop Workflows", () => {
  const mockItem = {
    id: "item-1",
    contractVersionId: "ver-1",
    itemType: "obligation" as const,
    status: "confirmed" as const,
    confidence: 0.95,
    uncertaintyReason: null,
    sourceSectionLabel: "Section 2.1",
    sourceSectionId: "sec-2",
    page: 1,
    exactQuote: "Client shall pay invoices within 30 days of receipt.",
    citationVerified: true,
    citationWarning: null,
    reviewStatus: "pending" as const,
    userEdited: false,
    originalValue: JSON.stringify({
      description: "Pay invoices within 30 days",
      responsibleParty: "Client",
    }),
    currentValue: JSON.stringify({
      description: "Pay invoices within 30 days",
      responsibleParty: "Client",
    }),
    calculatedDate: "2025-07-01",
    manualDateOverride: null,
    dateResolutionStatus: "resolved" as const,
    dateResolutionReason: null,
    createdAt: "2025-06-01T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
  };

  const mockContractData = {
    contract: {
      id: "contract-123",
      title: "Master Services Agreement",
      createdAt: "2025-06-01T00:00:00Z",
      updatedAt: "2025-06-01T00:00:00Z",
      totalVersions: 1,
    },
    activeVersion: {
      id: "ver-1",
      versionNumber: 1,
      fileType: "pdf",
      pageCount: 3,
      createdAt: "2025-06-01T00:00:00Z",
      sections: [
        {
          id: "sec-1",
          sectionIndex: 0,
          label: "Section 1.1",
          heading: "Parties",
          text: "This Agreement is entered into by Acme Corp and Beta LLC.",
          page: 1,
          charStart: 0,
          charEnd: 60,
        },
        {
          id: "sec-2",
          sectionIndex: 1,
          label: "Section 2.1",
          heading: "Payment Terms",
          text: "Client shall pay invoices within 30 days of receipt.",
          page: 1,
          charStart: 61,
          charEnd: 120,
        },
      ],
      extractedItems: [mockItem],
      auditLogs: [],
    },
    allVersions: [
      {
        id: "ver-1",
        versionNumber: 1,
        createdAt: "2025-06-01T00:00:00Z",
        itemCount: 1,
      },
    ],
    isDemoMode: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approves an unreviewed item and updates the review status", async () => {
    vi.mocked(api.getContract).mockResolvedValue(mockContractData as any);
    vi.mocked(api.reviewItem).mockResolvedValue({
      success: true,
      item: {
        ...mockItem,
        reviewStatus: "approved",
      } as any,
    });

    render(
      <MemoryRouter initialEntries={["/contracts/contract-123/review"]}>
        <Routes>
          <Route path="/contracts/:id/review" element={<ReviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the item description to be rendered in the obligations category
    await waitFor(() => {
      expect(screen.getByText("Pay invoices within 30 days")).toBeInTheDocument();
    });

    // Verify it initially shows pending review status
    expect(screen.getByText(/1 items pending review/i)).toBeInTheDocument();

    // Click "Approve" button
    const approveButton = screen.getByRole("button", { name: /^Approve$/ });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.reviewItem).toHaveBeenCalledWith(
        "contract-123",
        "item-1",
        "approve"
      );
    });
  });

  it("applies a manual date override", async () => {
    vi.mocked(api.getContract).mockResolvedValue(mockContractData as any);
    vi.mocked(api.reviewItem).mockResolvedValue({
      success: true,
      item: {
        ...mockItem,
        manualDateOverride: "2025-08-15",
        reviewStatus: "edited_approved",
      } as any,
    });

    render(
      <MemoryRouter initialEntries={["/contracts/contract-123/review"]}>
        <Routes>
          <Route path="/contracts/:id/review" element={<ReviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Pay invoices within 30 days")).toBeInTheDocument();
    });

    // Click "Override Date" button
    const overrideButton = screen.getByRole("button", { name: /Override Date/i });
    fireEvent.click(overrideButton);

    // Date override input should appear
    const dateInput = screen.getByDisplayValue("2025-07-01");
    fireEvent.change(dateInput, { target: { value: "2025-08-15" } });

    const saveDateButton = screen.getByRole("button", { name: /^Save$/i });
    fireEvent.click(saveDateButton);

    await waitFor(() => {
      expect(api.reviewItem).toHaveBeenCalledWith(
        "contract-123",
        "item-1",
        "override_date",
        "2025-08-15"
      );
    });
  });

  it("resolves a stale item through reconfirmation", async () => {
    const staleContractData = {
      ...mockContractData,
      activeVersion: {
        ...mockContractData.activeVersion,
        extractedItems: [
          {
            ...mockItem,
            reviewStatus: "stale" as const,
            staleReason: "source_clause_changed",
          },
        ],
      },
    };

    vi.mocked(api.getContract).mockResolvedValue(staleContractData as any);
    vi.mocked(api.resolveStaleItem).mockResolvedValue({
      success: true,
      item: {
        ...mockItem,
        reviewStatus: "approved" as const,
        staleReason: null,
      } as any,
    });

    render(
      <MemoryRouter initialEntries={["/contracts/contract-123/review"]}>
        <Routes>
          <Route path="/contracts/:id/review" element={<ReviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Stale alert banner should appear
    await waitFor(() => {
      expect(screen.getByText(/Stale Clause Alert:/i)).toBeInTheDocument();
    });

    // Click "Re-confirm (Keep Approved)" button
    const reconfirmButton = screen.getByRole("button", { name: /Re-confirm \(Keep Approved\)/i });
    fireEvent.click(reconfirmButton);

    await waitFor(() => {
      expect(api.resolveStaleItem).toHaveBeenCalledWith(
        "contract-123",
        "item-1",
        "reconfirm",
        ""
      );
    });
  });
});
