import { execSync } from "node:child_process";

const workspaces = ["shared", "backend", "frontend"];
for (const w of workspaces) {
  console.log(`[Typecheck] Workspace: ${w}`);
  execSync(`node node_modules/typescript/bin/tsc --project ${w}/tsconfig.json --noEmit`, {
    stdio: "inherit",
  });
}
console.log("[Typecheck] All workspaces passed cleanly with 0 errors!");
