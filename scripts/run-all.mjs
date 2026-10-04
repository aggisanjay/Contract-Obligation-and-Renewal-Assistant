import { spawnSync } from "node:child_process";

const commands = process.argv.slice(2);
for (const cmd of commands) {
  console.log(`> Running: ${cmd}`);
  const result = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error("Result status:", result.status, "Error:", result.error);
    process.exit(result.status ?? 1);
  }
}
