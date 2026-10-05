import { execSync } from "node:child_process";

const run = (cmd, options = {}) => {
  console.log(`[Build] Running: ${cmd}`);
  execSync(cmd, { shell: true, stdio: "inherit", ...options });
};

console.log("[Build] 1. Building @contract-assistant/shared...");
run("npm --workspace=shared run build");

console.log("[Build] 2. Generating Prisma Client...");
try {
  run("npx --workspace=backend prisma generate");
} catch (err) {
  console.warn("[Build] Note: Prisma generate warning:", err.message);
}

console.log("[Build] 3. Building Backend...");
run("npm --workspace=backend run build");

console.log("[Build] 4. Building Frontend (Vite)...");
run("npm --workspace=frontend run build");

console.log("[Build] Production build completed successfully!");
