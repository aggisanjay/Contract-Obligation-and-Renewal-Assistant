import { describe, it, expect } from "vitest";
import { resolveItemCalculatedDate } from "../src/services/dates.js";
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
    calculatedDate: null,
    manualDateOverride: null,
    dateResolutionStatus: "unresolved",
    dateResolutionReason: null,
    dateSource: "ai_payload",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("Sample Contracts Deterministic Date Verification", () => {
  it("Scenario 1 (Lease): January 15, 2026 -> 2027-01-15 -> 2026-10-17", () => {
    // 1. Effective date from natural text
    const effRes = resolveItemCalculatedDate(
      {
        itemType: "effective_date",
        currentValue: JSON.stringify({ date: "January 15, 2026", isRelative: false }),
        exactQuote: "The Lease commences on January 15, 2026.",
      },
      {}
    );
    expect(effRes.status).toBe("resolved");
    expect(effRes.calculatedDate).toBe("2026-01-15");

    // 2. Expiry from 12 months term
    const expRes = resolveItemCalculatedDate(
      {
        itemType: "expiry",
        currentValue: JSON.stringify({ termLengthMonths: 12 }),
        exactQuote: "The initial term shall be twelve (12) months from the Effective Date.",
      },
      { effectiveDate: effRes.calculatedDate }
    );
    expect(expRes.status).toBe("resolved");
    expect(expRes.calculatedDate).toBe("2027-01-15");

    // 3. Notice deadline 90 days before expiry
    const noticeRes = resolveItemCalculatedDate(
      {
        itemType: "renewal",
        currentValue: JSON.stringify({ isAutoRenew: true, advanceNoticeDays: 90 }),
        exactQuote: "written notice of non-renewal at least ninety (90) days prior to expiration",
      },
      { effectiveDate: effRes.calculatedDate, expiryDate: expRes.calculatedDate }
    );
    expect(noticeRes.status).toBe("resolved");
    expect(noticeRes.calculatedDate).toBe("2026-10-17");

    // 4. Summary verification
    const items = [
      makeItem({
        itemType: "effective_date",
        calculatedDate: effRes.calculatedDate,
        dateResolutionStatus: "resolved",
      }),
      makeItem({
        itemType: "expiry",
        calculatedDate: expRes.calculatedDate,
        dateResolutionStatus: "resolved",
      }),
      makeItem({
        itemType: "renewal",
        calculatedDate: noticeRes.calculatedDate,
        dateResolutionStatus: "resolved",
        currentValue: JSON.stringify({ isAutoRenew: true, advanceNoticeDays: 90 }),
      }),
    ];

    const summary = compileReviewedSummary("Commercial Lease Agreement", 1, items);
    expect(summary.keyDates.effectiveDate).toBe("2026-01-15");
    expect(summary.keyDates.expiryDate).toBe("2027-01-15");
    expect(summary.keyDates.noticeDeadline).toBe("2026-10-17");
  });

  it("Scenario 2 (SaaS): 2026-11-02 -> 2027-05-02 -> 2027-04-02 with 60-day conflict flagged", () => {
    // 1. Effective date
    const effRes = resolveItemCalculatedDate(
      {
        itemType: "effective_date",
        currentValue: JSON.stringify({ date: "November 2, 2026", isRelative: false }),
        exactQuote: "Effective Date: November 2, 2026",
      },
      {}
    );
    expect(effRes.status).toBe("resolved");
    expect(effRes.calculatedDate).toBe("2026-11-02");

    // 2. Expiry from 6 months term
    const expRes = resolveItemCalculatedDate(
      {
        itemType: "expiry",
        currentValue: JSON.stringify({ termLengthMonths: 6 }),
        exactQuote: "Initial term shall continue for six (6) months.",
      },
      { effectiveDate: effRes.calculatedDate }
    );
    expect(expRes.status).toBe("resolved");
    expect(expRes.calculatedDate).toBe("2027-05-02");

    // 3. Notice deadline 30 days before expiry
    const noticeRes = resolveItemCalculatedDate(
      {
        itemType: "renewal",
        currentValue: JSON.stringify({ isAutoRenew: true, advanceNoticeDays: 30 }),
        exactQuote: "at least thirty (30) days prior to the expiration date",
      },
      { effectiveDate: effRes.calculatedDate, expiryDate: expRes.calculatedDate }
    );
    expect(noticeRes.status).toBe("resolved");
    expect(noticeRes.calculatedDate).toBe("2027-04-02");

    // 4. Ambiguity / conflict item
    const conflictItem = makeItem({
      itemType: "conflict",
      reviewStatus: "pending",
      currentValue: JSON.stringify({
        description: "Contradictory notice period: Section 2.1 requires 30 days notice while Section 8 requires 60 days.",
        riskLevel: "high",
      }),
    });

    const items = [
      makeItem({
        itemType: "effective_date",
        calculatedDate: effRes.calculatedDate,
        dateResolutionStatus: "resolved",
      }),
      makeItem({
        itemType: "expiry",
        calculatedDate: expRes.calculatedDate,
        dateResolutionStatus: "resolved",
      }),
      makeItem({
        itemType: "renewal",
        calculatedDate: noticeRes.calculatedDate,
        dateResolutionStatus: "resolved",
        currentValue: JSON.stringify({ isAutoRenew: true, advanceNoticeDays: 30 }),
      }),
      conflictItem,
    ];

    const summary = compileReviewedSummary("SaaS Subscription Agreement", 1, items);
    expect(summary.keyDates.effectiveDate).toBe("2026-11-02");
    expect(summary.keyDates.expiryDate).toBe("2027-05-02");
    expect(summary.keyDates.noticeDeadline).toBe("2027-04-02");
    expect(summary.openQuestionsAndAmbiguities.length).toBeGreaterThanOrEqual(1);
    expect(summary.openQuestionsAndAmbiguities[0].description).toContain("Contradictory notice period");
  });

  it("Scenario 3 (Advisory): relative date stays needs_input until set to 2026-11-20, expiry 2028-11-20, notice not applicable", () => {
    // 1. Relative effective date stays needs_input
    const effRes = resolveItemCalculatedDate(
      {
        itemType: "effective_date",
        currentValue: JSON.stringify({ date: null, isRelative: true, relativeRule: "date of last signature" }),
        exactQuote: "Effective as of the date of last signature below.",
      },
      {}
    );
    expect(effRes.status).toBe("needs_input");
    expect(effRes.calculatedDate).toBeNull();
    expect(effRes.reason).toContain("Effective date is relative");

    // 2. Summary before human sets date:
    const relativeEffItem = makeItem({
      itemType: "effective_date",
      reviewStatus: "approved",
      calculatedDate: null,
      dateResolutionStatus: "needs_input",
      dateResolutionReason: effRes.reason,
    });
    const expItemPending = makeItem({
      itemType: "expiry",
      reviewStatus: "approved",
      calculatedDate: null,
      dateResolutionStatus: "needs_input",
      dateResolutionReason: "Missing effective date to compute expiry.",
    });
    const noAutoRenewItem = makeItem({
      itemType: "renewal",
      reviewStatus: "approved",
      currentValue: JSON.stringify({ isAutoRenew: false, renewalType: "none" }),
    });

    const summaryBefore = compileReviewedSummary("Advisory Agreement", 1, [
      relativeEffItem,
      expItemPending,
      noAutoRenewItem,
    ]);
    expect(summaryBefore.keyDates.effectiveDate).toContain("Needs input:");
    expect(summaryBefore.keyDates.noticeDeadline).toBe("Not applicable (does not renew automatically)");

    // 3. Human sets manual override: 2026-11-20
    const humanEffectiveDate = "2026-11-20";
    relativeEffItem.manualDateOverride = humanEffectiveDate;

    // 4. Recalculate expiry with 24 months (2 years)
    const expRes = resolveItemCalculatedDate(
      {
        itemType: "expiry",
        currentValue: JSON.stringify({ termLengthYears: 2 }),
        exactQuote: "The term shall continue for two (2) years from the Effective Date.",
      },
      { effectiveDate: humanEffectiveDate }
    );
    expect(expRes.status).toBe("resolved");
    expect(expRes.calculatedDate).toBe("2028-11-20");

    expItemPending.calculatedDate = expRes.calculatedDate;
    expItemPending.dateResolutionStatus = "resolved";

    const summaryAfter = compileReviewedSummary("Advisory Agreement", 1, [
      relativeEffItem,
      expItemPending,
      noAutoRenewItem,
    ]);
    expect(summaryAfter.keyDates.effectiveDate).toBe("2026-11-20");
    expect(summaryAfter.keyDates.expiryDate).toBe("2028-11-20");
    expect(summaryAfter.keyDates.noticeDeadline).toBe("Not applicable (does not renew automatically)");
  });
});
