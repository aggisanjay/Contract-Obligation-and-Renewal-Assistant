import {
  DocumentSection,
  ItemType,
  ExtractionStatus,
} from "@contract-assistant/shared";
import { LLMClient, getLLMClient } from "../llm/client.js";
import { logPipelineStep, logger } from "../utils/logger.js";
import { verifyCitation } from "./citationVerifier.js";
import {
  buildPartiesPrompt,
  ExtractedPartiesResponseSchema,
} from "../llm/prompts/parties.v1.js";
import {
  buildTermRenewalPrompt,
  ExtractedTermRenewalResponseSchema,
} from "../llm/prompts/termAndRenewal.v1.js";
import {
  buildObligationsPrompt,
  ExtractedObligationsResponseSchema,
} from "../llm/prompts/obligations.v1.js";
import {
  buildAmbiguitiesPrompt,
  ExtractedAmbiguitiesResponseSchema,
} from "../llm/prompts/ambiguities.v1.js";
import {
  buildClarificationQuestionsPrompt,
  ExtractedClarificationQuestionsResponseSchema,
} from "../llm/prompts/clarificationQuestions.v1.js";

export interface PipelineItemDraft {
  itemType: ItemType;
  status: ExtractionStatus;
  confidence: number;
  uncertaintyReason: string | null;
  sourceSectionLabel: string;
  sourceSectionId: string | null;
  page: number | null;
  exactQuote: string;
  citationVerified: boolean;
  citationWarning: string | null;
  originalPayload: Record<string, unknown>;
}

export interface PipelineExecutionResult {
  items: PipelineItemDraft[];
  stepErrors: Array<{ step: string; error: string }>;
  rejectedCount: number;
}

/**
 * Prepares readable section text for LLM prompts, chunked if necessary.
 */
export function formatSectionsForPrompt(
  sections: DocumentSection[],
  maxChars: number = 25000
): string {
  let combined = "";
  for (const s of sections) {
    const header = `[${s.label}${s.heading ? ` - ${s.heading}` : ""}${s.page ? ` (Page ${s.page})` : ""}]`;
    const block = `${header}\n${s.text}\n\n`;
    if (combined.length + block.length > maxChars) {
      combined += `\n[... Remaining ${sections.length} sections omitted to fit context limits ...]\n`;
      break;
    }
    combined += block;
  }
  return combined;
}

/**
 * Runs the 5-step extraction pipeline on contract sections.
 */
export async function runExtractionPipeline(
  sections: DocumentSection[],
  policyText?: string | null,
  options?: {
    requestId?: string;
    client?: LLMClient;
  }
): Promise<PipelineExecutionResult> {
  const requestId = options?.requestId || `req-ext-${Date.now()}`;
  const client = options?.client || getLLMClient();
  const contractSections = sections.filter((s) => s.documentType === "contract");
  const promptContext = formatSectionsForPrompt(
    contractSections.length > 0 ? contractSections : sections
  );

  const rawDrafts: PipelineItemDraft[] = [];
  const stepErrors: Array<{ step: string; error: string }> = [];

  // Helper to map section label to section metadata
  function findSection(label: string): DocumentSection | undefined {
    const trimmed = label.trim().toLowerCase();
    const exact = sections.find((s) => s.label.toLowerCase() === trimmed);
    if (exact) return exact;
    return sections.find(
      (s) =>
        s.label.toLowerCase().startsWith(trimmed) ||
        trimmed.startsWith(s.label.toLowerCase())
    );
  }

  // ----------------------------------------------------
  // STEP 1: Parties and Effective Date
  // ----------------------------------------------------
  const startTimeStep1 = Date.now();
  try {
    const prompt = buildPartiesPrompt(promptContext);
    const result = await client.generateStructured(
      prompt,
      ExtractedPartiesResponseSchema,
      "You are a contract analysis assistant extracting parties and effective dates.",
      { requestId, stepName: "parties_and_effective_date" }
    );

    for (const party of result.parties) {
      const sec = findSection(party.sourceSectionLabel);
      rawDrafts.push({
        itemType: "party",
        status: party.status,
        confidence: party.confidence,
        uncertaintyReason: party.uncertaintyReason || null,
        sourceSectionLabel: party.sourceSectionLabel,
        sourceSectionId: sec?.id || null,
        page: sec?.page || null,
        exactQuote: party.exactQuote,
        citationVerified: true,
        citationWarning: null,
        originalPayload: party,
      });
    }

    if (result.effectiveDate) {
      const sec = findSection(result.effectiveDate.sourceSectionLabel);
      rawDrafts.push({
        itemType: "effective_date",
        status: result.effectiveDate.status,
        confidence: result.effectiveDate.confidence,
        uncertaintyReason: result.effectiveDate.uncertaintyReason || null,
        sourceSectionLabel: result.effectiveDate.sourceSectionLabel,
        sourceSectionId: sec?.id || null,
        page: sec?.page || null,
        exactQuote: result.effectiveDate.exactQuote,
        citationVerified: true,
        citationWarning: null,
        originalPayload: result.effectiveDate,
      });
    }

    logPipelineStep(requestId, "parties_and_effective_date", {
      durationMs: Date.now() - startTimeStep1,
      success: true,
      itemCount: rawDrafts.length,
    });
  } catch (err) {
    const msg = (err as Error).message;
    stepErrors.push({ step: "parties_and_effective_date", error: msg });
    logPipelineStep(requestId, "parties_and_effective_date", {
      durationMs: Date.now() - startTimeStep1,
      success: false,
      error: msg,
    });
  }

  // ----------------------------------------------------
  // STEP 2: Term, Expiry, Renewal, Termination & Notice
  // ----------------------------------------------------
  const startTimeStep2 = Date.now();
  try {
    const prompt = buildTermRenewalPrompt(promptContext);
    const result = await client.generateStructured(
      prompt,
      ExtractedTermRenewalResponseSchema,
      "You are a contract analysis assistant extracting term, renewal, termination, and notice provisions.",
      { requestId, stepName: "term_and_renewal" }
    );

    if (result.term) {
      const sec = findSection(result.term.sourceSectionLabel || "General");
      rawDrafts.push({
        itemType: "expiry",
        status: (result.term.status as "confirmed" | "uncertain") || "confirmed",
        confidence: typeof result.term.confidence === "number" ? result.term.confidence : 0.9,
        uncertaintyReason: result.term.uncertaintyReason || null,
        sourceSectionLabel: result.term.sourceSectionLabel || "General",
        sourceSectionId: sec?.id || null,
        page: sec?.page || null,
        exactQuote: result.term.exactQuote || "",
        citationVerified: true,
        citationWarning: null,
        originalPayload: result.term,
      });
    }

    if (result.renewal) {
      const sec = findSection(result.renewal.sourceSectionLabel || "General");
      rawDrafts.push({
        itemType: "renewal",
        status: (result.renewal.status as "confirmed" | "uncertain") || "confirmed",
        confidence: typeof result.renewal.confidence === "number" ? result.renewal.confidence : 0.9,
        uncertaintyReason: result.renewal.uncertaintyReason || null,
        sourceSectionLabel: result.renewal.sourceSectionLabel || "General",
        sourceSectionId: sec?.id || null,
        page: sec?.page || null,
        exactQuote: result.renewal.exactQuote || "",
        citationVerified: true,
        citationWarning: null,
        originalPayload: result.renewal,
      });
    }

    if (result.termination) {
      const sec = findSection(result.termination.sourceSectionLabel || "General");
      rawDrafts.push({
        itemType: "termination",
        status: (result.termination.status as "confirmed" | "uncertain") || "confirmed",
        confidence: typeof result.termination.confidence === "number" ? result.termination.confidence : 0.9,
        uncertaintyReason: result.termination.uncertaintyReason || null,
        sourceSectionLabel: result.termination.sourceSectionLabel || "General",
        sourceSectionId: sec?.id || null,
        page: sec?.page || null,
        exactQuote: result.termination.exactQuote || "",
        citationVerified: true,
        citationWarning: null,
        originalPayload: result.termination,
      });
    }

    if (result.notice) {
      const sec = findSection(result.notice.sourceSectionLabel || "General");
      rawDrafts.push({
        itemType: "notice",
        status: (result.notice.status as "confirmed" | "uncertain") || "confirmed",
        confidence: typeof result.notice.confidence === "number" ? result.notice.confidence : 0.9,
        uncertaintyReason: result.notice.uncertaintyReason || null,
        sourceSectionLabel: result.notice.sourceSectionLabel || "General",
        sourceSectionId: sec?.id || null,
        page: sec?.page || null,
        exactQuote: result.notice.exactQuote || "",
        citationVerified: true,
        citationWarning: null,
        originalPayload: result.notice,
      });
    }

    logPipelineStep(requestId, "term_and_renewal", {
      durationMs: Date.now() - startTimeStep2,
      success: true,
    });
  } catch (err) {
    const msg = (err as Error).message;
    stepErrors.push({ step: "term_and_renewal", error: msg });
    logPipelineStep(requestId, "term_and_renewal", {
      durationMs: Date.now() - startTimeStep2,
      success: false,
      error: msg,
    });
  }

  // ----------------------------------------------------
  // STEP 3: Obligations
  // ----------------------------------------------------
  const startTimeStep3 = Date.now();
  try {
    const prompt = buildObligationsPrompt(promptContext);
    const result = await client.generateStructured(
      prompt,
      ExtractedObligationsResponseSchema,
      "You are a contract analysis assistant extracting obligations and deliverables.",
      { requestId, stepName: "obligations" }
    );

    const obligations = (result.obligations || []) as any[];
    for (const ob of obligations) {
      const sec = findSection(ob.sourceSectionLabel || "General");
      rawDrafts.push({
        itemType: "obligation",
        status: (ob.status as "confirmed" | "uncertain") || "confirmed",
        confidence: typeof ob.confidence === "number" ? ob.confidence : 0.9,
        uncertaintyReason: ob.uncertaintyReason || null,
        sourceSectionLabel: ob.sourceSectionLabel || "General",
        sourceSectionId: sec?.id || null,
        page: sec?.page || null,
        exactQuote: ob.exactQuote || "",
        citationVerified: true,
        citationWarning: null,
        originalPayload: ob,
      });
    }

    logPipelineStep(requestId, "obligations", {
      durationMs: Date.now() - startTimeStep3,
      success: true,
      itemCount: obligations.length,
    });
  } catch (err) {
    const msg = (err as Error).message;
    stepErrors.push({ step: "obligations", error: msg });
    logPipelineStep(requestId, "obligations", {
      durationMs: Date.now() - startTimeStep3,
      success: false,
      error: msg,
    });
  }

  // ----------------------------------------------------
  // STEP 4: Ambiguities, Conflicts & Policy Gaps
  // ----------------------------------------------------
  const startTimeStep4 = Date.now();
  let ambiguitiesSummary = "";
  try {
    const prompt = buildAmbiguitiesPrompt(promptContext, policyText);
    const result = await client.generateStructured(
      prompt,
      ExtractedAmbiguitiesResponseSchema,
      "You are a contract analysis assistant identifying factual ambiguities and discrepancies.",
      { requestId, stepName: "ambiguities_and_conflicts" }
    );

    const ambiguities = (result.ambiguitiesAndConflicts || []) as any[];
    for (const amb of ambiguities) {
      const sec = findSection(amb.sourceSectionLabel || "General");
      const isConflict = amb.issueType === "internal_contradiction" || amb.issueType === "policy_gap";
      rawDrafts.push({
        itemType: isConflict ? "conflict" : "ambiguity",
        status: (amb.status as "confirmed" | "uncertain") || "uncertain",
        confidence: typeof amb.confidence === "number" ? amb.confidence : 0.85,
        uncertaintyReason: amb.uncertaintyReason || amb.description || null,
        sourceSectionLabel: amb.sourceSectionLabel || "General",
        sourceSectionId: sec?.id || null,
        page: sec?.page || null,
        exactQuote: amb.exactQuote || "",
        citationVerified: true,
        citationWarning: null,
        originalPayload: amb,
      });
      ambiguitiesSummary += `- ${amb.issueType}: ${amb.description} (${amb.sourceSectionLabel})\n`;
    }

    logPipelineStep(requestId, "ambiguities_and_conflicts", {
      durationMs: Date.now() - startTimeStep4,
      success: true,
      itemCount: ambiguities.length,
    });
  } catch (err) {
    const msg = (err as Error).message;
    stepErrors.push({ step: "ambiguities_and_conflicts", error: msg });
    logPipelineStep(requestId, "ambiguities_and_conflicts", {
      durationMs: Date.now() - startTimeStep4,
      success: false,
      error: msg,
    });
  }

  // ----------------------------------------------------
  // STEP 5: Clarification Questions (Neutral & Non-Advisory)
  // ----------------------------------------------------
  const startTimeStep5 = Date.now();
  try {
    const prompt = buildClarificationQuestionsPrompt(
      promptContext,
      ambiguitiesSummary || "Review any general open terms in the contract sections."
    );
    const result = await client.generateStructured(
      prompt,
      ExtractedClarificationQuestionsResponseSchema,
      "You are a contract review assistant formulating neutral clarification questions.",
      { requestId, stepName: "clarification_questions" }
    );

    const questions = (result.clarificationQuestions || []) as any[];
    for (const cq of questions) {
      const sec = findSection(cq.sourceSectionLabel || "General");
      rawDrafts.push({
        itemType: "clarification_question",
        status: (cq.status as "confirmed" | "uncertain") || "uncertain",
        confidence: typeof cq.confidence === "number" ? cq.confidence : 0.9,
        uncertaintyReason: cq.uncertaintyReason || null,
        sourceSectionLabel: cq.sourceSectionLabel || "General",
        sourceSectionId: sec?.id || null,
        page: sec?.page || null,
        exactQuote: cq.exactQuote || "",
        citationVerified: true,
        citationWarning: null,
        originalPayload: cq,
      });
    }

    logPipelineStep(requestId, "clarification_questions", {
      durationMs: Date.now() - startTimeStep5,
      success: true,
      itemCount: questions.length,
    });
  } catch (err) {
    const msg = (err as Error).message;
    stepErrors.push({ step: "clarification_questions", error: msg });
    logPipelineStep(requestId, "clarification_questions", {
      durationMs: Date.now() - startTimeStep5,
      success: false,
      error: msg,
    });
  }

  // ----------------------------------------------------
  // DETERMINISTIC CITATION VERIFICATION & REJECTION
  // ----------------------------------------------------
  const verifiedItems: PipelineItemDraft[] = [];
  let rejectedCount = 0;

  for (const draft of rawDrafts) {
    const citeResult = verifyCitation(
      draft.exactQuote,
      draft.sourceSectionLabel,
      draft.sourceSectionId,
      sections
    );

    if (!citeResult.accepted) {
      // Reject items without valid citation
      rejectedCount++;
      logger.warn(
        {
          requestId,
          itemType: draft.itemType,
          section: draft.sourceSectionLabel,
          reason: citeResult.rejectionReason,
        },
        "Extraction item rejected due to missing or invalid citation"
      );
      continue;
    }

    // If citation could not be verified in the source text, downgrade to uncertain
    if (!citeResult.citationVerified) {
      draft.citationVerified = false;
      draft.status = "uncertain";
      draft.confidence = Math.min(draft.confidence, 0.5);
      draft.citationWarning = citeResult.warning;
      if (!draft.uncertaintyReason) {
        draft.uncertaintyReason = "Citation quote unverified in contract text.";
      }
    } else {
      draft.citationVerified = true;
      if (citeResult.matchedSectionId) {
        draft.sourceSectionId = citeResult.matchedSectionId;
      }
    }

    verifiedItems.push(draft);
  }

  return {
    items: verifiedItems,
    stepErrors,
    rejectedCount,
  };
}
