import { z } from "zod";

/**
 * Prompt design rationale (clarificationQuestions.v1):
 * - Formulates neutral, non-advisory clarification questions for the contract reviewer.
 * - Questions focus solely on resolving missing information or factual intent.
 * - Strictly forbids advisory recommendations.
 */

export const ExtractedClarificationQuestionSchema = z.object({
  question: z.string(),
  targetClause: z.string(),
  sourceSectionLabel: z.string(),
  exactQuote: z.string(),
  confidence: z.number().min(0).max(1),
  status: z.enum(["confirmed", "uncertain"]).default("uncertain"),
  uncertaintyReason: z.string().nullish(),
});

export const ExtractedClarificationQuestionsResponseSchema = z.object({
  clarificationQuestions: z.array(ExtractedClarificationQuestionSchema),
});

export type ExtractedClarificationQuestionsResponse = z.infer<
  typeof ExtractedClarificationQuestionsResponseSchema
>;

export function buildClarificationQuestionsPrompt(
  sectionsText: string,
  ambiguitiesSummary: string
): string {
  return `
You are an expert contract review assistant. Your task is to formulate neutral clarification questions that a human reviewer should consider or ask the other party to resolve text ambiguities or missing details.

RULES:
1. Questions must be strictly NEUTRAL and FACT-SEEKING (e.g. "What specific deadline was intended for the delivery phase?", "Is Exhibit A attached or agreed upon separately?").
2. NEVER ask leading legal questions or give legal advice (e.g. Do NOT say "Should we terminate?", "Is this clause enforceable?").
3. Each question must tie to a specific clause and section.
4. For EVERY item include:
   - "question": The neutral clarification question.
   - "targetClause": Brief title or descriptor of the clause.
   - "sourceSectionLabel": The section where this ambiguity originates.
   - "exactQuote": An exact verbatim quote from the text.
   - "confidence": Float between 0.0 and 1.0.

KNOWN AMBIGUITIES / GAPS:
${ambiguitiesSummary}

CONTRACT SECTIONS:
${sectionsText}
  `.trim();
}
