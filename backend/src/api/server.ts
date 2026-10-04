import fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { globalErrorHandler } from "../utils/errors.js";
import { contractRoutes } from "./routes/contracts.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { versionRoutes } from "./routes/versions.js";
import { summaryRoutes } from "./routes/summaries.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false, // We use our structured pino logger
    genReqId: () => {
      return `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    },
    bodyLimit: 15 * 1024 * 1024, // 15 MB to comfortably accept 10 MB file uploads
  });

  // CORS
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // Multipart upload support (10 MB max file size)
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 2, // 1 contract + 1 optional policy
    },
  });

  // Global Error Handler
  app.setErrorHandler(globalErrorHandler);

  // Routes
  await contractRoutes(app);
  await dashboardRoutes(app);
  await versionRoutes(app);
  await summaryRoutes(app);

  // Health check
  app.get("/api/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "Contract Obligation & Renewal Assistant",
    };
  });

  return app;
}
