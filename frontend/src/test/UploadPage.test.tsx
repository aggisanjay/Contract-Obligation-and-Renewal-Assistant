import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { UploadPage } from "../pages/UploadPage.js";
import * as api from "../services/api.js";

vi.mock("../services/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    uploadContract: vi.fn(),
    retryExtractionStep: vi.fn(),
  };
});

describe("UploadPage Component & Client-Side Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects files exceeding 10 MB limit with clear error", async () => {
    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    // Create a mock large file (12 MB)
    const largeFile = new File(["a".repeat(100)], "big_contract.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(largeFile, "size", { value: 12 * 1024 * 1024 });

    const input = document.getElementById("contract-file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [largeFile] } });

    expect(screen.getByText(/exceeds the 10 MB maximum allowed size/i)).toBeInTheDocument();
  });

  it("rejects unsupported file formats before submission", async () => {
    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    const invalidFile = new File(["fake binary"], "program.exe", {
      type: "application/x-msdownload",
    });

    const input = document.getElementById("contract-file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(screen.getByText(/Unsupported file format for "program.exe"/i)).toBeInTheDocument();
  });

  it("displays 5-pass loading stepper and handles step retry on error", async () => {
    vi.mocked(api.uploadContract).mockResolvedValue({
      contractId: "contract-123",
      versionId: "ver-1",
      title: "Sample Agreement",
      sectionCount: 3,
      itemCount: 4,
      rejectedCount: 0,
      stepErrors: [
        {
          step: "term_and_renewal",
          error: "Rate limit reached on LLM provider.",
        },
      ],
    });

    vi.mocked(api.retryExtractionStep).mockResolvedValue({
      success: true,
      step: "term_and_renewal",
      addedCount: 2,
      stepErrors: [],
    });

    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    // Switch to paste mode and enter contract text
    fireEvent.click(screen.getAllByRole("button", { name: /Paste Text/i })[0]);
    const textarea = screen.getByPlaceholderText(/Paste full contract text here/i);
    fireEvent.change(textarea, { target: { value: "Section 1. Parties\nAcme Corp and Beta LLC." } });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: /Ingest & Run 5-Pass Extraction/i }));

    // Verify stepper modal appears with 5 passes
    await waitFor(() => {
      expect(screen.getByText("Pass 1: Parties & Effective Date")).toBeInTheDocument();
      expect(screen.getByText("Pass 2: Term, Expiry & Renewal Deadlines")).toBeInTheDocument();
      expect(screen.getByText("Pass 3: Operational Obligations & Deliverables")).toBeInTheDocument();
      expect(screen.getByText("Pass 4: Ambiguities, Contradictions & Policy Gaps")).toBeInTheDocument();
      expect(screen.getByText("Pass 5: Neutral Clarification Questions")).toBeInTheDocument();
    });

    // Check error state for failed pass
    await waitFor(() => {
      expect(screen.getByText(/Rate limit reached on LLM provider/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry Pass/i })).toBeInTheDocument();
    });

    // Click Retry Pass button
    fireEvent.click(screen.getByRole("button", { name: /Retry Pass/i }));

    await waitFor(() => {
      expect(api.retryExtractionStep).toHaveBeenCalledWith("contract-123", "term_and_renewal");
    });
  });
});
