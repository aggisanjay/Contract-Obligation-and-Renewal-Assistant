import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../../models/prisma.js";
import { format, parseISO, differenceInDays } from "date-fns";
import { resolveItemCalculatedDate } from "../../services/dates.js";

export interface DashboardDeadlineItem {
  id: string;
  contractId: string;
  contractTitle: string;
  itemType: string;
  title: string;
  deadlineDate: string; // YYYY-MM-DD
  responsibleParty?: string | null;
  urgency: "overdue" | "due_soon" | "upcoming";
  daysRemaining: number;
  reviewStatus: string;
  sourceSectionLabel: string;
  recurrence?: string | null;
}

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

    for (const contract of contracts) {
      const activeVer = contract.versions[0];
      if (!activeVer) continue;

      // Deterministically find effective date and expiry date for this version
      let effDate: string | null = null;
      const effItem = activeVer.extractedItems.find((i) => i.itemType === "effective_date");
      if (effItem) {
        const res = resolveItemCalculatedDate(effItem, {});
        if (res.calculatedDate) {
          effDate = res.calculatedDate;
          if (!effItem.calculatedDate) {
            await prisma.extractedItem.update({
              where: { id: effItem.id },
              data: { calculatedDate: effDate, dateResolutionStatus: "resolved" },
            }).catch(() => {});
          }
        }
      }

      let expDate: string | null = null;
      const expItem = activeVer.extractedItems.find((i) => i.itemType === "expiry" || i.itemType === "term");
      if (expItem) {
        const res = resolveItemCalculatedDate(expItem, { effectiveDate: effDate });
        if (res.calculatedDate) {
          expDate = res.calculatedDate;
          if (!expItem.calculatedDate) {
            await prisma.extractedItem.update({
              where: { id: expItem.id },
              data: { calculatedDate: expDate, dateResolutionStatus: "resolved" },
            }).catch(() => {});
          }
        }
      }

      for (const item of activeVer.extractedItems) {
        let targetDate = item.manualDateOverride || item.calculatedDate;
        if (!targetDate) {
          const res = resolveItemCalculatedDate(item, { effectiveDate: effDate, expiryDate: expDate });
          if (res.calculatedDate) {
            targetDate = res.calculatedDate;
            await prisma.extractedItem.update({
              where: { id: item.id },
              data: { calculatedDate: targetDate, dateResolutionStatus: res.status },
            }).catch(() => {});
          }
        }
        if (!targetDate) continue;

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

        const dateObj = parseISO(targetDate);
        const daysDiff = differenceInDays(dateObj, todayDate);

        let urgency: "overdue" | "due_soon" | "upcoming" = "upcoming";
        if (daysDiff < 0) {
          urgency = "overdue";
        } else if (daysDiff <= 14) {
          urgency = "due_soon";
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
        };

        // RULE: Only APPROVED items appear as firm deadlines.
        // Pending/uncertain ones appear in a separate section labelled "Not yet reviewed".
        if (item.reviewStatus === "approved" || item.reviewStatus === "edited_approved") {
          firmDeadlines.push(deadlineItem);
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
    filteredFirm.sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate));
    notYetReviewed.sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate));

    return reply.send({
      today: todayStr,
      metrics: {
        totalFirm: firmDeadlines.length,
        overdueCount: firmDeadlines.filter((d) => d.urgency === "overdue").length,
        dueSoonCount: firmDeadlines.filter((d) => d.urgency === "due_soon").length,
        notYetReviewedCount: notYetReviewed.length,
      },
      firmDeadlines: filteredFirm,
      notYetReviewed,
    });
  });
}
