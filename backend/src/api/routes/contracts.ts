import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../../models/prisma.js";
import { ingestDocument } from "../../services/ingestion/index.js";
import { runExtractionPipeline } from "../../services/extractionPipeline.js";
import {
  applyManualOverride,
  resolveItemCalculatedDate,
} from "../../services/dates.js";
import {
  ReviewItemActionSchema,
  BulkApproveRequestSchema,
} from "@contract-assistant/shared";
import { NotFoundError, AppError } from "../../utils/errors.js";
import { getLLMClient } from "../../llm/client.js";
import { logger } from "../../utils/logger.js";
import { z } from "zod";

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
      const body = req.body as
        | { contractTitle?: string; contractText?: string; policyText?: string }
        | undefined;
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
    // 5. Deterministically resolve anchor dates for version 1
    const effItem = pipelineResult.items.find((i) => i.itemType === "effective_date");
    const effRes = effItem
      ? resolveItemCalculatedDate(
          { itemType: effItem.itemType, currentValue: JSON.stringify(effItem.originalPayload), exactQuote: effItem.exactQuote },
          {}
        )
      : null;
    const effDate = effRes?.calculatedDate || null;

    const termItem = pipelineResult.items.find((i) => i.itemType === "expiry");
    const expRes = termItem
      ? resolveItemCalculatedDate(
          { itemType: termItem.itemType, currentValue: JSON.stringify(termItem.originalPayload), exactQuote: termItem.exactQuote },
          { effectiveDate: effDate }
        )
      : null;
    const computedExpiry = expRes?.calculatedDate || null;

    // Save Extracted Items
    const createdItems = await Promise.all(
      pipelineResult.items.map(async (item) => {
        const dateRes = resolveItemCalculatedDate(
          {
            itemType: item.itemType,
            currentValue: JSON.stringify(item.originalPayload),
            exactQuote: item.exactQuote,
          },
          { effectiveDate: effDate, expiryDate: computedExpiry }
        );

        try {
          return await prisma.extractedItem.create({
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
              calculatedDate: dateRes.calculatedDate,
              dateResolutionStatus: dateRes.status,
              dateResolutionReason: dateRes.reason || null,
              dateSource: dateRes.dateSource || null,
            },
          });
        } catch (err) {
          logger.error(
            { err, itemType: item.itemType, contractVersionId: activeVersion.id },
            "Failed to save extracted item in database"
          );
          throw err;
        }
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
    const query = req.query as { version?: string };
    const targetVersionNumber = query.version ? parseInt(query.version, 10) : undefined;

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

    const activeVersion =
      (targetVersionNumber !== undefined
        ? contract.versions.find((v) => v.versionNumber === targetVersionNumber)
        : null) || contract.versions[0]!;

    // In-memory fallback if any activeVersion item has uncalculated date (no DB writes in GET)
    const effItem = activeVersion.extractedItems.find((i) => i.itemType === "effective_date");
    let effDate: string | null = effItem ? (effItem.manualDateOverride || effItem.calculatedDate) : null;
    if (effItem && !effDate) {
      const effRes = resolveItemCalculatedDate(effItem, {});
      if (effRes.calculatedDate) {
        effDate = effRes.calculatedDate;
        effItem.calculatedDate = effDate;
        effItem.dateResolutionStatus = "resolved";
        if (effRes.dateSource) effItem.dateSource = effRes.dateSource;
      }
    }

    const expItem = activeVersion.extractedItems.find((i) => i.itemType === "expiry" || i.itemType === "term");
    let expDate: string | null = expItem ? (expItem.manualDateOverride || expItem.calculatedDate) : null;
    if (expItem && !expDate && effDate) {
      const expRes = resolveItemCalculatedDate(expItem, { effectiveDate: effDate });
      if (expRes.calculatedDate) {
        expDate = expRes.calculatedDate;
        expItem.calculatedDate = expDate;
        expItem.dateResolutionStatus = "resolved";
        if (expRes.dateSource) expItem.dateSource = expRes.dateSource;
      }
    }

    for (const item of activeVersion.extractedItems) {
      if (!item.calculatedDate && !item.manualDateOverride) {
        const res = resolveItemCalculatedDate(item, { effectiveDate: effDate, expiryDate: expDate });
        if (res.calculatedDate) {
          item.calculatedDate = res.calculatedDate;
          item.dateResolutionStatus = res.status;
          item.dateResolutionReason = res.reason || null;
          if (res.dateSource) item.dateSource = res.dateSource;
        }
      }
    }

    return reply.send({
      contract: {
        id: contract.id,
        title: contract.title,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
        totalVersions: contract.versions.length,
      },
      activeVersion: {
        id: activeVersion.id,
        versionNumber: activeVersion.versionNumber,
        fileType: activeVersion.fileType,
        pageCount: activeVersion.pageCount,
        createdAt: activeVersion.createdAt,
        sections: activeVersion.sections,
        extractedItems: activeVersion.extractedItems,
        auditLogs: activeVersion.auditLogs,
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
    let calculatedDate = item.calculatedDate;
    let manualDateOverride = item.manualDateOverride;
    let dateResolutionStatus = item.dateResolutionStatus;
    let dateResolutionReason = item.dateResolutionReason;
    let auditAction = "item_approved";

    let dateSource = item.dateSource;

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

        // Re-evaluate calculated date from edited newValue
        const dateRes = resolveItemCalculatedDate(
          { itemType: item.itemType, currentValue: newCurrentValue, exactQuote: item.exactQuote },
          { effectiveDate: null, expiryDate: null }
        );
        if (dateRes.calculatedDate) {
          calculatedDate = dateRes.calculatedDate;
          dateResolutionStatus = dateRes.status;
          dateResolutionReason = dateRes.reason || "Updated from edited clause";
          dateSource = dateRes.dateSource || "ai_payload";
        }
      }
    } else if (body.action === "override_date") {
      if (body.newValue === "" || body.newValue === "reset") {
        manualDateOverride = null;
        dateResolutionReason = "Manual override removed; calculated date restored.";
        auditAction = "date_override_cleared";
        dateSource = item.calculatedDate ? (item.dateSource || "ai_payload") : null;
      } else if (body.newValue) {
        const overrideRes = applyManualOverride(item.calculatedDate, body.newValue, body.note);
        if (overrideRes.status === "resolved") {
          manualDateOverride = overrideRes.manualDateOverride;
          dateResolutionStatus = "resolved";
          dateResolutionReason = "Manually overridden by reviewer";
          auditAction = "date_overridden";
          dateSource = "manual_override";
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

    let updatedItem;
    try {
      updatedItem = await prisma.extractedItem.update({
        where: { id: itemId },
        data: {
          reviewStatus: newReviewStatus,
          currentValue: newCurrentValue,
          userEdited,
          calculatedDate,
          manualDateOverride,
          dateResolutionStatus,
          dateResolutionReason,
          dateSource,
        },
      });
    } catch (err) {
      logger.error({ err, itemId }, "Failed to update extracted item in database");
      throw err;
    }

    // If effective_date or expiry/term changed or was overridden, cascade date updates
    if (item.itemType === "effective_date" || item.itemType === "expiry" || item.itemType === "term") {
      const allItems = await prisma.extractedItem.findMany({
        where: { contractVersionId: item.contractVersionId },
      });

      const eff = allItems.find((i) => i.itemType === "effective_date");
      const activeEffDate = eff ? (eff.id === item.id ? (manualDateOverride || calculatedDate) : (eff.manualDateOverride || eff.calculatedDate)) : null;

      const exp = allItems.find((i) => i.itemType === "expiry" || i.itemType === "term");
      let activeExpDate = exp ? (exp.id === item.id ? (manualDateOverride || calculatedDate) : (exp.manualDateOverride || exp.calculatedDate)) : null;

      // Recompute expiry if not overridden and effDate changed
      if (exp && exp.id !== item.id && !exp.manualDateOverride && activeEffDate) {
        const expRes = resolveItemCalculatedDate(exp, { effectiveDate: activeEffDate });
        if (expRes.calculatedDate && expRes.calculatedDate !== exp.calculatedDate) {
          activeExpDate = expRes.calculatedDate;
          try {
            await prisma.extractedItem.update({
              where: { id: exp.id },
              data: {
                calculatedDate: expRes.calculatedDate,
                dateResolutionStatus: expRes.status,
                dateResolutionReason: expRes.reason,
                dateSource: expRes.dateSource || exp.dateSource,
              },
            });
          } catch (err) {
            logger.error({ err, expId: exp.id }, "Cascade expiry date update failed");
          }
        }
      }

      // Recompute dependent renewal/notice items and obligations
      for (const other of allItems) {
        if (other.id === item.id) continue;
        if (other.manualDateOverride) continue; // Respect existing manual overrides!

        if (other.itemType === "renewal" || other.itemType === "notice" || other.itemType === "obligation") {
          const res = resolveItemCalculatedDate(other, { effectiveDate: activeEffDate, expiryDate: activeExpDate });
          if (res.calculatedDate && res.calculatedDate !== other.calculatedDate) {
            try {
              await prisma.extractedItem.update({
                where: { id: other.id },
                data: {
                  calculatedDate: res.calculatedDate,
                  dateResolutionStatus: res.status,
                  dateResolutionReason: res.reason,
                  dateSource: res.dateSource || other.dateSource,
                },
              });
            } catch (err) {
              logger.error({ err, otherId: other.id }, "Cascade dependent date update failed");
            }
          }
        }
      }
    }

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

  /**
   * Delete a contract and all cascading data (versions, sections, items, audit logs, summaries)
   */
  app.delete("/api/contracts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const contract = await prisma.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      throw new NotFoundError(`Contract with id ${id} not found.`);
    }

    await prisma.contract.delete({
      where: { id },
    });

    return reply.send({
      success: true,
      message: `Contract "${contract.title}" deleted successfully.`,
      deletedId: id,
    });
  });

  /**
   * Retry a single pipeline extraction pass without re-running the entire pipeline
   */
  app.post("/api/contracts/:id/extract/retry", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { step } = z
      .object({
        step: z.enum([
          "parties_and_effective_date",
          "term_and_renewal",
          "obligations",
          "ambiguities_and_conflicts",
          "clarification_questions",
        ]),
      })
      .parse(req.body);

    const requestId = (req.id as string) || `retry-${Date.now()}`;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            sections: { orderBy: { sectionIndex: "asc" } },
            extractedItems: true,
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundError(`Contract with id ${id} not found.`);
    }

    const activeVersion = contract.versions[0]!;

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
      activeVersion.policyText,
      { requestId, onlyStep: step }
    );

    const createdItems = await Promise.all(
      pipelineResult.items.map(async (item) => {
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
          },
        });
      })
    );

    await prisma.auditLog.create({
      data: {
        contractVersionId: activeVersion.id,
        actor: "user",
        action: "step_retried",
        note: `Retried pipeline step '${step}'. Extracted ${createdItems.length} items.`,
      },
    });

    return reply.send({
      success: true,
      step,
      addedCount: createdItems.length,
      stepErrors: pipelineResult.stepErrors,
    });
  });
}


