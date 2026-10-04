import dotenv from "dotenv";
dotenv.config();

import { buildServer } from "./api/server.js";
import { logger } from "./utils/logger.js";

async function main() {
  const port = parseInt(process.env.PORT || "3001", 10);
  const host = process.env.HOST || "0.0.0.0";

  const app = await buildServer();

  try {
    await app.listen({ port, host });
    logger.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    logger.error({ err }, "Error starting server");
    process.exit(1);
  }
}

main();
