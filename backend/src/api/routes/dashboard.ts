import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../../models/prisma.js";
import { format, parseISO, differenceInDays } from "date-fns";
import { resolveItemCalculatedDate, isValidDateString } from "../../services/dates.js";
import { DashboardDeadlineItem } from "@contract-assistant/shared";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard", async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as {
      timeframe?: string; // "7" | "30" | "90" | "overdue" | "all"
      contractId?: string;
      responsibleParty?: string;
    };

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayDate = parseISO(todayStr);

    // Fetch all active items across contracts
    const contracts = await prisma.contract.findMany({
      where: query.contractId ? { id: query.contractId } : undefined,
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            extractedItems: {
              where: {
                reviewStatus: { not: "rejected" },
              },
            },
          },
        },
      },
    });

    const firmDeadlines: DashboardDeadlineItem[] = [];
    const notYetReviewed: DashboardDeadlineItem[] = [];
    const needsDate: DashboardDeadlineItem[] = [];
    const needsReconfirmation: DashboardDeadlineItem[] = [];

    for (const contract of contracts) {
      const activeVer = contract.versions[0];
      if (!activeVer) continue;

      // Deterministically find effective date and expiry date for this version in-memory
      let effDate: string | null = null;
      const effItem = activeVer.extractedItems.find((i) => i.itemType === "effective_date");
      if (effItem) {
        effDate = effItem.manualDateOverride || effItem.calculatedDate || null;
        if (!effDate) {
          const res = resolveItemCalculatedDate(effItem, {});
          if (res.calculatedDate) {
            effDate = res.calculatedDate;
          }
        }
      }

      let expDate: string | null = null;
      const expItem = activeVer.extractedItems.find((i) => i.itemType === "expiry" || i.itemType === "term");
      if (expItem) {
        expDate = expItem.manualDateOverride || expItem.calculatedDate || null;
        if (!expDate) {
          const res = resolveItemCalculatedDate(expItem, { effectiveDate: effDate });
          if (res.calculatedDate) {
            expDate = res.calculatedDate;
          }
        }
      }

      for (const item of activeVer.extractedItems) {
        let targetDate = item.manualDateOverride || item.calculatedDate;
        let dateSource = item.dateSource;
        let dateResolutionStatus = item.dateResolutionStatus;
        let dateResolutionReason = item.dateResolutionReason;

        if (!targetDate) {
          const res = resolveItemCalculatedDate(item, { effectiveDate: effDate, expiryDate: expDate });
          if (res.calculatedDate) {
            targetDate = res.calculatedDate;
            dateResolutionStatus = res.status;
            dateResolutionReason = res.reason || null;
            if (res.dateSource) dateSource = res.dateSource;
          } else {
            dateResolutionStatus = res.status;
            dateResolutionReason = res.reason || null;
          }
        }

        let payload: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(item.currentValue);
          if (typeof parsed === "object" && parsed !== null) {
            payload = parsed as Record<string, unknown>;
          }
        } catch {
          payload = {};
        }

        const payloadTitle =
          typeof payload.description === "string"
            ? payload.description
            : typeof payload.summary === "string"
            ? payload.summary
            : "";
        let itemTitle = payloadTitle || `${item.itemType} deadline`;
        if (item.itemType === "expiry") {
          itemTitle = `Contract Expiration / Term End`;
        } else if (item.itemType === "renewal") {
          itemTitle = `Non-Renewal Notice Deadline`;
        } else if (item.itemType === "effective_date") {
          itemTitle = `Effective Date`;
        }

        let daysDiff = 0;
        let urgency: "overdue" | "due_soon" | "upcoming" = "upcoming";
        if (targetDate && isValidDateString(targetDate)) {
          const dateObj = parseISO(targetDate);
          daysDiff = differenceInDays(dateObj, todayDate);
          if (daysDiff < 0) {
            urgency = "overdue";
          } else if (daysDiff <= 14) {
            urgency = "due_soon";
          }
        }

        const party = typeof payload.responsibleParty === "string" ? payload.responsibleParty : null;
        const recurrence = typeof payload.recurrence === "string" ? payload.recurrence : null;

        // Filter by responsible party if requested
        if (
          query.responsibleParty &&
          party &&
          !party.toLowerCase().includes(query.responsibleParty.toLowerCase())
        ) {
          continue;
        }

        const deadlineItem: DashboardDeadlineItem = {
          id: item.id,
          contractId: contract.id,
          contractTitle: contract.title,
          itemType: item.itemType,
          title: itemTitle,
          deadlineDate: targetDate,
          responsibleParty: party,
          urgency,
          daysRemaining: daysDiff,
          reviewStatus: item.reviewStatus,
          sourceSectionLabel: item.sourceSectionLabel,
          recurrence,
          dateSource,
          dateResolutionStatus,
          dateResolutionReason,
        };

        // RULE:
        // 1. Stale items go to needsReconfirmation - NEVER in firm deadlines.
        // 2. Approved obligations with needs_input or missing dates go to needsDate - not hidden!
        // 3. Approved items with concrete dates go to firmDeadlines.
        // 4. Pending items go to notYetReviewed.
        if (item.reviewStatus === "stale") {
          needsReconfirmation.push(deadlineItem);
        } else if (item.reviewStatus === "approved" || item.reviewStatus === "edited_approved") {
          if (targetDate && dateResolutionStatus !== "needs_input") {
            firmDeadlines.push(deadlineItem);
          } else {
            needsDate.push(deadlineItem);
          }
        } else {
          notYetReviewed.push(deadlineItem);
        }
      }
    }

    // Apply timeframe filter to firm deadlines
    let filteredFirm = firmDeadlines;
    const tf = query.timeframe || "all";

    if (tf === "overdue") {
      filteredFirm = firmDeadlines.filter((d) => d.urgency === "overdue");
    } else if (tf === "7") {
      filteredFirm = firmDeadlines.filter((d) => d.daysRemaining >= 0 && d.daysRemaining <= 7);
    } else if (tf === "30") {
      filteredFirm = firmDeadlines.filter((d) => d.daysRemaining >= 0 && d.daysRemaining <= 30);
    } else if (tf === "90") {
      filteredFirm = firmDeadlines.filter((d) => d.daysRemaining >= 0 && d.daysRemaining <= 90);
    }

    // Sort by deadline date ascending
    filteredFirm.sort((a, b) => (a.deadlineDate || "").localeCompare(b.deadlineDate || ""));
    notYetReviewed.sort((a, b) => (a.deadlineDate || "").localeCompare(b.deadlineDate || ""));
    needsDate.sort((a, b) => a.title.localeCompare(b.title));
    needsReconfirmation.sort((a, b) => a.title.localeCompare(b.title));

    return reply.send({
      today: todayStr,
      metrics: {
        totalFirm: firmDeadlines.length,
        overdueCount: firmDeadlines.filter((d) => d.urgency === "overdue").length,
        dueSoonCount: firmDeadlines.filter((d) => d.urgency === "due_soon").length,
        notYetReviewedCount: notYetReviewed.length,
        needsDateCount: needsDate.length,
        needsReconfirmationCount: needsReconfirmation.length,
      },
      firmDeadlines: filteredFirm,
      notYetReviewed,
      needsDate,
      needsReconfirmation,
    });
  });
}
