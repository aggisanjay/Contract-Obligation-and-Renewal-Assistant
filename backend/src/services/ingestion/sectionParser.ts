import { ExtractedPdfPage } from "./pdf.js";

export interface ParsedSectionInput {
  sectionIndex: number;
  label: string;
  heading: string | null;
  text: string;
  page: number | null;
  charStart: number;
  charEnd: number;
  documentType: "contract" | "policy";
}

// Regex patterns to identify numbered clauses:
// e.g.: "12.3 Termination for Convenience", "12.3.1 Notice", "Section 4: Term", "Article II - Definitions", "Clause 8. Payment"
const NUMBERED_CLAUSE_REGEX =
  /^(?:(?:Section|Article|Clause)\s+)?([0-9]+(?:\.[0-9]+)*)(?:[.:\-\s]+)(.*)$/i;

// Regex for article/section headers without dots: e.g. "Section 4", "Article 2", "Schedule A"
const SECTION_KEYWORD_REGEX =
  /^(?:Section|Article|Clause|Schedule|Exhibit)\s+([A-Za-z0-9]+)(?:[.:\-\s]+)?(.*)$/i;

// Regex for ALL CAPS headings
const ALL_CAPS_HEADING_REGEX = /^[A-Z0-9\s,\-–—:/]{4,60}$/;

/**
 * Parses full text or page-separated text into structured sections.
 */
export function parseSections(
  input: string | ExtractedPdfPage[],
  documentType: "contract" | "policy" = "contract"
): ParsedSectionInput[] {
  let fullDocText: string;
  // Map character offset ranges to page numbers
  const pageRanges: Array<{ pageNumber: number; charStart: number; charEnd: number }> = [];

  if (typeof input === "string") {
    fullDocText = input.replace(/\r\n/g, "\n");
  } else {
    // Array of pages
    let currentOffset = 0;
    const pageTexts: string[] = [];
    for (const page of input) {
      const cleaned = page.text.replace(/\r\n/g, "\n").trim();
      if (!cleaned) continue;
      const start = currentOffset;
      pageTexts.push(cleaned);
      const end = start + cleaned.length;
      pageRanges.push({
        pageNumber: page.pageNumber,
        charStart: start,
        charEnd: end,
      });
      currentOffset = end + 2; // account for \n\n separator
    }
    fullDocText = pageTexts.join("\n\n");
  }

  function getPageForOffset(offset: number): number | null {
    if (pageRanges.length === 0) return null;
    for (const range of pageRanges) {
      if (offset >= range.charStart && offset <= range.charEnd) {
        return range.pageNumber;
      }
    }
    // Return closest page
    for (let i = pageRanges.length - 1; i >= 0; i--) {
      const r = pageRanges[i];
      if (r && offset >= r.charStart) {
        return r.pageNumber;
      }
    }
    return pageRanges[0]?.pageNumber ?? null;
  }

  // Split into candidate blocks by double newlines or single newlines
  const rawParagraphs = fullDocText.split(/\n\s*\n/);
  
  // Strategy 1: Check for numbered clauses
  interface RawCandidate {
    label: string;
    heading: string | null;
    bodyLines: string[];
    charStart: number;
    charEnd: number;
  }

  const numberedCandidates: RawCandidate[] = [];
  let currentCandidate: RawCandidate | null = null;
  let runningCharOffset = 0;

  for (const block of rawParagraphs) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    const blockStart = fullDocText.indexOf(trimmedBlock, runningCharOffset);
    const charStart = blockStart !== -1 ? blockStart : runningCharOffset;
    const charEnd = charStart + trimmedBlock.length;
    runningCharOffset = charEnd;

    const firstLine = trimmedBlock.split("\n")[0]?.trim() || "";
    const remainingLines = trimmedBlock.split("\n").slice(1).join("\n").trim();

    const matchNumbered = firstLine.match(NUMBERED_CLAUSE_REGEX);
    const matchKeyword = firstLine.match(SECTION_KEYWORD_REGEX);

    if (matchNumbered) {
      if (currentCandidate) {
        numberedCandidates.push(currentCandidate);
      }
      const clauseNum = matchNumbered[1];
      const headingCandidate = matchNumbered[2]?.trim() || null;
      currentCandidate = {
        label: `Section ${clauseNum}`,
        heading: headingCandidate || null,
        bodyLines: remainingLines ? [remainingLines] : [],
        charStart,
        charEnd,
      };
    } else if (matchKeyword) {
      if (currentCandidate) {
        numberedCandidates.push(currentCandidate);
      }
      const sectionKey = matchKeyword[1];
      const headingCandidate = matchKeyword[2]?.trim() || null;
      currentCandidate = {
        label: `Section ${sectionKey}`,
        heading: headingCandidate || null,
        bodyLines: remainingLines ? [remainingLines] : [],
        charStart,
        charEnd,
      };
    } else {
      if (currentCandidate) {
        currentCandidate.bodyLines.push(trimmedBlock);
        currentCandidate.charEnd = charEnd;
      } else {
        // Preamble or introductory text before the first section
        currentCandidate = {
          label: "Preamble",
          heading: "Introductory Provisions",
          bodyLines: [trimmedBlock],
          charStart,
          charEnd,
        };
      }
    }
  }

  if (currentCandidate) {
    numberedCandidates.push(currentCandidate);
  }

  // If we found at least 2 distinct numbered sections, use strategy 1
  if (numberedCandidates.length >= 2) {
    return numberedCandidates.map((c, idx) => {
      const fullText = (c.heading ? `${c.heading}\n` : "") + c.bodyLines.join("\n\n");
      return {
        sectionIndex: idx,
        label: c.label,
        heading: c.heading,
        text: fullText.trim() || c.label,
        page: getPageForOffset(c.charStart),
        charStart: c.charStart,
        charEnd: c.charEnd,
        documentType,
      };
    });
  }

  // Strategy 2: Check for uppercase / heading-based blocks
  const headingCandidates: RawCandidate[] = [];
  let currentHeadingCandidate: RawCandidate | null = null;
  runningCharOffset = 0;

  for (const block of rawParagraphs) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) {
      runningCharOffset += block.length + 2;
      continue;
    }

    const lines = trimmedBlock.split("\n");
    const firstLine = lines[0]?.trim() || "";
    const isHeading =
      firstLine.length < 60 &&
      (ALL_CAPS_HEADING_REGEX.test(firstLine) || firstLine.endsWith(":"));

    if (isHeading) {
      if (currentHeadingCandidate) {
        currentHeadingCandidate.charEnd = runningCharOffset;
        headingCandidates.push(currentHeadingCandidate);
      }
      currentHeadingCandidate = {
        label: firstLine.replace(/:$/, ""),
        heading: firstLine.replace(/:$/, ""),
        bodyLines: lines.slice(1).length > 0 ? [lines.slice(1).join("\n")] : [],
        charStart: runningCharOffset,
        charEnd: runningCharOffset + block.length,
      };
    } else {
      if (currentHeadingCandidate) {
        currentHeadingCandidate.bodyLines.push(trimmedBlock);
        currentHeadingCandidate.charEnd = runningCharOffset + block.length;
      } else {
        currentHeadingCandidate = {
          label: "Introduction",
          heading: "Introduction",
          bodyLines: [trimmedBlock],
          charStart: runningCharOffset,
          charEnd: runningCharOffset + block.length,
        };
      }
    }
    runningCharOffset += block.length + 2;
  }

  if (currentHeadingCandidate) {
    headingCandidates.push(currentHeadingCandidate);
  }

  if (headingCandidates.length >= 2) {
    return headingCandidates.map((c, idx) => {
      const fullText = c.bodyLines.join("\n\n");
      return {
        sectionIndex: idx,
        label: c.label,
        heading: c.heading,
        text: fullText.trim() || c.label,
        page: getPageForOffset(c.charStart),
        charStart: c.charStart,
        charEnd: c.charEnd,
        documentType,
      };
    });
  }

  // Strategy 3: Fallback to paragraph-based sections
  runningCharOffset = 0;
  const paragraphSections: ParsedSectionInput[] = [];
  let paragraphIndex = 1;

  for (const block of rawParagraphs) {
    const trimmed = block.trim();
    if (!trimmed) {
      runningCharOffset += block.length + 2;
      continue;
    }

    paragraphSections.push({
      sectionIndex: paragraphIndex - 1,
      label: `Paragraph ${paragraphIndex}`,
      heading: null,
      text: trimmed,
      page: getPageForOffset(runningCharOffset),
      charStart: runningCharOffset,
      charEnd: runningCharOffset + block.length,
      documentType,
    });

    paragraphIndex++;
    runningCharOffset += block.length + 2;
  }

  return paragraphSections;
}
