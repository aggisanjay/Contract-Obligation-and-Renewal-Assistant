import { IngestionError } from "../../utils/errors.js";

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  pages: ExtractedPdfPage[];
  fullText: string;
  pageCount: number;
}

/**
 * Extracts text page-by-page from a PDF buffer using pdfjs-dist.
 * Rejects scanned / empty / password-protected / corrupt PDFs.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfExtractionResult> {
  let pdfjsLib: any;
  try {
    // Dynamic import to support ESM/CJS interop cleanly
    pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    pdfjsLib = await import("pdfjs-dist");
  }

  // Convert node Buffer to Uint8Array as required by pdfjs-dist
  const data = new Uint8Array(buffer);

  let doc: any;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    });
    doc = await loadingTask.promise;
  } catch (err: any) {
    if (err?.name === "PasswordException") {
      throw new IngestionError(
        "PDF is password-protected. Please upload an unprotected PDF.",
        "PASSWORD_PROTECTED_PDF"
      );
    }
    throw new IngestionError(
      `Corrupted or invalid PDF file: ${err?.message || "unknown error"}`,
      "CORRUPTED_PDF"
    );
  }

  const pageCount: number = doc.numPages;
  if (pageCount === 0) {
    throw new IngestionError("PDF contains no pages.", "EMPTY_PDF");
  }

  const pages: ExtractedPdfPage[] = [];
  let totalChars = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items into lines based on transform Y or string concatenation
    const strings: string[] = [];
    for (const item of textContent.items) {
      if ("str" in item && typeof item.str === "string") {
        strings.push(item.str);
      }
    }

    const pageText = strings.join(" ").replace(/[ \t]+/g, " ").trim();
    totalChars += pageText.length;
    pages.push({
      pageNumber: pageNum,
      text: pageText,
    });
  }

  // Check for scanned PDFs: if average characters per page is below threshold (e.g. 15 chars/page)
  // or total extractable text is empty
  const avgCharsPerPage = totalChars / pageCount;
  if (totalChars === 0 || (pageCount > 0 && avgCharsPerPage < 15)) {
    throw new IngestionError(
      "No extractable text found. OCR is not supported. Please upload a digital, text-based document.",
      "SCANNED_OR_EMPTY_PDF"
    );
  }

  const fullText = pages.map((p) => `--- [Page ${p.pageNumber}] ---\n${p.text}`).join("\n\n");

  return {
    pages,
    fullText,
    pageCount,
  };
}
