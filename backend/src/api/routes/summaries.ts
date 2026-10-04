import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ReviewStatus, ItemType, ExtractionStatus } from "@contract-assistant/shared";
import { prisma } from "../../models/prisma.js";
import { compileReviewedSummary } from "../../services/summaryCompiler.js";
import { NotFoundError } from "../../utils/errors.js";

export async function summaryRoutes(app: FastifyInstance) {
  /**
   * Fetch current summary and detect if it is outdated
   */
  app.get("/api/contracts/:id/summary", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            extractedItems: true,
          },
        },
        summaries: {
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!contract) {
      throw new NotFoundError(`Contract with id ${id} not found.`);
    }

    const latestVersion = contract.versions[0]!;
    const latestSummary = contract.summaries[0];

    if (!latestSummary) {
      // Auto-generate on first request
      const compiled = compileReviewedSummary(
        contract.title,
        latestVersion.versionNumber,
        latestVersion.extractedItems.map((i) => ({
          ...i,
          sourceSectionId: i.sourceSectionId,
          sourceSectionLabel: i.sourceSectionLabel,
          exactQuote: i.exactQuote,
          reviewStatus: i.reviewStatus as ReviewStatus,
          itemType: i.itemType as ItemType,
          status: i.status as ExtractionStatus,
          dateResolutionStatus: i.dateResolutionStatus as "resolved" | "needs_input" | "not_applicable",
          createdAt: i.createdAt.toISOString(),
          updatedAt: i.updatedAt.toISOString(),
        }))
      );

      const saved = await prisma.reviewedSummary.create({
        data: {
          contractId: contract.id,
          contractVersionId: latestVersion.id,
          versionNumber: latestVersion.versionNumber,
          contractTitle: contract.title,
          generatedAt: new Date(compiled.generatedAt),
          isOutdated: false,
          markdownContent: compiled.markdown,
          htmlContent: compiled.html,
          dataJson: JSON.stringify(compiled),
        },
      });

      return reply.send({
        summary: saved,
        compiled,
        isOutdated: false,
      });
    }

    // Check if any approved item was updated after the summary generation timestamp
    const summaryTimestamp = latestSummary.generatedAt;
    const hasNewerItems = latestVersion.extractedItems.some(
      (item) => item.updatedAt > summaryTimestamp
    );

    return reply.send({
      summary: latestSummary,
      compiled: JSON.parse(latestSummary.dataJson),
      isOutdated: hasNewerItems,
    });
  });

  /**
   * Regenerate reviewed summary
   */
  app.post("/api/contracts/:id/summary/generate", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const contract = await prisma.contract.findUnique({
      where: { id },
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

    if (!contract) {
      throw new NotFoundError(`Contract with id ${id} not found.`);
    }

    const latestVersion = contract.versions[0]!;
    const compiled = compileReviewedSummary(
      contract.title,
      latestVersion.versionNumber,
      latestVersion.extractedItems.map((i) => ({
        ...i,
        sourceSectionId: i.sourceSectionId,
        sourceSectionLabel: i.sourceSectionLabel,
        exactQuote: i.exactQuote,
        reviewStatus: i.reviewStatus as ReviewStatus,
        itemType: i.itemType as ItemType,
        status: i.status as ExtractionStatus,
        dateResolutionStatus: i.dateResolutionStatus as "resolved" | "needs_input" | "not_applicable",
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      }))
    );

    const saved = await prisma.reviewedSummary.create({
      data: {
        contractId: contract.id,
        contractVersionId: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
        contractTitle: contract.title,
        generatedAt: new Date(compiled.generatedAt),
        isOutdated: false,
        markdownContent: compiled.markdown,
        htmlContent: compiled.html,
        dataJson: JSON.stringify(compiled),
      },
    });

    return reply.send({
      summary: saved,
      compiled,
      isOutdated: false,
    });
  });

  /**
   * Export summary as raw Markdown
   */
  app.get("/api/contracts/:id/summary/export/markdown", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const summary = await prisma.reviewedSummary.findFirst({
      where: { contractId: id },
      orderBy: { generatedAt: "desc" },
    });

    if (!summary) {
      throw new NotFoundError("Summary not yet generated.");
    }

    reply.header("Content-Type", "text/markdown; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${summary.contractTitle.replace(/[^a-zA-Z0-9]/g, "_")}_summary_v${summary.versionNumber}.md"`
    );
    return reply.send(summary.markdownContent);
  });

  /**
   * Export summary as printable HTML
   */
  app.get("/api/contracts/:id/summary/export/html", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const summary = await prisma.reviewedSummary.findFirst({
      where: { contractId: id },
      orderBy: { generatedAt: "desc" },
    });

    if (!summary) {
      throw new NotFoundError("Summary not yet generated.");
    }

    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(summary.htmlContent);
  });
}
