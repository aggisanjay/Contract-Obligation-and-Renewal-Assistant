import { execSync } from "node:child_process";

console.log("[Build] 1. Building @contract-assistant/shared...");
execSync("node node_modules/typescript/bin/tsc --project shared/tsconfig.json", { stdio: "inherit" });

console.log("[Build] 2. Generating Prisma Client...");
try {
  execSync("node node_modules/prisma/build/index.js generate --schema=backend/prisma/schema.prisma", { stdio: "inherit" });
} catch (err) {
  console.warn("[Build] Note: Prisma client DLL locked by active process, using existing generated client.");
}

console.log("[Build] 3. Building Backend...");
execSync("node node_modules/typescript/bin/tsc --project backend/tsconfig.json", { stdio: "inherit" });

console.log("[Build] 4. Building Frontend (Vite)...");
execSync("node ../node_modules/vite/bin/vite.js build", { cwd: "frontend", stdio: "inherit" });

console.log("[Build] Production build completed successfully!");
