import { execSync } from "node:child_process";

console.log("[Lint] Running ESLint across repository...");
execSync("node node_modules/eslint/bin/eslint.js .", {
  stdio: "inherit",
});
console.log("[Lint] ESLint passed cleanly with 0 errors!");
