import { describe, it, expect } from "vitest";
import { parseSections } from "../src/services/ingestion/sectionParser.js";
import { ingestDocument } from "../src/services/ingestion/index.js";
import { IngestionError } from "../src/utils/errors.js";

describe("Section Parser", () => {
  it("parses numbered clauses correctly with heading and text", () => {
    const sampleContract = `
1. DEFINITIONS AND INTERPRETATION
In this Agreement, capitalized terms have the definitions set forth herein.

2. TERM AND RENEWAL
The initial term of this Agreement shall be twelve (12) months from the Effective Date.

2.1 Automatic Renewal
This Agreement shall automatically renew for successive one-year periods unless either party provides written notice.

3. PAYMENT AND INVOICING
Client shall pay all fees within 30 days of receiving the invoice.
    `.trim();

    const sections = parseSections(sampleContract, "contract");
    expect(sections.length).toBeGreaterThanOrEqual(3);

    const termSection = sections.find((s) => s.label.includes("2"));
    expect(termSection).toBeDefined();
    expect(termSection?.text).toContain("initial term");
    expect(termSection?.charStart).toBeGreaterThanOrEqual(0);
    expect(termSection?.charEnd).toBeGreaterThan(termSection!.charStart);
  });

  it("handles Section X.Y formatted clauses", () => {
    const sampleContract = `
Section 1.1 Parties
This Agreement is between Acme Corp and Beta LLC.

Section 1.2 Effective Date
The effective date is June 1, 2025.

Section 5.3 Termination for Convenience
Either party may terminate upon sixty (60) days prior written notice.
    `.trim();

    const sections = parseSections(sampleContract, "contract");
    expect(sections.length).toBe(3);
    expect(sections[0]?.label).toBe("Section 1.1");
    expect(sections[0]?.heading).toBe("Parties");
    expect(sections[2]?.label).toBe("Section 5.3");
    expect(sections[2]?.heading).toBe("Termination for Convenience");
  });

  it("falls back to uppercase headings if no numbering exists", () => {
    const unnumberedContract = `
INTRODUCTION
This is the intro text of the agreement between the parties.

CONFIDENTIALITY
Each party agrees to maintain confidentiality of proprietary data.

GOVERNING LAW
This agreement is governed by the laws of California.
    `.trim();

    const sections = parseSections(unnumberedContract, "contract");
    expect(sections.length).toBe(3);
    expect(sections[0]?.label).toBe("INTRODUCTION");
    expect(sections[1]?.label).toBe("CONFIDENTIALITY");
    expect(sections[2]?.label).toBe("GOVERNING LAW");
  });

  it("falls back to Paragraph N when no headings or numbering exist", () => {
    const rawParagraphs = `
The quick brown fox jumps over the lazy dog. This is just casual text without any headers.

Another paragraph following the first one, talking about some generic obligations.

A final concluding paragraph with no distinct titles or section markers.
    `.trim();

    const sections = parseSections(rawParagraphs, "contract");
    expect(sections.length).toBe(3);
    expect(sections[0]?.label).toBe("Paragraph 1");
    expect(sections[1]?.label).toBe("Paragraph 2");
    expect(sections[2]?.label).toBe("Paragraph 3");
  });

  it("assigns page numbers accurately when provided with page-separated input", () => {
    const pages = [
      {
        pageNumber: 1,
        text: "Section 1. Parties\nParty A and Party B agree to the terms.",
      },
      {
        pageNumber: 2,
        text: "Section 2. Term\nThe term shall be 24 months.\n\nSection 3. Payment\nPayment due net 30.",
      },
    ];

    const sections = parseSections(pages, "contract");
    expect(sections.length).toBe(3);
    expect(sections[0]?.page).toBe(1);
    expect(sections[1]?.page).toBe(2);
    expect(sections[2]?.page).toBe(2);
  });

  it("verifies citations to sub-clauses (e.g. Section 2.1) residing in parent sections without false warnings", async () => {
    const { verifyCitation } = await import("../src/services/citationVerifier.js");
    const mockSections = [
      {
        id: "sec-2",
        contractVersionId: "ver-1",
        sectionIndex: 1,
        label: "Section 2",
        heading: "Term & Renewal",
        text: "The initial term is 12 months. This Agreement shall automatically renew for additional one-year terms.",
        page: 1,
        charStart: 0,
        charEnd: 110,
        documentType: "contract" as const,
      },
    ];

    // Citing subclause "Section 2.1" where the text is in "Section 2"
    const result = verifyCitation(
      "This Agreement shall automatically renew for additional one-year terms.",
      "Section 2.1",
      null,
      mockSections
    );

    expect(result.accepted).toBe(true);
    expect(result.citationVerified).toBe(true);
    expect(result.warning).toBeNull();
    expect(result.matchedSectionId).toBe("sec-2");
  });
});

describe("Ingestion Service", () => {
  it("successfully ingests pasted text", async () => {
    const text = `
Section 1. Scope
The Vendor shall deliver software services.

Section 2. Fees
Payment is $10,000 annually.
    `.trim();

    const result = await ingestDocument(text, { filename: "Pasted Agreement" });
    expect(result.fileType).toBe("text");
    expect(result.sections.length).toBe(2);
    expect(result.rawText).toContain("Vendor shall deliver");
  });

  it("rejects empty text document", async () => {
    await expect(ingestDocument("   ", { filename: "empty.txt" })).rejects.toThrow(
      IngestionError
    );
  });

  it("rejects files exceeding 10MB limit", async () => {
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB
    await expect(
      ingestDocument(largeBuffer, { filename: "large.pdf", mimetype: "application/pdf" })
    ).rejects.toThrow(/exceeds 10 MB limit/);
  });

  it("rejects unsupported file extensions", async () => {
    const buffer = Buffer.from("image content");
    await expect(
      ingestDocument(buffer, { filename: "photo.png", mimetype: "image/png" })
    ).rejects.toThrow(/Unsupported file type/);
  });
});
