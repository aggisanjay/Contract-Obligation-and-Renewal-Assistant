import { z } from "zod";

// ==========================================
// 1. SECTION & INGESTION SCHEMAS
// ==========================================

export const DocumentSectionSchema = z.object({
  id: z.string(),
  contractVersionId: z.string(),
  sectionIndex: z.number().int(),
  label: z.string(), // e.g. "Section 12.3" or "Paragraph 4"
  heading: z.string().nullable(), // e.g. "Termination for Convenience"
  text: z.string(),
  page: z.number().int().nullable(), // page number (1-based for PDF, null for DOCX/text)
  charStart: z.number().int(),
  charEnd: z.number().int(),
  documentType: z.enum(["contract", "policy"]).default("contract"),
});

export type DocumentSection = z.infer<typeof DocumentSectionSchema>;

export const IngestionResultSchema = z.object({
  contractTitle: z.string(),
  sections: z.array(DocumentSectionSchema),
  pageCount: z.number().int().nullable(),
  rawTextLength: z.number().int(),
  warnings: z.array(z.string()),
});

export type IngestionResult = z.infer<typeof IngestionResultSchema>;

// ==========================================
// 2. EXTRACTION ITEM SCHEMAS
// ==========================================

export const ItemTypeEnum = z.enum([
  "party",
  "effective_date",
  "expiry",
  "renewal",
  "termination",
  "notice",
  "obligation",
  "ambiguity",
  "conflict",
  "clarification_question",
]);

export type ItemType = z.infer<typeof ItemTypeEnum>;

export const ExtractionStatusEnum = z.enum(["confirmed", "uncertain"]);
export type ExtractionStatus = z.infer<typeof ExtractionStatusEnum>;

export const ReviewStatusEnum = z.enum([
  "pending",
  "approved",
  "rejected",
  "edited_approved",
  "stale",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusEnum>;

export const ObligationTypeEnum = z.enum([
  "payment",
  "reporting",
  "delivery",
  "confidentiality",
  "compliance",
  "other",
]);
export type ObligationType = z.infer<typeof ObligationTypeEnum>;

export const RecurrenceEnum = z.enum([
  "one_time",
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
  "custom",
]);
export type Recurrence = z.infer<typeof RecurrenceEnum>;

// Structured payload variants for different item types
export const PartyPayloadSchema = z.object({
  name: z.string(),
  role: z.string(), // e.g. "Vendor", "Client", "Licensee"
  address: z.string().optional(),
  jurisdiction: z.string().optional(),
});

export const EffectiveDatePayloadSchema = z.object({
  date: z.string().nullable(), // YYYY-MM-DD if absolute
  isRelative: z.boolean(),
  relativeRule: z.string().optional(),
});

export const TermExpiryPayloadSchema = z.object({
  termLengthMonths: z.number().nullable().optional(),
  termLengthYears: z.number().nullable().optional(),
  expiryDate: z.string().nullable().optional(), // YYYY-MM-DD
  isPerpetual: z.boolean().default(false),
  description: z.string(),
});

export const RenewalPayloadSchema = z.object({
  isAutoRenew: z.boolean(),
  renewalTermMonths: z.number().nullable().optional(),
  noticePeriodDays: z.number().nullable().optional(),
  noticePeriodMonths: z.number().nullable().optional(),
  conditions: z.string().optional(),
});

export const TerminationPayloadSchema = z.object({
  forCauseAllowed: z.boolean(),
  forConvenienceAllowed: z.boolean(),
  noticePeriodDays: z.number().nullable().optional(),
  curePeriodDays: z.number().nullable().optional(),
  summary: z.string(),
});

export const NoticePayloadSchema = z.object({
  noticePeriodDays: z.number().nullable().optional(),
  noticePeriodMonths: z.number().nullable().optional(),
  method: z.string().optional(), // e.g. "email", "certified mail"
  recipient: z.string().optional(),
  targetEvent: z.string().optional(), // e.g. "renewal", "termination", "material breach"
});

export const ObligationPayloadSchema = z.object({
  description: z.string(),
  responsibleParty: z.string(),
  obligationType: ObligationTypeEnum,
  deadlineDate: z.string().nullable().optional(), // YYYY-MM-DD if fixed
  relativeDeadline: z.string().nullable().optional(), // e.g. "within 30 days of effective date"
  recurrence: RecurrenceEnum.default("one_time"),
  recurrenceRule: z.string().optional(),
});

export const AmbiguityConflictPayloadSchema = z.object({
  issueType: z.enum(["unclear_term", "missing_data", "internal_contradiction", "policy_gap"]),
  description: z.string(),
  conflictingSectionLabel: z.string().optional(),
  policyReference: z.string().optional(),
});

export const ClarificationQuestionPayloadSchema = z.object({
  question: z.string(),
  targetClause: z.string(),
  userAnswer: z.string().nullable().optional(),
});

// Union/Record representation for item payload
export const ExtractedItemPayloadSchema = z.union([
  PartyPayloadSchema,
  EffectiveDatePayloadSchema,
  TermExpiryPayloadSchema,
  RenewalPayloadSchema,
  TerminationPayloadSchema,
  NoticePayloadSchema,
  ObligationPayloadSchema,
  AmbiguityConflictPayloadSchema,
  ClarificationQuestionPayloadSchema,
  z.record(z.unknown()),
]);

export type ExtractedItemPayload = z.infer<typeof ExtractedItemPayloadSchema>;

export const ExtractedItemSchema = z.object({
  id: z.string(),
  contractVersionId: z.string(),
  itemType: ItemTypeEnum,
  status: ExtractionStatusEnum,
  confidence: z.number().min(0).max(1),
  uncertaintyReason: z.string().nullable(),
  
  // Citation requirements
  sourceSectionLabel: z.string(),
  sourceSectionId: z.string().nullable(),
  page: z.number().int().nullable(),
  exactQuote: z.string(),
  citationVerified: z.boolean(),
  citationWarning: z.string().nullable(),

  // Review states
  reviewStatus: ReviewStatusEnum.default("pending"),
  userEdited: z.boolean().default(false),
  originalValue: z.string(), // JSON stringified original extracted payload
  currentValue: z.string(), // JSON stringified current payload (user-editable)
  staleReason: z.string().nullable().optional(),

  // Calculated date info (optional for obligations / notices / deadlines)
  calculatedDate: z.string().nullable().optional(), // YYYY-MM-DD
  manualDateOverride: z.string().nullable().optional(), // YYYY-MM-DD
  dateResolutionStatus: z.enum(["resolved", "needs_input", "not_applicable"]).default("not_applicable"),
  dateResolutionReason: z.string().nullable().optional(),

  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

// ==========================================
// 3. DATE & REMINDER SCHEMAS
// ==========================================

export const DateResolutionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("resolved"),
    date: z.string(), // YYYY-MM-DD
    sourceRule: z.string(),
    reminders: z.array(z.string()), // list of YYYY-MM-DD reminder dates
    nextOccurrences: z.array(z.string()).optional(), // for recurring deadlines
  }),
  z.object({
    status: z.literal("needs_input"),
    reason: z.string(),
  }),
  z.object({
    status: z.literal("not_applicable"),
  }),
]);

export type DateResolutionResult = z.infer<typeof DateResolutionResultSchema>;

// ==========================================
// 4. AUDIT LOG SCHEMA
// ==========================================

export const AuditActionEnum = z.enum([
  "item_approved",
  "item_rejected",
  "item_edited",
  "item_bulk_approved",
  "date_overridden",
  "question_answered",
  "stale_reconfirmed",
  "stale_dismissed",
]);

export type AuditAction = z.infer<typeof AuditActionEnum>;

export const AuditLogSchema = z.object({
  id: z.string(),
  contractVersionId: z.string(),
  itemId: z.string().nullable(),
  actor: z.string().default("local user"),
  action: AuditActionEnum,
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

// ==========================================
// 5. REVIEWED SUMMARY SCHEMA
// ==========================================

export const ReviewedSummarySchema = z.object({
  id: z.string(),
  contractId: z.string(),
  contractVersionId: z.string(),
  versionNumber: z.number().int(),
  contractTitle: z.string(),
  generatedAt: z.string(),
  isOutdated: z.boolean(),
  legalDisclaimer: z.string(),
  
  parties: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      citation: z.string(),
    })
  ),
  keyDates: z.object({
    effectiveDate: z.string().nullable(),
    expiryDate: z.string().nullable(),
    noticeDeadline: z.string().nullable(),
    citation: z.string(),
  }),
  renewalTerms: z.object({
    isAutoRenew: z.boolean(),
    summary: z.string(),
    citation: z.string(),
  }),
  terminationTerms: z.object({
    summary: z.string(),
    citation: z.string(),
  }),
  obligations: z.array(
    z.object({
      description: z.string(),
      responsibleParty: z.string(),
      type: stringOrUnknown(),
      deadline: z.string().nullable(),
      recurrence: z.string(),
      citation: z.string(),
    })
  ),
  openQuestionsAndAmbiguities: z.array(
    z.object({
      description: z.string(),
      userAnswer: z.string().nullable(),
      citation: z.string(),
    })
  ),
  metrics: z.object({
    totalApproved: z.number().int(),
    totalRejected: z.number().int(),
    totalStale: z.number().int(),
  }),
  markdownContent: z.string(),
  htmlContent: z.string(),
});

function stringOrUnknown(): z.ZodType<string> {
  return z.string();
}

export type ReviewedSummary = z.infer<typeof ReviewedSummarySchema>;

// ==========================================
// 6. API REQUEST / RESPONSE SCHEMAS
// ==========================================

export const UploadContractRequestSchema = z.object({
  contractTitle: z.string().min(1),
  contractText: z.string().optional(),
  policyText: z.string().optional(),
});

export const ReviewItemActionSchema = z.object({
  action: z.enum(["approve", "reject", "edit", "override_date", "answer_question"]),
  newValue: z.string().optional(), // JSON string or text answer or date override
  note: z.string().optional(),
});

export const BulkApproveRequestSchema = z.object({
  itemIds: z.array(z.string()),
});

export const StaleResolveActionSchema = z.object({
  action: z.enum(["reconfirm", "dismiss"]),
  note: z.string().optional(),
});
