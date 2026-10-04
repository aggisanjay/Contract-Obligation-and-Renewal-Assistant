import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildServer } from "../src/api/server.js";
import { FastifyInstance } from "fastify";

describe("Deployment Readiness & Health Check", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health returns status, llmMode, and db check", async () => {
    const res = await request(app.server).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(["gemini", "groq", "huggingface", "mock"]).toContain(res.body.llmMode);
    expect(["ok", "error"]).toContain(res.body.db);
    expect(res.body.service).toBe("Contract Obligation & Renewal Assistant");
  });

  it("GET /api/nonexistent-route returns 404 with consistent error format", async () => {
    const res = await request(app.server).get("/api/nonexistent-route");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("serves static frontend index.html on root and SPA fallback routes", async () => {
    const rootRes = await request(app.server).get("/");
    expect(rootRes.status).toBe(200);
    expect(rootRes.headers["content-type"]).toContain("text/html");

    const spaRes = await request(app.server).get("/contracts/test-contract-id");
    expect(spaRes.status).toBe(200);
    expect(spaRes.headers["content-type"]).toContain("text/html");
  });
});

