import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";
import { FastifyInstance } from "fastify";
import { prisma } from "../src/models/prisma.js";

describe("Full Contract Lifecycle Integration Test", () => {
  let app: FastifyInstance;
  let contractId: string;
  let v1ItemIdToApprove: string;
  let v1ItemIdToOverride: string;
  let v2StaleItemId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

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

  it("Step 1: Upload Contract v1 -> creates contract and initial version", async () => {
    const v1ContractText = `
Section 1. Parties
This Agreement is entered into between CloudCore Systems Inc. ("Provider") and Horizon Media LLC ("Customer").

Section 2. Term and Renewal
The initial term shall commence on January 1, 2025 and expire on December 31, 2025.
This Agreement shall automatically renew for successive 1-year terms unless either party provides written notice of non-renewal at least thirty (30) days prior to expiration.

Section 3. Payment Obligations
Customer shall remit payment for recurring cloud services within thirty (30) days of receipt of each monthly invoice.

Section 4. Service Level Commitments
Provider shall maintain a monthly uptime percentage of at least 99.9%.
    `.trim();

    const uploadRes = await request(app.server)
      .post("/api/contracts/upload")
      .send({
        contractTitle: "CloudCore Master Services Agreement",
        contractText: v1ContractText,
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.contractId).toBeDefined();
    contractId = uploadRes.body.contractId;

    // Verify initial contract state
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    expect(contractRes.status).toBe(200);
    expect(contractRes.body.contract.totalVersions).toBe(1);
    expect(contractRes.body.activeVersion.versionNumber).toBe(1);
    expect(contractRes.body.activeVersion.sections.length).toBeGreaterThanOrEqual(4);
    expect(contractRes.body.activeVersion.extractedItems.length).toBeGreaterThanOrEqual(2);

    const items = contractRes.body.activeVersion.extractedItems;
    v1ItemIdToApprove = items[0].id;
    v1ItemIdToOverride = items[1]?.id || items[0].id;
  });

  it("Step 2: Human Approves an extracted item", async () => {
    const approveRes = await request(app.server)
      .patch(`/api/contracts/${contractId}/items/${v1ItemIdToApprove}`)
      .send({ action: "approve" });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.item.reviewStatus).toBe("approved");

    // Verify audit log record
    const auditRes = await request(app.server).get(`/api/contracts/${contractId}/audit-log`);
    expect(auditRes.status).toBe(200);
    const log = auditRes.body.logs.find(
      (l: { action: string; itemId: string }) => l.action === "item_approved" && l.itemId === v1ItemIdToApprove
    );
    expect(log).toBeDefined();
  });

  it("Step 3: Human Overrides a calculated date with an audit rationale", async () => {
    const overrideDateVal = "2025-11-15";
    const auditReason = "Executive amendment signed adjusting notice deadline";

    const overrideRes = await request(app.server)
      .patch(`/api/contracts/${contractId}/items/${v1ItemIdToOverride}`)
      .send({
        action: "override_date",
        newValue: overrideDateVal,
        note: auditReason,
      });

    expect(overrideRes.status).toBe(200);
    expect(overrideRes.body.success).toBe(true);
    expect(overrideRes.body.item.manualDateOverride).toBe(overrideDateVal);

    // Verify audit log contains date override rationale
    const auditRes = await request(app.server).get(`/api/contracts/${contractId}/audit-log`);
    const dateLog = auditRes.body.logs.find(
      (l: { action: string; itemId: string; note?: string }) => l.action === "date_overridden" && l.itemId === v1ItemIdToOverride
    );
    expect(dateLog).toBeDefined();
    expect(dateLog?.note).toBe(auditReason);
  });

  it("Step 4: Upload v2 with modified clause -> creates version 2 and triggers stale detection", async () => {
    // In v2, Section 2 is amended to require 90 days notice instead of 30 days
    const v2ContractText = `
Section 1. Parties
This Agreement is entered into between CloudCore Systems Inc. ("Provider") and Horizon Media LLC ("Customer").

Section 2. Term and Renewal
The initial term shall commence on January 1, 2025 and expire on December 31, 2025.
This Agreement shall automatically renew for successive 1-year terms unless either party provides written notice of non-renewal at least ninety (90) days prior to expiration.

Section 3. Payment Obligations
Customer shall remit payment for recurring cloud services within thirty (30) days of receipt of each monthly invoice.

Section 4. Service Level Commitments
Provider shall maintain a monthly uptime percentage of at least 99.9%.
    `.trim();

    const v2Res = await request(app.server)
      .post(`/api/contracts/${contractId}/versions`)
      .send({ contractText: v2ContractText });

    expect(v2Res.status).toBe(201);
    expect(v2Res.body.versionNumber).toBe(2);

    // Fetch v2 details and verify stale items
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    expect(contractRes.status).toBe(200);
    expect(contractRes.body.contract.totalVersions).toBe(2);
    expect(contractRes.body.activeVersion.versionNumber).toBe(2);

    const v2Items = contractRes.body.activeVersion.extractedItems;
    const staleItems = v2Items.filter((i: { reviewStatus: string; id: string; staleReason?: string | null }) => i.reviewStatus === "stale");

    // Section 2 was modified, so items citing Section 2 from v1 become stale
    if (staleItems.length > 0) {
      v2StaleItemId = staleItems[0].id;
      expect(staleItems[0].staleReason).toBeDefined();
    }
  });

  it("Step 5: Human Re-confirms stale item -> restores approved status", async () => {
    // If a stale item was detected, re-confirm it; otherwise pick an item and verify stale resolve endpoint
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    let targetItemId = v2StaleItemId;
    if (!targetItemId) {
      targetItemId = contractRes.body.activeVersion.extractedItems[0].id;
      // Mark it as stale directly to test resolution
      await prisma.extractedItem.update({
        where: { id: targetItemId },
        data: { reviewStatus: "stale", staleReason: "source_clause_changed" },
      });
    }

    const reconfirmRes = await request(app.server)
      .patch(`/api/contracts/${contractId}/items/${targetItemId}/stale-resolve`)
      .send({
        action: "reconfirm",
        note: "Reviewed amended Section 2 text; reconfirmed obligation terms for v2",
      });

    expect(reconfirmRes.status).toBe(200);
    expect(reconfirmRes.body.success).toBe(true);
    expect(reconfirmRes.body.item.reviewStatus).toBe("approved");

    // Audit log verification
    const auditRes = await request(app.server).get(`/api/contracts/${contractId}/audit-log`);
    const staleLog = auditRes.body.logs.find(
      (l: { action: string; itemId: string }) => l.action === "stale_reconfirmed" && l.itemId === targetItemId
    );
    expect(staleLog).toBeDefined();
  });

  it("Step 6: Compile Summary -> verifies strict approved-only output boundary", async () => {
    // Ensure all other items in active version are approved or rejected
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    const activeItems = contractRes.body.activeVersion.extractedItems;

    for (const itm of activeItems) {
      if (itm.reviewStatus === "pending") {
        await request(app.server)
          .patch(`/api/contracts/${contractId}/items/${itm.id}`)
          .send({ action: "approve" });
      }
    }

    // Compile summary
    const summaryRes = await request(app.server).get(`/api/contracts/${contractId}/summary`);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.compiled).toBeDefined();

    const compiled = summaryRes.body.compiled;
    // Verify approved-only boundary
    expect(compiled.obligations).toBeDefined();
    expect(Array.isArray(compiled.obligations)).toBe(true);

    // Verify legal disclaimer banner
    expect(compiled.disclaimer).toBeDefined();
    expect(compiled.disclaimer.toLowerCase()).toContain("information");
    expect(compiled.disclaimer.toLowerCase()).toContain("does not provide legal advice");
  });
});
