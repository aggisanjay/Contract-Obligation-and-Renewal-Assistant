import { DocumentSection } from "@contract-assistant/shared";
import { normalizeForCitation } from "./citationVerifier.js";

export function computeTextSimilarity(textA: string, textB: string): number {
  const normA = normalizeForCitation(textA);
  const normB = normalizeForCitation(textB);

  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const tokensA = new Set(normA.split(" ").filter(Boolean));
  const tokensB = new Set(normB.split(" ").filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return normA === normB ? 1.0 : 0.0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  return (2 * intersection) / (tokensA.size + tokensB.size);
}

export interface StaleDetectionMatchResult {
  matchType: "unchanged_carried_over" | "clause_changed_stale" | "clause_missing_stale" | "brand_new";
  staleReason?: string;
  matchedPriorItemId?: string;
  similarity: number;
}

export interface StaleDetectionReport {
  carriedOverCount: number;
  staleCount: number;
  newItemsCount: number;
  itemActions: Map<string, StaleDetectionMatchResult>;
}

/**
 * Matches newly extracted items against previously approved items from prior version.
 */
export function detectStaleItems(
  newItems: Array<{
    itemType: string;
    sourceSectionLabel: string;
    exactQuote: string;
    tempId: string;
  }>,
  priorApprovedItems: Array<{
    id: string;
    itemType: string;
    sourceSectionLabel: string;
    exactQuote: string;
    currentValue: string;
    userEdited: boolean;
  }>,
  newSections: DocumentSection[]
): {
  matchedNewItems: Map<
    string,
    {
      action: "carried_over" | "pending";
      priorItem?: (typeof priorApprovedItems)[0];
    }
  >;
  stalePriorItems: Array<{
    priorItem: (typeof priorApprovedItems)[0];
    staleReason: string;
  }>;
} {
  const matchedNewItems = new Map<
    string,
    { action: "carried_over" | "pending"; priorItem?: (typeof priorApprovedItems)[0] }
  >();
  const matchedPriorItemIds = new Set<string>();

  for (const newItem of newItems) {
    let bestMatch: (typeof priorApprovedItems)[0] | null = null;
    let highestQuoteSim = 0;

    for (const priorItem of priorApprovedItems) {
      if (priorItem.itemType !== newItem.itemType) continue;

      const quoteSim = computeTextSimilarity(priorItem.exactQuote, newItem.exactQuote);
      if (quoteSim > highestQuoteSim) {
        highestQuoteSim = quoteSim;
        bestMatch = priorItem;
      }
    }

    // Unchanged source text threshold: >= 0.98 (effectively identical quote)
    if (bestMatch && highestQuoteSim >= 0.98) {
      matchedNewItems.set(newItem.tempId, {
        action: "carried_over",
        priorItem: bestMatch,
      });
      matchedPriorItemIds.add(bestMatch.id);
    } else {
      // Brand-new or modified in this version
      matchedNewItems.set(newItem.tempId, {
        action: "pending",
      });
    }
  }

  // Check which prior approved items were NOT carried over unchanged
  const stalePriorItems: Array<{
    priorItem: (typeof priorApprovedItems)[0];
    staleReason: string;
  }> = [];

  for (const priorItem of priorApprovedItems) {
    if (!matchedPriorItemIds.has(priorItem.id)) {
      // Check if the section still exists in new version
      const sectionStillExists = newSections.some(
        (s) =>
          s.label.toLowerCase() === priorItem.sourceSectionLabel.toLowerCase() ||
          s.label.toLowerCase().includes(priorItem.sourceSectionLabel.toLowerCase())
      );

      if (sectionStillExists) {
        stalePriorItems.push({
          priorItem,
          staleReason: "source clause changed in new version",
        });
      } else {
        stalePriorItems.push({
          priorItem,
          staleReason: "clause no longer found in new version",
        });
      }
    }
  }

  return {
    matchedNewItems,
    stalePriorItems,
  };
}

/**
 * Computes section-by-section diff between two contract versions.
 */
export function compareVersionSections(
  v1Sections: DocumentSection[],
  v2Sections: DocumentSection[]
): {
  added: DocumentSection[];
  removed: DocumentSection[];
  modified: Array<{
    v1: DocumentSection;
    v2: DocumentSection;
    diffSummary: string;
  }>;
  unchanged: DocumentSection[];
} {
  const added: DocumentSection[] = [];
  const removed: DocumentSection[] = [];
  const modified: Array<{ v1: DocumentSection; v2: DocumentSection; diffSummary: string }> = [];
  const unchanged: DocumentSection[] = [];

  const v2Map = new Map(v2Sections.map((s) => [s.label.toLowerCase(), s]));

  for (const s1 of v1Sections) {
    const s2 = v2Map.get(s1.label.toLowerCase());
    if (!s2) {
      removed.push(s1);
    } else {
      const sim = computeTextSimilarity(s1.text, s2.text);
      if (sim > 0.98) {
        unchanged.push(s2);
      } else {
        modified.push({
          v1: s1,
          v2: s2,
          diffSummary: `Similarity score: ${(sim * 100).toFixed(0)}%`,
        });
      }
    }
  }

  const v1Map = new Map(v1Sections.map((s) => [s.label.toLowerCase(), s]));
  for (const s2 of v2Sections) {
    if (!v1Map.has(s2.label.toLowerCase())) {
      added.push(s2);
    }
  }

  return { added, removed, modified, unchanged };
}
