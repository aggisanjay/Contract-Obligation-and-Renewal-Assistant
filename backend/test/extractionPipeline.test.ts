import { describe, it, expect } from "vitest";
import { DocumentSection } from "@contract-assistant/shared";
import { verifyCitation, normalizeForCitation } from "../src/services/citationVerifier.js";
import { sanitizeAdvisoryContent, sanitizePayloadRecursively } from "../src/llm/guardrailFilter.js";
import { runExtractionPipeline } from "../src/services/extractionPipeline.js";
import { MockLLMClient } from "../src/llm/client.js";

describe("Citation Verifier", () => {
  const dummySections: DocumentSection[] = [
    {
      id: "sec-1",
      contractVersionId: "ver-1",
      sectionIndex: 0,
      label: "Section 1",
      heading: "Term and Expiry",
      text: 'The initial term shall be twelve (12) months from the Effective Date.\nEither party may provide notice of non-renewal.',
      page: 1,
      charStart: 0,
      charEnd: 120,
      documentType: "contract",
    },
    {
      id: "sec-2",
      contractVersionId: "ver-1",
      sectionIndex: 1,
      label: "Section 2",
      heading: "Payment Terms",
      text: "Customer shall remit payment within thirty (30) days of receiving each invoice.",
      page: 2,
      charStart: 122,
      charEnd: 210,
      documentType: "contract",
    },
  ];

  it("verifies exact match with punctuation and casing normalization", () => {
    const quote = "twelve (12) months from the Effective Date";
    const res = verifyCitation(quote, "Section 1", "sec-1", dummySections);
    expect(res.accepted).toBe(true);
    expect(res.citationVerified).toBe(true);
    expect(res.warning).toBeNull();
  });

  it("verifies match when text has smart quotes or extra spaces", () => {
    const quote = ' "twelve  (12)  months" ';
    const res = verifyCitation(quote, "Section 1", "sec-1", dummySections);
    expect(res.accepted).toBe(true);
    expect(res.citationVerified).toBe(true);
  });

  it("rejects items with completely missing or empty quotes", () => {
    const res = verifyCitation("   ", "Section 1", "sec-1", dummySections);
    expect(res.accepted).toBe(false);
    expect(res.rejectionReason).toContain("Missing citation quote");
  });

  it("flags quote when it appears in a different section than cited", () => {
    const quote = "within thirty (30) days of receiving each invoice";
    // Incorrectly cited as Section 1, but actually in Section 2
    const res = verifyCitation(quote, "Section 1", "sec-1", dummySections);
    expect(res.accepted).toBe(true);
    expect(res.citationVerified).toBe(false);
    expect(res.warning).toContain("found in 'Section 2', not in cited 'Section 1'");
  });

  it("downgrades item when quote does not exist anywhere in document", () => {
    const hallucinatedQuote = "Vendor shall pay a penalty of $10,000 for each day of delay.";
    const res = verifyCitation(hallucinatedQuote, "Section 2", "sec-2", dummySections);
    expect(res.accepted).toBe(true);
    expect(res.citationVerified).toBe(false);
    expect(res.warning).toContain("could not be located in section text");
  });
});

describe("Advisory Guardrail Filter", () => {
  it("strips prescriptive legal advice phrases", () => {
    const textWithAdvice = "You should terminate this agreement immediately because of breach.";
    const result = sanitizeAdvisoryContent(textWithAdvice);
    expect(result.isClean).toBe(false);
    expect(result.sanitizedText).toContain("[Advisory recommendation removed: consult legal counsel]");
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("strips enforceability claims", () => {
    const textWithClaim = "Note that this clause is unenforceable under governing jurisdiction.";
    const result = sanitizeAdvisoryContent(textWithClaim);
    expect(result.isClean).toBe(false);
    expect(result.sanitizedText).toContain("[Legal validity assertion removed]");
  });

  it("strips subjective legal risk opinions", () => {
    const textWithRisk = "This indemnity represents a high legal risk for the organization.";
    const result = sanitizeAdvisoryContent(textWithRisk);
    expect(result.isClean).toBe(false);
    expect(result.sanitizedText).toContain("[Subjective risk opinion removed]");
  });

  it("preserves purely factual contract summaries intact", () => {
    const factualText = "Agreement term is 12 months with 30 days non-renewal notice.";
    const result = sanitizeAdvisoryContent(factualText);
    expect(result.isClean).toBe(true);
    expect(result.sanitizedText).toBe(factualText);
  });

  it("recursively sanitizes complex objects", () => {
    const payload = {
      title: "Notice clause",
      details: {
        recommendation: "You must terminate before January 1st.",
        fact: "Notice period is 30 days.",
      },
    };
    const { sanitized, flaggedCount } = sanitizePayloadRecursively(payload);
    expect(flaggedCount).toBe(1);
    expect(sanitized.details.recommendation).toContain("[Advisory recommendation removed: consult legal counsel]");
    expect(sanitized.details.fact).toBe("Notice period is 30 days.");
  });
});

describe("AI Extraction Pipeline Execution", () => {
  const contractSections: DocumentSection[] = [
    {
      id: "sec-preamble",
      contractVersionId: "ver-1",
      sectionIndex: 0,
      label: "Preamble",
      heading: "Parties",
      text: 'This Master Services Agreement is entered into by Acme Cloud Services Inc. ("Vendor") and Apex Logistics LLC ("Customer").',
      page: 1,
      charStart: 0,
      charEnd: 130,
      documentType: "contract",
    },
    {
      id: "sec-1",
      contractVersionId: "ver-1",
      sectionIndex: 1,
      label: "Section 1",
      heading: "Effective Date",
      text: "The Effective Date of this Agreement shall be January 1, 2025.",
      page: 1,
      charStart: 132,
      charEnd: 195,
      documentType: "contract",
    },
    {
      id: "sec-2",
      contractVersionId: "ver-1",
      sectionIndex: 2,
      label: "Section 2",
      heading: "Term",
      text: "The initial term of this Agreement shall commence on the Effective Date and continue for twelve (12) months.",
      page: 1,
      charStart: 197,
      charEnd: 305,
      documentType: "contract",
    },
    {
      id: "sec-2.1",
      contractVersionId: "ver-1",
      sectionIndex: 3,
      label: "Section 2.1",
      heading: "Renewal",
      text: "This Agreement shall automatically renew for additional one-year terms unless either party provides written notice of non-renewal at least thirty (30) days prior.",
      page: 2,
      charStart: 307,
      charEnd: 470,
      documentType: "contract",
    },
    {
      id: "sec-4.2",
      contractVersionId: "ver-1",
      sectionIndex: 4,
      label: "Section 4.2",
      heading: "Payment",
      text: "Client shall remit payment within thirty (30) days following receipt of each monthly invoice.",
      page: 2,
      charStart: 472,
      charEnd: 565,
      documentType: "contract",
    },
    {
      id: "sec-5.2",
      contractVersionId: "ver-1",
      sectionIndex: 5,
      label: "Section 5.2",
      heading: "Support",
      text: "Vendor will use commercially reasonable efforts to resolve support tickets promptly.",
      page: 3,
      charStart: 567,
      charEnd: 652,
      documentType: "contract",
    },
  ];

  it("extracts and verifies citations for all pipeline steps with MockLLMClient", async () => {
    const mockClient = new MockLLMClient();
    const result = await runExtractionPipeline(contractSections, null, {
      client: mockClient,
    });

    expect(result.stepErrors.length).toBe(0);
    expect(result.items.length).toBeGreaterThanOrEqual(6);

    const partyItems = result.items.filter((i) => i.itemType === "party");
    expect(partyItems.length).toBe(2);
    expect(partyItems[0]?.citationVerified).toBe(true);

    const renewalItem = result.items.find((i) => i.itemType === "renewal");
    expect(renewalItem).toBeDefined();
    expect(renewalItem?.citationVerified).toBe(true);

    const ambiguityItem = result.items.find((i) => i.itemType === "ambiguity");
    expect(ambiguityItem).toBeDefined();
    expect(ambiguityItem?.status).toBe("uncertain");
  });

  it("downgrades hallucinated citations to uncertain during pipeline run", async () => {
    const defaultMock = new MockLLMClient();
    const mockClient = new MockLLMClient((prompt) => {
      const lower = prompt.toLowerCase();
      if (lower.includes("parties") || lower.includes("effective date")) {
        return {
          parties: [
            {
              name: "Ghost Corp",
              role: "Observer",
              sourceSectionLabel: "Section 1",
              exactQuote: "Ghost Corp is an unnamed third party beneficiary not in the text.",
              confidence: 0.9,
              status: "confirmed",
            },
          ],
          effectiveDate: null,
        };
      }
      if (lower.includes("term, expiry, renewal") || lower.includes("renewal")) {
        return { term: null, renewal: null, termination: null, notice: null };
      }
      if (lower.includes("obligations")) {
        return { obligations: [] };
      }
      if (lower.includes("ambiguities")) {
        return { ambiguitiesAndConflicts: [] };
      }
      if (lower.includes("clarification questions")) {
        return { clarificationQuestions: [] };
      }
      return {};
    });

    const result = await runExtractionPipeline(contractSections, null, {
      client: mockClient,
    });

    const ghostItem = result.items.find((i) => i.itemType === "party");
    expect(ghostItem).toBeDefined();
    expect(ghostItem?.citationVerified).toBe(false);
    expect(ghostItem?.status).toBe("uncertain");
    expect(ghostItem?.citationWarning).toContain("could not be located in section text");
  });
});
