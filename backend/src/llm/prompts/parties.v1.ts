import { z } from "zod";

/**
 * Prompt design rationale (parties.v1):
 * - Focuses on identifying legal contracting entities, their roles, and the initial effective date.
 * - Enforces verbatim quotation from the contract text.
 * - Explicitly instructs the model NOT to invent or assume missing dates or entity addresses.
 * - Strictly forbids legal opinions on corporate standing or enforceability.
 */

import { Pass1PartiesOutput } from "@contract-assistant/shared";

export const ExtractedPartiesResponseSchema = z.object({
  parties: z.array(
    z.object({
      name: z.string().default("Unnamed Party"),
      role: z.string().default("Contracting Party"),
      address: z.string().nullish(),
      jurisdiction: z.string().nullish(),
      sourceSectionLabel: z.string().default("General"),
      exactQuote: z.string().default(""),
      confidence: z.number().min(0).max(1).default(0.9),
      status: z.enum(["confirmed", "uncertain"]).default("confirmed"),
      uncertaintyReason: z.string().nullish(),
    })
  ).default([]),
  effectiveDate: z
    .object({
      date: z.string().nullish(), // YYYY-MM-DD or null if relative/unknown
      isRelative: z.boolean().default(false),
      relativeRule: z.string().nullish(),
      sourceSectionLabel: z.string().default("General"),
      exactQuote: z.string().default(""),
      confidence: z.number().min(0).max(1).default(0.9),
      status: z.enum(["confirmed", "uncertain"]).default("confirmed"),
      uncertaintyReason: z.string().nullish(),
    })
    .nullish(),
});

export type ExtractedPartiesResponse = Pass1PartiesOutput;

export function buildPartiesPrompt(sectionsText: string): string {
  return `
You are an expert contract data extraction assistant. Your task is to extract contracting parties and the effective date from the provided contract sections.

RULES:
1. Extract ALL named legal parties, their designated role (e.g. Customer, Vendor, Contractor, Landlord), and address/jurisdiction if stated.
2. Extract the Effective Date. If it is an explicit calendar date, provide it as YYYY-MM-DD. If it is relative (e.g. "upon signature of both parties"), set isRelative to true and record relativeRule.
3. For EVERY item, you MUST include:
   - "sourceSectionLabel": The exact label of the section where this was found (e.g. "Preamble", "Section 1.1").
   - "exactQuote": An exact, verbatim substring copied from the contract section text.
   - "status": "confirmed" if explicitly stated; "uncertain" if inferred or ambiguous.
   - "confidence": A score between 0.0 and 1.0.
4. STRICT CITATION RULE: Do NOT fabricate or paraphrase the exactQuote. It must match the source text word-for-word.
5. STRICT GUARDRAIL: Do NOT provide legal advice or commentary on the validity or enforceability of the parties or the contract.

CONTRACT SECTIONS:
${sectionsText}
  `.trim();
}
