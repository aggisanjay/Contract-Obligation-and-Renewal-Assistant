import { IngestionError } from "../../utils/errors.js";
import { extractTextFromPdf } from "./pdf.js";
import { extractTextFromDocx } from "./docx.js";
import { parseSections, ParsedSectionInput } from "./sectionParser.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface IngestionOptions {
  filename?: string;
  mimetype?: string;
  documentType?: "contract" | "policy";
}

export interface IngestedDocument {
  title: string;
  rawText: string;
  fileType: "pdf" | "docx" | "text";
  pageCount: number | null;
  sections: ParsedSectionInput[];
  warnings: string[];
}

/**
 * Ingests a contract or policy document from buffer or string.
 * Validates file size (max 10 MB), type, and text extractability.
 */
export async function ingestDocument(
  input: Buffer | string,
  options: IngestionOptions = {}
): Promise<IngestedDocument> {
  const documentType = options.documentType || "contract";
  const warnings: string[] = [];

  if (typeof input === "string") {
    const rawText = input.trim();
    if (!rawText) {
      throw new IngestionError(
        "Pasted text document is empty.",
        "EMPTY_DOCUMENT"
      );
    }
    if (Buffer.byteLength(input, "utf8") > MAX_FILE_SIZE_BYTES) {
      throw new IngestionError(
        "Document exceeds maximum allowed size of 10 MB.",
        "FILE_TOO_LARGE"
      );
    }

    const sections = parseSections(rawText, documentType);
    return {
      title: options.filename || "Pasted Contract",
      rawText,
      fileType: "text",
      pageCount: null,
      sections,
      warnings,
    };
  }

  // Buffer input
  const buffer = input;
  if (buffer.length === 0) {
    throw new IngestionError("Uploaded file is empty (0 bytes).", "EMPTY_FILE");
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new IngestionError(
      `File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds 10 MB limit.`,
      "FILE_TOO_LARGE"
    );
  }

  const filename = options.filename?.toLowerCase() || "";
  const mimetype = options.mimetype?.toLowerCase() || "";

  // PDF
  if (filename.endsWith(".pdf") || mimetype.includes("application/pdf")) {
    const pdfResult = await extractTextFromPdf(buffer);
    const sections = parseSections(pdfResult.pages, documentType);
    return {
      title: options.filename || "Uploaded Contract (PDF)",
      rawText: pdfResult.fullText,
      fileType: "pdf",
      pageCount: pdfResult.pageCount,
      sections,
      warnings,
    };
  }

  // DOCX
  if (
    filename.endsWith(".docx") ||
    mimetype.includes("vnd.openxmlformats-officedocument.wordprocessingml.document")
  ) {
    const docxResult = await extractTextFromDocx(buffer);
    const sections = parseSections(docxResult.fullText, documentType);
    return {
      title: options.filename || "Uploaded Contract (DOCX)",
      rawText: docxResult.fullText,
      fileType: "docx",
      pageCount: null,
      sections,
      warnings,
    };
  }

  // Plain text file (.txt)
  if (filename.endsWith(".txt") || mimetype.includes("text/plain")) {
    const rawText = buffer.toString("utf8").trim();
    if (!rawText) {
      throw new IngestionError(
        "Text document contains no text.",
        "EMPTY_DOCUMENT"
      );
    }
    const sections = parseSections(rawText, documentType);
    return {
      title: options.filename || "Uploaded Contract (Text)",
      rawText,
      fileType: "text",
      pageCount: null,
      sections,
      warnings,
    };
  }

  throw new IngestionError(
    `Unsupported file type for "${options.filename || "uploaded file"}". Supported formats: PDF, DOCX, and TXT.`,
    "UNSUPPORTED_FILE_TYPE"
  );
}
