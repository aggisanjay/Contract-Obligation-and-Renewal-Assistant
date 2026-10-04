import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { logger } from "./logger.js";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number = 400, code: string = "BAD_REQUEST") {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class IngestionError extends AppError {
  constructor(message: string, code: string = "INGESTION_FAILED") {
    super(message, 422, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export function globalErrorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = (request.id as string) || "unknown-request";

  if (error instanceof AppError) {
    logger.warn({ requestId, err: error.message, code: error.code }, "Handled application error");
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
    } satisfies ErrorResponse);
  }

  if (error instanceof ZodError) {
    logger.warn({ requestId, issues: error.issues }, "Validation error");
    return reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload",
        requestId,
        details: error.issues,
      },
    } satisfies ErrorResponse);
  }

  // Fastify schema validation error
  if ("validation" in error && error.validation) {
    logger.warn({ requestId, validation: error.validation }, "Fastify schema validation error");
    return reply.status(400).send({
      error: {
        code: "SCHEMA_VALIDATION_ERROR",
        message: error.message,
        requestId,
      },
    } satisfies ErrorResponse);
  }

  logger.error({ requestId, err: error.message, stack: error.stack }, "Unhandled server error");
  return reply.status(500).send({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred while processing your request.",
      requestId,
    },
  } satisfies ErrorResponse);
}
