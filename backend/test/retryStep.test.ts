import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";
import { FastifyInstance } from "fastify";
import { prisma } from "../src/models/prisma.js";

describe("Retry Extraction Step API", () => {
  let app: FastifyInstance;
  let contractId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // Create an initial contract
    const contractPayload = {
      contractTitle: "Retry Test Contract",
      contractText: `
Section 1.1 Parties
This Agreement is between Acme Corp and Beta Inc.

Section 2.1 Term
The initial term shall be 12 months from Effective Date.

Section 3.1 Payment
Payment is due net 30 days.
      `.trim(),
    };

    const res = await request(app.server)
      .post("/api/contracts/upload")
      .send(contractPayload);

    expect(res.status).toBe(201);
    contractId = res.body.contractId;
  });

  afterAll(async () => {
    if (contractId) {
      await prisma.contract.delete({ where: { id: contractId } }).catch(() => {});
    }
    await app.close();
  });

  it("POST /api/contracts/:id/extract/retry - re-runs only the requested pass", async () => {
    const res = await request(app.server)
      .post(`/api/contracts/${contractId}/extract/retry`)
      .send({ step: "term_and_renewal" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.step).toBe("term_and_renewal");
    expect(typeof res.body.addedCount).toBe("number");
    expect(res.body.stepErrors).toHaveLength(0);

    // Verify audit log has the retry action
    const auditRes = await request(app.server).get(`/api/contracts/${contractId}/audit-log`);
    expect(auditRes.status).toBe(200);
    const retryLog = auditRes.body.logs.find((l: any) => l.action === "step_retried");
    expect(retryLog).toBeDefined();
    expect(retryLog.note).toContain("term_and_renewal");
  });

  it("POST /api/contracts/:id/extract/retry - rejects invalid step names", async () => {
    const res = await request(app.server)
      .post(`/api/contracts/${contractId}/extract/retry`)
      .send({ step: "non_existent_step" });

    expect(res.status).toBe(400);
  });
});
