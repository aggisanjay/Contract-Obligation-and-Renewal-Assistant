import { z } from "zod";

/**
 * Prompt design rationale (termAndRenewal.v1):
 * - Focuses on extracting duration (months/years), explicit expiry dates, renewal mechanisms
 *   (auto-renewal vs manual), notice periods for non-renewal, termination clauses (for cause / convenience),
 *   and notice delivery specifications.
 * - Enforces verbatim quotation for each extracted clause.
 * - Strictly forbids advisory recommendations (e.g. "you should give notice now").
 */

export const ExtractedTermRenewalResponseSchema = z.object({
  term: z
    .object({
      termLengthMonths: z.number().nullable().optional(),
      termLengthYears: z.number().nullable().optional(),
      expiryDate: z.string().nullable().optional(),
      isPerpetual: z.boolean().default(false),
      description: z.string(),
      sourceSectionLabel: z.string(),
      exactQuote: z.string(),
      confidence: z.number().min(0).max(1),
      status: z.enum(["confirmed", "uncertain"]),
      uncertaintyReason: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  renewal: z
    .object({
      isAutoRenew: z.boolean(),
      renewalTermMonths: z.number().nullable().optional(),
      noticePeriodDays: z.number().nullable().optional(),
      noticePeriodMonths: z.number().nullable().optional(),
      conditions: z.string().nullish(),
      sourceSectionLabel: z.string(),
      exactQuote: z.string(),
      confidence: z.number().min(0).max(1),
      status: z.enum(["confirmed", "uncertain"]),
      uncertaintyReason: z.string().nullish(),
    })
    .nullable()
    .optional(),
  termination: z
    .object({
      forCauseAllowed: z.boolean(),
      forConvenienceAllowed: z.boolean(),
      noticePeriodDays: z.number().nullish(),
      curePeriodDays: z.number().nullish(),
      summary: z.string(),
      sourceSectionLabel: z.string(),
      exactQuote: z.string(),
      confidence: z.number().min(0).max(1),
      status: z.enum(["confirmed", "uncertain"]),
      uncertaintyReason: z.string().nullish(),
    })
    .nullable()
    .optional(),
  notice: z
    .object({
      noticePeriodDays: z.number().nullish(),
      noticePeriodMonths: z.number().nullish(),
      method: z.string().nullish(),
      recipient: z.string().nullish(),
      sourceSectionLabel: z.string(),
      exactQuote: z.string(),
      confidence: z.number().min(0).max(1),
      status: z.enum(["confirmed", "uncertain"]),
      uncertaintyReason: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type ExtractedTermRenewalResponse = z.infer<typeof ExtractedTermRenewalResponseSchema>;

export function buildTermRenewalPrompt(sectionsText: string): string {
  return `
You are an expert contract data extraction assistant. Extract term, expiry, renewal, termination, and notice terms.

RULES:
1. Extract Initial Term duration and explicit Expiry Date if specified.
2. Extract Renewal rules: whether it auto-renews, length of renewal periods, and required notice period for non-renewal.
3. Extract Termination rules: whether termination for convenience and/or for cause is allowed, cure periods, and notice periods.
4. Extract Notice provisions: required delivery methods (e.g. certified mail, email) and designated recipients.
5. For EVERY item, include:
   - "sourceSectionLabel": The section label (e.g. "Section 2.1").
   - "exactQuote": An exact verbatim quote from the text.
   - "status": "confirmed" or "uncertain".
   - "confidence": Float between 0.0 and 1.0.
6. NEVER guess unstated facts. Never recommend whether a party should terminate or renew.

CONTRACT SECTIONS:
${sectionsText}
  `.trim();
}
