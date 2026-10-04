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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: { numPages: number; getPage: (pageIndex: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> };
  try {
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    });
    doc = await loadingTask.promise;
  } catch (err: unknown) {
    const errObj = typeof err === "object" && err !== null ? (err as { name?: string; message?: string }) : null;
    if (errObj?.name === "PasswordException") {
      throw new IngestionError(
        "PDF is password-protected. Please upload an unprotected PDF.",
        "PASSWORD_PROTECTED_PDF"
      );
    }
    throw new IngestionError(
      `Failed to parse PDF document: ${errObj?.message || "corrupted or unsupported format"}`,
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

    interface ProcessedItem {
      str: string;
      x: number;
      y: number;
      height: number;
    }

    const items: ProcessedItem[] = [];
    for (const raw of textContent.items) {
      const textItem = typeof raw === "object" && raw !== null ? (raw as { str?: unknown; transform?: unknown; height?: unknown }) : null;
      if (textItem && typeof textItem.str === "string") {
        const text = textItem.str;
        if (!text || text.trim() === "") continue;
        const transform = Array.isArray(textItem.transform) ? textItem.transform : [1, 0, 0, 1, 0, 0];
        const x = typeof transform[4] === "number" ? transform[4] : 0;
        const y = typeof transform[5] === "number" ? transform[5] : 0;
        const height = typeof textItem.height === "number" ? textItem.height : Math.abs(typeof transform[3] === "number" ? transform[3] : 12) || 12;
        items.push({ str: text, x, y, height });
      }
    }

    // Sort items visually:
    // In standard PDF, top of page has higher Y, bottom has lower Y.
    // Group roughly by Y baseline (within 35% of font height), then sort by X left-to-right.
    items.sort((a, b) => {
      const yDiff = Math.abs(a.y - b.y);
      const lineTolerance = Math.min(a.height, b.height) * 0.35 || 3;
      if (yDiff <= lineTolerance) {
        return a.x - b.x;
      }
      return b.y - a.y; // Higher Y first (top-to-bottom)
    });

    let pageText = "";
    let lastY: number | null = null;
    let lastHeight = 12;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (lastY === null) {
        pageText = item.str;
        lastY = item.y;
        lastHeight = item.height;
        continue;
      }

      const deltaY = Math.abs(lastY - item.y);
      const lineHeight = (item.height + lastHeight) / 2 || 12;
      const isSameLine = deltaY <= Math.max(2, lineHeight * 0.35);

      if (isSameLine) {
        // Same Y -> join with " "
        if (pageText.endsWith(" ") || item.str.startsWith(" ")) {
          pageText += item.str;
        } else {
          pageText += " " + item.str;
        }
      } else {
        // Delta Y -> join with "\n" or "\n\n"
        // Gap > 1.6 * height -> join with "\n\n"
        const isParagraphBreak = deltaY > 1.6 * lineHeight;
        const separator = isParagraphBreak ? "\n\n" : "\n";
        pageText = pageText.trimEnd() + separator + item.str.trimStart();
      }

      lastY = item.y;
      lastHeight = item.height;
    }

    const cleanPageText = pageText.trim();
    totalChars += cleanPageText.length;
    pages.push({
      pageNumber: pageNum,
      text: cleanPageText,
    });
  }

  // Reject scanned/empty PDFs: If total text < 50 chars, throw IngestionError
  if (totalChars < 50) {
    throw new IngestionError(
      "OCR is not supported for scanned PDFs. Please upload a text-based document or paste text directly.",
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
