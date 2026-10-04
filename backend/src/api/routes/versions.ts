import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../../models/prisma.js";
import { ingestDocument } from "../../services/ingestion/index.js";
import { runExtractionPipeline } from "../../services/extractionPipeline.js";
import { detectStaleItems, compareVersionSections } from "../../services/staleDetector.js";
import { StaleResolveActionSchema } from "@contract-assistant/shared";
import { NotFoundError, AppError } from "../../utils/errors.js";

export async function versionRoutes(app: FastifyInstance) {
  /**
   * Upload a new version (v2, v3, etc.) of an existing contract
   */
  app.post("/api/contracts/:id/versions", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const requestId = req.id as string;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            extractedItems: true,
            sections: true,
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundError(`Contract with id ${id} not found.`);
    }

    const latestVersion = contract.versions[0]!;
    const newVersionNumber = latestVersion.versionNumber + 1;

    let contractBuffer: Buffer | null = null;
    let contractFilename = "";
    let contractMimetype = "";
    let contractText = "";

    if (req.isMultipart()) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "field" && part.fieldname === "contractText") {
          contractText = (part.value as string).trim();
        } else if (part.type === "file" && part.fieldname === "contract") {
          contractBuffer = await part.toBuffer();
          contractFilename = part.filename;
          contractMimetype = part.mimetype;
        }
      }
    } else {
      const body = req.body as any;
      contractText = body?.contractText || "";
    }

    if (!contractBuffer && !contractText) {
      throw new AppError("No new contract version file or text provided.", 400, "MISSING_CONTRACT");
    }

    // 1. Ingest new version
    const ingested = await ingestDocument(contractBuffer || contractText, {
      filename: contractFilename || `${contract.title}_v${newVersionNumber}.txt`,
      mimetype: contractMimetype,
      documentType: "contract",
    });

    // 2. Create new ContractVersion record
    const newVersion = await prisma.contractVersion.create({
      data: {
        contractId: contract.id,
        versionNumber: newVersionNumber,
        rawText: ingested.rawText,
        policyText: latestVersion.policyText,
        pageCount: ingested.pageCount,
        fileType: ingested.fileType,
        sections: {
          create: ingested.sections.map((s) => ({
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
      include: {
        sections: true,
      },
    });

    // 3. Run AI extraction on new version
    const pipelineResult = await runExtractionPipeline(
      newVersion.sections.map((s) => ({
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
      newVersion.policyText,
      { requestId }
    );

    // 4. Stale Detection Matching
    const priorApprovedItems = latestVersion.extractedItems.filter(
      (i) => i.reviewStatus === "approved" || i.reviewStatus === "edited_approved"
    );

    const newDraftsWithId = pipelineResult.items.map((item, idx) => ({
      ...item,
      tempId: `draft-${idx}`,
    }));

    const { matchedNewItems, stalePriorItems } = detectStaleItems(
      newDraftsWithId.map((d) => ({
        itemType: d.itemType,
        sourceSectionLabel: d.sourceSectionLabel,
        exactQuote: d.exactQuote,
        tempId: d.tempId,
      })),
      priorApprovedItems.map((p) => ({
        id: p.id,
        itemType: p.itemType,
        sourceSectionLabel: p.sourceSectionLabel,
        exactQuote: p.exactQuote,
        currentValue: p.currentValue,
        userEdited: p.userEdited,
      })),
      newVersion.sections.map((s) => ({
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
      }))
    );

    let carriedOverCount = 0;
    let newItemsCount = 0;

    // Create extracted items for new version
    await Promise.all(
      newDraftsWithId.map(async (draft) => {
        const matchInfo = matchedNewItems.get(draft.tempId);
        const isCarriedOver = matchInfo?.action === "carried_over";

        if (isCarriedOver) carriedOverCount++;
        else newItemsCount++;

        const reviewStatus = isCarriedOver
          ? matchInfo?.priorItem?.userEdited
            ? "edited_approved"
            : "approved"
          : "pending";

        const currentValue =
          isCarriedOver && matchInfo?.priorItem
            ? matchInfo.priorItem.currentValue
            : JSON.stringify(draft.originalPayload);

        const userEdited = isCarriedOver ? !!matchInfo?.priorItem?.userEdited : false;

        return prisma.extractedItem.create({
          data: {
            contractVersionId: newVersion.id,
            itemType: draft.itemType,
            status: draft.status,
            confidence: draft.confidence,
            uncertaintyReason: draft.uncertaintyReason,
            sourceSectionLabel: draft.sourceSectionLabel,
            sourceSectionId: draft.sourceSectionId,
            page: draft.page,
            exactQuote: draft.exactQuote,
            citationVerified: draft.citationVerified,
            citationWarning: draft.citationWarning,
            reviewStatus,
            userEdited,
            originalValue: JSON.stringify(draft.originalPayload),
            currentValue,
          },
        });
      })
    );

    // Carry forward stale items into new version review queue
    for (const stale of stalePriorItems) {
      await prisma.extractedItem.create({
        data: {
          contractVersionId: newVersion.id,
          itemType: stale.priorItem.itemType,
          status: "uncertain",
          confidence: 0.5,
          uncertaintyReason: stale.staleReason,
          sourceSectionLabel: stale.priorItem.sourceSectionLabel,
          exactQuote: stale.priorItem.exactQuote,
          citationVerified: false,
          citationWarning: `Flagged potentially stale: ${stale.staleReason}`,
          reviewStatus: "stale",
          userEdited: stale.priorItem.userEdited,
          originalValue: stale.priorItem.currentValue,
          currentValue: stale.priorItem.currentValue,
          staleReason: stale.staleReason,
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        contractVersionId: newVersion.id,
        actor: "local user",
        action: "version_uploaded",
        note: `Uploaded v${newVersionNumber}. Carried over ${carriedOverCount} approved items, flagged ${stalePriorItems.length} stale items, and extracted ${newItemsCount} new pending items.`,
      },
    });

    return reply.status(201).send({
      contractId: contract.id,
      versionId: newVersion.id,
      versionNumber: newVersionNumber,
      newItemsCount,
      staleCount: stalePriorItems.length,
      carriedOverCount,
    });
  });

  /**
   * Version comparison view: section diffs between two versions
   */
  app.get("/api/contracts/:id/versions/compare", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { v1?: string; v2?: string };

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "asc" },
          include: {
            sections: { orderBy: { sectionIndex: "asc" } },
            extractedItems: true,
          },
        },
      },
    });

    if (!contract || contract.versions.length < 2) {
      throw new AppError("Contract must have at least 2 versions to compare.", 400, "INSUFFICIENT_VERSIONS");
    }

    const v1Num = query.v1 ? parseInt(query.v1, 10) : contract.versions[contract.versions.length - 2]!.versionNumber;
    const v2Num = query.v2 ? parseInt(query.v2, 10) : contract.versions[contract.versions.length - 1]!.versionNumber;

    const version1 = contract.versions.find((v) => v.versionNumber === v1Num);
    const version2 = contract.versions.find((v) => v.versionNumber === v2Num);

    if (!version1 || !version2) {
      throw new NotFoundError("Specified versions not found.");
    }

    const sectionDiff = compareVersionSections(
      version1.sections.map((s) => ({
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
      version2.sections.map((s) => ({
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
      }))
    );

    const staleItemsQueue = version2.extractedItems.filter((i) => i.reviewStatus === "stale");

    return reply.send({
      contractId: contract.id,
      v1: v1Num,
      v2: v2Num,
      sectionDiff,
      staleItemsQueue,
    });
  });

  /**
   * Resolve stale item: Reconfirm or Dismiss
   */
  app.patch("/api/contracts/:id/items/:itemId/stale-resolve", async (req: FastifyRequest, reply: FastifyReply) => {
    const { itemId } = req.params as { id: string; itemId: string };
    const { action, note } = StaleResolveActionSchema.parse(req.body);

    const item = await prisma.extractedItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundError(`Item ${itemId} not found.`);
    }

    const newStatus = action === "reconfirm" ? "approved" : "rejected";
    const auditAction = action === "reconfirm" ? "stale_reconfirmed" : "stale_dismissed";

    const updated = await prisma.extractedItem.update({
      where: { id: itemId },
      data: {
        reviewStatus: newStatus,
        staleReason: action === "reconfirm" ? null : item.staleReason,
      },
    });

    await prisma.auditLog.create({
      data: {
        contractVersionId: item.contractVersionId,
        itemId: item.id,
        actor: "local user",
        action: auditAction,
        note: note || `Stale item ${action === "reconfirm" ? "re-confirmed by user" : "dismissed by user"}`,
      },
    });

    return reply.send({ success: true, item: updated });
  });
}
