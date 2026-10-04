import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";
import { FastifyInstance } from "fastify";
import { prisma } from "../src/models/prisma.js";

describe("Reviewed Contract Summary API", () => {
  let app: FastifyInstance;
  let contractId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // Upload a contract
    const uploadRes = await request(app.server)
      .post("/api/contracts/upload")
      .send({
        contractTitle: "Enterprise SaaS Subscription Agreement",
        contractText: `
Preamble
This Agreement is between Acme Cloud Inc. ("Vendor") and Beta Global LLC ("Customer").

Section 1. Effective Date
The Effective Date is January 1, 2025.

Section 2. Term
The initial term is twelve (12) months from the Effective Date.

Section 2.1 Renewal
This Agreement shall automatically renew for additional one-year terms unless either party provides written notice at least thirty (30) days prior.

Section 4. Payment
Client shall pay monthly invoices within thirty (30) days.
        `.trim(),
      });

    contractId = uploadRes.body.contractId;

    // Approve items
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    for (const item of contractRes.body.activeVersion.extractedItems) {
      await request(app.server)
        .patch(`/api/contracts/${contractId}/items/${item.id}`)
        .send({ action: "approve" });
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("GET /api/contracts/:id/summary - compiles summary with citations and disclaimer", async () => {
    const res = await request(app.server).get(`/api/contracts/${contractId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.compiled).toBeDefined();

    const compiled = res.body.compiled;
    expect(compiled.disclaimer).toContain("does not provide legal advice");
    expect(compiled.parties.length).toBeGreaterThanOrEqual(1);
    expect(compiled.parties[0].citation).toContain('"');
    expect(compiled.keyDates.effectiveDate).toBe("2025-01-01");
    expect(compiled.markdown).toContain("# Reviewed Contract Summary");
    expect(compiled.html).toContain("<!DOCTYPE html>");
  });

  it("POST /api/contracts/:id/summary/generate - regenerates summary", async () => {
    const res = await request(app.server).post(`/api/contracts/${contractId}/summary/generate`);
    expect(res.status).toBe(200);
    expect(res.body.isOutdated).toBe(false);
  });

  it("GET /api/contracts/:id/summary/export/markdown - exports markdown file", async () => {
    const res = await request(app.server).get(`/api/contracts/${contractId}/summary/export/markdown`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.text).toContain("Reviewed Contract Summary");
    expect(res.text).toContain("DISCLAIMER");
  });

  it("GET /api/contracts/:id/summary/export/html - exports printable HTML", async () => {
    const res = await request(app.server).get(`/api/contracts/${contractId}/summary/export/html`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("@media print");
    expect(res.text).toContain("Reviewed Contract Summary");
  });
});
