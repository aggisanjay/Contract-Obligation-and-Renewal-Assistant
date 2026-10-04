import { z } from "zod";

/**
 * Prompt design rationale (obligations.v1):
 * - Focuses on operational and commercial duties (payment, delivery, reporting, confidentiality, compliance).
 * - Identifies the responsible entity, deadline rule (absolute date or relative rule), and recurrence frequency.
 * - Enforces verbatim quotations.
 */

export const ExtractedObligationsResponseSchema = z.object({
  obligations: z.array(
    z.object({
      description: z.string(),
      responsibleParty: z.string(),
      obligationType: z.enum([
        "payment",
        "reporting",
        "delivery",
        "confidentiality",
        "compliance",
        "other",
      ]),
      deadlineDate: z.string().nullable().optional(), // YYYY-MM-DD
      relativeDeadline: z.string().nullable().optional(), // e.g. "within 30 days of effective date"
      recurrence: z.enum([
        "one_time",
        "monthly",
        "quarterly",
        "semi_annual",
        "annual",
        "custom",
      ]),
      recurrenceRule: z.string().nullish(),
      sourceSectionLabel: z.string(),
      exactQuote: z.string(),
      confidence: z.number().min(0).max(1),
      status: z.enum(["confirmed", "uncertain"]),
      uncertaintyReason: z.string().nullish(),
    })
  ),
});

export type ExtractedObligationsResponse = z.infer<typeof ExtractedObligationsResponseSchema>;

export function buildObligationsPrompt(sectionsText: string): string {
  return `
You are an expert contract data extraction assistant. Extract concrete obligations and deliverables.

RULES:
1. Identify each affirmative obligation or deliverable.
2. Specify:
   - "responsibleParty": The party obligated to perform.
   - "obligationType": payment | reporting | delivery | confidentiality | compliance | other.
   - "deadlineDate": Fixed YYYY-MM-DD date if explicitly defined in the clause, otherwise null.
   - "relativeDeadline": Plain English deadline description if relative (e.g. "within 30 days of invoice", "quarterly within 15 days of quarter end").
   - "recurrence": one_time | monthly | quarterly | semi_annual | annual | custom.
3. Every item must have:
   - "sourceSectionLabel": Section where found.
   - "exactQuote": Verbatim substring copied from the contract text.
   - "status": "confirmed" or "uncertain".
   - "confidence": Float between 0.0 and 1.0.
4. Do not offer subjective evaluations of performance feasibility.

CONTRACT SECTIONS:
${sectionsText}
  `.trim();
}
