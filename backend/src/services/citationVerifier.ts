import { DocumentSection } from "@contract-assistant/shared";

/**
 * Normalizes text for robust citation verification:
 * - Converts to lowercase
 * - Strips curly/smart quotes and special dashes
 * - Collapses punctuation, newlines, and whitespace into single spaces
 */
export function normalizeForCitation(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CitationVerificationResult {
  accepted: boolean;
  citationVerified: boolean;
  matchedSectionId: string | null;
  matchedSectionLabel: string | null;
  warning: string | null;
  rejectionReason?: string;
}

/**
 * Deterministically checks whether an exact quote exists in the cited section
 * or elsewhere in the contract sections.
 */
export function verifyCitation(
  exactQuote: string,
  citedSectionLabel: string,
  citedSectionId: string | null,
  allSections: DocumentSection[]
): CitationVerificationResult {
  const trimmedQuote = exactQuote.trim();

  // Rule: Items with no citation at all are rejected from the results and logged.
  if (!trimmedQuote) {
    return {
      accepted: false,
      citationVerified: false,
      matchedSectionId: null,
      matchedSectionLabel: null,
      warning: "No citation quote was provided.",
      rejectionReason: "Missing citation quote",
    };
  }

  const normalizedQuote = normalizeForCitation(trimmedQuote);
  if (normalizedQuote.length < 3) {
    return {
      accepted: false,
      citationVerified: false,
      matchedSectionId: null,
      matchedSectionLabel: null,
      warning: "Citation quote is too short to verify reliably.",
      rejectionReason: "Citation quote under 3 characters",
    };
  }

  // 1. Check cited section first
  const normalizedCitedLabel = citedSectionLabel.trim().toLowerCase();
  const targetSection =
    (citedSectionId ? allSections.find((s) => s.id === citedSectionId) : null) ||
    allSections.find((s) => s.label.toLowerCase() === normalizedCitedLabel) ||
    allSections.find((s) => s.label.toLowerCase().startsWith(normalizedCitedLabel));

  if (targetSection) {
    const normalizedTargetText = normalizeForCitation(targetSection.text);
    if (normalizedTargetText.includes(normalizedQuote)) {
      return {
        accepted: true,
        citationVerified: true,
        matchedSectionId: targetSection.id,
        matchedSectionLabel: targetSection.label,
        warning: null,
      };
    }
  }

  // 2. If not found in cited section, search all other sections
  for (const section of allSections) {
    const normalizedSecText = normalizeForCitation(section.text);
    if (normalizedSecText.includes(normalizedQuote)) {
      return {
        accepted: true,
        citationVerified: false,
        matchedSectionId: section.id,
        matchedSectionLabel: section.label,
        warning: `Quote was found in '${section.label}', not in cited '${citedSectionLabel}'.`,
      };
    }
  }

  // 3. Not found anywhere in contract
  return {
    accepted: true, // Keep item but mark unverified & downgrade to uncertain
    citationVerified: false,
    matchedSectionId: targetSection ? targetSection.id : null,
    matchedSectionLabel: targetSection ? targetSection.label : citedSectionLabel,
    warning: `Citation unverified: verbatim quote "${trimmedQuote.substring(0, 60)}..." could not be located in section text.`,
  };
}
