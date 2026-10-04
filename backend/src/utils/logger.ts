import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "HH:MM:ss Z",
          },
        }
      : undefined,
  redact: {
    paths: ["req.headers.authorization", "apiKey", "geminiApiKey"],
    remove: true,
  },
});

/**
 * Helper to log pipeline steps safely without printing full contract text.
 */
export function logPipelineStep(
  requestId: string,
  stepName: string,
  details: {
    durationMs?: number;
    tokenEstimate?: number;
    success: boolean;
    retryCount?: number;
    itemCount?: number;
    error?: string;
  }
) {
  logger.info({
    requestId,
    step: stepName,
    ...details,
  }, `Pipeline step '${stepName}' ${details.success ? "completed" : "failed"}`);
}
