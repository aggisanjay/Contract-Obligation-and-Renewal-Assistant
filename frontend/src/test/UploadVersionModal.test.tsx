import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UploadVersionModal } from "../components/UploadVersionModal.js";
import * as api from "../services/api.js";

vi.mock("../services/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    uploadNewVersion: vi.fn(),
  };
});

describe("UploadVersionModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("switches tabs, submits pasted text, and displays version creation summary", async () => {
    vi.mocked(api.uploadNewVersion).mockResolvedValue({
      contractId: "contract-1",
      versionId: "ver-2",
      versionNumber: 2,
      newItemsCount: 2,
      staleCount: 1,
      carriedOverCount: 3,
    });

    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <UploadVersionModal
        contractId="contract-1"
        contractTitle="Software Agreement"
        latestVersionNumber={1}
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    expect(screen.getByText("Upload New Version")).toBeInTheDocument();
    expect(screen.getByText(/Adding/)).toBeInTheDocument();

    // Switch to Paste Revised Text tab
    fireEvent.click(screen.getByRole("button", { name: /Paste Revised Text/i }));

    const textarea = screen.getByPlaceholderText(/Paste the revised contract clauses here/i);
    fireEvent.change(textarea, {
      target: { value: "Section 1. Parties\nRevised parties agreement text." },
    });

    // Click submit
    fireEvent.click(screen.getByRole("button", { name: /Upload Version 2/i }));

    await waitFor(() => {
      expect(screen.getByText("Version 2 Created Successfully")).toBeInTheDocument();
    });

    // Verify metric cards
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Unchanged approvals")).toBeInTheDocument();

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Clause changes")).toBeInTheDocument();

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("New extractions")).toBeInTheDocument();

    // Click view new version
    fireEvent.click(screen.getByRole("button", { name: /View Version 2 & Review Queue/i }));
    expect(handleSuccess).toHaveBeenCalledWith(2);
    expect(handleClose).toHaveBeenCalled();
  });
});
