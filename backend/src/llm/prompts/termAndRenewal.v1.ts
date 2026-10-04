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
      termLengthMonths: z.number().nullish(),
      termLengthYears: z.number().nullish(),
      expiryDate: z
        .union([z.string(), z.record(z.unknown()), z.number()])
        .nullish()
        .transform((val) => {
          if (!val) return null;
          if (typeof val === "string") return val;
          if (typeof val === "object") {
            const v = val as Record<string, unknown>;
            return typeof v.date === "string"
              ? v.date
              : typeof v.value === "string"
              ? v.value
              : String(val);
          }
          return String(val);
        }),
      isPerpetual: z.boolean().nullish().default(false),
      description: z.string().nullish().default(""),
      sourceSectionLabel: z.string().nullish().default("General"),
      exactQuote: z.string().nullish().default(""),
      confidence: z.number().min(0).max(1).nullish().default(0.9),
      status: z.enum(["confirmed", "uncertain"]).nullish().default("confirmed"),
      uncertaintyReason: z.string().nullish(),
    })
    .nullish(),
  renewal: z
    .object({
      isAutoRenew: z.boolean().nullish().default(false),
      renewalTermMonths: z.number().nullish(),
      noticePeriodDays: z.number().nullish(),
      noticePeriodMonths: z.number().nullish(),
      conditions: z.string().nullish(),
      sourceSectionLabel: z.string().nullish().default("General"),
      exactQuote: z.string().nullish().default(""),
      confidence: z.number().min(0).max(1).nullish().default(0.9),
      status: z.enum(["confirmed", "uncertain"]).nullish().default("confirmed"),
      uncertaintyReason: z.string().nullish(),
    })
    .nullish(),
  termination: z
    .object({
      forCauseAllowed: z.boolean().nullish().default(false),
      forConvenienceAllowed: z.boolean().nullish().default(false),
      noticePeriodDays: z.number().nullish(),
      curePeriodDays: z.number().nullish(),
      summary: z.string().nullish().default(""),
      sourceSectionLabel: z.string().nullish().default("General"),
      exactQuote: z.string().nullish().default(""),
      confidence: z.number().min(0).max(1).nullish().default(0.9),
      status: z.enum(["confirmed", "uncertain"]).nullish().default("confirmed"),
      uncertaintyReason: z.string().nullish(),
    })
    .nullish(),
  notice: z
    .object({
      noticePeriodDays: z.number().nullish(),
      noticePeriodMonths: z.number().nullish(),
      method: z.string().nullish(),
      recipient: z.string().nullish(),
      sourceSectionLabel: z.string().nullish().default("General"),
      exactQuote: z.string().nullish().default(""),
      confidence: z.number().min(0).max(1).nullish().default(0.9),
      status: z.enum(["confirmed", "uncertain"]).nullish().default("confirmed"),
      uncertaintyReason: z.string().nullish(),
    })
    .nullish(),
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
