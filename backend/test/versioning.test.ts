import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";
import { FastifyInstance } from "fastify";
import { prisma } from "../src/models/prisma.js";
import {
  detectStaleItems,
  compareVersionSections,
  computeTextSimilarity,
} from "../src/services/staleDetector.js";
import { DocumentSection } from "@contract-assistant/shared";

describe("Stale Detector & Version Diff Unit Tests", () => {
  it("computes text similarity accurately", () => {
    const textA = "Customer shall pay within thirty (30) days of receiving invoice.";
    const textB = "Customer shall pay within thirty (30) days of receiving invoice.";
    expect(computeTextSimilarity(textA, textB)).toBe(1.0);

    const textC = "Customer shall pay within sixty (60) days of invoice date.";
    const sim = computeTextSimilarity(textA, textC);
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.85);

    const unrelated = "Governing law shall be the State of New York.";
    expect(computeTextSimilarity(textA, unrelated)).toBeLessThan(0.3);
  });

  it("detects carried over items, modified clause stale items, and missing clause stale items", () => {
    const priorApprovedItems = [
      {
        id: "item-1",
        itemType: "obligation",
        sourceSectionLabel: "Section 4.1",
        exactQuote: "Client shall pay invoices within 30 days.",
        currentValue: JSON.stringify({ description: "Pay within 30 days" }),
        userEdited: true,
      },
      {
        id: "item-2",
        itemType: "renewal",
        sourceSectionLabel: "Section 2.1",
        exactQuote: "Contract shall auto-renew unless 30 days notice is given.",
        currentValue: JSON.stringify({ isAutoRenew: true }),
        userEdited: false,
      },
      {
        id: "item-3",
        itemType: "obligation",
        sourceSectionLabel: "Section 9.0",
        exactQuote: "Vendor must provide annual audits.",
        currentValue: JSON.stringify({ description: "Annual audit" }),
        userEdited: false,
      },
    ];

    const newItems = [
      // Unchanged item
      {
        itemType: "obligation",
        sourceSectionLabel: "Section 4.1",
        exactQuote: "Client shall pay invoices within 30 days.",
        tempId: "draft-1",
      },
      // Modified renewal clause (e.g. 60 days notice now)
      {
        itemType: "renewal",
        sourceSectionLabel: "Section 2.1",
        exactQuote: "Contract shall auto-renew unless sixty (60) days notice is given.",
        tempId: "draft-2",
      },
      // Brand new item
      {
        itemType: "obligation",
        sourceSectionLabel: "Section 5.0",
        exactQuote: "Vendor shall maintain SOC2 certification.",
        tempId: "draft-3",
      },
    ];

    // Section 9.0 was completely removed in v2
    const newSections: DocumentSection[] = [
      {
        id: "s-1",
        contractVersionId: "v-2",
        sectionIndex: 0,
        label: "Section 4.1",
        heading: "Payment",
        text: "Client shall pay invoices within 30 days.",
        page: 1,
        charStart: 0,
        charEnd: 50,
        documentType: "contract",
      },
      {
        id: "s-2",
        contractVersionId: "v-2",
        sectionIndex: 1,
        label: "Section 2.1",
        heading: "Renewal",
        text: "Contract shall auto-renew unless sixty (60) days notice is given.",
        page: 1,
        charStart: 52,
        charEnd: 120,
        documentType: "contract",
      },
      {
        id: "s-3",
        contractVersionId: "v-2",
        sectionIndex: 2,
        label: "Section 5.0",
        heading: "Security",
        text: "Vendor shall maintain SOC2 certification.",
        page: 2,
        charStart: 122,
        charEnd: 180,
        documentType: "contract",
      },
    ];

    const { matchedNewItems, stalePriorItems } = detectStaleItems(
      newItems,
      priorApprovedItems,
      newSections
    );

    // Draft-1 should be carried over
    expect(matchedNewItems.get("draft-1")?.action).toBe("carried_over");
    expect(matchedNewItems.get("draft-1")?.priorItem?.userEdited).toBe(true);

    // Draft-3 is brand new
    expect(matchedNewItems.get("draft-3")?.action).toBe("pending");

    // Stale prior items:
    // item-2: section 2.1 exists but text changed -> "source clause changed in new version"
    const staleRenewal = stalePriorItems.find((s) => s.priorItem.id === "item-2");
    expect(staleRenewal).toBeDefined();
    expect(staleRenewal?.staleReason).toContain("source clause changed");

    // item-3: section 9.0 no longer exists -> "clause no longer found in new version"
    const staleAudit = stalePriorItems.find((s) => s.priorItem.id === "item-3");
    expect(staleAudit).toBeDefined();
    expect(staleAudit?.staleReason).toContain("no longer found");
  });

  it("compares sections between two versions accurately", () => {
    const v1Sections: DocumentSection[] = [
      {
        id: "s-1",
        contractVersionId: "v-1",
        sectionIndex: 0,
        label: "Section 1",
        heading: "Scope",
        text: "Original scope of work description.",
        page: 1,
        charStart: 0,
        charEnd: 40,
        documentType: "contract",
      },
      {
        id: "s-2",
        contractVersionId: "v-1",
        sectionIndex: 1,
        label: "Section 2",
        heading: "Termination",
        text: "Either party may terminate on 30 days notice.",
        page: 1,
        charStart: 42,
        charEnd: 90,
        documentType: "contract",
      },
    ];

    const v2Sections: DocumentSection[] = [
      {
        id: "s-1b",
        contractVersionId: "v-2",
        sectionIndex: 0,
        label: "Section 1",
        heading: "Scope",
        text: "Original scope of work description.", // Unchanged
        page: 1,
        charStart: 0,
        charEnd: 40,
        documentType: "contract",
      },
      {
        id: "s-2b",
        contractVersionId: "v-2",
        sectionIndex: 1,
        label: "Section 2",
        heading: "Termination",
        text: "Either party may terminate on 60 days notice.", // Modified
        page: 1,
        charStart: 42,
        charEnd: 90,
        documentType: "contract",
      },
      {
        id: "s-3b",
        contractVersionId: "v-2",
        sectionIndex: 2,
        label: "Section 3",
        heading: "Audit Rights",
        text: "Customer may audit vendor annually.", // Added
        page: 2,
        charStart: 92,
        charEnd: 140,
        documentType: "contract",
      },
    ];

    const diff = compareVersionSections(v1Sections, v2Sections);
    expect(diff.unchanged.length).toBe(1);
    expect(diff.modified.length).toBe(1);
    expect(diff.added.length).toBe(1);
    expect(diff.removed.length).toBe(0);
  });
});

describe("Contract Versioning & Stale Review Queue API", () => {
  let app: FastifyInstance;
  let contractId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Upload initial Version 1
    const uploadRes = await request(app.server)
      .post("/api/contracts/upload")
      .send({
        contractTitle: "Software Licensing Agreement",
        contractText: `
Section 1. Parties
Vendor is TechSoft Inc. and Customer is BigCorp.

Section 2. Term and Expiry
The initial term shall be twelve (12) months.

Section 2.1 Renewal
This Agreement shall automatically renew for additional one-year terms unless either party provides written notice of non-renewal at least thirty (30) days prior.

Section 4. Payment
Client shall pay monthly invoices within thirty (30) days.
        `.trim(),
      });

    contractId = uploadRes.body.contractId;

    // Approve the items in v1
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    for (const item of contractRes.body.activeVersion.extractedItems) {
      await request(app.server)
        .patch(`/api/contracts/${contractId}/items/${item.id}`)
        .send({ action: "approve" });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/contracts/:id/versions - uploads v2 without overwriting v1", async () => {
    // In v2: Section 2.1 Renewal is modified to 60 days notice; Section 4 Payment is unchanged
    const v2Payload = {
      contractText: `
Section 1. Parties
Vendor is TechSoft Inc. and Customer is BigCorp.

Section 2. Term and Expiry
The initial term shall be twelve (12) months.

Section 2.1 Renewal
This Agreement shall automatically renew for additional one-year terms unless either party provides written notice of non-renewal at least sixty (60) days prior.

Section 4. Payment
Client shall pay monthly invoices within thirty (30) days.
      `.trim(),
    };

    const v2Res = await request(app.server)
      .post(`/api/contracts/${contractId}/versions`)
      .send(v2Payload);

    expect(v2Res.status).toBe(201);
    expect(v2Res.body.versionNumber).toBe(2);

    // Verify both versions exist
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    expect(contractRes.body.contract.totalVersions).toBe(2);
    expect(contractRes.body.allVersions.length).toBe(2);
    expect(contractRes.body.activeVersion.versionNumber).toBe(2);
  });

  it("GET /api/contracts/:id/versions/compare - returns section diffs and stale items queue", async () => {
    const res = await request(app.server).get(
      `/api/contracts/${contractId}/versions/compare?v1=1&v2=2`
    );
    expect(res.status).toBe(200);
    expect(res.body.sectionDiff).toBeDefined();
    expect(Array.isArray(res.body.sectionDiff.modified)).toBe(true);
    expect(Array.isArray(res.body.staleItemsQueue)).toBe(true);
  });

  it("PATCH /api/contracts/:id/items/:itemId/stale-resolve - reconfirms or dismisses a stale item", async () => {
    const contractRes = await request(app.server).get(`/api/contracts/${contractId}`);
    const staleItem = contractRes.body.activeVersion.extractedItems.find(
      (i: any) => i.reviewStatus === "stale"
    );

    if (staleItem) {
      const resolveRes = await request(app.server)
        .patch(`/api/contracts/${contractId}/items/${staleItem.id}/stale-resolve`)
        .send({
          action: "reconfirm",
          note: "Reviewed revised clause and re-confirmed deadline",
        });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.item.reviewStatus).toBe("approved");

      // Verify audit log entry
      const auditRes = await request(app.server).get(`/api/contracts/${contractId}/audit-log`);
      const log = auditRes.body.logs.find((l: any) => l.action === "stale_reconfirmed");
      expect(log).toBeDefined();
    }
  });
});
