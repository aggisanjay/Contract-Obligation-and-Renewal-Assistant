import { describe, it, expect } from "vitest";
import { compileReviewedSummary } from "../src/services/summaryCompiler.js";
import { ExtractedItem } from "@contract-assistant/shared";

function makeItem(partial: Partial<ExtractedItem>): ExtractedItem {
  return {
    id: "item-" + Math.random().toString(36).substring(7),
    contractVersionId: "ver-1",
    itemType: "obligation",
    status: "confirmed",
    confidence: 0.95,
    uncertaintyReason: null,
    sourceSectionLabel: "Section 1",
    sourceSectionId: "sec-1",
    page: 1,
    exactQuote: "Sample quote.",
    citationVerified: true,
    citationWarning: null,
    reviewStatus: "approved",
    userEdited: false,
    originalValue: "{}",
    currentValue: "{}",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("summaryCompiler - compileReviewedSummary unit tests", () => {
  it("never defaults a missing isAutoRenew to false; writes specific message when not an explicit boolean", () => {
    // Case 1: renewal item present with missing isAutoRenew
    const itemWithoutBool = makeItem({
      itemType: "renewal",
      reviewStatus: "approved",
      sourceSectionLabel: "Section 2.1",
      exactQuote: "The agreement shall be renewed upon terms to be negotiated.",
      currentValue: JSON.stringify({
        renewalType: "manual_opt_in",
        noticePeriodDays: 30,
      }), // notice isAutoRenew is missing
    });

    const summary1 = compileReviewedSummary("Test Contract", 1, [itemWithoutBool]);
    expect(summary1.renewalTerms.isAutoRenew).toBeNull();
    expect(summary1.renewalTerms.summary).toBe("Renewal terms not specified in approved data. See cited clause.");
    expect(summary1.markdown).toContain("Renewal terms not specified in approved data. See cited clause.");

    // Case 2: no renewal item approved at all
    const summaryNoRenewal = compileReviewedSummary("Test Contract", 1, []);
    expect(summaryNoRenewal.renewalTerms.isAutoRenew).toBeNull();
    expect(summaryNoRenewal.renewalTerms.summary).toBe("Renewal terms not specified in approved data. See cited clause.");
  });

  it("handles explicit boolean isAutoRenew correctly (true vs false)", () => {
    // Explicit true
    const itemTrue = makeItem({
      itemType: "renewal",
      reviewStatus: "approved",
      currentValue: JSON.stringify({
        isAutoRenew: true,
        renewalTermMonths: 12,
        noticePeriodDays: 60,
      }),
    });
    const summaryTrue = compileReviewedSummary("Test Contract", 1, [itemTrue]);
    expect(summaryTrue.renewalTerms.isAutoRenew).toBe(true);
    expect(summaryTrue.renewalTerms.summary).toContain("Automatically renews for 12 months");
    expect(summaryTrue.renewalTerms.summary).toContain("60 days");

    // Explicit false
    const itemFalse = makeItem({
      itemType: "renewal",
      reviewStatus: "approved",
      currentValue: JSON.stringify({
        isAutoRenew: false,
      }),
    });
    const summaryFalse = compileReviewedSummary("Test Contract", 1, [itemFalse]);
    expect(summaryFalse.renewalTerms.isAutoRenew).toBe(false);
    expect(summaryFalse.renewalTerms.summary).toBe("Does not auto-renew.");
  });

  it("outputs 'Termination clause not yet approved' if none approved", () => {
    // No termination item approved
    const summaryNoTerm = compileReviewedSummary("Test Contract", 1, []);
    expect(summaryNoTerm.terminationTerms.summary).toBe("Termination clause not yet approved");
    expect(summaryNoTerm.markdown).toContain("- **Termination:** Termination clause not yet approved");

    // Pending termination item only
    const pendingTermItem = makeItem({
      itemType: "termination",
      reviewStatus: "pending",
      currentValue: JSON.stringify({ summary: "30 days notice for convenience." }),
    });
    const summaryPendingTerm = compileReviewedSummary("Test Contract", 1, [pendingTermItem]);
    expect(summaryPendingTerm.terminationTerms.summary).toBe("Termination clause not yet approved");

    // Approved termination item
    const approvedTermItem = makeItem({
      itemType: "termination",
      reviewStatus: "approved",
      currentValue: JSON.stringify({ summary: "30 days notice for convenience." }),
    });
    const summaryApprovedTerm = compileReviewedSummary("Test Contract", 1, [approvedTermItem]);
    expect(summaryApprovedTerm.terminationTerms.summary).toBe("30 days notice for convenience.");
  });

  it("shows 'Pending review' if expiry/notice items exist but are pending, and 'Not found in contract' if item does not exist", () => {
    const pendingExpiry = makeItem({
      itemType: "expiry",
      reviewStatus: "pending",
      currentValue: JSON.stringify({ expiryDate: "2026-12-31" }),
    });
    const pendingRenewal = makeItem({
      itemType: "renewal",
      reviewStatus: "pending",
      calculatedDate: "2026-11-01",
    });

    const summary = compileReviewedSummary("Test Contract", 1, [pendingExpiry, pendingRenewal]);

    // Effective date was never found -> "Not found in contract"
    expect(summary.keyDates.effectiveDate).toBe("Not found in contract");
    expect(summary.markdown).toContain("- **Effective Date:** Not found in contract");

    // Expiry date is pending -> "Pending review"
    expect(summary.keyDates.expiryDate).toBe("Pending review");
    expect(summary.markdown).toContain("- **Contract Expiry Date:** Pending review");

    // Notice deadline is pending -> "Pending review"
    expect(summary.keyDates.noticeDeadline).toBe("Pending review");
    expect(summary.markdown).toContain("- **Notice Deadline:** Pending review");

    expect(summary.html).toContain("<strong>Contract Expiry Date:</strong> Pending review");
    expect(summary.html).toContain("<strong>Notice Deadline:</strong> Pending review");
  });

  it("shows concrete dates when approved and 'Not found in contract' when items do not exist", () => {
    const approvedEff = makeItem({
      itemType: "effective_date",
      reviewStatus: "approved",
      calculatedDate: "2025-01-01",
    });

    const summary = compileReviewedSummary("Test Contract", 1, [approvedEff]);
    expect(summary.keyDates.effectiveDate).toBe("2025-01-01");
    expect(summary.markdown).toContain("- **Effective Date:** 2025-01-01");
    expect(summary.keyDates.expiryDate).toBe("Not found in contract");
    expect(summary.markdown).toContain("- **Contract Expiry Date:** Not found in contract");
    expect(summary.keyDates.noticeDeadline).toBe("Not found in contract");
    expect(summary.markdown).toContain("- **Notice Deadline:** Not found in contract");
  });

  it("shows 'Needs input: <reason>' when item is approved but date could not be calculated", () => {
    const approvedRelativeEff = makeItem({
      itemType: "effective_date",
      reviewStatus: "approved",
      calculatedDate: null,
      dateResolutionStatus: "needs_input",
      dateResolutionReason: "Effective date is relative (for example, the date of last signature). Confirm the date manually.",
    });

    const approvedExpNoDate = makeItem({
      itemType: "expiry",
      reviewStatus: "approved",
      calculatedDate: null,
      dateResolutionStatus: "needs_input",
      dateResolutionReason: "Expiry date could not be resolved from term or effective date.",
    });

    const summary = compileReviewedSummary("Test Contract", 1, [approvedRelativeEff, approvedExpNoDate]);
    expect(summary.keyDates.effectiveDate).toBe(
      "Needs input: Effective date is relative (for example, the date of last signature). Confirm the date manually."
    );
    expect(summary.markdown).toContain(
      "- **Effective Date:** Needs input: Effective date is relative (for example, the date of last signature). Confirm the date manually."
    );
    expect(summary.keyDates.expiryDate).toBe(
      "Needs input: Expiry date could not be resolved from term or effective date."
    );
    expect(summary.markdown).toContain(
      "- **Contract Expiry Date:** Needs input: Expiry date could not be resolved from term or effective date."
    );
  });

  it("shows 'Not applicable (does not renew automatically)' for notice deadline when isAutoRenew is false", () => {
    const noAutoRenewItem = makeItem({
      itemType: "renewal",
      reviewStatus: "approved",
      currentValue: JSON.stringify({ isAutoRenew: false }),
    });

    const summary = compileReviewedSummary("Test Contract", 1, [noAutoRenewItem]);
    expect(summary.keyDates.noticeDeadline).toBe("Not applicable (does not renew automatically)");
    expect(summary.markdown).toContain(
      "- **Notice Deadline:** Not applicable (does not renew automatically)"
    );
    expect(summary.html).toContain(
      "<li><strong>Notice Deadline:</strong> Not applicable (does not renew automatically)</li>"
    );
  });
});
