import mammoth from "mammoth";
import { IngestionError } from "../../utils/errors.js";

export interface DocxExtractionResult {
  fullText: string;
}

/**
 * Extracts raw text from a DOCX buffer using mammoth.
 */
export async function extractTextFromDocx(buffer: Buffer): Promise<DocxExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const fullText = (result.value || "").trim();

    if (!fullText) {
      throw new IngestionError(
        "DOCX document contains no extractable text.",
        "EMPTY_DOCX"
      );
    }

    return { fullText };
  } catch (err: unknown) {
    if (err instanceof IngestionError) throw err;
    const msg = err instanceof Error ? err.message : "corrupted or unsupported format";
    throw new IngestionError(
      `Failed to read DOCX file: ${msg}`,
      "CORRUPTED_DOCX"
    );
  }
}
