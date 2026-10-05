import { describe, it, expect, vi } from "vitest";
import { recomputeVersionDates } from "../src/services/dateRecalculator.js";
import { PrismaClient } from "@prisma/client";

describe("dateRecalculator Service (recomputeVersionDates)", () => {
  it("resolves expiry and notice when effective date is stored in natural written form", async () => {
    const items = [
      {
        id: "item-eff",
        contractVersionId: "ver-1",
        itemType: "effective_date",
        currentValue: JSON.stringify({ date: "January 15, 2026" }),
        calculatedDate: null,
        manualDateOverride: null,
        dateResolutionStatus: "needs_input",
        dateResolutionReason: null,
        dateSource: null,
      },
      {
        id: "item-term",
        contractVersionId: "ver-1",
        itemType: "term",
        currentValue: JSON.stringify({ termLengthMonths: 12 }),
        calculatedDate: null,
        manualDateOverride: null,
        dateResolutionStatus: "needs_input",
        dateResolutionReason: null,
        dateSource: null,
      },
      {
        id: "item-notice",
        contractVersionId: "ver-1",
        itemType: "notice",
        currentValue: JSON.stringify({ noticePeriodDays: 90 }),
        calculatedDate: null,
        manualDateOverride: null,
        dateResolutionStatus: "needs_input",
        dateResolutionReason: null,
        dateSource: null,
      },
    ];

    const updatedMap = new Map<string, unknown>();
    const auditLogs: unknown[] = [];

    const mockPrisma = {
      extractedItem: {
        findMany: vi.fn().mockResolvedValue(items.map((i) => ({ ...i }))),
        update: vi.fn().mockImplementation(({ where, data }) => {
          updatedMap.set(where.id, data);
          return Promise.resolve({ ...data, id: where.id });
        }),
      },
      auditLog: {
        create: vi.fn().mockImplementation(({ data }) => {
          auditLogs.push(data);
          return Promise.resolve({ ...data, id: "audit-" + auditLogs.length });
        }),
      },
    } as unknown as PrismaClient;

    const result = await recomputeVersionDates(mockPrisma, "ver-1");

    expect(result.updatedCount).toBe(3);
    expect(result.unchangedCount).toBe(0);
    expect(result.stillNeedsInput).toHaveLength(0);

    // Verify calculated dates
    expect(updatedMap.get("item-eff")).toMatchObject({
      calculatedDate: "2026-01-15",
      dateResolutionStatus: "resolved",
      dateSource: "ai_payload",
    });
    expect(updatedMap.get("item-term")).toMatchObject({
      calculatedDate: "2027-01-15",
      dateResolutionStatus: "resolved",
      dateSource: "ai_payload",
    });
    // 90 days prior to 2027-01-15 is 2026-10-17
    expect(updatedMap.get("item-notice")).toMatchObject({
      calculatedDate: "2026-10-17",
      dateResolutionStatus: "resolved",
      dateSource: "ai_payload",
    });

    // Verify audit logs were written
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs[0]).toMatchObject({
      action: "dates_recalculated",
      contractVersionId: "ver-1",
      itemId: "item-eff",
    });
  });

  it("skips items with manualDateOverride and never overwrites them", async () => {
    const items = [
      {
        id: "item-eff",
        contractVersionId: "ver-1",
        itemType: "effective_date",
        currentValue: JSON.stringify({ date: "2026-01-15" }),
        calculatedDate: "2026-01-15",
        manualDateOverride: null,
        dateResolutionStatus: "resolved",
        dateResolutionReason: null,
        dateSource: "ai_payload",
      },
      {
        id: "item-term",
        contractVersionId: "ver-1",
        itemType: "term",
        currentValue: JSON.stringify({ termLengthMonths: 12 }),
        calculatedDate: "2027-01-15",
        manualDateOverride: "2027-06-30", // Human manually extended term to June 30
        dateResolutionStatus: "resolved",
        dateResolutionReason: "Manually overridden by reviewer",
        dateSource: "manual_override",
      },
      {
        id: "item-notice",
        contractVersionId: "ver-1",
        itemType: "notice",
        currentValue: JSON.stringify({ noticePeriodDays: 30 }),
        calculatedDate: null,
        manualDateOverride: null,
        dateResolutionStatus: "needs_input",
        dateResolutionReason: null,
        dateSource: null,
      },
    ];

    const updatedMap = new Map<string, unknown>();

    const mockPrisma = {
      extractedItem: {
        findMany: vi.fn().mockResolvedValue(items.map((i) => ({ ...i }))),
        update: vi.fn().mockImplementation(({ where, data }) => {
          updatedMap.set(where.id, data);
          return Promise.resolve({ ...data, id: where.id });
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    } as unknown as PrismaClient;

    const _result = await recomputeVersionDates(mockPrisma, "ver-1");

    // item-term was skipped because manualDateOverride was set!
    expect(updatedMap.has("item-term")).toBe(false);
    // Notice anchored to the manually overridden expiry (2027-06-30 minus 30 days = 2027-05-31)
    expect(updatedMap.get("item-notice")).toMatchObject({
      calculatedDate: "2027-05-31",
      dateResolutionStatus: "resolved",
    });
  });

  it("leaves relative effective dates as needs_input", async () => {
    const items = [
      {
        id: "item-eff-rel",
        contractVersionId: "ver-1",
        itemType: "effective_date",
        currentValue: JSON.stringify({ isRelative: true }),
        calculatedDate: null,
        manualDateOverride: null,
        dateResolutionStatus: "needs_input",
        dateResolutionReason: null,
        dateSource: null,
      },
      {
        id: "item-term",
        contractVersionId: "ver-1",
        itemType: "term",
        currentValue: JSON.stringify({ termLengthMonths: 12 }),
        calculatedDate: null,
        manualDateOverride: null,
        dateResolutionStatus: "needs_input",
        dateResolutionReason: null,
        dateSource: null,
      },
    ];

    const mockPrisma = {
      extractedItem: {
        findMany: vi.fn().mockResolvedValue(items.map((i) => ({ ...i }))),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaClient;

    const result = await recomputeVersionDates(mockPrisma, "ver-1");

    expect(result.stillNeedsInput.some((i) => i.itemId === "item-eff-rel")).toBe(true);
    expect(result.stillNeedsInput.some((i) => i.itemId === "item-term")).toBe(true);
  });

  it("is idempotent: second run updates 0 items and marks all unchanged", async () => {
    const items = [
      {
        id: "item-eff",
        contractVersionId: "ver-1",
        itemType: "effective_date",
        currentValue: JSON.stringify({ date: "2026-01-15" }),
        calculatedDate: "2026-01-15",
        manualDateOverride: null,
        dateResolutionStatus: "resolved",
        dateResolutionReason: null,
        dateSource: "ai_payload",
      },
      {
        id: "item-term",
        contractVersionId: "ver-1",
        itemType: "term",
        currentValue: JSON.stringify({ termLengthMonths: 12 }),
        calculatedDate: "2027-01-15",
        manualDateOverride: null,
        dateResolutionStatus: "resolved",
        dateResolutionReason: null,
        dateSource: "ai_payload",
      },
    ];

    const updateSpy = vi.fn();
    const mockPrisma = {
      extractedItem: {
        findMany: vi.fn().mockResolvedValue(items.map((i) => ({ ...i }))),
        update: updateSpy,
      },
      auditLog: {
        create: vi.fn(),
      },
    } as unknown as PrismaClient;

    const result = await recomputeVersionDates(mockPrisma, "ver-1");

    expect(result.updatedCount).toBe(0);
    expect(result.unchangedCount).toBe(2);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
