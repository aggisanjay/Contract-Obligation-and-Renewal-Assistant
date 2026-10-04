import { describe, it, expect } from "vitest";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { ingestDocument } from "../src/services/ingestion/index.js";
import { extractTextFromPdf } from "../src/services/ingestion/pdf.js";
import { verifyCitation } from "../src/services/citationVerifier.js";
import { IngestionError } from "../src/utils/errors.js";

describe("PDF Ingestion & Section Parsing", () => {
  /**
   * Helper to create a multi-page PDF with clear clause structure and line breaks.
   */
  async function createMultiPageSamplePdf(): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Page 1
    const page1 = pdfDoc.addPage([600, 800]);
    // Draw Section 1.1 heading and body with vertical gap
    page1.drawText("Section 1.1 Parties", {
      x: 50,
      y: 720,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
    page1.drawText("This Agreement is entered into between Alpha Corp and Beta LLC.", {
      x: 50,
      y: 680,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
    page1.drawText("The parties wish to collaborate on cloud infrastructure services.", {
      x: 50,
      y: 664,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    // Draw Section 2.1 heading and body
    page1.drawText("Section 2.1 Term and Renewal", {
      x: 50,
      y: 600,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
    page1.drawText("The initial term of this Agreement is 24 months from the Effective Date.", {
      x: 50,
      y: 560,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
    page1.drawText("It shall auto renew unless written notice is given 30 days prior.", {
      x: 50,
      y: 544,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    // Page 2
    const page2 = pdfDoc.addPage([600, 800]);
    page2.drawText("Section 3.1 Payment Obligations", {
      x: 50,
      y: 720,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
    page2.drawText("Beta LLC agrees to pay an annual subscription fee of $50,000 USD.", {
      x: 50,
      y: 680,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
    page2.drawText("Invoices are payable within 30 calendar days upon receipt.", {
      x: 50,
      y: 664,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    page2.drawText("Section 4.1 Governing Law", {
      x: 50,
      y: 600,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
    page2.drawText("This Agreement shall be construed and governed by Delaware state law.", {
      x: 50,
      y: 560,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  it("extracts text with line breaks preserved across multiple pages", async () => {
    const pdfBuffer = await createMultiPageSamplePdf();
    const result = await extractTextFromPdf(pdfBuffer);

    expect(result.pageCount).toBe(2);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[1].pageNumber).toBe(2);

    // Verify newline separation exists
    expect(result.pages[0].text).toContain("\n");
    expect(result.pages[0].text).toContain("Section 1.1 Parties");
    expect(result.pages[0].text).toContain("Section 2.1 Term and Renewal");
    expect(result.pages[1].text).toContain("Section 3.1 Payment Obligations");
  });

  it("ingests multi-page PDF into structured sections with accurate pages and verifiable citations", async () => {
    const pdfBuffer = await createMultiPageSamplePdf();
    const doc = await ingestDocument(pdfBuffer, { filename: "master_services_agreement.pdf" });

    expect(doc.fileType).toBe("pdf");
    expect(doc.pageCount).toBe(2);
    expect(doc.sections.length).toBeGreaterThanOrEqual(4);

    // Verify Section 1.1
    const sec1 = doc.sections.find((s) => s.label.includes("1.1"));
    expect(sec1).toBeDefined();
    expect(sec1?.heading).toBe("Parties");
    expect(sec1?.page).toBe(1);
    expect(sec1?.text).toContain("Alpha Corp and Beta LLC");

    // Verify Section 2.1
    const sec2 = doc.sections.find((s) => s.label.includes("2.1"));
    expect(sec2).toBeDefined();
    expect(sec2?.heading).toBe("Term and Renewal");
    expect(sec2?.page).toBe(1);
    expect(sec2?.text).toContain("24 months");

    // Verify Section 3.1 on page 2
    const sec3 = doc.sections.find((s) => s.label.includes("3.1"));
    expect(sec3).toBeDefined();
    expect(sec3?.heading).toBe("Payment Obligations");
    expect(sec3?.page).toBe(2);
    expect(sec3?.text).toContain("$50,000 USD");

    // Verify Section 4.1 on page 2
    const sec4 = doc.sections.find((s) => s.label.includes("4.1"));
    expect(sec4).toBeDefined();
    expect(sec4?.heading).toBe("Governing Law");
    expect(sec4?.page).toBe(2);
    expect(sec4?.text).toContain("Delaware state law");

    // Test Citation Verifier against extracted sections
    const mockSections = doc.sections.map((s, idx) => ({
      id: `sec-${idx}`,
      contractId: "c1",
      sectionIndex: s.sectionIndex,
      label: s.label,
      heading: s.heading,
      text: s.text,
      page: s.page,
      charStart: s.charStart,
      charEnd: s.charEnd,
      documentType: "contract" as const,
      createdAt: new Date(),
    }));

    const citationCheck1 = verifyCitation(
      "initial term of this Agreement is 24 months",
      "Section 2.1",
      null,
      mockSections
    );
    expect(citationCheck1.accepted).toBe(true);
    expect(citationCheck1.citationVerified).toBe(true);
    expect(citationCheck1.matchedSectionLabel).toBe(sec2?.label);

    const citationCheck2 = verifyCitation(
      "annual subscription fee of $50,000 USD",
      "Section 3.1",
      null,
      mockSections
    );
    expect(citationCheck2.accepted).toBe(true);
    expect(citationCheck2.citationVerified).toBe(true);
    expect(citationCheck2.matchedSectionLabel).toBe(sec3?.label);
  });

  it("rejects scanned or empty PDFs (< 50 chars) with specific OCR error message", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    // Draw minimal text under 50 characters (e.g. "Scan 1")
    page.drawText("Scan 1", { x: 50, y: 700, size: 12, font });

    const sparsePdf = Buffer.from(await pdfDoc.save());

    await expect(
      ingestDocument(sparsePdf, { filename: "scanned_invoice.pdf" })
    ).rejects.toThrow(
      "OCR is not supported for scanned PDFs. Please upload a text-based document or paste text directly."
    );
  });

  it("rejects corrupted PDF buffers", async () => {
    const corruptedBuffer = Buffer.from("%PDF-1.4 corrupt junk bytes that cannot be read %%EOF");

    await expect(
      ingestDocument(corruptedBuffer, { filename: "broken.pdf" })
    ).rejects.toThrow(IngestionError);
  });
});
