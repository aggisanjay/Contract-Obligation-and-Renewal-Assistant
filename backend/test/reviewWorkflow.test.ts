import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";
import { FastifyInstance } from "fastify";
import { prisma } from "../src/models/prisma.js";

describe("Review Workflow API & Audit Log", () => {
  let app: FastifyInstance;
  let contractId: string;
  let versionId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("POST /api/contracts/upload - uploads and extracts a contract", async () => {
    const contractPayload = {
      contractTitle: "Master Cloud Services Agreement",
      contractText: `
Preamble
This Master Services Agreement is entered into by Acme Cloud Services Inc. ("Vendor") and Apex Logistics LLC ("Customer").

Section 1. Effective Date
The Effective Date of this Agreement shall be January 1, 2025.

Section 2. Term and Expiry
The initial term of this Agreement shall commence on the Effective Date and continue for twelve (12) months.

Section 2.1 Renewal
This Agreement shall automatically renew for additional one-year terms unless either party provides written notice of non-renewal at least thirty (30) days prior.

Section 4.2 Payment Terms
Client shall remit payment within thirty (30) days following receipt of each monthly invoice.

Section 5.2 Support Resolution
Vendor will use commercially reasonable efforts to resolve support tickets promptly.
      `.trim(),
    };

    const res = await request(app.server)
      .post("/api/contracts/upload")
      .send(contractPayload);

    expect(res.status).toBe(201);
    expect(res.body.contractId).toBeDefined();
    expect(res.body.versionId).toBeDefined();
    expect(res.body.sectionCount).toBeGreaterThanOrEqual(4);
    expect(res.body.itemCount).toBeGreaterThanOrEqual(5);

    contractId = res.body.contractId;
    versionId = res.body.versionId;
  });

  it("GET /api/contracts/:id - retrieves full review payload with sections and items", async () => {
    const res = await request(app.server).get(`/api/contracts/${contractId}`);
    expect(res.status).toBe(200);
    expect(res.body.contract.title).toBe("Master Cloud Services Agreement");
    expect(res.body.activeVersion.sections.length).toBeGreaterThanOrEqual(4);
    expect(res.body.activeVersion.extractedItems.length).toBeGreaterThanOrEqual(5);
    expect(res.body.isDemoMode).toBe(true); // Mock client in test
  });

  it("PATCH /api/contracts/:id/items/:itemId - approves an item and logs audit", async () => {
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    const partyItem = contractRes.body.activeVersion.extractedItems.find(
      (i: any) => i.itemType === "party"
    );
    expect(partyItem).toBeDefined();

    const approveRes = await request(app.server)
      .patch(`/api/contracts/${contractId}/items/${partyItem.id}`)
      .send({ action: "approve", note: "Verified vendor identity" });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.item.reviewStatus).toBe("approved");

    // Verify Audit Log
    const auditRes = await request(app.server).get(`/api/contracts/${contractId}/audit-log`);
    expect(auditRes.status).toBe(200);
    const log = auditRes.body.logs.find((l: any) => l.itemId === partyItem.id);
    expect(log).toBeDefined();
    expect(log.action).toBe("item_approved");
    expect(log.actor).toBe("local user");
  });

  it("PATCH /api/contracts/:id/items/:itemId - edits an item and records old and new values", async () => {
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    const paymentItem = contractRes.body.activeVersion.extractedItems.find(
      (i: any) => i.itemType === "obligation"
    );
    expect(paymentItem).toBeDefined();

    const updatedPayload = {
      description: "Client shall remit payment within 45 days (negotiated extension).",
      responsibleParty: "Customer",
      obligationType: "payment",
    };

    const editRes = await request(app.server)
      .patch(`/api/contracts/${contractId}/items/${paymentItem.id}`)
      .send({
        action: "edit",
        newValue: JSON.stringify(updatedPayload),
        note: "Extended from 30 to 45 days",
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.item.reviewStatus).toBe("edited_approved");
    expect(editRes.body.item.userEdited).toBe(true);

    // Verify Audit Log preserved old and new value
    const auditRes = await request(app.server).get(`/api/contracts/${contractId}/audit-log`);
    const log = auditRes.body.logs.find((l: any) => l.itemId === paymentItem.id && l.action === "item_edited");
    expect(log).toBeDefined();
    expect(log.oldValue).toBeDefined();
    expect(log.newValue).toContain("45 days");
  });

  it("PATCH /api/contracts/:id/items/:itemId - applies manual date override", async () => {
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    const expiryItem = contractRes.body.activeVersion.extractedItems.find(
      (i: any) => i.itemType === "expiry"
    );
    expect(expiryItem).toBeDefined();

    const overrideRes = await request(app.server)
      .patch(`/api/contracts/${contractId}/items/${expiryItem.id}`)
      .send({
        action: "override_date",
        newValue: "2026-06-30",
        note: "Agreed 6-month extension",
      });

    expect(overrideRes.status).toBe(200);
    expect(overrideRes.body.item.manualDateOverride).toBe("2026-06-30");
    expect(overrideRes.body.item.dateResolutionStatus).toBe("resolved");
  });

  it("POST /api/contracts/:id/items/bulk-approve - bulk approves confirmed items but never uncertain ones", async () => {
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    const allItems = contractRes.body.activeVersion.extractedItems;
    const itemIds = allItems.map((i: any) => i.id);

    const bulkRes = await request(app.server)
      .post(`/api/contracts/${contractId}/items/bulk-approve`)
      .send({ itemIds });

    expect(bulkRes.status).toBe(200);
    expect(bulkRes.body.approvedCount).toBeGreaterThanOrEqual(1);

    // Uncertain items (like ambiguity) should have been skipped!
    const ambiguity = allItems.find((i: any) => i.itemType === "ambiguity");
    if (ambiguity) {
      expect(bulkRes.body.skippedItemIds).toContain(ambiguity.id);
    }
  });

  it("DELETE /api/contracts/:id - deletes contract and cascades related data cleanly", async () => {
    const deleteRes = await request(app.server).delete(`/api/contracts/${contractId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
    expect(deleteRes.body.deletedId).toBe(contractId);

    // Verify contract is gone
    const getRes = await request(app.server).get(`/api/contracts/${contractId}`);
    expect(getRes.status).toBe(404);

    // Verify 404 when deleting already deleted contract
    const repeatDelete = await request(app.server).delete(`/api/contracts/${contractId}`);
    expect(repeatDelete.status).toBe(404);
  });
});

