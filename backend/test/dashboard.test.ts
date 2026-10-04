import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";
import { FastifyInstance } from "fastify";
import { prisma } from "../src/models/prisma.js";

describe("Dashboard API", () => {
  let app: FastifyInstance;
  let contractId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // Create a contract with approved item and pending item
    const uploadRes = await request(app.server)
      .post("/api/contracts/upload")
      .send({
        contractTitle: "Dashboard Test Services Agreement",
        contractText: `
Section 1. Effective Date
The Effective Date is January 1, 2025.

Section 2. Expiry
The initial term is twelve (12) months.

Section 4. Payment
Client shall pay monthly invoices within 30 days.
        `.trim(),
      });

    contractId = uploadRes.body.contractId;

    // Approve one item so it becomes a firm deadline
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    const expiryItem = contractRes.body.activeVersion.extractedItems.find(
      (i: any) => i.itemType === "expiry"
    );
    if (expiryItem) {
      await request(app.server)
        .patch(`/api/contracts/${contractId}/items/${expiryItem.id}`)
        .send({ action: "approve" });
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("GET /api/dashboard - returns firm deadlines for approved items and notYetReviewed for pending items", async () => {
    const res = await request(app.server).get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
    expect(Array.isArray(res.body.firmDeadlines)).toBe(true);
    expect(Array.isArray(res.body.notYetReviewed)).toBe(true);

    // Firm deadlines must only contain approved items
    for (const firm of res.body.firmDeadlines) {
      expect(["approved", "edited_approved"]).toContain(firm.reviewStatus);
      expect(firm.deadlineDate).toBeDefined();
      expect(["overdue", "due_soon", "upcoming"]).toContain(firm.urgency);
    }
  });

  it("GET /api/dashboard?timeframe=overdue - filters for overdue deadlines only", async () => {
    const res = await request(app.server).get("/api/dashboard?timeframe=overdue");
    expect(res.status).toBe(200);
    for (const item of res.body.firmDeadlines) {
      expect(item.urgency).toBe("overdue");
    }
  });
});
