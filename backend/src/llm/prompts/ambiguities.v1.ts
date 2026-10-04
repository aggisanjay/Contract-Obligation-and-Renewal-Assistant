import { z } from "zod";

/**
 * Prompt design rationale (ambiguities.v1):
 * - Identifies unclear terms, missing specifications, internal contradictory clauses,
 *   and discrepancies against an optional organizational policy.
 * - STRICTLY NON-ADVISORY: Describes text gaps without rendering legal opinions or risk assessments.
 */

export const ExtractedAmbiguitySchema = z.object({
  issueType: z
    .string()
    .nullish()
    .transform((val) => {
      const v = String(val || "").toLowerCase();
      if (["unclear_term", "missing_data", "internal_contradiction", "policy_gap"].includes(v)) {
        return v as any;
      }
      return "unclear_term";
    }),
  description: z.any().transform((v) => {
    if (!v) return "Ambiguous or contradictory clause";
    if (typeof v === "string") return v;
    if (typeof v === "object") return v.description || v.issue || v.text || JSON.stringify(v);
    return String(v);
  }),
  conflictingSectionLabel: z.string().nullish(),
  policyReference: z.string().nullish(),
  sourceSectionLabel: z.string().nullish().default("General"),
  exactQuote: z.string().nullish().default(""),
  confidence: z.number().min(0).max(1).nullish().default(0.85),
  status: z.enum(["confirmed", "uncertain"]).nullish().default("uncertain"),
  uncertaintyReason: z.string().nullish(),
});

export const ExtractedAmbiguitiesResponseSchema = z.object({
  ambiguitiesAndConflicts: z.array(ExtractedAmbiguitySchema).nullish().transform((v) => v || []),
});

export type ExtractedAmbiguitiesResponse = z.infer<typeof ExtractedAmbiguitiesResponseSchema>;

export function buildAmbiguitiesPrompt(sectionsText: string, policyText?: string | null): string {
  return `
You are an expert contract data extraction assistant. Your task is to identify factual ambiguities, missing data fields, internal contradictions between contract clauses, and discrepancies with the organizational policy document (if provided).

CRITICAL NON-ADVISORY GUARDRAIL:
Do NOT state that a clause is "illegal", "unenforceable", or "legally risky". Strictly highlight textual inconsistencies or missing definitions.

CATEGORIES TO EXTRACT:
1. "unclear_term": A term that lacks definition (e.g. "promptly", "reasonable time", "standard rates" with no fee schedule).
2. "missing_data": A clause that references an exhibit or date that is blank or missing.
3. "internal_contradiction": Two sections in the contract that directly conflict (e.g. Section 2 says 30 days notice but Section 8 says 60 days notice).
4. "policy_gap": A requirement in the provided Policy Document that the contract fails to meet or contradicts.

For EVERY item, include:
- "issueType": unclear_term | missing_data | internal_contradiction | policy_gap
- "description": Objective summary of the ambiguity or conflict.
- "conflictingSectionLabel": If internal contradiction, the other section label.
- "policyReference": If policy gap, the relevant policy requirement.
- "sourceSectionLabel": The primary section label where the issue originates.
- "exactQuote": An exact verbatim quote from the text.
- "confidence": Float between 0.0 and 1.0.

${policyText ? `ORGANIZATIONAL POLICY DOCUMENT:\n${policyText}\n\n` : ""}
CONTRACT SECTIONS:
${sectionsText}
  `.trim();
}
