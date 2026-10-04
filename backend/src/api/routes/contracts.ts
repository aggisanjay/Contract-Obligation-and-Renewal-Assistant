import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../../models/prisma.js";
import { ingestDocument } from "../../services/ingestion/index.js";
import { runExtractionPipeline } from "../../services/extractionPipeline.js";
import {
  computeExpiryDate,
  computeNoticeDeadline,
  resolveRelativeDeadline,
  applyManualOverride,
} from "../../services/dates.js";
import {
  ReviewItemActionSchema,
  BulkApproveRequestSchema,
} from "@contract-assistant/shared";
import { NotFoundError, AppError } from "../../utils/errors.js";
import { getLLMClient } from "../../llm/client.js";

export async function contractRoutes(app: FastifyInstance) {
  /**
   * Upload and process a contract document (+ optional policy document)
   */
  app.post("/api/contracts/upload", async (req: FastifyRequest, reply: FastifyReply) => {
    const requestId = req.id as string;
    let contractTitle = "Untitled Contract";
    let contractBuffer: Buffer | null = null;
    let contractFilename = "";
    let contractMimetype = "";
    let contractText = "";

    let policyBuffer: Buffer | null = null;
    let policyFilename = "";
    let policyMimetype = "";
    let policyText = "";

    // Check if multipart or JSON payload
    if (req.isMultipart()) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "field") {
          if (part.fieldname === "title" && typeof part.value === "string") {
            contractTitle = part.value.trim() || contractTitle;
          } else if (part.fieldname === "contractText" && typeof part.value === "string") {
            contractText = part.value.trim();
          } else if (part.fieldname === "policyText" && typeof part.value === "string") {
            policyText = part.value.trim();
          }
        } else if (part.type === "file") {
          const buf = await part.toBuffer();
          if (part.fieldname === "contract") {
            contractBuffer = buf;
            contractFilename = part.filename;
            contractMimetype = part.mimetype;
          } else if (part.fieldname === "policy") {
            policyBuffer = buf;
            policyFilename = part.filename;
            policyMimetype = part.mimetype;
          }
        }
      }
    } else {
      const body = req.body as any;
      contractTitle = body?.contractTitle || contractTitle;
      contractText = body?.contractText || "";
      policyText = body?.policyText || "";
    }

    if (!contractBuffer && !contractText) {
      throw new AppError("No contract file or pasted text provided.", 400, "MISSING_CONTRACT");
    }

    // 1. Ingest Contract
    const ingestedContract = await ingestDocument(contractBuffer || contractText, {
      filename: contractFilename || (contractTitle ? `${contractTitle}.txt` : "Contract.txt"),
      mimetype: contractMimetype,
      documentType: "contract",
    });

    // 2. Ingest Policy if provided
    let policyRawText: string | null = null;
    if (policyBuffer || policyText) {
      const ingestedPolicy = await ingestDocument(policyBuffer || policyText, {
        filename: policyFilename || "Policy.txt",
        mimetype: policyMimetype,
        documentType: "policy",
      });
      policyRawText = ingestedPolicy.rawText;
    }

    // 3. Persist Contract & Version 1 in Prisma
    const contract = await prisma.contract.create({
      data: {
        title: contractTitle || ingestedContract.title,
        versions: {
          create: {
            versionNumber: 1,
            rawText: ingestedContract.rawText,
            policyText: policyRawText,
            pageCount: ingestedContract.pageCount,
            fileType: ingestedContract.fileType,
            sections: {
              create: ingestedContract.sections.map((s) => ({
                sectionIndex: s.sectionIndex,
                label: s.label,
                heading: s.heading,
                text: s.text,
                page: s.page,
                charStart: s.charStart,
                charEnd: s.charEnd,
                documentType: s.documentType,
              })),
            },
          },
        },
      },
      include: {
        versions: {
          include: {
            sections: true,
          },
        },
      },
    });

    const activeVersion = contract.versions[0]!;

    // 4. Run AI Extraction Pipeline
    const pipelineResult = await runExtractionPipeline(
      activeVersion.sections.map((s) => ({
        id: s.id,
        contractVersionId: s.contractVersionId,
        sectionIndex: s.sectionIndex,
        label: s.label,
        heading: s.heading,
        text: s.text,
        page: s.page,
        charStart: s.charStart,
        charEnd: s.charEnd,
        documentType: s.documentType as "contract" | "policy",
      })),
      policyRawText,
      { requestId }
    );

    // 5. Compute Dates deterministically for extracted items
    // First find effective date and expiry items to use as anchors
    const effItem = pipelineResult.items.find((i) => i.itemType === "effective_date");
    const effDate = (effItem?.originalPayload as any)?.date || null;

    const termItem = pipelineResult.items.find((i) => i.itemType === "expiry");
    const termPayload = (termItem?.originalPayload as any) || {};

    let computedExpiry: string | null = null;
    if (termItem) {
      const expRes = computeExpiryDate({
        effectiveDate: effDate || "",
        termMonths: termPayload.termLengthMonths,
        termYears: termPayload.termLengthYears,
        exactExpiryDate: termPayload.expiryDate,
      });
      if (expRes.status === "resolved") {
        computedExpiry = expRes.date;
      }
    }

    // Save Extracted Items
    const createdItems = await Promise.all(
      pipelineResult.items.map(async (item) => {
        let calculatedDate: string | null = null;
        let dateResolutionStatus: string = "not_applicable";
        let dateResolutionReason: string | null = null;

        if (item.itemType === "effective_date") {
          calculatedDate = effDate;
          dateResolutionStatus = effDate ? "resolved" : "needs_input";
        } else if (item.itemType === "expiry") {
          if (computedExpiry) {
            calculatedDate = computedExpiry;
            dateResolutionStatus = "resolved";
          } else {
            dateResolutionStatus = "needs_input";
            dateResolutionReason = "Could not compute expiry date without effective date and term duration.";
          }
        } else if (item.itemType === "renewal" || item.itemType === "notice") {
          const payload = item.originalPayload as any;
          if (computedExpiry && (payload.noticePeriodDays || payload.noticePeriodMonths)) {
            const notRes = computeNoticeDeadline({
              expiryDate: computedExpiry,
              noticeDays: payload.noticePeriodDays,
              noticeMonths: payload.noticePeriodMonths,
            });
            if (notRes.status === "resolved") {
              calculatedDate = notRes.date;
              dateResolutionStatus = "resolved";
            }
          }
        } else if (item.itemType === "obligation") {
          const payload = item.originalPayload as any;
          if (payload.deadlineDate) {
            calculatedDate = payload.deadlineDate;
            dateResolutionStatus = "resolved";
          } else if (payload.relativeDeadline) {
            const relRes = resolveRelativeDeadline(payload.relativeDeadline, {
              effectiveDate: effDate,
              expiryDate: computedExpiry,
            });
            if (relRes.status === "resolved") {
              calculatedDate = relRes.date;
              dateResolutionStatus = "resolved";
            } else if (relRes.status === "needs_input") {
              dateResolutionStatus = "needs_input";
              dateResolutionReason = relRes.reason;
            }
          }
        }

        return prisma.extractedItem.create({
          data: {
            contractVersionId: activeVersion.id,
            itemType: item.itemType,
            status: item.status,
            confidence: item.confidence,
            uncertaintyReason: item.uncertaintyReason,
            sourceSectionLabel: item.sourceSectionLabel,
            sourceSectionId: item.sourceSectionId,
            page: item.page,
            exactQuote: item.exactQuote,
            citationVerified: item.citationVerified,
            citationWarning: item.citationWarning,
            reviewStatus: "pending",
            userEdited: false,
            originalValue: JSON.stringify(item.originalPayload),
            currentValue: JSON.stringify(item.originalPayload),
            calculatedDate,
            dateResolutionStatus,
            dateResolutionReason,
          },
        });
      })
    );

    // Initial audit log
    await prisma.auditLog.create({
      data: {
        contractVersionId: activeVersion.id,
        actor: "system",
        action: "contract_uploaded",
        note: `Contract ingested with ${ingestedContract.sections.length} sections and ${createdItems.length} extracted items.`,
      },
    });

    return reply.status(201).send({
      contractId: contract.id,
      versionId: activeVersion.id,
      title: contract.title,
      sectionCount: ingestedContract.sections.length,
      itemCount: createdItems.length,
      rejectedCount: pipelineResult.rejectedCount,
      stepErrors: pipelineResult.stepErrors,
    });
  });

  /**
   * Get contract details, sections, extracted items, and audit log
   */
  app.get("/api/contracts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            sections: { orderBy: { sectionIndex: "asc" } },
            extractedItems: { orderBy: { createdAt: "asc" } },
            auditLogs: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundError(`Contract with id ${id} not found.`);
    }

    const latestVersion = contract.versions[0]!;

    return reply.send({
      contract: {
        id: contract.id,
        title: contract.title,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
        totalVersions: contract.versions.length,
      },
      activeVersion: {
        id: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
        fileType: latestVersion.fileType,
        pageCount: latestVersion.pageCount,
        createdAt: latestVersion.createdAt,
        sections: latestVersion.sections,
        extractedItems: latestVersion.extractedItems,
        auditLogs: latestVersion.auditLogs,
      },
      allVersions: contract.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        itemCount: v.extractedItems.length,
      })),
      isDemoMode: getLLMClient().isMock(),
    });
  });

  /**
   * Review single extracted item (approve, reject, edit, override date, answer question)
   */
  app.patch("/api/contracts/:id/items/:itemId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { itemId } = req.params as { id: string; itemId: string };
    const body = ReviewItemActionSchema.parse(req.body);

    const item = await prisma.extractedItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundError(`Extracted item ${itemId} not found.`);
    }

    const oldValue = item.currentValue;
    let newReviewStatus = item.reviewStatus;
    let newCurrentValue = item.currentValue;
    let userEdited = item.userEdited;
    let manualDateOverride = item.manualDateOverride;
    let dateResolutionStatus = item.dateResolutionStatus;
    let dateResolutionReason = item.dateResolutionReason;
    let auditAction = "item_approved";

    if (body.action === "approve") {
      newReviewStatus = userEdited ? "edited_approved" : "approved";
      auditAction = "item_approved";
    } else if (body.action === "reject") {
      newReviewStatus = "rejected";
      auditAction = "item_rejected";
    } else if (body.action === "edit") {
      if (body.newValue) {
        newCurrentValue = body.newValue;
        userEdited = true;
        newReviewStatus = "edited_approved";
        auditAction = "item_edited";
      }
    } else if (body.action === "override_date") {
      if (body.newValue) {
        const overrideRes = applyManualOverride(item.calculatedDate, body.newValue, body.note);
        if (overrideRes.status === "resolved") {
          manualDateOverride = overrideRes.manualDateOverride;
          dateResolutionStatus = "resolved";
          dateResolutionReason = "Manually overridden by reviewer";
          auditAction = "date_overridden";
        } else {
          throw new AppError(overrideRes.reason, 400, "INVALID_DATE_OVERRIDE");
        }
      }
    } else if (body.action === "answer_question") {
      if (body.newValue) {
        try {
          const parsed = JSON.parse(item.currentValue);
          parsed.userAnswer = body.newValue;
          newCurrentValue = JSON.stringify(parsed);
          userEdited = true;
          auditAction = "question_answered";
        } catch {
          newCurrentValue = JSON.stringify({
            question: item.currentValue,
            userAnswer: body.newValue,
          });
        }
      }
    }

    const updatedItem = await prisma.extractedItem.update({
      where: { id: itemId },
      data: {
        reviewStatus: newReviewStatus,
        currentValue: newCurrentValue,
        userEdited,
        manualDateOverride,
        dateResolutionStatus,
        dateResolutionReason,
      },
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        contractVersionId: item.contractVersionId,
        itemId: item.id,
        actor: "local user",
        action: auditAction,
        oldValue: oldValue !== newCurrentValue ? oldValue : null,
        newValue: newCurrentValue,
        note: body.note || null,
      },
    });

    return reply.send({
      success: true,
      item: updatedItem,
    });
  });

  /**
   * Bulk approve items (restricted to confirmed + citation-verified items)
   * NEVER auto-approves uncertain items!
   */
  app.post("/api/contracts/:id/items/bulk-approve", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { itemIds } = BulkApproveRequestSchema.parse(req.body);

    const items = await prisma.extractedItem.findMany({
      where: {
        id: { in: itemIds },
      },
    });

    let approvedCount = 0;
    const skippedUncertain: string[] = [];

    for (const item of items) {
      // RULE: Bulk-approve of confirmed, citation-verified items is allowed, but never auto-approve uncertain items.
      if (item.status === "uncertain" || !item.citationVerified) {
        skippedUncertain.push(item.id);
        continue;
      }

      await prisma.extractedItem.update({
        where: { id: item.id },
        data: {
          reviewStatus: item.userEdited ? "edited_approved" : "approved",
        },
      });

      await prisma.auditLog.create({
        data: {
          contractVersionId: item.contractVersionId,
          itemId: item.id,
          actor: "local user",
          action: "item_bulk_approved",
          newValue: item.currentValue,
          note: "Approved via bulk review action",
        },
      });

      approvedCount++;
    }

    return reply.send({
      success: true,
      contractId: id,
      approvedCount,
      skippedUncertainCount: skippedUncertain.length,
      skippedItemIds: skippedUncertain,
    });
  });

  /**
   * Get audit log for a contract version
   */
  app.get("/api/contracts/:id/audit-log", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const logs = await prisma.auditLog.findMany({
      where: {
        contractVersion: {
          contractId: id,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ logs });
  });

  /**
   * List all contracts
   */
  app.get("/api/contracts", async (_req: FastifyRequest, reply: FastifyReply) => {
    const contracts = await prisma.contract.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            extractedItems: true,
          },
        },
      },
    });

    const results = contracts.map((c) => {
      const latestVer = c.versions[0];
      const items = latestVer?.extractedItems || [];
      const approvedCount = items.filter((i) => i.reviewStatus === "approved" || i.reviewStatus === "edited_approved").length;
      const pendingCount = items.filter((i) => i.reviewStatus === "pending").length;

      return {
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        totalItems: items.length,
        approvedCount,
        pendingCount,
        latestVersionNumber: latestVer?.versionNumber || 1,
      };
    });

    return reply.send({ contracts: results });
  });
}
