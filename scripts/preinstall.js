import fs from "fs";
import path from "path";

const root = process.cwd();
for (const lock of ["package-lock.json", "yarn.lock"]) {
  const target = path.join(root, lock);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
}

const userAgent = process.env.npm_config_user_agent || "";
if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead (e.g. pnpm install)");
  process.exit(1);
}
