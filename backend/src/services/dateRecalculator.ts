import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger.js";
import { resolveItemCalculatedDate, isValidDateString } from "./dates.js";

export interface RecomputeOptions {
  today?: string;
  actor?: string;
}

export interface StillNeedsInputItem {
  itemId: string;
  itemType: string;
  reason: string;
}

export interface RecomputeDatesResult {
  updatedCount: number;
  unchangedCount: number;
  stillNeedsInput: StillNeedsInputItem[];
}

/**
 * Recalculates and updates dates for all items in a contract version.
 * Sequence:
 * 1. Effective Date (anchor)
 * 2. Expiry / Term (anchored to Effective Date)
 * 3. Renewal / Notice and Obligations (anchored to Effective Date and Expiry Date)
 *
 * Rules:
 * - Preserves manualDateOverride (never overwrites manual overrides; uses them as anchors)
 * - Only writes to database for items whose values actually changed
 * - Creates an audit log entry for each modified item (action: "dates_recalculated")
 * - Emits a structured Pino summary log with counts only (never contract text)
 */
export async function recomputeVersionDates(
  prisma: PrismaClient,
  contractVersionId: string,
  options?: RecomputeOptions
): Promise<RecomputeDatesResult> {
  const items = await prisma.extractedItem.findMany({
    where: { contractVersionId },
    orderBy: { createdAt: "asc" },
  });

  let updatedCount = 0;
  let unchangedCount = 0;
  const stillNeedsInput: StillNeedsInputItem[] = [];

  // 1. Identify or resolve Effective Date anchor
  const effItem = items.find((i) => i.itemType === "effective_date");
  let anchorEffectiveDate: string | null = null;

  if (effItem) {
    if (effItem.manualDateOverride && isValidDateString(effItem.manualDateOverride)) {
      anchorEffectiveDate = effItem.manualDateOverride;
    } else {
      const res = resolveItemCalculatedDate(effItem, { today: options?.today });
      if (res.status === "resolved" && res.calculatedDate) {
        anchorEffectiveDate = res.calculatedDate;
      }
    }
  }

  // 2. Identify or resolve Expiry Date anchor
  const expItem = items.find((i) => i.itemType === "expiry" || i.itemType === "term");
  let anchorExpiryDate: string | null = null;

  if (expItem) {
    if (expItem.manualDateOverride && isValidDateString(expItem.manualDateOverride)) {
      anchorExpiryDate = expItem.manualDateOverride;
    } else {
      const res = resolveItemCalculatedDate(expItem, {
        effectiveDate: anchorEffectiveDate,
        today: options?.today,
      });
      if (res.status === "resolved" && res.calculatedDate) {
        anchorExpiryDate = res.calculatedDate;
      }
    }
  }

  // 3. Process items in dependency order:
  // (a) effective_date
  // (b) expiry / term
  // (c) renewal / notice and obligations
  const orderedItems = [...items].sort((a, b) => {
    const rank = (type: string) => {
      if (type === "effective_date") return 1;
      if (type === "expiry" || type === "term") return 2;
      return 3;
    };
    return rank(a.itemType) - rank(b.itemType);
  });

  for (const item of orderedItems) {
    // Never overwrite manual overrides; count as unchanged
    if (item.manualDateOverride && isValidDateString(item.manualDateOverride)) {
      unchangedCount++;
      continue;
    }

    const res = resolveItemCalculatedDate(item, {
      effectiveDate: anchorEffectiveDate,
      expiryDate: anchorExpiryDate,
      today: options?.today,
    });

    if (res.status === "needs_input") {
      stillNeedsInput.push({
        itemId: item.id,
        itemType: item.itemType,
        reason: res.reason || "Needs input",
      });
    }

    const newCalculatedDate = res.calculatedDate;
    const newResolutionStatus = res.status;
    const newResolutionReason = res.reason ?? null;
    const newDateSource = res.dateSource ?? null;

    const hasChanged =
      item.calculatedDate !== newCalculatedDate ||
      item.dateResolutionStatus !== newResolutionStatus ||
      item.dateResolutionReason !== newResolutionReason ||
      item.dateSource !== newDateSource;

    if (hasChanged) {
      await prisma.extractedItem.update({
        where: { id: item.id },
        data: {
          calculatedDate: newCalculatedDate,
          dateResolutionStatus: newResolutionStatus,
          dateResolutionReason: newResolutionReason,
          dateSource: newDateSource,
        },
      });

      await prisma.auditLog.create({
        data: {
          contractVersionId,
          itemId: item.id,
          actor: options?.actor || "system",
          action: "dates_recalculated",
          oldValue: item.calculatedDate ?? item.dateResolutionStatus,
          newValue: newCalculatedDate ?? newResolutionStatus,
          note: `Recalculated date for ${item.itemType}: ${item.calculatedDate || "null"} -> ${newCalculatedDate || "null"} (${newResolutionStatus})`,
        },
      });

      // Update state in memory for subsequent dependent calculations in this loop
      item.calculatedDate = newCalculatedDate;
      item.dateResolutionStatus = newResolutionStatus;
      item.dateResolutionReason = newResolutionReason;
      item.dateSource = newDateSource;

      if (item.itemType === "effective_date" && res.status === "resolved" && res.calculatedDate) {
        anchorEffectiveDate = res.calculatedDate;
      }
      if ((item.itemType === "expiry" || item.itemType === "term") && res.status === "resolved" && res.calculatedDate) {
        anchorExpiryDate = res.calculatedDate;
      }

      updatedCount++;
    } else {
      unchangedCount++;
    }
  }

  // Pino summary log (counts only, never contract text)
  logger.info(
    {
      contractVersionId,
      updatedCount,
      unchangedCount,
      stillNeedsInputCount: stillNeedsInput.length,
    },
    "Version dates recalculation completed"
  );

  return {
    updatedCount,
    unchangedCount,
    stillNeedsInput,
  };
}
