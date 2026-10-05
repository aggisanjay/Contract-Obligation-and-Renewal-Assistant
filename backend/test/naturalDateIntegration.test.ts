import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";
import { FastifyInstance } from "fastify";
import { prisma } from "../src/models/prisma.js";

describe("Natural Date Resolution & Summary Integration Test", () => {
  let app: FastifyInstance;
  let contractId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    if (contractId) {
      try {
        await prisma.auditLog.deleteMany({
          where: { contractVersion: { contractId } },
        });
        await prisma.extractedItem.deleteMany({
          where: { contractVersion: { contractId } },
        });
        await prisma.documentSection.deleteMany({
          where: { contractVersion: { contractId } },
        });
        await prisma.contractVersion.deleteMany({ where: { contractId } });
        await prisma.contractSummary.deleteMany({ where: { contractId } });
        await prisma.contract.delete({ where: { id: contractId } });
      } catch {
        // Ignore deletion errors in teardown
      }
    }
    await app.close();
  });

  it("uploads contract with 'January 15, 2026', resolves cascading expiry and notice, and compiles summary", async () => {
    const contractText = `
Section 1. Effective Date
The Effective Date is January 15, 2026.

Section 2. Term
The initial term of this Agreement shall commence on the Effective Date and continue for twelve (12) months.

Section 2.1 Renewal and Notice
This Agreement shall automatically renew for additional one-year terms unless either party provides written notice of non-renewal at least ninety (90) days prior to the expiration date.
    `.trim();

    // 1. Upload
    const uploadRes = await request(app.server)
      .post("/api/contracts/upload")
      .send({
        contractTitle: "Natural Date Enterprise Agreement",
        contractText,
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.contractId).toBeDefined();
    contractId = uploadRes.body.contractId;

    // 2. Inspect active version items
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    expect(contractRes.status).toBe(200);
    const items = contractRes.body.activeVersion.extractedItems;
    expect(items.length).toBeGreaterThanOrEqual(3);

    const effItem = items.find((i: { itemType: string }) => i.itemType === "effective_date");
    expect(effItem).toBeDefined();
    expect(effItem.calculatedDate).toBe("2026-01-15");
    expect(effItem.dateResolutionStatus).toBe("resolved");

    const expItem = items.find((i: { itemType: string }) => i.itemType === "expiry");
    expect(expItem).toBeDefined();
    expect(expItem.calculatedDate).toBe("2027-01-15");
    expect(expItem.dateResolutionStatus).toBe("resolved");

    const renewalItem = items.find((i: { itemType: string }) => i.itemType === "renewal");
    expect(renewalItem).toBeDefined();
    expect(renewalItem.calculatedDate).toBe("2026-10-17");
    expect(renewalItem.dateResolutionStatus).toBe("resolved");

    // 3. Approve items
    for (const item of items) {
      const approveRes = await request(app.server)
        .patch(`/api/contracts/${contractId}/items/${item.id}`)
        .send({ action: "approve" });
      expect(approveRes.status).toBe(200);
    }

    // 4. Test explicit recalculate-dates endpoint
    const recalcRes = await request(app.server)
      .post(`/api/contracts/${contractId}/recalculate-dates`)
      .send({});
    expect(recalcRes.status).toBe(200);
    expect(recalcRes.body.success).toBe(true);

    // 5. Fetch Summary and verify concrete key dates & wording
    const summaryRes = await request(app.server).get(`/api/contracts/${contractId}/summary`);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.compiled).toBeDefined();

    const compiled = summaryRes.body.compiled;
    expect(compiled.keyDates.effectiveDate).toBe("2026-01-15");
    expect(compiled.keyDates.expiryDate).toBe("2027-01-15");
    expect(compiled.keyDates.noticeDeadline).toBe("2026-10-17");

    expect(compiled.markdown).toContain("- **Effective Date:** 2026-01-15");
    expect(compiled.markdown).toContain("- **Contract Expiry Date:** 2027-01-15");
    expect(compiled.markdown).toContain("- **Notice Deadline:** 2026-10-17");

    expect(compiled.html).toContain("<strong>Effective Date:</strong> 2026-01-15");
    expect(compiled.html).toContain("<strong>Contract Expiry Date:</strong> 2027-01-15");
    expect(compiled.html).toContain("<strong>Notice Deadline:</strong> 2026-10-17");
  }, 45000);
});
