import { describe, it, expect } from "vitest";
import { parseNaturalDate, resolveItemCalculatedDate } from "../src/services/dates.js";

describe("Natural Written Date Parsing (parseNaturalDate)", () => {
  it("converts standard Month Day, Year format", () => {
    expect(parseNaturalDate("January 15, 2026")).toBe("2026-01-15");
    expect(parseNaturalDate("October 26, 2026")).toBe("2026-10-26");
    expect(parseNaturalDate("December 31, 2025")).toBe("2025-12-31");
  });

  it("converts abbreviated months with punctuation and ordinal suffixes", () => {
    expect(parseNaturalDate("Jan. 5th, 2027")).toBe("2027-01-05");
    expect(parseNaturalDate("Oct. 26th, 2026")).toBe("2026-10-26");
    expect(parseNaturalDate("Nov 2, 2026")).toBe("2026-11-02");
    expect(parseNaturalDate("Sept. 1st, 2026")).toBe("2026-09-01");
  });

  it("converts Day Month Year format", () => {
    expect(parseNaturalDate("15 January 2026")).toBe("2026-01-15");
    expect(parseNaturalDate("26th of October, 2026")).toBe("2026-10-26");
    expect(parseNaturalDate("the 3rd day of March, 2027")).toBe("2027-03-03");
    expect(parseNaturalDate("1st day of January 2026")).toBe("2026-01-01");
  });

  it("extracts natural dates embedded within contract clause sentences", () => {
    expect(
      parseNaturalDate('This Agreement is entered into as of January 15, 2026 ("Effective Date")')
    ).toBe("2026-01-15");
    expect(
      parseNaturalDate('commencing on the 1st day of July, 2026 and continuing thereafter')
    ).toBe("2026-07-01");
  });

  it("rejects impossible calendar dates (returns null)", () => {
    expect(parseNaturalDate("February 30, 2026")).toBeNull();
    expect(parseNaturalDate("April 31, 2026")).toBeNull();
    expect(parseNaturalDate("June 31, 2026")).toBeNull();
    expect(parseNaturalDate("November 31, 2026")).toBeNull();
    // 2025 is not a leap year
    expect(parseNaturalDate("February 29, 2025")).toBeNull();
  });

  it("accepts February 29 on leap years", () => {
    expect(parseNaturalDate("February 29, 2024")).toBe("2024-02-29");
    expect(parseNaturalDate("February 29, 2028")).toBe("2028-02-29");
  });

  it("rejects ambiguous purely numeric dates (returns null)", () => {
    expect(parseNaturalDate("01/02/2026")).toBeNull();
    expect(parseNaturalDate("12/05/2025")).toBeNull();
    expect(parseNaturalDate("05-06-2027")).toBeNull();
  });

  it("returns null for non-date text and invalid types", () => {
    expect(parseNaturalDate("")).toBeNull();
    expect(parseNaturalDate("Not a date")).toBeNull();
    expect(parseNaturalDate(null)).toBeNull();
    expect(parseNaturalDate(undefined)).toBeNull();
  });
});

describe("Effective Date Resolution Hierarchy in resolveItemCalculatedDate", () => {
  it("resolves (1) valid ISO in payload.date", () => {
    const res = resolveItemCalculatedDate(
      {
        itemType: "effective_date",
        currentValue: JSON.stringify({ date: "2026-01-15" }),
      },
      {}
    );
    expect(res.status).toBe("resolved");
    expect(res.calculatedDate).toBe("2026-01-15");
    expect(res.dateSource).toBe("ai_payload");
  });

  it("resolves (2) natural written date in payload.date", () => {
    const res = resolveItemCalculatedDate(
      {
        itemType: "effective_date",
        currentValue: JSON.stringify({ date: "January 15, 2026" }),
      },
      {}
    );
    expect(res.status).toBe("resolved");
    expect(res.calculatedDate).toBe("2026-01-15");
    expect(res.dateSource).toBe("ai_payload");
  });

  it("handles (3) relative effective date (isRelative: true) and NEVER guesses from quote", () => {
    const res = resolveItemCalculatedDate(
      {
        itemType: "effective_date",
        currentValue: JSON.stringify({ isRelative: true }),
        exactQuote: "Effective on the date of last signature, November 20, 2026.",
      },
      {}
    );
    expect(res.status).toBe("needs_input");
    expect(res.calculatedDate).toBeNull();
    expect(res.reason).toBe(
      "Effective date is relative (for example, the date of last signature). Confirm the date manually."
    );
  });

  it("resolves (4) ISO date in quote when payload date is missing", () => {
    const res = resolveItemCalculatedDate(
      {
        itemType: "effective_date",
        currentValue: JSON.stringify({}),
        exactQuote: "Effective Date shall be 2026-11-02.",
      },
      {}
    );
    expect(res.status).toBe("resolved");
    expect(res.calculatedDate).toBe("2026-11-02");
    expect(res.dateSource).toBe("derived_from_quote");
  });

  it("resolves (5) natural date in quote when payload date is missing", () => {
    const res = resolveItemCalculatedDate(
      {
        itemType: "effective_date",
        currentValue: JSON.stringify({}),
        exactQuote: "This agreement is made effective as of the 3rd day of March, 2027.",
      },
      {}
    );
    expect(res.status).toBe("resolved");
    expect(res.calculatedDate).toBe("2027-03-03");
    expect(res.dateSource).toBe("derived_from_quote");
  });

  it("returns (6) needs_input when effective date cannot be parsed", () => {
    const res = resolveItemCalculatedDate(
      {
        itemType: "effective_date",
        currentValue: JSON.stringify({ date: "unspecified" }),
        exactQuote: "Effective date to be determined by mutual consent.",
      },
      {}
    );
    expect(res.status).toBe("needs_input");
    expect(res.calculatedDate).toBeNull();
    expect(res.reason).toBe("Effective date could not be parsed.");
  });
});
