import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VersionDiffModal } from "../components/VersionDiffModal.js";
import * as api from "../services/api.js";

vi.mock("../services/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    compareVersions: vi.fn(),
  };
});

describe("VersionDiffModal Component", () => {
  const mockCompareResponse: api.VersionCompareResponse = {
    contractId: "contract-1",
    v1: 1,
    v2: 2,
    sectionDiff: {
      added: [
        {
          label: "Section 5.1",
          heading: "Data Privacy",
          text: "Each party must comply with GDPR and applicable laws.",
          page: 3,
        },
      ],
      removed: [
        {
          label: "Section 3.2",
          heading: "Legacy Fax Notice",
          text: "Notices may be transmitted via facsimile to (555) 0199.",
          page: 2,
        },
      ],
      modified: [
        {
          v1: {
            label: "Section 2.1",
            heading: "Renewal Notice Window",
            text: "Notice must be given 30 days prior to expiration.",
            page: 1,
          },
          v2: {
            label: "Section 2.1",
            heading: "Renewal Notice Window",
            text: "Notice must be given 60 days prior to expiration.",
            page: 1,
          },
          diffSummary: "Similarity score: 85%",
        },
      ],
      unchanged: [
        {
          label: "Section 1.1",
          heading: "Parties",
          text: "Agreement between Alpha Corp and Beta LLC.",
          page: 1,
        },
      ],
    },
    staleItemsQueue: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.compareVersions).mockResolvedValue(mockCompareResponse);
  });

  it("renders side-by-side section diff view with modified, added, and removed clauses", async () => {
    render(
      <VersionDiffModal
        contractId="contract-1"
        contractTitle="Master Services Agreement"
        availableVersions={[
          { versionNumber: 1, itemCount: 4 },
          { versionNumber: 2, itemCount: 5 },
        ]}
        defaultV1={1}
        defaultV2={2}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Verify header and versions
    expect(screen.getByText("Version Diff & Clause Comparison")).toBeInTheDocument();
    expect(screen.getByText("(Master Services Agreement)")).toBeInTheDocument();

    // Await diff data fetching
    await waitFor(() => {
      expect(screen.getByText("Modified Clauses (1)")).toBeInTheDocument();
    });

    // Check modified section side-by-side
    expect(screen.getByText("Similarity score: 85%")).toBeInTheDocument();
    expect(screen.getByText("Notice must be given 30 days prior to expiration.")).toBeInTheDocument();
    expect(screen.getByText("Notice must be given 60 days prior to expiration.")).toBeInTheDocument();

    // Check added section
    expect(screen.getByText("+ Added in v2")).toBeInTheDocument();
    expect(screen.getByText(/Each party must comply with GDPR/)).toBeInTheDocument();

    // Check removed section
    expect(screen.getByText("- Removed from v2")).toBeInTheDocument();
    expect(screen.getByText(/Notices may be transmitted via facsimile/)).toBeInTheDocument();

    // Check unchanged clauses count
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("clauses unchanged")).toBeInTheDocument();
  });

  it("filters diff categories by button click", async () => {
    render(
      <VersionDiffModal
        contractId="contract-1"
        contractTitle="Master Services Agreement"
        availableVersions={[
          { versionNumber: 1, itemCount: 4 },
          { versionNumber: 2, itemCount: 5 },
        ]}
        defaultV1={1}
        defaultV2={2}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Modified Clauses (1)")).toBeInTheDocument();
    });

    // Click Added filter button
    fireEvent.click(screen.getByRole("button", { name: /Added \(1\)/i }));

    // Added clause is visible, but modified is hidden
    expect(screen.getByText("+ Added in v2")).toBeInTheDocument();
    expect(screen.queryByText("Modified Clauses (1)")).not.toBeInTheDocument();
  });
});
