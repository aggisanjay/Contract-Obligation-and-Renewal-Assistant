import dotenv from "dotenv";
dotenv.config();

import fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { globalErrorHandler } from "../utils/errors.js";
import { contractRoutes } from "./routes/contracts.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { versionRoutes } from "./routes/versions.js";
import { summaryRoutes } from "./routes/summaries.js";
import { prisma } from "../models/prisma.js";
import { getLLMMode } from "../llm/client.js";

function getFrontendDistPath(): string | null {
  const currentDir = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  const candidates = [
    path.resolve(process.cwd(), "frontend/dist"),
    path.resolve(process.cwd(), "../frontend/dist"),
    path.resolve(currentDir, "../../../frontend/dist"),
    path.resolve(currentDir, "../../frontend/dist"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return null;
}

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

  // API Routes
  await contractRoutes(app);
  await dashboardRoutes(app);
  await versionRoutes(app);
  await summaryRoutes(app);

  // Health check: returns { status, llmMode, db }
  app.get("/api/health", async () => {
    let dbStatus: "ok" | "error" = "ok";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "error";
    }

    return {
      status: "ok",
      llmMode: getLLMMode(),
      db: dbStatus,
      timestamp: new Date().toISOString(),
      service: "Contract Obligation & Renewal Assistant",
    };
  });

  // Static Frontend Serving & Single Page App (SPA) Fallback
  const frontendDistPath = getFrontendDistPath();
  if (frontendDistPath) {
    await app.register(fastifyStatic, {
      root: frontendDistPath,
      prefix: "/",
      wildcard: false, // Prevents intercepting other routes
    });

    app.setNotFoundHandler(async (req, reply) => {
      if (req.raw.url && req.raw.url.startsWith("/api")) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: `API Route ${req.method} ${req.url} not found`,
          },
        });
      }

      const indexPath = path.join(frontendDistPath, "index.html");
      if (fs.existsSync(indexPath)) {
        return reply.type("text/html").send(fs.createReadStream(indexPath));
      }

      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Page not found",
        },
      });
    });
  }

  return app;
}

