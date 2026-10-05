import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const run = (cmd, options = {}) => {
  console.log(`[Build] Running: ${cmd}`);
  execSync(cmd, { shell: true, stdio: "inherit", ...options });
};

// Locate tsc binary
const tscCandidates = [
  path.resolve("node_modules/typescript/bin/tsc"),
  path.resolve("../node_modules/typescript/bin/tsc"),
];
const foundTsc = tscCandidates.find((p) => fs.existsSync(p));
const tscCmd = foundTsc ? `node "${foundTsc}"` : "npx tsc";

console.log("[Build] 1. Building @contract-assistant/shared...");
run(`${tscCmd} --project shared/tsconfig.json`);

console.log("[Build] 2. Generating Prisma Client...");
try {
  run("npx --workspace=backend prisma generate");
} catch (err) {
  console.warn("[Build] Note: Prisma generate warning:", err.message);
}

console.log("[Build] 3. Building Backend...");
run(`${tscCmd} --project backend/tsconfig.json`);

console.log("[Build] 4. Building Frontend (Vite)...");
run("npm --workspace=frontend run build");

console.log("[Build] Production build completed successfully!");

