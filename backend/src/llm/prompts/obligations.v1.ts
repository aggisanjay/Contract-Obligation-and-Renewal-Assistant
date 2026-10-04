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
      description: z
        .union([z.string(), z.record(z.unknown()), z.number()])
        .nullish()
        .transform((v) => {
          if (!v) return "Operational Obligation";
          if (typeof v === "string") return v;
          if (typeof v === "object") {
            const obj = v as Record<string, unknown>;
            return String(obj.description || obj.title || obj.text || JSON.stringify(v));
          }
          return String(v);
        }),
      responsibleParty: z.string().nullish().default("Contracting Party"),
      obligationType: z
        .string()
        .nullish()
        .transform(
          (val): "payment" | "reporting" | "delivery" | "confidentiality" | "compliance" | "other" => {
            const v = String(val || "").toLowerCase();
            if (
              v === "payment" ||
              v === "reporting" ||
              v === "delivery" ||
              v === "confidentiality" ||
              v === "compliance"
            ) {
              return v;
            }
            return "other";
          }
        ),
      deadlineDate: z.string().nullish(),
      relativeDeadline: z.string().nullish(),
      recurrence: z
        .string()
        .nullish()
        .transform((val) => {
          const v = String(val || "").toLowerCase();
          if (v.includes("month")) return "monthly";
          if (v.includes("quarter")) return "quarterly";
          if (v.includes("semi") || v.includes("half")) return "semi_annual";
          if (v.includes("year") || v.includes("annual")) return "annual";
          if (v.includes("custom")) return "custom";
          return "one_time";
        }),
      recurrenceRule: z.string().nullish(),
      sourceSectionLabel: z.string().nullish().default("General"),
      exactQuote: z.string().nullish().default(""),
      confidence: z.number().min(0).max(1).nullish().default(0.9),
      status: z.enum(["confirmed", "uncertain"]).nullish().default("confirmed"),
      uncertaintyReason: z.string().nullish(),
    })
  ).nullish().transform((v) => v || []),
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
