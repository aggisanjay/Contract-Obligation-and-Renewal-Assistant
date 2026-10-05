import { describe, it, expect } from "vitest";
import {
  computeExpiryDate,
  computeNoticeDeadline,
  generateReminders,
  generateRecurringOccurrences,
  resolveRelativeDeadline,
  applyManualOverride,
  addMonthsClamped,
  isValidDateString,
  extractTermFromText,
  extractNoticeDaysFromText,
  resolveItemCalculatedDate,
} from "../src/services/dates.js";

describe("Deterministic Dates - Validation & Helpers", () => {
  it("validates valid and invalid YYYY-MM-DD date strings", () => {
    expect(isValidDateString("2025-01-15")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true); // Leap year
    expect(isValidDateString("2025-02-29")).toBe(false); // Not a leap year
    expect(isValidDateString("2025-13-01")).toBe(false);
    expect(isValidDateString("invalid-date")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });

  it("handles month-end clamping (Jan 31 + 1 month = Feb 28/29)", () => {
    // 2025 is not leap year -> Feb 28
    const jan31_2025 = addMonthsClamped("2025-01-31", 1);
    expect(jan31_2025).toBe("2025-02-28");

    // 2024 is leap year -> Feb 29
    const jan31_2024 = addMonthsClamped("2024-01-31", 1);
    expect(jan31_2024).toBe("2024-02-29");

    // March 31 + 1 month -> April 30
    const mar31 = addMonthsClamped("2025-03-31", 1);
    expect(mar31).toBe("2025-04-30");

    // August 31 + 1 month -> September 30
    const aug31 = addMonthsClamped("2025-08-31", 1);
    expect(aug31).toBe("2025-09-30");
  });

  it("handles Feb 29 in leap year plus 1 year -> Feb 28", () => {
    const leapNextYear = addMonthsClamped("2024-02-29", 12);
    expect(leapNextYear).toBe("2025-02-28");
  });
});

describe("Deterministic Dates - Expiry Calculation", () => {
  it("computes expiry from effective date and term in months", () => {
    const result = computeExpiryDate(
      {
        effectiveDate: "2025-01-01",
        termMonths: 12,
      },
      { today: "2025-01-01" }
    );
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.date).toBe("2026-01-01");
      expect(result.reminders.length).toBeGreaterThan(0);
    }
  });

  it("computes expiry with term in years", () => {
    const result = computeExpiryDate({
      effectiveDate: "2025-06-15",
      termYears: 3,
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.date).toBe("2028-06-15");
    }
  });

  it("returns explicit expiry date directly when provided", () => {
    const result = computeExpiryDate({
      effectiveDate: "2025-01-01",
      exactExpiryDate: "2027-12-31",
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.date).toBe("2027-12-31");
    }
  });

  it("returns needs_input when effective date is missing", () => {
    const result = computeExpiryDate({
      effectiveDate: "",
      termMonths: 12,
    });
    expect(result.status).toBe("needs_input");
    if (result.status === "needs_input") {
      expect(result.reason).toContain("Missing or invalid Effective Date");
    }
  });

  it("returns needs_input when term duration is zero or not specified", () => {
    const result = computeExpiryDate({
      effectiveDate: "2025-01-01",
      termMonths: 0,
      termYears: 0,
    });
    expect(result.status).toBe("needs_input");
    if (result.status === "needs_input") {
      expect(result.reason).toContain("Term duration is not specified or zero");
    }
  });
});

describe("Deterministic Dates - Notice Deadlines", () => {
  it("computes notice deadline by subtracting notice days from expiry", () => {
    const result = computeNoticeDeadline(
      {
        expiryDate: "2026-01-01",
        noticeDays: 30,
      },
      { today: "2025-01-01" }
    );
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.date).toBe("2025-12-02");
    }
  });

  it("computes notice deadline by subtracting notice months from expiry", () => {
    const result = computeNoticeDeadline(
      {
        expiryDate: "2026-06-30",
        noticeMonths: 3,
      },
      { today: "2025-01-01" }
    );
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.date).toBe("2026-03-30");
    }
  });

  it("rejects zero or negative notice periods with needs_input", () => {
    const zeroRes = computeNoticeDeadline({
      expiryDate: "2026-01-01",
      noticeDays: 0,
    });
    expect(zeroRes.status).toBe("needs_input");
    if (zeroRes.status === "needs_input") {
      expect(zeroRes.reason).toContain("zero");
    }

    const negRes = computeNoticeDeadline({
      expiryDate: "2026-01-01",
      noticeDays: -15,
    });
    expect(negRes.status).toBe("needs_input");
    if (negRes.status === "needs_input") {
      expect(negRes.reason).toContain("negative");
    }
  });

  it("returns needs_input when expiry date is missing", () => {
    const res = computeNoticeDeadline({
      expiryDate: "",
      noticeDays: 30,
    });
    expect(res.status).toBe("needs_input");
  });
});

describe("Deterministic Dates - Reminders & Past Suppression", () => {
  it("generates reminders at default offsets (30, 14, 7, 1 days)", () => {
    // Target date: 2025-12-31, injectable today: 2025-01-01 (all in future)
    const reminders = generateReminders("2025-12-31", {
      today: "2025-01-01",
      offsetsDays: [30, 14, 7, 1],
    });

    expect(reminders).toEqual([
      "2025-12-01", // 30 days before
      "2025-12-17", // 14 days before
      "2025-12-24", // 7 days before
      "2025-12-30", // 1 day before
    ]);
  });

  it("suppresses reminder dates that have already passed relative to today", () => {
    // Target date: 2025-02-15
    // Reminders would be: Jan 16 (30d), Feb 1 (14d), Feb 8 (7d), Feb 14 (1d)
    // If today is 2025-02-05: Jan 16 and Feb 1 are in the past and should be suppressed!
    const reminders = generateReminders("2025-02-15", {
      today: "2025-02-05",
      offsetsDays: [30, 14, 7, 1],
    });

    expect(reminders).toEqual([
      "2025-02-08", // 7 days before
      "2025-02-14", // 1 day before
    ]);
  });

  it("returns empty list if all reminder dates are in the past", () => {
    const reminders = generateReminders("2025-01-01", {
      today: "2025-01-05",
    });
    expect(reminders).toEqual([]);
  });
});

describe("Deterministic Dates - Recurrence Expansion", () => {
  it("expands monthly recurrence for N cycles", () => {
    const occurrences = generateRecurringOccurrences("2025-01-15", "monthly", 3);
    expect(occurrences).toEqual(["2025-02-15", "2025-03-15", "2025-04-15"]);
  });

  it("expands quarterly recurrence for N cycles", () => {
    const occurrences = generateRecurringOccurrences("2025-01-01", "quarterly", 4);
    expect(occurrences).toEqual([
      "2025-04-01",
      "2025-07-01",
      "2025-10-01",
      "2026-01-01",
    ]);
  });

  it("expands annual recurrence", () => {
    const occurrences = generateRecurringOccurrences("2025-05-01", "annual", 2);
    expect(occurrences).toEqual(["2026-05-01", "2027-05-01"]);
  });
});

describe("Deterministic Dates - Relative Deadline Resolution", () => {
  it("resolves 'within 30 days of effective date'", () => {
    const result = resolveRelativeDeadline("within 30 days of effective date", {
      effectiveDate: "2025-01-01",
      today: "2025-01-01",
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.date).toBe("2025-01-31");
    }
  });

  it("resolves '60 days prior to expiry'", () => {
    const result = resolveRelativeDeadline("60 days prior to expiry", {
      expiryDate: "2025-12-31",
      today: "2025-01-01",
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.date).toBe("2025-11-01");
    }
  });

  it("resolves 'end of initial term'", () => {
    const result = resolveRelativeDeadline("end of initial term", {
      expiryDate: "2026-06-30",
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.date).toBe("2026-06-30");
    }
  });

  it("returns needs_input when anchor date is missing", () => {
    const result = resolveRelativeDeadline("within 30 days of effective date", {
      effectiveDate: null,
    });
    expect(result.status).toBe("needs_input");
    if (result.status === "needs_input") {
      expect(result.reason).toContain("Effective Date is required");
    }
  });

  it("returns needs_input when relative rule text cannot be parsed", () => {
    const result = resolveRelativeDeadline("as mutually agreed by the parties later", {});
    expect(result.status).toBe("needs_input");
    if (result.status === "needs_input") {
      expect(result.reason).toContain("Could not parse relative deadline rule");
    }
  });
});

describe("Deterministic Dates - Manual Override", () => {
  it("applies manual override preserving original computed date and override", () => {
    const res = applyManualOverride("2025-12-01", "2025-12-15", "Agreed extension");
    expect(res.calculatedDate).toBe("2025-12-01");
    expect(res.manualDateOverride).toBe("2025-12-15");
    expect(res.isOverridden).toBe(true);
    expect(res.status).toBe("resolved");
    expect(res.reason).toBe("Agreed extension");
  });

  it("handles override reset to calculated date", () => {
    // When resetting, manualDateOverride is removed and original calculatedDate is restored
    const originalCalculated = "2025-12-01";
    const res = applyManualOverride(originalCalculated, "2025-12-15");
    expect(res.manualDateOverride).toBe("2025-12-15");

    // Simulating reset
    const resetResult = {
      calculatedDate: originalCalculated,
      manualDateOverride: null,
      isOverridden: false,
      status: "resolved",
      reason: "Reset to calculated date",
    };
    expect(resetResult.manualDateOverride).toBeNull();
    expect(resetResult.calculatedDate).toBe("2025-12-01");
  });

  it("rejects invalid manual date format", () => {
    const res = applyManualOverride("2025-12-01", "invalid-format");
    expect(res.status).toBe("needs_input");
    expect(res.isOverridden).toBe(false);
  });
});

describe("Deterministic Dates - Advanced Recurrence, Text Parsing & Fallbacks", () => {
  it("calculates quarter-end + 15 days from today", () => {
    // If today is 2026-10-04 (Q4 beginning), Q3 ended on 2026-09-30.
    // 2026-09-30 + 15 days = 2026-10-15 (>= today, so next occurrence is 2026-10-15)
    const res1 = resolveRelativeDeadline("within 15 days after each calendar quarter end", {
      today: "2026-10-04",
    });
    expect(res1.status).toBe("resolved");
    if (res1.status === "resolved") {
      expect(res1.date).toBe("2026-10-15");
      expect(res1.recurrence).toBe("quarterly");
    }

    // If today is 2026-10-20 (past Oct 15), next quarter is Q4 ending 2026-12-31.
    // 2026-12-31 + 15 days = 2027-01-15
    const res2 = resolveRelativeDeadline("quarterly within 15 days of period end", {
      today: "2026-10-20",
    });
    expect(res2.status).toBe("resolved");
    if (res2.status === "resolved") {
      expect(res2.date).toBe("2027-01-15");
      expect(res2.recurrence).toBe("quarterly");
    }
  });

  it("calculates month-end + N days from today", () => {
    // If today is 2026-05-10, April ended 2026-04-30.
    // 2026-04-30 + 5 days = 2026-05-05 (< today, so next is May end + 5 days)
    // May ends 2026-05-31 + 5 days = 2026-06-05
    const res = resolveRelativeDeadline("within 5 days after each calendar month end", {
      today: "2026-05-10",
    });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.date).toBe("2026-06-05");
      expect(res.recurrence).toBe("monthly");
    }
  });

  it("returns needs_input for invoice-anchored rules with no fixed date", () => {
    const res = resolveRelativeDeadline("within 30 days of receipt of each monthly invoice", {});
    expect(res.status).toBe("needs_input");
    if (res.status === "needs_input") {
      expect(res.reason).toBe("Recurring, event-based: no fixed date");
      expect(res.recurrence).toBe("monthly");
    }
  });

  it("returns needs_input for 'promptly' subjective standard", () => {
    const res = resolveRelativeDeadline("Vendor shall promptly provide written notification", {});
    expect(res.status).toBe("needs_input");
    if (res.status === "needs_input") {
      expect(res.reason).toContain("promptly");
    }
  });

  it("parses number words like 'twelve (12)', 'sixty (60)', and 'forty-five'", () => {
    const term12 = extractTermFromText("This agreement shall continue for twelve (12) months.");
    expect(term12).toEqual({ months: 12 });

    const notice60 = extractNoticeDaysFromText("written notice at least sixty (60) days prior");
    expect(notice60).toBe(60);

    const notice45 = extractNoticeDaysFromText("written notice at least forty-five days prior");
    expect(notice45).toBe(45);
  });

  it("falls back to clause-text quote when AI payload is missing dates (derived_from_quote)", () => {
    const item = {
      itemType: "term",
      currentValue: JSON.stringify({}), // Empty AI payload
      exactQuote: "The initial term of this Agreement shall commence on the Effective Date and continue for twelve (12) months.",
    };

    const res = resolveItemCalculatedDate(item, { effectiveDate: "2025-01-01" });
    expect(res.status).toBe("resolved");
    expect(res.calculatedDate).toBe("2026-01-01");
    expect(res.dateSource).toBe("derived_from_quote");
  });

  it("differentiates v1 vs v2 notice periods (30 days vs 60 days)", () => {
    const expiry = "2026-01-01";
    // v1: 30 days notice
    const v1Notice = computeNoticeDeadline({ expiryDate: expiry, noticeDays: 30 });
    expect(v1Notice.status).toBe("resolved");
    if (v1Notice.status === "resolved") {
      expect(v1Notice.date).toBe("2025-12-02");
    }

    // v2: 60 days notice
    const v2Notice = computeNoticeDeadline({ expiryDate: expiry, noticeDays: 60 });
    expect(v2Notice.status).toBe("resolved");
    if (v2Notice.status === "resolved") {
      expect(v2Notice.date).toBe("2025-11-02");
    }
  });

  it("validates leap years and non-leap years in date arithmetic", () => {
    // 2024 is a leap year (Feb 29 exists)
    expect(isValidDateString("2024-02-29")).toBe(true);
    // 2025 is not a leap year (Feb 29 invalid)
    expect(isValidDateString("2025-02-29")).toBe(false);

    // Adding 1 month to 2024-01-31 yields 2024-02-29
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    // Adding 1 month to 2025-01-31 yields 2025-02-28
    expect(addMonthsClamped("2025-01-31", 1)).toBe("2025-02-28");
  });
});

